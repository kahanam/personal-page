(function () {
  'use strict';

  const input = document.getElementById('json-input');
  const lineNumbers = document.getElementById('line-numbers');
  const statusMessage = document.getElementById('status-message');
  const statusStats = document.getElementById('status-stats');
  const formatBtn = document.getElementById('format-btn');
  const minifyBtn = document.getElementById('minify-btn');
  const validateBtn = document.getElementById('validate-btn');
  const copyBtn = document.getElementById('copy-btn');
  const clearBtn = document.getElementById('clear-btn');
  const indentSelect = document.getElementById('indent-select');
  const treeToggle = document.getElementById('tree-toggle');
  const treeArea = document.getElementById('tree-area');
  const treeContent = document.getElementById('tree-content');
  const collapseAll = document.getElementById('collapse-all');
  const expandAll = document.getElementById('expand-all');

  const MAX_INPUT_SIZE = 5 * 1024 * 1024; // 5 MB

  function byteLength(text) {
    return new Blob([text]).size;
  }

  // Worker: offload JSON.parse / JSON.stringify so large inputs don't block the UI.
  let worker = null;
  try {
    worker = new Worker('json-worker.js');
  } catch (e) {
    worker = null;
  }

  let nextRequestId = 0;
  const pending = new Map();

  function failAllPending(message) {
    pending.forEach(function (req) {
      req.resolve({ ok: false, error: message });
    });
    pending.clear();
  }

  if (worker) {
    worker.addEventListener('message', function (e) {
      const req = pending.get(e.data.id);
      if (!req) return;
      pending.delete(e.data.id);
      req.resolve(e.data);
    });
    worker.addEventListener('error', function () {
      failAllPending('Worker error');
      worker = null;
    });
    worker.addEventListener('messageerror', function () {
      failAllPending('Worker message error');
    });
  }

  function runSync(op, text, indent, wantValue) {
    try {
      const value = JSON.parse(text);
      if (op === 'parse') return { ok: true, value: value };
      if (op === 'format') return { ok: true, value: wantValue ? value : undefined, output: JSON.stringify(value, null, indent) };
      if (op === 'minify') return { ok: true, value: wantValue ? value : undefined, output: JSON.stringify(value) };
      return { ok: false, error: 'Unknown op' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  function workerRequest(op, text, indent, wantValue) {
    if (!worker) {
      return Promise.resolve(runSync(op, text, indent, wantValue));
    }
    return new Promise(function (resolve) {
      const id = ++nextRequestId;
      pending.set(id, { resolve: resolve });
      try {
        worker.postMessage({ id: id, op: op, text: text, indent: indent, wantValue: !!wantValue });
      } catch (err) {
        pending.delete(id);
        resolve({ ok: false, error: err.message });
      }
    });
  }

  function getIndent() {
    const val = indentSelect.value;
    if (val === 'tab') return '\t';
    return parseInt(val, 10);
  }

  function getLineCount(text) {
    if (!text) return 1;
    let count = 1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') count++;
    }
    return count;
  }

  function updateLineNumbers(lines) {
    const count = lines !== undefined ? lines : getLineCount(input.value);
    const nums = [];
    for (let i = 1; i <= count; i++) {
      nums.push(i);
    }
    lineNumbers.textContent = nums.join('\n');
  }

  function updateStats(lines) {
    const text = input.value;
    if (!text) {
      statusStats.textContent = '';
      return;
    }
    const chars = text.length;
    const count = lines !== undefined ? lines : getLineCount(text);
    statusStats.textContent = count + ' line' + (count !== 1 ? 's' : '') + ' · ' + chars + ' char' + (chars !== 1 ? 's' : '');
  }

  function setStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message';
    if (type) {
      statusMessage.classList.add(type);
    }
  }

  function getErrorDetails(msg, text) {
    msg = msg || 'Invalid JSON';
    const posMatch = msg.match(/position\s+(\d+)/i);
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10);
      const upToPos = text.substring(0, pos);
      const line = upToPos.split('\n').length;
      const lastNewline = upToPos.lastIndexOf('\n');
      const col = pos - lastNewline;
      return 'Error at line ' + line + ', col ' + col + ': ' + msg;
    }
    const lineColMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (lineColMatch) {
      return 'Error at line ' + lineColMatch[1] + ', col ' + lineColMatch[2] + ': ' + msg;
    }
    const lineMatch = msg.match(/line\s+(\d+)/i);
    if (lineMatch) {
      return 'Error at line ' + lineMatch[1] + ': ' + msg;
    }
    return msg;
  }

  function refreshAfterTextChange(value) {
    const lines = getLineCount(input.value);
    updateLineNumbers(lines);
    updateStats(lines);
    if (value !== undefined && treeToggle.classList.contains('active')) {
      renderTree(value);
    }
  }

  async function doFormat() {
    const text = input.value;
    if (!text.trim()) return;
    if (byteLength(text) > MAX_INPUT_SIZE) {
      setStatus('Input too large (max 5 MB)', 'error');
      return;
    }
    const treeActive = treeToggle.classList.contains('active');
    const result = await workerRequest('format', text, getIndent(), treeActive);
    if (input.value !== text) return; // user typed while we worked
    if (result.ok) {
      input.value = result.output;
      setStatus('Formatted', 'valid');
      refreshAfterTextChange(result.value);
    } else {
      setStatus(getErrorDetails(result.error, text), 'error');
    }
  }

  async function doMinify() {
    const text = input.value;
    if (!text.trim()) return;
    if (byteLength(text) > MAX_INPUT_SIZE) {
      setStatus('Input too large (max 5 MB)', 'error');
      return;
    }
    const treeActive = treeToggle.classList.contains('active');
    const result = await workerRequest('minify', text, null, treeActive);
    if (input.value !== text) return;
    if (result.ok) {
      input.value = result.output;
      setStatus('Minified', 'valid');
      refreshAfterTextChange(result.value);
    } else {
      setStatus(getErrorDetails(result.error, text), 'error');
    }
  }

  async function doValidate() {
    const text = input.value.trim();
    if (!text) {
      setStatus('Paste or type JSON');
      return;
    }
    if (byteLength(text) > MAX_INPUT_SIZE) {
      setStatus('Input too large (max 5 MB)', 'error');
      return;
    }
    const result = await workerRequest('parse', text);
    if (result.ok) {
      setStatus('Valid JSON', 'valid');
    } else {
      setStatus(getErrorDetails(result.error, text), 'error');
    }
  }

  let copyResetTimer = null;

  function doCopy() {
    if (!input.value) return;
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      setStatus('Copy requires a secure (HTTPS) context', 'error');
      return;
    }
    navigator.clipboard.writeText(input.value).then(function () {
      clearTimeout(copyResetTimer);
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      copyResetTimer = setTimeout(function () {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 1500);
    }).catch(function () {
      setStatus('Copy failed — clipboard access denied', 'error');
    });
  }

  function doClear() {
    input.value = '';
    setStatus('Paste or type JSON');
    updateLineNumbers(1);
    updateStats(1);
    treeContent.textContent = '';
  }

  // tree view — uses DOM APIs to avoid innerHTML XSS risks
  function createTextSpan(className, text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  const MAX_TREE_DEPTH = 20;
  const MAX_TREE_NODES = 10000;

  function buildTreeNode(key, value, isLast, ctx, depth) {
    ctx.count++;
    depth = depth || 0;
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const comma = isLast ? '' : ',';
    const wrapper = document.createElement('div');

    if (ctx.count > MAX_TREE_NODES) {
      wrapper.appendChild(createTextSpan('tree-item-count', '… too large for tree view'));
      return wrapper;
    }

    if (type === 'object' || type === 'array') {
      const entries = type === 'array' ? value : Object.keys(value);
      const bracket = type === 'array' ? ['[', ']'] : ['{', '}'];
      const count = entries.length;
      const label = count + ' item' + (count !== 1 ? 's' : '');

      if (depth >= MAX_TREE_DEPTH) {
        if (key !== null) {
          wrapper.appendChild(createTextSpan('tree-key', JSON.stringify(key)));
          wrapper.appendChild(document.createTextNode(': '));
        }
        wrapper.appendChild(createTextSpan('tree-bracket', bracket[0]));
        wrapper.appendChild(createTextSpan('tree-item-count', ' ' + label + ' — max depth reached '));
        wrapper.appendChild(createTextSpan('tree-bracket', bracket[1]));
        if (comma) wrapper.appendChild(document.createTextNode(comma));
        return wrapper;
      }

      const toggle = document.createElement('span');
      toggle.className = 'tree-toggle';
      toggle.setAttribute('data-action', 'toggle');

      const arrow = createTextSpan('tree-arrow', '\u25BC');
      toggle.appendChild(arrow);

      if (key !== null) {
        toggle.appendChild(createTextSpan('tree-key', JSON.stringify(key)));
        toggle.appendChild(document.createTextNode(': '));
      }
      toggle.appendChild(createTextSpan('tree-bracket', bracket[0]));
      toggle.appendChild(document.createTextNode(' '));
      toggle.appendChild(createTextSpan('tree-item-count', label));

      wrapper.appendChild(toggle);

      const children = document.createElement('div');
      children.className = 'tree-children';

      if (type === 'array') {
        for (let i = 0; i < value.length; i++) {
          if (ctx.count > MAX_TREE_NODES) {
            const trunc = document.createElement('div');
            trunc.className = 'tree-node';
            trunc.appendChild(createTextSpan('tree-item-count', '\u2026 ' + (value.length - i) + ' more items (too large)'));
            children.appendChild(trunc);
            break;
          }
          const node = document.createElement('div');
          node.className = 'tree-node';
          node.appendChild(buildTreeNode(null, value[i], i === value.length - 1, ctx, depth + 1));
          children.appendChild(node);
        }
      } else {
        const keys = Object.keys(value);
        for (let j = 0; j < keys.length; j++) {
          if (ctx.count > MAX_TREE_NODES) {
            const trunc = document.createElement('div');
            trunc.className = 'tree-node';
            trunc.appendChild(createTextSpan('tree-item-count', '\u2026 ' + (keys.length - j) + ' more keys (too large)'));
            children.appendChild(trunc);
            break;
          }
          const node = document.createElement('div');
          node.className = 'tree-node';
          node.appendChild(buildTreeNode(keys[j], value[keys[j]], j === keys.length - 1, ctx, depth + 1));
          children.appendChild(node);
        }
      }

      wrapper.appendChild(children);

      const closing = createTextSpan('tree-bracket', bracket[1]);
      wrapper.appendChild(closing);
      if (comma) wrapper.appendChild(document.createTextNode(comma));
    } else {
      if (key !== null) {
        wrapper.appendChild(createTextSpan('tree-key', JSON.stringify(key)));
        wrapper.appendChild(document.createTextNode(': '));
      }
      if (type === 'string') {
        wrapper.appendChild(createTextSpan('tree-value-string', JSON.stringify(value)));
      } else if (type === 'number') {
        wrapper.appendChild(createTextSpan('tree-value-number', String(value)));
      } else if (type === 'boolean') {
        wrapper.appendChild(createTextSpan('tree-value-boolean', String(value)));
      } else {
        wrapper.appendChild(createTextSpan('tree-value-null', 'null'));
      }
      if (comma) wrapper.appendChild(document.createTextNode(comma));
    }

    return wrapper;
  }

  function renderTree(data) {
    treeContent.textContent = '';
    treeContent.appendChild(buildTreeNode(null, data, true, { count: 0 }));
  }

  function renderTreeError() {
    treeContent.textContent = '';
    const msg = document.createElement('span');
    msg.classList.add('status-message', 'error');
    msg.textContent = 'Fix JSON errors first';
    treeContent.appendChild(msg);
  }

  // tree toggle expand/collapse
  treeContent.addEventListener('click', function (e) {
    const toggle = e.target.closest('[data-action="toggle"]');
    if (!toggle) return;
    const children = toggle.nextElementSibling;
    const arrow = toggle.querySelector('.tree-arrow');
    if (children && children.classList.contains('tree-children')) {
      children.classList.toggle('collapsed');
      arrow.classList.toggle('collapsed');
    }
  });

  collapseAll.addEventListener('click', function () {
    const children = treeContent.querySelectorAll('.tree-children');
    const arrows = treeContent.querySelectorAll('.tree-arrow');
    for (let i = 0; i < children.length; i++) {
      children[i].classList.add('collapsed');
    }
    for (let j = 0; j < arrows.length; j++) {
      arrows[j].classList.add('collapsed');
    }
  });

  expandAll.addEventListener('click', function () {
    const children = treeContent.querySelectorAll('.tree-children');
    const arrows = treeContent.querySelectorAll('.tree-arrow');
    for (let i = 0; i < children.length; i++) {
      children[i].classList.remove('collapsed');
    }
    for (let j = 0; j < arrows.length; j++) {
      arrows[j].classList.remove('collapsed');
    }
  });

  treeToggle.addEventListener('click', async function () {
    treeToggle.classList.toggle('active');
    const isActive = treeToggle.classList.contains('active');
    treeArea.classList.toggle('hidden', !isActive);
    if (!isActive) return;
    const text = input.value.trim();
    if (!text) return;
    if (byteLength(text) > MAX_INPUT_SIZE) {
      renderTreeError();
      return;
    }
    const result = await workerRequest('parse', text);
    if (input.value.trim() !== text) return; // stale
    if (result.ok) {
      renderTree(result.value);
    } else {
      renderTreeError();
    }
  });

  // sync line numbers scroll via rAF to avoid drift
  let scrollTicking = false;
  input.addEventListener('scroll', function () {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(function () {
        lineNumbers.scrollTop = input.scrollTop;
        scrollTicking = false;
      });
    }
  });

  // live updates — debounced and race-safe via request sequence
  let liveRequestSeq = 0;

  async function handleLiveInput() {
    const text = input.value.trim();
    if (!text) {
      setStatus('Paste or type JSON');
      if (treeToggle.classList.contains('active')) {
        treeContent.textContent = '';
      }
      return;
    }
    if (byteLength(text) > MAX_INPUT_SIZE) {
      setStatus('Input too large (max 5 MB)', 'error');
      return;
    }
    const mySeq = ++liveRequestSeq;
    const treeActive = treeToggle.classList.contains('active');
    const result = await workerRequest('parse', text);
    if (mySeq !== liveRequestSeq) return; // a newer request superseded this
    if (result.ok) {
      setStatus('Valid JSON', 'valid');
      if (treeActive) {
        renderTree(result.value);
      }
    } else {
      setStatus(getErrorDetails(result.error, text), 'error');
    }
  }

  function debounce(fn, delay) {
    let timer;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(fn, delay);
    };
  }

  const debouncedLiveInput = debounce(handleLiveInput, 150);

  input.addEventListener('input', function () {
    const lines = getLineCount(input.value);
    updateLineNumbers(lines);
    updateStats(lines);
    debouncedLiveInput();
  });

  // tab key handling — Escape releases focus for keyboard navigation
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.blur();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const indent = indentSelect.value === 'tab' ? '\t' : ' '.repeat(parseInt(indentSelect.value, 10));
      input.value = input.value.substring(0, start) + indent + input.value.substring(end);
      input.selectionStart = input.selectionEnd = start + indent.length;
      input.dispatchEvent(new Event('input'));
    }
  });

  // button handlers
  formatBtn.addEventListener('click', doFormat);
  minifyBtn.addEventListener('click', doMinify);
  validateBtn.addEventListener('click', doValidate);
  copyBtn.addEventListener('click', doCopy);
  clearBtn.addEventListener('click', doClear);

  // init
  updateLineNumbers();
  updateStats();
})();
