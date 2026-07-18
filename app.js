function createUniquePrefix(text) {
  let suffix = 0;
  let prefix = `§§HANDSDOWN${suffix}§§`;
  while (text.includes(prefix)) {
    suffix += 1;
    prefix = `§§HANDSDOWN${suffix}§§`;
  }
  return prefix;
}

function createProtector(text) {
  const prefix = createUniquePrefix(text);
  const stores = new Map();

  return {
    save(kind, content) {
      const values = stores.get(kind) || [];
      const token = `${prefix}${kind}${values.length}§§`;
      values.push(content);
      stores.set(kind, values);
      return token;
    },
    restore(value, kind) {
      const values = stores.get(kind) || [];
      for (let index = 0; index < values.length; index += 1) {
        value = value.replaceAll(`${prefix}${kind}${index}§§`, values[index]);
      }
      return value;
    }
  };
}

function protectFencedCode(text, protector) {
  const lines = text.split('\n');
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = lines[index].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!opening) {
      output.push(lines[index]);
      continue;
    }

    const fenceCharacter = opening[1][0];
    const fenceLength = opening[1].length;
    let closingIndex = -1;

    for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
      const closing = lines[candidate].match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (closing && closing[1][0] === fenceCharacter && closing[1].length >= fenceLength) {
        closingIndex = candidate;
        break;
      }
    }

    if (closingIndex === -1) {
      output.push(lines[index]);
      continue;
    }

    const content = lines.slice(index + 1, closingIndex).join('\n');
    if (output.length > 0 && output.at(-1) !== '') output.push('');
    output.push(protector.save('CB', content));
    if (closingIndex + 1 < lines.length && lines[closingIndex + 1] !== '') output.push('');
    index = closingIndex;
  }

  return output.join('\n');
}

function protectInlineCode(text, protector) {
  let result = '';
  let cursor = 0;

  while (cursor < text.length) {
    const openingIndex = text.indexOf('`', cursor);
    if (openingIndex === -1) return result + text.slice(cursor);

    result += text.slice(cursor, openingIndex);
    let runLength = 1;
    while (text[openingIndex + runLength] === '`') runLength += 1;

    const delimiter = '`'.repeat(runLength);
    let closingIndex = text.indexOf(delimiter, openingIndex + runLength);
    while (
      closingIndex !== -1 &&
      (text[closingIndex - 1] === '`' || text[closingIndex + runLength] === '`')
    ) {
      closingIndex = text.indexOf(delimiter, closingIndex + runLength);
    }

    if (closingIndex === -1) return result + text.slice(openingIndex);

    const content = text.slice(openingIndex + runLength, closingIndex);
    if (content.startsWith('\n')) result = result.replace(/[ \t]+$/, '');
    result += protector.save('IC', content);
    cursor = closingIndex + runLength;
  }

  return result;
}

function cleanUrl(url) {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');
}

function replaceHtmlAnchors(text) {
  const lowerText = text.toLowerCase();
  let result = '';
  let cursor = 0;

  while (cursor < text.length) {
    const openingIndex = lowerText.indexOf('<a ', cursor);
    if (openingIndex === -1) return result + text.slice(cursor);

    result += text.slice(cursor, openingIndex);
    const tagEnd = text.indexOf('>', openingIndex + 3);
    if (tagEnd === -1) return result + text.slice(openingIndex);

    const closingIndex = lowerText.indexOf('</a>', tagEnd + 1);
    if (closingIndex === -1) return result + text.slice(openingIndex);

    const openingTag = text.slice(openingIndex, tagEnd + 1);
    const hrefMatch = openingTag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) {
      result += openingTag;
      cursor = tagEnd + 1;
      continue;
    }

    const label = text.slice(tagEnd + 1, closingIndex).replace(/<\/?[a-z][^>\n]*>/g, '').trim();
    const url = cleanUrl(hrefMatch[1]);
    result += label ? `${label} ${url}` : url;
    cursor = closingIndex + 4;
  }

  return result;
}

function mdToPlain(text) {
  if (!text) return '';

  const protector = createProtector(text);
  const markdownDestination = String.raw`\(\s*([^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)`;

  text = protectFencedCode(text, protector);
  text = protectInlineCode(text, protector);
  text = text.replace(/<((?:https?:\/\/|mailto:|tel:)[^>\s]+)>/gi, '$1');
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');
  text = replaceHtmlAnchors(text);
  text = text.replace(/<\/?[a-z][^>\n]*>/g, '');

  text = text.replace(new RegExp(String.raw`!\[([^\]]*)\]${markdownDestination}`, 'g'), (_, alt, url) => {
    alt = alt.trim();
    url = cleanUrl(url);
    return alt ? `${alt} ${url}` : url;
  });

  text = text.replace(new RegExp(String.raw`\[([^\]]*)\]${markdownDestination}`, 'g'), (_, label, url) => {
    label = label.trim();
    url = cleanUrl(url);
    return label ? `${label} ${url}` : url;
  });

  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
  text = text.replace(/(^|[^\p{L}\p{N}])___([^\n]+?)___(?=$|[^\p{L}\p{N}])/gu, '$1$2');
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/(^|[^\p{L}\p{N}])__([^\n]+?)__(?=$|[^\p{L}\p{N}])/gu, '$1$2');
  text = text.replace(/\*([^*\n]+)\*/g, '$1');
  text = text.replace(/(^|[^\p{L}\p{N}])_([^_\n]+?)_(?=$|[^\p{L}\p{N}])/gu, '$1$2');
  text = text.replace(/~~(.+?)~~/g, '$1');
  text = text.replace(/^[ \t]*#{1,6}\s+/gm, '');
  text = text.replace(/^\s*(>\s*)+/gm, '');
  text = text.replace(/^[ \t]*:::[ \t]*[\w-]*[ \t]*$\n?/gm, '');
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  text = text.replace(/^\s*={3,}\s*$/gm, '');
  text = text.replace(/^\s*\|?(\s*:?-{3,}:?\s*\|)*\s*:?-{3,}:?\s*\|?\s*$\n?/gm, '');
  text = text.replace(/^\s*\|(.*)\|[ \t]*$/gm, '$1');
  text = text.replace(/^[ \t]*[-*+]\s+/gm, '');
  text = text.replace(/(^|\s)https?:\/\//gi, '$1');
  text = text.replace(/(^|\s)mailto:/gi, '$1');
  text = text.replace(/(^|\s)tel:/gi, '$1');

  text = text
    .split('\n')
    .map(line => {
      if (/^( {4,}|\t)/.test(line)) return line;
      return line.trim().replace(/ {2,}/g, ' ');
    })
    .join('\n');

  text = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');

  text = protector.restore(text, 'IC');
  text = protector.restore(text, 'CB');
  return text.replace(/^\n+/, '').replace(/\n+$/, '');
}

async function copyText({ text, clipboard, fallbackCopy }) {
  if (!text) return false;

  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {}
  }

  try {
    return fallbackCopy() === true;
  } catch {
    return false;
  }
}

function createUpdateScheduler({ delay, compute, render, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null;
  let latest = '';

  const flush = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    render(compute(latest));
  };

  return {
    schedule(value) {
      latest = value;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(flush, delay);
    },
    flush
  };
}

function initApp(documentRef, windowRef) {
  const input = documentRef.getElementById('input');
  const output = documentRef.getElementById('output');
  const inputChars = documentRef.getElementById('inputChars');
  const outputChars = documentRef.getElementById('outputChars');
  const savedEl = documentRef.getElementById('saved');
  const copyBtn = documentRef.getElementById('copy');
  const clearBtn = documentRef.getElementById('clear');
  const themeBtn = documentRef.getElementById('theme');
  const copyStatus = documentRef.getElementById('copyStatus');
  const colorScheme = windowRef.matchMedia('(prefers-color-scheme: dark)');

  const svgNamespace = 'http://www.w3.org/2000/svg';

  function createSvgElement(name, attributes) {
    const element = documentRef.createElementNS(svgNamespace, name);
    for (const [attribute, value] of Object.entries(attributes)) {
      element.setAttribute(attribute, value);
    }
    return element;
  }

  function createThemeIcon(dark) {
    const svg = createSvgElement('svg', {
      width: '14',
      height: '14',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'aria-hidden': 'true'
    });

    if (dark) {
      svg.append(
        createSvgElement('circle', { cx: '12', cy: '12', r: '5' }),
        createSvgElement('path', {
          d: 'M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42'
        })
      );
    } else {
      svg.append(createSvgElement('path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }));
    }

    return svg;
  }

  function isDarkMode() {
    const attr = documentRef.documentElement.getAttribute('data-theme');
    if (attr) return attr === 'dark';
    return colorScheme.matches;
  }

  function updateThemeIcon() {
    const dark = isDarkMode();
    themeBtn.replaceChildren(createThemeIcon(dark));
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function toggleTheme() {
    const newTheme = isDarkMode() ? 'light' : 'dark';
    documentRef.documentElement.setAttribute('data-theme', newTheme);
    try {
      windowRef.localStorage.setItem('theme', newTheme);
    } catch {}
    updateThemeIcon();
  }

  function formatNum(number) {
    return number.toLocaleString();
  }

  function renderUpdate({ raw, plain }) {
    if (output.value !== plain) output.value = plain;

    const inLen = raw.length;
    const outLen = plain.length;
    const rawSaved = inLen > 0 ? Math.round((1 - outLen / inLen) * 100) : 0;
    const saved = Math.max(0, rawSaved);
    const diff = Math.max(0, inLen - outLen);

    inputChars.textContent = inLen ? `${formatNum(inLen)} chars` : '';
    outputChars.textContent = outLen || inLen ? `${formatNum(outLen)} chars` : '';
    savedEl.textContent = !inLen ? '' : diff === 0 ? 'No change' : `${saved}% smaller · ${formatNum(diff)} chars removed`;
    copyBtn.disabled = !outLen;
    clearBtn.disabled = !inLen && !outLen;
  }

  const scheduler = createUpdateScheduler({
    delay: 50,
    compute: raw => ({ raw, plain: mdToPlain(raw) }),
    render: renderUpdate,
    setTimer: windowRef.setTimeout.bind(windowRef),
    clearTimer: windowRef.clearTimeout.bind(windowRef)
  });

  let copyResetTimer = null;

  function resetCopyFeedback() {
    if (copyResetTimer !== null) windowRef.clearTimeout(copyResetTimer);
    copyResetTimer = null;
    copyBtn.textContent = 'Copy';
    copyBtn.classList.remove('copied', 'failed');
  }

  function showCopyFeedback(succeeded) {
    resetCopyFeedback();
    copyBtn.textContent = succeeded ? 'Copied!' : 'Copy failed';
    copyBtn.classList.add(succeeded ? 'copied' : 'failed');
    if (copyStatus) {
      const message = succeeded
        ? 'Copied to clipboard.'
        : 'Copy failed. Select the plain text and copy it manually.';
      copyStatus.textContent = '';
      windowRef.setTimeout(() => {
        copyStatus.textContent = message;
      }, 0);
    }
    copyResetTimer = windowRef.setTimeout(resetCopyFeedback, 1500);
  }

  async function copyOutput() {
    scheduler.schedule(input.value);
    scheduler.flush();
    if (!output.value) return;

    const succeeded = await copyText({
      text: output.value,
      clipboard: windowRef.navigator.clipboard,
      fallbackCopy: () => {
        output.select();
        if (typeof documentRef.execCommand !== 'function') return false;
        return documentRef.execCommand('copy');
      }
    });
    showCopyFeedback(succeeded);
  }

  function clearAll() {
    input.value = '';
    output.value = '';
    resetCopyFeedback();
    if (copyStatus) copyStatus.textContent = '';
    scheduler.schedule(input.value);
    scheduler.flush();
  }

  input.addEventListener('input', () => scheduler.schedule(input.value));
  copyBtn.addEventListener('click', copyOutput);
  clearBtn.addEventListener('click', clearAll);
  themeBtn.addEventListener('click', toggleTheme);
  colorScheme.addEventListener('change', () => {
    if (!documentRef.documentElement.hasAttribute('data-theme')) updateThemeIcon();
  });
  documentRef.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      copyOutput();
    }
  });

  let savedTheme = null;
  try {
    savedTheme = windowRef.localStorage.getItem('theme');
  } catch {}
  if (savedTheme === 'light' || savedTheme === 'dark') {
    documentRef.documentElement.setAttribute('data-theme', savedTheme);
  }
  updateThemeIcon();
  scheduler.schedule(input.value);
  scheduler.flush();
}

const api = { mdToPlain, cleanUrl, createUniquePrefix, copyText, createUpdateScheduler };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  initApp(document, window);
}
