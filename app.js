function createUniquePrefix(text) {
  let suffix = 0;
  let prefix = `§§HANDSDOWN${suffix}§§`;
  while (text.includes(prefix)) {
    suffix += 1;
    prefix = `§§HANDSDOWN${suffix}§§`;
  }
  return prefix;
}

// regex capture group at contentIndex must contain protected content
function protect(text, regex, store, prefix, transform = value => value, contentIndex = 1) {
  return text.replace(regex, (...args) => {
    const content = transform(args[contentIndex]);
    const id = `§§HANDSDOWN${prefix}${store.length}§§`;
    store.push(content);
    return id;
  });
}

function restore(text, store, prefix) {
  store.forEach((content, index) => {
    text = text.replaceAll(`§§HANDSDOWN${prefix}${index}§§`, content);
  });
  return text;
}

function cleanUrl(url) {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');
}

function mdToPlain(text) {
  if (!text) return '';

  const codeBlocks = [];
  const inlineCodes = [];
  const markdownDestination = String.raw`\(\s*([^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)`;

  text = protect(
    text,
    /```+[^\n]*\n?([\s\S]*?)```+[ \t]*/g,
    codeBlocks,
    'CB',
    code => `\n${code.trimEnd()}\n`
  );

  text = protect(
    text,
    /(`+)([\s\S]*?)\1/g,
    inlineCodes,
    'IC',
    value => value,
    2
  );

  text = text.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, '$1');
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1');

  text = text.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    href = cleanUrl(href);
    label = label.replace(/<\/?[a-z][^>\n]*>/g, '').trim();
    return label ? `${label} ${href}` : href;
  });

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
  text = text.replace(/___(.+?)___/g, '$1');
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');
  text = text.replace(/\*([^*\n]+)\*/g, '$1');
  text = text.replace(/_([^_\n]+)_/g, '$1');
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

  text = text.split('\n').map(line => {
    if (/^( {4,}|\t)/.test(line)) return line;
    return line.trim().replace(/ {2,}/g, ' ');
  }).join('\n');

  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/^\n+/, '').trimEnd();
  text = restore(text, inlineCodes, 'IC');
  text = restore(text, codeBlocks, 'CB');

  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
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
    return windowRef.matchMedia('(prefers-color-scheme: dark)').matches;
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

  function update() {
    const raw = input.value;
    const plain = mdToPlain(raw);

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

  function copyOutput() {
    if (!output.value) return;

    const markCopied = () => {
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      windowRef.setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 1500);
    };

    const fallbackCopy = () => {
      output.select();
      documentRef.execCommand('copy');
      markCopied();
    };

    if (windowRef.navigator.clipboard && typeof windowRef.navigator.clipboard.writeText === 'function') {
      windowRef.navigator.clipboard.writeText(output.value).then(markCopied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  function clearAll() {
    input.value = '';
    output.value = '';
    copyBtn.textContent = 'Copy';
    copyBtn.classList.remove('copied');
    update();
  }

  input.addEventListener('input', update);
  copyBtn.addEventListener('click', copyOutput);
  clearBtn.addEventListener('click', clearAll);
  themeBtn.addEventListener('click', toggleTheme);
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
  update();
}

const api = { mdToPlain, cleanUrl, createUniquePrefix };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  initApp(document, window);
}
