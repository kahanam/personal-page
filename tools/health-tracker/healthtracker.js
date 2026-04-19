/*
 * Health Tracker — local-only calorie, weight, and workout tracker.
 * All data lives in localStorage. No network calls.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'healthtracker.v1';
  const LEGACY_STORAGE_KEY = 'caloriecounter.v1';

  const DEFAULT_STATE = {
    calorieEntries: [], // { id, date: 'YYYY-MM-DD', name, calories, quantity }
    weightEntries: [],  // { date: 'YYYY-MM-DD', weight }
    frequentFoods: [],  // { id, name, calories }
    workoutTemplates: [], // { id, name, exercises: [{ id, name, sets, reps, weight }] }
    workoutLogs: [],    // { id, date, templateId, templateName, exercises: [{ name, sets: [{ weight, reps }] }] }
    settings: {
      dailyCalorieTarget: 2000,
      goalWeight: 180,
      tdee: 2000,
      normalizationDays: 7,
      projectionDays: 7,
      weeklyWorkoutGoal: 3,
      subtractBurnedFromProjection: true
    }
  };

  // ─── State ─────────────────────────────────────────
  let state = loadState();
  let currentView = 'today';
  let selectedDate = todayStr(); // The date currently being viewed in the "Today" tab
  let workoutSubView = 'home'; // 'home' | 'editor'
  let editingTemplateId = null; // null | 'new' | template id

  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          localStorage.setItem(STORAGE_KEY, raw);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
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
      workoutTemplates: Array.isArray(obj.workoutTemplates) ? obj.workoutTemplates : [],
      workoutLogs: Array.isArray(obj.workoutLogs) ? obj.workoutLogs : [],
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
    return y + '-' + m + '-' + day;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  function fromDateStr(str) {
    const parts = str.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
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

  function applyDelta(el, delta) {
    const str = delta > 0 ? '+' + delta : String(delta);
    el.className = 'cc-progress-delta';
    el.classList.add(delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral');
    el.textContent = str;
  }

  function getWeekStart() {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return toDateStr(d);
  }

  function getWeekEnd() {
    const start = fromDateStr(getWeekStart());
    start.setDate(start.getDate() + 6);
    return toDateStr(start);
  }

  // ─── View routing ──────────────────────────────────
  function showView(name) {
    currentView = name;
    document.querySelectorAll('.cc-tab').forEach(function (tab) {
      const active = tab.dataset.view === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.cc-view').forEach(function (view) {
      view.hidden = view.id !== 'view-' + name;
    });
    renderCurrentView();
  }

  function renderCurrentView() {
    switch (currentView) {
      case 'today':    renderToday();    break;
      case 'workouts': renderWorkouts(); break;
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

    for (let i = 0; i < state.frequentFoods.length; i++) {
      (function (food) {
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
      })(state.frequentFoods[i]);
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
    return state.calorieEntries.filter(function (e) { return e.date === dateStr; });
  }

  function getTotalForDate(dateStr) {
    return getEntriesForDate(dateStr).reduce(function (sum, e) { return sum + e.calories * (e.quantity || 1); }, 0);
  }

  function getBurnedForDate(dateStr) {
    return state.workoutLogs.filter(function (l) { return l.date === dateStr; })
      .reduce(function (sum, l) { return sum + (l.caloriesBurned || 0); }, 0);
  }

  function renderToday() {
    const today = todayStr();
    const isToday = selectedDate === today;
    const entries = getEntriesForDate(selectedDate);
    const total = getTotalForDate(selectedDate);
    const burned = getBurnedForDate(selectedDate);
    const target = Number(state.settings.dailyCalorieTarget) || 0;
    const net = total - burned;
    const remaining = target - net;

    document.getElementById('today-date').textContent = formatDateLong(selectedDate);
    document.getElementById('go-today').hidden = isToday;
    document.getElementById('next-day').disabled = selectedDate >= today;

    // Update summary labels
    const summaryLabel = document.querySelector('#view-today .cc-summary-label');
    if (summaryLabel) {
      if (isToday) {
        summaryLabel.textContent = "Today's calories";
      } else {
        const d = fromDateStr(selectedDate);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        if (selectedDate === toDateStr(yesterday)) {
          summaryLabel.textContent = "Yesterday's calories";
        } else {
          summaryLabel.textContent = "Calories for " + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
      }
    }

    document.getElementById('today-total').textContent = total.toLocaleString();
    document.getElementById('today-target').textContent = target.toLocaleString();

    const burnedRow = document.getElementById('today-burned-row');
    const burnedEl = document.getElementById('today-burned');
    if (burned > 0) {
      burnedRow.hidden = false;
      burnedEl.textContent = burned.toLocaleString();
      document.getElementById('today-net').textContent = net.toLocaleString();
    } else {
      burnedRow.hidden = true;
    }

    const remainingEl = document.getElementById('today-remaining');
    if (target <= 0) {
      remainingEl.textContent = '\u2014';
    } else if (remaining >= 0) {
      remainingEl.textContent = remaining.toLocaleString();
    } else {
      remainingEl.textContent = '+' + Math.abs(remaining).toLocaleString();
    }

    const progressEl = document.getElementById('today-progress');
    const pct = target > 0 ? Math.min(100, (net / target) * 100) : 0;
    progressEl.setAttribute('width', String(pct));
    progressEl.classList.toggle('over', target > 0 && net > target);

    // Update Expected weight label if needed
    const expectedLabel = document.querySelector('#view-today .cc-expected-row .cc-summary-label');
    if (expectedLabel) {
      expectedLabel.textContent = isToday ? "Expected today" : "Expected weight";
    }

    // Weight delta for today
    let tdee = Number(state.settings.tdee);
    const deltaRow = document.getElementById('today-weight-delta');
    const deltaValEl = document.getElementById('today-weight-delta-value');
    const deltaLabelEl = document.querySelector('#today-weight-delta .cc-weight-delta-label');
    if (Number.isFinite(tdee) && tdee > 0 && total > 0) {
      const todayNet = state.settings.subtractBurnedFromProjection !== false ? net : total;
      const deltaLbs = (todayNet - tdee) / CAL_PER_LB;
      const sign = deltaLbs >= 0 ? '+' : '';
      if (deltaLabelEl) deltaLabelEl.textContent = isToday ? "Today's weight change" : "Daily weight delta";
      deltaValEl.textContent = sign + deltaLbs.toFixed(2) + ' lbs';
      deltaValEl.className = 'cc-weight-delta-value ' + (deltaLbs > 0 ? 'gaining' : deltaLbs < 0 ? 'losing' : '');
      deltaRow.hidden = false;
    } else {
      deltaRow.hidden = true;
    }

    // Expected weight on Today tab
    const todayExpectedRow = document.getElementById('today-expected-row');
    const expectedInfo = calcExpectedWeight(selectedDate);
    const todayExpectedSubEl = document.getElementById('today-expected-sub');
    if (expectedInfo) {
      todayExpectedRow.hidden = false;
      document.getElementById('today-expected-weight').textContent = expectedInfo.expected.toFixed(1);
      const eDelta = expectedInfo.expected - expectedInfo.fromWeight;
      const eSign = eDelta >= 0 ? '+' : '';
      todayExpectedSubEl.textContent = eSign + eDelta.toFixed(1) + ' lbs from ' + expectedInfo.fromWeight.toFixed(1) + ' weighed ' + formatDateShort(expectedInfo.fromDate);
      todayExpectedSubEl.className = 'cc-summary-sub ' + (eDelta > 0.05 ? 'gaining' : eDelta < -0.05 ? 'losing' : '');
    } else {
      todayExpectedRow.hidden = true;
      todayExpectedSubEl.className = 'cc-summary-sub';
    }

    const projectedCol = document.getElementById('today-projected-col');
    const projectedInfo = calcProjectedWeight();
    if (isToday && expectedInfo && projectedInfo) {
      projectedCol.hidden = false;
      document.getElementById('today-projected-weight').textContent = projectedInfo.projected.toFixed(1);
      document.getElementById('today-projected-sub').textContent = 'by ' + formatDateShort(projectedInfo.projectionDate) + ' at ' + target.toLocaleString() + ' kcal/day';
    } else {
      projectedCol.hidden = true;
    }

    renderFrequentFoods();

    const list = document.getElementById('today-list');
    list.replaceChildren();
    if (entries.length === 0) {
      const li = document.createElement('li');
      li.className = 'cc-empty';
      li.textContent = 'No entries yet. Add your first meal above.';
      list.appendChild(li);
      return;
    }
    entries.forEach(function (entry) {
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
      calEl.textContent = (entry.calories * qty).toLocaleString() + ' kcal';

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'cc-entry-add';
      addBtn.setAttribute('aria-label', 'Add another ' + entry.name);
      addBtn.textContent = '+';
      addBtn.addEventListener('click', function () {
        entry.quantity = qty + 1;
        saveState();
        renderCurrentView();
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'cc-entry-delete';
      delBtn.setAttribute('aria-label', 'Delete ' + entry.name);
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', function () {
        state.calorieEntries = state.calorieEntries.filter(function (e) { return e.id !== entry.id; });
        saveState();
        renderCurrentView();
      });

      li.append(nameEl, calEl, addBtn, delBtn);
      list.appendChild(li);
    });
  }

  // ─── Weight view ───────────────────────────────────
  const CAL_PER_LB = 3500;

  function calorieWeightDelta(calories, tdee) {
    return (calories - tdee) / CAL_PER_LB;
  }

  function calcExpectedWeight(targetDateStr) {
    let tdee = Number(state.settings.tdee);
    if (!Number.isFinite(tdee) || tdee <= 0) return null;
    const normDays = Number(state.settings.normalizationDays) || 7;

    const sorted = state.weightEntries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (sorted.length === 0) return null;

    const targetDate = targetDateStr ? fromDateStr(targetDateStr) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    // Find the weight anchor: the last weigh-in that was at least normDays after the previous anchor
    let anchor = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const weighDate = fromDateStr(sorted[i].date);
      if (weighDate > targetDate) break;

      const daysSince = (weighDate - fromDateStr(anchor.date)) / 86400000;
      if (daysSince >= normDays) {
        anchor = sorted[i];
      }
    }

    const startDate = fromDateStr(anchor.date);
    if (startDate > targetDate) return null;

    let cumulative = 0;
    const d = new Date(startDate);
    d.setDate(d.getDate() + 1);
    while (d <= targetDate) {
      const dateStr = toDateStr(d);
      const entries = getEntriesForDate(dateStr);
      const burned = state.settings.subtractBurnedFromProjection !== false ? getBurnedForDate(dateStr) : 0;
      const eaten = entries.length > 0 ? getTotalForDate(dateStr) - burned : tdee;
      cumulative += eaten - tdee;
      d.setDate(d.getDate() + 1);
    }

    return {
      expected: anchor.weight + cumulative / CAL_PER_LB,
      fromDate: anchor.date,
      fromWeight: anchor.weight
    };
  }

  function calcProjectedWeight() {
    const expectedInfo = calcExpectedWeight();
    if (!expectedInfo) return null;

    const target = Number(state.settings.dailyCalorieTarget) || 0;
    const tdee = Number(state.settings.tdee);
    if (!Number.isFinite(tdee) || tdee <= 0 || target <= 0) return null;

    const projectionDays = Number(state.settings.projectionDays) || 7;
    const projectionDate = fromDateStr(expectedInfo.fromDate);
    projectionDate.setDate(projectionDate.getDate() + projectionDays);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (projectionDate < tomorrow) return null;

    const remainingDays = Math.ceil((projectionDate - today) / 86400000);
    const dailyDelta = calorieWeightDelta(target, tdee);

    return {
      projected: expectedInfo.expected + remainingDays * dailyDelta,
      projectionDate: toDateStr(projectionDate),
      remainingDays: remainingDays
    };
  }

  function calcGoalHitDate() {
    const expectedInfo = calcExpectedWeight();
    if (!expectedInfo) return null;

    const goal = Number(state.settings.goalWeight);
    const target = Number(state.settings.dailyCalorieTarget) || 0;
    const tdee = Number(state.settings.tdee);
    if (!Number.isFinite(goal) || goal <= 0) return null;
    if (!Number.isFinite(tdee) || tdee <= 0 || target <= 0) return null;

    const diff = goal - expectedInfo.expected;
    if (Math.abs(diff) <= 0.05) {
      return {
        goalDate: todayStr(),
        daysToGoal: 0,
        alreadyAtGoal: true
      };
    }

    const dailyDelta = calorieWeightDelta(target, tdee);
    if (Math.abs(dailyDelta) < 0.000001) return null;
    if ((diff > 0 && dailyDelta <= 0) || (diff < 0 && dailyDelta >= 0)) return null;

    const daysToGoal = Math.ceil(Math.abs(diff / dailyDelta));
    const goalDate = new Date();
    goalDate.setHours(0, 0, 0, 0);
    goalDate.setDate(goalDate.getDate() + daysToGoal);

    return {
      goalDate: toDateStr(goalDate),
      daysToGoal: daysToGoal,
      alreadyAtGoal: false
    };
  }

  function buildProjectedWeightSeries() {
    let tdee = Number(state.settings.tdee);
    if (!Number.isFinite(tdee) || tdee <= 0) return [];
    const normDays = Number(state.settings.normalizationDays) || 7;

    const sorted = state.weightEntries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (sorted.length === 0) return [];

    const today = todayStr();
    const points = [];
    let weightIdx = 0;
    let currentWeight = sorted[0].weight;
    let lastResetDate = fromDateStr(sorted[0].date);
    const d = new Date(lastResetDate);
    const end = fromDateStr(today);

    while (d <= end) {
      const ds = toDateStr(d);
      if (weightIdx < sorted.length && sorted[weightIdx].date === ds) {
        const daysSinceReset = (d - lastResetDate) / 86400000;
        if (weightIdx === 0 || daysSinceReset >= normDays) {
          currentWeight = sorted[weightIdx].weight;
          lastResetDate = new Date(d);
        }
        weightIdx++;
      } else {
        const entries = getEntriesForDate(ds);
        const burned = state.settings.subtractBurnedFromProjection !== false ? getBurnedForDate(ds) : 0;
        const eaten = entries.length > 0 ? getTotalForDate(ds) - burned : tdee;
        currentWeight += calorieWeightDelta(eaten, tdee);
      }
      points.push({ date: ds, weight: currentWeight });
      d.setDate(d.getDate() + 1);
    }
    return points;
  }

  function renderWeight() {
    const sorted = state.weightEntries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    const current = sorted[sorted.length - 1];
    const goal = Number(state.settings.goalWeight);
    const hasGoal = Number.isFinite(goal) && goal > 0;

    const currentEl = document.getElementById('current-weight');
    const goalEl = document.getElementById('goal-weight-display');
    const toGoalEl = document.getElementById('weight-to-goal');
    const goalHitDateEl = document.getElementById('goal-hit-date');

    currentEl.textContent = current ? current.weight.toFixed(1) : '\u2014';
    const currentDateEl = document.getElementById('current-weight-date');
    currentDateEl.textContent = current ? formatDateShort(current.date) : '';
    goalEl.textContent = hasGoal ? goal.toFixed(1) + ' lbs' : '\u2014';

    if (current && hasGoal) {
      const diff = current.weight - goal;
      const abs = Math.abs(diff).toFixed(1);
      if (diff > 0.05)       toGoalEl.textContent = abs + ' lbs to lose';
      else if (diff < -0.05) toGoalEl.textContent = abs + ' lbs to gain';
      else                   toGoalEl.textContent = 'at goal';
    } else {
      toGoalEl.textContent = '';
    }

    const goalHitInfo = calcGoalHitDate();
    if (goalHitInfo) {
      if (goalHitInfo.alreadyAtGoal) {
        goalHitDateEl.textContent = 'At target calories: today';
      } else {
        goalHitDateEl.textContent = 'At target calories: ~' + formatDateShort(goalHitInfo.goalDate);
      }
    } else {
      goalHitDateEl.textContent = '';
    }

    const expectedEl = document.getElementById('expected-weight');
    const expectedSubEl = document.getElementById('expected-weight-sub');
    const expectedInfo = calcExpectedWeight();
    if (expectedInfo) {
      expectedEl.textContent = expectedInfo.expected.toFixed(1);
      const delta = expectedInfo.expected - expectedInfo.fromWeight;
      const sign = delta >= 0 ? '+' : '';
      expectedSubEl.textContent = sign + delta.toFixed(1) + ' lbs from ' + expectedInfo.fromWeight.toFixed(1) + ' weighed ' + formatDateShort(expectedInfo.fromDate);
      expectedSubEl.className = 'cc-summary-sub ' + (delta > 0.05 ? 'gaining' : delta < -0.05 ? 'losing' : '');
    } else {
      expectedEl.textContent = '\u2014';
      expectedSubEl.textContent = '';
      expectedSubEl.className = 'cc-summary-sub';
    }

    const weightProjectedCol = document.getElementById('weight-projected-col');
    const weightProjectedInfo = calcProjectedWeight();
    if (expectedInfo && weightProjectedInfo) {
      weightProjectedCol.hidden = false;
      document.getElementById('weight-projected-weight').textContent = weightProjectedInfo.projected.toFixed(1);
      const projTarget = Number(state.settings.dailyCalorieTarget) || 0;
      const goalDateText = goalHitInfo
        ? (goalHitInfo.alreadyAtGoal ? ' · goal today' : ' · goal ~' + formatDateShort(goalHitInfo.goalDate))
        : '';
      document.getElementById('weight-projected-sub').textContent = 'by ' + formatDateShort(weightProjectedInfo.projectionDate) + ' at ' + projTarget.toLocaleString() + ' kcal/day' + goalDateText;
    } else {
      weightProjectedCol.hidden = true;
    }

    const dateInput = document.getElementById('weight-date');
    if (!dateInput.value) dateInput.value = todayStr();

    const projected = buildProjectedWeightSeries();
    drawWeightChart(sorted, hasGoal ? goal : null, projected);
  }

  // ─── History view ──────────────────────────────────
  function renderHistory() {
    const days = [];
    const totals = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const str = toDateStr(d);
      days.push(str);
      totals.push(Math.max(0, getTotalForDate(str) - getBurnedForDate(str)));
    }
    drawCaloriesChart(days, totals, Number(state.settings.dailyCalorieTarget) || 0);

    const dateSet = new Set(state.calorieEntries.map(function (e) { return e.date; }));
    const dates = Array.from(dateSet).sort(function (a, b) { return b.localeCompare(a); });

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
    dates.forEach(function (d) {
      const total = getTotalForDate(d);
      const burned = getBurnedForDate(d);
      const net = total - burned;
      const entries = getEntriesForDate(d);
      const li = document.createElement('li');
      li.className = 'cc-history-day';

      const header = document.createElement('div');
      header.className = 'cc-history-entry cc-history-entry-toggle';

      const toggle = document.createElement('span');
      toggle.className = 'cc-history-toggle';
      toggle.textContent = '\u25B6';

      const dateEl = document.createElement('span');
      dateEl.className = 'cc-history-date';
      dateEl.textContent = formatDateMedium(d);

      const calEl = document.createElement('span');
      calEl.className = 'cc-history-cal';
      if (target > 0 && net > target) calEl.classList.add('over');
      calEl.textContent = net.toLocaleString() + ' kcal';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'cc-btn cc-btn-sm cc-history-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        selectedDate = d;
        showView('today');
      });

      header.append(toggle, dateEl, editBtn, calEl);

      if (burned > 0) {
        const burnedEl = document.createElement('span');
        burnedEl.className = 'cc-history-burned';
        burnedEl.textContent = '-' + burned.toLocaleString();
        header.appendChild(burnedEl);
      }

      const detail = document.createElement('div');
      detail.className = 'cc-history-detail';
      detail.hidden = true;

      entries.forEach(function (entry) {
        const qty = entry.quantity || 1;
        const row = document.createElement('div');
        row.className = 'cc-history-food';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'cc-history-food-name';
        nameSpan.textContent = entry.name;
        if (qty > 1) {
          const qtyBadge = document.createElement('span');
          qtyBadge.className = 'cc-entry-qty';
          qtyBadge.textContent = '\u00d7' + qty;
          nameSpan.appendChild(qtyBadge);
        }
        const calSpan = document.createElement('span');
        calSpan.className = 'cc-history-food-cal';
        calSpan.textContent = (entry.calories * qty).toLocaleString() + ' kcal';
        row.append(nameSpan, calSpan);
        detail.appendChild(row);
      });

      header.addEventListener('click', function () {
        const open = !detail.hidden;
        detail.hidden = open;
        li.classList.toggle('expanded', !open);
      });

      li.append(header, detail);
      list.appendChild(li);
    });
  }

  // ─── Workouts view ─────────────────────────────────
  function renderWorkouts() {
    const home = document.getElementById('workout-home');
    const editor = document.getElementById('workout-editor');

    home.hidden = workoutSubView !== 'home';
    editor.hidden = workoutSubView !== 'editor';

    switch (workoutSubView) {
      case 'home':   renderWorkoutHome();   break;
      case 'editor': renderWorkoutEditor(); break;
    }
  }

  function renderWorkoutHome() {
    // Date indicator
    const dateInd = document.getElementById('workout-date-indicator');
    const isToday = selectedDate === todayStr();
    if (isToday) {
      dateInd.hidden = true;
    } else {
      dateInd.hidden = false;
      dateInd.textContent = 'Logging workouts for ' + formatDateMedium(selectedDate);
    }

    // Weekly summary
    const weekStart = getWeekStart();
    const weekEnd = getWeekEnd();
    const weekWorkouts = state.workoutLogs.filter(function (l) {
      return l.date >= weekStart && l.date <= weekEnd;
    });
    const goal = Number(state.settings.weeklyWorkoutGoal) || 3;

    document.getElementById('week-workout-count').textContent = weekWorkouts.length;
    document.getElementById('week-workout-goal').textContent = goal;

    const progressEl = document.getElementById('workout-progress');
    const pct = goal > 0 ? Math.min(100, (weekWorkouts.length / goal) * 100) : 0;
    progressEl.setAttribute('width', String(pct));
    progressEl.classList.toggle('complete', weekWorkouts.length >= goal && goal > 0);

    // Template list
    const templateList = document.getElementById('workout-template-list');
    templateList.replaceChildren();

    if (state.workoutTemplates.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cc-empty';
      empty.textContent = 'No templates yet. Create one to get started.';
      templateList.appendChild(empty);
    } else {
      const grid = document.createElement('div');
      grid.className = 'cc-template-grid';

      state.workoutTemplates.forEach(function (template) {
        const card = document.createElement('div');
        card.className = 'cc-template-card';

        const info = document.createElement('div');
        info.className = 'cc-template-card-info';

        let name = document.createElement('div');
        name.className = 'cc-template-card-name';
        name.textContent = template.name;

        const desc = document.createElement('div');
        desc.className = 'cc-template-card-desc';
        let descText = template.exercises.map(function (e) { return e.name; }).join(' \u00b7 ');
        if (template.caloriesBurned) descText += ' \u00b7 -' + template.caloriesBurned + ' kcal';
        desc.textContent = descText;

        info.append(name, desc);

        const actions = document.createElement('div');
        actions.className = 'cc-template-card-actions';

        const logBtn = document.createElement('button');
        logBtn.type = 'button';
        logBtn.className = 'cc-btn cc-btn-primary cc-btn-sm';
        logBtn.textContent = 'Log';
        logBtn.addEventListener('click', function () { logWorkout(template); });

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'cc-btn cc-btn-sm';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', function () {
          editingTemplateId = template.id;
          workoutSubView = 'editor';
          renderWorkouts();
        });

        actions.append(logBtn, editBtn);
        card.append(info, actions);
        grid.appendChild(card);
      });

      templateList.appendChild(grid);
    }

    // History
    const historyList = document.getElementById('workout-history-list');
    historyList.replaceChildren();

    const sortedLogs = state.workoutLogs.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });

    if (sortedLogs.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'cc-empty';
      emptyLi.textContent = 'No workouts logged yet.';
      historyList.appendChild(emptyLi);
    } else {
      sortedLogs.forEach(function (log) {
        historyList.appendChild(createWorkoutLogEntry(log));
      });
    }

    renderExerciseProgress();
  }

  function createWorkoutLogEntry(log) {
    const li = document.createElement('li');
    li.className = 'cc-workout-log-entry';

    const header = document.createElement('div');
    header.className = 'cc-workout-log-header';

    const dateEl = document.createElement('span');
    dateEl.className = 'cc-workout-log-date';
    dateEl.textContent = formatDateMedium(log.date);

    const nameEl = document.createElement('span');
    nameEl.className = 'cc-workout-log-name';
    nameEl.textContent = log.templateName;

    let totalSets = 0;
    let cardioCount = 0;
    log.exercises.forEach(function (ex) {
      if (ex.type === 'cardio') { cardioCount++; }
      else if (ex.sets) { totalSets += ex.sets.length; }
    });
    const summaryEl = document.createElement('span');
    summaryEl.className = 'cc-workout-log-summary';
    const parts = [];
    if (log.exercises.length - cardioCount > 0) parts.push((log.exercises.length - cardioCount) + ' ex');
    if (totalSets > 0) parts.push(totalSets + ' sets');
    if (cardioCount > 0) parts.push(cardioCount + ' cardio');
    if (log.caloriesBurned) parts.push('-' + log.caloriesBurned + ' kcal');
    const summaryText = parts.join(' \u00b7 ');
    summaryEl.textContent = summaryText;

    const toggleEl = document.createElement('span');
    toggleEl.className = 'cc-workout-log-toggle';
    toggleEl.textContent = '\u25b6';

    header.append(dateEl, nameEl, summaryEl, toggleEl);

    const detail = document.createElement('div');
    detail.className = 'cc-workout-log-detail';
    detail.hidden = true;

    log.exercises.forEach(function (exercise) {
      const exDiv = document.createElement('div');
      exDiv.className = 'cc-workout-log-exercise';

      const exName = document.createElement('div');
      exName.className = 'cc-workout-log-exercise-name';
      exName.textContent = exercise.name;

      exDiv.appendChild(exName);

      if (exercise.type === 'cardio') {
        const cardioEl = document.createElement('div');
        cardioEl.className = 'cc-workout-log-set';
        const cardioParts = [];
        if (exercise.duration) cardioParts.push(exercise.duration + ' min');
        if (exercise.distance) cardioParts.push(exercise.distance + ' mi');
        cardioEl.textContent = cardioParts.join(' \u00b7 ') || 'Logged';
        exDiv.appendChild(cardioEl);
      } else if (exercise.sets) {
        exercise.sets.forEach(function (set, si) {
          const setEl = document.createElement('div');
          setEl.className = 'cc-workout-log-set';
          setEl.textContent = 'Set ' + (si + 1) + ': ' + set.weight + ' lbs \u00d7 ' + set.reps + ' reps';
          exDiv.appendChild(setEl);
        });
      }

      detail.appendChild(exDiv);
    });

    // Delete button inside detail
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'cc-workout-log-actions';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'cc-btn cc-btn-sm cc-btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!confirm('Delete this workout log?')) return;
      state.workoutLogs = state.workoutLogs.filter(function (l) { return l.id !== log.id; });
      saveState();
      renderWorkoutHome();
    });
    actionsDiv.appendChild(delBtn);
    detail.appendChild(actionsDiv);

    header.addEventListener('click', function () {
      detail.hidden = !detail.hidden;
      li.classList.toggle('expanded');
    });

    li.append(header, detail);
    return li;
  }

  // ─── Exercise progress ─────────────────────────────
  function renderExerciseProgress() {
    const container = document.getElementById('exercise-progress-list');
    container.replaceChildren();

    const sortedLogs = state.workoutLogs.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    // Group by exercise name, preserving first-appearance order
    const exerciseNames = [];
    const exerciseHistory = {};

    sortedLogs.forEach(function (log) {
      log.exercises.forEach(function (ex) {
        if (!exerciseHistory[ex.name]) {
          exerciseHistory[ex.name] = { type: ex.type || 'strength', entries: [] };
          exerciseNames.push(ex.name);
        }
        if (ex.type === 'cardio') {
          exerciseHistory[ex.name].entries.push({
            date: log.date,
            duration: ex.duration || 0,
            distance: ex.distance || 0
          });
        } else {
          let maxWeight = 0;
          if (ex.sets) ex.sets.forEach(function (s) { if (s.weight > maxWeight) maxWeight = s.weight; });
          exerciseHistory[ex.name].entries.push({
            date: log.date,
            weight: maxWeight,
            sets: ex.sets ? ex.sets.length : 0,
            reps: ex.sets && ex.sets[0] ? ex.sets[0].reps : 0
          });
        }
      });
    });

    if (exerciseNames.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'cc-empty';
      empty.textContent = 'Log workouts to track progress.';
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'cc-history-list';

    exerciseNames.forEach(function (name) {
      const exData = exerciseHistory[name];
      const isCardio = exData.type === 'cardio';
      const history = exData.entries;
      const first = history[0];
      const last = history[history.length - 1];

      const li = document.createElement('li');
      li.className = 'cc-workout-log-entry';

      const header = document.createElement('div');
      header.className = 'cc-workout-log-header';

      const nameEl = document.createElement('span');
      nameEl.className = 'cc-workout-log-name';
      nameEl.textContent = name;

      const progressEl = document.createElement('span');
      progressEl.className = 'cc-progress-summary';

      const deltaEl = document.createElement('span');

      if (isCardio) {
        if (history.length === 1) {
          const parts = [];
          if (last.distance) parts.push(last.distance + ' mi');
          if (last.duration) parts.push(last.duration + ' min');
          progressEl.textContent = parts.join(' \u00b7 ') || 'Logged';
        } else {
          if (last.distance && first.distance) {
            progressEl.textContent = first.distance + ' \u2192 ' + last.distance + ' mi';
            applyDelta(deltaEl, last.distance - first.distance);
          } else if (last.duration && first.duration) {
            progressEl.textContent = first.duration + ' \u2192 ' + last.duration + ' min';
            applyDelta(deltaEl, last.duration - first.duration);
          } else {
            progressEl.textContent = history.length + ' sessions';
          }
        }
      } else {
        const delta = last.weight - first.weight;
        if (history.length === 1) {
          progressEl.textContent = last.weight + ' lbs';
        } else {
          progressEl.textContent = first.weight + ' \u2192 ' + last.weight + ' lbs';
        }
        if (history.length > 1) {
          applyDelta(deltaEl, delta);
        }
      }

      const toggleEl = document.createElement('span');
      toggleEl.className = 'cc-workout-log-toggle';
      toggleEl.textContent = '\u25b6';

      header.append(nameEl, progressEl, deltaEl, toggleEl);

      const detail = document.createElement('div');
      detail.className = 'cc-workout-log-detail';
      detail.hidden = true;

      history.slice().reverse().forEach(function (entry) {
        const row = document.createElement('div');
        row.className = 'cc-progress-row';

        const dateEl = document.createElement('span');
        dateEl.className = 'cc-progress-date';
        dateEl.textContent = formatDateMedium(entry.date);

        const valEl = document.createElement('span');
        valEl.className = 'cc-progress-weight';

        const detailEl = document.createElement('span');
        detailEl.className = 'cc-progress-detail';

        if (isCardio) {
          valEl.textContent = entry.distance ? entry.distance + ' mi' : '';
          detailEl.textContent = entry.duration ? entry.duration + ' min' : '';
        } else {
          valEl.textContent = entry.weight + ' lbs';
          detailEl.textContent = entry.sets + '\u00d7' + entry.reps;
        }

        row.append(dateEl, valEl, detailEl);
        detail.appendChild(row);
      });

      header.addEventListener('click', function () {
        detail.hidden = !detail.hidden;
        li.classList.toggle('expanded');
      });

      li.append(header, detail);
      list.appendChild(li);
    });

    container.appendChild(list);
  }

  // ─── Workout editor ────────────────────────────────
  function renderWorkoutEditor() {
    const template = editingTemplateId && editingTemplateId !== 'new'
      ? state.workoutTemplates.find(function (t) { return t.id === editingTemplateId; })
      : null;

    document.getElementById('editor-title').textContent = template ? 'Edit Template' : 'New Template';
    document.getElementById('template-name').value = template ? template.name : '';
    document.getElementById('template-calories').value = template && template.caloriesBurned ? template.caloriesBurned : '';
    document.getElementById('delete-template-btn').hidden = !template;

    const container = document.getElementById('template-exercises');
    container.replaceChildren();

    if (template) {
      template.exercises.forEach(function (ex) {
        container.appendChild(createExerciseRow(ex));
      });
    } else {
      container.appendChild(createExerciseRow(null));
    }
  }

  function createExerciseRow(exercise) {
    const row = document.createElement('div');
    row.className = 'cc-exercise-row';

    let type = exercise ? (exercise.type || 'strength') : 'strength';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'cc-input cc-input-type';
    typeSelect.dataset.field = 'type';
    const optStrength = document.createElement('option');
    optStrength.value = 'strength';
    optStrength.textContent = 'Strength';
    const optCardio = document.createElement('option');
    optCardio.value = 'cardio';
    optCardio.textContent = 'Cardio';
    typeSelect.append(optStrength, optCardio);
    typeSelect.value = type;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cc-input cc-input-grow';
    nameInput.placeholder = type === 'cardio' ? 'e.g. Walk, Run' : 'Exercise name';
    nameInput.value = exercise ? exercise.name : '';
    nameInput.dataset.field = 'name';

    const setsInput = document.createElement('input');
    setsInput.type = 'number';
    setsInput.className = 'cc-input cc-input-sm cc-strength-field';
    setsInput.placeholder = 'Sets';
    setsInput.value = exercise && type === 'strength' ? exercise.sets : '';
    setsInput.min = '1';
    setsInput.max = '20';
    setsInput.inputMode = 'numeric';
    setsInput.dataset.field = 'sets';

    const repsInput = document.createElement('input');
    repsInput.type = 'number';
    repsInput.className = 'cc-input cc-input-sm cc-strength-field';
    repsInput.placeholder = 'Reps';
    repsInput.value = exercise && type === 'strength' ? exercise.reps : '';
    repsInput.min = '1';
    repsInput.inputMode = 'numeric';
    repsInput.dataset.field = 'reps';

    const weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.className = 'cc-input cc-input-sm cc-strength-field';
    weightInput.placeholder = 'lbs';
    weightInput.value = exercise && exercise.weight ? exercise.weight : '';
    weightInput.min = '0';
    weightInput.step = '2.5';
    weightInput.inputMode = 'decimal';
    weightInput.dataset.field = 'weight';

    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.className = 'cc-input cc-input-sm cc-cardio-field';
    durationInput.placeholder = 'Min';
    durationInput.value = exercise && exercise.duration ? exercise.duration : '';
    durationInput.min = '0';
    durationInput.inputMode = 'numeric';
    durationInput.dataset.field = 'duration';

    const distanceInput = document.createElement('input');
    distanceInput.type = 'number';
    distanceInput.className = 'cc-input cc-input-sm cc-cardio-field';
    distanceInput.placeholder = 'Miles';
    distanceInput.value = exercise && exercise.distance ? exercise.distance : '';
    distanceInput.min = '0';
    distanceInput.step = '0.1';
    distanceInput.inputMode = 'decimal';
    distanceInput.dataset.field = 'distance';

    function updateFieldVisibility() {
      const isCardio = typeSelect.value === 'cardio';
      setsInput.hidden = isCardio;
      repsInput.hidden = isCardio;
      weightInput.hidden = isCardio;
      durationInput.hidden = !isCardio;
      distanceInput.hidden = !isCardio;
      nameInput.placeholder = isCardio ? 'e.g. Walk, Run' : 'Exercise name';
    }

    typeSelect.addEventListener('change', updateFieldVisibility);
    updateFieldVisibility();

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'cc-entry-delete';
    delBtn.textContent = '\u00d7';
    delBtn.setAttribute('aria-label', 'Remove exercise');
    delBtn.addEventListener('click', function () { row.remove(); });

    row.append(typeSelect, nameInput, setsInput, repsInput, weightInput, durationInput, distanceInput, delBtn);
    return row;
  }

  function saveTemplate() {
    let name = document.getElementById('template-name').value.trim();
    if (!name) return;
    const calories = Number(document.getElementById('template-calories').value) || 0;

    const rows = document.querySelectorAll('#template-exercises .cc-exercise-row');
    let exercises = [];
    rows.forEach(function (row) {
      const exName = row.querySelector('[data-field="name"]').value.trim();
      const exType = row.querySelector('[data-field="type"]').value;
      if (!exName) return;

      if (exType === 'cardio') {
        exercises.push({
          id: crypto.randomUUID(),
          name: exName,
          type: 'cardio',
          duration: Math.max(0, Number(row.querySelector('[data-field="duration"]').value) || 0),
          distance: Math.max(0, Number(row.querySelector('[data-field="distance"]').value) || 0)
        });
      } else {
        const sets = Number(row.querySelector('[data-field="sets"]').value) || 1;
        const reps = Number(row.querySelector('[data-field="reps"]').value) || 1;
        const weight = Number(row.querySelector('[data-field="weight"]').value) || 0;
        exercises.push({
          id: crypto.randomUUID(),
          name: exName,
          type: 'strength',
          sets: Math.max(1, sets),
          reps: Math.max(1, reps),
          weight: Math.max(0, weight)
        });
      }
    });

    if (exercises.length === 0) return;

    if (editingTemplateId && editingTemplateId !== 'new') {
      const template = state.workoutTemplates.find(function (t) { return t.id === editingTemplateId; });
      if (template) {
        template.name = name;
        template.caloriesBurned = calories;
        template.exercises = exercises;
      }
    } else {
      state.workoutTemplates.push({
        id: crypto.randomUUID(),
        name: name,
        caloriesBurned: calories,
        exercises: exercises
      });
    }

    saveState();
    workoutSubView = 'home';
    editingTemplateId = null;
    renderWorkouts();
  }

  function deleteTemplate() {
    if (!editingTemplateId || editingTemplateId === 'new') return;
    if (!confirm('Delete this template?')) return;
    state.workoutTemplates = state.workoutTemplates.filter(function (t) { return t.id !== editingTemplateId; });
    saveState();
    workoutSubView = 'home';
    editingTemplateId = null;
    renderWorkouts();
  }

  // ─── Log workout ────────────────────────────────────
  function logWorkout(template) {
    state.workoutLogs.push({
      id: crypto.randomUUID(),
      date: selectedDate,
      templateId: template.id,
      templateName: template.name,
      caloriesBurned: template.caloriesBurned || 0,
      exercises: template.exercises.map(function (ex) {
        if (ex.type === 'cardio') {
          return {
            name: ex.name,
            type: 'cardio',
            duration: ex.duration,
            distance: ex.distance
          };
        }
        return {
          name: ex.name,
          type: 'strength',
          sets: Array.from({ length: ex.sets }, function () {
            return { weight: ex.weight, reps: ex.reps };
          })
        };
      })
    });
    saveState();
    renderCurrentView();
  }

  // ─── Settings view ─────────────────────────────────
  function renderSettings() {
    document.getElementById('setting-cal-target').value = state.settings.dailyCalorieTarget != null ? state.settings.dailyCalorieTarget : '';
    document.getElementById('setting-goal-weight').value = state.settings.goalWeight != null ? state.settings.goalWeight : '';
    document.getElementById('setting-tdee').value = state.settings.tdee != null ? state.settings.tdee : '';
    document.getElementById('setting-norm-days').value = state.settings.normalizationDays != null ? state.settings.normalizationDays : 7;
    document.getElementById('setting-projection-days').value = state.settings.projectionDays != null ? state.settings.projectionDays : 7;
    document.getElementById('setting-workout-goal').value = state.settings.weeklyWorkoutGoal != null ? state.settings.weeklyWorkoutGoal : 3;
    document.getElementById('setting-subtract-burned').checked = state.settings.subtractBurnedFromProjection !== false;
    const status = document.getElementById('settings-status');
    status.textContent = '';
    status.classList.remove('show');
  }

  // ─── Canvas charts ─────────────────────────────────
  function prepareCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: rect.width, h: rect.height };
  }

  function getThemeColors() {
    const cs = getComputedStyle(document.documentElement);
    const get = function (name) { return cs.getPropertyValue(name).trim(); };
    return {
      accent:  get('--accent')   || '#7c8cf5',
      accent2: get('--accent2')  || '#f5a07c',
      text:    get('--text')     || '#d4d4e0',
      textDim: get('--text-dim') || '#7a7a95',
      border:  get('--border')   || '#2e2e45'
    };
  }

  function niceScale(min, max, ticks) {
    ticks = ticks || 5;
    if (min === max) {
      const pad = Math.abs(min) * 0.1 || 1;
      min -= pad;
      max += pad;
    }
    const range = niceNum(max - min, false);
    let step = niceNum(range / (ticks - 1), true);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    return { min: niceMin, max: niceMax, step: step };
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
    const prepared = prepareCanvas(canvas);
    const ctx = prepared.ctx, w = prepared.w, h = prepared.h;
    ctx.clearRect(0, 0, w, h);

    const colors = getThemeColors();
    const pad = { top: 20, right: 24, bottom: 36, left: 52 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    if (entries.length === 0) {
      drawNoData(ctx, w, h, colors, 'No weight entries yet');
      return;
    }

    const weights = entries.map(function (e) { return e.weight; });
    const projWeights = projected && projected.length ? projected.map(function (p) { return p.weight; }) : [];
    let minV = Math.min.apply(null, weights.concat(projWeights));
    let maxV = Math.max.apply(null, weights.concat(projWeights));
    if (goal != null) {
      minV = Math.min(minV, goal);
      maxV = Math.max(maxV, goal);
    }
    const scale = niceScale(minV - 1, maxV + 1, 5);

    ctx.font = '11px Inter, sans-serif';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yFor = function (v) { return pad.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH; };

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

    const allDates = entries.map(function (e) { return fromDateStr(e.date).getTime(); });
    if (projected && projected.length) {
      projected.forEach(function (p) { allDates.push(fromDateStr(p.date).getTime()); });
    }
    const first = Math.min.apply(null, allDates);
    const last  = Math.max.apply(null, allDates);
    const xRange = last - first;
    const xFor = function (ts) {
      if (xRange === 0) return pad.left + plotW / 2;
      return pad.left + ((ts - first) / xRange) * plotW;
    };

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
    labelDates.forEach(function (d) {
      const x = xFor(fromDateStr(d).getTime());
      ctx.fillText(formatDateShort(d), x, pad.top + plotH + 8);
    });

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

      ctx.fillStyle = colors.accent2;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('goal ' + goal, w - pad.right - 2, gy - 3);
    }

    ctx.save();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, colors.accent + '55');
    grad.addColorStop(1, colors.accent + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    entries.forEach(function (e, i) {
      const x = xFor(fromDateStr(e.date).getTime());
      const y2 = yFor(e.weight);
      if (i === 0) ctx.moveTo(x, y2);
      else ctx.lineTo(x, y2);
    });
    const lastX = xFor(fromDateStr(entries[entries.length - 1].date).getTime());
    const firstX = xFor(fromDateStr(entries[0].date).getTime());
    ctx.lineTo(lastX, pad.top + plotH);
    ctx.lineTo(firstX, pad.top + plotH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    entries.forEach(function (e, i) {
      const x = xFor(fromDateStr(e.date).getTime());
      const y2 = yFor(e.weight);
      if (i === 0) ctx.moveTo(x, y2);
      else ctx.lineTo(x, y2);
    });
    ctx.stroke();

    ctx.fillStyle = colors.accent;
    entries.forEach(function (e) {
      const x = xFor(fromDateStr(e.date).getTime());
      const y2 = yFor(e.weight);
      ctx.beginPath();
      ctx.arc(x, y2, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    if (projected && projected.length >= 2) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colors.accent2;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      projected.forEach(function (p, i) {
        const x = xFor(fromDateStr(p.date).getTime());
        const y2 = yFor(p.weight);
        if (i === 0) ctx.moveTo(x, y2);
        else ctx.lineTo(x, y2);
      });
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCaloriesChart(days, totals, target) {
    const canvas = document.getElementById('calories-chart');
    const prepared = prepareCanvas(canvas);
    const ctx = prepared.ctx, w = prepared.w, h = prepared.h;
    ctx.clearRect(0, 0, w, h);

    const colors = getThemeColors();
    const padChart = { top: 20, right: 24, bottom: 42, left: 52 };
    const plotW = w - padChart.left - padChart.right;
    const plotH = h - padChart.top - padChart.bottom;

    const hasData = totals.some(function (t) { return t > 0; });
    if (!hasData && !(target > 0)) {
      drawNoData(ctx, w, h, colors, 'No calorie entries yet');
      return;
    }

    let maxV = Math.max.apply(null, totals.concat([target || 0, 10]));
    const scale = niceScale(0, maxV * 1.1, 5);

    ctx.font = '11px Inter, sans-serif';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yFor = function (v) { return padChart.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH; };

    for (let v = scale.min; v <= scale.max + 0.0001; v += scale.step) {
      const y = yFor(v);
      ctx.strokeStyle = colors.border;
      ctx.beginPath();
      ctx.moveTo(padChart.left, y);
      ctx.lineTo(w - padChart.right, y);
      ctx.stroke();
      ctx.fillStyle = colors.textDim;
      ctx.fillText(v.toLocaleString(), padChart.left - 8, y);
    }

    const n = days.length;
    const slot = plotW / n;
    const barW = Math.max(4, slot * 0.68);
    const todayVal = todayStr();
    for (let i = 0; i < n; i++) {
      const x = padChart.left + i * slot + (slot - barW) / 2;
      const val = totals[i];
      const yb = yFor(val);
      const barH = Math.max(0, padChart.top + plotH - yb);
      const isOver = target > 0 && val > target;
      const isToday = days[i] === todayVal;
      ctx.fillStyle = isOver ? colors.accent2 : colors.accent;
      ctx.globalAlpha = val === 0 ? 0.2 : (isToday ? 1 : 0.8);
      const r = Math.min(3, barW / 2, barH);
      ctx.beginPath();
      ctx.moveTo(x, yb + r);
      ctx.quadraticCurveTo(x, yb, x + r, yb);
      ctx.lineTo(x + barW - r, yb);
      ctx.quadraticCurveTo(x + barW, yb, x + barW, yb + r);
      ctx.lineTo(x + barW, padChart.top + plotH);
      ctx.lineTo(x, padChart.top + plotH);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (target > 0) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = colors.accent2;
      ctx.lineWidth = 1.5;
      const ty = yFor(target);
      ctx.beginPath();
      ctx.moveTo(padChart.left, ty);
      ctx.lineTo(w - padChart.right, ty);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = colors.accent2;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('target ' + target.toLocaleString(), w - padChart.right - 2, yFor(target) - 3);
    }

    ctx.fillStyle = colors.textDim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelIndices = n >= 3 ? [0, Math.floor(n / 2), n - 1] : Array.from({ length: n }, function (_, idx) { return idx; });
    labelIndices.forEach(function (idx) {
      const x = padChart.left + idx * slot + slot / 2;
      ctx.fillText(formatDateShort(days[idx]), x, padChart.top + plotH + 10);
    });
  }

  // ─── Actions ───────────────────────────────────────
  function addCalorieEntry(name, calories, quantity) {
    const qty = quantity || 1;
    const cal = Math.round(calories);
    const existing = state.calorieEntries.find(function (e) {
      return e.date === selectedDate && e.name === name && e.calories === cal;
    });
    if (existing) {
      existing.quantity = (existing.quantity || 1) + qty;
      saveState();
      renderCurrentView();
      return;
    }
    state.calorieEntries.push({
      id: crypto.randomUUID(),
      date: selectedDate,
      name: name,
      calories: cal,
      quantity: qty
    });
    saveState();
    renderCurrentView();
  }

  function upsertWeightEntry(date, weight) {
    state.weightEntries = state.weightEntries.filter(function (e) { return e.date !== date; });
    state.weightEntries.push({ date: date, weight: weight });
    saveState();
    renderCurrentView();
  }

  function exportData() {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'health-tracker-' + todayStr() + '.json';
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
    showDataStatus._t = setTimeout(function () { el.classList.remove('show'); }, 2500);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = function () {
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
    reader.onerror = function () { showDataStatus('Failed to read file', true); };
    reader.readAsText(file);
  }

  function clearAllData() {
    state = clone(DEFAULT_STATE);
    workoutSubView = 'home';
    editingTemplateId = null;
    saveState();
    renderCurrentView();
    showDataStatus('Cleared');
  }

  // ─── Init ──────────────────────────────────────────
  function init() {
    // Tabs
    document.querySelectorAll('.cc-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { showView(tab.dataset.view); });
    });

    // Date navigation
    document.getElementById('prev-day').addEventListener('click', function () {
      const d = fromDateStr(selectedDate);
      d.setDate(d.getDate() - 1);
      selectedDate = toDateStr(d);
      renderToday();
    });

    document.getElementById('next-day').addEventListener('click', function () {
      const d = fromDateStr(selectedDate);
      d.setDate(d.getDate() + 1);
      const today = todayStr();
      if (toDateStr(d) <= today) {
        selectedDate = toDateStr(d);
        renderToday();
      }
    });

    document.getElementById('go-today').addEventListener('click', function () {
      selectedDate = todayStr();
      renderToday();
    });

    // Food form
    const foodForm = document.getElementById('food-form');
    const foodName = document.getElementById('food-name');
    const foodCal  = document.getElementById('food-calories');
    const foodQty  = document.getElementById('food-qty');
    foodForm.addEventListener('submit', function (e) {
      e.preventDefault();
      let name = foodName.value.trim();
      const cal = Number(foodCal.value);
      if (!name || !Number.isFinite(cal) || cal <= 0) return;
      const qty = Number(foodQty.value) || 1;
      addCalorieEntry(name, cal, qty);
      foodName.value = '';
      foodCal.value = '';
      foodQty.value = '';
      foodName.focus();
    });

    // Fav button
    document.getElementById('food-fav').addEventListener('click', function () {
      let name = foodName.value.trim();
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
    weightForm.addEventListener('submit', function (e) {
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
    settingsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const cal = Number(document.getElementById('setting-cal-target').value);
      const goalW = Number(document.getElementById('setting-goal-weight').value);
      let tdee = Number(document.getElementById('setting-tdee').value);
      const normDays = Number(document.getElementById('setting-norm-days').value);
      const projectionDays = Number(document.getElementById('setting-projection-days').value);
      const workoutGoal = Number(document.getElementById('setting-workout-goal').value);
      if (Number.isFinite(cal) && cal >= 0) state.settings.dailyCalorieTarget = cal;
      if (Number.isFinite(goalW) && goalW >= 0) state.settings.goalWeight = goalW;
      if (Number.isFinite(tdee) && tdee >= 0) state.settings.tdee = tdee;
      if (Number.isFinite(normDays) && normDays >= 1) state.settings.normalizationDays = normDays;
      if (Number.isFinite(projectionDays) && projectionDays >= 1) state.settings.projectionDays = projectionDays;
      if (Number.isFinite(workoutGoal) && workoutGoal >= 0) state.settings.weeklyWorkoutGoal = workoutGoal;
      state.settings.subtractBurnedFromProjection = document.getElementById('setting-subtract-burned').checked;
      saveState();
      const status = document.getElementById('settings-status');
      status.textContent = 'Saved';
      status.classList.add('show');
      setTimeout(function () { status.classList.remove('show'); }, 1500);
    });

    // Data management
    document.getElementById('export-btn').addEventListener('click', exportData);

    const importFile = document.getElementById('import-file');
    document.getElementById('import-btn').addEventListener('click', function () { importFile.click(); });
    importFile.addEventListener('change', function () {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      if (!confirm('This will overwrite all existing data. Continue?')) {
        importFile.value = '';
        return;
      }
      importData(file);
      importFile.value = '';
    });

    document.getElementById('clear-btn').addEventListener('click', function () {
      if (!confirm('Delete ALL data (calories, weight, workouts, templates, and settings)? This cannot be undone.')) return;
      clearAllData();
    });

    // Workout: new template
    document.getElementById('new-template-btn').addEventListener('click', function () {
      editingTemplateId = 'new';
      workoutSubView = 'editor';
      renderWorkouts();
    });

    // Workout: editor back
    document.getElementById('editor-back-btn').addEventListener('click', function () {
      workoutSubView = 'home';
      editingTemplateId = null;
      renderWorkouts();
    });

    // Workout: add exercise row
    document.getElementById('add-exercise-btn').addEventListener('click', function () {
      document.getElementById('template-exercises').appendChild(createExerciseRow(null));
    });

    // Workout: save template
    document.getElementById('template-form').addEventListener('submit', function (e) {
      e.preventDefault();
      saveTemplate();
    });

    // Workout: delete template
    document.getElementById('delete-template-btn').addEventListener('click', deleteTemplate);

    // Redraw charts on resize
    let resizeRaf = 0;
    window.addEventListener('resize', function () {
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
