/*
 * Calorie Counter — local-only calorie and weight tracker.
 * All data lives in localStorage. No network calls.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'caloriecounter.v1';

  const DEFAULT_STATE = {
    calorieEntries: [], // { id, date: 'YYYY-MM-DD', name, calories, quantity }
    weightEntries: [],  // { date: 'YYYY-MM-DD', weight }
    frequentFoods: [],  // { id, name, calories }
    settings: {
      dailyCalorieTarget: 2000,
      goalWeight: 180,
      tdee: 2000
    }
  };

  // ─── State ─────────────────────────────────────────
  let state = loadState();
  let currentView = 'today';

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    } catch (err) {
      console.error('Failed to load state, resetting', err);
      return clone(DEFAULT_STATE);
    }
  }

  function normalizeState(obj) {
    if (!obj || typeof obj !== 'object') return clone(DEFAULT_STATE);
    return {
      calorieEntries: Array.isArray(obj.calorieEntries) ? obj.calorieEntries : [],
      weightEntries: Array.isArray(obj.weightEntries) ? obj.weightEntries : [],
      frequentFoods: Array.isArray(obj.frequentFoods) ? obj.frequentFoods : [],
      settings: { ...DEFAULT_STATE.settings, ...(obj.settings || {}) }
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  // ─── Date helpers ──────────────────────────────────
  function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  /** Parse YYYY-MM-DD to a local-time Date at midnight. */
  function fromDateStr(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function formatDateLong(dateStr) {
    return fromDateStr(dateStr).toLocaleDateString(undefined, {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  function formatDateShort(dateStr) {
    return fromDateStr(dateStr).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric'
    });
  }

  function formatDateMedium(dateStr) {
    return fromDateStr(dateStr).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  }

  // ─── View routing ──────────────────────────────────
  function showView(name) {
    currentView = name;
    document.querySelectorAll('.cc-tab').forEach(tab => {
      const active = tab.dataset.view === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.cc-view').forEach(view => {
      view.hidden = view.id !== `view-${name}`;
    });
    renderCurrentView();
  }

  function renderCurrentView() {
    switch (currentView) {
      case 'today':    renderToday();    break;
      case 'weight':   renderWeight();   break;
      case 'history':  renderHistory();  break;
      case 'settings': renderSettings(); break;
    }
  }

  // ─── Frequent foods ───────────────────────────────
  function renderFrequentFoods() {
    const container = document.getElementById('frequent-foods');
    const list = document.getElementById('frequent-list');
    list.replaceChildren();

    if (state.frequentFoods.length === 0) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    for (const food of state.frequentFoods) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cc-frequent-chip';
      chip.title = 'Add ' + food.name + ' (' + food.calories + ' kcal)';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'cc-frequent-chip-name';
      nameSpan.textContent = food.name;

      const calSpan = document.createElement('span');
      calSpan.className = 'cc-frequent-chip-cal';
      calSpan.textContent = food.calories;

      const delBtn = document.createElement('span');
      delBtn.className = 'cc-frequent-chip-del';
      delBtn.textContent = '\u00d7';
      delBtn.setAttribute('role', 'button');
      delBtn.setAttribute('aria-label', 'Remove ' + food.name + ' from frequent foods');

      chip.append(nameSpan, calSpan, delBtn);

      chip.addEventListener('click', function (e) {
        if (e.target === delBtn || delBtn.contains(e.target)) {
          state.frequentFoods = state.frequentFoods.filter(function (f) { return f.id !== food.id; });
          saveState();
          renderFrequentFoods();
          return;
        }
        addCalorieEntry(food.name, food.calories);
      });

      list.appendChild(chip);
    }
  }

  function addFrequentFood(name, calories) {
    state.frequentFoods.push({
      id: crypto.randomUUID(),
      name: name,
      calories: Math.round(calories)
    });
    saveState();
    renderFrequentFoods();
  }

  // ─── Today view ────────────────────────────────────
  function getEntriesForDate(dateStr) {
    return state.calorieEntries.filter(e => e.date === dateStr);
  }

  function getTotalForDate(dateStr) {
    return getEntriesForDate(dateStr).reduce((sum, e) => sum + e.calories * (e.quantity || 1), 0);
  }

  function renderToday() {
    const today = todayStr();
    const entries = getEntriesForDate(today);
    const total = getTotalForDate(today);
    const target = Number(state.settings.dailyCalorieTarget) || 0;
    const remaining = target - total;

    document.getElementById('today-date').textContent = formatDateLong(today);
    document.getElementById('today-total').textContent = total.toLocaleString();
    document.getElementById('today-target').textContent = target.toLocaleString();

    const remainingEl = document.getElementById('today-remaining');
    if (target <= 0) {
      remainingEl.textContent = '—';
    } else if (remaining >= 0) {
      remainingEl.textContent = remaining.toLocaleString();
    } else {
      remainingEl.textContent = `+${Math.abs(remaining).toLocaleString()}`;
    }

    // Progress bar — set SVG width attribute (CSP-safe)
    const progressEl = document.getElementById('today-progress');
    const pct = target > 0 ? Math.min(100, (total / target) * 100) : 0;
    progressEl.setAttribute('width', String(pct));
    progressEl.classList.toggle('over', target > 0 && total > target);

    renderFrequentFoods();

    // Entry list
    const list = document.getElementById('today-list');
    list.replaceChildren();
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'cc-empty';
      li.textContent = 'No entries yet. Add your first meal above.';
      list.appendChild(li);
      return;
    }
    for (const entry of entries) {
      const qty = entry.quantity || 1;
      const li = document.createElement('li');
      li.className = 'cc-entry';

      const nameEl = document.createElement('span');
      nameEl.className = 'cc-entry-name';
      nameEl.textContent = entry.name;
      if (qty > 1) {
        const qtyBadge = document.createElement('span');
        qtyBadge.className = 'cc-entry-qty';
        qtyBadge.textContent = '\u00d7' + qty;
        nameEl.appendChild(qtyBadge);
      }

      const calEl = document.createElement('span');
      calEl.className = 'cc-entry-cal';
      calEl.textContent = `${(entry.calories * qty).toLocaleString()} kcal`;

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'cc-entry-add';
      addBtn.setAttribute('aria-label', `Add another ${entry.name}`);
      addBtn.textContent = '+';
      addBtn.addEventListener('click', () => {
        entry.quantity = qty + 1;
        saveState();
        renderToday();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'cc-entry-delete';
      delBtn.setAttribute('aria-label', `Delete ${entry.name}`);
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        state.calorieEntries = state.calorieEntries.filter(e => e.id !== entry.id);
        saveState();
        renderToday();
      });

      li.append(nameEl, calEl, addBtn, delBtn);
      list.appendChild(li);
    }
  }

  // ─── Weight view ───────────────────────────────────

  /** Calories per pound of body weight. */
  var CAL_PER_LB = 3500;

  /**
   * Calculate expected weight using weekly normalization.
   * Anchors to the most recent weekly reset (a weigh-in 7+ days after
   * the previous anchor) and projects forward using calorie data.
   * Days with no calorie entries are treated as maintenance (TDEE).
   * Returns { expected, fromDate, fromWeight } or null.
   */
  function calcExpectedWeight() {
    var tdee = Number(state.settings.tdee);
    if (!Number.isFinite(tdee) || tdee <= 0) return null;
    var normDays = Number(state.settings.normalizationDays) || 7;

    var sorted = [...state.weightEntries].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) return null;

    // Build anchor chain: reset only when normDays+ days since last anchor
    var anchor = sorted[0];
    for (var i = 1; i < sorted.length; i++) {
      var daysSince = (fromDateStr(sorted[i].date) - fromDateStr(anchor.date)) / 86400000;
      if (daysSince >= normDays) {
        anchor = sorted[i];
      }
    }

    var startDate = fromDateStr(anchor.date);
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var cumulative = 0;
    var d = new Date(startDate);
    d.setDate(d.getDate() + 1);
    while (d <= today) {
      var dateStr = toDateStr(d);
      var entries = getEntriesForDate(dateStr);
      var eaten = entries.length > 0 ? getTotalForDate(dateStr) : tdee;
      cumulative += eaten - tdee;
      d.setDate(d.getDate() + 1);
    }

    return {
      expected: anchor.weight + cumulative / CAL_PER_LB,
      fromDate: anchor.date,
      fromWeight: anchor.weight
    };
  }

  /**
   * Build projected weight points with weekly normalization.
   * Resets to actual weight only on weigh-ins that are 7+ days after
   * the last reset. Days with no calorie entries assume maintenance (TDEE).
   * Returns array of { date, weight } sorted by date.
   */
  function buildProjectedWeightSeries() {
    var tdee = Number(state.settings.tdee);
    if (!Number.isFinite(tdee) || tdee <= 0) return [];
    var normDays = Number(state.settings.normalizationDays) || 7;

    var sorted = [...state.weightEntries].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) return [];

    var today = todayStr();
    var points = [];
    var weightIdx = 0;
    var currentWeight = sorted[0].weight;
    var lastResetDate = fromDateStr(sorted[0].date);
    var d = new Date(lastResetDate);
    var end = fromDateStr(today);

    while (d <= end) {
      var ds = toDateStr(d);
      if (weightIdx < sorted.length && sorted[weightIdx].date === ds) {
        var daysSinceReset = (d - lastResetDate) / 86400000;
        if (weightIdx === 0 || daysSinceReset >= normDays) {
          currentWeight = sorted[weightIdx].weight;
          lastResetDate = new Date(d);
        }
        weightIdx++;
      } else {
        var entries = getEntriesForDate(ds);
        var eaten = entries.length > 0 ? getTotalForDate(ds) : tdee;
        currentWeight += (eaten - tdee) / CAL_PER_LB;
      }
      points.push({ date: ds, weight: currentWeight });
      d.setDate(d.getDate() + 1);
    }
    return points;
  }

  function renderWeight() {
    const sorted = [...state.weightEntries].sort((a, b) => a.date.localeCompare(b.date));
    const current = sorted[sorted.length - 1];
    const goal = Number(state.settings.goalWeight);
    const hasGoal = Number.isFinite(goal) && goal > 0;

    const currentEl = document.getElementById('current-weight');
    const goalEl = document.getElementById('goal-weight-display');
    const toGoalEl = document.getElementById('weight-to-goal');

    currentEl.textContent = current ? current.weight.toFixed(1) : '—';
    goalEl.textContent = hasGoal ? `${goal.toFixed(1)} lbs` : '—';

    if (current && hasGoal) {
      const diff = current.weight - goal;
      const abs = Math.abs(diff).toFixed(1);
      if (diff > 0.05)       toGoalEl.textContent = `${abs} lbs to lose`;
      else if (diff < -0.05) toGoalEl.textContent = `${abs} lbs to gain`;
      else                   toGoalEl.textContent = 'at goal';
    } else {
      toGoalEl.textContent = '';
    }

    // Expected weight
    const expectedEl = document.getElementById('expected-weight');
    const expectedSubEl = document.getElementById('expected-weight-sub');
    const expectedInfo = calcExpectedWeight();
    if (expectedInfo) {
      expectedEl.textContent = expectedInfo.expected.toFixed(1);
      const delta = expectedInfo.expected - expectedInfo.fromWeight;
      const sign = delta >= 0 ? '+' : '';
      expectedSubEl.textContent = `${sign}${delta.toFixed(1)} lbs from ${expectedInfo.fromWeight.toFixed(1)} on ${formatDateShort(expectedInfo.fromDate)}`;
    } else {
      expectedEl.textContent = '—';
      expectedSubEl.textContent = '';
    }

    // Default date input to today if empty
    const dateInput = document.getElementById('weight-date');
    if (!dateInput.value) dateInput.value = todayStr();

    const projected = buildProjectedWeightSeries();
    drawWeightChart(sorted, hasGoal ? goal : null, projected);
  }

  // ─── History view ──────────────────────────────────
  function renderHistory() {
    // Build last-14-days window (including today)
    const days = [];
    const totals = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const str = toDateStr(d);
      days.push(str);
      totals.push(getTotalForDate(str));
    }
    drawCaloriesChart(days, totals, Number(state.settings.dailyCalorieTarget) || 0);

    // Past daily totals list — all distinct dates, newest first
    const dateSet = new Set(state.calorieEntries.map(e => e.date));
    const dates = [...dateSet].sort((a, b) => b.localeCompare(a));

    const list = document.getElementById('history-list');
    list.replaceChildren();
    if (dates.length === 0) {
      const li = document.createElement('li');
      li.className = 'cc-empty';
      li.textContent = 'No history yet.';
      list.appendChild(li);
      return;
    }
    const target = Number(state.settings.dailyCalorieTarget) || 0;
    for (const d of dates) {
      const total = getTotalForDate(d);
      const li = document.createElement('li');
      li.className = 'cc-history-entry';

      const dateEl = document.createElement('span');
      dateEl.className = 'cc-history-date';
      dateEl.textContent = formatDateMedium(d);

      const calEl = document.createElement('span');
      calEl.className = 'cc-history-cal';
      if (target > 0 && total > target) calEl.classList.add('over');
      calEl.textContent = `${total.toLocaleString()} kcal`;

      li.append(dateEl, calEl);
      list.appendChild(li);
    }
  }

  // ─── Settings view ─────────────────────────────────
  function renderSettings() {
    document.getElementById('setting-cal-target').value = state.settings.dailyCalorieTarget ?? '';
    document.getElementById('setting-goal-weight').value = state.settings.goalWeight ?? '';
    document.getElementById('setting-tdee').value = state.settings.tdee ?? '';
    document.getElementById('setting-norm-days').value = state.settings.normalizationDays ?? 7;
    const status = document.getElementById('settings-status');
    status.textContent = '';
    status.classList.remove('show');
  }

  // ─── Canvas charts ─────────────────────────────────

  /**
   * Resize the canvas backing store to match CSS size at devicePixelRatio,
   * and return a context + CSS-pixel dimensions for drawing.
   */
  function prepareCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    // Width/height are canvas attributes, not style — safe under strict CSP.
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height };
  }

  function getThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    const get = name => cs.getPropertyValue(name).trim();
    return {
      accent:  get('--accent')   || '#7c8cf5',
      accent2: get('--accent2')  || '#f5a07c',
      text:    get('--text')     || '#d4d4e0',
      textDim: get('--text-dim') || '#7a7a95',
      border:  get('--border')   || '#2e2e45'
    };
  }

  /** Produces round tick values for a nice axis. */
  function niceScale(min, max, ticks = 5) {
    if (min === max) {
      const pad = Math.abs(min) * 0.1 || 1;
      min -= pad;
      max += pad;
    }
    const range = niceNum(max - min, false);
    const step = niceNum(range / (ticks - 1), true);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    return { min: niceMin, max: niceMax, step };
  }

  function niceNum(range, round) {
    const exp = Math.floor(Math.log10(Math.max(range, 1e-9)));
    const frac = range / Math.pow(10, exp);
    let nice;
    if (round) {
      if (frac < 1.5)     nice = 1;
      else if (frac < 3)  nice = 2;
      else if (frac < 7)  nice = 5;
      else                nice = 10;
    } else {
      if (frac <= 1)      nice = 1;
      else if (frac <= 2) nice = 2;
      else if (frac <= 5) nice = 5;
      else                nice = 10;
    }
    return nice * Math.pow(10, exp);
  }

  function drawNoData(ctx, w, h, colors, msg) {
    ctx.fillStyle = colors.textDim;
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(msg, w / 2, h / 2);
  }

  function drawWeightChart(entries, goal, projected) {
    const canvas = document.getElementById('weight-chart');
    const { ctx, w, h } = prepareCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const colors = getThemeColors();
    const pad = { top: 20, right: 24, bottom: 36, left: 52 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    if (entries.length === 0) {
      drawNoData(ctx, w, h, colors, 'No weight entries yet');
      return;
    }

    const weights = entries.map(e => e.weight);
    const projWeights = projected && projected.length ? projected.map(p => p.weight) : [];
    let minV = Math.min(...weights, ...projWeights);
    let maxV = Math.max(...weights, ...projWeights);
    if (goal != null) {
      minV = Math.min(minV, goal);
      maxV = Math.max(maxV, goal);
    }
    const scale = niceScale(minV - 1, maxV + 1, 5);

    // Gridlines + Y-axis labels
    ctx.font = '11px Inter, sans-serif';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yFor = v => pad.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;

    for (let v = scale.min; v <= scale.max + 0.0001; v += scale.step) {
      const y = yFor(v);
      ctx.strokeStyle = colors.border;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = colors.textDim;
      ctx.fillText(v.toFixed(0), pad.left - 8, y);
    }

    // X-axis mapping — include projected dates in range
    const allDates = entries.map(e => fromDateStr(e.date).getTime());
    if (projected && projected.length) {
      for (const p of projected) allDates.push(fromDateStr(p.date).getTime());
    }
    const first = Math.min(...allDates);
    const last  = Math.max(...allDates);
    const xRange = last - first;
    const xFor = ts => {
      if (xRange === 0) return pad.left + plotW / 2;
      return pad.left + ((ts - first) / xRange) * plotW;
    };

    // X-axis labels (up to 3: first, middle, last)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.textDim;
    const labelDates = [];
    if (entries.length === 1) {
      labelDates.push(entries[0].date);
    } else {
      labelDates.push(entries[0].date);
      if (entries.length >= 3) labelDates.push(entries[Math.floor(entries.length / 2)].date);
      labelDates.push(entries[entries.length - 1].date);
    }
    for (const d of labelDates) {
      const x = xFor(fromDateStr(d).getTime());
      ctx.fillText(formatDateShort(d), x, pad.top + plotH + 8);
    }

    // Goal line (dashed)
    if (goal != null) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = colors.accent2;
      ctx.lineWidth = 1.5;
      const gy = yFor(goal);
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(w - pad.right, gy);
      ctx.stroke();
      ctx.restore();

      // Goal label, tucked above the line near the right edge
      ctx.fillStyle = colors.accent2;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`goal ${goal}`, w - pad.right - 2, gy - 3);
    }

    // Area under line (subtle fill)
    ctx.save();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, colors.accent + '55');
    grad.addColorStop(1, colors.accent + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    entries.forEach((e, i) => {
      const x = xFor(fromDateStr(e.date).getTime());
      const y = yFor(e.weight);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const lastX = xFor(fromDateStr(entries[entries.length - 1].date).getTime());
    const firstX = xFor(fromDateStr(entries[0].date).getTime());
    ctx.lineTo(lastX, pad.top + plotH);
    ctx.lineTo(firstX, pad.top + plotH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Line
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    entries.forEach((e, i) => {
      const x = xFor(fromDateStr(e.date).getTime());
      const y = yFor(e.weight);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Points
    ctx.fillStyle = colors.accent;
    for (const e of entries) {
      const x = xFor(fromDateStr(e.date).getTime());
      const y = yFor(e.weight);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Projected weight line (dashed, accent2)
    if (projected && projected.length >= 2) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colors.accent2;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      projected.forEach((p, i) => {
        const x = xFor(fromDateStr(p.date).getTime());
        const y = yFor(p.weight);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCaloriesChart(days, totals, target) {
    const canvas = document.getElementById('calories-chart');
    const { ctx, w, h } = prepareCanvas(canvas);
    ctx.clearRect(0, 0, w, h);

    const colors = getThemeColors();
    const pad = { top: 20, right: 24, bottom: 42, left: 52 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const hasData = totals.some(t => t > 0);
    if (!hasData && !(target > 0)) {
      drawNoData(ctx, w, h, colors, 'No calorie entries yet');
      return;
    }

    const maxV = Math.max(...totals, target || 0, 10);
    const scale = niceScale(0, maxV * 1.1, 5);

    // Gridlines + Y labels
    ctx.font = '11px Inter, sans-serif';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yFor = v => pad.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH;

    for (let v = scale.min; v <= scale.max + 0.0001; v += scale.step) {
      const y = yFor(v);
      ctx.strokeStyle = colors.border;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = colors.textDim;
      ctx.fillText(v.toLocaleString(), pad.left - 8, y);
    }

    // Bars
    const n = days.length;
    const slot = plotW / n;
    const barW = Math.max(4, slot * 0.68);
    const todayVal = todayStr();
    for (let i = 0; i < n; i++) {
      const x = pad.left + i * slot + (slot - barW) / 2;
      const val = totals[i];
      const y = yFor(val);
      const barH = Math.max(0, pad.top + plotH - y);
      const isOver = target > 0 && val > target;
      const isToday = days[i] === todayVal;
      ctx.fillStyle = isOver ? colors.accent2 : colors.accent;
      ctx.globalAlpha = val === 0 ? 0.2 : (isToday ? 1 : 0.8);
      // Rounded top corners
      const r = Math.min(3, barW / 2, barH);
      ctx.beginPath();
      ctx.moveTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, pad.top + plotH);
      ctx.lineTo(x, pad.top + plotH);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Target line (dashed)
    if (target > 0) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = colors.accent2;
      ctx.lineWidth = 1.5;
      const ty = yFor(target);
      ctx.beginPath();
      ctx.moveTo(pad.left, ty);
      ctx.lineTo(w - pad.right, ty);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = colors.accent2;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`target ${target.toLocaleString()}`, w - pad.right - 2, yFor(target) - 3);
    }

    // X labels — first, middle, last
    ctx.fillStyle = colors.textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelIndices = n >= 3 ? [0, Math.floor(n / 2), n - 1] : [...Array(n).keys()];
    for (const i of labelIndices) {
      const x = pad.left + i * slot + slot / 2;
      ctx.fillText(formatDateShort(days[i]), x, pad.top + plotH + 10);
    }
  }

  // ─── Actions ───────────────────────────────────────
  function addCalorieEntry(name, calories, quantity) {
    var qty = quantity || 1;
    var today = todayStr();
    var cal = Math.round(calories);
    // Merge with existing entry if same name and calories on same day
    var existing = state.calorieEntries.find(
      e => e.date === today && e.name === name && e.calories === cal
    );
    if (existing) {
      existing.quantity = (existing.quantity || 1) + qty;
      saveState();
      renderToday();
      return;
    }
    state.calorieEntries.push({
      id: crypto.randomUUID(),
      date: today,
      name: name,
      calories: cal,
      quantity: qty
    });
    saveState();
    renderToday();
  }

  function upsertWeightEntry(date, weight) {
    // Only one entry per day — a new entry for the same date overwrites.
    state.weightEntries = state.weightEntries.filter(e => e.date !== date);
    state.weightEntries.push({ date, weight });
    saveState();
    renderWeight();
  }

  function exportData() {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calorie-counter-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function showDataStatus(message, isError) {
    const el = document.getElementById('data-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(showDataStatus._t);
    showDataStatus._t = setTimeout(() => el.classList.remove('show'), 2500);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        state = normalizeState(parsed);
        saveState();
        renderCurrentView();
        showDataStatus('Imported');
      } catch (err) {
        showDataStatus('Import failed: ' + err.message, true);
      }
    };
    reader.onerror = () => showDataStatus('Failed to read file', true);
    reader.readAsText(file);
  }

  function clearAllData() {
    state = clone(DEFAULT_STATE);
    saveState();
    renderCurrentView();
    showDataStatus('Cleared');
  }

  // ─── Init ──────────────────────────────────────────
  function init() {
    // Tabs
    document.querySelectorAll('.cc-tab').forEach(tab => {
      tab.addEventListener('click', () => showView(tab.dataset.view));
    });

    // Food form
    const foodForm = document.getElementById('food-form');
    const foodName = document.getElementById('food-name');
    const foodCal  = document.getElementById('food-calories');
    const foodQty  = document.getElementById('food-qty');
    foodForm.addEventListener('submit', e => {
      e.preventDefault();
      const name = foodName.value.trim();
      const cal = Number(foodCal.value);
      if (!name || !Number.isFinite(cal) || cal <= 0) return;
      const qty = Number(foodQty.value) || 1;
      addCalorieEntry(name, cal, qty);
      foodName.value = '';
      foodCal.value = '';
      foodQty.value = '';
      foodName.focus();
    });

    // Fav button — save current food as frequent
    document.getElementById('food-fav').addEventListener('click', function () {
      const name = foodName.value.trim();
      const cal = Number(foodCal.value);
      if (!name || !Number.isFinite(cal) || cal <= 0) return;
      addFrequentFood(name, cal);
      foodName.value = '';
      foodCal.value = '';
      foodName.focus();
    });

    // Weight form
    const weightForm = document.getElementById('weight-form');
    const weightDate = document.getElementById('weight-date');
    const weightValue = document.getElementById('weight-value');
    weightDate.value = todayStr();
    weightForm.addEventListener('submit', e => {
      e.preventDefault();
      const date = weightDate.value;
      const val = Number(weightValue.value);
      if (!date || !Number.isFinite(val) || val <= 0) return;
      upsertWeightEntry(date, val);
      weightValue.value = '';
      weightValue.focus();
    });

    // Settings form
    const settingsForm = document.getElementById('settings-form');
    settingsForm.addEventListener('submit', e => {
      e.preventDefault();
      const cal = Number(document.getElementById('setting-cal-target').value);
      const goal = Number(document.getElementById('setting-goal-weight').value);
      const tdee = Number(document.getElementById('setting-tdee').value);
      const normDays = Number(document.getElementById('setting-norm-days').value);
      if (Number.isFinite(cal) && cal >= 0) state.settings.dailyCalorieTarget = cal;
      if (Number.isFinite(goal) && goal >= 0) state.settings.goalWeight = goal;
      if (Number.isFinite(tdee) && tdee >= 0) state.settings.tdee = tdee;
      if (Number.isFinite(normDays) && normDays >= 1) state.settings.normalizationDays = normDays;
      saveState();
      const status = document.getElementById('settings-status');
      status.textContent = 'Saved';
      status.classList.add('show');
      setTimeout(() => status.classList.remove('show'), 1500);
    });

    // Data management
    document.getElementById('export-btn').addEventListener('click', exportData);

    const importFile = document.getElementById('import-file');
    document.getElementById('import-btn').addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      if (!confirm('This will overwrite all existing data. Continue?')) {
        importFile.value = '';
        return;
      }
      importData(file);
      importFile.value = '';
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      if (!confirm('Delete ALL calorie entries, weight entries, and settings? This cannot be undone.')) return;
      clearAllData();
    });

    // Redraw charts on resize (only for views with charts)
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      if (currentView !== 'weight' && currentView !== 'history') return;
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(renderCurrentView);
    });

    // Initial view
    showView('today');
    foodName.focus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
