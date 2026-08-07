import { describe, it, expect } from "vitest";
import { getNextStep, getErrorTransition } from "./gateway";
import { InMemoryExpressionEvaluator } from "../ports/inmemory";
import type { VariablesContext } from "../model/context";

function makeContext(vars: Record<string, unknown> = {}): VariablesContext {
  return {
    sys: {
      process_id: "test",
      instance_id: "inst-1",
      owner: "u1",
      process_owner: "u1",
      owner_identifier: "u1",
      initiator: "u1",
      project_id: "p1",
      started_at: new Date().toISOString(),
      is_dev: false,
    },
    input: {},
    steps: {},
    vars,
    history: [],
  };
}

describe("GatewayEvaluator", () => {
  const evaluator = new InMemoryExpressionEvaluator();

  it("should return single target for normal step with transition", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "task",
      name: "Task",
      step_type: "service" as const,
      transitions: [{ target_id: "next" }],
    };

    const result = await getNextStep(step, makeContext(), evaluator);
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.target_id).toBe("next");
    }
  });

  it("should return end for step with no transitions", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "task",
      name: "Task",
      step_type: "service" as const,
    };

    const result = await getNextStep(step, makeContext(), evaluator);
    expect(result.kind).toBe("end");
  });

  it("non-gateway step: evaluates conditions (first true wins)", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "fetch",
      name: "Fetch",
      step_type: "service" as const,
      transitions: [
        { target_id: "notify", condition: "steps.fetch.rows[0].external_id" },
        { target_id: "end" },
      ],
    };

    const ctx = makeContext();
    ctx.steps = { fetch: { rows: [] } };

    const result = await getNextStep(step, ctx, evaluator);
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.target_id).toBe("end");
    }
  });

  it("non-gateway step: takes conditional branch when condition true", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "fetch",
      name: "Fetch",
      step_type: "service" as const,
      transitions: [
        { target_id: "notify", condition: "steps.fetch.rows[0].external_id" },
        { target_id: "end" },
      ],
    };

    const ctx = makeContext();
    ctx.steps = { fetch: { rows: [{ external_id: "tg:123" }] } };

    const result = await getNextStep(step, ctx, evaluator);
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.target_id).toBe("notify");
    }
  });

  it("non-gateway step: unconditioned first transition wins", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "task",
      name: "Task",
      step_type: "service" as const,
      transitions: [
        { target_id: "next" },
        { target_id: "other", condition: "vars.x > 0" },
      ],
    };

    const result = await getNextStep(step, makeContext(), evaluator);
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.target_id).toBe("next");
    }
  });

  it("should return end for end step", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "end_step",
      name: "End",
      step_type: "end" as const,
      transitions: [{ target_id: "unreachable" }],
    };

    const result = await getNextStep(step, makeContext(), evaluator);
    expect(result.kind).toBe("end");
  });

  it("exclusive gateway: first true condition wins", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "gw",
      name: "Decision",
      step_type: "gateway" as const,
      gateway_type: "exclusive" as const,
      transitions: [
        { target_id: "high", condition: "vars.amount > 100" },
        { target_id: "low" },
      ],
    };

    const result = await getNextStep(step, makeContext({ amount: 150 }), evaluator);
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.target_id).toBe("high");
    }
  });

  it("exclusive gateway: default when no condition matches", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "gw",
      name: "Decision",
      step_type: "gateway" as const,
      gateway_type: "exclusive" as const,
      transitions: [
        { target_id: "high", condition: "vars.amount > 100" },
        { target_id: "low" },
      ],
    };

    const result = await getNextStep(step, makeContext({ amount: 50 }), evaluator);
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.target_id).toBe("low");
    }
  });

  it("inclusive gateway: all matching branches", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "gw",
      name: "Split",
      step_type: "gateway" as const,
      gateway_type: "inclusive" as const,
      transitions: [
        { target_id: "a", condition: "vars.x > 0" },
        { target_id: "b", condition: "vars.y > 0" },
        { target_id: "c" },
      ],
    };

    const result = await getNextStep(step, makeContext({ x: 1, y: 0 }), evaluator);
    expect(result.kind).toBe("parallel");
    if (result.kind === "parallel") {
      expect(result.target_ids).toEqual(["a", "c"]);
    }
  });

  it("parallel fork: all branches", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "fork",
      name: "Fork",
      step_type: "gateway" as const,
      gateway_type: "parallel_fork" as const,
      transitions: [
        { target_id: "a" },
        { target_id: "b" },
        { target_id: "c" },
      ],
    };

    const result = await getNextStep(step, makeContext(), evaluator);
    expect(result.kind).toBe("parallel");
    if (result.kind === "parallel") {
      expect(result.target_ids).toEqual(["a", "b", "c"]);
    }
  });

  it("parallel join: single next", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "join",
      name: "Join",
      step_type: "gateway" as const,
      gateway_type: "parallel_join" as const,
      transitions: [{ target_id: "after" }],
    };

    const result = await getNextStep(step, makeContext(), evaluator);
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.target_id).toBe("after");
    }
  });

  it("should skip on_error transitions when getting next step", async () => {
    const step = {
      "@type": "Step" as const,
      "@id": "task",
      name: "Task",
      step_type: "service" as const,
      transitions: [
        { target_id: "normal_next" },
        { target_id: "error_handler", on_error: true },
      ],
    };

    const result = await getNextStep(step, makeContext(), evaluator);
    expect(result.kind).toBe("single");
    if (result.kind === "single") {
      expect(result.target_id).toBe("normal_next");
    }
  });

  it("getErrorTransition returns on_error target", () => {
    const step = {
      "@type": "Step" as const,
      "@id": "task",
      name: "Task",
      step_type: "service" as const,
      transitions: [
        { target_id: "normal" },
        { target_id: "handler", on_error: true },
      ],
    };

    expect(getErrorTransition(step)).toBe("handler");
  });

  it("getErrorTransition returns undefined when no on_error", () => {
    const step = {
      "@type": "Step" as const,
      "@id": "task",
      name: "Task",
      step_type: "service" as const,
      transitions: [{ target_id: "normal" }],
    };

    expect(getErrorTransition(step)).toBeUndefined();
  });
});
