# vscode-cli-harness-bridge

## Summary

`vscode-cli-harness-bridge` is a VS Code extension plus small CLI helper that lets terminal-native agent harnesses use VS Code as an editor-aware tool provider without replacing the harness’s native terminal UI.

The goal is not to create a new agent chat UI. The goal is to let existing CLI/TUI agent harnesses access editor context, selection, diagnostics, diff review, editor-mediated edits, and integrated terminal hooks.

This keeps the agent harness in control while allowing VS Code to provide the IDE affordances that terminal-only agents usually lack.

## Core Idea

```text
CLI / TUI agent harness
  ↔ local authenticated JSON-RPC bridge
  ↔ VS Code extension
  ↔ VS Code editor APIs
```

Examples of target harnesses:

```text
omp
omp-sbx
opencode
aider-like tools
custom local agents
sandboxed/containerized coding agents
```

The first concrete integration target is `omp` / `omp-sbx`, but the project should remain generic.

## Why This Exists

ACP integration can let VS Code drive an agent backend, but that reverses the desired control direction.

This project is for cases where the user wants to keep:

- the agent’s native TUI
- existing agent commands
- existing sandbox wrappers
- terminal-first workflow
- local model choices
- custom harness behavior

while adding VS Code-native affordances:

- active editor awareness
- selection awareness
- diagnostics awareness
- real diff views
- editor-mediated edits
- permission prompts
- integrated terminal hooks

## Prior Art

This project is not claiming that the pattern is entirely novel.

Relevant prior art includes:

- Lime Code-style IDE companion behavior:
  - terminal CLI remains primary
  - VS Code companion exposes editor features
  - per-window local server
  - lockfile/session discovery
  - bearer-token gated localhost access
  - selection context
  - diagnostics routing
  - diff review in editor

- Copilot CLI / IDE bridge style behavior:
  - CLI can access editor selection
  - CLI can open proposed file diffs in VS Code
  - CLI can consult diagnostics

- Claude Code / Codex-style editor integrations:
  - terminal-like agent flow
  - editor context
  - diff/review affordances
  - permissioned command execution

- VS Code MCP server extensions:
  - expose editor/workspace/LSP state to external tools
  - useful reference point, but often heavier than needed for a narrow local bridge

The differentiator for this project:

```text
Tiny, generic, JSON-RPC-first bridge for terminal-native agent harnesses.
Not a new agent.
Not a chat UI.
Not MCP-first.
Not provider-specific.
```

## Name

Project name:

```text
vscode-cli-harness-bridge
```

Rationale:

- explicitly VS Code extension-oriented
- explicitly for CLI / terminal-native harnesses
- avoids tying the project to OMP
- avoids pretending this is a general IDE abstraction before it exists
- leaves room for future non-VS Code bridges later

Possible CLI command names:

```text
vchb
harness-bridge
vscode-harness-bridge
```

Preferred initial CLI:

```bash
vchb selection
vchb active-editor
vchb diff <original-path> <proposed-path>
vchb diagnostics
```

Long-form alias:

```bash
vscode-cli-harness-bridge selection
```

## Requirements

### Keep

- OMP native TUI
- OMP commands
- `omp-sbx` wrapper
- terminal-first flow
- local/sandbox model choices

### Add

- active VS Code editor awareness
- current selection awareness
- diagnostics awareness
- real VS Code diff views
- editor-mediated edits
- permission prompts
- integrated terminal hooks

## Architecture

```text
packages/
  extension/
    VS Code extension
    starts local bridge server
    exposes VS Code editor APIs over JSON-RPC

  cli/
    small command-line helper
    discovers active bridge session
    calls bridge JSON-RPC methods
    prints compact JSON to stdout

  protocol/
    shared TypeScript types
    JSON-RPC method definitions
    request/response schemas

examples/
  omp/
    OMP usage notes
    optional skill/instructions

  omp-sbx/
    Docker/sandbox usage notes
    host.docker.internal examples

  generic-agent/
    minimal harness integration example
```

## Bridge Transport

Use local JSON-RPC over HTTP or WebSocket.

Initial preference:

```text
HTTP POST /rpc
JSON-RPC 2.0 payload
Bearer token authentication
```

Example request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "editor/getSelection",
  "params": {}
}
```

Example response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "uri": "file:///Users/mike/src/project/src/foo.ts",
    "fileName": "/Users/mike/src/project/src/foo.ts",
    "languageId": "typescript",
    "range": {
      "start": { "line": 42, "character": 4 },
      "end": { "line": 57, "character": 1 }
    },
    "text": "selected source text..."
  }
}
```

## Session Discovery

The VS Code extension starts a per-window bridge server and writes a session file.

Example session file:

```json
{
  "bridge": "http://127.0.0.1:47321",
  "dockerBridge": "http://host.docker.internal:47321",
  "token": "random-session-token",
  "workspace": "/Users/mike/src/github.com/mikeatlas/omp-sbx",
  "pid": 12345,
  "createdAt": "2026-06-27T15:00:00Z"
}
```

Possible location:

```text
~/.vscode-cli-harness-bridge/sessions/<workspace-hash>.json
```

Also support env vars:

```bash
VCHB_BRIDGE_URL=http://127.0.0.1:47321
VCHB_BRIDGE_TOKEN=...
VCHB_WORKSPACE=/path/to/workspace
```

Inside Docker:

```bash
VCHB_BRIDGE_URL=http://host.docker.internal:47321
VCHB_BRIDGE_TOKEN=...
```

## Docker / Sandbox Networking

For Docker Desktop on macOS, containers can usually reach host services through:

```text
host.docker.internal
```

So `omp-sbx` can call the VS Code bridge like this:

```bash
docker run \
  -e VCHB_BRIDGE_URL=http://host.docker.internal:47321 \
  -e VCHB_BRIDGE_TOKEN="$VCHB_BRIDGE_TOKEN" \
  ...
```

Do not start with `--net=host`.

Prefer:

- explicit local bridge port
- random high port
- bearer token
- workspace scoping
- method allowlist
- read-only methods first

Treat bridge calls from the sandbox as privileged escape hatches. Gate write/edit/terminal operations carefully.

## Initial JSON-RPC Methods

### `editor/getActiveEditor`

Returns active editor metadata.

```json
{
  "uri": "file:///path/to/file.ts",
  "fileName": "/path/to/file.ts",
  "languageId": "typescript",
  "isDirty": false
}
```

### `editor/getSelection`

Returns selected text and range from the active editor.

```json
{
  "uri": "file:///path/to/file.ts",
  "fileName": "/path/to/file.ts",
  "languageId": "typescript",
  "range": {
    "start": { "line": 10, "character": 2 },
    "end": { "line": 20, "character": 1 }
  },
  "text": "selected text..."
}
```

### `ui/showDiff`

Opens a VS Code diff view.

Inputs:

```json
{
  "originalPath": "/path/to/file.ts",
  "proposedPath": "/tmp/file.proposed.ts",
  "title": "Proposed change"
}
```

Behavior:

```text
Use vscode.diff to show original vs proposed content.
Do not apply changes automatically.
Return only after the diff has been opened.
```

### `diagnostics/getProblems`

Returns VS Code diagnostics for:

- active file
- workspace
- provided file path

Initial input:

```json
{
  "uri": "file:///path/to/file.ts"
}
```

Initial output:

```json
{
  "diagnostics": [
    {
      "severity": "error",
      "message": "Cannot find name 'foo'.",
      "source": "typescript",
      "range": {
        "start": { "line": 12, "character": 8 },
        "end": { "line": 12, "character": 11 }
      }
    }
  ]
}
```

## Later JSON-RPC Methods

### `workspace/readFile`

Read through VS Code’s workspace/file APIs.

### `workspace/applyEdit`

Apply edits through VS Code APIs instead of raw file writes.

### `workspace/saveDocument`

Save an open document through VS Code.

### `terminal/create`

Create or reuse an integrated terminal.

### `terminal/sendText`

Send text to a VS Code integrated terminal.

### `permission/request`

Ask the user for permission via VS Code UI.

Support outcomes:

```text
allow_once
allow_always
deny
```

Persist `allow_always` in VS Code global/workspace state.

## CLI Commands

Initial commands:

```bash
vchb active-editor --json
vchb selection --json
vchb diff <original-path> <proposed-path>
vchb diagnostics [path] --json
```

Future commands:

```bash
vchb apply-edit <edit-json>
vchb save <path>
vchb terminal create [name]
vchb terminal send <command>
vchb permission request <tool-name> <args-json>
```

Example usage from a harness:

```bash
vchb selection --json
```

Example output:

```json
{
  "uri": "file:///Users/mike/src/project/src/foo.ts",
  "fileName": "/Users/mike/src/project/src/foo.ts",
  "languageId": "typescript",
  "range": {
    "start": { "line": 42, "character": 4 },
    "end": { "line": 57, "character": 1 }
  },
  "text": "function selectedThing() {\n  ...\n}"
}
```

Example diff flow:

```bash
cp src/foo.ts /tmp/foo.proposed.ts
# agent modifies /tmp/foo.proposed.ts
vchb diff src/foo.ts /tmp/foo.proposed.ts
```

## OMP / omp-sbx Integration

Do not make OMP speak JSON-RPC first.

First integration path:

```text
OMP runs ordinary shell commands.
vchb CLI handles JSON-RPC.
VS Code extension handles editor APIs.
```

Suggested OMP skill/instructions:

```text
When VS Code bridge is available:

- Use `vchb selection --json` to inspect the current VS Code selection.
- Use `vchb active-editor --json` to inspect the active file.
- Use `vchb diagnostics --json` to inspect current problems.
- Before applying a non-trivial edit, write proposed content to a temp file and run `vchb diff ORIGINAL PROPOSED`.
- Prefer editor-mediated edits once `vchb apply-edit` exists.
```

For `omp-sbx`, pass bridge env vars into the container:

```bash
-e VCHB_BRIDGE_URL=http://host.docker.internal:47321
-e VCHB_BRIDGE_TOKEN=...
```

## POC Milestones

### Milestone 1: Read-only editor context

Build:

- VS Code extension activation
- local JSON-RPC server
- session file
- bearer token check
- `editor/getActiveEditor`
- `editor/getSelection`
- `vchb active-editor --json`
- `vchb selection --json`

Success criteria:

```text
A terminal process can ask VS Code what file and selection the user is looking at.
Works from normal host terminal.
```

### Milestone 2: Diff review

Build:

- `ui/showDiff`
- `vchb diff ORIGINAL PROPOSED`
- temp/proposed file support
- title support

Success criteria:

```text
A terminal agent can propose a changed file and open a native VS Code diff review.
No changes are applied automatically.
```

### Milestone 3: Diagnostics

Build:

- `diagnostics/getProblems`
- `vchb diagnostics --json`
- active-file diagnostics
- workspace diagnostics if practical

Success criteria:

```text
A terminal agent can read VS Code problems for the active file or workspace.
```

### Milestone 4: Docker / omp-sbx

Build/test:

- `host.docker.internal` bridge access
- env var configuration
- token authentication from inside container
- workspace path mapping strategy

Success criteria:

```text
omp-sbx running inside Docker can call `vchb selection --json` and `vchb diff`.
```

### Milestone 5: Editor-mediated edits

Build:

- structured edit format
- `workspace/applyEdit`
- `vchb apply-edit`
- permission prompt before applying
- optional save after apply

Success criteria:

```text
Agent changes can be applied through VS Code rather than raw file writes.
```

### Milestone 6: Permission model

Build:

- `permission/request`
- VS Code prompt UI
- allow once / allow always / deny
- workspace-scoped persistence

Success criteria:

```text
Bridge can gate privileged methods through VS Code prompts.
```

## Security Model

Read-only methods:

```text
editor/getActiveEditor
editor/getSelection
diagnostics/getProblems
```

Privileged methods:

```text
ui/showDiff
workspace/applyEdit
workspace/saveDocument
terminal/create
terminal/sendText
```

Security rules:

- bridge is local only
- every request requires bearer token
- session token is random and per-window/per-workspace
- session can be revoked by stopping bridge
- write/edit methods require permission
- terminal execution requires permission
- sandbox/container access is opt-in via env vars
- workspace root should be included in session metadata
- reject path operations outside workspace unless explicitly allowed

## Open Questions

- HTTP JSON-RPC vs WebSocket JSON-RPC?
- Should `ui/showDiff` accept file paths only, or also inline content?
- Should the CLI be named `vchb`, `harness-bridge`, or both?
- How should host paths map to container paths for `omp-sbx`?
- Should edits be represented as unified diff, whole-file replacement, or VS Code `WorkspaceEdit`-like JSON?
- Should diagnostics default to active file or whole workspace?
- Should the bridge expose MCP later as an optional compatibility layer?
- Can any Copilot-style tracked edit/review UI be accessed through public APIs, or should the project rely on `vscode.diff` plus explicit apply?

## Non-Goals for POC

- Full MCP server
- Full ACP implementation
- New chat UI
- Replacing OMP UI
- Replacing existing agent harnesses
- Cross-editor support
- Remote multi-user bridge
- Automatic unprompted writes
- Arbitrary shell execution through VS Code

## One-Sentence Pitch

`vscode-cli-harness-bridge` lets terminal-native coding agents use VS Code’s active editor, selection, diagnostics, diff views, and edit APIs without giving up their native CLI/TUI workflow.