'use strict';

self.addEventListener('message', function (e) {
  var data = e.data || {};
  var id = data.id;
  var op = data.op;
  var text = data.text;
  var indent = data.indent;
  var wantValue = data.wantValue;

  try {
    var parsed = JSON.parse(text);
    var response = { id: id, ok: true };
    if (op === 'parse') {
      response.value = parsed;
    } else if (op === 'format') {
      response.output = JSON.stringify(parsed, null, indent);
      if (wantValue) response.value = parsed;
    } else if (op === 'minify') {
      response.output = JSON.stringify(parsed);
      if (wantValue) response.value = parsed;
    } else {
      throw new Error('Unknown op');
    }
    self.postMessage(response);
  } catch (err) {
    self.postMessage({ id: id, ok: false, error: err.message });
  }
});
