(function () {
  'use strict';

  var inputArea = document.getElementById('input-area');
  var outputArea = document.getElementById('output-area');
  var inputLabel = document.getElementById('input-label');
  var outputLabel = document.getElementById('output-label');
  var statusMessage = document.getElementById('status-message');
  var statusStats = document.getElementById('status-stats');
  var encodeBtn = document.getElementById('encode-btn');
  var decodeBtn = document.getElementById('decode-btn');
  var swapBtn = document.getElementById('swap-btn');
  var copyBtn = document.getElementById('copy-btn');
  var clearBtn = document.getElementById('clear-btn');
  var urlSafeToggle = document.getElementById('url-safe-toggle');
  var urlSafeLabel = document.getElementById('url-safe-label');

  var mode = 'encode';
  var MAX_BYTES = 5 * 1024 * 1024;

  // --- Helpers ---

  function setStatus(msg, type) {
    statusMessage.textContent = msg;
    statusMessage.className = 'status-message' + (type ? ' ' + type : '');
  }

  function updateStats() {
    var inLen = inputArea.value.length;
    var outLen = outputArea.value.length;
    if (!inLen && !outLen) {
      statusStats.textContent = '';
      return;
    }
    var parts = [];
    if (inLen) parts.push(inLen + ' char' + (inLen !== 1 ? 's' : '') + ' in');
    if (outLen) parts.push(outLen + ' char' + (outLen !== 1 ? 's' : '') + ' out');
    statusStats.textContent = parts.join(' \u00b7 ');
  }

  function defaultPlaceholder() {
    return mode === 'encode'
      ? 'Paste or type text here\u2026'
      : 'Paste Base64 here\u2026';
  }

  function defaultStatus() {
    return mode === 'encode'
      ? 'Paste or type text to encode'
      : 'Paste Base64 to decode';
  }

  // --- Base64 core ---

  function toUrlSafe(b64) {
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromUrlSafe(b64) {
    var s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    var pad = s.length % 4;
    if (pad === 2) s += '==';
    else if (pad === 3) s += '=';
    return s;
  }

  function bytesToBinary(bytes) {
    var parts = [];
    var CHUNK = 8192;
    for (var i = 0; i < bytes.length; i += CHUNK) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length))));
    }
    return parts.join('');
  }

  function encodeText(text) {
    var bytes = new TextEncoder().encode(text);
    var b64 = btoa(bytesToBinary(bytes));
    return urlSafeToggle.checked ? toUrlSafe(b64) : b64;
  }

  function decodeBase64(b64) {
    var input = b64.trim().replace(/\s+/g, '');
    if (!input) return '';

    // Convert URL-safe characters to standard base64
    if (input.indexOf('-') !== -1 || input.indexOf('_') !== -1) {
      input = input.replace(/-/g, '+').replace(/_/g, '/');
    }

    // Normalize padding
    input = input.replace(/=+$/, '');
    var pad = input.length % 4;
    if (pad === 2) input += '==';
    else if (pad === 3) input += '=';

    var binary = atob(input);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  // --- Process ---

  function byteLength(text) {
    return new Blob([text]).size;
  }

  function process() {
    var text = inputArea.value;
    if (!text) {
      outputArea.value = '';
      setStatus(defaultStatus());
      updateStats();
      return;
    }

    if (byteLength(text) > MAX_BYTES) {
      outputArea.value = '';
      setStatus('Input too large (max 5 MB)', 'error');
      updateStats();
      return;
    }

    try {
      if (mode === 'encode') {
        outputArea.value = encodeText(text);
        setStatus('Encoded', 'valid');
      } else {
        if (!text.trim()) {
          outputArea.value = '';
          setStatus(defaultStatus());
          updateStats();
          return;
        }
        outputArea.value = decodeBase64(text);
        setStatus('Decoded', 'valid');
      }
    } catch (e) {
      outputArea.value = '';
      setStatus(mode === 'decode' ? 'Invalid Base64 input' : 'Encoding error', 'error');
    }
    updateStats();
  }

  // --- Mode ---

  function setMode(newMode) {
    mode = newMode;
    encodeBtn.classList.toggle('active', mode === 'encode');
    decodeBtn.classList.toggle('active', mode === 'decode');
    inputLabel.textContent = mode === 'encode' ? 'Text' : 'Base64';
    outputLabel.textContent = mode === 'encode' ? 'Base64' : 'Text';
    inputArea.placeholder = defaultPlaceholder();
    urlSafeLabel.hidden = mode === 'decode';
    process();
  }

  // --- Actions ---

  function doSwap() {
    var prev = outputArea.value;
    outputArea.value = '';
    inputArea.value = prev;
    setMode(mode === 'encode' ? 'decode' : 'encode');
  }

  var copyTimer = null;

  function doCopy() {
    if (!outputArea.value) return;
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      setStatus('Copy requires a secure (HTTPS) context', 'error');
      return;
    }
    navigator.clipboard.writeText(outputArea.value).then(function () {
      clearTimeout(copyTimer);
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      copyTimer = setTimeout(function () {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 1500);
    }).catch(function () {
      setStatus('Copy failed \u2014 clipboard access denied', 'error');
    });
  }

  function doClear() {
    inputArea.value = '';
    outputArea.value = '';
    inputArea.placeholder = defaultPlaceholder();
    setStatus(defaultStatus());
    updateStats();
  }

  // --- Events ---

  encodeBtn.addEventListener('click', function () { setMode('encode'); });
  decodeBtn.addEventListener('click', function () { setMode('decode'); });
  swapBtn.addEventListener('click', doSwap);
  copyBtn.addEventListener('click', doCopy);
  clearBtn.addEventListener('click', doClear);

  urlSafeToggle.addEventListener('change', function () {
    if (!inputArea.value && outputArea.value) {
      if (urlSafeToggle.checked) {
        outputArea.value = toUrlSafe(outputArea.value);
      } else {
        outputArea.value = fromUrlSafe(outputArea.value);
      }
      updateStats();
      return;
    }
    process();
  });

  inputArea.addEventListener('input', process);

  inputArea.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') inputArea.blur();
  });

  // Init
  updateStats();
})();
