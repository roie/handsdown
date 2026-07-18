const test = require('node:test');
const assert = require('node:assert/strict');

const { mdToPlain } = require('./app.js');

test('exports the production Markdown converter', () => {
  assert.equal(typeof mdToPlain, 'function');
  assert.equal(mdToPlain('**bold**'), 'bold');
});

const conversionCases = [
  ['empty', '', ''],
  ['plain', 'hello world', 'hello world'],
  ['headings', '# H1\n## H2', 'H1\nH2'],
  ['bold', '**b**', 'b'],
  ['bold underscore', '__b__', 'b'],
  ['italic', '*i*', 'i'],
  ['italic underscore', '_i_', 'i'],
  ['bold+italic asterisk', '***bi***', 'bi'],
  ['bold+italic underscore', '___bi___', 'bi'],
  ['strikethrough', '~~strike~~', 'strike'],
  ['backslash italic', '\\*italic\\*', 'italic'],
  ['backslash bold', '\\*\\*bold\\*\\*', 'bold'],
  ['backslash heading at line start', '\\# not heading', 'not heading'],
  ['backslash protected in inline code', '`\\*code\\*`', '\\*code\\*'],
  ['horizontal rule', '---\n***\n___', ''],
  ['blockquote', '> quote', 'quote'],
  ['nested blockquote', '>> nested', 'nested'],
  ['deep nested blockquote', '> > > deep', 'deep'],
  ['unordered list', '- a\n* b\n+ c', 'a\nb\nc'],
  ['ordered list preserved', '1. a\n2. b', '1. a\n2. b'],
  ['ordered list large number', '4444. item', '4444. item'],
  ['decimal number preserved', '4444444444.2\n4444. ', '4444444444.2\n4444.'],
  ['inline code', '`code`', 'code'],
  ['inline code double backtick', '`` `code` ``', ' `code` '],
  ['inline code protects emphasis', '`**bold**`', '**bold**'],
  ['inline code protects generic', '`Array<T>`', 'Array<T>'],
  ['inline code preserves spaces', '` npm run test `', ' npm run test '],
  ['fenced code', '```js\nx=1\n```', 'x=1'],
  ['fenced code protects emphasis', '```\n**bold**\n```', '**bold**'],
  ['fenced code protects generic', '```\nArray<T>\n```', 'Array<T>'],
  ['fenced code trailing spaces', '```js\nx=1\n```  ', 'x=1'],
  ['fence spacing preserved', 'This:\n\n```\na #\nb /\n```\n\nYay', 'This:\n\na #\nb /\n\nYay'],
  ['fenced code blank lines', '```\na\n\nb\n```', 'a\n\nb'],
  ['autolink https', '<https://example.com>', 'example.com'],
  ['autolink http', '<http://example.com/path>', 'example.com/path'],
  ['autolink mailto', '<mailto:user@example.com>', 'user@example.com'],
  ['link basic', '[text](url)', 'text url'],
  ['link heading', '### [Abbreviations](https://github.com/markdown-it/markdown-it-abbr)', 'Abbreviations github.com/markdown-it/markdown-it-abbr'],
  ['link http', '[a](http://example.com)', 'a example.com'],
  ['link https+www', '[a](https://www.example.com/path)', 'a example.com/path'],
  ['link www only', '[a](www.example.com)', 'a example.com'],
  ['link empty label', '[](url)', 'url'],
  ['link multiple', '[a](https://x.com) [b](http://y.com)', 'a x.com b y.com'],
  ['link no cross line', '[a]\n\n[b](u)', '[a]\n\nb u'],
  ['link title stripped', '[text](https://example.com/path "Title")', 'text example.com/path'],
  ['link title single quote stripped', "[text](https://example.com/path 'Title')", 'text example.com/path'],
  ['link title parens stripped', '[text](https://example.com/path (Title))', 'text example.com/path'],
  ['linked image', '[![alt](img)](url)', 'alt img url'],
  ['image basic', '![alt](img.png)', 'alt img.png'],
  ['image empty alt', '![](url)', 'url'],
  ['image https', '![](https://example.com/img.png)', 'example.com/img.png'],
  ['image title stripped', '![alt](https://example.com/img.png "Caption")', 'alt example.com/img.png'],
  ['HTML lowercase', '<div>x</div>', 'x'],
  ['HTML uppercase', '<DIV>x</DIV>', '<DIV>x</DIV>'],
  ['HTML generic safe', 'Array<T>', 'Array<T>'],
  ['comparison safe', 'x <= 1', 'x <= 1'],
  ['anchor preserves href', '<a href="https://example.com/path">text</a>', 'text example.com/path'],
  ['anchor no href', '<a name="x">text</a>', 'text'],
  ['anchor with inner HTML', '<a href="url"><strong>bold</strong></a>', 'bold url'],
  ['anchor non-href tag preserved', '<abbr title="HTML">text</abbr>', 'text'],
  ['alt-heading equals', 'Title\n======', 'Title'],
  ['alt-heading dashes (handled by HR)', 'Title\n------', 'Title'],
  ['table data row', '| a | b | c |', 'a | b | c'],
  ['table separator row', '|---|---|---|', ''],
  ['table with header sep and data', '| H1 | H2 |\n| --- | --- |\n| c1 | c2 |', 'H1 | H2\nc1 | c2'],
  ['table colon separator', '|:---|:---:|', ''],
  ['table no leading pipe', 'H1 | H2\n--- | ---\nc1 | c2', 'H1 | H2\nc1 | c2'],
  ['bare url protocol', 'http://example.com text', 'example.com text'],
  ['bare url https protocol', 'a https://example.com b', 'a example.com b'],
  ['bare url multiple', 'http://a.com http://b.com', 'a.com b.com'],
  ['bare mailto', 'mailto:user@example.com', 'user@example.com'],
  ['bare tel', 'tel:+14155551234', '+14155551234'],
  ['bare mailto mid-text', 'email mailto:user@example.com', 'email user@example.com'],
  ['bare nomailto preserved', 'nomailto:x', 'nomailto:x'],
  ['bare notel preserved', 'notel:x', 'notel:x'],
  ['blank lines collapse', 'a\n\n\n\n\nb', 'a\n\nb'],
  ['leading empty lines', '\n\n\ncode', 'code'],
  ['trailing empty lines', 'code\n\n\n', 'code'],
  ['3 spaces trimmed', '   x', 'x'],
  ['indented code preserved', '    def foo():\n        pass', '    def foo():\n        pass'],
  ['tab indented preserved', '\tdef foo():', '\tdef foo():'],
  ['italic no cross line', '_a_\n\n_b_', 'a\n\nb'],
  ['links no cross line', '[a]\n\n[b](u)', '[a]\n\nb u'],
  ['footnote ref', '[^first] footnote', '[^first] footnote'],
  ['footnote def', '[^first]: text', '[^first]: text'],
  ['reference def', '[id]: url', '[id]: url'],
  ['mixed code + markdown', '`**x**` and ```\ny\n```', '**x** and\ny'],
  ['blockquote then text', '> a\nb', 'a\nb'],
  ['container basic', '::: warning\ncontent\n:::', 'content'],
  ['container multi-line', '::: tip\nline1\nline2\n:::', 'line1\nline2'],
  ['container between text', 'a\n::: note\nbody\n:::\nb', 'a\nbody\nb'],
  ['container with title attr', '::: info {title="Note"}\nbody\n:::', '::: info {title="Note"}\nbody'],
  ['container inline false positive', ':::laughing:::', ':::laughing:::'],
  ['container no content', ':::\n:::', ''],
  ['container trailing newline', '::: warning\ncontent\n:::\n', 'content']
];

test('converts the documented Markdown subset', async t => {
  for (const [name, input, expected] of conversionCases) {
    await t.test(name, () => {
      assert.equal(mdToPlain(input), expected);
    });
  }
});

test('preserves underscores inside identifiers', () => {
  assert.equal(mdToPlain('snake_case_name'), 'snake_case_name');
});

test('protects tilde fenced code', () => {
  assert.equal(mdToPlain('~~~js\n**bold**\n~~~'), '**bold**');
});

test('requires a closing fence at least as long as the opener', () => {
  assert.equal(mdToPlain('````\na ``` b\n````'), 'a ``` b');
});

test('does not collide with protection-like user text', () => {
  const source = '§§HANDSDOWNCB0§§\n```\ncode\n```';
  assert.equal(mdToPlain(source), '§§HANDSDOWNCB0§§\n\ncode');
});

test('preserves tel autolinks without the scheme', () => {
  assert.equal(mdToPlain('<tel:+14155551234>'), '+14155551234');
});

test('handles repeated unclosed anchors without quadratic slowdown', { timeout: 2000 }, () => {
  const source = '<a href="https://example.com">'.repeat(20_000);
  const started = performance.now();
  mdToPlain(source);
  assert.ok(performance.now() - started < 1000);
});
