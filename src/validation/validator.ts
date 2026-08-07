import type { ProcessDefinition, Step } from "../model/types.js";

export interface ValidationError {
  code: string;
  message: string;
  step_id?: string;
}

export class ValidationFailedError extends Error {
  errors: ValidationError[];
  constructor(errors: ValidationError[]) {
    super(`Validation failed: ${errors.map((e) => e.message).join("; ")}`);
    this.name = "ValidationFailedError";
    this.errors = errors;
  }
}

export function validate(definition: ProcessDefinition): void {
  const errors: ValidationError[] = [];

  checkEntryPointExists(definition, errors);
  checkTransitionTargetsExist(definition, errors);
  checkDeadEnds(definition, errors);
  checkReachability(definition, errors);
  checkParallelGatewayBalance(definition, errors);
  checkGatewayOrphans(definition, errors);
  checkCallActivityCalledElement(definition, errors);

  if (errors.length > 0) {
    throw new ValidationFailedError(errors);
  }
}

function checkEntryPointExists(def: ProcessDefinition, errors: ValidationError[]): void {
  const exists = def.steps.some((s) => s["@id"] === def.entry_point_id);
  if (!exists) {
    errors.push({
      code: "MISSING_ENTRY_POINT",
      message: `Entry point "${def.entry_point_id}" does not match any step`,
    });
  }
}

function checkTransitionTargetsExist(def: ProcessDefinition, errors: ValidationError[]): void {
  const stepIds = new Set(def.steps.map((s) => s["@id"]));
  for (const step of def.steps) {
    if (!step.transitions) continue;
    for (const t of step.transitions) {
      if (!stepIds.has(t.target_id)) {
        errors.push({
          code: "INVALID_TRANSITION_TARGET",
          message: `Step "${step["@id"]}" has transition to non-existent target "${t.target_id}"`,
          step_id: step["@id"],
        });
      }
    }
  }
}

function checkDeadEnds(def: ProcessDefinition, errors: ValidationError[]): void {
  for (const step of def.steps) {
    if (step.step_type === "end" || step.step_type === "call_activity") continue;
    const normalTransitions = (step.transitions || []).filter((t) => !t.on_error);
    if (normalTransitions.length === 0) {
      errors.push({
        code: "DEAD_END",
        message: `Step "${step["@id"]}" (type "${step.step_type}") has no non-error outgoing transitions`,
        step_id: step["@id"],
      });
    }
  }
}

function checkReachability(def: ProcessDefinition, errors: ValidationError[]): void {
  const stepIds = new Set(def.steps.map((s) => s["@id"]));
  const unreachable = new Set(stepIds);
  const queue = [def.entry_point_id];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    unreachable.delete(currentId);

    const step = def.steps.find((s) => s["@id"] === currentId);
    if (step?.transitions) {
      for (const t of step.transitions) {
        if (!visited.has(t.target_id)) queue.push(t.target_id);
      }
    }
  }

  for (const id of unreachable) {
    errors.push({
      code: "UNREACHABLE_STEP",
      message: `Step "${id}" is not reachable from the entry point`,
      step_id: id,
    });
  }
}

function checkParallelGatewayBalance(def: ProcessDefinition, errors: ValidationError[]): void {
  const gatewaySteps = def.steps.filter((s) => s.step_type === "gateway");

  for (const gw of gatewaySteps) {
    const incoming = countIncoming(def.steps, gw["@id"]);
    const outgoing = (gw.transitions || []).length;

    if (gw.gateway_type === "parallel_fork" && outgoing < 2) {
      errors.push({
        code: "INVALID_FORK",
        message: `Parallel fork "${gw["@id"]}" must have at least 2 outgoing transitions`,
        step_id: gw["@id"],
      });
    }

    if (gw.gateway_type === "parallel_join" && incoming < 2) {
      errors.push({
        code: "INVALID_JOIN",
        message: `Parallel join "${gw["@id"]}" must have at least 2 incoming transitions`,
        step_id: gw["@id"],
      });
    }
  }

  // NOTE: parallel/inclusive multi-branch runtime execution is not yet fully
  // implemented in ProcessInterpreter.tick() — only single-target routing works.
  // Validator accepts these definitions structurally, but execution may fall
  // back to single-branch. See ADR-001 (Future Work: Parallel Branch Tracking).
  // Do not error here — let authoring proceed; runtime limitation is documented.
  const forks = gatewaySteps.filter((s) => s.gateway_type === "parallel_fork");
  const joins = gatewaySteps.filter((s) => s.gateway_type === "parallel_join");

  if (forks.length !== joins.length) {
    errors.push({
      code: "UNBALANCED_PARALLEL_GATEWAY",
      message: `Found ${forks.length} parallel forks but ${joins.length} parallel joins — must be balanced`,
    });
  }
}

function checkGatewayOrphans(def: ProcessDefinition, errors: ValidationError[]): void {
  for (const gw of def.steps.filter((s) => s.step_type === "gateway")) {
    const outgoing = (gw.transitions || []).filter((t) => !t.on_error);

    if (outgoing.length === 0) {
      errors.push({
        code: "ORPHAN_GATEWAY",
        message: `Gateway "${gw["@id"]}" has no outgoing transitions`,
        step_id: gw["@id"],
      });
    }

    if (gw.gateway_type === "exclusive" || gw.gateway_type === "inclusive") {
      const conditional = outgoing.filter((t) => t.condition);
      const defaultFlows = outgoing.filter((t) => !t.condition);
      if (conditional.length > 0 && defaultFlows.length === 0) {
        errors.push({
          code: "GATEWAY_NO_DEFAULT",
          message: `Gateway "${gw["@id"]}" has conditional flows but no default flow`,
          step_id: gw["@id"],
        });
      }
    }
  }
}

function checkCallActivityCalledElement(def: ProcessDefinition, errors: ValidationError[]): void {
  for (const step of def.steps) {
    if (step.step_type === "call_activity" && !step.called_definition) {
      errors.push({
        code: "MISSING_CALLED_ELEMENT",
        message: `Call activity "${step["@id"]}" has no called_definition`,
        step_id: step["@id"],
      });
    }
  }
}

function countIncoming(steps: Step[], targetId: string): number {
  let count = 0;
  for (const step of steps) {
    if (!step.transitions) continue;
    for (const t of step.transitions) {
      if (t.target_id === targetId) count++;
    }
  }
  return count;
}
