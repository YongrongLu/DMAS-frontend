import type { PlanSnapshot, ToolEvent } from "./chat-stream";
import { applyPlanSnapshot, applyToolEvent, type ToolActivityState } from "./tool-model";

export const API_BASE = (process.env.NEXT_PUBLIC_DEPARTMENT_API_URL || "http://127.0.0.1:8101").replace(/\/$/, "");
export type FileEntry = { name: string; path: string; kind: "file" | "folder"; size?: number; locked?: boolean; children?: FileEntry[] };
export type Approval = { id: string; run_id: string; task_id: string; kind: "task" | "access" | "deliver"; title: string; text: string; expires_at: number };
export type Task = ToolActivityState & {
  id: string; task_id: string; question: string; started_at: number;
  status: "running" | "waiting" | "success" | "failed" | "declined" | "cancelled";
  content: string; error?: string;
  result?: { summary: string; elapsed_seconds: number; egress: string };
  last_approval?: { kind: Approval["kind"]; decision: string };
};
export type DeviceState = {
  department: { name: string; display_name: string; description: string; device_id: string };
  connection: string; connection_message: string; tasks: Task[]; approvals: Approval[]; files: FileEntry[];
};
export type DeviceEvent =
  | { type: "snapshot"; state: DeviceState }
  | { type: "connection"; connection: string; connection_message: string }
  | { type: "task"; task: Task }
  | { type: "task_patch"; id: string; patch: Partial<Task> }
  | { type: "task_removed"; id: string }
  | { type: "delta"; id: string; delta: { content?: string; tool_event?: ToolEvent; plan?: PlanSnapshot } }
  | { type: "approvals"; approvals: Approval[] }
  | { type: "files"; files: FileEntry[] };

export const initialState: DeviceState = {
  department: { name: "product", display_name: "Product Department", description: "Product performance, pricing & returns", device_id: "pc-product" },
  connection: "disconnected", connection_message: "Waiting for local agent", tasks: [], approvals: [],
  files: [
    { name: "shared", path: "shared", kind: "folder", children: [
      { name: "README.md", path: "shared/README.md", kind: "file" },
      { name: "product_data.csv", path: "shared/product_data.csv", kind: "file" },
    ] },
    { name: "private", path: "private", kind: "folder", locked: true, children: [
      { name: "supplier_costs.csv", path: "private/supplier_costs.csv", kind: "file", locked: true },
    ] },
    { name: "workspace", path: "workspace", kind: "folder", children: [] },
  ],
};

export function reduceEvent(state: DeviceState, event: DeviceEvent): DeviceState {
  switch (event.type) {
    case "snapshot": return event.state;
    case "connection": return { ...state, connection: event.connection, connection_message: event.connection_message };
    case "approvals": return { ...state, approvals: event.approvals };
    case "files": return { ...state, files: event.files };
    case "task_removed": return { ...state, tasks: state.tasks.filter(t => t.id !== event.id) };
    case "task": return { ...state, tasks: [...state.tasks.filter(t => t.id !== event.task.id), event.task] };
    case "task_patch": return { ...state, tasks: state.tasks.map(t => t.id === event.id ? { ...t, ...event.patch } : t) };
    case "delta": return { ...state, tasks: state.tasks.map(task => {
      if (task.id !== event.id) return task;
      let next = { ...task, content: (task.content + (event.delta.content || "")).slice(-160_000) };
      if (event.delta.tool_event) next = applyToolEvent(next, event.delta.tool_event);
      if (event.delta.plan) next = applyPlanSnapshot(next, event.delta.plan);
      return next;
    }) };
    default: return state;
  }
}
