import type {
  ProcessDefinition,
  Step,
} from "../model/types.js";
import type {
  VariablesContext,
  ProcessSystem,
  ProcessRunResult,
} from "../model/context.js";
import type { Incident } from "../model/incident.js";
import type { HistoryEvent } from "../model/history.js";
import type { EnginePorts } from "../ports/PORTS.js";
import { getNextStep, getErrorTransition } from "./gateway.js";
import { IncidentManager } from "../incidents/manager.js";

const MAX_ERROR_TRANSITIONS = 3;

export interface InterpreterOptions {
  ports: EnginePorts;
  maxErrorTransitions?: number;
}

export class ProcessInterpreter {
  private ports: EnginePorts;
  private maxErrorTransitions: number;
  incidentManager: IncidentManager;
  context: VariablesContext | null = null;
  definition: ProcessDefinition | null = null;
  consecutiveErrorCount = 0;
  private systemMeta: Partial<ProcessSystem> = {};

  constructor(options: InterpreterOptions) {
    this.ports = options.ports;
    this.maxErrorTransitions = options.maxErrorTransitions ?? MAX_ERROR_TRANSITIONS;
    this.incidentManager = new IncidentManager();
  }

  init(
    definition: ProcessDefinition,
    input?: Record<string, unknown>,
    initialVars?: Record<string, unknown>,
    systemOverrides?: Partial<ProcessSystem>,
  ): string {
    this.definition = definition;
    this.systemMeta = systemOverrides || {};
    this.context = this.buildContext(definition, input, initialVars, systemOverrides);
    this.consecutiveErrorCount = 0;
    this.incidentManager.clear(this.context.sys.instance_id);
    return definition.entry_point_id;
  }

  async tick(
    stepId: string,
    inputContext?: VariablesContext,
  ): Promise<{ nextStepId: string | null; context: VariablesContext }> {
    if (!this.definition) {
      throw new Error("Interpreter not initialized. Call init() first.");
    }
    const definition = this.definition;
    const context: VariablesContext = inputContext ?? this.context ?? this.buildContext(definition);
    if (inputContext) this.context = inputContext;

    const currentStepId = stepId;
    const step = this.findStep(definition, currentStepId);

    if (!context.history.includes(currentStepId)) {
      context.history.push(currentStepId);
    }

    await this.appendHistory({
      event_type: "step_started",
      instance_id: context.sys.instance_id,
      step_id: currentStepId,
      step_type: step.step_type,
      input: step.params,
      timestamp: new Date().toISOString(),
    });

    try {
      const output = await this.executeStep(step, context);
      context.steps[currentStepId] = output;
      this.consecutiveErrorCount = 0;

      await this.appendHistory({
        event_type: "step_completed",
        instance_id: context.sys.instance_id,
        step_id: currentStepId,
        step_type: step.step_type,
        output,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;

      const errorTransitionTarget = getErrorTransition(step);
      if (errorTransitionTarget) {
        this.consecutiveErrorCount++;
        if (this.consecutiveErrorCount > this.maxErrorTransitions) {
          throw new Error(
            `Workflow failed after ${this.consecutiveErrorCount} consecutive error transitions: ${errorMessage}`,
          );
        }
        context.steps[currentStepId] = {
          _error: errorMessage,
          _step_id: currentStepId,
        };
        await this.appendHistory({
          event_type: "step_failed",
          instance_id: context.sys.instance_id,
          step_id: currentStepId,
          step_type: step.step_type,
          error: { message: errorMessage, stack: errorStack, on_error_to: errorTransitionTarget },
          timestamp: new Date().toISOString(),
        });
        return { nextStepId: errorTransitionTarget, context };
      }

      await this.offerRetryOrFail(step, currentStepId, context, errorMessage, errorStack);
      throw err;
    }

    const nextResult = await getNextStep(step, context, this.ports.evaluateCondition);

    if (nextResult.kind === "end" || (nextResult.kind === "single" && !nextResult.target_id)) {
      return { nextStepId: null, context };
    }

    if (nextResult.kind === "single") {
      return { nextStepId: nextResult.target_id, context };
    }

    return {
      nextStepId: nextResult.target_ids[nextResult.target_ids.length - 1] || null,
      context,
    };
  }

  finish(): ProcessRunResult {
    if (!this.context || !this.definition) {
      throw new Error("Interpreter not initialized.");
    }

    const definition = this.definition;
    const context = this.context;
    const output = stepResultToOutput(context, definition);

    return {
      status: "completed",
      context,
      incidents: this.incidentManager.getIncidents(context.sys.instance_id),
      output,
    };
  }

  async run(
    definition: ProcessDefinition,
    input?: Record<string, unknown>,
    initialVars?: Record<string, unknown>,
    systemOverrides?: Partial<ProcessSystem>,
  ): Promise<ProcessRunResult> {
    let stepId: string | null = this.init(definition, input, initialVars, systemOverrides);

    await this.appendHistory({
      event_type: "instance_started",
      instance_id: this.context!.sys.instance_id,
      timestamp: new Date().toISOString(),
    });

    try {
      let ctx = this.context!;
      while (stepId) {
        const result = await this.tick(stepId, ctx);
        ctx = result.context;
        stepId = result.nextStepId;
      }

      await this.appendHistory({
        event_type: "instance_completed",
        instance_id: this.context!.sys.instance_id,
        timestamp: new Date().toISOString(),
      });

      return this.finish();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.incidentManager.create(
        this.context!.sys.instance_id,
        this.context!.history[this.context!.history.length - 1] || "unknown",
        "step_failure",
        errorMessage,
      );

      await this.appendHistory({
        event_type: "instance_failed",
        instance_id: this.context!.sys.instance_id,
        error: { message: errorMessage },
        timestamp: new Date().toISOString(),
      });

      return {
        status: "failed",
        context: this.context!,
        incidents: this.incidentManager.getIncidents(this.context!.sys.instance_id),
        output: (this.context!.steps[this.context!.history[this.context!.history.length - 1] || ""] || {}) as Record<string, unknown>,
      };
    }
  }

  private buildContext(
    definition: ProcessDefinition,
    input?: Record<string, unknown>,
    initialVars?: Record<string, unknown>,
    systemOverrides?: Partial<ProcessSystem>,
  ): VariablesContext {
    const now = new Date().toISOString();
    return {
      sys: {
        process_id: definition["@id"],
        instance_id: `${definition["@id"]}-${Date.now()}`,
        owner: systemOverrides?.owner || "",
        process_owner: systemOverrides?.process_owner || "",
        owner_identifier: systemOverrides?.owner_identifier || "",
        initiator: systemOverrides?.initiator || "",
        project_id: systemOverrides?.project_id || "",
        started_at: systemOverrides?.started_at || now,
        is_dev: systemOverrides?.is_dev || false,
      },
      input: input || {},
      steps: {},
      vars: initialVars || {},
      history: [],
    };
  }

  private findStep(definition: ProcessDefinition, stepId: string): Step {
    const step = definition.steps.find((s) => s["@id"] === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }
    return step;
  }

  private async executeStep(
    step: Step,
    context: VariablesContext,
  ): Promise<Record<string, unknown>> {
    switch (step.step_type) {
      case "start":
        return {} as Record<string, unknown>;

      case "end":
        return {} as Record<string, unknown>;

      case "timer":
        if (step.duration) {
          const dur = parseDuration(step.duration);
          await this.ports.stepRuntime.sleep(`sleep-${step["@id"]}`, dur);
        }
        return { duration: step.duration ? parseDuration(step.duration) : "0 seconds" };

      case "user_task": {
          const waitResult = await this.ports.stepRuntime.wait(step["@id"]);
          return (waitResult as Record<string, unknown>) ?? {};
        }

      case "manual": {
        const manualResult = await this.ports.stepRuntime.wait(`resume-${step["@id"]}`);
        return (manualResult as Record<string, unknown>) ?? {};
      }

      case "gateway":
        return {};

      case "subprocess":
        if (!step.steps || step.steps.length === 0) return {};
        return this.executeSubprocess(step, context);

      default: {
        if (!step.action) {
          throw new Error(`Service step ${step["@id"]} has no action defined`);
        }

        const result = await this.runNodeWithRetry(step, context);

        // core.delay: node returns {duration_seconds}, engine calls sleep
        if (step.action === "core.delay" && result.duration_seconds !== undefined) {
          const name = `sleep-${step["@id"]}`;
          await this.ports.stepRuntime.sleep(name, Number(result.duration_seconds));
        }

        return result;
      }
    }
  }

  private async runNodeWithRetry(
    step: Step,
    context: VariablesContext,
  ): Promise<Record<string, unknown>> {
    const maxAttempts = step.retry?.max_attempts ?? 1;
    const baseDelayMs = step.retry?.delay_ms ?? 1000;
    const backoff = step.retry?.backoff ?? "exponential";
    const maxDelayMs = step.retry?.max_delay ?? 30000;

    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        return await this.ports.nodeHandler.execute(
          step.action!,
          step.params || {},
          context,
        );
      } catch (err: unknown) {
        if (attempt >= maxAttempts) throw err;

        const delay = backoff === "linear"
          ? Math.min(baseDelayMs * attempt, maxDelayMs)
          : Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

        await this.ports.stepRuntime.sleep(`retry-${step["@id"]}-${attempt}`, delay);
      }
    }
  }

  private async executeSubprocess(
    step: Step,
    parentContext: VariablesContext,
  ): Promise<Record<string, unknown>> {
    const subDef: ProcessDefinition = {
      "@context": "https://wr.io/workflow",
      "@type": "Process",
      "@id": `${parentContext.sys.process_id}.${step["@id"]}`,
      name: step.name,
      version: "1.0.0",
      entry_point_id: step.steps?.[0]?.["@id"] || "",
      steps: step.steps || [],
    };

    // Use a CHILD interpreter to avoid mutating parent this.context/this.definition.
    // Parent state is preserved; child gets its own isolated instance state.
    const child = new ProcessInterpreter({ ports: this.ports, maxErrorTransitions: this.maxErrorTransitions });
    const subResult = await child.run(
      subDef,
      parentContext.input as Record<string, unknown>,
      parentContext.vars as Record<string, unknown>,
      { ...parentContext.sys, process_id: `${parentContext.sys.process_id}.${step["@id"]}` },
    );

    if (subResult.status === "failed") {
      throw new Error(`Subprocess ${step["@id"]} failed`);
    }

    return subResult.output || {};
  }

  private async handleParallelFork(
    targetIds: string[],
    definition: ProcessDefinition,
    context: VariablesContext,
  ): Promise<string | undefined> {
    const joinTargetId = targetIds[targetIds.length - 1];

    const results = await Promise.allSettled(
      targetIds.map(async (targetId) => {
        const step = this.findStep(definition, targetId);
        const output = await this.executeStep(step, context);
        context.steps[targetId] = output;
        return { targetId, output };
      }),
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      throw new Error(
        `Parallel branch failed: ${(failed[0] as PromiseRejectedResult).reason}`,
      );
    }

    return joinTargetId;
  }

  private async offerRetryOrFail(
    step: Step,
    stepId: string,
    context: VariablesContext,
    errorMessage: string,
    errorStack?: string,
  ): Promise<void> {
    await this.appendHistory({
      event_type: "step_failed",
      instance_id: context.sys.instance_id,
      step_id: stepId,
      step_type: step.step_type,
      error: { message: errorMessage, stack: errorStack },
      timestamp: new Date().toISOString(),
    });

    const maxAttempts = step.retry?.max_attempts || 1;
    this.incidentManager.create(
      context.sys.instance_id,
      stepId,
      "step_failure",
      errorMessage,
      maxAttempts,
      "error",
    );

    if (step.retry) {
      await this.ports.jobQueue.enqueue({
        instance_id: context.sys.instance_id,
        step_id: stepId,
        attempt: 1,
        max_attempts: step.retry.max_attempts,
        due_at: new Date(Date.now() + (step.retry.delay_ms || 1000)).toISOString(),
        retry_config: step.retry,
      });
    }
  }

  private async appendHistory(event: HistoryEvent): Promise<void> {
    await this.ports.historyStore.append(event as unknown as Record<string, unknown>);
  }
}

function parseDuration(duration: string): string {
  const humanMatch = duration.match(/^(\d+)\s*(s|m|h|d)$/);
  if (humanMatch) {
    const [, value, unit] = humanMatch;
    const unitMap: Record<string, string> = {
      s: "seconds", m: "minutes", h: "hours", d: "days",
    };
    return `${value} ${unitMap[unit] || unit}`;
  }

  const isoMatch = duration.match(/^PT(\d+(?:\.\d+)?)([HMS])$/);
  if (isoMatch) {
    const isoUnitMap: Record<string, string> = { H: "hours", M: "minutes", S: "seconds" };
    return `${isoMatch[1]} ${isoUnitMap[isoMatch[2]] || isoMatch[2]}`;
  }

  return duration || "10 seconds";
}

function stepResultToOutput(
  context: VariablesContext,
  definition: ProcessDefinition,
): Record<string, unknown> {
  if (definition.outputs) {
    const result: Record<string, unknown> = {};
    for (const [key, path] of Object.entries(definition.outputs)) {
      result[key] = resolvePath(context, path);
    }
    return result;
  }

  const lastStepId = context.history[context.history.length - 1];
  if (lastStepId) {
    return (context.steps[lastStepId] || {}) as Record<string, unknown>;
  }

  return {} as Record<string, unknown>;
}

function resolvePath(
  context: VariablesContext,
  path: string,
): unknown {
  let parts = path.split(".");
  let current: unknown = context;

  if (parts[0] === "steps") {
    current = context.steps;
    parts = parts.slice(1);
  }

  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
