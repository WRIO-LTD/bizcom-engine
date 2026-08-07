/// <reference path="../../jexl.d.ts" />
import jexl from "jexl";
import type { ExpressionEvaluator } from "../ports/PORTS.js";

jexl.addTransform("concat", (arr1: unknown, arr2: unknown) => {
  const first = Array.isArray(arr1) ? arr1 : [];
  const second = Array.isArray(arr2) ? arr2 : [];
  return (first as unknown[]).concat(second as unknown[]);
});

jexl.addTransform("length", (val: unknown) => {
  if (Array.isArray(val) || typeof val === "string") return (val as { length: number }).length;
  return 0;
});

jexl.addTransform("toLowerCase", (val: unknown) => String(val || "").toLowerCase());
jexl.addTransform("toUpperCase", (val: unknown) => String(val || "").toUpperCase());
jexl.addTransform("trim", (val: unknown) => String(val || "").trim());

jexl.addTransform("replace", (val: unknown, search: string, replacement: string) => {
  if (typeof val !== "string") return val;
  try {
    if (search.startsWith("/") && search.endsWith("/")) {
      const inner = search.slice(1, -1);
      const lastSlash = inner.lastIndexOf("/");
      const pattern = inner.slice(0, lastSlash);
      const flags = inner.slice(lastSlash + 1);
      return val.replace(new RegExp(pattern, flags || "g"), replacement);
    }
  } catch {
    return val.split(search).join(replacement);
  }
  return val.split(search).join(replacement);
});

jexl.addTransform("contains", (val: unknown, search: string) =>
  String(val || "").includes(search),
);
jexl.addTransform("includes", (val: unknown, search: string) =>
  String(val || "").includes(search),
);
jexl.addTransform("startsWith", (val: unknown, search: string) =>
  String(val || "").startsWith(search),
);
jexl.addTransform("endsWith", (val: unknown, search: string) =>
  String(val || "").endsWith(search),
);
jexl.addTransform("join", (val: unknown, separator = ",") => {
  if (Array.isArray(val)) return val.join(separator as string);
  return String(val || "");
});
jexl.addTransform("split", (val: unknown, separator = ",") =>
  String(val || "").split(separator as string),
);

jexl.addTransform("jsonParse", (val: unknown) => {
  try {
    return typeof val === "string" ? JSON.parse(val) : val;
  } catch {
    return val;
  }
});

jexl.addTransform("encode", (val: unknown) =>
  encodeURIComponent(String(val || "")),
);
jexl.addTransform("decode", (val: unknown) =>
  decodeURIComponent(String(val || "")),
);

jexl.addFunction("now", () => Date.now());
jexl.addFunction("isoNow", () => new Date().toISOString());
jexl.addFunction("timestamp", () => Date.now());
jexl.addFunction("error", (message: unknown) => {
  throw new Error(String(message || "Workflow step failed"));
});

try {
  jexl.addFunction("uuid", () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "idx-" + Math.random().toString(36).slice(2) + "-" + Date.now();
  });
} catch {
  // crypto may not be available in all environments
}

export class JexlExpressionEvaluator implements ExpressionEvaluator {
  /**
   * Evaluate condition for transitions. Returns false on error (matches
   * original GeneralWorkflow.getNextStepId semantics: bad condition →
   * transition not taken, fall to default). For explicit BDD-faithful
   * behavior use evalOrThrow().
   */
  async evaluate(expression: string, context: Record<string, unknown>): Promise<boolean> {
    try {
      const result = await jexl.eval(expression, context);
      return Boolean(result);
    } catch {
      return false;
    }
  }

  /**
   * Evaluate ANY jexl expression. THROWS on syntax/runtime error
   * (matches BDD "Expression syntax error" scenario). Use for core.jexl node
   * and other callers that need explicit error semantics.
   */
  async eval(expression: string, context: Record<string, unknown>): Promise<unknown> {
    return jexl.eval(expression, context);
  }

  /** Like eval() but returns boolean. Throws on error (BDD-faithful). */
  async evalOrThrow(expression: string, context: Record<string, unknown>): Promise<boolean> {
    const result = await jexl.eval(expression, context);
    return Boolean(result);
  }
}
