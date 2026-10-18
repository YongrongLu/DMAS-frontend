# Relay · Department client

A Next.js + Tauri workspace for a single department computer. All interface text is English.

The left sidebar has one coordinator channel and the local department identity. The center receives live model output and tool cards. The right sidebar lists the local shared, private and workspace files. File contents are viewed through tool activity, not a file browser.

## Run

On the department computer, start the local agent service from the backend repository:

```bash
cd /Users/shenweizhang/Desktop/distributed-mas-demo
.venv/bin/python -m server.department --department product --port 8101
```

This replaces `python -m distributed.agent --department product` for this computer. Stop that older agent before starting this one: the coordinator accepts one device per department. Keep the coordinator running separately.

For a remote coordinator over Tailscale:

```bash
.venv/bin/python -m server.department --department product --hub ws://YOUR_COORDINATOR_TAILSCALE_IP:8800 --port 8101
```

Change `--department` to `sales` or `customer` on the other machines; use `--data-dir` for a custom department directory and `--id` for a custom device name. Device identity and files come from the service, so the frontend code is identical across computers.

Start the desktop window:

```bash
cd /Users/shenweizhang/Desktop/Distributed-MAS-Frontend-Client
npm run desktop:dev
```

Or use `npm run dev -- --port 3001` for a browser preview. `npm run build` exports static assets to `out/` for Tauri. The client defaults to the loopback service `http://127.0.0.1:8101`; set `NEXT_PUBLIC_DEPARTMENT_API_URL` in `.env.local` before starting/building to change it.

## Owner approvals

The client asks before running a task, granting access to `private/`, and sharing the egress-checked conclusion. Each action answers one server-generated approval ID. Closing a dialog leaves it pending; Review reopens it. A timeout denies the request. Losing the hub cancels the task and its pending approval. Losing the UI connection preserves the pending request until its timeout, and SSE reconnects with an authoritative snapshot.

No raw file or tool output is sent to the coordinator. The local HTTP service binds to loopback only. The file tree lists names and sizes and does not follow symlinks. Before the service connects, the tree is explicitly marked **Preview** and contains example Product filenames.

## Verify

```bash
npm run lint
npm test
npm run build
```
