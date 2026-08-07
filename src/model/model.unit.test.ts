import { describe, it, expect } from "vitest";
import type {
  ProcessDefinition,
  Step,
  Transition,
  GatewayType,
  StepType,
} from "../model/types";
import type {
  VariablesContext,
  ProcessRunOptions,
  ProcessRunResult,
} from "../model/context";
import type { Incident, IncidentStatus } from "../model/incident";
import type { HistoryEvent, HistoryEventType } from "../model/history";

describe("ProcessDefinition", () => {
  it("should accept a valid simple process", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "simple-process",
      name: "Simple Process",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        { "@type": "Step", "@id": "start", name: "Start", step_type: "start", transitions: [{ target_id: "end" }] },
        { "@type": "Step", "@id": "end", name: "End", step_type: "end" },
      ],
    };
    expect(def["@id"]).toBe("simple-process");
    expect(def.steps).toHaveLength(2);
  });

  it("should accept a process with all step types", () => {
    const stepTypes: StepType[] = [
      "start", "end", "service", "service_task", "user_task",
      "timer", "gateway", "form", "manual", "call_activity", "subprocess",
    ];
    const steps: Step[] = stepTypes.map((st) => ({
      "@type": "Step" as const,
      "@id": `step_${st}`,
      name: st,
      step_type: st,
    }));
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "all-types",
      name: "All Types",
      version: "1.0.0",
      entry_point_id: "step_start",
      steps,
    };
    expect(def.steps).toHaveLength(stepTypes.length);
  });

  it("should accept optional fields", () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "full-process",
      name: "Full Process",
      description: "A complete example",
      version: "2.0.0",
      entry_point_id: "start",
      inputs: [
        { name: "orderId", type: "string", required: true },
        { name: "amount", type: "number", default: 0 },
      ],
      outputs: { result: "steps.end.result" },
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "task_a" }],
        },
        {
          "@type": "Step",
          "@id": "task_a",
          name: "Task A",
          step_type: "service",
          action: "http.request",
          params: { url: "https://api.example.com", method: "POST" },
          retry: { max_attempts: 3, delay_ms: 1000, backoff: "exponential", max_delay: 10000 },
          transitions: [{ target_id: "end" }],
        },
        { "@type": "Step", "@id": "end", name: "End", step_type: "end" },
      ],
    };
    expect(def.description).toBe("A complete example");
    expect(def.inputs).toHaveLength(2);
    expect(def.outputs).toBeDefined();
  });
});

describe("Gateway", () => {
  it("should accept all gateway types", () => {
    const gwTypes: GatewayType[] = ["exclusive", "inclusive", "parallel_fork", "parallel_join"];
    gwTypes.forEach((gt) => {
      const step: Step = {
        "@type": "Step",
        "@id": `gw_${gt}`,
        name: gt,
        step_type: "gateway",
        gateway_type: gt,
      };
      expect(step.gateway_type).toBe(gt);
    });
  });

  it("should accept exclusive gateway with conditional transitions", () => {
    const step: Step = {
      "@type": "Step",
      "@id": "gw_excl",
      name: "Decision",
      step_type: "gateway",
      gateway_type: "exclusive",
      transitions: [
        { target_id: "high", condition: "vars.amount > 100" },
        { target_id: "low", condition: undefined },
      ],
    };
    expect(step.transitions).toHaveLength(2);
    expect(step.transitions![0].condition).toBeDefined();
    expect(step.transitions![1].condition).toBeUndefined();
  });
});

describe("VariablesContext", () => {
  it("should have correct structure", () => {
    const ctx: VariablesContext = {
      sys: {
        process_id: "proc-1",
        instance_id: "inst-123",
        owner: "user1",
        process_owner: "user1",
        owner_identifier: "user1",
        initiator: "user1",
        project_id: "proj-1",
        started_at: new Date().toISOString(),
        is_dev: false,
      },
      input: { orderId: 123 },
      steps: {},
      vars: {},
      history: [],
    };
    expect(ctx.sys.process_id).toBe("proc-1");
    expect(ctx.history).toHaveLength(0);
  });

  it("should accumulate step outputs and history", () => {
    const ctx: VariablesContext = {
      sys: {
        process_id: "proc-1",
        instance_id: "inst-1",
        owner: "u1",
        process_owner: "u1",
        owner_identifier: "u1",
        initiator: "u1",
        project_id: "p1",
        started_at: new Date().toISOString(),
        is_dev: true,
      },
      input: {},
      steps: { task_a: { result: "ok" } },
      vars: { count: 42 },
      history: ["start", "task_a"],
    };
    expect(ctx.steps["task_a"]).toEqual({ result: "ok" });
    expect(ctx.history).toEqual(["start", "task_a"]);
  });
});

describe("Incident", () => {
  it("should create an open incident", () => {
    const incident: Incident = {
      instance_id: "inst-1",
      step_id: "risky_task",
      type: "step_failure",
      message: "Connection refused",
      status: "open",
      severity: "error",
      attempts: 1,
      max_attempts: 3,
      created_at: new Date().toISOString(),
    };
    expect(incident.status).toBe("open");
    expect(incident.attempts).toBe(1);
  });

  it("should mark incident exhausted after max attempts", () => {
    const statuses: IncidentStatus[] = ["open", "resolved", "exhausted"];
    expect(statuses).toContain("exhausted");
  });
});

describe("HistoryEvent", () => {
  it("should have correct lifecycle event types", () => {
    const events: HistoryEventType[] = [
      "instance_started", "step_started", "step_completed",
      "instance_completed",
    ];
    expect(events).toHaveLength(4);
  });

  it("should create a step completed event", () => {
    const event: HistoryEvent = {
      event_type: "step_completed",
      instance_id: "inst-1",
      step_id: "task_a",
      step_type: "service",
      input: { url: "https://api.example.com" },
      output: { status: 200 },
      duration_ms: 150,
      timestamp: new Date().toISOString(),
    };
    expect(event.event_type).toBe("step_completed");
    expect(event.duration_ms).toBeGreaterThan(0);
  });

  it("should create a step failed event", () => {
    const event: HistoryEvent = {
      event_type: "step_failed",
      instance_id: "inst-1",
      step_id: "risky_task",
      step_type: "service",
      error: {
        message: "Timeout",
        code: "TIMEOUT",
        stack: "Error: Timeout\n    at ...",
        on_error_to: "error_handler",
      },
      duration_ms: 5000,
      timestamp: new Date().toISOString(),
    };
    expect(event.error).toBeDefined();
    expect(event.error!.on_error_to).toBe("error_handler");
  });
});

describe("ProcessRunOptions and ProcessRunResult", () => {
  it("should accept minimal run options", () => {
    const opts: ProcessRunOptions = {
      definition: {
        "@context": "https://wr.io/workflow",
        "@type": "Process",
        "@id": "minimal",
        name: "Minimal",
        version: "1.0.0",
        entry_point_id: "start",
        steps: [
          { "@type": "Step", "@id": "start", name: "Start", step_type: "start", transitions: [{ target_id: "end" }] },
          { "@type": "Step", "@id": "end", name: "End", step_type: "end" },
        ],
      },
    };
    expect(opts.definition["@id"]).toBe("minimal");
  });

  it("should accept run result with incidents", () => {
    const result: ProcessRunResult = {
      status: "completed",
      context: {
        sys: {
          process_id: "proc-1", instance_id: "inst-1",
          owner: "u1", process_owner: "u1", owner_identifier: "u1",
          initiator: "u1", project_id: "p1",
          started_at: new Date().toISOString(), is_dev: false,
        },
        input: {},
        steps: { start: {}, end: {} },
        vars: {},
        history: ["start", "end"],
      },
      incidents: [],
      output: { status: "ok" },
    };
    expect(result.status).toBe("completed");
    expect(result.incidents).toHaveLength(0);
  });
});
