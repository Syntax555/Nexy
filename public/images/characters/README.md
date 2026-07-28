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

For the lowest legal risk, add only artwork you created, artwork in the public
domain, or artwork covered by a documented licence or permission that allows
this public web use. Keep the source, rights holder, licence or permission
terms, and review date in the image metadata. Attribution and non-commercial
use alone do not create permission.

Every image reference must include its source URL, rights status, and review
date. An `unverified-third-party` record is withheld by default. Setting
`publish_unverified: true` explicitly enables that one image with a visible
warning and source-file link; it is a display setting, not evidence of a
licence, permission, ownership, or a legal exception.

The build records every decision in `public/image-rights.json`, deploys only
the optimized 160 px and 640 px variants, and removes full-size source files
from `dist/`. The source files still remain accessible in this public
repository and should be replaced or removed if a rights review requires it.
