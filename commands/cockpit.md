---
description: Open the cockpit — unified workspace viewer
---

Open the workspace dashboard in the browser via the workspace server.

First, ensure the workspace server is running:
```bash
bash ~/git/launchpad/scripts/ensure-server.sh
```

Parse $ARGUMENTS:
- No arguments or `--refresh`: `open http://localhost:3333/cockpit`
- `--mission <id>`: `open http://localhost:3333/mission-view?m=<id>`

After running, confirm to the user that the cockpit was opened.
