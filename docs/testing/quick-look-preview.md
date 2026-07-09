# Quick Look — quick test guide

## Seed data

```bash
make seed-demo
```

Look for entries tagged in source app: **Notes** (long text), **VS Code** / **RustRover** (code), **Preview** / **Screenshot** / **Safari** (images).

## Shortcuts

| Key                | Action                                                   |
| ------------------ | -------------------------------------------------------- |
| `Space`            | Open / close preview (not while search is focused)       |
| `⌘Y`               | Open / close preview (works from search)                 |
| `Esc`              | Close preview first, then clear search / dismiss overlay |
| `←` `→` or `↑` `↓` | Browse entries while preview stays open                  |
| `↵`                | Paste (does **not** open preview)                        |

## Mouse

- **Hover type chip** → eye icon → click for preview (card click still copies)
- **Right-click card** → **Preview**

## Image cases

- **320×200 PNG** — full resolution in preview (not list thumb)
- **OCR image** — **Image / Recognised text** tab toggle
- **GIF** — animation plays in Quick Look (list thumb stays static)

## Reset

Close preview with `Esc` or `Space`/`⌘Y` before dismissing the overlay.
