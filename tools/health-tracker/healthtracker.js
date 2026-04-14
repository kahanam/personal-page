/*
 * Health Tracker — local-only calorie, weight, and workout tracker.
 * All data lives in localStorage. No network calls.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'healthtracker.v1';
  var LEGACY_STORAGE_KEY = 'caloriecounter.v1';

  var DEFAULT_STATE = {
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
      weeklyWorkoutGoal: 3,
      subtractBurnedFromProjection: true
    }
  };

  // ─── State ─────────────────────────────────────────
  var state = loadState();
  var currentView = 'today';
  var workoutSubView = 'home'; // 'home' | 'editor'
  var editingTemplateId = null; // null | 'new' | template id

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (raw) {
          localStorage.setItem(STORAGE_KEY, raw);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
      if (!raw) return clone(DEFAULT_STATE);
      var parsed = JSON.parse(raw);
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
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function todayStr() {
    return toDateStr(new Date());
  }

  function fromDateStr(str) {
    var parts = str.split('-').map(Number);
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

  function getWeekStart() {
    var d = new Date();
    var day = d.getDay();
    var diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return toDateStr(d);
  }

  function getWeekEnd() {
    var start = fromDateStr(getWeekStart());
    start.setDate(start.getDate() + 6);
    return toDateStr(start);
  }

  // ─── View routing ──────────────────────────────────
  function showView(name) {
    currentView = name;
    document.querySelectorAll('.cc-tab').forEach(function (tab) {
      var active = tab.dataset.view === name;
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
    var container = document.getElementById('frequent-foods');
    var list = document.getElementById('frequent-list');
    list.replaceChildren();

    if (state.frequentFoods.length === 0) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    for (var i = 0; i < state.frequentFoods.length; i++) {
      (function (food) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cc-frequent-chip';
        chip.title = 'Add ' + food.name + ' (' + food.calories + ' kcal)';

        var nameSpan = document.createElement('span');
        nameSpan.className = 'cc-frequent-chip-name';
        nameSpan.textContent = food.name;

        var calSpan = document.createElement('span');
        calSpan.className = 'cc-frequent-chip-cal';
        calSpan.textContent = food.calories;

        var delBtn = document.createElement('span');
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
    var today = todayStr();
    var entries = getEntriesForDate(today);
    var total = getTotalForDate(today);
    var burned = getBurnedForDate(today);
    var target = Number(state.settings.dailyCalorieTarget) || 0;
    var net = total - burned;
    var remaining = target - net;

    document.getElementById('today-date').textContent = formatDateLong(today);
    document.getElementById('today-total').textContent = total.toLocaleString();
    document.getElementById('today-target').textContent = target.toLocaleString();

    var burnedRow = document.getElementById('today-burned-row');
    var burnedEl = document.getElementById('today-burned');
    if (burned > 0) {
      burnedRow.hidden = false;
      burnedEl.textContent = burned.toLocaleString();
      document.getElementById('today-net').textContent = net.toLocaleString();
    } else {
      burnedRow.hidden = true;
    }

    var remainingEl = document.getElementById('today-remaining');
    if (target <= 0) {
      remainingEl.textContent = '\u2014';
    } else if (remaining >= 0) {
      remainingEl.textContent = remaining.toLocaleString();
    } else {
      remainingEl.textContent = '+' + Math.abs(remaining).toLocaleString();
    }

    var progressEl = document.getElementById('today-progress');
    var pct = target > 0 ? Math.min(100, (net / target) * 100) : 0;
    progressEl.setAttribute('width', String(pct));
    progressEl.classList.toggle('over', target > 0 && net > target);

    renderFrequentFoods();

    var list = document.getElementById('today-list');
    list.replaceChildren();
    if (entries.length === 0) {
      var li = document.createElement('li');
      li.className = 'cc-empty';
      li.textContent = 'No entries yet. Add your first meal above.';
      list.appendChild(li);
      return;
    }
    entries.forEach(function (entry) {
      var qty = entry.quantity || 1;
      var li = document.createElement('li');
      li.className = 'cc-entry';

      var nameEl = document.createElement('span');
      nameEl.className = 'cc-entry-name';
      nameEl.textContent = entry.name;
      if (qty > 1) {
        var qtyBadge = document.createElement('span');
        qtyBadge.className = 'cc-entry-qty';
        qtyBadge.textContent = '\u00d7' + qty;
        nameEl.appendChild(qtyBadge);
      }

      var calEl = document.createElement('span');
      calEl.className = 'cc-entry-cal';
      calEl.textContent = (entry.calories * qty).toLocaleString() + ' kcal';

      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'cc-entry-add';
      addBtn.setAttribute('aria-label', 'Add another ' + entry.name);
      addBtn.textContent = '+';
      addBtn.addEventListener('click', function () {
        entry.quantity = qty + 1;
        saveState();
        renderToday();
      });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'cc-entry-delete';
      delBtn.setAttribute('aria-label', 'Delete ' + entry.name);
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', function () {
        state.calorieEntries = state.calorieEntries.filter(function (e) { return e.id !== entry.id; });
        saveState();
        renderToday();
      });

      li.append(nameEl, calEl, addBtn, delBtn);
      list.appendChild(li);
    });
  }

  // ─── Weight view ───────────────────────────────────
  var CAL_PER_LB = 3500;

  function calcExpectedWeight() {
    var tdee = Number(state.settings.tdee);
    if (!Number.isFinite(tdee) || tdee <= 0) return null;
    var normDays = Number(state.settings.normalizationDays) || 7;

    var sorted = state.weightEntries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    if (sorted.length === 0) return null;

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
      var burned = state.settings.subtractBurnedFromProjection !== false ? getBurnedForDate(dateStr) : 0;
      var eaten = entries.length > 0 ? getTotalForDate(dateStr) - burned : tdee;
      cumulative += eaten - tdee;
      d.setDate(d.getDate() + 1);
    }

    return {
      expected: anchor.weight + cumulative / CAL_PER_LB,
      fromDate: anchor.date,
      fromWeight: anchor.weight
    };
  }

  function buildProjectedWeightSeries() {
    var tdee = Number(state.settings.tdee);
    if (!Number.isFinite(tdee) || tdee <= 0) return [];
    var normDays = Number(state.settings.normalizationDays) || 7;

    var sorted = state.weightEntries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
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
        var burned = state.settings.subtractBurnedFromProjection !== false ? getBurnedForDate(ds) : 0;
        var eaten = entries.length > 0 ? getTotalForDate(ds) - burned : tdee;
        currentWeight += (eaten - tdee) / CAL_PER_LB;
      }
      points.push({ date: ds, weight: currentWeight });
      d.setDate(d.getDate() + 1);
    }
    return points;
  }

  function renderWeight() {
    var sorted = state.weightEntries.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
    var current = sorted[sorted.length - 1];
    var goal = Number(state.settings.goalWeight);
    var hasGoal = Number.isFinite(goal) && goal > 0;

    var currentEl = document.getElementById('current-weight');
    var goalEl = document.getElementById('goal-weight-display');
    var toGoalEl = document.getElementById('weight-to-goal');

    currentEl.textContent = current ? current.weight.toFixed(1) : '\u2014';
    var currentDateEl = document.getElementById('current-weight-date');
    currentDateEl.textContent = current ? formatDateShort(current.date) : '';
    goalEl.textContent = hasGoal ? goal.toFixed(1) + ' lbs' : '\u2014';

    if (current && hasGoal) {
      var diff = current.weight - goal;
      var abs = Math.abs(diff).toFixed(1);
      if (diff > 0.05)       toGoalEl.textContent = abs + ' lbs to lose';
      else if (diff < -0.05) toGoalEl.textContent = abs + ' lbs to gain';
      else                   toGoalEl.textContent = 'at goal';
    } else {
      toGoalEl.textContent = '';
    }

    var expectedEl = document.getElementById('expected-weight');
    var expectedSubEl = document.getElementById('expected-weight-sub');
    var expectedInfo = calcExpectedWeight();
    if (expectedInfo) {
      expectedEl.textContent = expectedInfo.expected.toFixed(1);
      var delta = expectedInfo.expected - expectedInfo.fromWeight;
      var sign = delta >= 0 ? '+' : '';
      expectedSubEl.textContent = sign + delta.toFixed(1) + ' lbs from ' + expectedInfo.fromWeight.toFixed(1) + ' on ' + formatDateShort(expectedInfo.fromDate);
    } else {
      expectedEl.textContent = '\u2014';
      expectedSubEl.textContent = '';
    }

    var dateInput = document.getElementById('weight-date');
    if (!dateInput.value) dateInput.value = todayStr();

    var projected = buildProjectedWeightSeries();
    drawWeightChart(sorted, hasGoal ? goal : null, projected);
  }

  // ─── History view ──────────────────────────────────
  function renderHistory() {
    var days = [];
    var totals = [];
    var today = new Date();
    for (var i = 13; i >= 0; i--) {
      var d = new Date(today);
      d.setDate(d.getDate() - i);
      var str = toDateStr(d);
      days.push(str);
      totals.push(Math.max(0, getTotalForDate(str) - getBurnedForDate(str)));
    }
    drawCaloriesChart(days, totals, Number(state.settings.dailyCalorieTarget) || 0);

    var dateSet = new Set(state.calorieEntries.map(function (e) { return e.date; }));
    var dates = Array.from(dateSet).sort(function (a, b) { return b.localeCompare(a); });

    var list = document.getElementById('history-list');
    list.replaceChildren();
    if (dates.length === 0) {
      var li = document.createElement('li');
      li.className = 'cc-empty';
      li.textContent = 'No history yet.';
      list.appendChild(li);
      return;
    }
    var target = Number(state.settings.dailyCalorieTarget) || 0;
    dates.forEach(function (d) {
      var total = getTotalForDate(d);
      var burned = getBurnedForDate(d);
      var net = total - burned;
      var li = document.createElement('li');
      li.className = 'cc-history-entry';

      var dateEl = document.createElement('span');
      dateEl.className = 'cc-history-date';
      dateEl.textContent = formatDateMedium(d);

      var calEl = document.createElement('span');
      calEl.className = 'cc-history-cal';
      if (target > 0 && net > target) calEl.classList.add('over');
      calEl.textContent = net.toLocaleString() + ' kcal';

      if (burned > 0) {
        var burnedEl = document.createElement('span');
        burnedEl.className = 'cc-history-burned';
        burnedEl.textContent = '-' + burned.toLocaleString();
        li.append(dateEl, calEl, burnedEl);
      } else {
        li.append(dateEl, calEl);
      }
      list.appendChild(li);
    });
  }

  // ─── Workouts view ─────────────────────────────────
  function renderWorkouts() {
    var home = document.getElementById('workout-home');
    var editor = document.getElementById('workout-editor');

    home.hidden = workoutSubView !== 'home';
    editor.hidden = workoutSubView !== 'editor';

    switch (workoutSubView) {
      case 'home':   renderWorkoutHome();   break;
      case 'editor': renderWorkoutEditor(); break;
    }
  }

  function renderWorkoutHome() {
    // Weekly summary
    var weekStart = getWeekStart();
    var weekEnd = getWeekEnd();
    var weekWorkouts = state.workoutLogs.filter(function (l) {
      return l.date >= weekStart && l.date <= weekEnd;
    });
    var goal = Number(state.settings.weeklyWorkoutGoal) || 3;

    document.getElementById('week-workout-count').textContent = weekWorkouts.length;
    document.getElementById('week-workout-goal').textContent = goal;

    var progressEl = document.getElementById('workout-progress');
    var pct = goal > 0 ? Math.min(100, (weekWorkouts.length / goal) * 100) : 0;
    progressEl.setAttribute('width', String(pct));
    progressEl.classList.toggle('complete', weekWorkouts.length >= goal && goal > 0);

    // Template list
    var templateList = document.getElementById('workout-template-list');
    templateList.replaceChildren();

    if (state.workoutTemplates.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cc-empty';
      empty.textContent = 'No templates yet. Create one to get started.';
      templateList.appendChild(empty);
    } else {
      var grid = document.createElement('div');
      grid.className = 'cc-template-grid';

      state.workoutTemplates.forEach(function (template) {
        var card = document.createElement('div');
        card.className = 'cc-template-card';

        var info = document.createElement('div');
        info.className = 'cc-template-card-info';

        var name = document.createElement('div');
        name.className = 'cc-template-card-name';
        name.textContent = template.name;

        var desc = document.createElement('div');
        desc.className = 'cc-template-card-desc';
        var descText = template.exercises.map(function (e) { return e.name; }).join(' \u00b7 ');
        if (template.caloriesBurned) descText += ' \u00b7 -' + template.caloriesBurned + ' kcal';
        desc.textContent = descText;

        info.append(name, desc);

        var actions = document.createElement('div');
        actions.className = 'cc-template-card-actions';

        var logBtn = document.createElement('button');
        logBtn.type = 'button';
        logBtn.className = 'cc-btn cc-btn-primary cc-btn-sm';
        logBtn.textContent = 'Log';
        logBtn.addEventListener('click', function () { logWorkout(template); });

        var editBtn = document.createElement('button');
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
    var historyList = document.getElementById('workout-history-list');
    historyList.replaceChildren();

    var sortedLogs = state.workoutLogs.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });

    if (sortedLogs.length === 0) {
      var emptyLi = document.createElement('li');
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
    var li = document.createElement('li');
    li.className = 'cc-workout-log-entry';

    var header = document.createElement('div');
    header.className = 'cc-workout-log-header';

    var dateEl = document.createElement('span');
    dateEl.className = 'cc-workout-log-date';
    dateEl.textContent = formatDateMedium(log.date);

    var nameEl = document.createElement('span');
    nameEl.className = 'cc-workout-log-name';
    nameEl.textContent = log.templateName;

    var totalSets = log.exercises.reduce(function (sum, ex) { return sum + ex.sets.length; }, 0);
    var summaryEl = document.createElement('span');
    summaryEl.className = 'cc-workout-log-summary';
    var summaryText = log.exercises.length + ' ex \u00b7 ' + totalSets + ' sets';
    if (log.caloriesBurned) summaryText += ' \u00b7 -' + log.caloriesBurned + ' kcal';
    summaryEl.textContent = summaryText;

    var toggleEl = document.createElement('span');
    toggleEl.className = 'cc-workout-log-toggle';
    toggleEl.textContent = '\u25b6';

    header.append(dateEl, nameEl, summaryEl, toggleEl);

    var detail = document.createElement('div');
    detail.className = 'cc-workout-log-detail';
    detail.hidden = true;

    log.exercises.forEach(function (exercise) {
      var exDiv = document.createElement('div');
      exDiv.className = 'cc-workout-log-exercise';

      var exName = document.createElement('div');
      exName.className = 'cc-workout-log-exercise-name';
      exName.textContent = exercise.name;

      exDiv.appendChild(exName);

      exercise.sets.forEach(function (set, si) {
        var setEl = document.createElement('div');
        setEl.className = 'cc-workout-log-set';
        setEl.textContent = 'Set ' + (si + 1) + ': ' + set.weight + ' lbs \u00d7 ' + set.reps + ' reps';
        exDiv.appendChild(setEl);
      });

      detail.appendChild(exDiv);
    });

    // Delete button inside detail
    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'cc-workout-log-actions';
    var delBtn = document.createElement('button');
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
    var container = document.getElementById('exercise-progress-list');
    container.replaceChildren();

    var sortedLogs = state.workoutLogs.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });

    // Group by exercise name, preserving first-appearance order
    var exerciseNames = [];
    var exerciseHistory = {};

    sortedLogs.forEach(function (log) {
      log.exercises.forEach(function (ex) {
        if (!exerciseHistory[ex.name]) {
          exerciseHistory[ex.name] = [];
          exerciseNames.push(ex.name);
        }
        var maxWeight = 0;
        ex.sets.forEach(function (s) { if (s.weight > maxWeight) maxWeight = s.weight; });
        exerciseHistory[ex.name].push({
          date: log.date,
          weight: maxWeight,
          sets: ex.sets.length,
          reps: ex.sets[0] ? ex.sets[0].reps : 0
        });
      });
    });

    if (exerciseNames.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cc-empty';
      empty.textContent = 'Log workouts to track progress.';
      container.appendChild(empty);
      return;
    }

    var list = document.createElement('ul');
    list.className = 'cc-history-list';

    exerciseNames.forEach(function (name) {
      var history = exerciseHistory[name];
      var first = history[0];
      var last = history[history.length - 1];
      var delta = last.weight - first.weight;

      var li = document.createElement('li');
      li.className = 'cc-workout-log-entry';

      var header = document.createElement('div');
      header.className = 'cc-workout-log-header';

      var nameEl = document.createElement('span');
      nameEl.className = 'cc-workout-log-name';
      nameEl.textContent = name;

      var progressEl = document.createElement('span');
      progressEl.className = 'cc-progress-summary';
      if (history.length === 1) {
        progressEl.textContent = last.weight + ' lbs';
      } else {
        progressEl.textContent = first.weight + ' \u2192 ' + last.weight + ' lbs';
      }

      var deltaEl = document.createElement('span');
      if (history.length > 1) {
        var deltaStr = delta > 0 ? '+' + delta : String(delta);
        deltaEl.className = 'cc-progress-delta';
        deltaEl.classList.add(delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral');
        deltaEl.textContent = deltaStr;
      }

      var toggleEl = document.createElement('span');
      toggleEl.className = 'cc-workout-log-toggle';
      toggleEl.textContent = '\u25b6';

      header.append(nameEl, progressEl, deltaEl, toggleEl);

      var detail = document.createElement('div');
      detail.className = 'cc-workout-log-detail';
      detail.hidden = true;

      history.slice().reverse().forEach(function (entry) {
        var row = document.createElement('div');
        row.className = 'cc-progress-row';

        var dateEl = document.createElement('span');
        dateEl.className = 'cc-progress-date';
        dateEl.textContent = formatDateMedium(entry.date);

        var weightEl = document.createElement('span');
        weightEl.className = 'cc-progress-weight';
        weightEl.textContent = entry.weight + ' lbs';

        var detailEl = document.createElement('span');
        detailEl.className = 'cc-progress-detail';
        detailEl.textContent = entry.sets + '\u00d7' + entry.reps;

        row.append(dateEl, weightEl, detailEl);
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
    var template = editingTemplateId && editingTemplateId !== 'new'
      ? state.workoutTemplates.find(function (t) { return t.id === editingTemplateId; })
      : null;

    document.getElementById('editor-title').textContent = template ? 'Edit Template' : 'New Template';
    document.getElementById('template-name').value = template ? template.name : '';
    document.getElementById('template-calories').value = template && template.caloriesBurned ? template.caloriesBurned : '';
    document.getElementById('delete-template-btn').hidden = !template;

    var container = document.getElementById('template-exercises');
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
    var row = document.createElement('div');
    row.className = 'cc-exercise-row';

    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cc-input cc-input-grow';
    nameInput.placeholder = 'Exercise name';
    nameInput.value = exercise ? exercise.name : '';
    nameInput.dataset.field = 'name';

    var setsInput = document.createElement('input');
    setsInput.type = 'number';
    setsInput.className = 'cc-input cc-input-sm';
    setsInput.placeholder = 'Sets';
    setsInput.value = exercise ? exercise.sets : 3;
    setsInput.min = '1';
    setsInput.max = '20';
    setsInput.inputMode = 'numeric';
    setsInput.dataset.field = 'sets';

    var repsInput = document.createElement('input');
    repsInput.type = 'number';
    repsInput.className = 'cc-input cc-input-sm';
    repsInput.placeholder = 'Reps';
    repsInput.value = exercise ? exercise.reps : 5;
    repsInput.min = '1';
    repsInput.inputMode = 'numeric';
    repsInput.dataset.field = 'reps';

    var weightInput = document.createElement('input');
    weightInput.type = 'number';
    weightInput.className = 'cc-input cc-input-sm';
    weightInput.placeholder = 'lbs';
    weightInput.value = exercise && exercise.weight ? exercise.weight : '';
    weightInput.min = '0';
    weightInput.step = '2.5';
    weightInput.inputMode = 'decimal';
    weightInput.dataset.field = 'weight';

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'cc-entry-delete';
    delBtn.textContent = '\u00d7';
    delBtn.setAttribute('aria-label', 'Remove exercise');
    delBtn.addEventListener('click', function () { row.remove(); });

    row.append(nameInput, setsInput, repsInput, weightInput, delBtn);
    return row;
  }

  function saveTemplate() {
    var name = document.getElementById('template-name').value.trim();
    if (!name) return;
    var calories = Number(document.getElementById('template-calories').value) || 0;

    var rows = document.querySelectorAll('#template-exercises .cc-exercise-row');
    var exercises = [];
    rows.forEach(function (row) {
      var exName = row.querySelector('[data-field="name"]').value.trim();
      var sets = Number(row.querySelector('[data-field="sets"]').value) || 3;
      var reps = Number(row.querySelector('[data-field="reps"]').value) || 5;
      var weight = Number(row.querySelector('[data-field="weight"]').value) || 0;
      if (exName) {
        exercises.push({
          id: crypto.randomUUID(),
          name: exName,
          sets: Math.max(1, sets),
          reps: Math.max(1, reps),
          weight: Math.max(0, weight)
        });
      }
    });

    if (exercises.length === 0) return;

    if (editingTemplateId && editingTemplateId !== 'new') {
      var template = state.workoutTemplates.find(function (t) { return t.id === editingTemplateId; });
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
      date: todayStr(),
      templateId: template.id,
      templateName: template.name,
      caloriesBurned: template.caloriesBurned || 0,
      exercises: template.exercises.map(function (ex) {
        return {
          name: ex.name,
          sets: Array.from({ length: ex.sets }, function () {
            return { weight: ex.weight, reps: ex.reps };
          })
        };
      })
    });
    saveState();
    renderWorkoutHome();
  }

  // ─── Settings view ─────────────────────────────────
  function renderSettings() {
    document.getElementById('setting-cal-target').value = state.settings.dailyCalorieTarget != null ? state.settings.dailyCalorieTarget : '';
    document.getElementById('setting-goal-weight').value = state.settings.goalWeight != null ? state.settings.goalWeight : '';
    document.getElementById('setting-tdee').value = state.settings.tdee != null ? state.settings.tdee : '';
    document.getElementById('setting-norm-days').value = state.settings.normalizationDays != null ? state.settings.normalizationDays : 7;
    document.getElementById('setting-workout-goal').value = state.settings.weeklyWorkoutGoal != null ? state.settings.weeklyWorkoutGoal : 3;
    document.getElementById('setting-subtract-burned').checked = state.settings.subtractBurnedFromProjection !== false;
    var status = document.getElementById('settings-status');
    status.textContent = '';
    status.classList.remove('show');
  }

  // ─── Canvas charts ─────────────────────────────────
  function prepareCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: rect.width, h: rect.height };
  }

  function getThemeColors() {
    var cs = getComputedStyle(document.documentElement);
    var get = function (name) { return cs.getPropertyValue(name).trim(); };
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
      var pad = Math.abs(min) * 0.1 || 1;
      min -= pad;
      max += pad;
    }
    var range = niceNum(max - min, false);
    var step = niceNum(range / (ticks - 1), true);
    var niceMin = Math.floor(min / step) * step;
    var niceMax = Math.ceil(max / step) * step;
    return { min: niceMin, max: niceMax, step: step };
  }

  function niceNum(range, round) {
    var exp = Math.floor(Math.log10(Math.max(range, 1e-9)));
    var frac = range / Math.pow(10, exp);
    var nice;
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
    var canvas = document.getElementById('weight-chart');
    var prepared = prepareCanvas(canvas);
    var ctx = prepared.ctx, w = prepared.w, h = prepared.h;
    ctx.clearRect(0, 0, w, h);

    var colors = getThemeColors();
    var pad = { top: 20, right: 24, bottom: 36, left: 52 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    if (entries.length === 0) {
      drawNoData(ctx, w, h, colors, 'No weight entries yet');
      return;
    }

    var weights = entries.map(function (e) { return e.weight; });
    var projWeights = projected && projected.length ? projected.map(function (p) { return p.weight; }) : [];
    var minV = Math.min.apply(null, weights.concat(projWeights));
    var maxV = Math.max.apply(null, weights.concat(projWeights));
    if (goal != null) {
      minV = Math.min(minV, goal);
      maxV = Math.max(maxV, goal);
    }
    var scale = niceScale(minV - 1, maxV + 1, 5);

    ctx.font = '11px Inter, sans-serif';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    var yFor = function (v) { return pad.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH; };

    for (var v = scale.min; v <= scale.max + 0.0001; v += scale.step) {
      var y = yFor(v);
      ctx.strokeStyle = colors.border;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = colors.textDim;
      ctx.fillText(v.toFixed(0), pad.left - 8, y);
    }

    var allDates = entries.map(function (e) { return fromDateStr(e.date).getTime(); });
    if (projected && projected.length) {
      projected.forEach(function (p) { allDates.push(fromDateStr(p.date).getTime()); });
    }
    var first = Math.min.apply(null, allDates);
    var last  = Math.max.apply(null, allDates);
    var xRange = last - first;
    var xFor = function (ts) {
      if (xRange === 0) return pad.left + plotW / 2;
      return pad.left + ((ts - first) / xRange) * plotW;
    };

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = colors.textDim;
    var labelDates = [];
    if (entries.length === 1) {
      labelDates.push(entries[0].date);
    } else {
      labelDates.push(entries[0].date);
      if (entries.length >= 3) labelDates.push(entries[Math.floor(entries.length / 2)].date);
      labelDates.push(entries[entries.length - 1].date);
    }
    labelDates.forEach(function (d) {
      var x = xFor(fromDateStr(d).getTime());
      ctx.fillText(formatDateShort(d), x, pad.top + plotH + 8);
    });

    if (goal != null) {
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = colors.accent2;
      ctx.lineWidth = 1.5;
      var gy = yFor(goal);
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
    var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, colors.accent + '55');
    grad.addColorStop(1, colors.accent + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    entries.forEach(function (e, i) {
      var x = xFor(fromDateStr(e.date).getTime());
      var y2 = yFor(e.weight);
      if (i === 0) ctx.moveTo(x, y2);
      else ctx.lineTo(x, y2);
    });
    var lastX = xFor(fromDateStr(entries[entries.length - 1].date).getTime());
    var firstX = xFor(fromDateStr(entries[0].date).getTime());
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
      var x = xFor(fromDateStr(e.date).getTime());
      var y2 = yFor(e.weight);
      if (i === 0) ctx.moveTo(x, y2);
      else ctx.lineTo(x, y2);
    });
    ctx.stroke();

    ctx.fillStyle = colors.accent;
    entries.forEach(function (e) {
      var x = xFor(fromDateStr(e.date).getTime());
      var y2 = yFor(e.weight);
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
        var x = xFor(fromDateStr(p.date).getTime());
        var y2 = yFor(p.weight);
        if (i === 0) ctx.moveTo(x, y2);
        else ctx.lineTo(x, y2);
      });
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawCaloriesChart(days, totals, target) {
    var canvas = document.getElementById('calories-chart');
    var prepared = prepareCanvas(canvas);
    var ctx = prepared.ctx, w = prepared.w, h = prepared.h;
    ctx.clearRect(0, 0, w, h);

    var colors = getThemeColors();
    var padChart = { top: 20, right: 24, bottom: 42, left: 52 };
    var plotW = w - padChart.left - padChart.right;
    var plotH = h - padChart.top - padChart.bottom;

    var hasData = totals.some(function (t) { return t > 0; });
    if (!hasData && !(target > 0)) {
      drawNoData(ctx, w, h, colors, 'No calorie entries yet');
      return;
    }

    var maxV = Math.max.apply(null, totals.concat([target || 0, 10]));
    var scale = niceScale(0, maxV * 1.1, 5);

    ctx.font = '11px Inter, sans-serif';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    var yFor = function (v) { return padChart.top + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH; };

    for (var v = scale.min; v <= scale.max + 0.0001; v += scale.step) {
      var y = yFor(v);
      ctx.strokeStyle = colors.border;
      ctx.beginPath();
      ctx.moveTo(padChart.left, y);
      ctx.lineTo(w - padChart.right, y);
      ctx.stroke();
      ctx.fillStyle = colors.textDim;
      ctx.fillText(v.toLocaleString(), padChart.left - 8, y);
    }

    var n = days.length;
    var slot = plotW / n;
    var barW = Math.max(4, slot * 0.68);
    var todayVal = todayStr();
    for (var i = 0; i < n; i++) {
      var x = padChart.left + i * slot + (slot - barW) / 2;
      var val = totals[i];
      var yb = yFor(val);
      var barH = Math.max(0, padChart.top + plotH - yb);
      var isOver = target > 0 && val > target;
      var isToday = days[i] === todayVal;
      ctx.fillStyle = isOver ? colors.accent2 : colors.accent;
      ctx.globalAlpha = val === 0 ? 0.2 : (isToday ? 1 : 0.8);
      var r = Math.min(3, barW / 2, barH);
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
      var ty = yFor(target);
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
    var labelIndices = n >= 3 ? [0, Math.floor(n / 2), n - 1] : Array.from({ length: n }, function (_, idx) { return idx; });
    labelIndices.forEach(function (idx) {
      var x = padChart.left + idx * slot + slot / 2;
      ctx.fillText(formatDateShort(days[idx]), x, padChart.top + plotH + 10);
    });
  }

  // ─── Actions ───────────────────────────────────────
  function addCalorieEntry(name, calories, quantity) {
    var qty = quantity || 1;
    var today = todayStr();
    var cal = Math.round(calories);
    var existing = state.calorieEntries.find(function (e) {
      return e.date === today && e.name === name && e.calories === cal;
    });
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
    state.weightEntries = state.weightEntries.filter(function (e) { return e.date !== date; });
    state.weightEntries.push({ date: date, weight: weight });
    saveState();
    renderWeight();
  }

  function exportData() {
    var json = JSON.stringify(state, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'health-tracker-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function showDataStatus(message, isError) {
    var el = document.getElementById('data-status');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('show');
    clearTimeout(showDataStatus._t);
    showDataStatus._t = setTimeout(function () { el.classList.remove('show'); }, 2500);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
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

    // Food form
    var foodForm = document.getElementById('food-form');
    var foodName = document.getElementById('food-name');
    var foodCal  = document.getElementById('food-calories');
    var foodQty  = document.getElementById('food-qty');
    foodForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = foodName.value.trim();
      var cal = Number(foodCal.value);
      if (!name || !Number.isFinite(cal) || cal <= 0) return;
      var qty = Number(foodQty.value) || 1;
      addCalorieEntry(name, cal, qty);
      foodName.value = '';
      foodCal.value = '';
      foodQty.value = '';
      foodName.focus();
    });

    // Fav button
    document.getElementById('food-fav').addEventListener('click', function () {
      var name = foodName.value.trim();
      var cal = Number(foodCal.value);
      if (!name || !Number.isFinite(cal) || cal <= 0) return;
      addFrequentFood(name, cal);
      foodName.value = '';
      foodCal.value = '';
      foodName.focus();
    });

    // Weight form
    var weightForm = document.getElementById('weight-form');
    var weightDate = document.getElementById('weight-date');
    var weightValue = document.getElementById('weight-value');
    weightDate.value = todayStr();
    weightForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var date = weightDate.value;
      var val = Number(weightValue.value);
      if (!date || !Number.isFinite(val) || val <= 0) return;
      upsertWeightEntry(date, val);
      weightValue.value = '';
      weightValue.focus();
    });

    // Settings form
    var settingsForm = document.getElementById('settings-form');
    settingsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var cal = Number(document.getElementById('setting-cal-target').value);
      var goalW = Number(document.getElementById('setting-goal-weight').value);
      var tdee = Number(document.getElementById('setting-tdee').value);
      var normDays = Number(document.getElementById('setting-norm-days').value);
      var workoutGoal = Number(document.getElementById('setting-workout-goal').value);
      if (Number.isFinite(cal) && cal >= 0) state.settings.dailyCalorieTarget = cal;
      if (Number.isFinite(goalW) && goalW >= 0) state.settings.goalWeight = goalW;
      if (Number.isFinite(tdee) && tdee >= 0) state.settings.tdee = tdee;
      if (Number.isFinite(normDays) && normDays >= 1) state.settings.normalizationDays = normDays;
      if (Number.isFinite(workoutGoal) && workoutGoal >= 0) state.settings.weeklyWorkoutGoal = workoutGoal;
      state.settings.subtractBurnedFromProjection = document.getElementById('setting-subtract-burned').checked;
      saveState();
      var status = document.getElementById('settings-status');
      status.textContent = 'Saved';
      status.classList.add('show');
      setTimeout(function () { status.classList.remove('show'); }, 1500);
    });

    // Data management
    document.getElementById('export-btn').addEventListener('click', exportData);

    var importFile = document.getElementById('import-file');
    document.getElementById('import-btn').addEventListener('click', function () { importFile.click(); });
    importFile.addEventListener('change', function () {
      var file = importFile.files && importFile.files[0];
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
    var resizeRaf = 0;
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
