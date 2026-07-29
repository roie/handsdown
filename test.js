const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mdToPlain,
  copyText,
  createUpdateScheduler,
  createCopyCoordinator,
  formatCount,
  isMarkdownFile,
  readMarkdownFile,
  readClipboardText,
  matchesCommandShortcut,
  shouldCaptureInitialPaste
} = require('./app.js');

test('exports the production Markdown converter', () => {
  assert.equal(typeof mdToPlain, 'function');
  assert.equal(mdToPlain('**bold**'), 'bold');
});

test('matches exact command shortcuts', () => {
  assert.equal(
    matchesCommandShortcut(
      { ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, key: 'o' },
      'o'
    ),
    true
  );
  assert.equal(
    matchesCommandShortcut(
      { ctrlKey: false, metaKey: true, altKey: false, shiftKey: false, key: 'O' },
      'o'
    ),
    true
  );
  assert.equal(
    matchesCommandShortcut(
      { ctrlKey: true, metaKey: false, altKey: false, shiftKey: true, key: 'o' },
      'o'
    ),
    false
  );
  assert.equal(
    matchesCommandShortcut(
      { ctrlKey: true, metaKey: false, altKey: true, shiftKey: false, key: 'o' },
      'o'
    ),
    false
  );
  assert.equal(
    matchesCommandShortcut(
      { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key: 'o' },
      'o'
    ),
    false
  );
});

test('captures only an initial paste outside editable fields', () => {
  const body = { tagName: 'BODY', isContentEditable: false };
  assert.equal(
    shouldCaptureInitialPaste({ inputValue: '', target: body, clipboardText: '# Ready' }),
    true
  );
  assert.equal(
    shouldCaptureInitialPaste({ inputValue: 'existing', target: body, clipboardText: '# Ready' }),
    false
  );
  assert.equal(
    shouldCaptureInitialPaste({ inputValue: '', target: body, clipboardText: '' }),
    false
  );
  assert.equal(
    shouldCaptureInitialPaste({
      inputValue: '',
      target: { tagName: 'TEXTAREA', readOnly: false, disabled: false },
      clipboardText: '# Ready'
    }),
    false
  );
  assert.equal(
    shouldCaptureInitialPaste({
      inputValue: '',
      target: { tagName: 'DIV', isContentEditable: true },
      clipboardText: '# Ready'
    }),
    false
  );
});

test('accepts only Markdown file extensions', () => {
  for (const name of ['notes.md', 'notes.markdown', 'NOTES.MD', 'NOTES.Markdown']) {
    assert.equal(isMarkdownFile({ name }), true);
  }
  for (const name of ['notes.txt', 'notes.md.txt', 'notes', '.mdx']) {
    assert.equal(isMarkdownFile({ name }), false);
  }
  assert.equal(isMarkdownFile(null), false);
});

test('reads valid Markdown files locally', async () => {
  const result = await readMarkdownFile({
    name: 'notes.md',
    text: async () => '# Notes'
  });
  assert.deepEqual(result, { ok: true, text: '# Notes' });
});

test('rejects invalid files without reading them', async () => {
  let read = false;
  const result = await readMarkdownFile({
    name: 'notes.txt',
    text: async () => {
      read = true;
      return 'plain';
    }
  });
  assert.deepEqual(result, { ok: false, reason: 'type' });
  assert.equal(read, false);
});

test('reports Markdown file read failures', async () => {
  const result = await readMarkdownFile({
    name: 'notes.markdown',
    text: async () => {
      throw new Error('unreadable');
    }
  });
  assert.deepEqual(result, { ok: false, reason: 'read' });
});

test('reads non-empty clipboard text', async () => {
  const result = await readClipboardText({ readText: async () => '# Pasted' });
  assert.deepEqual(result, { ok: true, text: '# Pasted' });
});

test('reports an empty clipboard without treating it as a read failure', async () => {
  const result = await readClipboardText({ readText: async () => '' });
  assert.deepEqual(result, { ok: false, reason: 'empty' });
});

test('reports unavailable and rejected clipboard reads', async () => {
  assert.deepEqual(await readClipboardText(null), { ok: false, reason: 'read' });
  assert.deepEqual(
    await readClipboardText({
      readText: async () => {
        throw new Error('denied');
      }
    }),
    { ok: false, reason: 'read' }
  );
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

test('preserves Markdown syntax inside indented code', () => {
  for (const source of ['    # keep', '    > keep', '    - keep', '    ---', '    *literal*', '\t__value__']) {
    assert.equal(mdToPlain(source), source);
  }
});

test('preserves consecutive blank lines inside indented code blocks', () => {
  const source = '    a\n\n\n    b';
  assert.equal(mdToPlain(source), source);
});

test('preserves emphasis markers with invalid whitespace boundaries', () => {
  for (const source of ['a * b * c', 'a _ b _ c', 'a ** b ** c', 'a __ b __ c', 'a *** b *** c']) {
    assert.equal(mdToPlain(source), source);
  }
});

test('respects punctuation flanking rules for asterisk emphasis', () => {
  assert.equal(mdToPlain('a*"foo"*'), 'a*"foo"*');
  assert.equal(mdToPlain('*"foo"*a'), '*"foo"*a');
  assert.equal(mdToPlain('a *"foo"*'), 'a "foo"');
  assert.equal(mdToPlain('*"foo"* a'), '"foo" a');
});

test('protects tilde fenced code', () => {
  assert.equal(mdToPlain('~~~js\n**bold**\n~~~'), '**bold**');
});

test('recognizes CRLF fenced code and preserves its internal line endings', () => {
  assert.equal(mdToPlain('```js\r\na\r\nb\r\n```'), 'a\r\nb');
  assert.equal(mdToPlain('~~~\r\n# heading\r\n~~~'), '# heading');
});

test('preserves mixed line endings inside fenced code', () => {
  assert.equal(mdToPlain('```\r\na\r\nb\nc\r\n```'), 'a\r\nb\nc');
});

test('requires a closing fence at least as long as the opener', () => {
  assert.equal(mdToPlain('````\na ``` b\n````'), 'a ``` b');
});

test('restores shorter backtick runs nested inside fenced code', () => {
  assert.equal(mdToPlain('````\na ```x``` b\n````'), 'a ```x``` b');
  assert.equal(mdToPlain('~~~\na ```x``` b\n~~~'), 'a ```x``` b');
});

test('does not collide with protection-like user text', () => {
  const source = '§§HANDSDOWNCB0§§\n```\ncode\n```';
  assert.equal(mdToPlain(source), '§§HANDSDOWNCB0§§\n\ncode');
});

test('preserves tel autolinks without the scheme', () => {
  assert.equal(mdToPlain('<tel:+14155551234>'), '+14155551234');
});

test('preserves URLs from valid HTML anchor attribute forms', () => {
  const cases = [
    '<a href = "https://example.com">label</a>',
    '<a\thref="https://example.com">label</a>',
    '<a class="link" href=https://example.com>label</a>',
    '<A data-kind="link" HREF = https://example.com>label</A>'
  ];
  for (const source of cases) {
    assert.equal(mdToPlain(source), 'label example.com');
  }
});

test('handles repeated unclosed anchors without quadratic slowdown', { timeout: 2000 }, () => {
  const source = '<a href="https://example.com">'.repeat(20_000);
  const started = performance.now();
  mdToPlain(source);
  assert.ok(performance.now() - started < 1000);
});

test('restores inline-code tokens with near-linear growth', { timeout: 2000 }, () => {
  const measure = count => {
    const source = Array(count).fill('`x`').join(' ');
    const cpuTimes = [];
    let output;
    mdToPlain(source);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const started = process.cpuUsage();
      output = mdToPlain(source);
      const elapsed = process.cpuUsage(started);
      cpuTimes.push((elapsed.user + elapsed.system) / 1000);
    }
    return { cpuTime: Math.min(...cpuTimes), output };
  };

  const small = measure(8_000);
  const large = measure(16_000);
  assert.equal(small.output, Array(8_000).fill('x').join(' '));
  assert.equal(large.output, Array(16_000).fill('x').join(' '));
  assert.ok(large.cpuTime < small.cpuTime * 3 + 30);
  assert.ok(large.cpuTime < 500);
});

test('handles repeated no-href anchors without quadratic slowdown', { timeout: 2000 }, () => {
  const source = `${'<a name="x">'.repeat(8_000)}</a>`;
  const started = performance.now();
  mdToPlain(source);
  assert.ok(performance.now() - started < 250);
});

test('handles repeated unclosed fence openers without quadratic slowdown', { timeout: 2000 }, () => {
  const source = '```info\n'.repeat(4_000);
  const started = performance.now();
  mdToPlain(source);
  assert.ok(performance.now() - started < 250);
});

test('uses clipboard API when it succeeds', async () => {
  let fallbackCalled = false;
  const copied = await copyText({
    text: 'plain',
    clipboard: { writeText: async () => {} },
    fallbackCopy: () => {
      fallbackCalled = true;
      return true;
    }
  });
  assert.equal(copied, true);
  assert.equal(fallbackCalled, false);
});

test('uses a successful fallback when clipboard is unavailable', async () => {
  let fallbackCalls = 0;
  const copied = await copyText({
    text: 'plain',
    clipboard: null,
    fallbackCopy: () => {
      fallbackCalls += 1;
      return true;
    }
  });
  assert.equal(copied, true);
  assert.equal(fallbackCalls, 1);
});

test('reports failure when clipboard rejects and fallback returns false', async () => {
  const copied = await copyText({
    text: 'plain',
    clipboard: { writeText: async () => { throw new Error('denied'); } },
    fallbackCopy: () => false
  });
  assert.equal(copied, false);
});

test('reports failure when fallback throws', async () => {
  const copied = await copyText({
    text: 'plain',
    clipboard: null,
    fallbackCopy: () => { throw new Error('blocked'); }
  });
  assert.equal(copied, false);
});

test('copy coordinator ignores stale and invalidated outcomes', async () => {
  const outcomes = [];
  const coordinator = createCopyCoordinator(outcome => outcomes.push(outcome));
  let resolveFirst;
  let resolveSecond;
  let resolveCleared;

  const first = coordinator.run(() => new Promise(resolve => { resolveFirst = resolve; }));
  const second = coordinator.run(() => new Promise(resolve => { resolveSecond = resolve; }));
  resolveSecond(true);
  await second;
  resolveFirst(false);
  await first;
  assert.deepEqual(outcomes, [true]);

  const cleared = coordinator.run(() => new Promise(resolve => { resolveCleared = resolve; }));
  coordinator.invalidate();
  resolveCleared(false);
  await cleared;
  assert.deepEqual(outcomes, [true]);
});

test('formats singular and plural character counts', () => {
  assert.equal(formatCount(1, 'char'), '1 char');
  assert.equal(formatCount(2, 'char'), '2 chars');
});

test('scheduler replaces stale pending conversions', () => {
  const queued = new Map();
  let nextId = 0;
  const rendered = [];
  const scheduler = createUpdateScheduler({
    delay: 50,
    compute: value => value.toUpperCase(),
    render: value => rendered.push(value),
    setTimer: callback => {
      nextId += 1;
      queued.set(nextId, callback);
      return nextId;
    },
    clearTimer: id => queued.delete(id)
  });

  scheduler.schedule('first');
  scheduler.schedule('latest');
  [...queued.values()][0]();
  assert.deepEqual(rendered, ['LATEST']);
});

test('scheduler flushes the latest conversion synchronously', () => {
  const queued = new Map();
  const rendered = [];
  const scheduler = createUpdateScheduler({
    delay: 50,
    compute: value => `${value}!`,
    render: value => rendered.push(value),
    setTimer: callback => {
      queued.set(1, callback);
      return 1;
    },
    clearTimer: id => queued.delete(id)
  });

  scheduler.schedule('copy now');
  scheduler.flush();
  assert.deepEqual(rendered, ['copy now!']);
  assert.equal(queued.size, 0);
});
