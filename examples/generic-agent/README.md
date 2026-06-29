# Generic Agent Integration

A minimal example of using vchb from any shell-based agent:

```bash
# Check if bridge is available
vchb sessions

# Get current selection as JSON
SELECTION=$(vchb selection --json)

# Get diagnostics for the active file
vchb diagnostics --json

# Propose a change via diff
cp src/foo.ts /tmp/foo.proposed.ts
# ... modify /tmp/foo.proposed.ts ...
vchb diff src/foo.ts /tmp/foo.proposed.ts --title "Proposed change"

# Apply an edit through VS Code (triggers permission prompt)
vchb apply-edit src/foo.ts --whole-file "// new content"

# Read a file through VS Code
vchb read-file src/foo.ts --json
```
