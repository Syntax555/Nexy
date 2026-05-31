# Character Images

Save character images under a folder that matches the character entry id:

```text
assets/images/characters/ms-marvel/original-costume.webp
```

Use the same relative path in character YAML:

```yaml
images:
  - name: "Original Costume"
    image: "assets/images/characters/ms-marvel/original-costume.webp"
```

The `empty` folder is reserved for the fallback character and intentionally has no image.
