# @wrio/bizcom-engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-✓-3178C6?logo=typescript)](#)
[![Tests](https://img.shields.io/badge/tests-118-brightgreen)](#)
[![Mirror](https://img.shields.io/badge/mirror-automated-brightgreen)](#-source-of-truth)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

An open-core BPMN execution engine. A platform-agnostic workflow engine inspired by Camunda: parse BPMN 2.0, define processes in JSON-LD, execute them with gateways, error handling, and per-step retry — **without any Cloudflare dependency**.

> ⚠️ **Source of Truth**: This repo is a **read-only mirror** of `packages/bizcom-engine` in the [WRIO-LTD/monorepo](https://github.com/WRIO-LTD/monorepo). All development and CI/CD happen in the monorepo; approved PRs are synced back automatically.

## Using @wrio/bizcom-engine, you can:

- Define processes visually in [BPMN 2.0](https://www.omg.org/spec/BPMN/2.0.2/) and import them as JSON-LD
- Execute processes with exclusive, inclusive, and parallel gateways
- Handle errors with `on_error` transitions and per-step exponential-backoff retry
- Use built-in OSS nodes: `http.request`, `web.fetch_content`, `core.jexl`, `core.delay`, `core.for_each`, `core.filter`
- Run entirely in-memory — no database, no infrastructure, no Cloudflare
- Bring your own adapters (D1, Postgres, Redis, Kafka) through five thin ports
- Scale to production on Cloudflare via enterprise adapters (WRIO Cloud)

## Features

- **ProcessModel** — typed canonical model: `ProcessDefinition`, `Step`, `Transition`, `Gateway`, `VariablesContext`, `Incident`, `HistoryEvent`
- **BPMN round-trip** — `parseBpmn(xml)` (BPMN 2.0 → `ProcessDefinition`) and `serializeBpmn(definition)` (JSON-LD → BPMN 2.0 XML), Extended subset: tasks + exclusive/inclusive/parallel gateways + call activity + boundary events + subprocess
- **ProcessInterpreter** — pure graph interpreter: sequential execution, gateway routing, `on_error` transitions, subprocesses, per-step retry, incidents
- **VariablesContext** — `{sys, input, steps, vars, history}` with **jexl** expressions + `{{ ... }}` interpolation
- **Validator** — runtime checks (reachability, gateway balance, dead-ends, transition targets)
- **IncidentManager** — create/resolve/exhaust incidents with retry policies
- **Built-in OSS handlers** — `core.delay`, `core.jexl`, `core.noop`, `core.for_each`, `core.filter`, `http.request`, `web.fetch_content` — run on plain `fetch()`
- **Ports & Adapters** — `IStateStore`, `IHistoryStore`, `IStepRuntime`, `IJobQueue`, `INodeHandler` keep the core infra-free

## Quickstart

```bash
npm install @wrio/bizcom-engine
```

Run a process entirely in-memory — no Cloudflare, no database:

```ts
import {
  ProcessInterpreter,
  createInMemoryPorts,
  createBuiltinHandlers,
  JexlExpressionEvaluator,
} from "@wrio/bizcom-engine";

// 1. In-memory adapters + built-in nodes
const ports = createInMemoryPorts();
for (const [action, fn] of Object.entries(createBuiltinHandlers())) {
  ports.nodeHandler.register(action, fn);
}

// 2. Define a process (JSON-LD)
const definition = {
  "@context": "https://wr.io/workflow",
  "@type": "Process",
  "@id": "my-process",
  name: "My Process",
  version: "1.0.0",
  entry_point_id: "start",
  steps: [
    { "@type": "Step", "@id": "start", name: "Start", step_type: "start",
      transitions: [{ target_id: "calc" }] },
    { "@type": "Step", "@id": "calc", name: "Calculate", step_type: "service",
      action: "core.jexl", params: { expression: "input.amount * 2" },
      transitions: [{ target_id: "end" }] },
    { "@type": "Step", "@id": "end", name: "End", step_type: "end" },
  ],
};

// 3. Run it
const interpreter = new ProcessInterpreter({ ports: ports.ports });
const result = await interpreter.run(definition, { amount: 21 });
console.log(result.status);            // "completed"
console.log(result.context.steps);     // { start: {}, calc: { result: 42 }, end: {} }
console.log(result.context.history);   // ["start", "calc", "end"]
```

## BPMN round-trip

```ts
import { parseBpmn, serializeBpmn } from "@wrio/bizcom-engine";

// XML → ProcessDefinition
const definition = await parseBpmn(bpmnXml);

// ProcessDefinition → XML
const xml = serializeBpmn(definition);

// Full round-trip
const roundTripDef = await parseBpmn(serializeBpmn(definition));
```

## Custom node handlers

Beyond the built-ins, register your own business logic:

```ts
ports.nodeHandler.register("my.send_email", async (params, context) => {
  // params already interpolated with {{ vars.x }} / {{ input.y }}
  const res = await fetch(params.api_url, { method: "POST", body: JSON.stringify(params) });
  return { sent: res.ok };
});
```

## Retry & errors

Per-step retry is driven by `step.retry`:

```json
{
  "step_type": "service",
  "action": "http.request",
  "retry": { "max_attempts": 3, "delay_ms": 1000, "backoff": "exponential", "max_delay": 30000 },
  "transitions": [{ "target_id": "next" }, { "target_id": "error_handler", "on_error": true }]
}
```

On failure: node is retried per `retry` config; if it still throws, `on_error` transition is taken; otherwise an `Incident` is created and the process fails.

## Ports & Adapters

Core depends only on interfaces — bring your own infra:

| Port | Responsibility |
|---|---|
| `INodeHandler` | executes a step's `action` |
| `IStepRuntime` | `sleep` / `wait` / `emit` (timers, user tasks) |
| `IHistoryStore` | append-only event stream |
| `IJobQueue` | async retry/incident queue |
| `IStateStore` | definition + state persistence |

`createInMemoryPorts()` provides in-memory implementations for local/dev/CI use.

## Open-core boundary

**Core (OSS)**: `ProcessInterpreter`, model, BPMN parser/serializer, variables + jexl, validation, incidents, built-in handlers, ports.
**Enterprise (Proprietary)**: Cloudflare adapters (D1, R2, CF Workflows), enterprise handlers (`db.*`, `ai.chat`, `email.send`, `telegram.*`, `storage.*`, `rss.fetch`), Stripe.

## Status

[![Mirror](https://img.shields.io/badge/mirror-automated-brightgreen)](#-source-of-truth)

Track active development in the [monorepo](https://github.com/WRIO-LTD/monorepo) (private). Community contributions are reviewed here.

## Helpful Links

- [WRIO — product site](https://wr.io)
- [BizCom Engine BDD Spec](https://github.com/WRIO-LTD/monorepo/blob/master/docs/specs/bizcom/BizcomEngine_BDD.md)
- [Architecture Decision Records](https://github.com/WRIO-LTD/monorepo/tree/master/docs/adr/bizcom-engine)
- [Issue Tracker](https://github.com/WRIO-LTD/bizcom-engine/issues)
- [Discussions](https://github.com/WRIO-LTD/bizcom-engine/discussions)

## Contributing

1. Submit a PR to this repo.
2. Maintainers review it.
3. Approved PRs are pulled into `WRIO-LTD/monorepo`.
4. Changes are auto-mirrored back here.

See [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Core engine — MIT. Enterprise adapters and Cloudflare-specific code (not in this repo) — proprietary.

See [LICENSE](LICENSE) for details.
