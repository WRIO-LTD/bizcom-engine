// OSS Built-in Handlers — platform-agnostic nodes that run on plain `fetch()`
// and standard JS APIs (no Cloudflare/enterprise infra required).
//
// ADR-001 / BizcomEngine_BDD.md declare these as the community "out of the box"
// node set:
//   - core.delay, core.jexl, core.noop, core.for_each, core.filter
//   - http.request
//   - web.fetch_content
//
// Usage (with in-memory adapters):
//   import { createInMemoryPorts, createBuiltinHandlers } from "@wrio/bizcom-engine";
//   const ports = createInMemoryPorts();
//   for (const [action, fn] of Object.entries(createBuiltinHandlers())) {
//     ports.nodeHandler.register(action, fn);
//   }

export { createBuiltinHandlers, BUILTIN_HANDLER_IDS } from "./builtin.js";
export type { BuiltinHandlerContext, BuiltinHandlers } from "./builtin.js";
