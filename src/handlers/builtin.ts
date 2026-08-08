import type { INodeHandler } from "../ports/PORTS.js";
import type { VariablesContext } from "../model/context.js";
import { JexlExpressionEvaluator } from "../variables/evaluator.js";

export interface BuiltinHandlerContext {
  fetchFn?: typeof fetch;
  logFn?: (msg: string) => void;
}

export const BUILTIN_HANDLER_IDS = [
  "core.delay",
  "core.jexl",
  "core.noop",
  "core.for_each",
  "core.filter",
  "http.request",
  "web.fetch_content",
] as const;

const jexlEvaluator = new JexlExpressionEvaluator();

/**
 * Create the built-in OSS node handlers. These run on plain `fetch()` and
 * standard JS APIs — no Cloudflare/enterprise infra required. Community users
 * can attach them to a handler registry directly:
 *
 *   const ports = createInMemoryPorts();
 *   for (const [action, fn] of Object.entries(createBuiltinHandlers())) {
 *     ports.nodeHandler.register(action, fn);
 *   }
 */
export function createBuiltinHandlers(opts?: BuiltinHandlerContext): Record<string, (params: Record<string, unknown>, ctx: VariablesContext) => Promise<Record<string, unknown>>> {
  const fetchFn = opts?.fetchFn ?? globalThis.fetch;

  const handlers: Record<string, (params: Record<string, unknown>, ctx: VariablesContext) => Promise<Record<string, unknown>>> = {
    "core.noop": async () => ({}),

    "core.delay": async (params) => {
      const seconds = Number(params.duration_seconds ?? params.seconds ?? 0);
      const ms = Math.max(0, seconds * 1000);
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { duration_seconds: seconds };
    },

    "core.jexl": async (params, ctx) => {
      const expression = String(params.expression ?? "");
      if (!expression) {
        throw new Error("core.jexl: missing expression param");
      }
      // Sandbox: evaluate against sys/input/steps/vars/history ONLY.
      // Never expose `secrets`/env to user-defined jexl expressions (injection).
      const sandboxCtx: Record<string, unknown> = {
        sys: ctx.sys,
        input: ctx.input,
        steps: ctx.steps,
        vars: ctx.vars,
        history: ctx.history,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await jexlEvaluator.eval(expression, sandboxCtx);
      return { result };
    },

    "core.for_each": async (params, ctx) => {
      const collection = resolveValue(params.collection, ctx);
      const bodyAction = String(params.body_action ?? "");
      if (!Array.isArray(collection)) {
        throw new Error("core.for_each: collection must resolve to an array");
      }
      if (!bodyAction) {
        throw new Error("core.for_each: missing body_action");
      }
      const itemKey = String(params.item_key ?? "item");
      const results: unknown[] = [];
      for (const item of collection) {
        const itemCtx: VariablesContext = {
          ...ctx,
          input: { ...ctx.input, [itemKey]: item },
          vars: { ...ctx.vars, [itemKey]: item },
        };
        const itemOutput = await runHandlerRecursive(handlers, bodyAction, (params.body_params ?? {}) as Record<string, unknown>, itemCtx);
        results.push(itemOutput);
      }
      return { results, count: results.length };
    },

    "core.filter": async (params, ctx) => {
      const collection = resolveValue(params.collection, ctx);
      if (!Array.isArray(collection)) {
        throw new Error("core.filter: collection must resolve to an array");
      }
      const condition = String(params.condition ?? "");
      const filtered: unknown[] = [];
      for (const item of collection) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemCtx: Record<string, unknown> = {
          ...(ctx as any), // AS_ANY_JUSTIFICATION: spread of VariablesContext into Record for jexl eval
          item,
          vars: { ...ctx.vars, item },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keep = await jexlEvaluator.eval(condition, itemCtx);
        if (Boolean(keep)) filtered.push(item);
      }
      return { results: filtered, count: filtered.length };
    },

    "http.request": async (params) => {
      const url = String(params.url ?? "");
      if (!url) throw new Error("http.request: missing url");
      const method = String(params.method ?? "GET").toUpperCase();
      const headers = (params.headers as Record<string, string>) || {};
      const timeoutMs = Number(params.timeout ?? 10000);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const body = params.body !== undefined ? JSON.stringify(params.body) : undefined;
        const res = await fetchFn(url, {
          method,
          headers: body ? { ...headers, "Content-Type": "application/json" } : headers,
          body,
          signal: controller.signal,
        });
        const contentType = res.headers.get("content-type") || "";
        let data: unknown;
        if (contentType.includes("application/json")) {
          data = await res.json();
        } else {
          data = await res.text();
        }
        if (!res.ok) {
          throw new Error(`HTTP_ERROR: ${res.status} ${res.statusText}`);
        }
        const headerMap: Record<string, string> = {};
        res.headers.forEach((value, key) => { headerMap[key] = value; });
        return { status: res.status, body: data, headers: headerMap };
      } finally {
        clearTimeout(timer);
      }
    },

    "web.fetch_content": async (params) => {
      const url = String(params.url ?? "");
      if (!url) throw new Error("web.fetch_content: missing url");
      const res = await fetchFn(url, { headers: (params.headers as Record<string, string>) || {} });
      if (!res.ok) throw new Error(`HTTP_ERROR: ${res.status} ${res.statusText}`);
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      return {
        content: text,
        content_type: contentType,
        url,
      };
    },
  };

  return handlers;
}

function resolveValue(ref: unknown, ctx: VariablesContext): unknown {
  if (typeof ref !== "string") return ref;
  const trimmed = ref.trim();
  if (trimmed.startsWith("vars.") || trimmed.startsWith("input.") || trimmed.startsWith("steps.") || trimmed.startsWith("sys.")) {
    const parts = trimmed.split(".");
    let current: unknown = ctx;
    for (const part of parts) {
      if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }
  return ref;
}

async function runHandlerRecursive(
  handlers: Record<string, (p: Record<string, unknown>, c: VariablesContext) => Promise<Record<string, unknown>>>,
  action: string,
  params: Record<string, unknown>,
  ctx: VariablesContext,
): Promise<Record<string, unknown>> {
  const fn = handlers[action];
  if (!fn) throw new Error(`No builtin handler for action: ${action}`);
  return fn(params, ctx);
}

export type BuiltinHandlers = ReturnType<typeof createBuiltinHandlers>;
