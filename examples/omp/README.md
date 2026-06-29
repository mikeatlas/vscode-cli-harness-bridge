# OMP Integration

When the VS Code bridge is available (check with `vchb sessions`):

- Use `vchb selection --json` to inspect the current VS Code selection
- Use `vchb active-editor --json` to inspect the active file
- Use `vchb diagnostics --json` to inspect current problems
- Use `vchb diagnostics --all --json` for workspace-wide diagnostics
- Before applying a non-trivial edit, write proposed content to a temp file and run `vchb diff ORIGINAL PROPOSED`
- Use `vchb apply-edit` to apply changes through VS Code (permission-gated)
- Use `vchb read-file` to read files through VS Code's workspace APIs
- Use `vchb save` to save documents through VS Code
- Use `vchb terminal create` / `vchb terminal send` to interact with VS Code's integrated terminal
