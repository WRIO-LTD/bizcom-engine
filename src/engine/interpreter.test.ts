import { describe, it, expect, beforeEach } from "vitest";
import { ProcessInterpreter } from "./interpreter";
import { createInMemoryPorts } from "../ports/inmemory";
import type { ProcessDefinition } from "../model/types";

const simpleDef: ProcessDefinition = {
  "@context": "https://wr.io/workflow",
  "@type": "Process",
  "@id": "test-process",
  name: "Test Process",
  version: "1.0.0",
  entry_point_id: "start",
  steps: [
    {
      "@type": "Step",
      "@id": "start",
      name: "Start",
      step_type: "start",
      transitions: [{ target_id: "task" }],
    },
    {
      "@type": "Step",
      "@id": "task",
      name: "Task",
      step_type: "service",
      action: "test.action",
      transitions: [{ target_id: "end" }],
    },
    {
      "@type": "Step",
      "@id": "end",
      name: "End",
      step_type: "end",
    },
  ],
};

describe("ProcessInterpreter", () => {
  let adapters: ReturnType<typeof createInMemoryPorts>;
  let interpreter: ProcessInterpreter;

  beforeEach(() => {
    adapters = createInMemoryPorts();
    interpreter = new ProcessInterpreter({ ports: adapters.ports });
  });

  it("should execute a simple sequential process", async () => {
    adapters.nodeHandler.register("test.action", async () => {
      return { result: "done" };
    });

    const result = await interpreter.run(simpleDef);

    expect(result.status).toBe("completed");
    expect(result.context.history).toEqual(["start", "task", "end"]);
    expect(result.context.steps["task"]).toEqual({ result: "done" });
    expect(adapters.historyStore.events).toHaveLength(8);
    const eventTypes = adapters.historyStore.events.map((e) => e.event_type);
    expect(eventTypes).toEqual([
      "instance_started",
      "step_started", "step_completed",
      "step_started", "step_completed",
      "step_started", "step_completed",
      "instance_completed",
    ]);
  });

  it("should route through exclusive gateway based on condition", async () => {
    const gatewayDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "gateway-test",
      name: "Gateway Test",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "gw" }],
        },
        {
          "@type": "Step",
          "@id": "gw",
          name: "Decision",
          step_type: "gateway",
          gateway_type: "exclusive",
          transitions: [
            { target_id: "high", condition: "vars.amount > 100" },
            { target_id: "low" },
          ],
        },
        {
          "@type": "Step",
          "@id": "high",
          name: "High Value",
          step_type: "service",
          action: "test.high",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "low",
          name: "Low Value",
          step_type: "service",
          action: "test.low",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    };

    adapters.nodeHandler.register("test.high", async () => ({ branch: "high" }));
    adapters.nodeHandler.register("test.low", async () => ({ branch: "low" }));

    const result = await interpreter.run(gatewayDef, undefined, { amount: 150 });

    expect(result.status).toBe("completed");
    expect(result.context.history).toContain("high");
    expect(result.context.history).not.toContain("low");
  });

  it("should handle on_error transitions", async () => {
    const errorDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "error-test",
      name: "Error Test",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "risky" }],
        },
        {
          "@type": "Step",
          "@id": "risky",
          name: "Risky",
          step_type: "service",
          action: "test.risky",
          transitions: [
            { target_id: "normal" },
            { target_id: "handler", on_error: true },
          ],
        },
        {
          "@type": "Step",
          "@id": "handler",
          name: "Error Handler",
          step_type: "service",
          action: "test.handler",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "normal",
          name: "Normal",
          step_type: "end",
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    };

    adapters.nodeHandler.register("test.risky", async () => {
      throw new Error("Boom");
    });
    adapters.nodeHandler.register("test.handler", async () => {
      return { recovered: true };
    });

    const result = await interpreter.run(errorDef);

    expect(result.status).toBe("completed");
    expect(result.context.history).toContain("handler");
    expect(result.context.history).not.toContain("normal");
    expect(result.context.steps["handler"]).toEqual({ recovered: true });
    expect(result.context.steps["risky"]).toHaveProperty("_error", "Boom");
  });

  it("should fail after exceeding max error transitions", async () => {
    const infiniteErrorDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "infinite-error",
      name: "Infinite Error",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "failer" }],
        },
        {
          "@type": "Step",
          "@id": "failer",
          name: "Failer",
          step_type: "service",
          action: "test.failer",
          transitions: [
            { target_id: "failer", on_error: true },
          ],
        },
      ],
    };

    adapters.nodeHandler.register("test.failer", async () => {
      throw new Error("Always fails");
    });

    const result = await interpreter.run(infiniteErrorDef);
    expect(result.status).toBe("failed");
  });

  it("should execute timer steps", async () => {
    const timerDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "timer-test",
      name: "Timer Test",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "wait" }],
        },
        {
          "@type": "Step",
          "@id": "wait",
          name: "Wait",
          step_type: "timer",
          duration: "PT10S",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    };

    const result = await interpreter.run(timerDef);

    expect(result.status).toBe("completed");
    expect(adapters.stepRuntime.sleepLogs).toEqual(["10 seconds"]);
  });

  it("should fail on unregistered action", async () => {
    const result = await interpreter.run(simpleDef);

    expect(result.status).toBe("failed");
    expect(result.incidents.length).toBeGreaterThan(0);
    expect(result.incidents[0].type).toBe("step_failure");
  });

  it("should retry node handler per step.retry config, then succeed", async () => {
    const retryDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "retry-test",
      name: "Retry Test",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "flaky" }],
        },
        {
          "@type": "Step",
          "@id": "flaky",
          name: "Flaky",
          step_type: "service",
          action: "test.flaky",
          retry: { max_attempts: 3, delay_ms: 1000 },
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    };

    let calls = 0;
    adapters.nodeHandler.register("test.flaky", async () => {
      calls++;
      if (calls < 3) throw new Error("Temporary failure");
      return { ok: true };
    });

    const result = await interpreter.run(retryDef);

    expect(calls).toBe(3);
    expect(result.status).toBe("completed");
    expect(result.context.steps["flaky"]).toEqual({ ok: true });
  });

  it("should fail process when retries exhausted", async () => {
    const retryDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "retry-exhaust",
      name: "Retry Exhaust",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "flaky" }],
        },
        {
          "@type": "Step",
          "@id": "flaky",
          name: "Flaky",
          step_type: "service",
          action: "test.flaky",
          retry: { max_attempts: 2, delay_ms: 1000 },
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    };

    let calls = 0;
    adapters.nodeHandler.register("test.flaky", async () => {
      calls++;
      throw new Error("Always fails");
    });

    const result = await interpreter.run(retryDef);

    expect(calls).toBe(2);
    expect(result.status).toBe("failed");
  });

  it("should extract outputs from definition.outputs mapping", async () => {
    const outputDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "output-test",
      name: "Output Test",
      version: "1.0.0",
      entry_point_id: "start",
      outputs: { final: "steps.task.result" },
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "task" }],
        },
        {
          "@type": "Step",
          "@id": "task",
          name: "Task",
          step_type: "service",
          action: "test.output",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    };

    adapters.nodeHandler.register("test.output", async () => {
      return { result: "output-value" };
    });

    const result = await interpreter.run(outputDef);
    expect(result.status).toBe("completed");
    expect(result.output).toEqual({ final: "output-value" });
  });

  it("live-chat regression: service step with false condition routes to End (not to conditional target)", async () => {
    const liveChatDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "live-chat",
      name: "Live Chat",
      version: "1.0.0",
      entry_point_id: "LoadSettings",
      steps: [
        {
          "@type": "Step",
          "@id": "LoadSettings",
          name: "Load Settings",
          step_type: "service",
          action: "test.settings",
          transitions: [{ target_id: "FetchOwnerDetails" }],
        },
        {
          "@type": "Step",
          "@id": "FetchOwnerDetails",
          name: "Fetch Owner Details",
          step_type: "service",
          action: "test.fetchOwner",
          transitions: [
            {
              target_id: "NotifyOwner",
              condition: "steps.FetchOwnerDetails.rows[0].external_id || steps.LoadSettings.value.chat_id",
            },
            { target_id: "End" },
          ],
        },
        {
          "@type": "Step",
          "@id": "NotifyOwner",
          name: "Notify Owner",
          step_type: "service",
          action: "test.notify",
          transitions: [{ target_id: "End" }],
        },
        {
          "@type": "Step",
          "@id": "End",
          name: "Finish",
          step_type: "end",
        },
      ],
    };

    adapters.nodeHandler.register("test.settings", async () => ({ value: {} }));
    adapters.nodeHandler.register("test.fetchOwner", async () => ({ rows: [] }));
    adapters.nodeHandler.register("test.notify", async () => ({ sent: true }));

    const result = await interpreter.run(liveChatDef);

    expect(result.status).toBe("completed");
    expect(result.context.history).toEqual([
      "LoadSettings",
      "FetchOwnerDetails",
      "End",
    ]);
    expect(result.context.history).not.toContain("NotifyOwner");
  });

  it("live-chat: conditional branch taken when condition is truthy", async () => {
    const def: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "live-chat-true",
      name: "Live Chat True",
      version: "1.0.0",
      entry_point_id: "LoadSettings",
      steps: [
        {
          "@type": "Step",
          "@id": "LoadSettings",
          name: "Load Settings",
          step_type: "service",
          action: "test.settings",
          transitions: [{ target_id: "FetchOwnerDetails" }],
        },
        {
          "@type": "Step",
          "@id": "FetchOwnerDetails",
          name: "Fetch Owner Details",
          step_type: "service",
          action: "test.fetchOwner",
          transitions: [
            {
              target_id: "NotifyOwner",
              condition: "steps.FetchOwnerDetails.rows[0].external_id",
            },
            { target_id: "End" },
          ],
        },
        {
          "@type": "Step",
          "@id": "NotifyOwner",
          name: "Notify Owner",
          step_type: "service",
          action: "test.notify",
          transitions: [{ target_id: "End" }],
        },
        {
          "@type": "Step",
          "@id": "End",
          name: "Finish",
          step_type: "end",
        },
      ],
    };

    adapters.nodeHandler.register("test.settings", async () => ({ value: {} }));
    adapters.nodeHandler.register("test.fetchOwner", async () => ({
      rows: [{ external_id: "tg:123" }],
    }));
    adapters.nodeHandler.register("test.notify", async () => ({ sent: true }));

    const result = await interpreter.run(def);

    expect(result.status).toBe("completed");
    expect(result.context.history).toContain("NotifyOwner");
    expect(result.context.history).toEqual([
      "LoadSettings",
      "FetchOwnerDetails",
      "NotifyOwner",
      "End",
    ]);
  });

  it("parallel fork: executes all branches and continues to join", async () => {
    const forkDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "fork-test",
      name: "Fork Test",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "fork" }],
        },
        {
          "@type": "Step",
          "@id": "fork",
          name: "Fork",
          step_type: "gateway",
          gateway_type: "parallel_fork",
          transitions: [{ target_id: "branch_a" }, { target_id: "branch_b" }],
        },
        {
          "@type": "Step",
          "@id": "branch_a",
          name: "Branch A",
          step_type: "service",
          action: "test.a",
          transitions: [{ target_id: "join" }],
        },
        {
          "@type": "Step",
          "@id": "branch_b",
          name: "Branch B",
          step_type: "service",
          action: "test.b",
          transitions: [{ target_id: "join" }],
        },
        {
          "@type": "Step",
          "@id": "join",
          name: "Join",
          step_type: "gateway",
          gateway_type: "parallel_join",
          transitions: [{ target_id: "end" }],
        },
        { "@type": "Step", "@id": "end", name: "End", step_type: "end" },
      ],
    };

    adapters.nodeHandler.register("test.a", async () => ({ branch: "a" }));
    adapters.nodeHandler.register("test.b", async () => ({ branch: "b" }));

    const result = await interpreter.run(forkDef);

    expect(result.status).toBe("completed");
    expect(result.context.steps["branch_a"]).toEqual({ branch: "a" });
    expect(result.context.steps["branch_b"]).toEqual({ branch: "b" });
    expect(result.context.history).toEqual(["start", "fork", "branch_a", "branch_b", "join", "end"]);
  });

  it("error_count tracks consecutive on_error transitions and resets on success", async () => {
    const errDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "err-count",
      name: "Err Count",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "risky" }],
        },
        {
          "@type": "Step",
          "@id": "risky",
          name: "Risky",
          step_type: "service",
          action: "test.risky",
          transitions: [
            { target_id: "handler", on_error: true },
          ],
        },
        {
          "@type": "Step",
          "@id": "handler",
          name: "Handler",
          step_type: "service",
          action: "test.handler",
          transitions: [{ target_id: "end" }],
        },
        { "@type": "Step", "@id": "end", name: "End", step_type: "end" },
      ],
    };

    adapters.nodeHandler.register("test.risky", async () => {
      throw new Error("boom");
    });
    adapters.nodeHandler.register("test.handler", async () => ({ ok: true }));

    const result = await interpreter.run(errDef);

    expect(result.status).toBe("completed");
    // After on_error → handler success, error_count is reset to 0
    expect(result.context.sys.error_count).toBe(0);
  });

  it("error_count exceeds max → process fails (error loop guard)", async () => {
    const loopDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": "err-loop",
      name: "Err Loop",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "failer" }],
        },
        {
          "@type": "Step",
          "@id": "failer",
          name: "Failer",
          step_type: "service",
          action: "test.failer",
          transitions: [
            { target_id: "failer", on_error: true },
          ],
        },
      ],
    };

    adapters.nodeHandler.register("test.failer", async () => {
      throw new Error("always fails");
    });

    const result = await interpreter.run(loopDef);

    expect(result.status).toBe("failed");
    expect(result.context.sys.error_count).toBe(4); // MAX_ERROR_TRANSITIONS(3) + 1
  });
});
