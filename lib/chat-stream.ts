import type { PlanPhase } from "./tool-model";

export type PlanSnapshot = { agent: string; phases: PlanPhase[] };
export type ToolEvent = {
  type: "tool_start" | "tool_end" | "tool_error";
  id: string; name: string; agent: string;
  input?: string; output?: string; error?: string;
  arguments?: Record<string, unknown>; result?: Record<string, unknown>;
};
export type WorkflowEvent = {
  type: "phase" | "department_start" | "department_end";
  department?: string; task_id?: string; status?: string;
};
