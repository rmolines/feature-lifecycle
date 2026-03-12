---
description: Open the cockpit — unified workspace viewer
---

Run the cockpit script to open the workspace dashboard in the browser.

```bash
bash ~/git/launchpad/scripts/cockpit.sh $ARGUMENTS
```

Supported arguments (passed via $ARGUMENTS):
- `--project <alias>` — filter by project (e.g. `--project fl`)
- No arguments — show all projects

After running, confirm to the user that the cockpit was opened.
