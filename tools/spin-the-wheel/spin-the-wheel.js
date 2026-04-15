(function () {
'use strict';

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spin-btn");
const resultEl = document.getElementById("result");
const optionForm = document.getElementById("option-form");
const optionInput = document.getElementById("option-input");
const optionList = document.getElementById("option-list");

const COLORS = [
  "#c06050", "#cc9a6a", "#4a8a7a", "#9a8ab0",
  "#d4875a", "#b06878", "#8a9a5a", "#6a7a9a",
  "#9a7a5a", "#3a7a7a", "#c07868", "#6a9a6a",
];

let options = [];
let currentAngle = 0;
let spinning = false;

function drawWheel() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = cx - 5;

  if (options.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1e1b17";
    ctx.fill();
    ctx.fillStyle = "#ddd6ca";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Add options to begin", cx, cy);
    return;
  }

  const sliceAngle = (Math.PI * 2) / options.length;

  options.forEach((option, i) => {
    const start = currentAngle + i * sliceAngle;
    const end = start + sliceAngle;

    // Draw slice
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = "#171411";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + sliceAngle / 2);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.min(16, 200 / options.length)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const labelRadius = radius * 0.65;
    const label = option.length > 14 ? option.slice(0, 12) + "..." : option;
    ctx.fillText(label, labelRadius, 0);
    ctx.restore();
  });

  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fillStyle = "#171411";
  ctx.fill();
}

function getWinningOption() {
  // The pointer is at the top (–90 degrees). Normalize the angle.
  const sliceAngle = (Math.PI * 2) / options.length;
  const pointerAngle = Math.PI * 1.5; // top
  // Effective angle relative to wheel rotation
  let effective = (pointerAngle - currentAngle) % (Math.PI * 2);
  if (effective < 0) effective += Math.PI * 2;
  const index = Math.floor(effective / sliceAngle);
  return options[index % options.length];
}

function spin() {
  if (spinning || options.length < 2) return;
  spinning = true;
  spinBtn.disabled = true;
  resultEl.textContent = "";

  const totalRotation = Math.PI * 2 * (5 + Math.random() * 5); // 5–10 full spins
  const duration = 4000;
  const startAngle = currentAngle;
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const ease = 1 - Math.pow(1 - t, 3);
    currentAngle = startAngle + totalRotation * ease;
    drawWheel();

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      currentAngle = currentAngle % (Math.PI * 2);
      spinning = false;
      spinBtn.disabled = false;
      resultEl.textContent = getWinningOption();
    }
  }

  requestAnimationFrame(animate);
}

function renderOptionList() {
  optionList.replaceChildren();
  options.forEach((opt, i) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = opt;
    const removeBtn = document.createElement("button");
    removeBtn.title = "Remove";
    removeBtn.textContent = "×";
    li.append(span, removeBtn);
    removeBtn.addEventListener("click", () => {
      options.splice(i, 1);
      renderOptionList();
      drawWheel();
      spinBtn.disabled = options.length < 2;
      resultEl.textContent = "";
    });
    optionList.appendChild(li);
  });
}

optionForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const val = optionInput.value.trim();
  if (!val) return;
  options.push(val);
  optionInput.value = "";
  renderOptionList();
  drawWheel();
  spinBtn.disabled = options.length < 2;
});

spinBtn.addEventListener("click", spin);

drawWheel();
})();
