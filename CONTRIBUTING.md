# Contributing to Nexy

Thank you for helping improve Nexy. Keep changes focused, explain the user or
maintenance benefit, and include tests when behavior changes.

## Set up the project

Use Node.js 24.x (see `.node-version`) and pnpm 11.9.0:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Do not edit `src/generated/nexy-data.json`, `public/images/generated/`,
`public/image-rights.json`, or `public/og.png` by hand. Their source files live
below `content/`.

## Make a change

- Keep the engine deterministic and free of DOM or network dependencies.
- Preserve strict TypeScript settings; do not hide errors with broad casts or
  disabled checks.
- Add or update focused unit tests for logic and component behavior.
- Add Playwright coverage for browser-specific, responsive, or accessibility
  behavior.
- Follow the content and artwork rights guidance in the README and
  `CONTENT-LICENSE.md`. Unverified artwork is withheld unless the repository
  operator explicitly opts in that exact record.
- Keep pull requests narrowly scoped. Mention generated-file changes and any
  intentional parity changes in the description.

Run `pnpm format` after editing supported source or configuration files. Use
`pnpm lint:fix` only after reviewing its changes.

## Verify the change

During development:

```bash
pnpm check:fast
```

Before requesting review:

```bash
pnpm check
```

For interaction, responsive-layout, or accessibility changes:

```bash
pnpm check:full
```

`check:fast` validates authored content, lint and formatting, all four
TypeScript projects, and coverage-enforced tests. `check` also creates the
production bundle. `check:full` adds the five Playwright browser/device
projects.

## Report a problem

Use a normal GitHub issue for reproducible bugs and feature proposals. Do not
put vulnerability details or secrets in a public issue; follow `SECURITY.md`.
Rights-holder, attribution, trademark, and artwork-removal requests use the
dedicated rights-holder issue form linked from the README.
