import type { Step, Transition } from "../model/types.js";
import type { VariablesContext } from "../model/context.js";

export interface INodeHandler {
  execute(
    action: string,
    params: Record<string, unknown>,
    context: VariablesContext,
  ): Promise<Record<string, unknown>>;
}

export interface IStepRuntime {
  sleep(name: string, durationMs: number | string): Promise<void>;
  wait(eventType: string, timeoutMs?: number): Promise<unknown>;
  emit(eventType: string, payload: unknown): Promise<void>;
}

export interface IHistoryStore {
  append(event: Record<string, unknown>): Promise<void>;
}

export interface IJobQueue {
  enqueue(item: Record<string, unknown>): Promise<void>;
}

export interface IStateStore {
  getDefinition(processId: string): Promise<Record<string, unknown> | null>;
  saveState(instanceId: string, state: Record<string, unknown>): Promise<void>;
}

export interface ExpressionEvaluator {
  evaluate(expression: string, context: Record<string, unknown>): Promise<boolean>;
}

export interface EnginePorts {
  nodeHandler: INodeHandler;
  stepRuntime: IStepRuntime;
  historyStore: IHistoryStore;
  jobQueue: IJobQueue;
  stateStore: IStateStore;
  evaluateCondition: ExpressionEvaluator;
}
