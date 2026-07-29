# Handsdown

Minimize Markdown for AI copy-paste.

Paste markdown in, get compact plain text out. Strips formatting noise while preserving useful content like URLs.

**Use Handsdown:** [roie.github.io/handsdown](https://roie.github.io/handsdown/)

Everything runs locally in your browser—nothing is uploaded, and there are no accounts or dependencies.

Paste Markdown directly, use the clipboard button beside **Markdown**, open a `.md` or `.markdown` file with the folder button, or drop one onto that panel. Files are read locally in the browser and are never uploaded. If browser clipboard access is unavailable, focus the editor and paste normally.

## What it strips

- Headings, bold, italic, strikethrough, blockquotes, horizontal rules
- Unordered list markers (`-`, `*`, and `+`)
- Inline code and fenced code blocks (content preserved)
- HTML tags (except `<a>` — href is preserved like markdown links)
- Table separator rows and outer pipes
- Container fences (`:::`) on standalone lines
- Alt-heading underlines (`===`)
- Protocol/scheme from bare URLs (`https://`, `http://`, `mailto:`, `tel:`)

## What it preserves

- URL destinations from links, images, and `<a>` tags
- Ordered list numbering
- Code content exactly as written
- Backtick and tilde fenced code blocks, including longer outer fences
- Indented code blocks
- Reference-style link syntax (not parsed — passed through)

## Known limitations

- **`x<y>` false positive** — stripped as HTML. Code blocks are protected; rare in prose.
- **URLs with parentheses** — `[text](url(parens))` fails to parse.
- **Reference-style links** — `[text][ref]` and `[ref]: url` pass through unprocessed.
- **Task lists** — `- [x]` / `- [ ]` not stripped.
- **Definition lists, sub/superscript, insert/mark** — not handled (parser territory).
- **Uppercase HTML tags** (`<DIV>`) intentionally not stripped.

## Keyboard

- **Ctrl/Cmd+V** — paste immediately when the Markdown editor is empty, even before focusing it
- **Ctrl/Cmd+O** — open a Markdown file
- **Ctrl/Cmd+Enter** — copy the converted plain text
- **Escape** — focus the Markdown editor
- **Tab / Shift+Tab** — move through controls and panels

## Tests

```sh
node --test test.js
```
