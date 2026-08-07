import type { EnginePorts, INodeHandler, IStepRuntime, IHistoryStore, IJobQueue, IStateStore, ExpressionEvaluator } from "../ports/PORTS.js";
import type { VariablesContext } from "../model/context.js";
import type { HistoryEvent } from "../model/history.js";

export class InMemoryNodeHandler implements INodeHandler {
  private handlers = new Map<string, (params: Record<string, unknown>, context: VariablesContext) => Promise<Record<string, unknown>>>();

  register(
    action: string,
    fn: (params: Record<string, unknown>, context: VariablesContext) => Promise<Record<string, unknown>>,
  ) {
    this.handlers.set(action, fn);
  }

  async execute(
    action: string,
    params: Record<string, unknown>,
    context: VariablesContext,
  ): Promise<Record<string, unknown>> {
    const handler = this.handlers.get(action);
    if (!handler) {
      throw new Error(`No handler registered for action: ${action}`);
    }
    return handler(params, context);
  }
}

export class InMemoryStepRuntime implements IStepRuntime {
  listeners = new Map<string, Array<(payload: unknown) => void>>();
  sleepLogs: (number | string)[] = [];
  waitLogs: string[] = [];

  async sleep(_name: string, durationMs: number | string): Promise<void> {
    this.sleepLogs.push(durationMs);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async wait(eventType: string, _timeoutMs?: number): Promise<unknown> {
    this.waitLogs.push(eventType);
    const result = await new Promise((resolve) => {
      const list = this.listeners.get(eventType) || [];
      list.push(resolve);
      this.listeners.set(eventType, list);
    });
    return result;
  }

  async emit(eventType: string, payload: unknown): Promise<void> {
    const list = this.listeners.get(eventType);
    if (list) {
      list.forEach((resolve) => resolve(payload));
      this.listeners.delete(eventType);
    }
  }
}

export class InMemoryHistoryStore implements IHistoryStore {
  events: HistoryEvent[] = [];

  async append(event: Record<string, unknown>): Promise<void> {
    this.events.push(event as unknown as HistoryEvent);
  }
}

export class InMemoryJobQueue implements IJobQueue {
  items: Array<Record<string, unknown>> = [];

  async enqueue(item: Record<string, unknown>): Promise<void> {
    this.items.push(item);
  }
}

export class InMemoryStateStore implements IStateStore {
  private definitions = new Map<string, Record<string, unknown>>();
  private states = new Map<string, Record<string, unknown>>();

  setDefinition(processId: string, def: Record<string, unknown>) {
    this.definitions.set(processId, def);
  }

  async getDefinition(processId: string): Promise<Record<string, unknown> | null> {
    return this.definitions.get(processId) || null;
  }

  async saveState(instanceId: string, state: Record<string, unknown>): Promise<void> {
    this.states.set(instanceId, state);
  }

  getState(instanceId: string): Record<string, unknown> | undefined {
    return this.states.get(instanceId);
  }
}

export class InMemoryExpressionEvaluator implements ExpressionEvaluator {
  async evaluate(expression: string, context: Record<string, unknown>): Promise<boolean> {
    return simpleJexlEvaluate(expression, context);
  }
}

function simpleJexlEvaluate(expression: string, context: Record<string, unknown>): boolean {
  const expr = expression.trim();

  const compareMatch = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (compareMatch) {
    const [, left, op, right] = compareMatch;
    const leftVal = resolveJexlPath(left.trim(), context);
    const rightVal = resolveJexlValue(right.trim(), context);

    switch (op) {
      case "==": return leftVal == rightVal;
      case "!=": return leftVal != rightVal;
      case ">=": return Number(leftVal) >= Number(rightVal);
      case "<=": return Number(leftVal) <= Number(rightVal);
      case ">":  return Number(leftVal) > Number(rightVal);
      case "<":  return Number(leftVal) < Number(rightVal);
    }
  }

  const boolMatch = expr.match(/^(true|false)$/i);
  if (boolMatch) return boolMatch[1].toLowerCase() === "true";

  const truthyVal = resolveJexlPath(expr, context);
  return Boolean(truthyVal);
}

function flattenContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = flattenContext(value as Record<string, unknown>);
      for (const [nk, nv] of Object.entries(nested)) {
        result[`${key}.${nk}`] = nv;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function createInMemoryPorts(): {
  ports: EnginePorts;
  nodeHandler: InMemoryNodeHandler;
  stepRuntime: InMemoryStepRuntime;
  historyStore: InMemoryHistoryStore;
  jobQueue: InMemoryJobQueue;
  stateStore: InMemoryStateStore;
  evaluator: InMemoryExpressionEvaluator;
} {
  const nodeHandler = new InMemoryNodeHandler();
  const stepRuntime = new InMemoryStepRuntime();
  const historyStore = new InMemoryHistoryStore();
  const jobQueue = new InMemoryJobQueue();
  const stateStore = new InMemoryStateStore();
  const evaluator = new InMemoryExpressionEvaluator();

  return {
    ports: {
      nodeHandler,
      stepRuntime,
      historyStore,
      jobQueue,
      stateStore,
      evaluateCondition: evaluator,
    },
    nodeHandler,
    stepRuntime,
    historyStore,
    jobQueue,
    stateStore,
    evaluator,
  };
}

function resolveJexlPath(path: string, context: Record<string, unknown>): unknown {
  const trimmed = path.trim();

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  // Split on dots and bracket notation: "a.b[0].c" → ["a", "b", "0", "c"]
  const parts = trimmed
    .split(/[.[\]]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  let current: unknown = context;
  for (const part of parts) {
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function resolveJexlValue(val: string, context: Record<string, unknown>): unknown {
  return resolveJexlPath(val, context);
}
