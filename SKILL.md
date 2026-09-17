---
name: easyeda-api
description: >-
  EasyEDA Pro API skill for AI agents. Use when working with EasyEDA Pro EDA software,
  including PCB design, schematic editing, footprint/symbol management, and project operations.
  Supports live debugging in EasyEDA and EasyEDA extension development. Provides complete API
  reference (120+ classes, 62 enums, 70 interfaces), extension-development documentation, and a
  WebSocket bridge server to execute code in the running EasyEDA Pro client.
  Trigger on: "嘉立创EDA，启动！", "立创EDA，启动！", "EDA，启动！",
  "EasyEDA", "PCB", "schematic", "footprint", "EDA", "circuit board",
  "嘉立创EDA", "原理图", "PCB设计".
  **IMPORTANT**: 嘉立创EDA's English name is **EasyEDA**. They are the SAME product.
  Never use other transliterations like "EasyEDA Pro" (unless specifically versioned), "EASYEDA", "easyeda", etc. Always use "EasyEDA" for English references and "嘉立创EDA" for Chinese references.
license: MIT
compatibility: Requires Node.js 18+, EasyEDA Pro desktop client with extension support
metadata:
  author: JLCEDA
  version: "1.1.36"
  openclaw:
    requires:
      bins:
        - node
      env:
        - CLAUDE_SKILL_DIR
---

# EasyEDA Pro API Skill

Control EasyEDA Pro (嘉立创EDA专业版) programmatically through AI. This skill provides:

1. **Complete API reference** — 120 classes, 62 enums, 70 interfaces, 19 type aliases
2. **WebSocket bridge** — Execute code in the running EasyEDA Pro client
3. **Code patterns** — Common operations for PCB, schematic, library, and project management
4. **Document source format reference** — File format specifications for project, schematic, and PCB sources when users need to analyze or modify EasyEDA document source directly instead of using the API

This skill supports not only live debugging in EasyEDA, but also EasyEDA extension development.
During EasyEDA extension development, AI agents can use the extension-related documentation, API references, type information, usage examples, and bridge-based debugging capabilities provided by this skill to look up APIs, write code, and validate behavior during integration and debugging.

## Architecture

```
┌───────────┐   HTTP/WS     ┌─────────────────┐   WebSocket   ┌───────────┐
│ AI Agent  │ ◄───────────► │  Bridge Server  │ ◄───────────► │  EasyEDA  │
│           │  Port Range   │  (Node.js)      │  Port Range   │  (Client) │
└───────────┘  49620-49629  └─────────────────┘  49620-49629  └───────────┘
```

The server auto-selects an available port from 49620-49629 on startup.
Both AI and EDA clients auto-discover the server by scanning the port range
and verifying a handshake (`service: "easyeda-bridge"`).

## Quick Start

### 1. Command Triggers

When user says **"嘉立创EDA，启动！"**, **"立创EDA，启动！"**, or **"EDA，启动！"**:

**IMPORTANT: Session initialization** — Reply immediately with this exact text to set the correct session title:

```
📋 EasyEDA Session
```

Then proceed with the setup steps below.

### 2. Install dependencies (if needed)

```bash
cd ${CLAUDE_SKILL_DIR} && npm install
```

### 3. Start bridge server

> **⚠️ IMPORTANT**: The bridge server must run in the background. Do NOT run it in the foreground, or the AI will block waiting for the server to exit.

```bash
# Check if bridge is already running
for port in $(seq 49620 49629); do
  resp=$(curl -s http://localhost:$port/health 2>/dev/null)
  if echo "$resp" | grep -q '"easyeda-bridge"'; then
    echo "Bridge already running on port $port"
    BRIDGE_PORT=$port
    break
  fi
done

# Start bridge if not running
if [ -z "$BRIDGE_PORT" ]; then
  node ${CLAUDE_SKILL_DIR}/scripts/bridge-server.mjs &
  sleep 2
  # Find the port bridge is running on
  for port in $(seq 49620 49629); do
    resp=$(curl -s http://localhost:$port/health 2>/dev/null)
    if echo "$resp" | grep -q '"easyeda-bridge"'; then
      BRIDGE_PORT=$port
      break
    fi
  done
fi

echo "Bridge running on port: ${BRIDGE_PORT:-unknown}"
```

### 4. Connect EasyEDA

Install the `run-api-gateway.eext` extension in EasyEDA Pro. Download link:

- https://jlc-ext.com/item/oshwhub/run-api-gateway

After the extension is loaded, it will automatically establish the WebSocket connection.

### 5. Verify connection and select EDA window

```bash
# Check bridge and EDA connection status
curl http://localhost:${BRIDGE_PORT:-49620}/health

# List all connected EDA windows
curl http://localhost:${BRIDGE_PORT:-49620}/eda-windows
```

The `/eda-windows` response looks like:
```json
{
  "windows": [
    { "windowId": "abc-123", "connected": true, "active": true },
    { "windowId": "def-456", "connected": true, "active": false }
  ],
  "activeWindowId": "abc-123",
  "count": 2
}
```

**Handle based on window count**:
- **0 windows**: Tell user "No EasyEDA window is connected. Please ensure the EasyEDA extension (run-api-gateway.eext) is installed and loaded in EasyEDA. Download: https://jlc-ext.com/item/oshwhub/run-api-gateway"
- **1 window**: Auto-selected as active. Tell user: "✅ Connected! Active EDA window: abc-123. Ready to work."
- **2+ windows**: Show the available windows and ask user to select:
  ```
  Multiple EDA windows detected:
  - abc-123 (active)
  - def-456
  
  Which EDA window should I use?
  ```

**Select a window**:
```bash
curl -X POST http://localhost:${BRIDGE_PORT}/eda-windows/select \
  -H "Content-Type: application/json" \
  -d '{"windowId": "abc-123"}'
```

After selection, confirm: "✅ Active EDA window: abc-123. Ready to work."

### 6. Execute code on EDA

```bash
curl -X POST http://localhost:${BRIDGE_PORT:-49620}/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "return await eda.dmt_Project.getCurrentProjectInfo();"}'
```

## API Documentation

The full API reference is in the [references/](references/) directory:

- [references/_index.md](references/_index.md) — Master index of all classes, enums, interfaces, and types
- [references/_quick-reference.md](references/_quick-reference.md) — All method signatures for rapid lookup
- `references/classes/` — 120 class docs (DMT_*, PCB_*, SCH_*, LIB_*, SYS_*, IPCB_*, ISCH_*)
- `references/enums/` — 62 enum docs
- `references/interfaces/` — 70 interface docs
- `references/types/` — 19 type alias docs

### How to look up API

1. **Start with `_index.md`** to find the right class/module for the task
2. **Read the class doc** (e.g., `references/classes/DMT_Board.md`) for all methods and signatures
3. **Use `_quick-reference.md`** for fast method signature lookup across all classes
4. **Check enums/interfaces** for parameter types and return types

### Document Source Format Documentation

If the user needs to analyze or modify EasyEDA document source directly instead of using the API, use the documents in the [format/](format/) directory.

- [format/index.md](format/index.md) — Overview of the EasyEDA document source format references and version notes
- `format/project/` — Project source structure, metadata, blobs, variants, and grouping data
- `format/schematic/` — Schematic source format, including structure, wires, shapes, pins, components, and tables
- `format/pcb/` — PCB source format, including primitives, pads and vias, shapes, text, attributes, rules, and panel data

Use these files when the task is about understanding source layout, generating compatible document source, or editing source data that will later be imported back into EasyEDA.

### API Module Overview

| Prefix | Domain | Key Classes |
|--------|--------|-------------|
| `DMT_` | Document management | Board, EditorControl, Folder, Panel, Pcb, Project, Schematic, SelectControl, Team, Workspace |
| `PCB_` | PCB & Footprint | Document, Drc, Event, Layer, Net, Primitive, PrimitiveComponent, PrimitiveLine, PrimitivePad, PrimitivePour, PrimitiveVia, SelectControl |
| `SCH_` | Schematic | Document, Event, Primitive, PrimitiveComponent, PrimitiveWire, SelectControl |
| `LIB_` | Library | 3DModel, Cbb, Classification, Device, Footprint, LibrariesList, PanelLibrary, SelectControl, Symbol |
| `SYS_` | System | Dialog, Environment, FileManager, FileSystem, FontManager, HeaderMenu, I18n, IFrame, LoadingAndProgressBar, Log, Message, MessageBox, MessageBus, PanelControl, Setting, ShortcutKey, Storage, Timer, ToastMessage, WebSocket, Window |
| `IPCB_` | PCB interfaces (图元) | PrimitiveArc, PrimitiveComponent, PrimitivePad, PrimitiveFill, PrimitivePour, PrimitiveRegion, PrimitiveVia, ... |
| `ISCH_` | Schematic interfaces (图元) | PrimitiveArc, PrimitiveComponent, PrimitiveWire, PrimitiveText, PrimitiveRectangle, ... |
| `EPCB_` / `ESCH_` | Enums | PrimitiveType, Layer, PadType, ... |

## Code Execution Context

All code runs inside EasyEDA Pro's browser runtime as:

```javascript
async function(eda) {
  // Your code here — `eda` is the global EDA API object
  // You MUST use `return` to send results back
  // Do not add comments to the generated code, as the code is typically executed as a single line
}
```

**Critical rules:**
- The `eda` object provides access to all API modules (e.g., `eda.dmt_Board`, `eda.pcb_Primitive`).
- Always refer to the API documentation for correct usage.
- Do not add comments to the generated code, as the code is typically executed as a single line.
- Always use `return` to get results — `console.log` output is NOT captured.
- All API methods returning promises must be `await`ed.
- Code runs in browser context — no Node.js APIs (fs, path, etc.) available.
- Use `eda.sys_Message.showToastMessage(msg)` for user-visible notifications.
- When reviewing API documentation and encountering enumerations, do not guess the enumeration values. You must use the enumeration members, for example: `EPCB_LayerId.TOP` instead of `1` for the layer parameter in PCB primitive creation.

### Extension Runtime Constraints

When writing EasyEDA extensions, standard browser APIs are **forbidden** in the main process. Use EDA-provided alternatives:

| Purpose | ❌ Forbidden | ✅ Use Instead |
|---------|-------------|----------------|
| Get user input | — | `eda.sys_Dialog.showInputDialog()` |
| User selection | — | `eda.sys_Dialog.showSelectDialog()` |
| Show message | `alert()` | `eda.sys_Dialog.showInformationMessage()` |
| Confirm action | `confirm()` | `eda.sys_Dialog.showConfirmationMessage()` |
| Toast notification | DOM manipulation | `eda.sys_Message.showToastMessage()` |
| Store data | `localStorage` (main process) | `eda.sys_Storage.setExtensionUserConfig(key, value)` |
| Custom UI | Manipulate host DOM | `eda.sys_IFrame.openIFrame()` |
| Show HTML | `showInformationMessage(html)` | Must use iframe |
| Open link | `window.open()` | `eda.sys_Window.open()` |
| Browser hardware API | Use in main process | Available in iframe (`navigator.serial`, etc.) |

**Note:** `localStorage`, `window`, `document` etc. are available **inside `sys_IFrame`** but NOT in the main extension process.

### Extension ↔ IFrame Data Passing

The main extension process and `sys_IFrame` iframe are **isolated contexts**. To pass data between them:

**Option A (Recommended):** Use `eda.sys_Storage` as a bridge
```javascript
// In main extension process:
await eda.sys_Storage.setExtensionUserConfig('myKey', JSON.stringify(data));

// In iframe:
const data = JSON.parse(await eda.sys_Storage.getExtensionUserConfig('myKey'));
```

**Option B:** Both contexts can access `eda` directly — call the same API from either side
```javascript
// In iframe HTML (NOT window.parent.eda):
const info = await eda.dmt_Project.getCurrentProjectInfo();
```

## Communication Protocol

### Port Discovery

The bridge server listens on the first available port in **49620-49629**.
To find the server, scan the range and verify the service identity:

```bash
for port in $(seq 49620 49629); do
  resp=$(curl -s http://127.0.0.1:$port/health 2>/dev/null)
  if echo "$resp" | grep -q '"easyeda-bridge"'; then
    BRIDGE_PORT=$port; break
  fi
done
```

### Handshake

- **HTTP**: `GET /health` returns `{ "service": "easyeda-bridge", "edaConnected": bool, ... }`
- **WebSocket**: On connect, server sends `{ "type": "handshake", "service": "easyeda-bridge" }`
- Clients MUST verify `service === "easyeda-bridge"` before using the connection

### Message Format

JSON messages over WebSocket / HTTP:

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"execute"` \| `"result"` \| `"error"` \| `"ping"` \| `"pong"` \| `"handshake"` | Message type |
| `id` | `string` | Request UUID for matching request/response |
| `code` | `string` | JavaScript code to execute (for `execute` type) |
| `result` | `any` | Execution result (for `result` type) |
| `error` | `string` | Error message (for `error` type) |
| `service` | `string` | Service identifier (for `handshake` type) |
| `timestamp` | `number` | Unix milliseconds |

## Common Patterns

### Project & Board Operations

```javascript
// Get current project info
return await eda.dmt_Project.getCurrentProjectInfo();

// List all boards in project
return await eda.dmt_Board.getAllBoardsInfo();

// Create a new board (optionally link to schematic/PCB)
return await eda.dmt_Board.createBoard();

// Switch to a document tab
await eda.dmt_EditorControl.activateDocument(tabId);
```

### Example: Open a project by name and open its first schematic page

```javascript
const targetProjectName = 'NE555 Circuit';

// 1. Enumerate projects by team/folder and find the target by name
const teams = await eda.dmt_Team.getAllTeamsInfo();
const seenProjectUuid = new Set();
let targetProjectUuid = null;

for (const team of teams || []) {
  const teamProjects = await eda.dmt_Project.getAllProjectsUuid(team.uuid);
  for (const projectUuid of teamProjects || []) {
    if (seenProjectUuid.has(projectUuid)) continue;
    seenProjectUuid.add(projectUuid);

    const info = await eda.dmt_Project.getProjectInfo(projectUuid);
    const name = info?.friendlyName || info?.name || '';
    if (name === targetProjectName) {
      targetProjectUuid = projectUuid;
      break;
    }
  }
  if (targetProjectUuid) break;

  const folderUuids = await eda.dmt_Folder.getAllFoldersUuid(team.uuid);
  for (const folderUuid of folderUuids || []) {
    const folderProjects = await eda.dmt_Project.getAllProjectsUuid(team.uuid, folderUuid);
    for (const projectUuid of folderProjects || []) {
      if (seenProjectUuid.has(projectUuid)) continue;
      seenProjectUuid.add(projectUuid);

      const info = await eda.dmt_Project.getProjectInfo(projectUuid);
      const name = info?.friendlyName || info?.name || '';
      if (name === targetProjectName) {
        targetProjectUuid = projectUuid;
        break;
      }
    }
    if (targetProjectUuid) break;
  }
  if (targetProjectUuid) break;
}

if (!targetProjectUuid) {
  throw new Error(`Project not found: ${targetProjectName}`);
}

// 2. Open the project
const opened = await eda.dmt_Project.openProject(targetProjectUuid);
if (!opened) {
  throw new Error(`Failed to open project: ${targetProjectName}`);
}

// 3. Get the first schematic page and open it
const schematics = await eda.dmt_Schematic.getAllSchematicsInfo();
if (!Array.isArray(schematics) || schematics.length === 0) {
  throw new Error(`No schematics found in project: ${targetProjectName}`);
}

const firstSchematic = schematics[0];
const pages = await eda.dmt_Schematic.getAllSchematicPagesInfo();
const firstPage = (pages || []).find((page) => page.parentSchematicUuid === firstSchematic.uuid)
  || firstSchematic.page?.[0];

if (!firstPage) {
  throw new Error(`No schematic page found in: ${firstSchematic.name}`);
}

const tabId = await eda.dmt_EditorControl.openDocument(firstPage.uuid);

return {
  projectUuid: targetProjectUuid,
  schematicUuid: firstSchematic.uuid,
  pageUuid: firstPage.uuid,
  tabId,
};
```

**Notes:**
- `dmt_Project.getAllProjectsUuid()` is **not** a global no-arg enumerator in practice. To reliably find a project by name, iterate teams first, then folders.
- `openProject(projectUuid)` may discard unsaved changes in the currently opened project. Be careful before calling it.

### PCB Primitive Operations

```javascript
// Get selected primitives
const selected = eda.pcb_SelectControl.getAllSelectedPrimitives_PrimitiveId();

// Create a line on copper layer
// Layer parameter uses EPCB_LayerId enum — see references/enums/EPCB_LayerId.md
await eda.pcb_PrimitiveLine.create(
  "GND",                       // net (string)
  EPCB_LayerId.TOP,            // layer — use enum, NOT raw number
  0,                           // startX (unit: 1mil)
  0,                           // startY (unit: 1mil)
  1000,                        // endX (unit: 1mil)
  0,                           // endY (unit: 1mil)
  10,                          // lineWidth
  false                        // primitiveLock
);

// Modify an existing primitive (async pattern)
const prim = await eda.pcb_PrimitiveComponent.get([id]);
const asyncPrim = prim.toAsync();
asyncPrim.setState_X(newX);
asyncPrim.setState_Y(newY);
asyncPrim.done();
```

### PCB Async Primitive Pattern (IMPORTANT)

For **modifying** PCB/SCH primitives, you must use the async pattern:

```javascript
// 1. Get the primitive
const prim = await eda.pcb_PrimitiveVia.get([viaId]);
// 2. Convert to async mode
const asyncPrim = prim.toAsync();
// 3. Set new values
asyncPrim.setState_X(newX);
asyncPrim.setState_Y(newY);
asyncPrim.setState_Diameter(diameter);
// 4. Apply changes
asyncPrim.done();
```

### Schematic Operations

```javascript
// Get all pages
return await eda.dmt_Schematic.getAllSchematicDocumentsInfo();

// Create a schematic component
// component parameter requires {libraryUuid, uuid} object — NOT a plain string
await eda.sch_PrimitiveComponent.create(
  { libraryUuid: "...", uuid: "device-uuid-from-library" },  // component object
  5000,                        // x (unit: 0.01inch = 10mil)
  5000,                        // y (unit: 0.01inch = 10mil)
  "",                          // subPartName
  0,                           // rotation (degrees, plain number)
  false,                       // mirror
  true,                        // addIntoBom
  true                         // addIntoPcb
);

// Get selected schematic primitives
const ids = eda.sch_SelectControl.getAllSelectedPrimitives_PrimitiveId();
```

### Library Operations

```javascript
// List all libraries in workspace
return await eda.lib_LibrariesList.getAllLibrariesList();

// Search devices
return await eda.lib_Device.search("STM32");

// Get symbol info
return await eda.lib_Symbol.get(symbolUuid);
```

### System Functions

```javascript
// Show toast message
eda.sys_Message.showToastMessage("Operation complete!");

// Show confirm dialog
const confirmed = await eda.sys_Dialog.showConfirmationMessage("Proceed?");

// File system (limited to extension sandbox)
const content = await eda.sys_FileSystem.readFileFromFileSystem(path);
await eda.sys_FileSystem.saveFileToFileSystem(path, content);
```

### DRC (Design Rule Check)

```javascript
// Run DRC check
const passed = await eda.pcb_Drc.check(true, true, false);
// passed is boolean: true if DRC passed, false if errors found
```

## Common Mistakes

### Read API Signatures Carefully (CRITICAL)

**Before calling ANY API method, you MUST read the full signature from `references/` — including parameter types, return type, and remarks.**

AI agents frequently make these errors due to skimming documentation:

**Error 1: Not `await`ing Promise-returning methods**

Almost all EDA API methods return `Promise<T>`. If you forget `await`, you get a Promise object instead of the actual result.

```javascript
// WRONG: Missing await — result is a Promise, not the project info
const project = eda.dmt_Project.getCurrentProjectInfo();
console.log(project); // Promise { <pending> }

// CORRECT: Always await async methods
const project = await eda.dmt_Project.getCurrentProjectInfo();
console.log(project); // { uuid: "...", name: "...", ... }
```

**How to know if a method needs `await`:** Check the return type in the signature. If it says `Promise<...>`, you MUST `await` it.

```typescript
// From references/classes/DMT_Project.md:
getCurrentProjectInfo(): Promise<IDMT_ProjectItem | null>
//                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                       This is a Promise — you MUST await it
```

**Error 2: Using raw numbers instead of enum values**

Many parameters expect specific enum values. Using wrong numbers silently produces incorrect behavior.

```javascript
// WRONG: What does layer "1" mean? Which copper layer? Signal? Mask?
await eda.pcb_PrimitiveLine.create("GND", 1, 0, 0, 1000, 0, 10, false);

// CORRECT: Use the enum — EPCB_LayerId.TOP is clear and type-safe
// Check references/enums/EPCB_LayerId.md for the correct value
await eda.pcb_PrimitiveLine.create("GND", EPCB_LayerId.TOP, 0, 0, 1000, 0, 10, false);
```

**Always look up enums in `references/enums/` before using numeric constants.**

**Error 3: Assuming parameter types without checking**

Different APIs use different units, different ID formats, and different optional parameter conventions. Never assume.

```javascript
// WRONG: Assuming create() parameters match modify() parameters
// create() and modify() often have DIFFERENT parameter orders/types

// CORRECT: Always read the exact signature for the method you're calling
// Check references/classes/<ClassName>.md for each method's specific signature
```

**Summary — Before every API call:**
1. **Read the signature** — parameter types, return type, all in `references/classes/`
2. **`await` if `Promise`** — check return type for `Promise<...>`
3. **Use enums** — look up in `references/enums/` instead of guessing numbers/strings
4. **Check remarks** — the "备注" section often has critical usage notes

### Coordinate Unit (CRITICAL)

**Different domains use different coordinate units:**

| Domain | Unit | Conversion |
|--------|------|------------|
| **PCB** | 1mil | 1mm ≈ 39.37 units |
| **Schematic** | 0.01inch (10mil) | 1mm ≈ 3.937 units |

**This is the #1 mistake AI agents make.** Mixing up the units will place components incorrectly.

- PCB: 1 unit = 1mil = 0.001 inch = 0.0254 mm
- Schematic: 1 unit = 0.01inch = 10mil = 0.254 mm

If you use the wrong unit, components will be placed **10x too far** from their intended position.

```javascript
// WRONG: thinking unit is 1mil (it's actually 0.01inch = 10mil)
// Placing at x=500 thinking it's 500mil = 0.5inch — but 500 units = 5000mil = 5inch!
await eda.sch_PrimitiveComponent.create({libraryUuid: "...", uuid: "dev-uuid"}, 500, 0, "", 0, false, true, true);

// CORRECT: 50 units = 500mil = 0.5inch (in 0.01inch units)
await eda.sch_PrimitiveComponent.create({libraryUuid: "...", uuid: "dev-uuid"}, 50, 0, "", 0, false, true, true);
```

### Document State (CRITICAL)

**After creating a project, you MUST open it before operating on documents within it.**

When operating on documents, always verify:
1. **Project is opened** — Use `eda.dmt_Project.getCurrentProjectInfo()` to verify
2. **Correct document is active** — Use `eda.dmt_SelectControl.getCurrentDocumentInfo()` to check document type
3. **Document type matches API domain** — PCB APIs require active PCB document, SCH APIs require active Schematic document

```javascript
// WRONG: Assuming operation will work without checking document state
await eda.pcb_PrimitiveLine.create(...); // May fail if no PCB document is open

// CORRECT: Always verify document state first
const project = await eda.dmt_Project.getCurrentProjectInfo();
if (!project) {
  // If you just created a project, you MUST open it before any operations!
  return "Error: No project is currently opened. If you just created a project using dmt_Project.createProject(), you MUST call dmt_Project.openProject(projectPath) to open it first. You cannot operate on documents until a project is opened.";
}

const doc = await eda.dmt_SelectControl.getCurrentDocumentInfo();
if (doc?.documentType !== EDMT_EditorDocumentType.PCB) {
  return "Error: No PCB document is currently active. Please open a PCB document first.";
}

// Now safe to perform PCB operations
await eda.pcb_PrimitiveLine.create(...);
```

**Operating on the wrong document type will return errors or null results.** For example:
- Executing `PCB_*` APIs without an active PCB document (`documentType !== EDMT_EditorDocumentType.PCB`) → error/null
- Executing `SCH_*` APIs without an active Schematic document (`documentType !== EDMT_EditorDocumentType.SCHEMATIC_PAGE`) → error/null

### IFrame Context — Always Use `eda` Directly (CRITICAL)

When writing extension code that creates an iframe via `sys_IFrame.openIFrame()`, the JavaScript code inside the iframe's HTML can access the `eda` global **directly**. Do NOT use `window.parent.eda`.

**Why this matters:**
EasyEDA injects the `eda` object into the iframe's execution context automatically. Standard browser cross-frame patterns (`window.parent`, `parentWindow`, etc.) do NOT apply here and will fail.

```javascript
// WRONG: Using window.parent to reach parent frame's eda object
// This is a common mistake made by AI agents familiar with web iframe patterns
const project = await window.parent.eda.dmt_Project.getCurrentProjectInfo();

// CORRECT: eda is available directly in the iframe context
const project = await eda.dmt_Project.getCurrentProjectInfo();
```

**This applies to ALL code inside `sys_IFrame` iframes:**
- Extension UI panels loaded via `openIFrame()`
- Any HTML file inside the extension package displayed in an iframe

**Rule:** In EasyEDA extensions, whether code runs in the main context or inside an iframe created by `sys_IFrame`, always access the API through `eda.xxx` — never through `window.parent.eda` or any other parent frame accessor.

### Multi-Window Support

When multiple EasyEDA windows are connected to the bridge, you do NOT need to check window selection on every EDA operation. Only check when:
1. **First EDA operation** — Verify which window is active and tell the user
2. **EDA disconnected error** — If bridge returns an error about EDA being disconnected, ask user to select a new window

**Multi-window operations:**
```bash
# List all connected EDA windows
curl http://localhost:49620/eda-windows

# Select a specific window
curl -X POST http://localhost:49620/eda-windows/select \
  -H "Content-Type: application/json" \
  -d '{"windowId": "abc-123-def"}'

# Execute on specific window
curl -X POST http://localhost:49620/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "return await eda.dmt_Project.getCurrentProjectInfo();", "windowId": "abc-123-def"}'
```

If only one EDA window is connected, it's automatically selected as active.

## Verified Pitfalls (LOCAL FORK — not upstream)

> 以下全部为实测结论，非推测。本节及 `scripts/bridge-server.mjs` 的修复是**本地分叉**，
> 上游没有。`git pull` 前先 `git stash`，合并后确认这些改动还在。

### ★★★ API 的所有改动只在编辑器缓冲里，**必须显式 `save()`**

`create` / `modify` / `delete` 改的是**打开着的文档缓冲**，不会自动落盘。
整场施工（本次 175 器件 / 234 导线）跑完之后，若不调用保存就关窗口或 EDA 崩溃，**全部丢失**。

```javascript
await eda.dmt_EditorControl.openDocument(pageUuid);
// ... 一堆 create / modify / delete ...
const ok = await eda.sch_Document.save();     // ★ 收工必调，返回 true 才算存住
```

对应 PCB 是 `eda.pcb_Document.save()`，拼板是 `eda.pnl_Document.save()`。

⇒ **纪律：每一段批量修改结束就 `save()` 一次**，别攒到最后。
中途 EDA 窗口重连过（`activeWindowId` 会变）——那种时候没保存的东西最危险。

### `sch_PrimitiveComponent.create()` 返回**完整器件对象**，不是 primitiveId

文档只写 `Promise`，没说返回什么。实测返回的是整个组件对象：

```javascript
const r = await eda.sch_PrimitiveComponent.create(dev, x, y, "", 0, false, true, true);
// r = {async, primitiveType:"Component", primitiveId:"e18298802916aec0", componentType, x, y, ...}
const id = r.primitiveId;      // ★ 要的是这个
```

把 `r` 当 id 直接拼进后续代码的字符串里 ⇒ 生成坏 JS ⇒ **HTTP 500**，
而且报错信息完全指不到真因（看着像桥接故障）。

### `modify()` 回填 `otherProperty` 时**一批最多 1～2 个**

按前面那条纪律，`modify` 必须把 `otherProperty` 整个读出来原样传回。
但这让单次 `/execute` 的载荷变得很大：**一批 6 个必定 HTTP 500**，逐个调用则 42 个全过。
⇒ **批量改属性时按元件逐个发**，别攒批。

### ★ 报错后的通用纪律：先查状态，再决定重不重试

同样是 HTTP 500，两种结果都出现过：

| 场景 | 实际结果 | 正确应对 |
|---|---|---|
| 一批 `create` 4 个器件 | **4 个全建成了** | 重试会重复建 ⇒ **不能重试** |
| 一批 `modify` 6 个 | **0 个生效** | 重试安全 |

⇒ **任何报错/超时之后，先跑一次只读的状态查询**，看清楚做成了什么再决定。

### `createProject()` 个人工程**不能**显式传 `teamUuid`

实测（2026-08-15）：

```javascript
createProject("A")                                   // ✓ 成功
createProject("A","A")                               // ✓ 成功
createProject("A","A", <Personal团队uuid>)            // ✗ 静默返回 undefined
createProject("A","A", undefined, <folderUuid>)      // ✓ 成功
```

`dmt_Team.getAllTeamsInfo()` 会返回一个 name 为 `Personal` 的条目，**那是伪团队**，
把它的 uuid 传进 `createProject` 会让接口**静默失败**（返回 `undefined`，没有任何报错）。
文档只说「不指定则默认为个人」，没说**指定了反而不行**。

⇒ **要指定文件夹就用 `undefined` 占位跳过 teamUuid**：
`createProject(friendlyName, projectName, undefined, folderUuid, description)`

★ 另一个容易误判的方向：`projectName` 文档写「仅支持 `a-zA-Z0-9-`」，
看到失败很容易归咎于友好名里的下划线 —— **实测不是**，`ZZTest1` 不传 projectName
（由含下划线的友好名自动生成）照样成功。别在这上面浪费时间。

### `DMT_Project` 没有改名和删除接口

全部方法只有：`createProject / getAllProjectsUuid / getCurrentProjectInfo /
getProjectInfo / moveProjectToFolder / openProject`。
⇒ **试错建出来的工程只能在界面里手动删**，所以调 `createProject` 前先把参数确认好，
别用「建一个试试」的方式调试。

### `getAllProjectsUuid(team)` 不传文件夹时返回**全部**工程

不是「根目录下的工程」。所以同一个工程会同时出现在「不传 folder」和「传它所在 folder」
两次查询里，**别据此以为工程在根目录**。要判断归属，只看传了 folderUuid 的那次。

### `sch_PrimitiveComponent.modify()` 会清空所有未传字段

不只是 `otherProperty`。只改个坐标，元件的**值 / 立创编号 / 规格**就全空了，
`addIntoPcb` 还会被重置成 `false` —— **表现是器件在图上变成灰色网格填充**
（EDA 用这个标记"不加入PCB"），极易误判成符号损坏。

每次 modify **必须一次传全**（先 `get()` 出来原样回填）：

```javascript
const c = await eda.sch_PrimitiveComponent.get(id);
const props = c.otherProperty ? JSON.parse(JSON.stringify(c.otherProperty)) : undefined;
await eda.sch_PrimitiveComponent.modify(id, {
  x: newX, y: newY,                                  // 你真正要改的
  addIntoBom: true, addIntoPcb: true,                // 不传就被清成 false
  supplier: c.supplier, supplierId: c.supplierId,
  manufacturer: c.manufacturer, manufacturerId: c.manufacturerId,
  otherProperty: props,
});
```

**实测可用的字段组合**（位号和 uniqueId 都能保住）：
`designator` + `addIntoBom` + `addIntoPcb` + `supplier` + `supplierId` +
`manufacturer` + `manufacturerId` + `otherProperty`。
★ 但**别把 `name` 和 `uniqueId` 也塞进去**——一起传时属性反而会被清空。
`uniqueId` 不传就会自动保留，不用管它。

### 属性被清空后：按立创编号从库里补回来

这是上面那个坑的**唯一补救办法**（PCB 侧只存得下立创编号，规格串补不回来）：

```javascript
let dev = await eda.lib_Device.getByLcscIds('C14663');   // 按立创编号直查
if (Array.isArray(dev)) dev = dev[0];
const spec = dev.otherProperty;        // 精度/功率/额定电压/Datasheet/温度系数… 全在这
// ★ 描述要另外取：search/getByLcscIds 返回的 description 是空的
const full = await eda.lib_Device.get(dev.uuid, dev.libraryUuid);
const desc = full.description;         // "容值:100nF;精度:±10%;额定电压:50V;温度系数:X7R;"
```

★ **写回时必须剔除器件定义级的键**，否则会污染元件实例：

```javascript
const DROP = new Set(['Symbol','Footprint','3D Model','3D Model Title','3D Model Transform',
  'Designator','Add into BOM','Convert to PCB','Supplier Part','Manufacturer',
  'Manufacturer Part','Supplier','Name']);
```

（`Designator` 在器件里是 `"C?"`，`Name` 是 `"={Value}"`，直接写进去会毁掉位号显示。）

### ★ 属性覆盖换料：新编号必须在器件库有正本，否则 DRC 报「属性与供应商编号不匹配」（2026-08-19 实测）

DRC 这条检查 = **拿实例的 supplierId 去器件库查正本并比对**：编号查无正本
（`getByLcscIds` 返回 null）或正本的符号/封装与实例现挂的不兼容 → 报警告建议器件标准化；
正本存在且兼容（如同为 R0402 的 Yageo RT 系互换）→ 不报。
⇒ **属性覆盖选料时先 `getByLcscIds` 验一下有没有正本**，同规格优先挑能命中的编号；
已中招的修法 = 换到有正本的等值料号，或用户在界面做器件标准化（勾保留位号和唯一ID）。
手工界面替换走整器件重挂通道，天然无此问题。

★★ **反向的坑（2026-08-19 实战，DuN_V4 RS1 事故）：界面「器件标准化」会把属性覆盖
整个冲回所选正本的值** ——若用户为消警告对着**旧库定义**做标准化（比如实例符号/封装
还挂着旧料的库定义，标准化默认候选就是旧料正本），supplier/manufacturer/otherProperty
全部回退成旧料，**属性覆盖白做且无提示**。⇒ 属性覆盖过的器件要标准化时，必须核对选中的
正本是**新料的** C 编号；接手场次先抽查关键换料件的 supplierId 是否还是台账上的值。
另：正本存在但实例封装 uuid 仍挂旧库定义时，DRC 照样报不匹配（比对的是 uuid 不是封装名）。

### 没有「替换器件」接口

`sch_PrimitiveComponent.modify()` **改不了 `component` / `symbol` / `footprint`**，
整套 API 里也没有 replace/substitute。要把器件换成立创库正本，只能在界面的
**器件管理器**里做（支持多选批量，务必勾上「保留位号和唯一ID」，
否则 uniqueId 一变，原理图和 PCB 的对应关系就断了）。

### `sch_PrimitiveWire.create(segs, net)` 会把网络名强制转大写

`Dout` → `DOUT`、`GND-iso` → `GND-ISO`。`createNetFlag` **不会**。
要保留大小写：create 时不传 net，之后 `modify(id, {net})` 改回（modify 保留大小写）。
从 PCB 反推的原理图整页网络名全大写，就是这个原因。

★ **`createNetPort` 对混合大小写网名会触发 DRC 警告（2026-08-17 实测更正）**：
端口的 `net`/`name` 字段读回是保留大小写的（`Motor+`），但 DRC 内部把端口名转大写后
与导线净名比对，报「网络端口 MOTOR+ 的名称与所连导线名称 Motor+ 不一致」，
且 modify 端口 net 字段清不掉。⇒ **混合大小写的网络（Motor+/Motor-）别用 netport**，
让导线自己带净名（modify 设置）即可跨页连通；全大写网络用 netport 无此问题。

★ 补充(同日第二轮实测):**modify 挪件时 rotation 传 get() 读回的原值即可保持朝向**
——modify 与 get 是同一约定,只有 create 与 get 之间差 90/270 互换。跨页重建才需要
+180 修正,同页 modify 搬移不需要。另:**支线端点必须取自该器件实测引脚坐标**,
同族器件引脚间距不同(0603 100n=±20、10µF C15525=±15),按"同类都是±20"推会画短 5 单位
悬空,且器件搬移后 DRC 悬空清单是唯一可靠交叉验证。

### ★★ rotation 存读约定不一致：create 90 ≠ 读回 90（2026-08-19 实测,DuN_V4 MCU 搬页）

`create(…, rotation=90)` 的器件,`get()` 读回 `rotation=270`(反之亦然;0/180 自洽)。
后果:**按读回的 rotation 重建器件会多转 180°**——两脚件位置不变但引脚号对调,
无极性 R/C 只是网表位号换脚,**LED/二极管直接反接**。跨页搬移/复制器件的纪律:
重建后必须`getAllPinsByPrimitiveId` 读实测坐标与原件逐脚比对,对调了就按(读回值+180)%360 重建。
另两条同场实测:①大符号(STM32 等)create 500 **两种结果都出现过**(一次 500 但建成、
一次真失败)——每次 500 后都要查现场,别按上次的经验赌;②分块 create 传 net,块间合并会
在同一根线上攒出重复网名(DRC 报"有多个网络名: GND、GND、GND"),分块时不传 net、
合并完 modify 设一次。

### ★ 部分库符号的引脚偏移不在 5 栅格上（2026-08-19 实测）

TI SN74LVC1G74RSER(C717743) 符号引脚相对锚点偏移 −38/+24/±4/+36——锚点在栅格上
引脚也不在。后果：**网络标志（吸附 5 栅格）永远挂不到这种脚上**，必须真导线从脚引出、
在 5 栅格点收尾再挂标志；接线端点必须用 getAllPinsByPrimitiveId 的**实测坐标**，别按栅格推。

### 网络标志/端口吸附栅格，导线不吸附

标签会被吸到 **0.05 inch（5 单位）栅格**上，导线不会。引出线长度若不是 5 的倍数
（如 39），端口被吸到 500 而导线停在 499 —— **差 1 个单位就断连**，且 DRC 只报
"引脚悬空"不指出原因。**所有引出线长度必须取 5 的倍数。**

### 端口 / 标志的朝向

**`createNetPort` 认 rotation**：0=右、90=上、180=左、270=下。侧向引出的端口用 0/180；
用错 90° 会让端口竖起来，在 100mil 引脚间距上必然重叠。

**`createNetFlag` 不认 rotation** —— 朝向由**所连导线的方向自动决定**。实测同为 `rot=90`
的两个标志，一个朝右一个朝左，取决于导线从哪边来。所以标志一律传 `0` 即可，
**想让它朝哪边就把导线往哪边走**。
（注意：孤立放置、没接导线的标志才会按 rotation 摆，用那种方式测会得出错误结论。）

朝向验证：`sch_Primitive.getPrimitivesBBox([id])` 与引脚坐标比较。

### 多段 `create` 偶发 `create failed!`

同一组线段拆成几次调用又能成功（与段数无关，7 段能成、5 段不能）。
但**拆开调用会让同一根线挂上多个网络名**，DRC 报"导线有多个网络名"。
稳妥做法：一次 create 不传 net，事后 `modify` 设一次。

### 桥接硬超时 30s，但 EDA 侧会跑完

循环超过约 50 次 API 调用就会超时返回。**超时只是桥接放弃等待，EDA 那边照样执行完** ——
别急着重试（会重复执行），先查状态再决定。大批量操作自己分批。

### `sch_Netlist.getNetlist()` 会超时

要全工程编译，30s 内回不来。要连接关系就自己算：`sch_PrimitiveWire.getAll()` 每根线
带 `net` 和线段坐标，`getAllPinsByPrimitiveId()` 给引脚绝对坐标，并查集一并就是网表。
注意 `line` 字段**新旧不统一**：老线是扁平 `[x1,y1,x2,y2,...]`，新建的是嵌套
`[[x1,y1,x2,y2],...]`，解析前先判类型。

### `sch_Drc.check()` 的 verbose 只返回计数

`check(strict, ui, true)` 返回 `[{type,count}]`，没有明细。要看具体条目得传
`userInterface=true` 然后读底部 DRC 面板。条目里的 `$1I877` 前缀 = **第 1 页**。

### 枚举在 execute 上下文里不是全局

`ESCH_PrimitiveLineType is not defined`。查文档拿数值直接传
（线型 SOLID=0 / DASHED=1 / DOTTED=2 / DOT_DASHED=3）。

### ★★ copySchematicPage 三连坑（2026-08-19 实测,DuN_V4 Y 通道页）

1. **多单元器件的 uniqueId 被拆散**:四运放复制后四个子件各拿一个新 uid(gge1_6..gge1_9)
   ——不统一则 PCB 导入拆成多颗封装。修法=以 .1 单元 uid 为准逐个 modify 其余子件。
2. **最小字段 modify({uniqueId, subPartName}) 会把 supplierId 覆盖成 subPartName 字符串**
   (C5214238 → "TL084HIDYYR_C5214238.2")——统一 uid 后必须全字段修复 supplierId。
3. 修复后 DRC 仍报「多部件元件属性需相同」:兄弟单元的 otherProperty 与 .1 有值级差异,
   要**从 .1 正本读出整包属性同步给全部兄弟单元**才消。
另:整页复制+网名改造的正确流程 = 复制→位号(与 uniqueId 分两趟!同传会清属性)→
uniqueId 统一→supplierId 修复→属性同步→线网 modify 改名(保大小写)→端口删旧建新
(端口 net 改不动)→与源页做(网名映射,位号偏移)双射同构审计。

### `copySchematicPage()` 会重排位号，且两页共用同一 Board 网表

复制到同一 Schematic 下时位号自动重排（U1→U2、C1→C4…），而且**两页的网表叠加到同一个
Board**——这种状态下更新 PCB 会把两套电路都推进去。要真正切换得先删原页，
或把副本移到独立的 Schematic / Board。

### 隐藏网络标志上的文字

接地符号本身已表意，不需要再显示 "GND"。文字是挂在标志上的 `Name` 属性：

```javascript
const at = await eda.sch_PrimitiveAttribute.getAll(flagId);
const nm = at.find(a => a.key === 'Name');
await eda.sch_PrimitiveAttribute.modify(nm.primitiveId, { valueVisible: false });
```

注意：**删除重建标志后这个设置会丢失**（新标志默认显示），重建后要重新关一次。

### 坐标与图纸

原理图单位 **0.01 inch**（PCB 是 1mil，差 10 倍）；**y 轴朝上**；
A4 图框的**标题栏占右下角**（约 x>500、y<335），布线别压进去。

### 引脚扇出的排版约定

#### ★ 最重要的一条：同一网络的多个引脚要**用导线并到一个标签**，不是每脚一个标签

AI 最容易犯的错是「每个引脚都挂一个网络标志/端口」——图上会出现十几个 GND 符号，又占地方又难读。
用户实测的画法是：**同网络的引脚先用实导线连起来，全组只放一个标志**。实例（真实坐标）：

| 合并到的标签 | 参与的引脚 |
|---|---|
| `GND` @(110,525) | J4.1、J4.8、J4.9 |
| `GND` @(405,500) | U1.8、U1.11 |
| `GND-iso` @(800,570) | U2.2、U2.3、U2.5、**C7.2** |
| `GND-iso` @(885,285) | J.4、J.5、R9.2 |
| `Dout` @(330,435) | R6.1、R7.1 |
| `+3.3V` @(600,735) | T1.1、**C4.1** |
| `+5.2V-ISO` @(950,605) | U2.8、**C7.1** |

注意去耦电容：**C4/C5/C7 是用导线直接连到对应 IC 的电源脚和地脚的**，共用 IC 那个标志，
电容自己不再单独挂标志。绕远也值得——例如 U2.5 走
`右5→下10→下15→左145→上35→左5` 去和 U2.2/U2.3 汇合。

只有**真正孤立的两脚器件**（如 C1/C2 这种独立的输入电容）才自己上下各挂一个标志。

经用户认可的一套具体参数（省空间、不重叠）：

- **两脚器件（C/R/D/LED）**：引出线 **5 单位（1 格）**，`createNetFlag` 的 rotation 一律 **0**。
  EasyEDA 会按导线方向自动摆正标志：竖线上朝上/朝下、横线上自动折成 **"横 1 格 + 纵 1 格"** 的
  L 形（导线走 1 格，标志自带的杆再走 1 格）。**不需要自己画 L**，给 rot 0 就行。
- **两脚器件属性位置**：位号 `(cx+5, cy+5)`、值 `(cx+5, cy-10)` —— 位号在上、值在下。
- **多脚 IC —— 用「走线分道」，不要用「错开引出线长度」**（用户验证过的做法）。
  每个引脚**先走 1 格（5）出来，再垂直拐 1 格（5）进自己的车道**，之后各走各的横向通道：

  ```
  引脚(455,210) ─右5→ (460,210) ─上5→ (460,215) ─右100→ (560,215) ─上15→ … 接下一个器件
  引脚(455,190) ─右5→ (460,190) ─下5→ (460,185) ─右140→ (600,185) ─下15→ …
  ```

  同一侧相邻引脚一个往上拐、一个往下拐，立刻分开，横向占用反而比错开长度更小。
  ★ **错开引出线长度是笨办法**：标签会离器件越来越远，两个器件对着扇时双方文字仍在中间
  撞上（实测 U1 右侧 `INT` 与 T1 左侧 `RO`，相距 195 仍撞），给太大还会让**对向引出线
  首尾相接直接短路**（实测 U1.14 与 T1.1）。只在实在没地方分道时才退回错开，且宁可短。
- **地符号要甩到空白处，别挂在引脚旁边**。例：引脚 `(385,200)` 的 GND 走
  `左15 → 上10 → 左5`，地符号落到 `(365,210)`（与上一个引脚同高的外侧），
  这样不会压住本体、位号和相邻引脚。直接在引脚上挂 10 单位出地符号一定会挤。
- **标志朝哪边，看那边有没有空白**，不是套固定规则：同一个 IC 上 VIN 的 +3.3V 朝右、
  EN 的朝上、GND 朝左，各自伸进最近的空白区。（朝向靠导线方向控制，见上面 rotation 那节。）
- **网络端口若那侧是空白，就给直的 10 单位**，不用拐弯 —— 端口文字自然向外伸展。
- **信号端口仍是每脚一个**（网络名不同，无法合并），用**两档交替 10 / 30~35**。
  实例：J4 的 `RO/SCL/INT` 用 35、`DI/SDA` 用 10；U1 的 `DE` 用 30、`Dout/RE` 用 10。
  基数取 10（不是 20），比我最初的 20/40/60 紧凑得多。
- **拐点不必都在「先走 5」处**。短距离用 `左5→上5`；要走远就直接一段长的再拐，
  例如 U1.2 是 `左30→上15`、U1.3 是 `左55→上25`，两条平行错开，读起来反而更清楚。

### 极短导线（≤5 单位、两端都是引脚）无法设置网络名

两个引脚挨在一起时（如 D1.K 与 R1.2 只隔 5 单位），那根线上：
`sch_PrimitiveWire.modify(id,{net})` **静默不生效**（返回成功但读回仍是空），
`sch_PrimitiveAttribute.createNetLabel()` **会把桥接卡到 30s 超时且什么都没建**。

唯一可行的办法：**删掉这根线，用 `create([seg], net)` 带网络名重建**（注意 create 会转大写，
小写名字再 `modify` 改回 —— 此时线上已有非空网络名，modify 就能生效了）。
- 器件本体边缘离引脚很近时（如连接器的安装脚，引脚 x=140 而本体边缘 x≈130），
  10 格引出线会让地符号压在本体和位号上 —— 这几个脚单独放长到 40。
- 两个器件的引脚若在纵向上**交错**（如连接器 y 610–670 对 IC 左侧 y 605–675），
  两边的标签扇一定互撞——把其中一个**整体平移**错开，比调引出线长度有效得多。
- 长网络名的端口文字会横向侵占很远（`VPS8504B_CLK` 向左延伸约 85 单位），
  压到旁边器件的位号上 —— 把旁边那组器件整体挪开，别去缩端口。

### `bridge-server.mjs` 的 `/eda-windows/select` 必崩（已在本分叉修复）

原代码第 195 行引用了不存在的变量 `activeWindowId`（真名 `activeEdaWindowId`），
抛错时 `res.writeHead(200)` 已经执行过，catch 里再 writeHead 触发
`ERR_HTTP_HEADERS_SENT`，**整个桥接进程退出**。本分叉已修。
即便如此，仍建议别用 select —— 直接在 `/execute` 里带 `windowId` 更稳。

### ★★ 连发 `modify` 会「隔一个被吞」（2026-08-17 实测）

同一次 `/execute` 里连发 6 个 `sch_PrimitiveWire.modify(id,{net})`，**恰好间隔丢 3 个**
（第 1/3/5 个生效、第 2/4/6 个静默无效，返回值全是成功）。组件 modify 连发 2 个没事，
但别赌。⇒ **纪律：任何批量 modify 之后必须读回验证**（`get()` 逐个比对），
被吞的**逐个单独重发**（一次 `/execute` 一个）就能全部生效。

### ★★ `modify` 传不存在的 id 返回真值、啥也不做（2026-08-17 实测）

`sch_PrimitiveWire.modify("不存在的id", {...})` **返回成功对象**，既不报错也不创建。
拿截断的 id 前缀自己拼全长 id 是自杀行为——看起来成功了，实际改了个寂寞。
⇒ **id 必须来自完整转储**（自己 getAll 时别 `.slice(0,8)` 截断），改完读回确认。

### ★★ 换接两根对调的线：必须"摘一根→挪另一根→接回"三步，且每步读回**段数对比预期**（2026-08-19 实战）

两根线要互换落点（如差分放大器 IN+/IN− 极性修正）时，任何一步的新路径若触到另一根的
在位几何就整根合并。且**单发 modify 也会被静默吞**（不只批量会）——读回 `nseg` 恰好等于
旧几何段数就是被吞了，别只看返回成功。被吞的 modify 重发也可能继续吞（实测同一根线
连吞两次）——此时**放弃 modify，删掉重建**：
- 多段 `create` 报 500 = **真失败**（与器件 create 的"500 但建成了"相反，实测 12 段/5 段
  各失败一次，查无残留）；**拆到 1 段/次逐根 create 必成**，触点重合会自动并回一根，
  共线段会被 EDA 合并（5 段共线 y 相同 → 读回 1 段，段数变少是正常合并不是丢失）。
- create 全部完成后再 `modify(id,{net})` 设一次网名（混合大小写照旧走 modify）。
- ★ modify/create 后立即 getAll 读回**偶发瞬态缺失**（找不到 id 报 GONE，实际已生效）
  ——隔一拍重查再下结论，别急着重发。

### ★★ wire modify 传扁平四元组 line 会**返回真值但静默无效**（2026-08-19 实测,DuN_V4 TLV9001 重接）

老线 `get()` 读回的 `line` 是扁平四元组 `[x1,y1,x2,y2, x1,y1,x2,y2,…]`,但把**同格式**
原样改几个数传回 `modify(id,{line})` 会 ok=true、读回却是旧几何——**必须转成嵌套折线格式**
`[[x1,y1,x2,y2,x3,y3,…],[…]]`(每个子数组一条连续折线)才真生效。生效后 EDA 会把折线
在**引脚交点处自动拆段并重排顺序**,读回的段数/顺序与所传不同属正常,核对时按"点集+连通性"
比,别按段逐一比。

### ★★ wire modify({line}) 会**顺手清空 net 字段**（2026-08-19 实测,DuN_V4）

只传 `{line}` 改几何,读回 `net` 变 `''`。靠净名跨段连通的线(如 `Pos Ist` 源线)会**静默断网**,
netmap diff 表现为"某网丢一个引脚"。⇒ 改带 net 的线要么 `{line, net}` 一起传,要么改完补一发
`modify(id,{net})`。另:个别线的 line modify 会被反复吞(ok=true 读回旧几何,单发也吞)——
疑与新旧几何自重叠有关,**删除重建**(拆成端点相接的短段 create,EDA 会自动合并成一根)即通。

### ★ netflag/netport 的 modify({x,y}) 挪位直接 HTTP 500（2026-08-19 实测）

标志/端口不能用 `sch_PrimitiveComponent.modify` 挪位置(必 500,连带桥接报错)。
挪位 = `delete` + `createNetFlag/createNetPort` 重建。器件(part)的 modify 挪位正常。

### ★ 矩形 create 的 topLeftY 与存储值**反号**;页外元素会撑大导出画布（2026-08-20 实测）

`sch_PrimitiveRectangle.getAll()` 读回的 `topLeftY` 是负数(内部 y 向下),而 `create(x, topY, …)`
要的是原理图显示坐标(正数)。把读回值原样喂给 create,矩形会镜像到图框下方页外——
**症状是 PNG 导出画布突然变成超大竖版**(导出画布随内容包围盒长,不只看图框)。
跨页复制矩形:`create_topY = −stored_topLeftY`。另:createNetFlag/createNetPort 的 rotation
也吃"create 90=读回 270"约定(0/180 不受影响),跨页照抄 rot 270 的要传 90。
页面图纸幅面(A1/A2…)**无 API**,只能界面里图纸设置改。

### ★ 悬空(未附着)的网络标签 API 完全枚举不到（2026-08-20 实测,DuN_V4 mcu 页）

界面上带"+"十字的悬空 net label(未挂到任何导线),在 sch_PrimitiveComponent /
sch_PrimitiveAttribute(全量 1337 条)/ sch_PrimitiveText / 导线 net 四类里**都查不到**,
存盘后依然不落库——只是 UI 侧待附着对象,**只能用户在界面手动删除或拖挂**。
API 侧落实其意图的正确姿势:直接把网名写到目标导线上(`sch_PrimitiveWire.modify(id,{net})`)。
另:`sch_PrimitiveAttribute.getAllPrimitiveId()` 不带 parent 的返回**不稳定**(同页同状态
一次 1337、一次 0),别依赖它做存在性判断。

### ★ 器件名/位号/线网名的**文字位置**都是属性图元,可精确挪（2026-08-19 实测）

`sch_PrimitiveAttribute.getAll(parentPrimitiveId)` 列出该器件/导线的属性,其中
`key: "Designator"/"Name"` 带 x/y;`sch_PrimitiveAttribute.modify(attrId, {x, y})` 直接生效。
导线的净名标签也是它的 `Name` 属性(锚点≈线中点,**居中对齐**),长网名(如 SENSE_OUT)
在短引出线上会溢进符号框——按 ~7 单位/字符估宽,把锚点 x 挪到 `脚位x − 8 − 宽/2` 即齐。

### ★ modify 改线也会触发合并：先改被压的旧线，再画压上去的新线（2026-08-19 实测）

`modify` 改出的线段与**另一根还没改的旧线**共线重叠,两根同样整根合并(DuN_V4 U27 重连:
+3.3V 馈线新段压到旧 MCU_RESET 线,合并后 net 被吞成 MCU_RESET,旧线 id 消失,
后续对它 modify 报 GONE)。⇒ **批量重排接线的顺序纪律:先改/挪会被压住的旧线,
再画压上去的新线**。修复照旧:整根重写幸存的 id + create 补建消失的那根。
另:符号引脚不在 5 栅格的问题可让用户在符号编辑器改到栅格再更新器件
(C717743 的符号用户已改好,现几何全在格上)。

### ★ 新建短线与既有导线重合会被**合并**，net 名吞掉整根旧线（2026-08-17 事故）

给新器件引脚放 5 单位短线时，若坐标恰好落在一根**旧残留导线**上（删旧电路常留下无 net 的
多段树线），create 出的线会**并进旧线成为一根**，你设的 net 名会应用到**整根旧树**——
表现为一个新网络凭空多出一堆死头分叉（本例 B_FB 吞了旧功放求和点残线，PCB 网表会被污染）。
⇒ 在旧电路区域放线/放器件前，先查该坐标附近有无残线；发现被吞后**删整根重建干净短线**。

### ★★ 后放器件的引脚落在既有导线段**中间**，EDA 判连不认（2026-08-18 实测）

导线 create 时会在**当时已存在**的引脚处自动打折点；之后才放置的器件即使引脚坐标
精确落在线段中段，DRC 照样报「引脚悬空」、**PCB 网表会丢这个脚**。
而自算的并查集网表按几何容差会把它判成已连——**两边结论相反，必须交叉看 DRC 悬空清单**。

修法：`sch_PrimitiveWire.modify(id, {line, net})` 整根重写该导线，在落点**显式加折点**
（如 `[[655,y,675,y],[675,y,710,y],[710,y,745,y],…]`）。

另：`modify(rotation:180)` 会给引脚坐标带来 `709.99999999999` 级浮点渣（endpoint 对 pin
的判连能容忍，pin 压线段的判连场景别赌）；能用 0° 摆放就别转 180°。

### ★ 多单元符号：API 放不了系统库符号的子件（2026-08-18 实测）

- `create()` 第 4 参是 **subPartName** 不是位号（传位号会被无害忽略，位号出来是 `R?`，事后 modify 补）。
- 对**器件(Device)**创建传 subPartName（`.2`/`2`/`B`/`名.2` 全试过）**一律放出完整符号**，
  不会拆单元——器件默认符号是整片式时此路不通。
- 想按**符号(Symbol)**放：`lib_Symbol.get()` 对系统库（如 `c77731cf…`）**直接 HTTP 500**；
  `lib_Symbol.search()` 能搜到条目，但把搜索条目或
  `{libraryType:"2", libraryUuid, uuid}` 字面量传给 `create()` 也是 **500**。
  ⇒ 分体符号的第二单元**只能在界面里手动放置**，API 只负责事后接线和 modify 位号归并。
- ★ **`modify()` 会把 subPartName 重置回 `.1`**（改位号时观察到 `.2`→`.1`）——
  对多单元实例做 modify 必须把 `subPartName` 一起回填，改完读回确认。

### ★ 非连接标识（NC 绿叉）API 完全不可操作（2026-08-18 实测）

- 放不了（旧知）、**删不了**、`pin.setState_NoConnected(false)` 返回值看着生效但**不落文档**
  （重新 getAllPins 读回仍 true）。
- **带 NC 标识的引脚上建线 = HTTP 500**，EDA 界面弹「导线不能连接到有非连接标识的引脚上」，
  桥接只见 500 看不见弹窗——若某页 create 连环 500 而其他页正常，先怀疑目标引脚有 NC 标识
  （让用户界面删掉即通）。别误诊成窗口焦点/桥接故障。

### ★ createNetFlag / createNetPort 首参是**类型**不是网名（2026-08-18 实测）

`createNetFlag("Ground"|"Power", net, x, y, rot, mirror)`、`createNetPort("BI", net, x, y, rot, mirror)`。
把网名放第一参（如 `createNetFlag("GND", x, y, 0)`）不会报错，而是**挂起到 30s 超时且什么都不建**。

### ★ 桥接/窗口重连后 get() 返回 null 或 HTTP 500（2026-08-18 实测）

`/health` 的 `activeWindowId` 变了 = EDA 窗口重连过。此后 `sch_PrimitiveComponent.get()`
会**静默返回 null**（或批量时 HTTP 500），极像"器件被删了"。
修法：先 `dmt_EditorControl.openDocument(pageUuid)` 重开文档再查。
每个脚本开头调一次 openDocument 是廉价保险。

### ★ 与用户 GUI 并发编辑：动手前后都要 diff（2026-08-18 实战）

桥接改图时用户可能同时在界面上拖器件——表现为：转储坐标与实时 get() 对不上、
旧导线几何整体漂移、拖动路过的短线被扯断（本例 U3A_FB 跟随器钳位线）。
纪律：**每一批改动前后都重转储 diff**；发现非自己造成的位移，先停手和用户约定
"谁暂停谁继续"，再固化新基线接着干。

### ★ DRC 明细不用截图：直接 DOM 抠（2026-08-17 实测）

execute 上下文里 `document` 可用。跑完 `sch_Drc.check(strict, true, true)` 后：

```javascript
const els = document.querySelectorAll('[class*="drc" i], [id*="drc" i]');
// 取 innerText 最长的那个元素，就是完整明细列表（含 [警告]/[信息] 全文）
```

注意 `check()` 的计数覆盖**该 Schematic 的全部图页**（不只当前页）；
条目里 `$5N427`/`$6N4` 的 `$N` 前缀是页的**内部序号**（不是页码顺序），跨页排查先分清哪页。

### ★ 原理图页可导出 PNG 落盘（2026-08-17 实测）

```javascript
const f = await eda.sch_ManufactureData.getExportDocumentFile("page", "PNG");  // File，实为 zip：每页一张 PNG
await eda.sys_FileSystem.saveFileToFileSystem("/绝对路径/x.zip", f, "x.zip", true);  // ✓ 可写任意绝对路径
```

- 不传参数默认导 PDF；`fileType:"PNG"` 返回 **zip**。
- ★ 带 `typeSpecificParams`（如 `{theme:"Black on White"}`）或 `object` 参数会 **HTTP 500**，用默认即可。
- A2 页导出 4698×3326 px（≈2.009 px/图纸单位，y 翻转），可按坐标裁剪局部目视——
  **这是核对符号极性（如 BAV99 二极管方向）的唯一可靠办法**，库 API 拿不到符号图形。

### ★★ 大规模重排版面的实战纪律（2026-08-17，DuN_V4 全页重排 60+ 器件验证）

1. **改前先固化网表基线**：用 `sch_PrimitiveWire.getAll()` + 逐器件
   `getAllPinsByPrimitiveId` + 并查集自算 `{net: [des.pin]}` 存盘；改完重算逐网 diff，
   **必须零差异**才算重排无损。靠 DRC 看不出「A 网错接到 B 网但都连着」这类灾难。
2. **标志锚点必须是 5 的倍数**（吸附栅格），且**锚点必须落在导线端点或线段上**。
   一批 27 个标志里 10 个因 (x,y) 非 5 倍数被吸走 1–2 格悬空——症状是网表里该引脚
   静默消失，图上看着完全正常。修法=把引出线几何改到栅格点，别去挪标志。
3. **端点落在别的导线线段上=接通（T 交），线段互穿=不通**。排线时所有「肩并肩」的
   平行线至少隔 5；引脚正好压在过路线上也算接通（R116.2 压 R124 走线=真短路）。
4. **新线碰旧线会整根合并**，合并后原 primitiveId 可能保留但 line 面目全非（还带
   439.9999999999998 这种浮点渣）。发现坏合并别拆，直接 `modify(id,{line,net})` 整根重写。
5. **`sch_PrimitiveText.modify(id,{x,y})` 坐标改了但渲染位置不动**（读回 x/y 是新值，
   图上还在老地方/错地方）——挪文本一律**删了重建**。
6. 器件 modify 挪位时**属性文字会跟着走**（相对位置保持），rotation 要显式传。
7. 竖放的元件符号引脚间距可能与横放不同（C1N 竖放 ±20、C100N 竖放 ±15）——
   **旋转后必须读回引脚实测坐标再画线**，别按横放偏移推算。

### ★ `pcb_Document.importChanges()` 只弹确认框，不点「应用修改」不生效（2026-08-17 实测）

返回 `true` 只代表「确认导入信息」对话框弹出来了，此时 PCB 上仍是 0 元件。要真正导入：

```javascript
const btns = document.querySelectorAll('button, [class*="button" i]');
for (const b of btns) if ((b.innerText||"").trim() === "应用修改" && b.offsetParent !== null) { b.click(); break; }
await new Promise(r => setTimeout(r, 8000));   // 232 件约需几秒
```

配套流程：`dmt_Board.createBoard(schUuid)` 建 Board（不带 PCB）→ `dmt_Pcb.createPcb(boardName)`
建 PCB 并挂进该 Board → `modifyPcbName` 改名 → openDocument → importChanges → DOM 点应用。
多分部元件（四运放等）导入后自动合并为单封装；`addIntoPcb=false` 的器件正确排除。

### `getAllSchematicPagesInfo()` 返回**整个工程所有 Schematic** 的页

不只当前打开的 Schematic。要拿当前图的页，用 `getAllSchematicsInfo()` 按名字找到
对应 Schematic 再取其 `page` 数组。位号跨页查重时务必先圈定同一 Schematic 的页集合
（DRC 的位号重复检查就是按 Schematic 为单位的）。

### ★ PCB 反建原理图专场（2026-08-22，FB4NW-1KX41FX 99 件全流程验证）

- **导入板的工程本地器件没有原理图符号**：`sch_PrimitiveComponent.create` 传工程库 device 会
  **挂满 30s 超时且什么都不建**（查证无残留）。反建一律走官方正本 `getByLcscIds`。
- **PCB 元件 getAll 自带整套网表**：每个元件的 `pads[]` 有 `padNumber`+`net`，一次 getAll 即得
  全部连接关系。QFN 的 EP 散热盘阵列 padNumber 是 `ie94` 这类非数字串，按"非数字=EP 附属"归并；
  LED 类导入封装焊盘号可能是 **A/K 字母**（官方符号是 1/2），要做功能映射。
- **符号 bbox 不含引脚伸出段**，两类朝向误判：①卧放 R/C（符号半高<半宽）按"最近边"判会判成
  上下边，netport 竖排文字在 40 间距列里互撞；②大符号**四角引脚**（如 HR641680E 的 1/8/9/16）
  被判成上下，rot90/270 端口文字**倒灌回符号内部**。⇒ 信号端口一律按 dx 正负走水平。
- **同网多次 create 合并后的导线带重复网名记录**（DRC 报"多个网络名: X、X、X"），
  `modify({net})` **清不掉**；唯一解=删除后**单次 create 传嵌套多折线**（不传 net）再
  `modify({net})` 一次。汇流树（总线+多支 stub）可一次 create 传 N 条折线成为一根线。
- **sch 侧 uniqueId 可写**（新建器件 uniqueId 为空，与既有 PCB 配对时反向写入）：两趟法——
  `modify({uniqueId})` 会把 supplierId 污染成"厂商号.子件名"，紧跟全字段回填（designator+
  addIntoBom/Pcb+supplier×2+manufacturer×2+otherProperty，**不带 uniqueId**）即恢复且 uid 保留。
  99 件零失误。★回填快照必须取 modify **之前**的（事后读会把污染值回填——实测 C22 的 Value
  就这么丢的）。
- **DRC 面板计数是累计的**：`check()` 返回值和面板顶部 count 含历史条目，真实结果看明细里
  **最后一条"完成设计规则检查"**。
- **`getCurrentRenderedAreaImage` 在切页/缩放后画布未重绘时返回纯白图**（A4 约 70KB PNG，
  远小于正常 ~750KB，可按大小甄别）。★ 关键：`openDocument` 有时**不真正前置标签页**，怎么等
  都是白图（同页连试 5 次全白）；改用 **`activateDocument("<pageUuid>@<projectUuid>")`** 一发即中。
  稳妥序列：activateDocument → sleep → zoomToRegion(显式范围) → sleep 2s+ → 截图，按大小甄别重试。
- **createNetPort 首参是方向枚举**（'IN'|'OUT'|'BI'），反建场景统一 "BI" 即可。
- **顶边引脚（如 RJ45 屏蔽壳）的地**：向上短线 + `createNetFlag(..., rot 180)` = 地符号**开口朝上**
  立在引脚上方（用户认可的画法，2026-08-22）。此场景 rot 0 会让地符号倒挂穿线留突头——
  说明"附着标志随导线自动定向"并非总成立，**竖直向上的地必须显式 rot 180**。
- **卧放 MLCC 的用户认可样式（2026-08-22，"C27 样式"）**：GND 侧横向短线 5 + **横躺地符号开口朝外**
  （地在左 create rot **90**、地在右 create rot **270**，都吃 90↔270 读回互换）；位号挪到信号侧
  `(cx+5, cy)`、值 `(cx+5, cy-10)`（`sch_PrimitiveAttribute.modify({x,y})` 直接生效）；
  地在右的镜像件文字放左侧，锚点按 ~7.2 单位/字符估宽：`cx-5-ceil(7.2*len+2)`。
  电源标志（+3.3V/1V0 等）保持竖直向上不动。

## Debugging Tips & Failure Strategies

### Troubleshooting

1. **Always check health first**: Scan ports 49620-49629 for `{"service":"easyeda-bridge"}`
2. **EDA not connected?**: Ensure bridge extension is loaded in EasyEDA. Download: https://jlc-ext.com/item/oshwhub/run-api-gateway
3. **Timeout errors**: Default 30s timeout. If timeout occurs:
   - Check if the correct project and document are opened (use `dmt_Project.getCurrentProjectInfo()`)
   - If no project is opened, use `dmt_Project.openProject(projectPath)` to open one
   - If no document is active, use `dmt_EditorControl.openDocument(docId)` to open the correct document type (PCB/Schematic)
   - If the document type is wrong (e.g., running PCB APIs on Schematic), switch to the correct document first
   - Complex operations may need code splitting
4. **Check return values**: Many methods return `null` on failure — always validate
5. **Layer numbers**: Use enums from `references/enums/` docs (e.g., `EPCB_LayerId`)
6. **EDA window disconnected**: If you get an error about a window being disconnected, use `GET /eda-windows` to check available windows and `POST /eda-windows/select` to switch to another window
7. **Permission errors**: All API interfaces are controlled by EDA's permission system. If a specific API consistently fails to execute (returns error or null) while other APIs work fine, and you've confirmed the call matches the documentation exactly, it may be **blocked by permissions** — not a code bug. The EDA client may restrict certain operations based on user license, project settings, or document state. Inform the user that the operation may require elevated permissions or a different EDA edition.
8. **Persistent errors?**: If you've verified the API call matches the documentation exactly, ruled out permission issues, and still encounter unexpected errors, consider reporting the issue through official EasyEDA support channels

### Failure Handling Rules

When developing extensions, follow these rules:

| Situation | Action |
|-----------|--------|
| API method does not exist in docs | **Stop immediately** — inform the user the API doesn't exist |
| Signature uncertain after reading docs | **Stop generation** — return to query step and re-read |
| Forbidden browser API detected | **Auto-replace** with `eda.sys_*` alternative |
| Menu ID conflict | Add prefix to differentiate (e.g., `my-plugin-home`, `my-plugin-sch`) |
| Permission blocked | Inform user — may require different EDA edition or license |

**Critical:** Never guess an API signature. If `references/classes/` doesn't document it, it doesn't exist for your use case.

## Workflow for AI Agent

When the user asks you to perform EDA operations:

1. **Understand the task** — What domain? (PCB/SCH/LIB/Project)
2. **Verify document state** — Check `eda.dmt_Project.getCurrentProjectInfo()` and `eda.dmt_SelectControl.getCurrentDocumentInfo()`
3. **Confirm correct document type** — PCB operations need active PCB, SCH operations need active Schematic
4. **Look up API** — Read relevant class docs from `references/`
5. **Check types** — Read enum/interface docs for parameter types
6. **Write code** — Follow the execution context rules above
7. **Execute** — Send via `POST /execute` and check the result
8. **Iterate** — If errors occur, read error messages and adjust

When unsure about an API:
- Search `_quick-reference.md` for method names
- Read the specific class doc for detailed signatures and remarks
- Check interface docs for complex parameter types

## Session Management

### Detecting Topic Changes

The Bridge server consumes system resources while running. If the user has switched to a completely different topic (not related to EasyEDA/EDA/PCB/schematic) **3 consecutive times**, proactively ask if they want to close the Bridge:

> "I notice we've moved on from EasyEDA. The Bridge server is still running in the background. Would you like me to stop it to free up resources?"

**Do NOT close the Bridge automatically** — the user may switch back to EDA work later. Only ask, and close if they confirm.

### Closing the Bridge

If the user confirms they want to stop the Bridge:

```bash
# Find and stop the bridge process
for port in $(seq 49620 49629); do
  pid=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pid" ]; then
    kill $pid
    echo "Bridge stopped (PID: $pid, Port: $port)"
    break
  fi
done
```

### ★★ 用户排版要求：大方、拉开、不重叠（2026-08-25 明确反馈，金丝燕功放场次）

用户原话："画原理图大方一点，间距拉大，不要重叠，不要总是什么都堆在一起。"实测可行的量化标准：
- **功能簇之间留 60~150 单位**，每个簇独占一块空区（配置 RC 簇、LED 簇、去耦排、输出链分区摆放）。
- **同类元件成排时间距 ≥50**（去耦排 50 间距下默认标注位置不重叠；30 间距必撞）。
- 输出链的并联支路（滤波C/EMI RC/阻尼/TVS/GDT）**每支间隔 60**。
- 相邻行的水平元件（如 RINP/RINN 两只耦合电容）**不能只错 10**——体宽 30 会叠；要么行距拉开（跳线拐到 25+ 单位外的行），要么水平错开 ≥40。
- **rot90 竖排 netport 的文字会竖着长、压到下方器件**——一律改 L 形：竖 stub 到顶后横走 10，端口 rot0/rot180 横出。
- 长器件名（S8050 J3Y(...)、17-21SYGC/... 等）一律 `Name` 属性 `valueVisible:false` 隐藏。

### ★★ stub 端点撞他人引脚 = 静默短路（同场次两次中招，必须程序化检查）

引出线/接地线端点恰好落在另一器件引脚坐标上就是真短路（网表并组，图上只是一个点）：
C11 的 GVDD stub 端点 (150,560) 撞 Q2 基极；C15 接地线端点 (190,530) 撞 R15 顶脚（VCC-GND 直短）。
⇒ 生成导线前，把**所有导线端点**对**全部器件引脚实测坐标**做一次碰撞扫描（容差 <1），命中且非本意即改道。
自算网表逐脚比对（并查集 vs 期望 pin→net 表）能在保存前抓住这类事故——每轮改动后必跑。

### ★★ EDA 合并共线导线会吃掉 T 交点（2026-08-25 实测，自举电容支路断连）

两根共线、共享端点的竖线（各自 T 在第三根横线上）会被合并成一根直通线段，原 T 交点消失=断连。
⇒ T 结优先落在**引脚坐标**上（引脚自动打折点，合并不丢）；无引脚可用时避免让两段阻尼/支路竖线共线。

### ★ 旧线扁平 line 是四元组（步长4），按链式（步长2）解析会产生幻影段

自算网表若用步长 2 解析扁平数组，会解出不存在的斜线/竖线，误报短路。嵌套格式才是链式折线。

### ★ 3.2.181: createProject 带 description 参数直接 HTTP 500

`createProject(友好名, 工程名)` 成功；同参数追加 description 必 500。M2 (3.2.181) 实测。

### ★ 多单元运放符号陷阱 + 同族器件符号朝向不一（2026-08-26，金丝燕 PEQ 页实测）

- **`create()` 放多单元符号（如 NE5532DR）只出第 1 单元**（5 脚：1/2/3/4/8），5/6/7 脚根本不存在。
  库里通常有同名不带后缀的**单框全脚版本**（如 "NE5532" 8 脚 box）——API 画图一律选单框版。
  probe 探完记得把选定 uuid 写回 devices.json（这次就是探了单框、devices.json 里还是多单元版）。
- **同族电容符号基向可能不同**：CL10B183(18nF) 的符号横放，同系列其他值竖放——同 rot 参数下引脚朝向不同。
  ⇒ 布线必须用**放置后的实测引脚坐标**驱动，不能按同族假设套。
- **删除与他线合并过的导线会删掉整条折线**：短接线若已与主干合并成一条 polyline，按段匹配删除=连主干一起删。
  删前重新 getAll 确认目标线的完整 line 数据，删后补回误伤段。
- **openDocument 切页后要 sleep ≥1s 再 getAll**，多页工程切页慢，立刻转储会拿到上一页数据（表现为大面积幻影断连）。
- **用户可能随时在 EDA 里手动拖元件**（连带导线一起动）——校验前先从活文档刷新全部引脚坐标，别信本地缓存的 placed_pins。

### ★★ 系统库器件的立创编号不可信，画完必须全板盘点（2026-08-27 实测，金丝燕）

EDA 系统库器件自带的 `Supplier Part` 两类坑：**`C99xxxxxxx` 开头 = EDA 占位号，商城不存在**
（本例 F1 保险座/NE5532/电解 全中）；正常格式的号也可能**过时下架**（AO4407A 带的 C3019374 已无此料）。
⇒ 原理图完成后转储全部元件的 Supplier Part 逐一对商城核实（so.szlcsc.com/global.html?k=Cxxx）。
修法分两档：编号错但封装对 → 只改 `Supplier Part`/`Manufacturer Part`/`Manufacturer` 属性
（sch_PrimitiveAttribute.modify 单属性安全）；**封装也变**（如 0805→0603）→ 必须
`lib_Device.getByLcscIds` 取新器件整体替换重摆。运气好时新符号引脚与旧坐标重合、导线原位接续
（换前比对 readback）。另注意保险丝座额定电流要 ≥ 保险丝规格（爆款 C3131 只有 6.3A，配 10A 丝要用 C41371862）。

### ★★ 右键"查看产品链接"读器件绑定，不读 Supplier Part 属性（2026-08-27 用户实测发现）

只改元件的 `Supplier Part`/`Manufacturer Part` 属性：BOM 导出对，但右键产品链接仍指向旧器件的编号，
且比起真器件少十几项属性（额定值/数据手册/描述/库类目…）。**正解是 GUI 器件管理器→替换**
（可勾选保留位号+唯一ID、保留当前符号/封装），API 无对应函数。API 侧两条替代路：
- **换符号可接受** → 删除+从正确器件 create 重建（新实例自带完整属性）；引脚编号可能相同但坐标差
  半格（AO4407A C16072 的 S 列在 y−10..+10，不是想当然的 0..+20），布线必须按 readback 重排。
- **必须保留符号**（如真器件是多单元符号会毁布线，NE5532 C7426 就是）→ 临时 create 一个目标器件实例
  把器件导入工程库→读它的 `Device` 属性值（16位工程库本地 id，非 32 位系统库 uuid）→删临时件→把目标
  元件的 `Device` 属性 modify 成该 id = 复刻"保留当前符号"替换。实测可行；副作用是 DRC 报
  「元件的属性与供应商编号不匹配，建议器件标准化」外观性警告（链接/BOM 均已正确）。

### ★★ 多单元符号 API 摆放已打通（2026-08-31，金丝燕三角运放替换实测）

- **`sch_PrimitiveComponent.create()` 第 4 参就是 `subPartName`**（一直传 "" = 默认第 1 单元）。
  传符号自身的单元名（如 `"OPA1612AID.2"`，格式=符号名.N，可先放一个读 `getState_SubPartName()` 确认）
  即得第 2 单元（引脚 5/6/7，无电源脚；电源脚 4/8 在第 1 单元上）。
  `setState_SubPartName()` 只改字符串标签**不换单元**，别用它切换。
- 两个单元实例 `setState_Designator` 设同名（如都设 "U2"）合法，显示为 U2.1/U2.2，BOM 归并为一件。
- 标准双运放（NE5532/OPA1612/458x 系）三角单元与单框符号**引脚号完全一致**（A:1/2/3+4/8, B:5/6/7），
  替换后期望网表不用改。
- **个人库建器件**：`lib_Device.create(个人库uuid, 名称, class, association, desc, property)`；
  association 引用**系统库**资源（封装/3D）会超时失败，全部引用**个人库**资源即秒成
  （复用个人库现有器件的整套 association 最稳）。`lib_Device.copy` 系统库→个人库实测返回 undefined 失败。
  `lib_LibrariesList.getPersonalLibraryUuid()` 取个人库 uuid。
- 三角单元重布线时注意：单元体约 80×60，引脚 IN±(−40,∓10)/OUT(+40,0)/电源(0,±40)；
  连线绕行别穿三角体（本次 U3.2 穿体返工一次）。

### ★★ 折线手术会留"悬空残段"，收尾必跑连线完整性审计（2026-08-31，用户点出后 P3 揪出 6 处）

按段匹配删折线时，目标段可能已被 T 点/端口拆成小段（如 (1005,335)-(1100,335) 实存为
(1005..1020)+(1020..1100) 两段），整段匹配删不中 → 回补机制又把它们复原 → 留下电气同网但
一端悬空的残段（netlist 全对、DRC 只报"游离"最重的那种，短尾巴根本不报）。
⇒ **每轮布线改动后跑 stage9_audit.py 级别的审计**：每条折线的真端点（在折线内只出现一次的坐标）
必须落在 引脚/标志/端口锚点/他线段 上，且每个引脚必须被至少一条线/标志触达。金丝燕工程的实现在
`功放设计/eda_build/stage9_audit.py`（三页默认，传 pageUuid 可单页）。
另注意删段匹配要用"区间包含"（y 相同且 x 范围落在目标区间内）而不是端点全等，才能连小段一起清掉。
- **`getCurrentRenderedAreaImage()` 在 3.2.x(Win) 返回 Blob 而非 dataURL 字符串**——拿到 dict 空键就是它。
  页内转:`await b.arrayBuffer()` → Uint8Array 分块 `String.fromCharCode.apply` → `btoa` 带回。
  取景用 `zoomToAllPrimitives()` 最稳(zoomToRegion 的坐标约定易踩偏出图框拍到空白)。
- **按"端点坐标"匹配删线比按"线段"匹配更危险**:命中点所在的整条合并折线会被整体删除,
  电源轨/一串 stub 全在一条折线里时会连坐塌方。删后必须立即跑悬空+未接引脚审计,按清单精确补回。
- **字形尺寸经验值(3.2.x 实测)**:Power 网络旗标文字宽 VREF≈19/VA≈11 单位(0.01in),字形沿指向延伸 16~18;
  netport 五边形≈25~30 长、文字再向外 ~30。**rot180 的旗标文字不会倒置**。布线避让前先按这个算,
  拿不准就空白区放测试旗标+已知长度标尺线,zoomToAllPrimitives 截图标定(px/单位),量完删掉。
- **wire 的 net 属性会渲染成线上网络名标签**(用户在 GUI 拖"网络标签"就是这效果),同名线全局并网。
  但**标签收尾的自由线端仍显示悬空灰点**,审计/DRC 会报;要干净收口用旗标/端口终结线端。
  wire 的 `toAsync().setState_Net()` 报 modify failed,**用 `sch_PrimitiveWire.modify(id,{net})` 才行**。
- **netflag 和 netport 是不同 ComponentType**(getState_ComponentType: 'netflag'/'netport'),转储时带上这个字段,
  否则视觉重排会把五边形端口当旗标算字形,避让全错。
- **★ `sch_PrimitiveAttribute`(标签图元) 的 `setState_Y` 是 y 朝下语义**:getter 读回 y=405 的标签,
  setState_Y(405) 会把它设到 −405(飞出图外)。**要设到 getter 语义的 y,传负值** setState_Y(-y)。
  setState_X 正常。标签按 parentPrimitiveId 归属元件;**移动元件时子标签会自动跟移**(实测 +20 随移)。
  文字左缘=锚点 x,向东延伸,每字符≈4.3 单位宽、高≈10;Designator 惯例在 Name(值)上方 10。
- **★★ 移动元件后引脚落在既有导线中段 ≠ 连通**:几何上点在线上,但 EDA 连通引擎不认,DRC 报
  「元件引脚悬空」(实测 R34 东移 20 落 E 轨中段)。"引脚自动打折点"只在**画线时经过引脚**成立。
  修法:重建该线为**两根线、端点都落在引脚坐标上**(共线共端点在引脚处合并不丢结点)。
  自写并查集校验会把这种情况误判为连通——DRC 的悬空检查是必要的独立防线。
- **元件 modify 可带 rotation 转向**(与 x/y 同传, 照旧必须一次传全七字段):实测 15 件移位+转向零字段丢失,
  子标签自动跟随。但**转向后的引脚方位必须实测回读再落线**——同容值段的 MLCC 符号跨距不一
  (CL10B393/183 是 ±20, CL10B223/CL21B103 是 ±15),且**有的符号基版是横放的**(CL10B822/CL10B562:
  r90 才竖放, 转 r0 反而横倒),引脚号方位还可能互为镜像(C48 r90 是 1下2上, C50 是 2下1上)。
  正确姿势:移件后 getAllPinsByPrimitiveId 实测 → 与计划落点逐脚比对(闸门) → 不符即停,再建线。
- **批量重排的稳妥流程**(实测 15 移 19 拆 36 建零失误):①转储活文档→②按「触旧引脚」规则程序化枚举
  拆除线(防漏删断头线)→③计划 JSON(含 expected_pins 闸门表)→④对抗评审(拆除完备/移后碰撞/全页语义
  三镜头, 本次逮住 6 个符号库差异 blocker)→⑤先拆线再移件(防橡皮筋)→⑥引脚闸门→⑦建线→⑧verify+audit+DRC。
- **★ 贴片电阻 4 位阻值码陷阱**:0603WAF**7502** = 750×10² = 75kΩ,**不是 7.5k**(7.5k=**7501**)。
  按名字搜库拿件后,放置前先读 otherProperty["Value"] 或看渲染值核对——本项目差点把 75k 当 7.5k 装进
  滤波器(Q 会从 1.30 掉到 0.41)。同理 2202=22k/1802=18k/5102=51k。
- **运放"出脚列"是布线禁区**:竖直走线若取 x=运放中心+40(输出脚尖列),该列上任何运放的 out 脚都会
  压线中段、短杆端点也会落线成 T——评审实测抓到 VS↔VS2 短路。垂直穿越运放区的线要避开 中心±40 两列。
- **`sch_PrimitiveText.create` 签名是 `(x, y, content)`**——不是 (content, x, y)!传反了会得到
  x="文字"、content="数字" 的错乱对象(不报错)。modify(id,{x,y}) 正常, 无 y 反号问题(那是
  sch_PrimitiveAttribute 的 setState_Y 特有)。放注释文本先在空白处探一发读回核字段再批量。
- **★ macOS 上给 EDA 开第二个窗口**:`open -n -a "嘉立创EDA(专业版)"` 触发 Chromium second-instance,
  第一实例会弹出一个**新窗口**(开始页)。**两个窗口的扩展都连同一个桥接(49620)**,靠 `/execute` 传
  `windowId` 区分(`GET /eda-windows` 列出全部窗口);不传就打到 activeWindowId 那个,并行时极易打错窗口。
  菜单里没有"新窗口"入口,UI 右键也难做
  (computer-use 的前台命中检测会把 EDA 窗口内坐标误判成"程序坞"而拒点,仅系统菜单栏可点)。
- **一个位号在多台/多窗并行时的车辙**:动手前先 `getCurrentProjectInfo` 核对当前窗口的工程——
  另一会话可能已把窗口切走(实测 openProject 抢过别人的窗口, 对方切回后我的 delete 返回 False、
  create 超时且因活动文档是 PCB 页而实际未执行,零损伤纯属侥幸)。**会话边界是 windowId,不是端口**——
  一台机器只有一个桥接,多窗并行必须每次显式带 windowId。
- **镜像与旋转的作用顺序：先 rotation 后 mirror（mirror 翻的是旋转后的 dx）**。实测:基准脚位 (−5,−20)/(+5,−20),
  要落到"东侧竖排"(+20,±5) 需 rot=270+mirror=true(先 r270 得 (−20,±5) 再翻 x);按"先翻后转"推会得出 r90 而落错西侧。
  换接线端子这类对称件时脚序会静默颠倒(极性反!),必须逐脚闸门。
