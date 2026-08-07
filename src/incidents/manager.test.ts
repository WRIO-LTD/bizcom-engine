import { describe, it, expect, beforeEach } from "vitest";
import { IncidentManager } from "./manager";

describe("IncidentManager", () => {
  let manager: IncidentManager;

  beforeEach(() => {
    manager = new IncidentManager();
  });

  it("should create an incident with open status", () => {
    const incident = manager.create(
      "inst-1",
      "step_a",
      "step_failure",
      "Connection refused",
      3,
    );

    expect(incident.status).toBe("open");
    expect(incident.step_id).toBe("step_a");
    expect(incident.type).toBe("step_failure");
    expect(incident.max_attempts).toBe(3);
    expect(incident.attempts).toBe(1);
    expect(incident.created_at).toBeTruthy();
  });

  it("should track multiple incidents for the same instance", () => {
    manager.create("inst-1", "step_a", "step_failure", "Error 1", 3);
    manager.create("inst-1", "step_b", "step_failure", "Error 2", 3);

    const all = manager.getIncidents("inst-1");
    expect(all).toHaveLength(2);
  });

  it("should resolve an incident", () => {
    manager.create("inst-1", "step_a", "step_failure", "Error", 3);

    const resolved = manager.resolve("inst-1", "step_a");
    expect(resolved).toBeDefined();
    expect(resolved!.status).toBe("resolved");
    expect(resolved!.resolved_at).toBeTruthy();

    const open = manager.getOpenIncidents("inst-1");
    expect(open).toHaveLength(0);
  });

  it("should increment attempt until exhausted", () => {
    manager.create("inst-1", "step_a", "step_failure", "Error", 3);

    let incident = manager.incrementAttempt("inst-1", "step_a");
    expect(incident!.attempts).toBe(2);
    expect(incident!.status).toBe("open");

    incident = manager.incrementAttempt("inst-1", "step_a");
    expect(incident!.attempts).toBe(3);
    expect(incident!.status).toBe("open");

    incident = manager.incrementAttempt("inst-1", "step_a");
    expect(incident!.attempts).toBe(4);
    expect(incident!.status).toBe("exhausted");
  });

  it("should return undefined for non-existent instance", () => {
    expect(manager.getIncidents("non-existent")).toEqual([]);
    expect(manager.resolve("non-existent", "step_a")).toBeUndefined();
    expect(manager.incrementAttempt("non-existent", "step_a")).toBeUndefined();
  });

  it("should clear all incidents for an instance", () => {
    manager.create("inst-1", "step_a", "step_failure", "Error", 1);
    manager.create("inst-1", "step_b", "timeout", "Timeout", 2);

    manager.clear("inst-1");
    expect(manager.getIncidents("inst-1")).toHaveLength(0);
  });

  it("should filter open incidents", () => {
    manager.create("inst-1", "step_a", "step_failure", "E1", 1);
    manager.create("inst-1", "step_b", "step_failure", "E2", 1);
    manager.resolve("inst-1", "step_a");

    const open = manager.getOpenIncidents("inst-1");
    expect(open).toHaveLength(1);
    expect(open[0].step_id).toBe("step_b");
  });

  it("should support different incident types and severities", () => {
    const types = ["step_failure", "timeout", "expression_error"] as const;
    const sevs = ["error", "warning", "fatal"] as const;

    types.forEach((t, i) => {
      manager.create("inst-1", `step_${t}`, t, `msg_${t}`, 1, sevs[i]);
    });

    const all = manager.getIncidents("inst-1");
    expect(all).toHaveLength(3);
    expect(all[0].type).toBe("step_failure");
    expect(all[1].severity).toBe("warning");
    expect(all[2].severity).toBe("fatal");
  });
});
