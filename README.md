# Nexy

Nexy is a GitHub Pages/Jekyll site for selecting and comparing character profiles.

## Project Layout

- `_layouts/default.html` defines the shared HTML shell.
- `index.html` contains the home page structure and includes the selector UI.
- `_includes/character-selector-panel.html` contains the reusable left/right selector panel markup.
- `_includes/character-data.html` renders the Jekyll data payload for the browser.
- `assets/css/site.css` contains site styling.
- `assets/js/character-selector.js` contains the selector behavior.
- `_data/characters/characters.yml` contains real character entries.
- `_data/characters/empty_character.yml` contains the safe fallback character.
- `_data/characters/schema.yml` documents the character data shape and rules.
- `_data/characters/options/*.yml` contains predefined catalogs such as tiers, powers, media, and classifications.
- `scripts/validate_characters.rb` validates character data before building.

## Checks

Run these before pushing changes:

```bash
ruby scripts/validate_characters.rb
JEKYLL_ENV=production bundle exec jekyll build
```
