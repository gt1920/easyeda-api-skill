/**
 * EasyEDA WebSocket Bridge Server (multi-instance edition)
 *
 * 这是一个 Node.js WebSocket 服务端，用于桥接 AI 编程工具和 EasyEDA Pro 客户端。
 * 支持所有兼容 Agent Skills 标准的工具（Claude Code、OpenCode、QwenCode 等）。
 *
 * 架构：
 *   ┌──────────────┐   HTTP/WS     ┌────────────────┐   WebSocket    ┌──────────┐
 *   │   AI Agent    │ ◄───────────► │  Bridge Server  │ ◄───────────► │  EasyEDA  │
 *   │  (Skill Tool) │  Port Range   │  (This Server)  │  Port Range   │  (Client) │
 *   └──────────────┘  49620-49629   └────────────────┘  49620-49629   └──────────┘
 *
 * 端口范围 49620-49629，启动时自动检测可用端口。
 * EasyEDA 扩展通过 eda.sys_WebSocket.register() 连接到此服务。
 * AI 通过 HTTP API 或直接 WebSocket 发送代码执行请求。
 *
 * 多实例模式（本版本新增）：
 * - 允许同一台机器同时运行多个桥接实例，每个实例占一个端口。
 *   配合 run-api-gateway 扩展 >= 1.1.0："每个 EDA 窗口认领一个空闲桥接"，
 *   即可做到一台机器多个工程窗口各占一个端口、互不干扰。
 * - 环境变量：
 *     BRIDGE_HOST      监听地址（默认 127.0.0.1；M2/GT-AMD 上设 :: / 0.0.0.0 对外）
 *     BRIDGE_PORT      钉死端口（默认在 49620-49629 里自动挑第一个空闲的）
 *     BRIDGE_SINGLETON 设为 1 恢复旧行为：发现已有实例就直接退出
 * - 握手消息带 edaWindowCount，扩展据此判断该桥接是否已被别的窗口占用。
 * - EDA 扩展注册/心跳可携带 project 信息（工程名），/health 与 /eda-windows 会展示，
 *   这样 curl 一下端口就知道这个端口挂的是哪个工程。
 *
 * 握手验证协议：
 * - GET /health 返回 { service: "easyeda-bridge", ... }
 * - WebSocket 连接后服务端发送 { type: "handshake", service: "easyeda-bridge" }
 * - 客户端需验证 service 字段匹配后才确认连接有效
 *
 * 协议格式（JSON）：
 * {
 *   "type": "execute" | "result" | "error" | "ping" | "pong" | "handshake" | "register" | "registered",
 *   "id": "<request-uuid>",
 *   "code": "<js code string>",           // execute 时
 *   "result": <any>,                       // result 时
 *   "error": "<error message>",            // error 时
 *   "timestamp": <unix ms>
 * }
 */

import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';
import { createServer, get as httpGet } from 'node:http';
import { createConnection } from 'node:net';

// ─── Port Configuration ─────────────────────────────────────────────
const PORT_START = 49620;
const PORT_END = 49629;
const SERVICE_ID = 'easyeda-bridge';
const LISTEN_HOST = process.env.BRIDGE_HOST || '127.0.0.1';

function formatBannerLine(label, value) {
  return `║  ${`${label}:`.padEnd(12)} ${String(value).padEnd(44)}║`;
}

// ─── State ──────────────────────────────────────────────────────────
/** @type {Map<string, {ws: import('ws').WebSocket, project: {friendlyName?: string, uuid?: string} | null, registeredAt: number}>} */
const edaClients = new Map();

/** @type {Map<string, {resolve: Function, reject: Function, timer: NodeJS.Timeout, windowId: string}>} */
const pendingRequests = new Map();

/** @type {string | null} 当前AI端选中的EDA窗口ID */
let activeEdaWindowId = null;

/** @type {number | null} 本实例实际监听的端口 */
let listenPort = null;

const REQUEST_TIMEOUT_MS = 30_000;

// ─── Port Detection ─────────────────────────────────────────────────

/**
 * Check if a TCP port is already in use.
 * @param {number} port
 * @returns {Promise<boolean>} true if port is in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(300);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Check if a port is already running our bridge service.
 * Sends HTTP GET /health and verifies { service: "easyeda-bridge" }.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isBridgeRunning(port) {
  return new Promise((resolve) => {
    const req = httpGet(`http://127.0.0.1:${port}/health`, { timeout: 800 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.service === SERVICE_ID);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * Detect if an existing bridge instance is already running in the port range.
 * @returns {Promise<number|null>} The port of the existing instance, or null
 */
async function findExistingInstance() {
  for (let port = PORT_START; port <= PORT_END; port++) {
    if (await isBridgeRunning(port)) return port;
  }
  return null;
}

/**
 * Find the port to listen on: BRIDGE_PORT if pinned, otherwise the first free
 * port in range.
 * @returns {Promise<number>}
 */
async function findAvailablePort() {
  if (process.env.BRIDGE_PORT) {
    const pinned = Number(process.env.BRIDGE_PORT);
    if (!Number.isInteger(pinned) || pinned < 1 || pinned > 65535) {
      throw new Error(`Invalid BRIDGE_PORT: ${process.env.BRIDGE_PORT}`);
    }
    if (await isPortInUse(pinned)) {
      throw new Error(`BRIDGE_PORT ${pinned} is already in use`);
    }
    return pinned;
  }
  for (let port = PORT_START; port <= PORT_END; port++) {
    const inUse = await isPortInUse(port);
    if (!inUse) return port;
  }
  throw new Error(`All ports in range ${PORT_START}-${PORT_END} are in use`);
}

/**
 * Summarize connected EDA windows for /health and /eda-windows.
 */
function describeWindows() {
  const windows = [];
  for (const [windowId, entry] of edaClients) {
    windows.push({
      windowId,
      project: entry.project,
      connected: entry.ws.readyState === 1,
      active: windowId === activeEdaWindowId,
      registeredAt: entry.registeredAt,
    });
  }
  return windows;
}

// ─── HTTP Server (for AI to submit code via HTTP POST) ─────────────
const httpServer = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check — includes service identifier for client handshake verification
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      service: SERVICE_ID,
      status: 'ok',
      port: listenPort,
      edaConnected: edaClients.size > 0,
      edaWindowCount: edaClients.size,
      activeWindowId: activeEdaWindowId,
      windows: describeWindows(),
      pendingRequests: pendingRequests.size,
      timestamp: Date.now(),
    }));
    return;
  }

  // List all connected EDA windows
  if (req.method === 'GET' && req.url === '/eda-windows') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      windows: describeWindows(),
      activeWindowId: activeEdaWindowId,
      count: edaClients.size,
    }));
    return;
  }

  // Set active EDA window
  if (req.method === 'POST' && req.url === '/eda-windows/select') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const payload = JSON.parse(body);
      const { windowId } = payload;
      if (!edaClients.has(windowId)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `EDA window "${windowId}" not found` }));
        return;
      }
      activeEdaWindowId = windowId;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, activeWindowId: activeEdaWindowId }));
    }
    catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
    }
    return;
  }

  // Execute code on EDA
  if (req.method === 'POST' && req.url === '/execute') {
    let body = '';
    for await (const chunk of req) body += chunk;

    try {
      const payload = JSON.parse(body);
      const code = payload.code;
      const windowId = payload.windowId; // optional, uses active window if not specified
      if (!code || typeof code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing "code" field (string)' }));
        return;
      }

      const result = await executeOnEda(code, windowId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result, windowId: windowId || activeEdaWindowId }));
    } catch (err) {
      const status = err.message?.includes('not connected') ? 503 : 500;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ─── WebSocket Server ───────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const clientType = req.url === '/eda' ? 'eda' : 'agent';
  console.log(`[WS] New ${clientType} connection from ${req.socket.remoteAddress}`);

  // Send handshake message for client verification.
  // edaWindowCount lets extension >= 1.1.0 detect an already-claimed bridge
  // and move on to the next port ("one window per bridge" mode).
  ws.send(JSON.stringify({
    type: 'handshake',
    service: SERVICE_ID,
    clientType,
    port: listenPort,
    edaWindowCount: edaClients.size,
    timestamp: Date.now(),
  }));

  if (clientType === 'eda') {
    let registeredWindowId = null;

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'register' && msg.windowId) {
          // EDA client registering with window ID (may re-register to update project info)
          registeredWindowId = msg.windowId;
          const existing = edaClients.get(registeredWindowId);
          edaClients.set(registeredWindowId, {
            ws,
            project: msg.project ?? existing?.project ?? null,
            registeredAt: existing?.registeredAt ?? Date.now(),
          });
          // Auto-select if first window or if no active window
          if (edaClients.size === 1 || !activeEdaWindowId) {
            activeEdaWindowId = registeredWindowId;
          }
          const projName = msg.project?.friendlyName ? ` (project: ${msg.project.friendlyName})` : '';
          console.log(`[WS] EDA window registered: ${registeredWindowId}${projName}, total: ${edaClients.size}`);
          // Ack with current window count so the extension can detect claim races
          try {
            ws.send(JSON.stringify({
              type: 'registered',
              windowId: registeredWindowId,
              windowCount: edaClients.size,
              port: listenPort,
              timestamp: Date.now(),
            }));
          } catch { /* ignore */ }
          return;
        }
        // Always pass a valid windowId (use registeredWindowId if available, otherwise log warning)
        const effectiveWindowId = registeredWindowId || 'unregistered';
        handleEdaMessage(msg, effectiveWindowId);
      } catch (err) {
        console.error('[WS] Failed to parse EDA message:', err.message);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[WS] EDA window disconnected: ${registeredWindowId} (${code} ${reason})`);
      if (registeredWindowId) {
        // Only remove if this socket is still the registered one (a re-connected
        // window may have replaced the entry already)
        if (edaClients.get(registeredWindowId)?.ws === ws) {
          edaClients.delete(registeredWindowId);
        }
        if (activeEdaWindowId === registeredWindowId && !edaClients.has(registeredWindowId)) {
          // Select another window if available
          activeEdaWindowId = edaClients.keys().next().value || null;
        }
        // Reject pending requests for this window
        for (const [id, req] of pendingRequests) {
          if (req.windowId === registeredWindowId) {
            clearTimeout(req.timer);
            req.reject(new Error(`EDA window "${registeredWindowId}" disconnected`));
            pendingRequests.delete(id);
          }
        }
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] EDA client error:', err.message);
    });
  } else {
    // Agent / AI client connection
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'execute') {
          try {
            const result = await executeOnEda(msg.code, msg.windowId);
            ws.send(JSON.stringify({
              type: 'result',
              id: msg.id,
              result,
              timestamp: Date.now(),
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'error',
              id: msg.id,
              error: err.message,
              timestamp: Date.now(),
            }));
          }
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', id: msg.id, timestamp: Date.now() }));
        }
      } catch (err) {
        console.error('[WS] Failed to parse agent message:', err.message);
      }
    });

    ws.on('close', () => {
      console.log('[WS] Agent client disconnected');
    });
  }
});

// ─── Core logic ─────────────────────────────────────────────────────

/**
 * Send a message to the connected EDA client
 * @param {string} windowId - Target EDA window ID
 * @param {object} msg - Message to send
 */
function sendToEda(windowId, msg) {
  const edaClient = edaClients.get(windowId);
  if (!edaClient) {
    throw new Error(`EDA window "${windowId}" not found in connected clients`);
  }
  if (edaClient.ws.readyState !== 1) {
    throw new Error(`EDA window "${windowId}" is not in connected state (readyState: ${edaClient.ws.readyState})`);
  }
  try {
    edaClient.ws.send(JSON.stringify(msg));
  } catch (err) {
    throw new Error(`Failed to send to EDA window "${windowId}": ${err.message}`);
  }
}

/**
 * Execute JavaScript code on the EDA client and return the result
 * @param {string} code - JavaScript code to execute in EDA context
 * @param {string} [windowId] - Specific EDA window ID (uses active window if not specified)
 * @returns {Promise<any>}
 */
function executeOnEda(code, windowId) {
  return new Promise((resolve, reject) => {
    const targetWindowId = windowId || activeEdaWindowId;

    if (!targetWindowId) {
      reject(new Error('No EDA window connected. Please connect an EDA window first.'));
      return;
    }

    if (!edaClients.has(targetWindowId) || edaClients.get(targetWindowId).ws.readyState !== 1) {
      reject(new Error(`EDA window "${targetWindowId}" is no longer connected. Please select another window.`));
      return;
    }

    const id = randomUUID();
    const timer = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`Request ${id} timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(id, { resolve, reject, timer, windowId: targetWindowId });

    try {
      sendToEda(targetWindowId, {
        type: 'execute',
        id,
        code,
        windowId: targetWindowId,
        timestamp: Date.now(),
      });
    } catch (err) {
      clearTimeout(timer);
      pendingRequests.delete(id);
      reject(err);
    }
  });
}

/**
 * Handle messages received from EDA client
 * @param {object} msg - Message from EDA
 * @param {string} windowId - EDA window ID that sent the message
 */
function handleEdaMessage(msg, windowId) {
  if (msg.type === 'ping') {
    const edaClient = edaClients.get(windowId);
    // Heartbeat may carry refreshed project info — keep metadata current
    if (edaClient && msg.project) {
      edaClient.project = msg.project;
    }
    if (edaClient && edaClient.ws.readyState === 1) {
      try {
        edaClient.ws.send(JSON.stringify({
          type: 'pong',
          id: msg.id,
          timestamp: Date.now(),
        }));
      } catch (err) {
        console.error(`[WS] Failed to send pong to ${windowId}:`, err.message);
      }
    } else {
      console.warn(`[WS] Cannot send pong: window ${windowId} not found or disconnected`);
    }
    return;
  }

  if (msg.type === 'pong') {
    console.log('[EDA] Pong received from window', windowId, '- connection healthy');
    return;
  }

  if (msg.type === 'result' || msg.type === 'error') {
    const pending = pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(msg.id);
      if (msg.type === 'result') {
        pending.resolve(msg.result);
      } else {
        pending.reject(new Error(msg.error || 'Unknown EDA error'));
      }
    }
    return;
  }

  console.log('[EDA] Unknown message type:', msg.type, 'from window:', windowId);
}

// ─── Start ──────────────────────────────────────────────────────────
async function start() {
  try {
    // Multi-instance is the default now: each `node bridge-server.mjs` takes the
    // next free port so one machine can serve several EDA project windows.
    // Set BRIDGE_SINGLETON=1 to restore the old exit-if-already-running behavior.
    const existingPort = await findExistingInstance();
    if (existingPort !== null) {
      if (process.env.BRIDGE_SINGLETON === '1') {
        console.log(`✅ Bridge server is already running on port ${existingPort}, no need to start another instance.`);
        process.exit(0);
      }
      console.log(`ℹ️  Another bridge instance is running on port ${existingPort}; starting an additional instance (multi-project mode).`);
    }

    const port = await findAvailablePort();

    httpServer.listen(port, LISTEN_HOST, () => {
      listenPort = port;
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║         EasyEDA WebSocket Bridge Server                      ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
${formatBannerLine('Port', port)}
${formatBannerLine('Listen Host', LISTEN_HOST)}
${formatBannerLine('Port Range', `${PORT_START}-${PORT_END}`)}
${formatBannerLine('Service ID', SERVICE_ID)}
║                                                              ║
║  HTTP API:    http://localhost:${port}                         ║
║  WS (EDA):   ws://localhost:${port}/eda                       ║
║  WS (Agent): ws://localhost:${port}/agent                     ║
║                                                              ║
║  Endpoints:                                                  ║
║    GET  /health     - 健康检查 & EDA 连接状态                ║
║    POST /execute    - 执行代码 {"code": "..."}               ║
║                                                              ║
║  Handshake:                                                  ║
║    /health returns { service: "${SERVICE_ID}" }       ║
║    WS sends { type: "handshake", service: "..." }            ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });

    httpServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} became occupied. Restarting...`);
        httpServer.close();
        start(); // Retry
      } else {
        throw err;
      }
    });
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

start();
