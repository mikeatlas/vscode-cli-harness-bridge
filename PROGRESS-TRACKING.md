# Progress Tracking — vscode-cli-harness-bridge

Implementation progress against `PLAN.md`.

**Overall: 59%** — Phases 0–3 complete and HITL-validated.

---

## Phases

| Phase | Description | Status | % | Cumulative |
|:-----:|-------------|:------:|:-:|:----------:|
| 0 | Foundation & scaffolding | ✅ done | 15% | 15% |
| 1 | Read-only editor context | ✅ done (HITL ✅) | 20% | 35% |
| 2 | Diff review | ✅ done (HITL ✅) | 12% | 47% |
| 3 | Diagnostics | ✅ done (HITL ✅) | 12% | 59% |
| 4 | Docker / omp-sbx networking | ⬜ not started | 13% | 72% |
| 5 | Permission model | 🔧 in progress | 13% | 85% |
| 6 | Editor-mediated edits | ⬜ not started | 10% | 95% |
| 7 | Terminal hooks (stretch) | ⬜ not started | 3% | 98% |
| 8 | Finalization / HITL QA | ⬜ not started | 2% | 100% |

---

## Test Gates

- [x] `npm run typecheck` green
- [x] `npm test` green — **50 tests** across 9 files
- [x] `npm run build` produces extension + cli bundles
- [x] `.vsix` packages — `packages/extension/vscode-cli-harness-bridge-0.0.2.vsix`
- [x] Phase 1 HITL — `active-editor`, `selection`, `sessions` ✅
- [x] Phase 2 HITL — `vchb diff` opens native diff view ✅
- [x] Phase 3 HITL — `vchb diagnostics` returns VS Code problems ✅
- [ ] Phase 5 HITL — permission prompt modal (once implemented)
- [ ] Phase 4 HITL — sandbox→host bridge (needs networking work)

---

## What's Built (Phases 0–3)

**Methods implemented:**
- `editor/getActiveEditor` — active/last editor metadata
- `editor/getSelection` — active/last selection text + range
- `ui/showDiff` — opens native VS Code diff (original path-guarded, proposed can be temp)
- `diagnostics/getProblems` — file/active/workspace diagnostics

**CLI commands:**
- `vchb active-editor [--json]`
- `vchb selection [--json]`
- `vchb diff <original> <proposed> [--title T]`
- `vchb diagnostics [path] [--all] [--json]`
- `vchb sessions [--json]`

**Tests (50):** protocol (session/methods/multi-root), pathGuard, auth, dispatcher (incl. diff + diagnostics), bridge server (real HTTP round-trip), CLI discovery (multi-session + worktree + multi-root), CLI client (mock bridge), pathMap.

---

## Known Issues

- **`url.parse()` deprecation warning** during `code --install-extension` — from Microsoft's `code` CLI binary.
- **TS errors in project files** — `errors.ts` has `VchbErrorCode`/`VchbErrorName` type issues; `tsconfig.base.json` has deprecated `baseUrl`/`moduleResolution`. Cosmetic, not blocking.
- **Sandbox→host networking** (Phase 4): `host.docker.internal` = `fe80::1`, HTTP proxy in path.
