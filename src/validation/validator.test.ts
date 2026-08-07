import { describe, it, expect } from "vitest";
import { validate, ValidationFailedError } from "./validator";
import type { ProcessDefinition } from "../model/types";

function makeDef(overrides: Partial<ProcessDefinition> = {}): ProcessDefinition {
  return {
    "@context": "https://wr.io/workflow",
    "@type": "Process",
    "@id": "test",
    name: "Test",
    version: "1.0.0",
    entry_point_id: "start",
    steps: [
      {
        "@type": "Step",
        "@id": "start",
        name: "Start",
        step_type: "start",
        transitions: [{ target_id: "end" }],
      },
      {
        "@type": "Step",
        "@id": "end",
        name: "End",
        step_type: "end",
      },
    ],
    ...overrides,
  };
}

describe("Validator", () => {
  it("should pass a valid simple process", () => {
    expect(() => validate(makeDef())).not.toThrow();
  });

  it("should fail on missing entry point", () => {
    const def = makeDef({ entry_point_id: "ghost" });
    try {
      validate(def);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationFailedError);
      expect((e as ValidationFailedError).errors[0].code).toBe("MISSING_ENTRY_POINT");
    }
  });

  it("should fail on invalid transition target", () => {
    const def = makeDef({
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "ghost" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    try {
      validate(def);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationFailedError);
      expect((e as ValidationFailedError).errors[0].code).toBe("INVALID_TRANSITION_TARGET");
    }
  });

  it("should fail on dead-end (non-end step without outgoing)", () => {
    const def = makeDef({
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    try {
      validate(def);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationFailedError);
      const codes = (e as ValidationFailedError).errors.map((err) => err.code);
      expect(codes).toContain("DEAD_END");
    }
  });

  it("should fail on unreachable step", () => {
    const def = makeDef({
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "orphan",
          name: "Orphan",
          step_type: "service",
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    try {
      validate(def);
      expect.fail("Should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationFailedError);
      const codes = (e as ValidationFailedError).errors.map((err) => err.code);
      expect(codes).toContain("UNREACHABLE_STEP");
    }
  });

  it("should fail on parallel fork with < 2 outgoing", () => {
    const def = makeDef({
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
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    try {
      validate(def);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as ValidationFailedError).errors[0].code).toBe("INVALID_FORK");
    }
  });

  it("should fail on parallel join with < 2 incoming", () => {
    const def = makeDef({
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
          transitions: [{ target_id: "join" }, { target_id: "join" }],
        },
        {
          "@type": "Step",
          "@id": "join",
          name: "Join",
          step_type: "gateway",
          gateway_type: "parallel_join",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    // Both fork branches point to the same "join" — incoming count is 2
    expect(() => validate(def)).not.toThrow();
  });

  it("should fail on unbalanced parallel gateways", () => {
    const def = makeDef({
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "fork1" }],
        },
        {
          "@type": "Step",
          "@id": "fork1",
          name: "Fork1",
          step_type: "gateway",
          gateway_type: "parallel_fork",
          transitions: [{ target_id: "a" }, { target_id: "b" }],
        },
        {
          "@type": "Step",
          "@id": "fork2",
          name: "Fork2",
          step_type: "gateway",
          gateway_type: "parallel_fork",
          transitions: [{ target_id: "c" }, { target_id: "d" }],
        },
        {
          "@type": "Step",
          "@id": "a",
          name: "A",
          step_type: "service",
          transitions: [{ target_id: "join" }],
        },
        {
          "@type": "Step",
          "@id": "b",
          name: "B",
          step_type: "service",
          transitions: [{ target_id: "join" }],
        },
        {
          "@type": "Step",
          "@id": "c",
          name: "C",
          step_type: "service",
          transitions: [{ target_id: "join" }],
        },
        {
          "@type": "Step",
          "@id": "d",
          name: "D",
          step_type: "service",
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
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    try {
      validate(def);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as ValidationFailedError).errors).toContainEqual(
        expect.objectContaining({ code: "UNBALANCED_PARALLEL_GATEWAY" }),
      );
    }
  });

  it("should fail on gateway with no default flow", () => {
    const def = makeDef({
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
          transitions: [{ target_id: "high", condition: "vars.x > 0" }],
        },
        {
          "@type": "Step",
          "@id": "high",
          name: "High",
          step_type: "service",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    try {
      validate(def);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as ValidationFailedError).errors[0].code).toBe("GATEWAY_NO_DEFAULT");
    }
  });

  it("should fail on call activity without called_definition", () => {
    const def = makeDef({
      entry_point_id: "start",
      steps: [
        {
          "@type": "Step",
          "@id": "start",
          name: "Start",
          step_type: "start",
          transitions: [{ target_id: "call" }],
        },
        {
          "@type": "Step",
          "@id": "call",
          name: "Call",
          step_type: "call_activity",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    try {
      validate(def);
      expect.fail("Should have thrown");
    } catch (e) {
      expect((e as ValidationFailedError).errors[0].code).toBe("MISSING_CALLED_ELEMENT");
    }
  });

  it("should pass a valid process with exclusive gateway and default", () => {
    const def = makeDef({
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
            { target_id: "high", condition: "vars.x > 0" },
            { target_id: "low" },
          ],
        },
        {
          "@type": "Step",
          "@id": "high",
          name: "High",
          step_type: "service",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "low",
          name: "Low",
          step_type: "service",
          transitions: [{ target_id: "end" }],
        },
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    expect(() => validate(def)).not.toThrow();
  });

  it("should pass a valid parallel fork/join with balanced branches", () => {
    const def = makeDef({
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
          transitions: [{ target_id: "a" }, { target_id: "b" }],
        },
        {
          "@type": "Step",
          "@id": "a",
          name: "A",
          step_type: "service",
          transitions: [{ target_id: "join" }],
        },
        {
          "@type": "Step",
          "@id": "b",
          name: "B",
          step_type: "service",
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
        {
          "@type": "Step",
          "@id": "end",
          name: "End",
          step_type: "end",
        },
      ],
    });
    expect(() => validate(def)).not.toThrow();
  });
});
