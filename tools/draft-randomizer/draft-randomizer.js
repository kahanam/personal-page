(function () {
'use strict';

const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");
const nameList = document.getElementById("name-list");
const randomizeBtn = document.getElementById("randomize-btn");
const draftOrder = document.getElementById("draft-order");
const timestampEl = document.getElementById("timestamp");

let names = [];
let revealing = false;
let locked = false;
let lockedRoster = null;

function rosterKey(arr) {
  return arr.slice().sort().join("\0");
}

function checkLock() {
  if (!lockedRoster) return;
  if (rosterKey(names) === lockedRoster) {
    locked = true;
  } else {
    locked = false;
  }
}

function secureRandomInt(maxExclusive) {
  // Rejection sampling to avoid modulo bias.
  const range = 0x100000000; // 2^32
  const limit = range - (range % maxExclusive);
  const buf = new Uint32Array(1);
  let r;
  do {
    crypto.getRandomValues(buf);
    r = buf[0];
  } while (r >= limit);
  return r % maxExclusive;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function renderNameList() {
  nameList.replaceChildren();
  names.forEach(function (name, i) {
    var li = document.createElement("li");
    var span = document.createElement("span");
    span.textContent = name;
    var removeBtn = document.createElement("button");
    removeBtn.title = "Remove";
    removeBtn.textContent = "\u00d7";
    li.append(span, removeBtn);
    removeBtn.addEventListener("click", function () {
      names.splice(i, 1);
      checkLock();
      renderNameList();
      updateBtn();
      if (!locked) clearResult();
    });
    nameList.appendChild(li);
  });
}

function updateBtn() {
  randomizeBtn.disabled = names.length < 2 || revealing || locked;
}

function showTimestamp(timestamp) {
  timestampEl.textContent = "Drawn: " + new Date(timestamp).toLocaleString();
}

function clearResult() {
  draftOrder.replaceChildren();
  timestampEl.textContent = "";
}

function revealOrder(shuffled, timestamp) {
  revealing = true;
  updateBtn();
  draftOrder.replaceChildren();

  shuffled.forEach(function (name) {
    var li = document.createElement("li");
    li.textContent = name;
    draftOrder.appendChild(li);
  });

  var items = draftOrder.querySelectorAll("li");
  items.forEach(function (item, i) {
    setTimeout(function () {
      item.classList.add("revealed");
      if (i === items.length - 1) {
        revealing = false;
        updateBtn();
        showTimestamp(timestamp);
      }
    }, (i + 1) * 200);
  });
}

nameForm.addEventListener("submit", function (e) {
  e.preventDefault();
  var val = nameInput.value.trim();
  if (!val) return;
  names.push(val);
  nameInput.value = "";
  checkLock();
  renderNameList();
  updateBtn();
  if (!locked) clearResult();
});

randomizeBtn.addEventListener("click", function () {
  if (names.length < 2 || revealing || locked) return;
  locked = true;
  lockedRoster = rosterKey(names);
  revealOrder(shuffle(names), Date.now());
});
})();

