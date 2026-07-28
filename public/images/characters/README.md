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

Only add artwork you created, artwork in the public domain, or artwork covered
by a documented license or permission that allows this public web use. Keep the
source, rights holder, license or permission terms, and acquisition date in
your project records. Attribution and non-commercial use alone do not create
permission.

Every image reference must include its source URL, rights status, and review
date. The build records `unverified-third-party` files in
`public/image-rights.json` but excludes them and their generated variants from
the deployed `dist/`. Because this repository itself is public, unverified
source files should still be replaced or removed once the review is complete.
