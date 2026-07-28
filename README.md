# Nexy Battle Lab

Nexy is a deterministic, data-driven character matchup site published at
[syntax555.github.io/Nexy](https://syntax555.github.io/Nexy/).

The project is a fully static TypeScript application. Character data is authored
in YAML, validated and compiled at build time, then evaluated in the browser by
a pure rules engine. It does not use Jekyll, Ruby, a database, or a server
runtime.

## Stack

- **TypeScript 7** for strict types across the data model, rules engine, tooling,
  and interface
- **Preact 10** for a small component runtime
- **Vite 8** for fast development and optimized static production bundles
- **YAML + Zod** for readable source data with structural and semantic validation
- **Vitest** for engine, content-pipeline, search, URL-state, and component tests
- **Playwright + axe-core** for Chromium, Firefox, WebKit, mobile, responsive,
  and automated WCAG browser checks
- **Sharp** for build-time character thumbnails, profile images, and social-card
  optimization
- **GitHub Actions + GitHub Pages** for validation and static deployment

The production build uses `/Nexy/` as its base path so scripts, styles, images,
and shared matchup URLs work from the GitHub Pages project URL.

## Intellectual property

Nexy is an unofficial, non-commercial fan project and is not affiliated with,
sponsored by, endorsed by, or approved by Marvel, DC, or any other rights
holder. Character names, likenesses, artwork, logos, trademarks, story
elements, and other third-party material remain subject to the rights of their
respective owners.

The website includes a visible
[Legal & removal requests](https://syntax555.github.io/Nexy/legal.html) notice.
Rights holders or their authorized representatives can request review,
correction, or removal through the repository's
[rights-holder request form](https://github.com/Syntax555/Nexy/issues/new?template=rights-holder-request.yml).
VS Battles Wiki-derived text and structured data attribution is documented in
[CONTENT-LICENSE.md](CONTENT-LICENSE.md). A disclaimer is not a substitute for
permission or a licence. At the repository operator's direction, the current
character artwork is displayed while remaining honestly marked
`unverified-third-party`. Every such image requires an explicit per-record
`publish_unverified: true` opt-in and is paired with its exact source-file link,
an unverified-rights warning, and the removal route. The flag is a publication
choice, not evidence of ownership, permission, fair use, or a licence. Future
unverified images remain withheld unless explicitly opted in. The generated
[image rights manifest](https://syntax555.github.io/Nexy/image-rights.json)
records the source, status, review date, and publication decision for each
image reference.

## Gameplay model

Nexy is a transparent matchup comparator rather than a turn-based combat
simulation.

1. Each side selects a character and one of its combat forms.
2. The engine resolves standard equipment, attacks, explicit powers, recursive
   grants, derived abilities, resistances, and stat effects.
3. Nullification, absorption, resistance negation, and non-physical interaction
   are resolved until both profiles reach a stable state.
4. Ranked combat statistics contribute comparison points. Tier is shown but is
   not counted separately because it is derived from attack potency.
5. Interaction advantages and deterministic tie-break rules produce the final
   verdict.

Ruleset v1 also detects reciprocal counter loops and suppresses cycling
capabilities consistently, so swapping the left and right fighters does not
change the underlying result.

## Architecture

```text
.
|-- content/
|   |-- catalogs/             # Shared powers, tiers, equipment, verses, and rules
|   |-- characters/           # One human-authored YAML file per character
|   `-- images/               # Build sources such as the social card
|-- public/
|   |-- images/characters/    # Original character artwork, grouped by entry id
|   `-- .nojekyll             # Serve the Vite output without Jekyll processing
|-- src/
|   |-- app/                  # Application state, assets, theme, and URL state
|   |-- components/           # Preact interface components
|   |-- domain/               # Shared data and report types
|   |-- engine/               # Pure deterministic matchup engine
|   |-- generated/            # Compiled character/catalog JSON
|   |-- search/               # Dependency-free roster search
|   `-- styles/               # Tokens, global styles, layout, and battle views
|-- tools/
|   |-- content/              # YAML compiler, schemas, and character scaffolder
|   `-- images/               # Responsive image generation
|-- tests/                    # Automated tests and parity fixtures
|-- index.html                # Vite document entry point
`-- vite.config.ts            # Build configuration and GitHub Pages base path
```

The boundaries are intentional:

- `content/` is the editable source of truth.
- `tools/content/` rejects malformed YAML, invalid references, duplicate IDs,
  broken rank tables, unsafe image paths, and missing local assets.
- `src/engine/` consumes typed data and returns structured reports without
  touching the DOM or generating HTML.
- Preact components render those reports and manage only interface state.

## Local development

Install Node.js 24 or newer and pnpm 11.9.0, then run:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` compiles the YAML and generates optimized images before starting
Vite. Open:

```text
http://127.0.0.1:5173/Nexy/
```

To inspect the production bundle locally:

```bash
pnpm build
pnpm preview
```

The preview is available at `http://127.0.0.1:4173/Nexy/`.

## Add a character

Start with the TypeScript scaffolder:

```bash
pnpm character:new -- --id storm-marvel-mainstream --name "Storm" --identity "Ororo Munroe" --verse marvel-mainstream --gender female --source-url "https://vsbattles.fandom.com/wiki/Storm_(Marvel_Comics)"
```

Preview the YAML without writing anything:

```bash
pnpm character:new -- --id storm-marvel-mainstream --name "Storm" --verse marvel-mainstream --source-url "https://vsbattles.fandom.com/wiki/Storm_(Marvel_Comics)" --dry-run
```

`--source-url` is required. The command validates the source URL, verse, and
gender IDs, refuses to overwrite an existing entry, and creates:

```text
content/characters/storm-marvel-mainstream.yaml
public/images/characters/storm-marvel-mainstream/
```

Next:

1. Research and verify the profile source and authored statistics.
2. Add artwork only when you can document its source and public-use rights.
3. Replace the scaffold statistics with researched values.
4. Reference reusable catalog IDs from `content/catalogs/`.
5. Run `pnpm content:build` and then `pnpm check`.

Character filenames, entry IDs, and form IDs use lowercase letters, numbers,
and single hyphens. The entry ID is derived from the YAML filename. A character
can have multiple forms by adding objects to `keys`.

A local image reference is relative to `public/`:

```yaml
images:
  - name: "Classic suit"
    image: "images/characters/storm-marvel-mainstream/classic.webp"
    source_url: "https://example.com/original-file-page"
    rights_status: licensed
    rights_holder: "Example rights holder"
    license: "CC BY 4.0"
    reviewed_on: "2026-07-28"
```

Local artwork must remain inside the matching character directory. Validation
rejects missing files, parent-directory traversal, backslashes, and references
to another character's directory. WebP is recommended for source artwork, but
PNG, JPEG, AVIF, and WebP are accepted by the image build.

The scaffolder can create an unverified image record when all three image
flags are provided together:

```bash
pnpm character:new -- \
  --id storm-marvel-mainstream \
  --name "Storm" \
  --verse marvel-mainstream \
  --source-url "https://vsbattles.fandom.com/wiki/Storm_(Marvel_Comics)" \
  --image storm.webp \
  --image-source-url "https://vsbattles.fandom.com/wiki/File:Example.png" \
  --image-rights-holder "Unverified; Marvel and/or the original artist"
```

That scaffold uses `unverified-third-party`, so the file is recorded but not
published by default. If the repository operator deliberately chooses to show
that exact unverified image, add `publish_unverified: true` to its image record.
Doing so enables the warning-backed display but does not change its rights
status or create a licence. Prefer replacing it with documented licensed,
permitted, public-domain, or original artwork.

Simple ranked statistics can use a catalog ID directly:

```yaml
attack_potency: large-building
combat_speed: hypersonic
```

Use the expanded form for a modifier or explanatory note:

```yaml
attack_potency:
  value: large-building
  modifier: higher
  note: "with charged energy output"
```

Reusable powers, variants, resistances, attacks, equipment, tiers, and derived
rules live in `content/catalogs/`. Prefer a stable catalog reference over
duplicating shared behavior in an individual character.

## Content and image pipeline

Validate all YAML, referenced local images, and confirm that the checked-in
generated JSON is current without rewriting it:

```bash
pnpm content:check
```

Compile the validated YAML to `src/generated/nexy-data.json`:

```bash
pnpm content:build
```

Do not edit the generated JSON by hand. Change the YAML source and rebuild it.

Generate enabled 160 px roster thumbnails, enabled 640 px profile images,
the public image-rights manifest, and the optimized 1200 x 630 social card:

```bash
pnpm images:build
```

Generated image variants are written below `public/images/generated/`. The
production post-build removes all full-size character sources and unpublished
variants from `dist/` before GitHub Pages uploads it; the 160 px and 640 px
variants are the only character image files needed by the website. The
social-card source is `content/images/og-source.png`; its generated public file
is `public/og.png`.

## Validation and tests

The main commands are:

```bash
pnpm typecheck        # Strict TypeScript checks
pnpm test             # Run the test suite once
pnpm test:watch       # Run affected tests while developing
pnpm test:coverage    # Run tests with coverage enforcement
pnpm test:e2e         # Build and test in five desktop/mobile browser projects
pnpm build            # Compile content/images and create dist/
pnpm check            # Validate content, typecheck, test, and production-build
```

`pnpm check` already includes the production build, so it is the single
pre-push command for a complete verification.

### Legacy parity fixture

`tests/fixtures/legacy-parity.json` is an immutable snapshot captured from the
old Jekyll/JavaScript engine at commit
`66e22416331bbeced0554e85112f6992eeff41ab`. It contains digests for all 21
forms and all 441 ordered matchups. The tests compare the replacement engine
against that independent baseline; do not regenerate the fixture with the
current TypeScript engine when changing rules. If a future ruleset intentionally
changes outcomes, preserve this fixture and add a separately versioned one with
its own source and generation notes.

## GitHub Pages deployment

The workflow in `.github/workflows/ci.yml` runs `pnpm check` plus real-browser
Playwright and axe-core tests for pull requests, pushes to `main`, and manual
runs. A successful `main` run uploads `dist/` and deploys it with the official
GitHub Pages actions. Pull requests validate the same code without deploying.

In the repository settings, configure **Pages > Build and deployment > Source**
to **GitHub Actions**. No Jekyll theme, Pages gem, or branch-generated `_site/`
directory is used.

If the repository or account name changes, update `VITE_BASE_PATH` in the
workflow, the default `base` in `vite.config.ts`, the canonical/social URLs in
`index.html`, the return link in `public/404.html`, and the URLs in
`public/robots.txt` and `public/sitemap.xml`.
