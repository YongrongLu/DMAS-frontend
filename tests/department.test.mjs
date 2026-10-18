import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const temporary = await mkdtemp(join(tmpdir(), "relay-client-test-"));
for (const name of ["tool-model", "department"]) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  await writeFile(join(temporary, `${name}.mjs`), compiled.replace('from "./tool-model"', 'from "./tool-model.mjs"'));
}
const { initialState, reduceEvent } = await import(join(temporary, "department.mjs"));
const task = (id = "run-1") => ({ id, task_id: "t1", question: "Analyze", status: "running", content: "", tools: [], plans: {}, departmentTasks: {} });

test("streamed edit_plan updates its existing checklist, not a second card", () => {
  let state = reduceEvent(initialState, { type: "task", task: task() });
  const event = (type, id, name, fields) => ({ type: "delta", id: "run-1", delta: { tool_event: { type, id, name, agent: "product", ...fields } } });
  state = reduceEvent(state, event("tool_start", "make", "make_plan", { arguments: { phases: [{ id: "p1", title: "Read", status: "pending" }] } }));
  state = reduceEvent(state, event("tool_end", "make", "make_plan", { result: { plan: [{ id: "p1", title: "Read", status: "pending" }] } }));
  state = reduceEvent(state, event("tool_start", "edit", "edit_plan", { arguments: { updates: [{ id: "p1", status: "done" }] } }));
  state = reduceEvent(state, event("tool_end", "edit", "edit_plan", { result: { plan: [{ id: "p1", title: "Read", status: "done" }] } }));
  assert.equal(state.tasks[0].plans.product[0].status, "done");
  assert.equal(state.tasks[0].tools.length, 2);
});

test("reconnection snapshot replaces partial tokens and retains the pending approval", () => {
  let state = reduceEvent(initialState, { type: "task", task: task() });
  state = reduceEvent(state, { type: "delta", id: "run-1", delta: { content: "partial" } });
  const approval = { id: "exact-request", run_id: "run-1", task_id: "t1", kind: "deliver" };
  const snapshot = { ...initialState, tasks: [{ ...task(), content: "complete conclusion", status: "waiting" }], approvals: [approval] };
  state = reduceEvent(state, { type: "snapshot", state: snapshot });
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].content, "complete conclusion");
  assert.equal(state.approvals[0].id, "exact-request");
});

test("two simultaneous tasks with the same human-facing ID remain separate", () => {
  let state = reduceEvent(initialState, { type: "task", task: task("one") });
  state = reduceEvent(state, { type: "task", task: task("two") });
  state = reduceEvent(state, { type: "delta", id: "two", delta: { content: "Only two" } });
  state = reduceEvent(state, { type: "task_patch", id: "one", patch: { status: "cancelled" } });
  assert.equal(state.tasks[0].content, "");
  assert.equal(state.tasks[0].status, "cancelled");
  assert.equal(state.tasks[1].content, "Only two");
  assert.equal(state.tasks[1].status, "running");
});
