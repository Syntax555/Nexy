# Nexy

Nexy is a GitHub Pages/Jekyll site for selecting and comparing character profiles.

## Project Layout

- `_layouts/default.html` defines the shared HTML shell.
- `index.html` contains the home page structure and includes the selector UI.
- `_includes/character-selector-panel.html` contains the reusable left/right selector panel markup.
- `_includes/character-data.html` renders the Jekyll data payload for the browser.
- `assets/css/site.css` contains site styling.
- `assets/js/characters/data.js` prepares the browser data payload and shared catalogs.
- `assets/js/characters/engine.js` resolves stats, powers, effects, tooltips, and battle comparisons.
- `assets/js/characters/floating.js` keeps generated tooltips inside the visible viewport.
- `assets/js/characters/search.js` provides static fuzzy character search without a build step.
- `assets/js/characters/ui.js` contains selector and battle-screen DOM behavior.
- `_data/characters/entries/*.yml` contains one character profile per file.
- `_data/characters/schema.yml` documents the character data shape and rules.
- `schema/character-entry.schema.json` is the machine-readable shape check for character entries.
- `_data/characters/options/*.yml` contains predefined catalogs such as tiers, powers, media, and classifications.
- `assets/images/characters/<character-id>/` contains local images for that character.
- `scripts/validate_characters.rb` validates character data before building.
- `scripts/import_fandom_character.rb` creates manual-review drafts from VS Battles/Fandom pages.
- `scripts/trim_character_images.rb` optionally trims image whitespace with ImageMagick.
- `scripts/test_battle_fixtures.rb` checks small battle-rule fixtures.
- `test/fixtures/battle_rules.yml` contains battle scoring/status fixture cases.
- `.github/workflows/ci.yml` runs validation, fixture tests, JS syntax checks, and the production Jekyll build on GitHub.

## Adding Characters

Create one file per character:

```text
_data/characters/entries/ms-marvel.yml
```

Save local character images in the matching assets folder:

```text
assets/images/characters/ms-marvel/original-costume.webp
```

Reference that image path in the character key:

```yaml
images:
  - name: "Original Costume"
    image: "assets/images/characters/ms-marvel/original-costume.webp"
```

The filename is the character entry id. Use lowercase letters, numbers, and hyphens.

## Adding Powers, Equipment, And Attacks

Add reusable options under `_data/characters/options/` first, then reference those option ids from character entry files.

- Use `powers.yml` for reusable powers and per-power variants.
- Use `resistances.yml` for resistance definitions that point at resisted power ids.
- Use `equipment.yml` and `attacks.yml` for usable items or attacks/techniques.
- Use local `effects` on a character key only when that character uses the same catalog power differently.
- Use `derived_power_rules.yml` for powers granted automatically from stats.

This keeps character files focused on selection identity, key stats, owned powers/resistances, and chosen equipment or attacks.

## Drafting From VS Battles Pages

Use the importer only to create a review draft:

```bash
ruby scripts/import_fandom_character.rb "https://vsbattles.fandom.com/wiki/Agent_Venom" --out tmp/agent-venom-draft.yml
```

The script reads the public MediaWiki API and extracts likely stat lines, page image names, and source metadata. It does not write into `_data/characters/entries/` because every value still needs manual mapping to Nexy option ids and manual verification.

## Character Images

The browser trims visible image whitespace at runtime so existing assets can work without a required asset pipeline.

For cleaner source images, optionally trim copies offline with ImageMagick:

```bash
ruby scripts/trim_character_images.rb --check
ruby scripts/trim_character_images.rb --out tmp/trimmed-character-images
```

Review the generated files before replacing anything under `assets/images/characters/`.

## Speed Notes

`combat_speed` is the default speed. If it is the only speed set, the site displays only the tier, such as `Hypersonic`.

When multiple speeds are set, equal tiers are grouped:

```yaml
combat_speed: hypersonic
reaction_speed: hypersonic
travel_speed:
  value: subsonic
  label: "running speed"
```

This displays as `Hypersonic combat speed and reactions, Subsonic running speed`.

Use `note` for profile-specific details:

```yaml
reaction_speed:
  value: relativistic
  note: "with precognition"
```

## Checks

Run these before pushing changes:

```bash
ruby scripts/validate_characters.rb
ruby scripts/test_battle_fixtures.rb
node --check assets/js/characters/data.js
node --check assets/js/characters/engine.js
node --check assets/js/characters/floating.js
node --check assets/js/characters/search.js
node --check assets/js/characters/ui.js
JEKYLL_ENV=production bundle exec jekyll build
```

The same checks run in GitHub Actions on every push and pull request.
