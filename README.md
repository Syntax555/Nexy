# Nexy

Nexy is a GitHub Pages/Jekyll site for selecting and comparing character profiles.

## Project Layout

- `_layouts/default.html` defines the shared HTML shell.
- `index.html` contains the home page structure and includes the selector UI.
- `_includes/character-selector-panel.html` contains the reusable left/right selector panel markup.
- `_includes/character-data.html` renders the Jekyll data payload for the browser.
- `assets/css/site.css` contains site styling.
- `assets/js/character-selector.js` contains the selector behavior.
- `_data/characters/entries/*.yml` contains one character profile per file.
- `_data/characters/entries/empty.yml` contains the safe fallback character.
- `_data/characters/schema.yml` documents the character data shape and rules.
- `_data/characters/options/*.yml` contains predefined catalogs such as tiers, powers, media, and classifications.
- `assets/images/characters/<character-id>/` contains local images for that character.
- `scripts/validate_characters.rb` validates character data before building.

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

## Checks

Run these before pushing changes:

```bash
ruby scripts/validate_characters.rb
JEKYLL_ENV=production bundle exec jekyll build
```
