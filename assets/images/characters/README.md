# Character Images

Save character images under a folder that matches the character entry id.
Character entry ids should include enough source/verse context to stay unique when the same character exists in multiple continuities.

```text
assets/images/characters/ms-marvel-marvel-mainstream/original-costume.webp
assets/images/characters/quicksilver-marvel-ultimate/base.webp
```

Use the same relative path in character YAML:

```yaml
images:
  - name: "Original Costume"
    image: "assets/images/characters/ms-marvel-marvel-mainstream/original-costume.webp"
```
