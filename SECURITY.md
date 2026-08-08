# Security Policy

## Reporting a Vulnerability

Found a security issue? Please **do not** open a public issue.

Email us at **info@wr.io**. We will respond within 48 hours with the next steps and keep you updated on the resolution timeline.

## Supported versions

| Version | Status |
|---|---|
| 2.x | ✅ Active |
| < 2.0 | ❌ Deprecated |

## Scope

This repo (`@wrio/bizcom-engine`) is a read-only mirror. The primary codebase is in `WRIO-LTD/monorepo` (private). Vulnerability reports for the engine will be triaged and fixed in the monorepo, then automatically mirrored back.

## Security model

The engine is a **pure TypeScript interpreter** — it does not execute native code, open files, or make network calls on its own. All I/O occurs through **ports** (`INodeHandler`, `IStepRuntime`, ...) which the integrator provides. Security of I/O adapters is the integrator's responsibility.

When used with the enterprise Cloudflare adapters (WRIO Cloud), the following additional measures are active:
- jexl expressions are sandboxed — never exposes `secrets`/env to user-defined expressions
- API tokens and private keys are excluded from the interpolation context (`SECRETS_ALLOWLIST`)
