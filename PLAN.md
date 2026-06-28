# PLAN — vscode-cli-harness-bridge

Implementation plan derived from `SPEC.md`. This document is the build contract for an
orchestrator that will delegate the work. It resolves the SPEC's open questions, fixes the
tech stack, defines the repo layout and cross-cutting contracts, then decomposes the work
into dependency-ordered phases with explicit acceptance criteria and tests.

**Nothing here is implemented yet.** This is the plan only.

---

## 1. Goal (restated)

A VS Code extension + small CLI (`vchb`) that lets terminal-native agent harnesses
(`omp`, `omp-sbx`, generic agents) read editor context (active editor, selection,
diagnostics), open native diff reviews, apply editor-mediated edits, and run gated
terminal/permission operations — over a localhost, token-authenticated JSON-RPC bridge.
The harness keeps its native TUI; VS Code is a tool provider, not the driver.

Non-goals stay exactly as in SPEC §"Non-Goals for POC" (no MCP server, no ACP, no chat UI,
no cross-editor, no remote multi-user, no unprompted writes, no arbitrary shell exec).

---

## 2. Decisions (resolving SPEC "Open Questions")

These are fixed for the POC. Each cites the SPEC open question it answers.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | HTTP vs WebSocket JSON-RPC | **HTTP `POST /rpc`** | Stateless, `curl`-debuggable, no client lib. Permission prompts and `showDiff` work as long-lived blocking requests; no server→client push needed in POC. WebSocket left as a future transport behind the same dispatcher. |
| 2 | `showDiff`: paths only or inline | **Paths first**; `proposedContent` inline field added in Phase 6 (edits) | Matches CLI `vchb diff ORIGINAL PROPOSED` flow; inline content is a small additive field later. |
| 3 | CLI name: `vchb` / `harness-bridge` / both | **`vchb` primary, `vscode-cli-harness-bridge` long alias** | Both bins point at one entry. Short for ergonomics, long for discoverability. |
| 4 | Host→container path mapping | **Identity mapping by default** (omp-sbx bind-mounts the host path at the *same* path in the container); **optional `VCHB_PATH_MAP=<containerRoot>=<hostRoot>`** override for non-identity mounts | Verified in this repo's sbx: the workspace is virtiofs-bind-mounted at the identical absolute path, so no rewrite is needed. Keep the explicit override for generic harnesses that mount at `/work`. See §6. |
| 5 | Edit representation | **Structured JSON `WorkspaceEdit`-like** (range edits) **+ whole-file replacement** variant | Maps 1:1 to `vscode.WorkspaceEdit`; whole-file covers the common "agent rewrote the file" case. No unified-diff parsing in the bridge. |
| 6 | Diagnostics default scope | **Active file by default**; `--workspace` / `--uri <path>` flags widen | Cheapest useful default; workspace scan is opt-in. |
| 7 | MCP later? | **Out of scope**, but dispatcher is transport- and surface-agnostic so an MCP adapter can wrap the same handlers later | Keeps the seam without paying for it now. |
| 8 | Copilot tracked-edit UI via public API? | **No.** Rely on `vscode.diff` + explicit `workspace/applyEdit` | Tracked-edit UI is not public API; do not depend on it. |
| 9 | Which VS Code window does a terminal control when several are open? | **Workspace-root matching**, computed from the terminal's `cwd` resolved through git worktree (`repo@worktree`), matched against each session file's recorded workspace root; `VCHB_WORKSPACE`/`--workspace`/explicit `VCHB_BRIDGE_URL` override | The harness already names worktrees `repo@worktree`; the bridge must pick the session whose workspace root contains (or equals) the agent's cwd, not a global singleton. See §5a. |

### Tech stack (portability + debuggability priority)

- **Language:** TypeScript for all three packages. One toolchain, shared types, no
  Python/Node split.
- **Extension runtime:** VS Code extension host (Node). `vscode` engine pinned; target a
  conservative `engines.vscode` (e.g. `^1.85.0`, confirmed during Phase 0).
- **CLI runtime:** Node ≥ 18 (global `fetch`, no HTTP client dep). Shipped as a **single
  esbuild bundle** (`dist/vchb.cjs`) with a shebang so it runs in minimal containers
  (`node dist/vchb.cjs` or via `bin`). No runtime `node_modules` required at the call site.
- **Validation:** `zod` in `protocol` for runtime request/response schemas; TS types are
  `z.infer`. Single source of truth shared by extension + CLI.
- **Build:** `npm workspaces` (ships with Node, max portability) + `esbuild` (extension
  bundle + CLI bundle) + `tsc --noEmit` for typecheck.
- **Test:** `vitest` for unit/integration of `protocol`, `cli`, and the vscode-free
  extension core; `@vscode/test-electron` for real extension integration tests.
- **Lint/format:** `eslint` + `prettier` (or `biome` — decide in Phase 0, pick one).
- **Packaging:** `@vscode/vsce` for the `.vsix`.

---

## 3. Repository layout

```text
vscode-cli-harness-bridge/
  package.json                  # npm workspaces root, shared scripts
  tsconfig.base.json
  .eslintrc / .prettierrc
  .github/workflows/ci.yml
  PLAN.md  SPEC.md  README.md  LICENSE  .gitignore

  packages/
    protocol/                   # pure, no vscode/http deps
      src/
        jsonrpc.ts              # JSON-RPC 2.0 envelope types + error codes
        methods.ts             # method name constants + param/result zod schemas
        session.ts             # session-file schema
        errors.ts              # custom error codes/enum
        index.ts
      test/

    extension/
      src/
        extension.ts           # activate/deactivate
        bridge/
          server.ts            # http server, 127.0.0.1, POST /rpc, GET /health
          auth.ts              # bearer token middleware (constant-time compare)
          dispatcher.ts        # method routing, allowlist, permission gate (vscode-free)
          pathGuard.ts         # workspace-scope path validation (vscode-free)
        adapter/
          vscodeAdapter.ts     # ONLY module importing `vscode`
          adapter.types.ts     # EditorAdapter interface (so dispatcher is testable)
        session/
          sessionManager.ts    # write/refresh/delete session file atomically
        permission/
          permissionStore.ts   # allow_always persistence (global/workspace state)
          permissionPrompt.ts  # vscode modal UI
        ui/
          statusBar.ts         # status item + commands (restart, copy env)
          log.ts               # output channel logger
      test/                    # vitest (core) + integration/ (@vscode/test-electron)
      package.json             # contributes: commands, settings, activation events

    cli/
      src/
        index.ts               # arg parse + command dispatch
        discovery.ts           # env vars → session file → workspace match
        client.ts              # JSON-RPC over fetch, timeouts, error mapping
        pathMap.ts             # container→host path rewriting
        commands/
          activeEditor.ts selection.ts diff.ts diagnostics.ts
          applyEdit.ts save.ts terminal.ts permission.ts   # later phases
        output.ts              # compact JSON / human format, exit codes
      test/
      package.json             # bin: { vchb, vscode-cli-harness-bridge }

  examples/
    omp/                       # OMP skill/instructions
    omp-sbx/                   # docker host.docker.internal usage notes
    generic-agent/             # minimal bash integration example
```

---

## 4. JSON-RPC surface (full target)

Read-only (no permission, allowlisted by default):
- `editor/getActiveEditor`
- `editor/getSelection`
- `diagnostics/getProblems`

Privileged (gated by permission model; see §5/Phase 5):
- `ui/showDiff`
- `workspace/readFile`, `workspace/applyEdit`, `workspace/saveDocument`
- `terminal/create`, `terminal/sendText`
- `permission/request` (the prompt mechanism itself)

Infra (no auth): `GET /health` → `{ ok, version }` only (no token, no workspace leak).

All method param/result shapes live in `protocol/src/methods.ts` as zod schemas matching
the SPEC examples (§"Initial JSON-RPC Methods", §"Later JSON-RPC Methods"). Positions are
0-based `{ line, character }` to mirror VS Code.

---

## 5. Cross-cutting contracts (must hold in every phase)

**Security (SPEC §"Security Model"):**
- Bind `127.0.0.1` only (configurable bind address, default loopback). Never `0.0.0.0`,
  never `--net=host`.
- Every `/rpc` request requires `Authorization: Bearer <token>`; constant-time compare;
  reject with JSON-RPC error + HTTP 401.
- Token is random (≥ 32 bytes, base64url), per window/workspace, regenerated each
  activation. Session file is `0600`.
- Method allowlist enforced in dispatcher; unknown/unlisted method → `METHOD_NOT_ALLOWED`.
- Path operations validated against workspace root; reject paths outside root unless an
  explicit allow flag is set (`workspace.allowOutsideRoot`, default false).
- Write/edit/terminal methods require the permission gate (Phase 5).
- Stopping the bridge revokes the session (file deleted, server closed).

**Error model:** standard JSON-RPC codes (-32600/-32601/-32602/-32603/-32700) plus a custom
range in `protocol/src/errors.ts`: `AUTH_REQUIRED`, `FORBIDDEN_PATH`, `NO_ACTIVE_EDITOR`,
`PERMISSION_DENIED`, `METHOD_NOT_ALLOWED`, `BRIDGE_UNAVAILABLE`. CLI maps these to distinct
nonzero exit codes and human-readable stderr; `--json` keeps machine output on stdout.

**Session discovery & targeting (CLI) — see §5a for the full algorithm:** resolve in order:
(1) explicit `VCHB_BRIDGE_URL`/`VCHB_BRIDGE_TOKEN` env → use directly;
(2) `--workspace` flag or `VCHB_WORKSPACE` env → match the session whose recorded workspace
root equals/contains it;
(3) otherwise derive the agent's workspace root from `cwd` (resolving git worktrees, the
`repo@worktree` convention) and match against session files;
(4) if exactly one session exists, use it;
(5) else fail `BRIDGE_UNAVAILABLE` with an actionable message listing the candidate
workspaces and how to disambiguate. **Never silently pick a window when several match.**

**Long-lived requests:** `ui/showDiff`, `workspace/applyEdit`, and `permission/request`
block until the UI resolves. Server uses no hard request timeout for these (or a long one);
CLI uses a generous, overridable timeout (`VCHB_TIMEOUT_MS`).

**Logging/debug:** extension logs to an Output channel; CLI honors `VCHB_DEBUG=1` to print
the resolved bridge URL, method, and raw payloads to stderr.

---

## 5a. Multi-window session targeting (which VS Code does the terminal control?)

**Problem (raised during review):** the user routinely has several projects open in several
VS Code windows, each running its own bridge + session file. A sandboxed TUI in a terminal
must deterministically reach the *correct* window — not a global singleton, not the
first-found session.

**Grounding from this repo's dogfood environment** (verified, not assumed):
- The agent runs inside an omp-sbx Docker container; the workspace is **bind-mounted at the
  identical absolute path** (`/Users/mikeatlas/.../vscode-cli-harness-bridge`), confirmed via
  `mount` (virtiofs). So container cwd == host workspace path → matching is direct.
- The harness already uses git worktrees named `repo@worktree` (confirmed:
  `git worktree list` shows `omp-vscode@vscode-driver`). Each worktree is its own workspace
  root and should map to its own VS Code window/session.
- `WORKSPACE_DIR` env is injected by the harness and equals the workspace root — a reliable
  primary signal.

**Targeting algorithm (CLI `discovery.ts`), in priority order:**
1. `VCHB_BRIDGE_URL` (+ `VCHB_BRIDGE_TOKEN`) set → use directly, skip all matching.
2. `--workspace <path>` flag, else `VCHB_WORKSPACE`, else `WORKSPACE_DIR`, else `cwd`.
3. Normalize that path to a **canonical workspace root**: resolve symlinks, then
   `git rev-parse --show-toplevel` so any subdirectory of a repo/worktree maps to the root.
   Worktrees resolve to the worktree's own toplevel (not the main repo), so `repo@worktree`
   windows stay distinct.
4. Enumerate all session files in `~/.vscode-cli-harness-bridge/sessions/`; for each, read
   the recorded **host** workspace root. Apply the path map (§6) so a container path compares
   correctly against the host-recorded root (identity in omp-sbx).
5. Select the session whose workspace root **equals** the resolved root; if none equal,
   select the session whose root is the **nearest ancestor** of the resolved path.
6. Zero matches → `BRIDGE_UNAVAILABLE` ("no VS Code window for `<root>`; open it or set
   `VCHB_BRIDGE_URL`"). Multiple equal matches (shouldn't happen — one session per
   workspace) → list candidates and require `--workspace`/`VCHB_BRIDGE_URL`.

**Extension side (must support the above):**
- Session filename is a hash of the **canonical workspace root** (post-symlink, worktree
  toplevel), so one file per window and worktrees never collide.
- Session file records the canonical host workspace root (and, for multi-root workspaces,
  the list of roots — match if the resolved path is under any).
- A `vchb sessions --json` CLI command lists discoverable sessions (workspace root, url,
  pid, age) so a human/agent can see exactly which windows are reachable and debug
  mis-targeting. Add this in Phase 1.
- Stale session files (dead pid / unreachable `/health`) are ignored during matching and
  pruned, so a crashed window never shadows a live one.

This is exercised explicitly in the Phase 1 tests (multi-session fixtures: two workspace
roots + two worktrees of the same repo, assert each cwd resolves to the right session) and
in the Phase 8 dogfood QA.

---


## 6. Docker / omp-sbx networking & path mapping (resolves Decision #4)

**Networking reality in this repo's omp-sbx sandbox (verified, not assumed):**
- `host.docker.internal` resolves to **`fe80::1`** (link-local IPv6), and
  `gateway.docker.internal` to a `fd7a:…` ULA. An HTTP bridge bound to IPv4
  `127.0.0.1` on the host is **not** reachable at `fe80::1` as-is — the SPEC's
  `http://host.docker.internal:<port>` assumption must be validated, not trusted. Phase 4
  MUST determine the actually-routable host address from inside the sandbox and document it
  (candidates: `host.docker.internal` if Docker maps it to the host gateway, the
  `gateway.docker.internal` IPv4/ULA, or an explicit `--add-host`/published port). The
  session file's `dockerBridge` value MUST be whatever is empirically reachable here.
- An **HTTP proxy is active**: `HTTP(S)_PROXY=http://gateway.docker.internal:3128`, and
  `NO_PROXY=localhost,127.0.0.1,::1,gateway.docker.internal` — note `host.docker.internal`
  is **not** in `NO_PROXY`. Bridge requests to the host would be sent **through the proxy**
  and likely fail. The CLI MUST bypass the proxy for the bridge host: add the resolved
  bridge host to the no-proxy set itself (the CLI's `fetch` client constructs requests
  without honoring ambient proxy env, or explicitly excludes the bridge host). Phase 4 tests
  this explicitly.

**Path mapping reality:** omp-sbx **bind-mounts the workspace at the identical absolute
host path** inside the container (verified via `mount`: virtiofs bind of
`/Users/mikeatlas/.../vscode-cli-harness-bridge` at the same path). Therefore:
- **Default path mapping is identity** — no rewrite needed; container paths already equal
  host paths. The CLI MUST detect this (mount path == host workspace root) and skip mapping.
- `VCHB_PATH_MAP=<containerRoot>=<hostRoot>` remains an **optional override** for generic
  harnesses that mount elsewhere (e.g. `/work=/Users/mike/src/...`). When set, `pathMap.ts`
  rewrites path args (`diff`, `diagnostics <path>`, `apply-edit`, `save`) container→host
  before send and reverse-maps host paths in responses for display.

**Session file fields:** extension writes `bridge` (`http://127.0.0.1:<port>`),
`dockerBridge` (the empirically-reachable host URL from above), the canonical **host**
workspace root(s), `token`, `pid`, `createdAt`, and bridge `version`.

**Document the requirements:** the container mount target and any `VCHB_PATH_MAP` must agree;
the resolved workspace root must match a live VS Code window (§5a); and proxy bypass for the
bridge host is mandatory in proxied sandboxes like this one.

---

## 7. Phased work breakdown

Phases are ordered by dependency. **Deliberate deviation from SPEC milestone numbering:**
the **Permission model (SPEC M6) is pulled before Editor-mediated edits (SPEC M5)** because
edits must be permission-gated (SPEC M5 success criteria itself requires a prompt). Docker
(M4) depends only on M1 and may run in parallel with M2/M3.

Each phase lists: **Tasks**, **Deliverables**, **Tests**, **Acceptance (done when)**,
**Depends on**. Subagents implementing a phase MUST NOT run repo-wide lint/format/build
gates — the orchestrator runs those once across the union of changes.

### Phase 0 — Foundation & scaffolding
**Depends on:** nothing.
**Tasks:**
- Init npm workspaces root, `tsconfig.base.json`, eslint/prettier (pick one formatter),
  `.gitignore`, MIT `LICENSE`.
- Scaffold `protocol`, `extension`, `cli` packages with build (esbuild) + typecheck +
  vitest wired. CLI emits a runnable `dist/vchb.cjs` stub.
- `protocol`: JSON-RPC envelope types, error codes, session schema, and **method schemas
  for all read-only methods** (param/result zod). Export inferred types.
- Extension `bridge/` skeleton: http server on `127.0.0.1:0` (random free port),
  `POST /rpc` JSON-RPC framing, `GET /health`, bearer-auth middleware, dispatcher with
  allowlist + an `EditorAdapter` interface (handlers call the interface, **not** `vscode`).
- `SessionManager`: atomic `0600` write to `~/.vscode-cli-harness-bridge/sessions/<hash>.json`,
  refresh on activate, delete on deactivate; stale-file cleanup.
- CI skeleton: install → typecheck → lint → unit tests.
**Tests:** vitest against the real http server with a **fake `EditorAdapter`**: auth
accept/reject, JSON-RPC framing + malformed payloads, allowlist rejection, health endpoint,
session file write/format/permissions, path-guard unit tests.
**Acceptance:** `npm run build && npm test` green; a fake-adapter server answers an
authenticated `/rpc` round-trip; session file matches `protocol` schema. No `vscode` import
outside `adapter/`.

### Phase 1 — Read-only editor context (SPEC Milestone 1)
**Depends on:** Phase 0.
**Tasks:**
- Implement `vscodeAdapter.ts` for `editor/getActiveEditor` and `editor/getSelection`
  (uri, fileName, languageId, isDirty, range, text), returning `NO_ACTIVE_EDITOR` when none.
- `extension.ts` activation: start bridge, write session keyed by **canonical workspace
  root** (§5a), status bar item (port + "copy env vars" + "restart bridge" commands),
  Output-channel logging.
- CLI: `discovery.ts` implementing the full §5a targeting algorithm (env → workspace flag →
  `WORKSPACE_DIR` → cwd; canonicalize via symlink-resolve + `git rev-parse --show-toplevel`
  so worktrees resolve to their own toplevel; match recorded workspace root; nearest-ancestor
  fallback; prune stale sessions via `/health`). `client.ts`, `output.ts`.
- CLI commands: `active-editor`, `selection` (with `--json`, default compact JSON,
  exit-code mapping) and **`sessions [--json]`** (lists discoverable windows: workspace root,
  url, pid, age, reachable?) for debugging mis-targeting. Wire both bins.
**Tests:** CLI unit tests against a **mock bridge** (discovery precedence, error/exit-code
mapping, output shape). **Multi-session targeting tests (fixtures):** several session files
for distinct workspace roots **and two worktrees of the same repo** (`repo@worktree`); assert
each cwd resolves to the correct session, ancestor fallback works, ambiguity/zero-match
errors fire, and stale (dead `/health`) sessions are skipped. **`@vscode/test-electron`
integration:** launch VS Code, open a fixture file, set a selection, hit the live bridge over
HTTP, assert active-editor + selection payloads.
**Acceptance (SPEC M1):** from a host terminal, `vchb selection --json` and
`vchb active-editor --json` return what the user is looking at in the **correct** VS Code
window; `vchb sessions` lists the reachable windows.

### Phase 2 — Diff review (SPEC Milestone 2)
**Depends on:** Phase 1. **Parallel with:** Phase 3.
**Tasks:**
- `protocol` schema for `ui/showDiff` (originalPath, proposedPath, title).
- Adapter: open `vscode.diff` (original vs proposed), return after opened, **apply nothing**.
- Path-guard the inputs. CLI `diff <original> <proposed> [--title]`.
- (`ui/showDiff` is privileged — until Phase 5 lands, gate it behind a temporary
  config-flag allow so it's usable; final gating wired in Phase 5.)
**Tests:** CLI mock-bridge test for arg→params + path mapping. Integration: invoke
`ui/showDiff` and assert a diff editor/tab opened (via `vscode.window.tabGroups`).
**Acceptance (SPEC M2):** terminal agent opens a native diff review for a proposed file;
no changes applied automatically.

### Phase 3 — Diagnostics (SPEC Milestone 3)
**Depends on:** Phase 1. **Parallel with:** Phase 2.
**Tasks:**
- `protocol` schema for `diagnostics/getProblems` (input `uri?`; output diagnostics with
  severity/message/source/range).
- Adapter: active-file diagnostics by default; `uri` for a specific file; `--workspace`
  aggregates `vscode.languages.getDiagnostics()`.
- CLI `diagnostics [path] [--workspace] --json`.
**Tests:** mapping of `vscode.Diagnostic` → schema (severity enum, ranges); CLI mock-bridge
tests. Integration: open a file with a known error fixture, assert it appears.
**Acceptance (SPEC M3):** terminal agent reads VS Code problems for active file or workspace.

### Phase 4 — Docker / omp-sbx (SPEC Milestone 4)
**Depends on:** Phase 1 (works without M2/M3). **Parallel with:** Phase 2/3.
**Tasks:**
- **Empirically determine the routable host address from inside omp-sbx** (§6): test
  `host.docker.internal` (resolves to `fe80::1` here), `gateway.docker.internal`, and any
  published port; record the working one. Extension writes that as `dockerBridge`.
- **Proxy bypass:** the CLI client MUST NOT route bridge requests through
  `HTTP(S)_PROXY` (this sandbox sets `gateway.docker.internal:3128` and omits
  `host.docker.internal` from `NO_PROXY`). Build the `fetch` client to ignore ambient proxy
  env for the bridge host (or extend the no-proxy set internally).
- **Identity path mapping default:** detect when the container workspace path equals the
  host workspace root (omp-sbx virtiofs bind) and **skip rewriting**. `pathMap.ts` applies
  `VCHB_PATH_MAP` only when set (non-identity mounts); reverse-map host paths in output.
- Extension setting to enable advertising the docker bridge; confirm canonical host
  workspace root(s) recorded in the session (feeds §5a matching from the container).
- `examples/omp-sbx/`: real `docker run`/sbx env (`VCHB_BRIDGE_URL`, `VCHB_BRIDGE_TOKEN`,
  optional `VCHB_PATH_MAP`) + the reachability/proxy notes verified above.
- Repeatable e2e check script: run the CLI bundle inside the sandbox against the host bridge.
**Tests:** unit tests for `pathMap` (identity no-op, forward/reverse, nested paths) and for
the proxy-bypass client logic (bridge host excluded from proxy). e2e sandbox script
documented; runnable manually (needs Docker/sbx + a live VS Code window — see §9a HITL).
**Acceptance (SPEC M4):** `omp-sbx` in Docker calls `vchb selection --json` and `vchb diff`
against the host bridge with token auth, proxy bypass, and correct (identity-or-mapped)
paths. **This is the project's own dogfood path (§9b).**

### Phase 5 — Permission model (SPEC Milestone 6, pulled earlier)
**Depends on:** Phase 1. **Blocks:** Phase 6, Phase 7.
**Tasks:**
- `protocol` schema for `permission/request` (tool name, args) → outcome
  `allow_once | allow_always | deny`.
- `permissionPrompt.ts`: VS Code modal with the three outcomes.
- `permissionStore.ts`: persist `allow_always` in workspace state (and a global opt-in),
  keyed by method + scope; revocation command.
- Dispatcher **permission gate**: every privileged method checks store → if unknown, prompt;
  `deny` → `PERMISSION_DENIED`. Replace Phase 2's temporary `showDiff` flag with the gate.
- CLI `permission request <tool> <args-json>` (mainly for testing/inspection).
**Tests:** gate unit tests with a fake prompt (allow_once not persisted; allow_always
persisted + skips next prompt; deny → error). Integration: privileged call triggers a
modal; persisted decision skips re-prompt.
**Acceptance (SPEC M6):** bridge gates privileged methods through VS Code prompts with
once/always/deny and workspace-scoped persistence.

### Phase 6 — Editor-mediated edits (SPEC Milestone 5)
**Depends on:** Phase 5 (gate) and Phase 2 (diff for review-before-apply).
**Tasks:**
- `protocol` schemas: `workspace/readFile`, `workspace/applyEdit`
  (WorkspaceEdit-like range edits **and** whole-file replacement variant),
  `workspace/saveDocument`. Add optional inline `proposedContent` to `ui/showDiff`.
- Adapter: `vscode.workspace.applyEdit`/`fs`/`save`, path-guarded, **permission-gated**,
  optional save-after-apply.
- CLI `apply-edit <edit-json>`, `save <path>`.
**Tests:** edit-shape validation; adapter applies a range edit and a whole-file replace;
permission denial blocks apply; optional save. Integration: apply an edit through VS Code,
assert document buffer changed (not a raw write), then save.
**Acceptance (SPEC M5):** agent changes apply through VS Code (gated, optionally saved),
not raw file writes.

### Phase 7 — Terminal hooks (SPEC "Later JSON-RPC Methods", stretch-in-scope)
**Depends on:** Phase 5.
**Tasks:**
- `protocol` schemas: `terminal/create` (name, reuse), `terminal/sendText` (text, enter?).
- Adapter: create/reuse integrated terminal; send text; **permission-gated**.
- CLI `terminal create [name]`, `terminal send <command>`.
**Tests:** mock-bridge CLI tests; integration: terminal created/reused, text delivered.
**Acceptance:** agent can create/reuse a VS Code terminal and send text, gated by permission.
NEVER provide arbitrary unprompted shell exec (SPEC non-goal).

### Phase 8 — Finalization
**Depends on:** the feature phases targeted for release (min: 1–5; ideally 1–7).
**Tasks:**
- `examples/omp/`: skill/instructions text from SPEC §"OMP / omp-sbx Integration".
- `examples/generic-agent/`: minimal bash integration calling `vchb selection --json` + diff.
- `README.md`: install, build, run, session/env, security, troubleshooting; link examples.
- Package `.vsix` via `@vscode/vsce`; document install + CLI distribution (bundled
  `vchb.cjs`, `npm i -g`, and copy-into-container).
- CI: add extension integration job (`xvfb-run` on Linux), vsix package artifact.
- Security pass against SPEC §"Security Model" checklist; end-to-end **human-in-the-loop**
  QA across Phases 1–7 on host **and** in `omp-sbx` (§9a checklist).
- **Dogfood (§9b):** run the bridge against *this very repo's* VS Code window and drive it
  from the omp-sbx agent that is developing the project; capture the results.
**Acceptance:** all targeted milestones demonstrably pass on host and in Docker (with a
human confirming the interactive UI affordances per §9a); `.vsix` builds; docs let a new
user reproduce the flows; security checklist satisfied; dogfood run documented.

---

## 8. Dependency graph (for orchestration / parallelization)

```text
Phase 0  ──┬─> Phase 1 ──┬─> Phase 2 ─┐
           │             ├─> Phase 3 ─┤
           │             ├─> Phase 4 ─┤
           │             └─> Phase 5 ──┬─> Phase 6 ─┤
           │                           └─> Phase 7 ─┤
           └──────────────────────────────────────> Phase 8
```

Parallelizable waves after Phase 1 lands:
- **Wave A (parallel):** Phase 2 (diff), Phase 3 (diagnostics), Phase 4 (docker), Phase 5
  (permission). Phases 2/3/4 touch mostly disjoint files; coordinate on shared edits to
  `protocol/methods.ts`, `dispatcher.ts`, and `cli/index.ts` (each adds an isolated method
  + command; conflicts are additive).
- **Wave B:** Phase 6 and Phase 7 (both need Phase 5; Phase 6 also needs Phase 2).
- **Wave C:** Phase 8 (after targeted phases complete).

Shared-contract files that multiple phases append to (flag for the orchestrator to serialize
or carefully merge): `packages/protocol/src/methods.ts`, `extension/src/bridge/dispatcher.ts`,
`extension/src/adapter/vscodeAdapter.ts`, `cli/src/index.ts`.

---

## 9. Definition of Done (overall)

- All targeted milestones meet their SPEC success criteria, verified on host **and** in
  `omp-sbx`/Docker (Phase 4 path).
- Security checklist (SPEC §"Security Model") satisfied: loopback bind, bearer auth,
  per-window random token, `0600` session file, allowlist, path-scope enforcement,
  permission-gated writes/terminal, revocation on stop.
- vscode-free core has unit coverage; real flows have `@vscode/test-electron` integration
  coverage; CLI has mock-bridge coverage. CI green (typecheck, lint, unit, extension tests).
- `.vsix` packages; CLI bundle runs standalone in a container; README + examples reproduce
  every shipped flow.
- No stubs/TODO-as-delivered in shipped phases; non-goals respected.

---

## 9a. Human-in-the-loop (HITL) verification

Several deliverables are **interactive VS Code UI** and cannot be fully proven by automated
tests — a human must observe them. The orchestrator MUST treat these as explicit gates, not
optional. `@vscode/test-electron` covers the programmatic path (a tab opened, a buffer
changed, an edit applied); a human confirms the *experience*.

**Why a human is required:**
- `ui/showDiff` — automated tests can assert a diff tab exists; only a human confirms the
  diff renders the intended original-vs-proposed content readably.
- `permission/request` — the modal, its three buttons, and that `allow_always` actually
  suppresses the next prompt are UX behaviors best confirmed live.
- `workspace/applyEdit` / `terminal/*` — a human confirms edits land in the right place and
  terminal text appears in the right integrated terminal.
- Cross-window targeting (§5a) — a human with **multiple windows open** confirms the CLI
  reaches the intended window.

**HITL checklist (run during Phase 8, and ad-hoc when a phase lands an interactive method):**
1. Install the `.vsix` in a real VS Code; open this repo. Confirm the status bar item shows
   the bridge port; "copy env vars" yields working `VCHB_*` values.
2. Host terminal: `vchb active-editor`/`selection`/`diagnostics` reflect the focused editor.
3. Open **two** windows (two repos, and two `repo@worktree` worktrees); confirm `vchb
   sessions` lists both and each cwd targets the right one.
4. `vchb diff` opens a correct, readable native diff; nothing is auto-applied.
5. Privileged call raises the permission modal; `allow_once` vs `allow_always` vs `deny`
   behave correctly across repeat calls.
6. `vchb apply-edit` changes the editor buffer (dirty, not a silent disk write); optional
   save works. `vchb terminal send` lands in the integrated terminal.
7. Repeat the read/diff/edit flow **from inside omp-sbx** (§9b).

The orchestrator should pause and request the human (the user) to perform/confirm these,
capturing pass/fail notes. **Do not mark Phase 8 done on automated tests alone.**

## 9b. Dogfooding this project with omp-sbx

This repo is itself the ideal test bed and SHOULD be used to validate Phase 1/2/3/4 end to
end (grounded in the verified environment, §5a/§6):
- The developing agent runs in **omp-sbx inside Docker**; the workspace
  (`/Users/mikeatlas/.../vscode-cli-harness-bridge`) is bind-mounted at the **identical path**,
  so path mapping is identity.
- A human opens this repo in VS Code (host) with the extension installed → a bridge + session
  for this workspace exists.
- From the omp-sbx agent terminal, after Phase 4's networking is solved (routable host
  address + proxy bypass, §6), run `vchb selection --json`, `vchb active-editor --json`,
  `vchb diagnostics --json`, and `vchb diff` against this very window.

**Caveat:** until Phase 4 resolves host reachability, the sandbox→host bridge call is not yet
functional here (`host.docker.internal` = `fe80::1`, proxy in path). The earliest dogfood
that works without that is **host-terminal** usage (a non-sandboxed terminal in the same VS
Code window). Plan to validate host-terminal first (Phase 1), then sandbox (Phase 4).

---

## 10. Risks & mitigations

- **`@vscode/test-electron` flakiness/CI setup** → isolate vscode-free core for fast unit
  tests; keep electron tests focused on the thin adapter; `xvfb-run` on Linux CI.
- **Path mapping mismatches (Docker)** → make mapping explicit (`VCHB_PATH_MAP`), validate
  + log resolved paths under `VCHB_DEBUG`, document mount/workspace agreement.
- **Multiple VS Code windows / worktrees → wrong window controlled** → canonical
  workspace-root matching with worktree resolution (§5a), `VCHB_WORKSPACE`/`--workspace`/
  `VCHB_BRIDGE_URL` overrides, `vchb sessions` for visibility, clear error on
  zero/ambiguous match. **Never silently pick a window.**
- **Sandbox→host networking** (verified gotchas, §6): `host.docker.internal` is link-local
  IPv6 (`fe80::1`) and an HTTP proxy is in path with `host.docker.internal` absent from
  `NO_PROXY` → Phase 4 must empirically find a routable host address and force proxy bypass
  for the bridge host, else all sandbox bridge calls silently fail.
- **Interactive UI unverifiable by CI** → explicit HITL gates (§9a); electron tests cover
  the programmatic path, a human confirms the experience.
- **Permission UX vs blocking CLI** → long/again-no timeout on prompt requests server-side;
  generous overridable CLI timeout; clear `PERMISSION_DENIED` exit code.
- **Token/session leakage** → `0600` files, no secrets in `/health`, never log tokens,
  delete session on deactivate, regenerate token per activation.
- **`engines.vscode` / API drift** → pin a conservative minimum in Phase 0; only use stable
  public APIs (no Copilot tracked-edit internals — Decision #8).
