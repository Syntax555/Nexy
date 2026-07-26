# Character image sources

Keep original artwork in a folder whose name exactly matches the character
entry ID. Use enough source or continuity context in that ID to avoid
collisions.

```text
public/images/characters/ms-marvel-marvel-mainstream/original-costume.webp
public/images/characters/quicksilver-marvel-ultimate/base.webp
```

YAML paths are relative to `public/`:

```yaml
images:
  - name: "Original Costume"
    image: "images/characters/ms-marvel-marvel-mainstream/original-costume.webp"
```

Run `pnpm images:build` to create the optimized 160 px and 640 px WebP
variants. Never edit `public/images/generated/` by hand.
