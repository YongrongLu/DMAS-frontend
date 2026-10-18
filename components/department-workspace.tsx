"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowRight, Bell, Box, Check, ChevronRight, CircleAlert,
  FileCode2, FileSpreadsheet, FileText, Folder, Hash, LoaderCircle,
  LockKeyhole, Monitor, Network, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { API_BASE, initialState, reduceEvent, type Approval, type DeviceEvent, type FileEntry, type Task } from "@/lib/department";
import { startBackgroundWindowDrag, WindowResizeHandles } from "./desktop-window";
import { ToolActivity } from "./tool-activity";

function useDepartment() {
  const [state, setState] = useState(initialState);
  const [transport, setTransport] = useState<"connecting" | "live" | "offline">("connecting");
  const [received, setReceived] = useState(false);
  useEffect(() => {
    const source = new EventSource(`${API_BASE}/api/department/events`);
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as DeviceEvent;
        setState(current => reduceEvent(current, event));
        setReceived(true);
        setTransport("live");
      } catch { setTransport("offline"); }
    };
    source.onerror = () => setTransport("offline");
    return () => source.close();
  }, []);
  const decide = useCallback(async (approval: Approval, approved: boolean) => {
    const response = await fetch(`${API_BASE}/api/department/approvals/${encodeURIComponent(approval.id)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      if (response.status === 409) {
        const snapshot = await fetch(`${API_BASE}/api/department`, { signal: AbortSignal.timeout(5000) });
        if (snapshot.ok) setState(await snapshot.json());
      }
      throw new Error(response.status === 409 ? "This request has expired or was already answered." : "Could not save your decision. Try again.");
    }
    setState(current => ({ ...current, approvals: current.approvals.filter(item => item.id !== approval.id) }));
  }, []);
  return { state, transport, received, decide };
}

function sizeLabel(size?: number) {
  if (size === undefined) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function FileTree({ entries, depth = 0 }: { entries: FileEntry[]; depth?: number }) {
  return <ul className={`file-tree ${depth === 0 ? "file-roots" : ""}`}>
    {entries.map(entry => <li key={entry.path}>
      <div className={`file-row ${entry.kind === "folder" ? "folder-row" : ""} ${entry.locked ? "file-locked" : ""}`} title={entry.path}>
        {entry.kind === "folder" ? <ChevronRight className="folder-chevron" size={11} /> : <span className="file-indent" />}
        {entry.kind === "folder" ? <Folder size={14} /> : entry.name.endsWith(".csv") ? <FileSpreadsheet size={13} /> : entry.name.endsWith(".py") ? <FileCode2 size={13} /> : <FileText size={13} />}
        <span>{entry.name}</span>{entry.locked && entry.kind === "folder" ? <LockKeyhole size={10} /> : <small>{sizeLabel(entry.size)}</small>}
      </div>
      {entry.children && <FileTree entries={entry.children} depth={depth + 1} />}
      {entry.kind === "folder" && !entry.children?.length && <span className="empty-folder">No files yet</span>}
    </li>)}
  </ul>;
}

const approvalLabels = {
  task: { eyebrow: "Incoming task", heading: "Allow this task to run?", action: "Approve task", deny: "Decline task", note: "The agent will work with data on this device." },
  access: { eyebrow: "Restricted access", heading: "Open private data?", action: "Allow for this task", deny: "Keep private", note: "Access applies to this task only. Raw data stays on this device." },
  deliver: { eyebrow: "Outbound review", heading: "Share this conclusion?", action: "Approve & send", deny: "Withhold result", note: "Review the exact conclusion before it goes to the coordinator." },
};

function ApprovalDialog({ approval, online, onDismiss, onDecide }: {
  approval: Approval; online: boolean; onDismiss: () => void; onDecide: (approval: Approval, approved: boolean) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil(approval.expires_at - Date.now() / 1000)));
  const labels = approvalLabels[approval.kind];
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil(approval.expires_at - Date.now() / 1000))), 1000);
    return () => { clearInterval(timer); element?.close(); };
  }, [approval.expires_at]);
  async function decide(approved: boolean) {
    setBusy(true); setError("");
    try { await onDecide(approval, approved); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to save this decision."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="approval-dialog" aria-labelledby="approval-title" aria-describedby="approval-note" onCancel={onDismiss}>
    <div className="dialog-top"><span className="approval-symbol"><ShieldCheck size={22} /></span><button className="icon-button" aria-label="Review later" onClick={onDismiss}><X size={17} /></button></div>
    <span className="eyebrow">{labels.eyebrow}</span>
    <h2 id="approval-title">{labels.heading}</h2>
    <p id="approval-note" className="dialog-note">{labels.note}</p>
    <div className="approval-meta"><span><Monitor size={12} />Device owner approval</span><code>{approval.task_id}</code></div>
    <div className="approval-body"><Markdown remarkPlugins={[remarkGfm]}>{approval.text}</Markdown></div>
    {error && <p className="decision-error" role="alert"><CircleAlert size={13} />{error}</p>}
    {!online && <p className="decision-error" role="status">Connection lost. Decisions will be available when the local agent reconnects.</p>}
    <div className="dialog-bottom"><span className="approval-time">{seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} remaining` : "Request expired"}</span>
      <div><button className="button-secondary" disabled={busy || !online || seconds === 0} onClick={() => void decide(false)}>{labels.deny}</button>
        <button className="button-primary" disabled={busy || !online || seconds === 0} onClick={() => void decide(true)}>{busy ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}{labels.action}</button></div>
    </div>
  </dialog>;
}

function TaskFeed({ task, department, approval, onReview }: { task: Task; department: string; approval?: Approval; onReview: () => void }) {
  const active = task.status === "running" || task.status === "waiting";
  const status = { running: "Working", waiting: "Needs approval", success: "Sent to coordinator", declined: "Declined", failed: "Failed", cancelled: "Disconnected" }[task.status];
  return <article className="task-feed">
    <div className="request-heading"><span className="coordinator-avatar"><Network size={15} /></span><strong>Coordinator</strong><span className="message-label">Task request</span><code>{task.task_id}</code></div>
    <div className="request-content">{task.question}</div>
    <div className="agent-heading"><span className="department-mark"><Box size={16} /></span><strong>{department}</strong><span className={`task-status task-${task.status}`}>{active && task.status === "running" ? <LoaderCircle size={11} className="spin" /> : task.status === "success" ? <Check size={11} /> : task.status === "waiting" ? <ShieldCheck size={11} /> : null}{status}</span></div>
    {approval && <button className="approval-inline" onClick={onReview}><span className="approval-inline-icon"><ShieldCheck size={17} /></span><span><strong>{approvalLabels[approval.kind].heading}</strong><small>{approvalLabels[approval.kind].eyebrow} · Your decision is required</small></span><ArrowRight size={15} /></button>}
    {task.tools.length > 0 && <ToolActivity {...task} active={active} />}
    {task.content && <div className={`markdown-content ${task.status === "running" ? "is-streaming" : ""}`}><Markdown remarkPlugins={[remarkGfm]}>{task.content}</Markdown></div>}
    {task.result && <div className={`delivery-note ${task.status === "declined" ? "withheld-note" : ""}`}>
      {task.status === "success" ? <ShieldCheck size={13} /> : <CircleAlert size={13} />}<span>{task.status === "success" ? "Owner approved · Conclusion shared" : task.result.summary}</span>
      <small>{task.result.elapsed_seconds}s</small>
    </div>}
    {task.error && <p className="decision-error" role="alert">{task.error}</p>}
    {!task.content && !task.tools.length && !approval && active && <div className="working-note"><LoaderCircle size={13} className="spin" />Preparing local analysis…</div>}
    {!active && task.last_approval?.decision === "expired" && <p className="working-note">The approval request timed out and was declined.</p>}
  </article>;
}

export function DepartmentWorkspace() {
  const { state, transport, received, decide } = useDepartment();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [fileRefresh, setFileRefresh] = useState(false);
  const [fileError, setFileError] = useState("");
  const [filesOverride, setFilesOverride] = useState<{ base: FileEntry[]; entries: FileEntry[] } | null>(null);
  const [follow, setFollow] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const online = transport === "live" && state.connection === "connected";
  const pending = state.approvals[0];
  const currentApproval = state.approvals.find(item => item.id === selectedApproval) ?? pending;
  const department = state.department.name.charAt(0).toUpperCase() + state.department.name.slice(1);
  const connectionLabel = online ? "Connected" : transport === "connecting" ? "Connecting" : transport === "live" ? state.connection === "rejected" ? "Registration rejected" : "Coordinator offline" : "Offline";
  function reviewApproval(id?: string) {
    setSelectedApproval(id ?? pending?.id ?? null);
    setDismissed(null);
  }
  useEffect(() => {
    if (follow && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [state.tasks, follow]);
  async function refreshFiles() {
    setFileRefresh(true); setFileError("");
    try {
      const response = await fetch(`${API_BASE}/api/department/files`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      setFilesOverride({ base: state.files, entries: await response.json() });
    } catch { setFileError("Could not refresh files."); }
    finally { setFileRefresh(false); }
  }
  // Live file snapshots take priority; a manual refresh is useful between tasks.
  const files = filesOverride?.base === state.files ? filesOverride.entries : state.files;
  return <main className="desktop-shell" data-window-drag-region onPointerDown={startBackgroundWindowDrag}>
    <WindowResizeHandles />
    <div className="workspace-layout" data-window-drag-region>
      <aside className="channel-sidebar" aria-label="Channels and device" data-window-drag-region>
        <div className="sidebar-drag-region" aria-hidden="true" data-window-drag-handle />
        <div className="sidebar-label">Channels</div>
        <div className="channel-item selected" aria-current="page"><Hash size={15} /><span>retail-rescue</span></div>
        <div className="sidebar-bottom">
          <div className="device-owner"><Monitor size={15} /><div><strong>{department}</strong><span>{state.department.device_id}</span></div></div>
          <div className="device-connection" title={state.connection_message}><span className={`owner-status ${online ? "is-online" : ""}`} />{connectionLabel}</div>
          {state.connection === "rejected" && transport === "live" && <p className="connection-error" role="alert">{state.connection_message}</p>}
        </div>
      </aside>
      <section className="stream-panel" aria-label="Department stream" data-window-drag-region>
        <div className="stream-scroll" data-window-drag-region ref={scroll} onScroll={() => { const el = scroll.current; if (el) setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}>
          {state.tasks.length > 0 && <div className="task-list" data-window-drag-region>{state.tasks.map(task => <TaskFeed key={task.id} task={task} department={department} approval={state.approvals.find(item => item.run_id === task.id)} onReview={() => reviewApproval(state.approvals.find(item => item.run_id === task.id)?.id)} />)}</div>}
        </div>
        {(!follow || state.approvals.length > 0) && <div className="stream-actions">
          {!follow && state.tasks.length > 0 && <button className="jump-latest" onClick={() => setFollow(true)}><ArrowDown size={12} />Latest activity</button>}
          {state.approvals.length > 0 && <button className="review-pill" onClick={() => reviewApproval()}><Bell size={12} />Review {state.approvals.length}</button>}
        </div>}
      </section>
      <aside className="files-sidebar" aria-label="Local files" data-window-drag-region><header data-window-drag-handle><span><Folder size={15} />Files</span><button className="icon-button" aria-label="Refresh files" title="Refresh local files" disabled={fileRefresh || transport !== "live"} onClick={() => void refreshFiles()}><RefreshCw size={13} className={fileRefresh ? "spin" : ""} /></button></header>
        <div className="files-caption"><Monitor size={11} /><span>On this device</span><small>{received ? transport === "live" ? "Live" : "Cached" : "Preview"}</small></div>
        <div className="file-tree-scroll" data-window-drag-region><FileTree entries={files} />{fileError && <p className="files-error" role="alert">{fileError}</p>}</div>
      </aside>
    </div>
    {currentApproval && currentApproval.id !== dismissed && <ApprovalDialog key={currentApproval.id} approval={currentApproval} online={online} onDismiss={() => setDismissed(currentApproval.id)} onDecide={decide} />}
  </main>;
}
