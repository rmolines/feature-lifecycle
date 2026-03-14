---
description: Open the cockpit — unified workspace viewer
---

Open the workspace dashboard in the browser via the workspace server.

Parse $ARGUMENTS:
- No arguments or `--refresh`: `open http://localhost:3333/cockpit`
- `--mission <id>`: `open http://localhost:3333/mission-view?m=<id>`

The server runs on port 3333 and auto-refreshes via watcher — no explicit refresh needed.

After running, confirm to the user that the cockpit was opened.
