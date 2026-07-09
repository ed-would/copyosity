# Smart Actions — quick test guide

## Seed data

```bash
make seed-demo
```

Or open `/dev/seed` in dev and click **Seed demo entries**. Reopen the overlay afterward.

## Per-kind checks

| Chip        | Primary (click type chip) | Context menu (right-click)             |
| ----------- | ------------------------- | -------------------------------------- |
| **Link**    | Opens URL in browser      | Copy tracking-free URL · Make QR code  |
| **Email**   | Opens Mail compose        | Copy address                           |
| **Phone**   | FaceTime video            | FaceTime Audio · Message               |
| **Address** | Opens Apple Maps          | —                                      |
| **Color**   | Copy HEX                  | Copy rgb() · Copy SwiftUI `Color(...)` |
| **Calc**    | Copy result               | Paste result                           |
| **JSON**    | Copy formatted            | Minify · Paste formatted               |

## Negative cases (should stay **Text**)

- Phone mentioned mid-sentence (`demo:neg-phone-in-sentence`)
- Hex inside CSS (`demo:neg-hex-in-css`)
- 2100-character string (`demo:neg-long-no-detect`)

## Dev gallery

Static mock cards (no DB): `/dev/smart-actions`
