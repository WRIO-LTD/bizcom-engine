import { describe, it, expect, vi, afterEach } from "vitest";
import { createBuiltinHandlers, BUILTIN_HANDLER_IDS } from "./builtin";
import type { VariablesContext } from "../model/context";

const FIXED_STARTED_AT = "2024-01-15T12:00:00.000Z";

function makeContext(overrides: Partial<VariablesContext> = {}): VariablesContext {
  return {
    sys: {
      process_id: "test",
      instance_id: "inst-1",
      owner: "u1",
      process_owner: "u1",
      owner_identifier: "u1",
      initiator: "u1",
      project_id: "p1",
      started_at: FIXED_STARTED_AT,
      is_dev: false,
    },
    input: {},
    steps: {},
    vars: {},
    history: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Builtin OSS Handlers", () => {
  it("exposes all declared handler ids", () => {
    expect(BUILTIN_HANDLER_IDS).toContain("core.delay");
    expect(BUILTIN_HANDLER_IDS).toContain("core.jexl");
    expect(BUILTIN_HANDLER_IDS).toContain("core.noop");
    expect(BUILTIN_HANDLER_IDS).toContain("core.for_each");
    expect(BUILTIN_HANDLER_IDS).toContain("core.filter");
    expect(BUILTIN_HANDLER_IDS).toContain("http.request");
    expect(BUILTIN_HANDLER_IDS).toContain("web.fetch_content");
  });

  it("core.noop returns empty object", async () => {
    const handlers = createBuiltinHandlers();
    const out = await handlers["core.noop"]({}, makeContext());
    expect(out).toEqual({});
  });

  it("core.jexl evaluates expression against context", async () => {
    const handlers = createBuiltinHandlers();
    const out = await handlers["core.jexl"](
      { expression: "vars.x + vars.y" },
      makeContext({ vars: { x: 10, y: 20 } }),
    );
    expect(out.result).toBe(30);
  });

  it("core.jexl throws on syntax error", async () => {
    const handlers = createBuiltinHandlers();
    await expect(
      handlers["core.jexl"]({ expression: "vars.x +== 5" }, makeContext()),
    ).rejects.toThrow();
  });

  it("core.delay waits and returns duration_seconds", async () => {
    vi.useFakeTimers();
    const handlers = createBuiltinHandlers();
    const pending = handlers["core.delay"]({ seconds: 0.05 }, makeContext());
    await vi.advanceTimersByTimeAsync(50);
    await expect(pending).resolves.toEqual({ duration_seconds: 0.05 });
  });

  it("core.for_each invokes body_action per item", async () => {
    const handlers = createBuiltinHandlers();
    const out = await handlers["core.for_each"](
      {
        collection: "vars.items",
        body_action: "core.jexl",
        body_params: { expression: "input.item * 2" },
      },
      makeContext({ vars: { items: [1, 2, 3] } }),
    );
    expect(out.count).toBe(3);
    expect(out.results).toEqual([
      { result: 2 },
      { result: 4 },
      { result: 6 },
    ]);
  });

  it("core.filter filters by condition", async () => {
    const handlers = createBuiltinHandlers();
    const out = await handlers["core.filter"](
      { collection: "vars.items", condition: "item > 2" },
      makeContext({ vars: { items: [1, 2, 3, 4] } }),
    );
    expect(out.count).toBe(2);
    expect(out.results).toEqual([3, 4]);
  });

  it("http.request performs fetch and returns status+body", async () => {
    const handlers = createBuiltinHandlers({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchFn: (async (url: any) => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({ hello: "world" }),
          text: async () => "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
// AS_ANY_JUSTIFICATION: test cast
        } as any;
      }) as typeof fetch,
    });
    const out = await handlers["http.request"](
      { url: "https://api.example.com/data", method: "GET" },
      makeContext(),
    );
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ hello: "world" });
  });

  it("http.request throws on non-2xx", async () => {
    const handlers = createBuiltinHandlers({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchFn: (async () => {
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: new Headers({ "content-type": "text/plain" }),
          json: async () => ({}),
          text: async () => "",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
// AS_ANY_JUSTIFICATION: test cast
        } as any;
      }) as typeof fetch,
    });
    await expect(
      handlers["http.request"]({ url: "https://x.io", method: "GET" }, makeContext()),
    ).rejects.toThrow(/404/);
  });

  it("web.fetch_content returns raw text", async () => {
    const handlers = createBuiltinHandlers({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchFn: (async () => {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "text/html" }),
          text: async () => "<html>Hello</html>",
          json: async () => ({}),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
// AS_ANY_JUSTIFICATION: test cast
        } as any;
      }) as typeof fetch,
    });
    const out = await handlers["web.fetch_content"](
      { url: "https://example.com" },
      makeContext(),
    );
    expect(out.content).toBe("<html>Hello</html>");
    expect(out.content_type).toBe("text/html");
  });

  it("runs end-to-end with ProcessInterpreter", async () => {
    const { ProcessInterpreter } = await import("../engine/interpreter.js");
    const { createInMemoryPorts } = await import("../ports/inmemory.js");
    const ports = createInMemoryPorts();
    for (const [action, fn] of Object.entries(createBuiltinHandlers())) {
      ports.nodeHandler.register(action, fn);
    }
    const interpreter = new ProcessInterpreter({ ports: ports.ports });

    const def = {
      "@context": "https://wr.io/workflow",
      "@type": "Process" as const,
      "@id": "builtin-flow",
      name: "Builtin Flow",
      version: "1.0.0",
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step" as const,
          "@id": "start",
          name: "Start",
          step_type: "start" as const,
          transitions: [{ target_id: "calc" }],
        },
        {
          "@type": "Step" as const,
          "@id": "calc",
          name: "Calc",
          step_type: "service" as const,
          action: "core.jexl",
          params: { expression: "input.amount * 2" },
          transitions: [{ target_id: "end" }],
        },
        { "@type": "Step" as const, "@id": "end", name: "End", step_type: "end" as const },
      ],
    };

    const result = await interpreter.run(def, { amount: 21 });
    expect(result.status).toBe("completed");
    expect(result.context.steps["calc"]).toEqual({ result: 42 });
  });
});
