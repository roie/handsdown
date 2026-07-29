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
  const counters = new Map();
  const replacements = new Map();
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokenPattern = new RegExp(`${escapedPrefix}[A-Z]+\\d+§§`, 'g');

  return {
    save(kind, content) {
      const index = counters.get(kind) || 0;
      const token = `${prefix}${kind}${index}§§`;
      counters.set(kind, index + 1);
      replacements.set(token, content);
      return token;
    },
    restore(value) {
      for (let pass = 0; pass < 3; pass += 1) {
        const restored = value.replace(tokenPattern, token => replacements.get(token) ?? token);
        if (restored === value) return value;
        value = restored;
      }
      return value;
    }
  };
}

function splitLinesWithEndings(text) {
  const lines = [];
  let start = 0;

  while (start < text.length) {
    const newline = text.indexOf('\n', start);
    if (newline === -1) {
      lines.push({ text: text.slice(start), ending: '' });
      return lines;
    }

    const hasCarriageReturn = newline > start && text[newline - 1] === '\r';
    lines.push({
      text: text.slice(start, hasCarriageReturn ? newline - 1 : newline),
      ending: hasCarriageReturn ? '\r\n' : '\n'
    });
    start = newline + 1;
  }

  lines.push({ text: '', ending: '' });
  return lines;
}

function protectFencedCode(text, protector) {
  const lines = splitLinesWithEndings(text);
  const output = [];
  let fence = null;

  function saveFence(hasFollowingContent) {
    const content = fence.lines
      .map((line, index) => line.text + (index < fence.lines.length - 1 ? line.ending : ''))
      .join('');
    if (output.length > 0 && output.at(-1) !== '') output.push('');
    output.push(protector.save('CB', content));
    if (hasFollowingContent) output.push('');
    fence = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!fence) {
      const opening = line.text.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      const isOrphanClosingFence = opening && index === lines.length - 1 && opening[2].trim() === '';
      if (opening && !isOrphanClosingFence) {
        fence = { character: opening[1][0], length: opening[1].length, lines: [] };
      } else {
        output.push(line.text);
      }
      continue;
    }

    const closing = line.text.match(/^ {0,3}(`+|~+)[ \t]*$/);
    if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) {
      saveFence(index + 1 < lines.length && lines[index + 1].text !== '');
    } else {
      fence.lines.push(line);
    }
  }

  if (fence) saveFence(false);
  return output.join('\n');
}

function protectIndentedCode(text, protector) {
  const lines = text.split('\n');
  const output = [];
  const isIndented = line => /^( {4,}|\t)/.test(line);

  for (let index = 0; index < lines.length; index += 1) {
    if (!isIndented(lines[index])) {
      output.push(lines[index]);
      continue;
    }

    const block = [lines[index]];
    let next = index + 1;
    while (next < lines.length) {
      if (isIndented(lines[next])) {
        block.push(lines[next]);
        next += 1;
        continue;
      }

      if (lines[next] !== '') break;
      let afterBlanks = next;
      while (afterBlanks < lines.length && lines[afterBlanks] === '') afterBlanks += 1;
      if (afterBlanks >= lines.length || !isIndented(lines[afterBlanks])) break;
      block.push(...lines.slice(next, afterBlanks));
      next = afterBlanks;
    }

    output.push(protector.save('ID', block.join('\n')));
    index = next - 1;
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

  function findOpeningIndex(start) {
    let index = lowerText.indexOf('<a', start);
    while (index !== -1) {
      if (/\s/.test(text[index + 2] || '')) return index;
      index = lowerText.indexOf('<a', index + 2);
    }
    return -1;
  }

  while (cursor < text.length) {
    const openingIndex = findOpeningIndex(cursor);
    if (openingIndex === -1) return result + text.slice(cursor);

    result += text.slice(cursor, openingIndex);
    const tagEnd = text.indexOf('>', openingIndex + 2);
    if (tagEnd === -1) return result + text.slice(openingIndex);

    const openingTag = text.slice(openingIndex, tagEnd + 1);
    const hrefMatch = openingTag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
    if (!hrefMatch) {
      result += openingTag;
      cursor = tagEnd + 1;
      continue;
    }

    const closingIndex = lowerText.indexOf('</a>', tagEnd + 1);
    if (closingIndex === -1) return result + text.slice(openingIndex);

    const label = text.slice(tagEnd + 1, closingIndex).replace(/<\/?[a-z][^>\n]*>/g, '').trim();
    const url = cleanUrl(hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3]);
    result += label ? `${label} ${url}` : url;
    cursor = closingIndex + 4;
  }

  return result;
}

function delimiterFlanking(text, index, length, marker) {
  const previous = text[index - 1];
  const next = text[index + length];
  const isWhitespace = character => character === undefined || /\s/u.test(character);
  const isPunctuation = character => character !== undefined && /[\p{P}\p{S}]/u.test(character);
  const previousWhitespace = isWhitespace(previous);
  const nextWhitespace = isWhitespace(next);
  const previousPunctuation = isPunctuation(previous);
  const nextPunctuation = isPunctuation(next);
  const leftFlanking = !nextWhitespace && (!nextPunctuation || previousWhitespace || previousPunctuation);
  const rightFlanking = !previousWhitespace && (!previousPunctuation || nextWhitespace || nextPunctuation);

  if (marker === '_') {
    return {
      canOpen: leftFlanking && (!rightFlanking || previousPunctuation),
      canClose: rightFlanking && (!leftFlanking || nextPunctuation)
    };
  }

  return { canOpen: leftFlanking, canClose: rightFlanking };
}

function stripEmphasis(text, marker, length) {
  const delimiter = marker.repeat(length);
  const removals = new Set();
  let opener = null;
  let cursor = 0;

  while (cursor < text.length) {
    const index = text.indexOf(delimiter, cursor);
    if (index === -1) break;
    cursor = index + length;

    if (text[index - 1] === marker || text[index + length] === marker) continue;
    const flanking = delimiterFlanking(text, index, length, marker);

    if (opener !== null && text.slice(opener + length, index).includes('\n')) opener = null;
    if (opener !== null && flanking.canClose) {
      removals.add(opener);
      removals.add(index);
      opener = null;
    } else if (flanking.canOpen) {
      opener = index;
    }
  }

  if (removals.size === 0) return text;
  const output = [];
  cursor = 0;
  while (cursor < text.length) {
    if (removals.has(cursor)) {
      cursor += length;
    } else {
      output.push(text[cursor]);
      cursor += 1;
    }
  }
  return output.join('');
}

function mdToPlain(text) {
  if (!text) return '';

  const protector = createProtector(text);
  const markdownDestination = String.raw`\(\s*([^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)`;

  text = protectFencedCode(text, protector);
  text = protectIndentedCode(text, protector);
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

  text = stripEmphasis(text, '*', 3);
  text = stripEmphasis(text, '_', 3);
  text = stripEmphasis(text, '*', 2);
  text = stripEmphasis(text, '_', 2);
  text = stripEmphasis(text, '*', 1);
  text = stripEmphasis(text, '_', 1);
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

  text = protector.restore(text);
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

function createCopyCoordinator(onResult) {
  let latestAttempt = 0;

  return {
    async run(operation) {
      const attempt = ++latestAttempt;
      const result = await operation();
      if (attempt === latestAttempt) onResult(result);
      return result;
    },
    invalidate() {
      latestAttempt += 1;
    }
  };
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

function formatCount(number, singular) {
  return `${number.toLocaleString()} ${number === 1 ? singular : `${singular}s`}`;
}

function isMarkdownFile(file) {
  return typeof file?.name === 'string' && /\.(?:md|markdown)$/i.test(file.name);
}

async function readMarkdownFile(file) {
  if (!isMarkdownFile(file)) return { ok: false, reason: 'type' };
  try {
    return { ok: true, text: await file.text() };
  } catch {
    return { ok: false, reason: 'read' };
  }
}

function matchesCommandShortcut(event, key) {
  return (
    Boolean(event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === key.toLowerCase()
  );
}

function shouldCaptureInitialPaste({ inputValue, target, clipboardText }) {
  const tagName = target?.tagName?.toUpperCase();
  const editableField =
    ((tagName === 'INPUT' || tagName === 'TEXTAREA') && !target.readOnly && !target.disabled) ||
    Boolean(target?.isContentEditable);
  return inputValue === '' && clipboardText !== '' && !editableField;
}

function initApp(documentRef, windowRef) {
  const input = documentRef.getElementById('input');
  const output = documentRef.getElementById('output');
  const inputChars = documentRef.getElementById('inputChars');
  const outputChars = documentRef.getElementById('outputChars');
  const savedEl = documentRef.getElementById('saved');
  const openFileBtn = documentRef.getElementById('openFile');
  const fileInput = documentRef.getElementById('fileInput');
  const inputPanel = documentRef.getElementById('inputPanel');
  const copyBtn = documentRef.getElementById('copy');
  const clearBtn = documentRef.getElementById('clear');
  const themeBtn = documentRef.getElementById('theme');
  const copyStatus = documentRef.getElementById('copyStatus');
  const fileStatus = documentRef.getElementById('fileStatus');
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

  function renderUpdate({ raw, plain }) {
    if (output.value !== plain) output.value = plain;

    const inLen = raw.length;
    const outLen = plain.length;
    const rawSaved = inLen > 0 ? Math.round((1 - outLen / inLen) * 100) : 0;
    const saved = Math.max(0, rawSaved);
    const diff = Math.max(0, inLen - outLen);

    inputChars.textContent = inLen ? formatCount(inLen, 'char') : '';
    outputChars.textContent = outLen || inLen ? formatCount(outLen, 'char') : '';
    let savingsText = '';
    if (inLen > 0) {
      savingsText = diff === 0 ? 'No change' : `${saved}% smaller · ${formatCount(diff, 'char')} removed`;
    }
    savedEl.textContent = savingsText;
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

  let fileFeedbackTimer = null;
  let fileLoadGeneration = 0;
  let dragDepth = 0;

  function clearFileFeedback() {
    if (fileFeedbackTimer !== null) windowRef.clearTimeout(fileFeedbackTimer);
    fileFeedbackTimer = null;
    savedEl.classList.remove('error');
    if (fileStatus) fileStatus.textContent = '';
  }

  function showFileFeedback(message) {
    clearFileFeedback();
    savedEl.textContent = message;
    savedEl.classList.add('error');
    if (fileStatus) {
      windowRef.setTimeout(() => {
        fileStatus.textContent = message;
      }, 0);
    }
    fileFeedbackTimer = windowRef.setTimeout(() => {
      fileFeedbackTimer = null;
      savedEl.classList.remove('error');
      if (fileStatus) fileStatus.textContent = '';
      scheduler.schedule(input.value);
      scheduler.flush();
    }, 1500);
  }

  async function loadFiles(files) {
    if (files.length === 0) return;
    const generation = ++fileLoadGeneration;
    if (files.length !== 1) {
      showFileFeedback('Open one file at a time');
      return;
    }

    const result = await readMarkdownFile(files[0]);
    if (generation !== fileLoadGeneration) return;
    if (!result.ok) {
      showFileFeedback(result.reason === 'type' ? 'Markdown files only' : 'Could not open file');
      return;
    }

    clearFileFeedback();
    copyCoordinator.invalidate();
    resetCopyFeedback();
    if (copyStatus) copyStatus.textContent = '';
    input.value = result.text;
    scheduler.schedule(input.value);
    scheduler.flush();
    input.focus();
  }

  function hasDraggedFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }

  function resetDragState() {
    dragDepth = 0;
    inputPanel.classList.remove('drag-active');
  }

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

  const copyCoordinator = createCopyCoordinator(showCopyFeedback);

  async function copyOutput() {
    scheduler.schedule(input.value);
    scheduler.flush();
    if (!output.value) return;

    await copyCoordinator.run(() =>
      copyText({
        text: output.value,
        clipboard: windowRef.navigator.clipboard,
        fallbackCopy: () => {
          output.select();
          if (typeof documentRef.execCommand !== 'function') return false;
          return documentRef.execCommand('copy');
        }
      })
    );
  }

  function clearAll() {
    fileLoadGeneration += 1;
    resetDragState();
    copyCoordinator.invalidate();
    input.value = '';
    output.value = '';
    resetCopyFeedback();
    clearFileFeedback();
    if (copyStatus) copyStatus.textContent = '';
    scheduler.schedule(input.value);
    scheduler.flush();
    input.focus();
  }

  input.addEventListener('input', () => {
    fileLoadGeneration += 1;
    clearFileFeedback();
    scheduler.schedule(input.value);
  });
  openFileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    loadFiles(files);
  });
  inputPanel.addEventListener('dragenter', event => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    inputPanel.classList.add('drag-active');
  });
  inputPanel.addEventListener('dragover', event => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  inputPanel.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) inputPanel.classList.remove('drag-active');
  });
  inputPanel.addEventListener('drop', event => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    resetDragState();
    loadFiles(Array.from(event.dataTransfer.files || []));
  });
  documentRef.addEventListener('dragover', event => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = inputPanel.contains(event.target) ? 'copy' : 'none';
  });
  documentRef.addEventListener('drop', event => {
    if (!hasDraggedFiles(event)) return;
    event.preventDefault();
    resetDragState();
  });
  documentRef.addEventListener('dragend', resetDragState);
  copyBtn.addEventListener('click', copyOutput);
  clearBtn.addEventListener('click', clearAll);
  themeBtn.addEventListener('click', toggleTheme);
  colorScheme.addEventListener('change', () => {
    if (!documentRef.documentElement.hasAttribute('data-theme')) updateThemeIcon();
  });
  documentRef.addEventListener('paste', event => {
    const clipboardText = event.clipboardData?.getData('text/plain') || '';
    if (!shouldCaptureInitialPaste({ inputValue: input.value, target: event.target, clipboardText })) {
      return;
    }
    event.preventDefault();
    input.value = clipboardText;
    input.dispatchEvent(new windowRef.Event('input', { bubbles: true }));
    scheduler.flush();
    input.focus();
  });
  documentRef.addEventListener('keydown', event => {
    if (matchesCommandShortcut(event, 'o')) {
      event.preventDefault();
      fileInput.click();
      return;
    }
    if (matchesCommandShortcut(event, 'Enter')) {
      event.preventDefault();
      copyOutput();
      return;
    }
    if (
      event.key === 'Escape' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      input.focus();
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

const api = {
  mdToPlain,
  cleanUrl,
  createUniquePrefix,
  copyText,
  createCopyCoordinator,
  createUpdateScheduler,
  formatCount,
  isMarkdownFile,
  readMarkdownFile,
  matchesCommandShortcut,
  shouldCaptureInitialPaste
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  initApp(document, window);
}
