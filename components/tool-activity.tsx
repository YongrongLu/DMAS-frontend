"use client";

import { useState, type ReactNode } from "react";
import {
  ArrowRight, BookOpen, Check, ChevronDown, Circle, CircleAlert, FileCode2,
  FileSearch, FileText, FolderSearch, GitBranch, ListChecks, LoaderCircle,
  PencilLine, Send, Terminal, Wrench, X,
  type LucideIcon,
} from "lucide-react";
import {
  PLAN_TOOLS, arrayValue, objectValue, planForDisplay, readPlan, terminalResult, textValue,
  toolArguments, toolError, toolResult,
  type DepartmentTask, type PlanPhase, type ToolActivityState, type ToolCall, type ToolStatus,
} from "@/lib/tool-model";

function StatusPill({ status, label }: { status: ToolStatus; label?: string }) {
  return <span className={`tool-status-pill status-${status}`}>
    {status === "running" ? <LoaderCircle size={10} className="spin" /> : status === "complete" ? <Check size={10} /> : status === "error" ? <CircleAlert size={10} /> : <span className="status-dot" />}
    {label ?? { running: "Running", complete: "Done", error: "Failed", stopped: "Stopped" }[status]}
  </span>;
}

function ToolPanel({ tool, title, icon: Icon, children, kind, label }: {
  tool: ToolCall; title: string; icon: LucideIcon; children?: ReactNode; kind: string; label?: string;
}) {
  return <article className={`tool-panel tool-panel-${kind}`} data-tool={tool.name} data-status={tool.status} aria-label={title}>
    <header className="tool-panel-heading">
      <span className="tool-panel-title"><Icon size={13} /><span>{title}</span></span>
      <StatusPill status={tool.status} label={label} />
    </header>
    {children && <div className="tool-panel-content">{children}</div>}
    {toolError(tool) && <div className="tool-inline-error"><CircleAlert size={12} /><span>{toolError(tool)}</span></div>}
  </article>;
}

function CodePreview({ text, numbered = false, start = 1, tone = "" }: { text: string; numbered?: boolean; start?: number; tone?: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.replace(/\n$/, "").split("\n");
  const visible = expanded ? lines : lines.slice(0, 9);
  return <div className={`tool-code ${tone}`}>
    <pre>{visible.map((line, index) => {
      const numberedLine = numbered ? line.match(/^\s*(\d+)\t(.*)$/) : null;
      return <span className="tool-code-line" key={index}>
        {numbered && <span className="code-line-number">{numberedLine?.[1] ?? start + index}</span>}
        <code>{numberedLine?.[2] ?? (line || " ")}</code>
      </span>;
    })}</pre>
    {lines.length > 9 && <button className="tool-expand" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
      {expanded ? "Show less" : `Show ${lines.length - 9} more lines`}<ChevronDown size={11} className={expanded ? "is-expanded" : ""} />
    </button>}
  </div>;
}

function PlanCard({ agent, phases, tools, active }: { agent: string; phases?: PlanPhase[]; tools: ToolCall[]; active: boolean }) {
  const latest = tools.at(-1);
  const pending = latest?.status === "running";
  const preview = latest?.name === "make_plan" ? readPlan(arrayValue(toolArguments(latest).phases)) : null;
  const rows = phases ?? (pending ? preview : null) ?? [];
  const done = rows.filter(({ status }) => status === "done").length;
  const error = latest ? toolError(latest) : "";
  return <article className="tool-panel plan-panel" data-tool="plan" aria-label={`${agent === "orchestrator" ? "" : `${agent} `}Plan`}>
    <header className="tool-panel-heading">
      <span className="tool-panel-title"><ListChecks size={14} /><span>{agent === "orchestrator" ? "Plan" : `${agent} plan`}</span></span>
      {pending ? <StatusPill status="running" label={latest.name === "make_plan" ? "Planning" : "Updating"} />
        : <span className="plan-count">{done}<span> / {rows.length}</span></span>}
    </header>
    {rows.length > 0 ? <>
      <div className="plan-progress" role="progressbar" aria-label="Plan progress" aria-valuenow={done} aria-valuemin={0} aria-valuemax={rows.length}>
        <span style={{ width: `${done / rows.length * 100}%` }} />
      </div>
      <ol className="plan-steps" aria-label="Plan steps">
        {rows.map((phase, index) => <li key={phase.id} className={`plan-step step-${phase.status}`} data-step={phase.id} data-status={phase.status}>
          <span className="plan-step-marker">{phase.status === "done" ? <Check size={11} strokeWidth={2.5} />
            : phase.status === "in_progress" && active ? <LoaderCircle size={13} className="spin" /> : <span>{index + 1}</span>}</span>
          <span className="plan-step-text">{phase.title}
            {phase.status === "in_progress" && <small>{active ? "In progress" : "Not finished"}</small>}
          </span>
          <span className="sr-only">{phase.status === "done" ? "Complete" : phase.status === "pending" ? "Pending" : "In progress"}</span>
        </li>)}
      </ol>
    </> : <p className="tool-empty">{pending ? "Putting the steps together…" : error ? "The plan could not be updated." : "Plan cleared."}</p>}
    {error && <div className="tool-inline-error"><CircleAlert size={12} /><span>{error}</span></div>}
  </article>;
}

function DispatchCard({ tool, tasks }: { tool: ToolCall; tasks: Record<string, DepartmentTask> }) {
  const requested = arrayValue(toolArguments(tool).tasks).map(objectValue);
  const assigned = arrayValue(toolResult(tool).tasks).map(objectValue);
  const rows = assigned.length ? assigned : requested;
  return <ToolPanel tool={tool} title="Team dispatch" icon={GitBranch} kind="dispatch" label={tool.status === "complete" ? "Dispatched" : undefined}>
    <div className="dispatch-list">{rows.map((task, index) => {
      const department = textValue(task.department);
      const progress = tasks[textValue(task.task_id)];
      const request = requested.find((item) => item.department === department);
      const state = progress?.status ?? (tool.status === "error" ? "failed" : tool.status === "stopped" ? "stopped" : "queued");
      return <div className={`dispatch-task dispatch-${state}`} key={textValue(task.task_id) || `${department}-${index}`}>
        <span className="department-avatar">{department.slice(0, 1).toUpperCase() || "A"}</span>
        <div className="dispatch-task-body"><strong>{department || "Department"}</strong><p>{textValue(request?.question ?? task.question)}</p>
          {textValue(task.device_id) && <small>{textValue(task.device_id)}</small>}
        </div>
        <span className="dispatch-task-state" title={state} aria-label={state}>
          {state === "running" ? <LoaderCircle size={12} className="spin" /> : state === "success" ? <Check size={12} /> : state === "failed" ? <CircleAlert size={12} /> : state === "stopped" ? <X size={12} /> : <Circle size={8} />}
        </span>
      </div>;
    })}</div>
    {!rows.length && <p className="tool-empty">Assigning department tasks…</p>}
  </ToolPanel>;
}

function FilePath({ path, detail }: { path: string; detail?: string }) {
  return <div className="tool-file-path"><FileText size={12} /><span title={path}>{path || "Workspace file"}</span>{detail && <small>{detail}</small>}</div>;
}

function FileCard({ tool }: { tool: ToolCall }) {
  const args = toolArguments(tool);
  const path = textValue(args.path);
  const reading = tool.name === "view_file";
  const replacing = tool.name === "str_replace";
  const output = tool.output ?? "";
  const header = reading ? output.match(/^(.+?) lines (\d+)-(\d+) of (\d+)[^\n]*\n?/) : null;
  const content = reading ? tool.status === "error" && !header ? "" : output.slice(header?.[0].length ?? 0) : textValue(args.content);
  const title = reading ? "Read file" : replacing ? "Edit file" : "Write file";
  const oldText = textValue(args.old_str), newText = textValue(args.new_str);
  return <ToolPanel tool={tool} title={title} icon={reading ? FileCode2 : PencilLine} kind="file">
    <FilePath path={path} detail={header ? `${header[2]}–${header[3]} / ${header[4]}` : undefined} />
    {replacing ? <div className="tool-diff" aria-label="File changes">
      <div className="diff-stat"><span>−{oldText.split("\n").length}</span><span>+{newText.split("\n").length}</span><small>{args.replace_all ? "All occurrences" : "Single replacement"}</small></div>
      <div className="diff-block diff-removed"><span aria-label="Removed">−</span><CodePreview text={oldText} /></div>
      <div className="diff-block diff-added"><span aria-label="Added">+</span><CodePreview text={newText} /></div>
    </div> : content ? <CodePreview text={content} numbered start={Number(args.offset) || 1} />
      : tool.status === "running" && <p className="tool-empty">{reading ? "Reading file…" : "Writing file…"}</p>}
    {!reading && tool.status === "complete" && output && <p className="file-result"><Check size={11} />{output}</p>}
  </ToolPanel>;
}

function SearchCard({ tool }: { tool: ToolCall }) {
  const args = toolArguments(tool);
  const grep = tool.name === "grep_tool";
  const lines = (tool.output ?? "").split("\n").filter(Boolean);
  const matches = lines.filter((line) => grep ? /^.+:\d+:/.test(line) : /\([\d,]+ bytes\)$/.test(line));
  return <ToolPanel tool={tool} title={grep ? "Search contents" : "Find files"} icon={grep ? FileSearch : FolderSearch} kind="search">
    <div className="search-query"><span>{textValue(args.pattern) || "*"}</span><small>in {textValue(args.path) || "."}</small></div>
    {matches.length > 0 ? <div className="search-results" aria-label={grep ? "Matching lines" : "Matching files"}>
      {matches.map((line, index) => {
        const match = grep ? line.match(/^(.+?):(\d+):\s?(.*)$/) : line.match(/^(.+?)\s+\(([\d,]+) bytes\)$/);
        return <div className="search-result" key={index}>
          <div><FileText size={11} /><span title={match?.[1]}>{match?.[1]}</span><small>{grep ? `L${match?.[2]}` : `${match?.[2]} B`}</small></div>
          {grep && <code>{match?.[3]}</code>}
        </div>;
      })}
    </div> : tool.status !== "error" && <p className="tool-empty">{tool.status === "running" ? "Searching workspace…" : lines.join("\n") || "No results."}</p>}
    {matches.length > 0 && <div className="tool-result-count">{matches.length} {grep ? "matching lines" : "files"}{lines.some((line) => line.includes("stopped at") || line.endsWith("…")) ? " · preview" : ""}</div>}
  </ToolPanel>;
}

function TerminalCard({ tool }: { tool: ToolCall }) {
  const args = toolArguments(tool);
  const result = terminalResult(tool);
  return <ToolPanel tool={tool} title="Terminal" icon={Terminal} kind="terminal"
    label={result.exitCode !== null ? `Exit ${result.exitCode}` : undefined}>
    <div className="terminal-command"><span>$</span><code>{textValue(args.command) || tool.input}</code></div>
    {result.stdout && <CodePreview text={result.stdout} tone="terminal-stdout" />}
    {result.stderr && <div className="terminal-stderr"><span className="terminal-stream-label">stderr</span><CodePreview text={result.stderr} /></div>}
    {tool.status === "running" && <div className="terminal-wait"><span className="terminal-cursor" /><span>Executing…</span></div>}
    {tool.status === "complete" && !result.stdout && !result.stderr && <p className="tool-empty">Command completed without output.</p>}
  </ToolPanel>;
}

function SkillCard({ tool }: { tool: ToolCall }) {
  const args = toolArguments(tool), result = toolResult(tool);
  const content = textValue(result.content);
  const scripts = arrayValue(result.scripts).filter((item): item is string => typeof item === "string");
  return <ToolPanel tool={tool} title="Skill" icon={BookOpen} kind="skill" label={tool.status === "complete" ? "Loaded" : undefined}>
    <div className="skill-name">{textValue(result.skill ?? args.name) || "Loading skill…"}</div>
    {content && <details className="skill-instructions"><summary>Instructions<ChevronDown size={11} /></summary><CodePreview text={content} /></details>}
    {scripts.length > 0 && <div className="skill-scripts">{scripts.map((script) => <span key={script}><FileCode2 size={11} />{script}</span>)}</div>}
  </ToolPanel>;
}

function HandoffCard({ tool }: { tool: ToolCall }) {
  const note = textValue(toolArguments(tool).response);
  return <ToolPanel tool={tool} title="Report handoff" icon={Send} kind="handoff" label={tool.status === "complete" ? "Ready" : undefined}>
    {note && <blockquote className="handoff-note">{note}</blockquote>}
    {tool.status === "complete" && <div className="handoff-route"><span>Coordinator</span><ArrowRight size={11} /><span>Final report</span></div>}
  </ToolPanel>;
}

function UnknownTool({ tool }: { tool: ToolCall }) {
  return <ToolPanel tool={tool} title={tool.name.replaceAll("_", " ")} icon={Wrench} kind="generic">
    {(tool.input || tool.output) && <details className="tool-raw"><summary>Details<ChevronDown size={11} /></summary>
      {tool.input && <CodePreview text={tool.input} />}{tool.output && <CodePreview text={tool.output} />}
    </details>}
  </ToolPanel>;
}

function ToolCard({ tool, tasks }: { tool: ToolCall; tasks: Record<string, DepartmentTask> }) {
  switch (tool.name) {
    case "fanout_subagents": return <DispatchCard tool={tool} tasks={tasks} />;
    case "view_file": case "write_file": case "str_replace": return <FileCard tool={tool} />;
    case "glob_tool": case "grep_tool": return <SearchCard tool={tool} />;
    case "bash": return <TerminalCard tool={tool} />;
    case "load_skill": return <SkillCard tool={tool} />;
    case "end_orchestration": return <HandoffCard tool={tool} />;
    default: return <UnknownTool tool={tool} />;
  }
}

export function ToolActivity({ tools, plans, departmentTasks, active }: ToolActivityState & { active: boolean }) {
  const planTools = tools.filter(({ name }) => PLAN_TOOLS.has(name));
  const agents = [...new Set([...Object.keys(plans), ...planTools.map(({ agent }) => agent)])];
  return <div className="tool-activity" aria-label="Tool activity">
    {agents.map((agent) => <PlanCard key={agent} agent={agent} phases={planForDisplay(agent, plans[agent], tools)} tools={planTools.filter((tool) => tool.agent === agent)} active={active} />)}
    {tools.filter(({ name }) => !PLAN_TOOLS.has(name)).map((tool) => <ToolCard key={tool.id} tool={tool} tasks={departmentTasks} />)}
  </div>;
}
