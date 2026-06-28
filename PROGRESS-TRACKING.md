# Progress Tracking — vscode-cli-harness-bridge

Implementation progress against `PLAN.md`.

**Overall: 95%** — Phases 0–7 complete (HITL validated for 1–5; 6–7 pending HITL).

---

## Phases

| Phase | Description | Status | % | Cumulative |
|:-----:|-------------|:------:|:-:|:----------:|
| 0 | Foundation & scaffolding | ✅ done | 15% | 15% |
| 1 | Read-only editor context | ✅ done (HITL ✅) | 20% | 35% |
| 2 | Diff review | ✅ done (HITL ✅) | 12% | 47% |
| 3 | Diagnostics | ✅ done (HITL ✅) | 12% | 59% |
| 4 | Docker / omp-sbx networking | ⬜ not started | 13% | 72% |
| 5 | Permission model | ✅ done (HITL ✅) | 13% | 85% |
| 6 | Editor-mediated edits | ✅ done (pending HITL) | 10% | 95% |
| 7 | Terminal hooks | ✅ done (pending HITL) | 3% | 98% |
| 8 | Finalization / HITL QA | ⬜ not started | 2% | 100% |

---

## Test Gates

- [x] `npm run typecheck` green
- [x] `npm test` green — **53 tests** across 9 files
- [x] `npm run build` produces extension + cli bundles
- [x] `.vsix` packages — `packages/extension/vscode-cli-harness-bridge-0.0.2.vsix`
- [x] Phase 1 HITL — `active-editor`, `selection`, `sessions` ✅
- [x] Phase 2 HITL — `vchb diff` opens native diff view ✅
- [x] Phase 3 HITL — `vchb diagnostics` returns VS Code problems ✅
- [x] Phase 5 HITL — permission prompt modal + allow_always persistence ✅
- [ ] Phase 6 HITL — `vchb apply-edit` / `read-file` / `save`
- [ ] Phase 7 HITL — `vchb terminal create` / `send`
- [ ] Phase 4 HITL — sandbox→host bridge (needs networking work)

---

## HITL Test Checklist (Phases 6 + 7)

> Reinstall + reload first.

```bash
code --install-extension packages/extension/vscode-cli-harness-bridge-0.0.2.vsix --force
# Developer: Reload Window
```

### Phase 6 — Editor-mediated edits

```bash
# Read a file through VS Code
node packages/cli/dist/index.js read-file PLAN.md --json

# Apply a whole-file edit (will prompt for permission)
node packages/cli/dist/index.js apply-edit PLAN.md --whole-file "# replaced content"

# Save a document
node packages/cli/dist/index.js save PLAN.md --json
```

### Phase 7 — Terminal hooks

```bash
# Create a terminal (will prompt for permission)
node packages/cli/dist/index.js terminal create "VCHB Test"

# Send text to it
node packages/cli/dist/index.js terminal send "echo hello"
```

---

## What's Built (Phases 0–7)

**Methods implemented:**
- `editor/getActiveEditor`, `editor/getSelection` — read-only editor context
- `ui/showDiff` — native VS Code diff view
- `diagnostics/getProblems` — file/active/workspace diagnostics
- `permission/request` — allow_once/allow_always/deny with workspace-state persistence
- `workspace/readFile`, `workspace/applyEdit`, `workspace/saveDocument` — editor-mediated edits (permission-gated)
- `terminal/create`, `terminal/sendText` — integrated terminal hooks (permission-gated)

**CLI commands:**
- `vchb active-editor`, `selection`, `diagnostics`, `diff`, `sessions`
- `vchb permission <method> [desc]`
- `vchb read-file <path>`, `apply-edit <path> [--whole-file <content>] [<edit-json>]`, `save <path>`
- `vchb terminal create [name] [--reuse]`, `terminal send <text> [--id N] [--no-newline]`

**Tests (53):** protocol, pathGuard, auth, dispatcher (all methods), bridge server, CLI discovery, CLI client, pathMap.

---

## Remaining Work

- **Phase 4** (Docker networking): sandbox→host bridge access. Verified gotchas: `host.docker.internal` = `fe80::1`, HTTP proxy bypass needed.
- **Phase 8** (Finalization): README, examples, CI, security pass, full HITL QA.
