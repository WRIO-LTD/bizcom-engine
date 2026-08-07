/// <reference path="../../jexl.d.ts" />
import jexl from "jexl";

export async function interpolate(
  template: string,
  context: Record<string, unknown>,
): Promise<unknown> {
  const trimmed = template.trim();

  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    const matches = trimmed.match(/\{\{/g);
    if (matches && matches.length === 1) {
      const expression = trimmed.slice(2, -2).trim();
      try {
        return await jexl.eval(expression, context);
      } catch {
        return undefined;
      }
    }
  }

  const regex = /\{\{(.+?)\}\}/g;
  let result = template;

  for (const match of result.matchAll(regex)) {
    const expression = match[1].trim();
    try {
      const value = await jexl.eval(expression, context);
      result = result.replace(match[0], String(value ?? ""));
    } catch {
      result = result.replace(match[0], "");
    }
  }

  return result;
}

export async function interpolateParams(
  paramsTemplate: Record<string, unknown>,
  context: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(paramsTemplate)) {
    if (typeof value === "string") {
      result[key] = await interpolate(value, context);
    } else if (Array.isArray(value)) {
      result[key] = await Promise.all(
        value.map((item) =>
          typeof item === "string" ? interpolate(item, context) : item,
        ),
      );
    } else if (value && typeof value === "object") {
      result[key] = await interpolateParams(
        value as Record<string, unknown>,
        context,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
