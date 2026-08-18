import { describe, it, expect } from "vitest";
import { JexlExpressionEvaluator } from "./evaluator";
import { interpolate, interpolateParams } from "./interpolation";

describe("JexlExpressionEvaluator", () => {
  const evaluator = new JexlExpressionEvaluator();

  it("should evaluate simple boolean expression", async () => {
    const result = await evaluator.evaluate("vars.amount > 100", {
      vars: { amount: 150 },
    });
    expect(result).toBe(true);
  });

  it("should evaluate false condition", async () => {
    const result = await evaluator.evaluate("vars.amount > 100", {
      vars: { amount: 50 },
    });
    expect(result).toBe(false);
  });

  it("should evaluate equality", async () => {
    const result = await evaluator.evaluate('vars.status == "active"', {
      vars: { status: "active" },
    });
    expect(result).toBe(true);
  });

  it("should return false on syntax error", async () => {
    const result = await evaluator.evaluate("vars.x +== 5", { vars: { x: 1 } });
    expect(result).toBe(false);
  });

  it("should eval arbitrary expression", async () => {
    const result = await evaluator.eval("vars.x + vars.y", {
      vars: { x: 10, y: 20 },
    });
    expect(result).toBe(30);
  });

  it("should support transforms - length", async () => {
    const result = await evaluator.eval("vars.items|length", {
      vars: { items: [1, 2, 3] },
    });
    expect(result).toBe(3);
  });

  it("should support contains transform", async () => {
    const result = await evaluator.eval('vars.name|contains("test")', {
      vars: { name: "test_value" },
    });
    expect(result).toBe(true);
  });

  it("should support uuid function", async () => {
    const result = await evaluator.eval("uuid()", {});
    expect(typeof result).toBe("string");
    expect(result).toHaveLength(36);
  });
});

describe("Interpolation", () => {
  it("should interpolate simple template", async () => {
    const result = await interpolate("Hello {{vars.name}}", {
      vars: { name: "World" },
    });
    expect(result).toBe("Hello World");
  });

  it("should interpolate multiple expressions", async () => {
    const result = await interpolate("{{vars.a}} + {{vars.b}} = {{vars.a + vars.b}}", {
      vars: { a: 2, b: 3 },
    });
    expect(result).toBe("2 + 3 = 5");
  });

  it("should return raw value for single expression template", async () => {
    const result = await interpolate("{{vars.items | length}}", {
      vars: { items: [1, 2, 3] },
    });
    expect(result).toBe(3);
  });

  it("should replace missing expression with empty string", async () => {
    const result = await interpolate("Prefix {{missing}} suffix", {});
    expect(result).toBe("Prefix  suffix");
  });

  it("interpolateParams should handle nested objects", async () => {
    const result = await interpolateParams(
      {
        url: "https://api.example.com/{{vars.id}}",
        headers: {
          Authorization: "Bearer {{vars.token}}",
        },
        timeout: 5000,
      },
      { vars: { id: "123", token: "abc" } },
    );

    expect(result.url).toBe("https://api.example.com/123");
    expect(result.headers).toEqual({ Authorization: "Bearer abc" });
    expect(result.timeout).toBe(5000);
  });

  it("interpolateParams should handle arrays", async () => {
    const result = await interpolateParams(
      {
        recipients: ["{{vars.email}}", "admin@test.com"],
      },
      { vars: { email: "user@test.com" } },
    );

    expect(result.recipients).toEqual(["user@test.com", "admin@test.com"]);
  });
});
