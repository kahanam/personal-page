(function () {
'use strict';

const CATEGORIES = {
  length: {
    label: "Length",
    units: [
      { id: "m", label: "Meters" },
      { id: "km", label: "Kilometers" },
      { id: "cm", label: "Centimeters" },
      { id: "in", label: "Inches" },
      { id: "ft", label: "Feet" },
      { id: "mi", label: "Miles" },
    ],
    toBase: { m: 1, km: 1000, cm: 0.01, in: 0.0254, ft: 0.3048, mi: 1609.344 },
    defaults: ["m", "ft"],
  },
  weight: {
    label: "Weight",
    units: [
      { id: "kg", label: "Kilograms" },
      { id: "g", label: "Grams" },
      { id: "lb", label: "Pounds" },
      { id: "oz", label: "Ounces" },
    ],
    toBase: { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495 },
    defaults: ["kg", "lb"],
  },
  volume: {
    label: "Volume",
    units: [
      { id: "l", label: "Liters" },
      { id: "ml", label: "Milliliters" },
      { id: "gal", label: "Gallons (US)" },
      { id: "qt", label: "Quarts (US)" },
      { id: "cup", label: "Cups (US)" },
      { id: "floz", label: "Fluid Ounces (US)" },
    ],
    toBase: { l: 1, ml: 0.001, gal: 3.785411784, qt: 0.946352946, cup: 0.2365882365, floz: 0.0295735296 },
    defaults: ["l", "gal"],
  },
  temperature: {
    label: "Temperature",
    units: [
      { id: "c", label: "Celsius" },
      { id: "f", label: "Fahrenheit" },
      { id: "k", label: "Kelvin" },
    ],
    defaults: ["c", "f"],
  },
};

const fromValue = document.getElementById("from-value");
const toValue = document.getElementById("to-value");
const fromUnit = document.getElementById("from-unit");
const toUnit = document.getElementById("to-unit");
const swapBtn = document.getElementById("swap-btn");
const categoryTabs = document.getElementById("category-tabs");

let activeCategory = null;

function convertTemperature(value, from, to) {
  if (from === to) return value;
  // Convert to Celsius first
  let celsius;
  if (from === "c") celsius = value;
  else if (from === "f") celsius = (value - 32) * 5 / 9;
  else celsius = value - 273.15;
  // Convert from Celsius to target
  if (to === "c") return celsius;
  if (to === "f") return celsius * 9 / 5 + 32;
  return celsius + 273.15;
}

function convert() {
  const val = parseFloat(fromValue.value);
  if (isNaN(val)) {
    toValue.value = "";
    return;
  }

  const cat = CATEGORIES[activeCategory];
  let result;

  if (activeCategory === "temperature") {
    result = convertTemperature(val, fromUnit.value, toUnit.value);
  } else {
    result = val * cat.toBase[fromUnit.value] / cat.toBase[toUnit.value];
  }

  toValue.value = parseFloat(result.toPrecision(10));
}

function populateSelect(selectEl, units, defaultId) {
  selectEl.replaceChildren();
  units.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.label;
    if (u.id === defaultId) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function setCategory(categoryId) {
  activeCategory = categoryId;
  const cat = CATEGORIES[categoryId];

  document.querySelectorAll(".category-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === categoryId);
  });

  populateSelect(fromUnit, cat.units, cat.defaults[0]);
  populateSelect(toUnit, cat.units, cat.defaults[1]);
  fromValue.value = "";
  toValue.value = "";
}

function swap() {
  const tmpUnit = fromUnit.value;
  fromUnit.value = toUnit.value;
  toUnit.value = tmpUnit;

  const currentResult = toValue.value;
  if (currentResult !== "") {
    fromValue.value = currentResult;
  }
  convert();
}

// Build category tabs
Object.entries(CATEGORIES).forEach(([id, cat]) => {
  const btn = document.createElement("button");
  btn.className = "category-tab";
  btn.dataset.category = id;
  btn.textContent = cat.label;
  btn.addEventListener("click", () => setCategory(id));
  categoryTabs.appendChild(btn);
});

fromValue.addEventListener("input", convert);
fromUnit.addEventListener("change", convert);
toUnit.addEventListener("change", convert);
swapBtn.addEventListener("click", swap);

setCategory("length");
})();
