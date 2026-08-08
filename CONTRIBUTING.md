# Contributing to @wrio/bizcom-engine

Thank you for your interest in contributing!

## This repo is a mirror

`WRIO-LTD/bizcom-engine` is a **read-only mirror** of `packages/bizcom-engine` in the [WRIO-LTD/monorepo](https://github.com/WRIO-LTD/monorepo). All development and CI/CD happen in the monorepo.

## How to contribute

1. **Submit a PR** to this repository.
2. A maintainer reviews it.
3. Approved PRs are pulled into the monorepo using a sync script.
4. Once merged into the monorepo's `master` branch, changes are automatically mirrored back here.

Please do not be surprised if your PR is closed with a reference to a commit in the monorepo — this is how we maintain a single source of truth.

## Development

To set up a local development environment:

```bash
git clone https://github.com/WRIO-LTD/bizcom-engine.git
cd bizcom-engine
npm install
npm run check   # tsc --noEmit
npm test        # vitest run (118 tests)
```

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):
- `feat(scope): description` — new feature
- `fix(scope): description` — bug fix
- `refactor(scope): description` — code change, no feature/fix
- `docs(scope): description` — documentation only
- `test(scope): description` — test additions/changes
- `ci(scope): description` — CI/CD changes

## Questions?

Open a [discussion](https://github.com/WRIO-LTD/bizcom-engine/discussions) or [issue](https://github.com/WRIO-LTD/bizcom-engine/issues).
