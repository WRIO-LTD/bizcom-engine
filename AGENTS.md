# AGENTS.md (bizcom-engine)

> Open-core BPMN execution engine. This package is mirrored to a public GitHub repo.

## Open-Core Boundary

**Core (OSS)**: `ProcessInterpreter`, ProcessModel types, BPMN parser + serializer (Extended subset), VariablesContext + jexl, Validation, incident/retry model, Ports (`IStateStore`, `IHistoryStore`, `IStepRuntime`, `IJobQueue`, `INodeHandler`). OSS built-in handlers (`http.request`, `web.fetch_content`, `core.*`) — implemented in `src/handlers/builtin.ts` (`createBuiltinHandlers()`), run on plain `fetch()` only.
**Enterprise (Proprietary)**: CF infrastructure adapters (D1, R2, CF Workflows), enterprise handlers (`db.*`, `ai.chat`, `email.send`, `telegram.*`, `storage.*`, `rss.fetch`), Stripe, proprietary UI components.

## Key Rules

- **Ports & Adapters**: Core depends only on interfaces (`IPorts`). Enterprise adapters injected at composition root.
- **No platform dependencies**: No Cloudflare-specific imports (D1, R2, KV, Service Bindings).
- **Dependencies**: Only public `@wrio/*` packages + public npm. No internal workspace packages that aren't public.
- **Mirroring**: Auto-synced to `WRIO-LTD/bizcom-engine` via GitHub Actions on every push to master that touches this directory.

## When working here

- Before adding a dependency → verify it's public or abstract it behind a Port
- Before changing a public export → `pnpm knip --trace-export <name>` from root
- After changes → `pnpm run lint && pnpm run typecheck` from this directory

## Directory structure

```
src/
  model/      # Canonical domain types (ProcessDefinition, Step, VariablesContext, Incident, HistoryEvent)
  engine/     # ProcessInterpreter, execution loop, state management
  bpmn/       # BPMN 2.0 XML ↔ JSON-LD converter (parser + serializer)
  handlers/   # Built-in OSS handlers (http.request, web.fetch_content, core.*)
  variables/  # VariablesContext, jexl evaluator, interpolation
  incidents/  # IncidentManager, retry policies
  validation/ # Runtime definition validation
  ports/      # IStateStore, IHistoryStore, IStepRuntime, IJobQueue, INodeHandler interfaces
  utils/      # Pure utilities
```

## Related docs

- `docs/strategies/bizcom-open-core-strategy.md` — full open-core strategy
- `.github/workflows/mirror-bizcom-engine.yml` — mirroring CI
- `scripts/ops/storage/sync-bizcom-pr.ts` — PR sync from public repo
