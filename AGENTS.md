# AGENTS.md (bizcom-engine)

> Open-core BPMN execution engine. This package is mirrored to a public GitHub repo.

## Open-Core Boundary

**Core (OSS)**: `ProcessOrchestrator`, BPMN converter, Ports (interfaces), Base SDK, standard nodes.
**Enterprise (Proprietary)**: Infrastructure adapters, Stripe, AI nodes, proprietary UI components.

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
  engine/     # ProcessOrchestrator, execution loop, state management
  bpmn/       # BPMN 2.0 XML → JSON-LD converter
  ports/      # IStorageAdapter, IWorkflowExecutor, ILogRepository interfaces
  utils/      # Pure utilities
```

## Related docs

- `docs/strategies/bizcom-open-core-strategy.md` — full open-core strategy
- `.github/workflows/mirror-bizcom-engine.yml` — mirroring CI
- `scripts/ops/storage/sync-bizcom-pr.ts` — PR sync from public repo
