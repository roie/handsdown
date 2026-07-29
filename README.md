# Handsdown

Minimize Markdown for AI copy-paste.

Paste markdown in, get compact plain text out. Strips formatting noise while preserving useful content like URLs.

**Use Handsdown:** [roie.github.io/handsdown](https://roie.github.io/handsdown/)

Everything runs locally in your browser—nothing is uploaded, and there are no accounts or dependencies.

Paste Markdown directly, use the folder button beside **Markdown** for a `.md` or `.markdown` file, or drop one onto that panel. Files are read locally in the browser and are never uploaded.

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

## Tests

```sh
node --test test.js
```
