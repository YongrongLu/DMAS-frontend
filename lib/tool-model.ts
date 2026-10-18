import type { PlanSnapshot, ToolEvent, WorkflowEvent } from "./chat-stream";

export type ToolStatus = "running" | "complete" | "error" | "stopped";
export type ToolCall = Omit<ToolEvent, "type"> & { status: ToolStatus };
export type PlanPhase = { id: string; title: string; status: "pending" | "in_progress" | "done" };
export type DepartmentTask = { department: string; status: "running" | "success" | "failed" | "stopped" };
export type ToolActivityState = {
  tools: ToolCall[];
  plans: Record<string, PlanPhase[]>;
  departmentTasks: Record<string, DepartmentTask>;
};

export const PLAN_TOOLS = new Set(["make_plan", "edit_plan", "delete_plan"]);
const PLAN_MUTATIONS = new Set([...PLAN_TOOLS, "end_orchestration"]);

export function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function arrayValue(value: unknown): unknown[] {
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value : [];
}

export const toolArguments = (tool: ToolCall) => objectValue(tool.arguments ?? tool.input);
export const toolResult = (tool: ToolCall) => objectValue(tool.result ?? tool.output);
export const textValue = (value: unknown) => typeof value === "string" ? value : "";

export function readPlan(value: unknown): PlanPhase[] | null {
  if (!Array.isArray(value)) return null;
  const phases: PlanPhase[] = [];
  for (const item of value) {
    const phase = objectValue(item);
    if (typeof phase.id !== "string" || typeof phase.title !== "string"
      || !["pending", "in_progress", "done"].includes(String(phase.status))) return null;
    phases.push(phase as PlanPhase);
  }
  return phases;
}

function planAfterTool(tool: ToolCall, current?: PlanPhase[]): PlanPhase[] | undefined {
  if (tool.status !== "complete" || !PLAN_MUTATIONS.has(tool.name)) return undefined;
  const result = toolResult(tool);
  if (result.status === "error") return undefined;
  const snapshot = readPlan(result.plan);
  if (snapshot) return snapshot;

  // Older servers only sent a text preview. A successful control tool still
  // confirms its mutation, even if that preview is missing or truncated.
  const args = toolArguments(tool);
  if (tool.name === "end_orchestration") {
    return current?.map((phase) => ({ ...phase, status: "done" }));
  }
  if (tool.name === "make_plan") {
    const phases = arrayValue(args.phases).map((value) => ({ status: "pending", ...objectValue(value) }));
    return phases.length ? readPlan(phases) ?? undefined : undefined;
  }
  if (!current) return undefined;
  if (tool.name === "delete_plan") {
    if (args.delete_all === true) return [];
    const id = textValue(args.phase_id).trim();
    return id ? current.filter((phase) => phase.id !== id) : undefined;
  }
  const updates = arrayValue(args.updates).map(objectValue);
  const next = current.map((phase) => ({ ...phase }));
  for (const update of updates) {
    const phase = next.find(({ id }) => id === textValue(update.id).trim());
    if (!phase) return undefined;
    if (update.status != null) {
      if (!["pending", "in_progress", "done"].includes(String(update.status))) return undefined;
      phase.status = update.status as PlanPhase["status"];
    }
    const title = textValue(update.title).trim();
    if (title) phase.title = title;
  }
  return updates.length ? next : undefined;
}

export function planForDisplay(agent: string, phases: PlanPhase[] | undefined, tools: ToolCall[]) {
  // Reconcile messages already in memory when the UI hot-reloads. Successful
  // end_orchestration marks this agent's plan done in the backend contract.
  const lastMutation = [...tools].reverse().find((tool) => tool.agent === agent && PLAN_MUTATIONS.has(tool.name));
  return lastMutation?.name === "end_orchestration"
    ? planAfterTool(lastMutation, phases) ?? phases : phases;
}

export function applyToolEvent<T extends ToolActivityState>(state: T, event: ToolEvent): T {
  const { type, ...payload } = event;
  const status: ToolStatus = type === "tool_start" ? "running" : type === "tool_end" ? "complete" : "error";
  const existing = state.tools.find(({ id }) => id === payload.id);
  const tool = { ...existing, ...payload, status };
  const tools = existing ? state.tools.map((item) => item.id === tool.id ? tool : item) : [...state.tools, tool];
  let plans = state.plans;
  if (type === "tool_end") {
    const snapshot = planAfterTool(tool, plans[tool.agent]);
    if (snapshot) plans = { ...plans, [tool.agent]: snapshot };
  }
  return { ...state, tools, plans };
}

export function applyPlanSnapshot<T extends ToolActivityState>(state: T, snapshot: PlanSnapshot): T {
  const phases = readPlan(snapshot.phases);
  return phases ? { ...state, plans: { ...state.plans, [snapshot.agent]: phases } } : state;
}

export function applyDepartmentEvent<T extends ToolActivityState>(state: T, event: WorkflowEvent): T {
  if (!event.task_id || !event.department || event.type === "phase") return state;
  const status = event.type === "department_start" ? "running" : event.status === "success" ? "success" : "failed";
  return { ...state, departmentTasks: { ...state.departmentTasks, [event.task_id]: { department: event.department, status } } };
}

export function terminalResult(tool: ToolCall) {
  const result = toolResult(tool);
  if (typeof result.exit_code === "number") return {
    exitCode: result.exit_code, stdout: textValue(result.stdout), stderr: textValue(result.stderr),
  };
  const text = tool.output ?? "";
  const match = text.match(/^exit code (-?\d+)(?:\n|$)/);
  const sections = match ? text.slice(match[0].length).split(/(?:^|\n)(stdout|stderr):\n/) : [];
  const streams: Record<string, string> = {};
  for (let i = 1; i < sections.length - 1; i += 2) streams[sections[i]] = sections[i + 1];
  return {
    exitCode: match ? Number(match[1]) : null,
    stdout: streams.stdout ?? (match || tool.status === "error" ? "" : text),
    stderr: streams.stderr ?? (!match && tool.status === "error" ? text : ""),
  };
}

export function toolError(tool: ToolCall): string {
  return textValue(objectValue(tool.error).message) || tool.error || (tool.status === "error" ? "Tool execution failed." : "");
}
