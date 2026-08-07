import type { Step } from "../model/types.js";
import type { VariablesContext } from "../model/context.js";
import type { ExpressionEvaluator } from "../ports/PORTS.js";

export type NextStepResult =
  | { kind: "single"; target_id: string }
  | { kind: "parallel"; target_ids: string[] }
  | { kind: "end" };

export async function getNextStep(
  step: Step,
  context: VariablesContext,
  evaluateCondition: ExpressionEvaluator,
): Promise<NextStepResult> {
  const normalTransitions = (step.transitions || []).filter((t) => !t.on_error);

  if (step.step_type === "end") {
    return { kind: "end" };
  }

  if (normalTransitions.length === 0) {
    return { kind: "end" };
  }

  if (step.step_type === "gateway") {
    return evaluateGateway(step, normalTransitions, context, evaluateCondition);
  }

  // Non-gateway steps: evaluate conditions on ALL steps, not just gateways.
  // Matches original GeneralWorkflow.getNextStepId(): first unconditioned
  // transition wins, otherwise first transition whose condition is true wins.
  if (normalTransitions.some((t) => t.condition)) {
    for (const t of normalTransitions) {
      if (!t.condition) {
        return { kind: "single", target_id: t.target_id };
      }
      const isTrue = await evaluateCondition.evaluate(
        t.condition,
        context as unknown as Record<string, unknown>,
      );
      if (isTrue) {
        return { kind: "single", target_id: t.target_id };
      }
    }
    return { kind: "end" };
  }

  return { kind: "single", target_id: normalTransitions[0].target_id };
}

export function getErrorTransition(step: Step): string | undefined {
  const errorTransition = step.transitions?.find((t) => t.on_error);
  return errorTransition?.target_id;
}

async function evaluateGateway(
  step: Step,
  transitions: typeof step.transitions,
  context: VariablesContext,
  evaluateCondition: ExpressionEvaluator,
): Promise<NextStepResult> {
  if (!transitions || transitions.length === 0) {
    return { kind: "end" };
  }

  switch (step.gateway_type) {
    case "exclusive":
      return evaluateExclusiveGateway(transitions, context, evaluateCondition);

    case "inclusive":
      return evaluateInclusiveGateway(transitions, context, evaluateCondition);

    case "parallel_fork":
      return {
        kind: "parallel",
        target_ids: transitions.map((t) => t.target_id),
      };

    case "parallel_join":
      return {
        kind: "single",
        target_id: transitions[0]?.target_id || "",
      };

    default:
      return evaluateExclusiveGateway(transitions, context, evaluateCondition);
  }
}

async function evaluateExclusiveGateway(
  transitions: NonNullable<Step["transitions"]>,
  context: VariablesContext,
  evaluateCondition: ExpressionEvaluator,
): Promise<NextStepResult> {
  let defaultTarget: string | undefined;

  for (const t of transitions) {
    if (!t.condition) {
      defaultTarget = t.target_id;
      continue;
    }
    const result = await evaluateCondition.evaluate(t.condition, context as unknown as Record<string, unknown>);
    if (result) {
      return { kind: "single", target_id: t.target_id };
    }
  }

  if (defaultTarget) {
    return { kind: "single", target_id: defaultTarget };
  }

  return { kind: "end" };
}

async function evaluateInclusiveGateway(
  transitions: NonNullable<Step["transitions"]>,
  context: VariablesContext,
  evaluateCondition: ExpressionEvaluator,
): Promise<NextStepResult> {
  const matching: string[] = [];

  for (const t of transitions) {
    if (!t.condition) {
      matching.push(t.target_id);
      continue;
    }
    const result = await evaluateCondition.evaluate(t.condition, context as unknown as Record<string, unknown>);
    if (result) {
      matching.push(t.target_id);
    }
  }

  if (matching.length === 0) return { kind: "end" };
  if (matching.length === 1) return { kind: "single", target_id: matching[0] };

  return { kind: "parallel", target_ids: matching };
}
