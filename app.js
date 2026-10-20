
/* =========================================================
   TaskTamer
   A local-first student productivity application.

   Features:
   - Task management, categories, priorities and subtasks
   - Search, filtering, sorting and calendar
   - Time- and energy-aware daily planning
   - 10-minute mode and "I'm stuck" rescue mode
   - Focus timer, session history and progress insights
   - Exportable plans and JSON data backups
   - Accessibility preferences
   ========================================================= */

"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const STORAGE_KEY = "tasktamer.data.v1";
const SETTINGS_KEY = "tasktamer.settings.v1";
const CATEGORIES_KEY = "tasktamer.categories.v1";

const DEFAULT_CATEGORIES = ["Study", "Personal", "Work", "Health", "Projects", "Other"];
const PRIORITY_SCORE = { urgent: 4, high: 3, medium: 2, low: 1 };
const ENERGY_SCORE = { low: 1, medium: 2, high: 3 };

const QUOTES = [
  "You don't have to do everything. Just the next thing.",
  "Small steps still move you forward.",
  "Progress doesn't need to be perfect to count.",
  "Give your attention to what you can do now.",
  "A little progress goes a long way.",
  "Make room for the work that matters.",
  "Your pace is allowed to be your own."
];

const pad = number => String(number).padStart(2, "0");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const makeId = () => (
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);
const minutesLabel = minutes => {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
};
const dateObject = value => {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(result.getTime()) ? null : result;
};
const formatDate = (value, options = { month: "short", day: "numeric" }) => {
  const date = dateObject(value);
  return date ? new Intl.DateTimeFormat(undefined, options).format(date) : "No deadline";
};
const shiftDate = (value, days) => {
  const date = dateObject(value) || new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const dateDiff = (a, b) => {
  const da = dateObject(a);
  const db = dateObject(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
};

function safeRead(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    console.warn("TaskTamer could not read saved data.", error);
    return fallback;
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error("TaskTamer could not save data.", error);
    toast("Your browser couldn't save this change. Export a backup or free up browser storage.", "error");
    return false;
  }
}

function createSampleTasks() {
  const today = todayISO();
  return [
    {
      id: makeId(), title: "Complete Data Structures Assignment",
      description: "Finish the implementation and write a short explanation.",
      category: "Study", priority: "high", dueDate: today, minutes: 45,
      energy: "high", status: "active", createdAt: Date.now() - 50000,
      subtasks: [
        { id: makeId(), title: "Review the assignment brief", done: false },
        { id: makeId(), title: "Outline the implementation", done: false },
        { id: makeId(), title: "Complete the first section", done: false },
        { id: makeId(), title: "Test and review the solution", done: false }
      ],
      completedAt: null
    },
    {
      id: makeId(), title: "Read Chapter 4 — Physics",
      description: "Review the main concepts and write down questions.",
      category: "Study", priority: "medium", dueDate: shiftDate(today, 1),
      minutes: 35, energy: "medium", status: "active",
      createdAt: Date.now() - 40000, subtasks: [], completedAt: null
    },
    {
      id: makeId(), title: "Gym workout",
      description: "A manageable session to move and recharge.",
      category: "Health", priority: "low", dueDate: today, minutes: 45,
      energy: "medium", status: "active", createdAt: Date.now() - 30000,
      subtasks: [], completedAt: null
    },
    {
      id: makeId(), title: "Update resume",
      description: "Review the latest projects and update relevant experience.",
      category: "Personal", priority: "medium", dueDate: shiftDate(today, 2),
      minutes: 25, energy: "medium", status: "active",
      createdAt: Date.now() - 20000, subtasks: [], completedAt: null
    },
    {
      id: makeId(), title: "Team meeting preparation",
      description: "Gather notes and identify the questions to discuss.",
      category: "Work", priority: "high", dueDate: shiftDate(today, 2),
      minutes: 20, energy: "low", status: "active",
      createdAt: Date.now() - 10000, subtasks: [], completedAt: null
    },
    {
      id: makeId(), title: "Submit lab report",
      description: "Check calculations, references and formatting.",
      category: "Study", priority: "urgent", dueDate: shiftDate(today, 3),
      minutes: 60, energy: "high", status: "active",
      createdAt: Date.now(), subtasks: [], completedAt: null
    }
  ];
}

function normalizeTask(task) {
  return {
    id: String(task.id || makeId()),
    title: String(task.title || "Untitled task").slice(0, 180),
    description: String(task.description || "").slice(0, 1000),
    category: String(task.category || "Other").slice(0, 32),
    priority: PRIORITY_SCORE[task.priority] ? task.priority : "medium",
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || "") ? task.dueDate : "",
    minutes: clamp(Number(task.minutes) || 30, 5, 1440),
    energy: ENERGY_SCORE[task.energy] ? task.energy : "medium",
    status: task.status === "completed" ? "completed" : "active",
    createdAt: Number(task.createdAt) || Date.now(),
    completedAt: Number(task.completedAt) || null,
    subtasks: Array.isArray(task.subtasks)
      ? task.subtasks.slice(0, 100).map(step => ({
          id: String(step.id || makeId()),
          title: String(step.title || "").slice(0, 180),
          done: Boolean(step.done)
        }))
      : []
  };
}

const storedTasks = safeRead(STORAGE_KEY, null);
let tasks = Array.isArray(storedTasks) ? storedTasks.map(normalizeTask) : createSampleTasks();

let settings = {
  name: "Alex Morgan",
  dayStart: "09:00",
  weekStart: 1,
  reduceMotion: false,
  highContrast: false,
  largeText: false,
  soundAlerts: false,
  confirmDelete: true,
  ...safeRead(SETTINGS_KEY, {})
};

let categories = [...new Set([
  ...DEFAULT_CATEGORIES,
  ...(Array.isArray(safeRead(CATEGORIES_KEY, []))
    ? safeRead(CATEGORIES_KEY, [])
    : [])
])];

let state = {
  view: "home",
  taskFilter: "all",
  categoryFilter: "all",
  sort: "smart",
  search: "",
  recommendationId: null,
  selectedTaskId: null,
  rescueTaskId: null,
  rescueKind: "stuck",
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calendarSelected: todayISO(),
  plan: null,
  timer: {
    duration: 25 * 60,
    remaining: 25 * 60,
    running: false,
    endAt: null,
    mode: "focus",
    interval: null
  },
  focusSessions: safeRead("tasktamer.sessions.v1", []),
  focusNotes: safeRead("tasktamer.focusnotes.v1", { goal: "", distraction: "" }),
  planChecks: safeRead("tasktamer.planchecks.v1", {}),
  plannerPrefs: safeRead("tasktamer.plannerprefs.v1", {
    minutes: 120, energy: "medium", priority: "balanced",
    date: todayISO(), includeFlexible: true, includeBreaks: true
  })
};

if (!Array.isArray(state.focusSessions)) state.focusSessions = [];
if (!state.planChecks || typeof state.planChecks !== "object") state.planChecks = {};

function persist() {
  safeWrite(STORAGE_KEY, tasks);
  safeWrite(SETTINGS_KEY, settings);
  safeWrite(CATEGORIES_KEY, categories);
}

function persistSessions() {
  safeWrite("tasktamer.sessions.v1", state.focusSessions);
}

function persistPlanner() {
  safeWrite("tasktamer.planchecks.v1", state.planChecks);
  safeWrite("tasktamer.plannerprefs.v1", state.plannerPrefs);
}

function toast(message, type = "success") {
  const region = $("#toastRegion");
  if (!region) return;

  const item = document.createElement("div");
  item.className = `toast${type === "error" ? " error" : ""}`;
  item.textContent = message;
  region.append(item);

  window.setTimeout(() => item.remove(), 3600);
}

function celebrate(message) {
  const element = $("#celebration");
  element.textContent = message;
  window.setTimeout(() => {
    if (element.textContent === message) element.textContent = "";
  }, 2400);
}

function showDialog(dialog) {
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function getTask(id) {
  return tasks.find(task => task.id === id) || null;
}

function activeTasks() {
  return tasks.filter(task => task.status === "active");
}

function completedTasks() {
  return tasks.filter(task => task.status === "completed");
}

function isOverdue(task) {
  return task.status === "active" && task.dueDate && task.dueDate < todayISO();
}

function isDueToday(task) {
  return task.status === "active" && task.dueDate === todayISO();
}

function dueDescription(task) {
  if (!task.dueDate) return "No deadline";
  const difference = dateDiff(todayISO(), task.dueDate);
  if (difference < 0) return `${Math.abs(difference)}d overdue`;
  if (difference === 0) return "Due today";
  if (difference === 1) return "Due tomorrow";
  return formatDate(task.dueDate);
}

function dueClass(task) {
  if (isOverdue(task)) return "overdue";
  if (isDueToday(task)) return "today";
  if (dateDiff(todayISO(), task.dueDate) === 1) return "tomorrow";
  return "";
}

function sortTasks(list, mode = state.sort) {
  const result = [...list];

  const deadline = task => task.dueDate || "9999-12-31";
  const smartScore = task =>
    (PRIORITY_SCORE[task.priority] || 1) * 10 +
    (task.dueDate ? Math.max(-20, 10 - (dateDiff(todayISO(), task.dueDate) ?? 20)) : 0) +
    (task.status === "active" ? 5 : 0);

  result.sort((a, b) => {
    if (mode === "due") return deadline(a).localeCompare(deadline(b));
    if (mode === "priority") return (PRIORITY_SCORE[b.priority] || 0) - (PRIORITY_SCORE[a.priority] || 0);
    if (mode === "duration") return a.minutes - b.minutes;
    if (mode === "created") return b.createdAt - a.createdAt;
    return smartScore(b) - smartScore(a) || deadline(a).localeCompare(deadline(b)) || b.createdAt - a.createdAt;
  });

  return result;
}

function searchMatches(task, query) {
  if (!query) return true;
  const text = [
    task.title, task.description, task.category, task.priority,
    task.energy, task.dueDate, ...task.subtasks.map(step => step.title)
  ].join(" ").toLowerCase();
  return text.includes(query.toLowerCase());
}

function filteredTasks() {
  let result = [...tasks];

  if (state.search) {
    result = result.filter(task => searchMatches(task, state.search));
  }

  if (state.categoryFilter !== "all") {
    result = result.filter(task => task.category === state.categoryFilter);
  }

  switch (state.taskFilter) {
    case "active":
      result = result.filter(task => task.status === "active");
      break;
    case "today":
      result = result.filter(isDueToday);
      break;
    case "upcoming":
      result = result.filter(task => task.status === "active" && task.dueDate > todayISO());
      break;
    case "completed":
      result = result.filter(task => task.status === "completed");
      break;
  }

  return sortTasks(result);
}

/* ------------------------ Navigation ------------------------ */

function navigate(view) {
  const target = $(`#view-${view}`);
  if (!target) return;

  state.view = view;

  $$(".view").forEach(section => {
    section.classList.toggle("active-view", section === target);
  });

  $$(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  const titles = {
    home: "Overview", tasks: "My tasks", planner: "Smart planner",
    calendar: "Calendar", focus: "Focus studio",
    progress: "Insights", settings: "Settings"
  };

  $("#breadcrumbTitle").textContent = titles[view] || view;
  closeSidebar();
  window.scrollTo({ top: 0, behavior: settings.reduceMotion ? "auto" : "smooth" });

  if (view === "calendar") renderCalendar();
  if (view === "planner") syncPlannerControls();
  if (view === "focus") renderFocusStats();
  if (view === "progress") renderInsights();
  if (view === "settings") syncSettingsControls();
}

function openSidebar() {
  $("#sidebar").classList.add("sidebar-open");
  $("#mobileOverlay").classList.add("visible");
}

function closeSidebar() {
  $("#sidebar").classList.remove("sidebar-open");
  $("#mobileOverlay").classList.remove("visible");
}

/* ------------------------- Task form ------------------------- */

function openTaskForm(task = null) {
  $("#taskForm").reset();
  $("#editTaskId").value = task?.id || "";
  $("#taskDialogTitle").textContent = task ? "Edit your task" : "Add a new task";
  $("#saveTaskButton").textContent = task ? "Save changes" : "Save task";

  $("#taskTitle").value = task?.title || "";
  $("#taskDescription").value = task?.description || "";
  $("#taskPriority").value = task?.priority || "medium";
  $("#taskDue").value = task?.dueDate || "";
  $("#taskTime").value = task?.minutes || 30;
  $("#taskEnergy").value = task?.energy || "medium";
  $("#taskStatus").value = task?.status || "active";
  $("#taskSubtasks").value = task?.subtasks?.map(step => step.title).join("\n") || "";

  renderCategoryOptions($("#taskCategory"), task?.category || "Study");
  showDialog($("#taskDialog"));
  window.setTimeout(() => $("#taskTitle").focus(), 30);
}

function renderCategoryOptions(select, selected = "Study") {
  if (!select) return;

  const existing = [...categories];
  if (selected && !existing.includes(selected)) existing.push(selected);

  select.replaceChildren();

  existing.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    option.selected = category === selected;
    select.append(option);
  });
}

function saveTask(event) {
  event.preventDefault();

  const title = $("#taskTitle").value.trim();
  if (!title) {
    $("#taskTitle").focus();
    toast("Give your task a name first.", "error");
    return;
  }

  const editId = $("#editTaskId").value;
  const existing = editId ? getTask(editId) : null;
  const subtasks = $("#taskSubtasks").value
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 100);

  const task = normalizeTask({
    ...(existing || {}),
    id: existing?.id || makeId(),
    title,
    description: $("#taskDescription").value.trim(),
    category: $("#taskCategory").value || "Other",
    priority: $("#taskPriority").value,
    dueDate: $("#taskDue").value,
    minutes: Number($("#taskTime").value),
    energy: $("#taskEnergy").value,
    status: $("#taskStatus").value,
    createdAt: existing?.createdAt || Date.now(),
    completedAt: $("#taskStatus").value === "completed"
      ? (existing?.completedAt || Date.now()) : null,
    subtasks: subtasks.map((step, index) => ({
      id: existing?.subtasks?.[index]?.id || makeId(),
      title: step,
      done: existing?.subtasks?.[index]?.title === step
        ? existing.subtasks[index].done : false
    }))
  });

  if (existing) {
    tasks = tasks.map(item => item.id === existing.id ? task : item);
  } else {
    tasks.unshift(task);
  }

  if (!categories.includes(task.category)) categories.push(task.category);

  persist();
  closeDialog($("#taskDialog"));
  renderAll();
  toast(existing ? "Task updated." : "Task added to your workspace.");
}

function toggleTask(id) {
  const task = getTask(id);
  if (!task) return;

  const completing = task.status !== "completed";
  task.status = completing ? "completed" : "active";
  task.completedAt = completing ? Date.now() : null;

  persist();
  renderAll();

  if (completing) {
    celebrate("✓ One less thing to carry. Well done.");
    toast("Task completed. Take a moment to acknowledge your progress.");
  } else {
    toast("Task moved back to your active list.");
  }
}

function deleteTask(id) {
  const task = getTask(id);
  if (!task) return;

  if (settings.confirmDelete && !window.confirm(`Delete "${task.title}"? This cannot be undone.`)) {
    return;
  }

  tasks = tasks.filter(item => item.id !== id);
  if (state.recommendationId === id) state.recommendationId = null;
  if (state.selectedTaskId === id) state.selectedTaskId = null;

  persist();
  renderAll();
  toast("Task deleted.");
}

function openTaskDetails(id) {
  const task = getTask(id);
  if (!task) return;

  state.selectedTaskId = id;
  $("#detailTitle").textContent = task.title;

  const steps = task.subtasks.length
    ? `<div class="subtask-list">${task.subtasks.map(step => `
        <label class="subtask-item ${step.done ? "done" : ""}">
          <input type="checkbox" data-step-id="${escapeHTML(step.id)}" ${step.done ? "checked" : ""}>
          <span>${escapeHTML(step.title)}</span>
        </label>`).join("")}</div>`
    : `<p class="muted small">No steps yet. Use "Break it down" to create a manageable starting sequence.</p>`;

  $("#detailContent").innerHTML = `
    <p class="detail-description">${escapeHTML(task.description || "No additional notes for this task.")}</p>
    <div class="detail-meta">
      <span class="category-pill">${escapeHTML(task.category)}</span>
      <span class="priority-pill ${task.priority}">${escapeHTML(task.priority)} priority</span>
      <span class="due-pill ${dueClass(task)}">${escapeHTML(dueDescription(task))}</span>
      <span class="meta-chip">${minutesLabel(task.minutes)}</span>
      <span class="meta-chip">${escapeHTML(task.energy)} energy</span>
    </div>
    <div class="panel-heading" style="margin-top:23px;margin-bottom:8px">
      <h2>Steps to complete</h2>
      <span class="muted small">${task.subtasks.filter(step => step.done).length}/${task.subtasks.length}</span>
    </div>
    ${steps}
    <div class="next-task-actions">
      <button class="button button-secondary button-small" data-break-task="${escapeHTML(task.id)}">✳ Break it down</button>
      <button class="button button-secondary button-small" data-toggle-task="${escapeHTML(task.id)}">${task.status === "completed" ? "Reopen task" : "Mark complete"}</button>
      <button class="button button-ghost button-small" data-edit-task="${escapeHTML(task.id)}">Edit</button>
    </div>
  `;

  showDialog($("#detailDialog"));
}

function toggleSubtask(taskId, stepId, checked) {
  const task = getTask(taskId);
  if (!task) return;

  const step = task.subtasks.find(item => item.id === stepId);
  if (!step) return;

  step.done = checked;

  if (task.subtasks.length && task.subtasks.every(item => item.done)) {
    task.status = "completed";
    task.completedAt = Date.now();
  } else if (task.status === "completed") {
    task.status = "active";
    task.completedAt = null;
  }

  persist();
  renderAll();
  openTaskDetails(taskId);
}

/* ----------------------- Task breakdown ---------------------- */

function generateSteps(task) {
  if (task.subtasks.length) return task.subtasks;

  const title = task.title.toLowerCase();
  let steps;

  if (/assignment|essay|report|project|presentation|research/.test(title)) {
    steps = [
      "Open the brief and identify what needs to be delivered",
      "Write down the main sections or requirements",
      "Complete one small section",
      "Review what you've done and choose the next step"
    ];
  } else if (/study|read|chapter|revision|exam|notes/.test(title)) {
    steps = [
      "Open your materials and find the right section",
      "Read or review one small topic",
      "Write down three important points",
      "Test your understanding with one question"
    ];
  } else if (/email|message|reply|call|meeting/.test(title)) {
    steps = [
      "Gather the information you need",
      "Write a rough first version",
      "Review it and make the next action clear"
    ];
  } else if (/clean|organize|tidy/.test(title)) {
    steps = [
      "Choose one small area to start with",
      "Spend five minutes on that area",
      "Put away the remaining items one group at a time"
    ];
  } else {
    steps = [
      `Open whatever you need for "${task.title}"`,
      "Spend five minutes on the easiest part",
      "Write down what remains and choose the next small action"
    ];
  }

  return steps.map(title => ({ id: makeId(), title, done: false }));
}

function breakTaskDown(id, kind = "stuck") {
  const task = getTask(id);
  if (!task) {
    toast("Add a task first so we can find a starting point.", "error");
    return;
  }

  state.rescueTaskId = id;
  state.rescueKind = kind;

  const steps = generateSteps(task);
  const unfinished = steps.filter(step => !step.done);
  const nextStep = unfinished[0] || {
    title: "Review the task and decide what the next useful step should be",
    done: false
  };

  const stuck = kind === "stuck";
  $("#rescueTitle").textContent = stuck ? "Let's make this smaller." : "Ten minutes is enough to begin.";
  $("#rescueIntro").textContent = stuck
    ? "You don't have to solve the whole thing right now. Here's a gentle starting point."
    : "Pick a small action that can fit into the time you have.";

  const estimated = Math.min(10, Math.max(3, Math.ceil(task.minutes / Math.max(1, steps.length))));
  $("#rescueContent").innerHTML = `
    <div class="rescue-card">
      <div class="eyebrow">${stuck ? "YOUR NEXT SMALL STEP" : "A TEN-MINUTE PLAN"}</div>
      <h3>${escapeHTML(nextStep.title)}</h3>
      <p>For now, ignore the rest of the task. Focus only on this action, then decide what makes sense next.</p>
      <span class="rescue-duration">◷ ${estimated} minute${estimated === 1 ? "" : "s"} to begin</span>
    </div>
    <div class="task-meta" style="margin-top:13px">
      <span>For: ${escapeHTML(task.title)}</span>
      <span>${unfinished.length} step${unfinished.length === 1 ? "" : "s"} remaining</span>
    </div>
  `;

  closeDialog($("#detailDialog"));
  showDialog($("#rescueDialog"));
}

function startRescueTask() {
  const task = getTask(state.rescueTaskId);
  if (!task) {
    closeDialog($("#rescueDialog"));
    return;
  }

  if (!task.subtasks.length) {
    task.subtasks = generateSteps(task);
    persist();
  }

  const remaining = task.subtasks.find(step => !step.done);
  closeDialog($("#rescueDialog"));

  if (state.rescueKind === "ten") {
    setTimerMode(10, "short");
  } else {
    setTimerMode(25, "focus");
  }

  $("#focusTaskSelect").value = task.id;
  $("#sessionGoal").value = remaining?.title || task.title;
  $("#focusTaskSubtitle").textContent = task.title;
  navigate("focus");
  renderFocusTaskOptions();
  $("#focusTaskSelect").value = task.id;
  $("#sessionGoal").value = remaining?.title || task.title;
  $("#focusTaskSubtitle").textContent = task.title;
  startTimer();
}

/* ----------------------- Recommendation ---------------------- */

function scoreTask(task, energy = "medium") {
  let score = (PRIORITY_SCORE[task.priority] || 1) * 12;
  const diff = dateDiff(todayISO(), task.dueDate);

  if (diff !== null) {
    if (diff < 0) score += 45 + Math.min(30, Math.abs(diff) * 4);
    else if (diff === 0) score += 40;
    else if (diff === 1) score += 25;
    else if (diff <= 3) score += 14;
    else if (diff <= 7) score += 5;
  }

  if (task.energy === energy) score += 12;
  if (energy === "low" && task.energy === "high") score -= 14;
  if (task.minutes <= 15) score += 5;

  return score;
}

function getRecommendedTask() {
  const active = activeTasks();
  if (!active.length) return null;

  if (state.recommendationId) {
    const current = active.find(task => task.id === state.recommendationId);
    if (current) return current;
  }

  return [...active].sort((a, b) => scoreTask(b, $("#energyLevel")?.value || "medium") -
    scoreTask(a, $("#energyLevel")?.value || "medium"))[0];
}

function renderRecommendation() {
  const container = $("#nextTaskContent");
  const task = getRecommendedTask();

  if (!task) {
    container.innerHTML = `
      <div class="empty-next">
        <span class="empty-icon">✓</span>
        <h2>You've cleared your active list.</h2>
        <p>Enjoy the breathing room, or add a new task whenever you're ready.</p>
        <button class="button button-primary" data-open-add>＋ Add a task</button>
      </div>`;
    return;
  }

  const step = task.subtasks.find(item => !item.done);
  container.innerHTML = `
    <article class="next-task-card">
      <div class="next-task-top">
        <span class="next-badge"><span>✳</span> A GOOD PLACE TO START</span>
        <span class="task-priority">${escapeHTML(task.priority.toUpperCase())} PRIORITY</span>
      </div>
      <h3 class="next-task-title">${escapeHTML(task.title)}</h3>
      <p class="next-task-description">${escapeHTML(
        step ? `Start here: ${step.title}` :
        task.description || "Give this task a small, focused block of attention."
      )}</p>
      <div class="task-meta">
        <span class="meta-chip">◷ ${minutesLabel(task.minutes)}</span>
        <span class="meta-chip">${escapeHTML(task.category)}</span>
        <span class="meta-chip">${escapeHTML(dueDescription(task))}</span>
      </div>
      <div class="next-task-actions">
        <button class="button button-primary" data-start-task="${escapeHTML(task.id)}">▶ Start task</button>
        <button class="button button-secondary" data-break-task="${escapeHTML(task.id)}">✳ Break it down</button>
        <button class="button button-ghost" data-toggle-task="${escapeHTML(task.id)}">✓ Complete</button>
      </div>
    </article>`;
}

/* ---------------------- Dashboard rendering ------------------ */

function calculateWorkload() {
  const active = activeTasks();
  const dueToday = active.filter(isDueToday);
  const overdue = active.filter(isOverdue);
  const estimated = dueToday.reduce((sum, task) => sum + task.minutes, 0);
  const capacity = Number(state.plannerPrefs.minutes) || 120;

  let label = "Balanced";
  let description = "You're finding your rhythm.";
  let score = Math.round((estimated / Math.max(capacity, 1)) * 100);

  if (overdue.length >= 3 || dueToday.length >= 6 || score > 150) {
    label = "Overloaded";
    description = "Consider moving flexible tasks.";
  } else if (overdue.length || score > 90 || dueToday.length >= 4) {
    label = "A lot on";
    description = "A smaller plan may help.";
  } else if (!active.length) {
    label = "Clear";
    description = "Space to rest or explore.";
    score = 0;
  } else {
    score = Math.min(80, score);
  }

  return { label, description, score: clamp(score, 5, 100), dueToday, overdue, estimated };
}

function renderStats() {
  const total = tasks.length;
  const complete = completedTasks().length;
  const active = activeTasks();
  const dueToday = active.filter(isDueToday);
  const workload = calculateWorkload();
  const rate = total ? Math.round(complete / total * 100) : 0;

  $("#statTotal").textContent = total;
  $("#statActive").textContent = `${active.length} active`;
  $("#totalBar").style.width = `${total ? Math.min(100, active.length / total * 100) : 0}%`;

  $("#statCompleted").textContent = complete;
  $("#completionRate").textContent = `${rate}%`;
  $("#completedBar").style.width = `${rate}%`;

  $("#statToday").textContent = dueToday.length;
  $("#overdueLabel").textContent = workload.overdue.length
    ? `${workload.overdue.length} overdue`
    : "No overdue tasks";
  $("#todayBar").style.width = `${Math.min(100, dueToday.length * 16)}%`;

  $("#overloadValue").textContent = workload.label;
  $("#overloadDescription").textContent = workload.description;
  $("#overloadBar").style.width = `${workload.score}%`;
  $("#overloadBar").parentElement.parentElement.classList.toggle("workload-card-high", workload.label === "Overloaded");

  $("#navTaskCount").textContent = active.length;
  $("#progressCompleted").textContent = complete;
  $("#progressRemaining").textContent = active.length;
  $("#donutPercent").textContent = `${rate}%`;
  $("#progressDonut").style.setProperty("--progress", `${rate * 3.6}deg`);

  const sessions = state.focusSessions;
  const totalMinutes = sessions.reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
  $("#progressMinutes").textContent = minutesLabel(totalMinutes);
}

function renderCategoryList() {
  const container = $("#categoryList");
  container.innerHTML = "";

  categories.forEach((category, index) => {
    const count = tasks.filter(task => task.category === category && task.status === "active").length;
    const button = document.createElement("button");
    button.className = "category-item";
    button.innerHTML = `
      <span class="category-dot" style="background:${["#76a986","#c3a064","#789ab7","#bc8d91","#8f80b4","#9da99c"][index % 6]}"></span>
      <span>${escapeHTML(category)}</span>
      <span class="category-count">${count}</span>`;
    button.addEventListener("click", () => {
      state.categoryFilter = category;
      state.taskFilter = "all";
      $("#categoryFilter").value = category;
      updateFilterTabs();
      navigate("tasks");
      renderTaskPage();
    });
    container.append(button);
  });
}

function renderCategoryFilter() {
  const select = $("#categoryFilter");
  const selected = state.categoryFilter;
  select.replaceChildren(new Option("All categories", "all"));

  categories.forEach(category => select.add(new Option(category, category)));

  select.value = categories.includes(selected) ? selected : "all";
  state.categoryFilter = select.value;
}

function renderTaskRow(task) {
  const checked = task.status === "completed";
  return `
    <div class="task-row ${checked ? "completed" : ""}" data-row-id="${escapeHTML(task.id)}">
      <button class="task-check ${checked ? "checked" : ""}" data-toggle-task="${escapeHTML(task.id)}" aria-label="${checked ? "Reopen" : "Complete"} ${escapeHTML(task.title)}" aria-pressed="${checked}">
        ${checked ? "✓" : ""}
      </button>
      <div class="task-row-content" data-detail-task="${escapeHTML(task.id)}" tabindex="0" role="button" aria-label="View ${escapeHTML(task.title)}">
        <span class="task-row-title">${escapeHTML(task.title)}</span>
        <span class="task-row-meta">
          <span class="category-pill">${escapeHTML(task.category)}</span>
          <span class="priority-pill ${escapeHTML(task.priority)}">${escapeHTML(task.priority)}</span>
          <span class="due-pill ${dueClass(task)}">${escapeHTML(dueDescription(task))}</span>
          <span>${minutesLabel(task.minutes)}</span>
        </span>
      </div>
      <div class="task-row-actions">
        <button class="row-action edit-action" data-edit-task="${escapeHTML(task.id)}" aria-label="Edit ${escapeHTML(task.title)}">↗</button>
        <button class="row-action" data-delete-task="${escapeHTML(task.id)}" aria-label="Delete ${escapeHTML(task.title)}">⋯</button>
      </div>
    </div>`;
}

function renderTodayTasks() {
  const container = $("#todayTaskList");
  const candidates = sortTasks(activeTasks()).filter(task =>
    !task.dueDate || task.dueDate <= shiftDate(todayISO(), 2)
  ).slice(0, 6);

  const done = completedTasks().length;
  const total = tasks.length;
  const rate = total ? done / total * 100 : 0;

  $("#planProgressBar").style.width = `${rate}%`;
  $("#planProgressText").textContent = `${done} of ${total} complete`;

  container.innerHTML = candidates.length
    ? candidates.map(renderTaskRow).join("")
    : `<div class="task-list-empty">No tasks need your attention right now. Enjoy the space.</div>`;
}

function renderSuggestions() {
  const workload = calculateWorkload();
  const active = sortTasks(activeTasks());
  const quick = active.filter(task => task.minutes <= 15).sort((a, b) => a.minutes - b.minutes)[0];
  const urgent = active.find(task => isOverdue(task) || task.priority === "urgent");
  const lowEnergy = active.find(task => task.energy === "low");

  const suggestions = [];

  if (workload.label === "Overloaded") {
    suggestions.push({
      icon: "↘", title: "Make today's plan smaller",
      body: "Several deadlines are competing for your attention.",
      action: "planner"
    });
  } else if (urgent) {
    suggestions.push({
      icon: "◷", title: "Review your closest deadline",
      body: `${urgent.title} may need attention soon.`,
      task: urgent.id
    });
  }

  if (quick) {
    suggestions.push({
      icon: "✳", title: "Pick a quick win",
      body: `${quick.title} may fit into ${minutesLabel(quick.minutes)}.`,
      task: quick.id
    });
  }

  if (lowEnergy) {
    suggestions.push({
      icon: "☘", title: "Save energy for later",
      body: `Try a lower-effort task such as ${lowEnergy.title}.`,
      task: lowEnergy.id
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      icon: "✓", title: "Keep your pace realistic",
      body: "Choose one task, then reassess your energy.",
      action: "planner"
    });
  }

  if (suggestions.length < 3) {
    suggestions.push({
      icon: "◷", title: "Take a focused ten minutes",
      body: "A small start can make a difficult task feel easier.",
      action: "ten"
    });
  }

  $("#suggestionsList").innerHTML = suggestions.slice(0, 3).map((item, index) => `
    <div class="suggestion-item">
      <span class="suggestion-icon">${item.icon}</span>
      <div class="suggestion-copy">
        <strong>${escapeHTML(item.title)}</strong>
        <p>${escapeHTML(item.body)}</p>
      </div>
      <button data-suggestion-task="${escapeHTML(item.task || "")}" data-suggestion-action="${escapeHTML(item.action || "")}" aria-label="Open suggestion ${index + 1}">→</button>
    </div>`).join("");
}

function renderTaskPage() {
  renderCategoryFilter();
  const list = filteredTasks();

  $("#taskResultCount").textContent = `${list.length} task${list.length === 1 ? "" : "s"}`;
  $("#allTaskList").innerHTML = list.map(renderTaskRow).join("");
  $("#emptyTasks").classList.toggle("hidden", list.length !== 0);
}

function updateFilterTabs() {
  $$(".filter-tab").forEach(button => {
    button.classList.toggle("selected", button.dataset.filter === state.taskFilter);
  });
}

function renderAll() {
  persist();
  renderStats();
  renderCategoryList();
  renderRecommendation();
  renderTodayTasks();
  renderSuggestions();
  renderTaskPage();
  renderFocusTaskOptions();
  renderFocusStats();
  renderProgressSummary();
}

/* -------------------------- Planner -------------------------- */

function syncPlannerControls() {
  $("#availableMinutes").value = state.plannerPrefs.minutes;
  $("#availableTimeLabel").textContent = minutesLabel(state.plannerPrefs.minutes);
  $("#energyLevel").value = state.plannerPrefs.energy;
  $("#planningPriority").value = state.plannerPrefs.priority;
  $("#planDate").value = state.plannerPrefs.date || todayISO();
  $("#includeFlexible").checked = state.plannerPrefs.includeFlexible !== false;
  $("#includeBreaks").checked = state.plannerPrefs.includeBreaks !== false;
}

function plannerScore(task, energy, priorityMode) {
  let score = scoreTask(task, energy);
  const difference = dateDiff(state.plannerPrefs.date, task.dueDate);

  if (priorityMode === "quick") score += Math.max(0, 20 - task.minutes);
  if (priorityMode === "important") score += (PRIORITY_SCORE[task.priority] || 1) * 15;
  if (priorityMode === "deadline" && difference !== null) score += Math.max(-10, 40 - Math.max(0, difference) * 8);
  if (energy === "low" && task.energy === "high") score -= 30;
  if (energy === "high" && task.energy === "high") score += 10;

  return score;
}

function buildPlan() {
  const prefs = state.plannerPrefs;
  const date = prefs.date || todayISO();
  const available = clamp(Number(prefs.minutes) || 120, 10, 480);

  let candidates = activeTasks().filter(task => {
    if (!prefs.includeFlexible && !task.dueDate) return false;
    if (task.dueDate && task.dueDate < date) return true;
    return true;
  });

  candidates = candidates.sort((a, b) =>
    plannerScore(b, prefs.energy, prefs.priority) -
    plannerScore(a, prefs.energy, prefs.priority)
  );

  const items = [];
  let used = 0;
  let clock = prefs.dayStart || settings.dayStart || "09:00";
  let [hours, minutes] = clock.split(":").map(Number);
  let elapsed = (hours || 9) * 60 + (minutes || 0);
  const includeBreaks = prefs.includeBreaks !== false;

  for (const task of candidates) {
    if (used >= available) break;

    const remaining = available - used;
    if (remaining < 5) break;

    const duration = Math.min(task.minutes, remaining);
    const start = elapsed;

    items.push({
      id: task.id,
      title: task.title,
      description: task.description,
      minutes: duration,
      fullMinutes: task.minutes,
      start,
      partial: duration < task.minutes,
      type: "task"
    });

    used += duration;
    elapsed += duration;

    if (includeBreaks && used < available && duration >= 25 && available - used >= 5) {
      items.push({
        id: `break-${makeId()}`,
        title: "Take a short break",
        description: "Stretch, drink some water, and give your attention a rest.",
        minutes: 5,
        start: elapsed,
        type: "break"
      });
      used += 5;
      elapsed += 5;
    }
  }

  state.plan = {
    date,
    available,
    used,
    items,
    generatedAt: Date.now()
  };

  renderGeneratedPlan();
  persistPlanner();
  toast(`Plan created: ${items.filter(item => item.type === "task").length} task(s) scheduled.`);
}

function timeLabel(totalMinutes) {
  return `${pad(Math.floor(totalMinutes / 60) % 24)}:${pad(totalMinutes % 60)}`;
}

function renderGeneratedPlan() {
  const plan = state.plan;
  if (!plan) return;

  const taskItems = plan.items.filter(item => item.type === "task");
  const plannedMinutes = taskItems.reduce((sum, item) => sum + item.minutes, 0);
  const checks = state.planChecks[plan.date] || {};

  $("#generatedPlanTitle").textContent = formatDate(plan.date, {
    weekday: "long", month: "long", day: "numeric"
  });

  $("#plannerSummary").innerHTML = `
    <div><strong>${taskItems.length}</strong><span>Tasks planned</span></div>
    <div><strong>${minutesLabel(plannedMinutes)}</strong><span>Focused work</span></div>
    <div><strong>${minutesLabel(Math.max(0, plan.available - plan.used))}</strong><span>Time remaining</span></div>`;

  const container = $("#generatedPlanList");

  if (!plan.items.length) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">✳</span><h3>Nothing to schedule just yet.</h3><p>Add a few active tasks, then build your plan again.</p></div>`;
    return;
  }

  container.innerHTML = plan.items.map(item => {
    if (item.type === "break") {
      return `
        <article class="generated-item generated-break">
          <div class="generated-time">${timeLabel(item.start)}</div>
          <div><h3>☘ ${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)}</p><span class="muted small">${minutesLabel(item.minutes)}</span></div>
        </article>`;
    }

    const task = getTask(item.id);
    const checked = Boolean(checks[item.id]);

    return `
      <article class="generated-item">
        <div class="generated-time">${timeLabel(item.start)}</div>
        <div>
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.description || "Focus on the next manageable step.")}</p>
          <div class="task-meta">
            <span>${minutesLabel(item.minutes)}${item.partial ? " of " + minutesLabel(item.fullMinutes) : ""}</span>
            <span class="category-pill">${escapeHTML(task?.category || "Task")}</span>
            ${item.partial ? '<span class="priority-pill medium">Partial session</span>' : ""}
          </div>
          <div class="generated-actions" style="margin-top:10px">
            <button class="button button-small ${checked ? "button-secondary" : "button-primary"}" data-plan-check="${escapeHTML(item.id)}">${checked ? "✓ Planned complete" : "Mark planned complete"}</button>
            <button class="button button-small button-secondary" data-start-task="${escapeHTML(item.id)}">Focus →</button>
            ${task ? `<button class="button button-small button-ghost" data-detail-task="${escapeHTML(item.id)}">Details</button>` : ""}
          </div>
        </div>
      </article>`;
  }).join("");
}

function exportPlan() {
  if (!state.plan) buildPlan();
  if (!state.plan) return;

  const plan = state.plan;
  const lines = [
    `TaskTamer plan — ${plan.date}`,
    `Available time: ${minutesLabel(plan.available)}`,
    "",
    ...plan.items.map(item =>
      `${timeLabel(item.start)} — ${item.title} (${minutesLabel(item.minutes)})${item.partial ? " [partial]" : ""}`
    )
  ];

  downloadText(`tasktamer-plan-${plan.date}.txt`, lines.join("\n"), "text/plain");
}

/* --------------------------- Calendar ------------------------ */

function renderCalendar() {
  const month = state.calendarMonth;
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);

  $("#calendarMonth").textContent = month.toLocaleDateString(undefined, {
    month: "long", year: "numeric"
  });

  const weekStart = Number(settings.weekStart) === 0 ? 0 : 1;
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const orderedLabels = [...weekdayLabels.slice(weekStart), ...weekdayLabels.slice(0, weekStart)];

  let html = orderedLabels.map(label =>
    `<div class="calendar-weekday">${label}</div>`
  ).join("");

  const offset = (firstDay.getDay() - weekStart + 7) % 7;
  const totalCells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;
  const start = new Date(year, monthIndex, 1 - offset);

  for (let index = 0; index < totalCells; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const outside = date.getMonth() !== monthIndex;
    const today = key === todayISO();
    const selected = key === state.calendarSelected;
    const dayTasks = tasks.filter(task => task.dueDate === key);

    html += `
      <button class="calendar-day ${outside ? "outside" : ""} ${today ? "today" : ""} ${selected ? "selected" : ""}" data-calendar-date="${key}" aria-label="${escapeHTML(date.toLocaleDateString())}, ${dayTasks.length} task(s)" aria-pressed="${selected}">
        <span class="calendar-day-number">${date.getDate()}</span>
        ${dayTasks.slice(0, 2).map(task =>
          `<span class="calendar-event">${escapeHTML(task.title)}</span>`
        ).join("")}
        ${dayTasks.length > 2 ? `<span class="calendar-event more">+${dayTasks.length - 2} more</span>` : ""}
      </button>`;
  }

  $("#calendarGrid").innerHTML = html;
  renderCalendarAgenda();
}

function renderCalendarAgenda() {
  const date = state.calendarSelected;
  $("#agendaTitle").textContent = `Agenda · ${formatDate(date, {
    weekday: "long", month: "long", day: "numeric"
  })}`;

  const dayTasks = sortTasks(tasks.filter(task => task.dueDate === date), "priority");
  const container = $("#calendarAgenda");

  if (!dayTasks.length) {
    container.innerHTML = `<div class="task-list-empty">Nothing scheduled for this day. You can leave it open or add a task.</div>`;
    return;
  }

  container.innerHTML = dayTasks.map(task => `
    <div class="agenda-item">
      <button class="task-check ${task.status === "completed" ? "checked" : ""}" data-toggle-task="${escapeHTML(task.id)}" aria-label="Toggle ${escapeHTML(task.title)}">${task.status === "completed" ? "✓" : ""}</button>
      <div><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(task.category)} · ${minutesLabel(task.minutes)} · ${escapeHTML(task.priority)} priority</small></div>
      <button class="button button-secondary button-small" data-detail-task="${escapeHTML(task.id)}">View</button>
    </div>`).join("");
}

/* -------------------------- Focus timer ---------------------- */

function setTimerMode(minutes, mode = "focus") {
  pauseTimer(false);
  state.timer.mode = mode;
  state.timer.duration = minutes * 60;
  state.timer.remaining = minutes * 60;
  state.timer.running = false;
  state.timer.endAt = null;

  $$(".timer-mode").forEach(button => {
    button.classList.toggle("selected", button.dataset.mode === mode);
  });

  renderTimer();
}

function renderTimer() {
  const timer = state.timer;
  const remaining = Math.max(0, timer.remaining);
  const display = `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;
  $("#focusTimerDisplay").textContent = display;
  $("#miniFocusTime").textContent = display;

  const percent = timer.duration ? 1 - remaining / timer.duration : 0;
  $("#miniFocusRing").style.background =
    `conic-gradient(#79ad88 ${percent * 360}deg, #e8eee5 0deg)`;

  $("#timerStart").textContent = timer.running ? "Ⅱ Pause session" : "▶ Start focus";
  $("#timerStart").setAttribute("aria-label", timer.running ? "Pause timer" : "Start timer");

  $("#timerReset").disabled = remaining === timer.duration && !timer.running;
  $("#timerSkip").disabled = remaining === 0;

  const statuses = {
    focus: timer.running ? "FOCUS SESSION IN PROGRESS" : "READY WHEN YOU ARE",
    deep: timer.running ? "DEEP WORK IN PROGRESS" : "READY FOR DEEP WORK",
    short: timer.running ? "QUICK FOCUS IN PROGRESS" : "READY FOR A QUICK START",
    break: timer.running ? "TAKE A BREATH" : "BREAK TIME"
  };

  $("#focusTimerStatus").textContent = remaining === 0 ? "SESSION COMPLETE" : statuses[timer.mode] || statuses.focus;
  $("#focusWidgetTitle").textContent = timer.running ? "You're in your focus session." : "One thing at a time.";
  $("#focusWidgetSubtitle").textContent = timer.running ? "Stay with this moment." : "Your next focused session awaits.";
}

function startTimer() {
  const timer = state.timer;
  if (timer.running) {
    pauseTimer();
    return;
  }

  if (timer.remaining <= 0) {
    timer.remaining = timer.duration;
  }

  timer.running = true;
  timer.endAt = Date.now() + timer.remaining * 1000;

  timer.interval = window.setInterval(() => {
    timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    renderTimer();

    if (timer.remaining <= 0) {
      completeTimer();
    }
  }, 250);

  renderTimer();
}

function pauseTimer(showToast = true) {
  const timer = state.timer;
  if (timer.interval) window.clearInterval(timer.interval);

  timer.interval = null;

  if (timer.running && timer.endAt) {
    timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
  }

  timer.running = false;
  timer.endAt = null;
  renderTimer();

  if (showToast) toast("Focus session paused.");
}

function completeTimer() {
  const timer = state.timer;
  if (timer.interval) window.clearInterval(timer.interval);

  timer.interval = null;
  timer.running = false;
  timer.remaining = 0;
  timer.endAt = null;

  const isBreak = timer.mode === "break";
  const minutes = Math.round(timer.duration / 60);

  if (!isBreak) {
    const session = {
      id: makeId(),
      date: todayISO(),
      timestamp: Date.now(),
      minutes,
      taskId: $("#focusTaskSelect").value || null,
      mode: timer.mode,
      goal: $("#sessionGoal").value.trim()
    };

    state.focusSessions.push(session);
    persistSessions();

    const task = getTask(session.taskId);
    toast(task
      ? `Focus session complete. You gave "${task.title}" ${minutesLabel(minutes)} of attention.`
      : `Focus session complete. ${minutesLabel(minutes)} recorded.`);

    celebrate("✳ You showed up for the work. That counts.");
  } else {
    toast("Break complete. Return when you're ready.");
  }

  if (settings.soundAlerts) playAlertSound();

  renderTimer();
  renderFocusStats();
  renderAll();
}

function skipTimer() {
  pauseTimer(false);
  completeTimer();
}

function playAlertSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.value = 0.08;

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();

    window.setTimeout(() => {
      oscillator.stop();
      context.close();
    }, 250);
  } catch (error) {
    console.warn("Audio alert unavailable.", error);
  }
}

function renderFocusTaskOptions() {
  const select = $("#focusTaskSelect");
  if (!select) return;

  const selected = select.value;
  select.replaceChildren(new Option("No specific task", ""));

  sortTasks(activeTasks()).forEach(task => {
    select.add(new Option(task.title, task.id));
  });

  select.value = getTask(selected)?.status === "active" ? selected : "";
}

function renderFocusStats() {
  const sessions = state.focusSessions;
  const totalMinutes = sessions.reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
  const todayMinutes = sessions.filter(session => session.date === todayISO())
    .reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);

  $("#focusSessionsCount").textContent = sessions.length;
  $("#focusTotalTime").textContent = minutesLabel(totalMinutes);
  $("#focusTodayTime").textContent = minutesLabel(todayMinutes);
}

function saveFocusNotes() {
  state.focusNotes = {
    goal: $("#sessionGoal").value.slice(0, 2000),
    distraction: $("#distractionNote").value.slice(0, 2000)
  };

  safeWrite("tasktamer.focusnotes.v1", state.focusNotes);
  toast("Your session notes are saved in this browser.");
}

/* ---------------------- Insights & progress ------------------ */

function getStreak() {
  const completedDates = new Set(
    tasks.filter(task => task.status === "completed" && task.completedAt)
      .map(task => {
        const date = new Date(task.completedAt);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      })
  );

  let cursor = todayISO();
  if (!completedDates.has(cursor)) cursor = shiftDate(cursor, -1);

  let streak = 0;
  while (completedDates.has(cursor) && streak < 3650) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }

  return streak;
}

function renderProgressSummary() {
  const completed = completedTasks().length;
  const total = tasks.length;
  const rate = total ? Math.round(completed / total * 100) : 0;
  const focusMinutes = state.focusSessions.reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);

  $("#insightCompleted").textContent = completed;
  $("#insightRate").textContent = `${rate}%`;
  $("#insightFocus").textContent = focusMinutes;
  $("#insightStreak").textContent = `${getStreak()} day${getStreak() === 1 ? "" : "s"}`;

  $("#insightMessage").textContent = completed
    ? `${completed} task${completed === 1 ? "" : "s"} completed. Notice what helped you get there.`
    : "Progress is more than a perfect streak.";
}

function renderInsights() {
  renderProgressSummary();

  const container = $("#weeklyChart");
  const days = [];

  for (let offset = 6; offset >= 0; offset--) {
    const date = shiftDate(todayISO(), -offset);
    const done = tasks.filter(task => {
      if (!task.completedAt) return false;
      const completed = new Date(task.completedAt);
      return `${completed.getFullYear()}-${pad(completed.getMonth() + 1)}-${pad(completed.getDate())}` === date;
    }).length;

    days.push({
      date,
      day: dateObject(date).toLocaleDateString(undefined, { weekday: "short" }),
      count: done
    });
  }

  const maxCount = Math.max(1, ...days.map(day => day.count));

  container.innerHTML = days.map(day => `
    <div class="chart-column">
      <span class="chart-value">${day.count}</span>
      <div class="chart-bar-wrap">
        <div class="chart-bar ${day.date === todayISO() ? "today" : ""}" style="height:${Math.max(3, day.count / maxCount * 100)}%"></div>
      </div>
      <span class="chart-day">${escapeHTML(day.day)}</span>
    </div>`).join("");

  const breakdown = $("#categoryBreakdown");
  const groups = new Map();

  tasks.forEach(task => {
    const entry = groups.get(task.category) || { total: 0, completed: 0, minutes: 0 };
    entry.total++;
    if (task.status === "completed") entry.completed++;
    entry.minutes += task.minutes;
    groups.set(task.category, entry);
  });

  const entries = [...groups.entries()].sort((a, b) => b[1].total - a[1].total);

  breakdown.innerHTML = entries.length
    ? entries.map(([category, entry]) => `
        <div class="breakdown-row">
          <span>${escapeHTML(category)}</span>
          <div class="breakdown-track"><span style="width:${entry.total / Math.max(1, tasks.length) * 100}%"></span></div>
          <strong>${entry.completed}/${entry.total}</strong>
        </div>`).join("")
    : `<p class="muted small">Add tasks to start seeing your patterns.</p>`;
}

/* ------------------------ Settings --------------------------- */

function applyAccessibility() {
  document.body.classList.toggle("reduce-motion", Boolean(settings.reduceMotion));
  document.body.classList.toggle("high-contrast", Boolean(settings.highContrast));
  document.body.classList.toggle("large-text", Boolean(settings.largeText));
}

function syncSettingsControls() {
  $("#settingsName").value = settings.name || "";
  $("#settingsDayStart").value = settings.dayStart || "09:00";
  $("#settingsWeekStart").value = String(settings.weekStart ?? 1);

  $("#reduceMotion").checked = Boolean(settings.reduceMotion);
  $("#highContrast").checked = Boolean(settings.highContrast);
  $("#largeText").checked = Boolean(settings.largeText);
  $("#soundAlerts").checked = Boolean(settings.soundAlerts);
  $("#confirmDelete").checked = settings.confirmDelete !== false;
}

function saveSettings() {
  settings.name = $("#settingsName").value.trim().slice(0, 60) || "Friend";
  settings.dayStart = $("#settingsDayStart").value || "09:00";
  settings.weekStart = Number($("#settingsWeekStart").value);

  for (const key of ["reduceMotion", "highContrast", "largeText", "soundAlerts", "confirmDelete"]) {
    settings[key] = $(`#${key}`).checked;
  }

  persist();
  applyAccessibility();
  updateGreeting();
  syncPlannerControls();
  renderCalendar();
  toast("Your preferences have been saved.");
}

function updateGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name = (settings.name || "Friend").split(/\s+/)[0];

  $("#welcomeTitle").textContent = `${greeting}, ${name}.`;
  $("#welcomeSubtitle").textContent = "Let's make today feel a little more manageable.";
  $("#sidebarName").textContent = settings.name || "Friend";
  $("#sidebarAvatar").textContent = (settings.name || "F").charAt(0).toUpperCase();
  $("#topAvatar").textContent = (settings.name || "F").charAt(0).toUpperCase();
}

function addCategory() {
  $("#newCategoryName").value = "";
  showDialog($("#categoryDialog"));
  window.setTimeout(() => $("#newCategoryName").focus(), 30);
}

function saveCategory(event) {
  event.preventDefault();

  const name = $("#newCategoryName").value.trim();
  if (!name) return;

  if (categories.some(category => category.toLowerCase() === name.toLowerCase())) {
    toast("That category already exists.", "error");
    return;
  }

  categories.push(name);
  persist();
  renderAll();
  renderCategoryOptions($("#taskCategory"), name);
  closeDialog($("#categoryDialog"));
  toast(`Category "${name}" created.`);
}

/* -------------------------- Export --------------------------- */

function downloadText(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportData() {
  const data = {
    format: "TaskTamer backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
    settings,
    categories,
    focusSessions: state.focusSessions,
    focusNotes: state.focusNotes,
    planChecks: state.planChecks,
    plannerPrefs: state.plannerPrefs
  };

  downloadText(
    `tasktamer-backup-${todayISO()}.json`,
    JSON.stringify(data, null, 2),
    "application/json"
  );

  toast("Your backup has been prepared.");
}

function clearAllData() {
  const confirmed = window.confirm(
    "This permanently removes TaskTamer tasks, preferences, categories, and session history saved in this browser. Download a backup first if you need one. Continue?"
  );

  if (!confirmed) return;

  pauseTimer(false);

  for (const key of [
    STORAGE_KEY, SETTINGS_KEY, CATEGORIES_KEY,
    "tasktamer.sessions.v1", "tasktamer.focusnotes.v1",
    "tasktamer.planchecks.v1", "tasktamer.plannerprefs.v1"
  ]) {
    localStorage.removeItem(key);
  }

  tasks = [];
  categories = [...DEFAULT_CATEGORIES];

  settings = {
    name: "Alex Morgan",
    dayStart: "09:00",
    weekStart: 1,
    reduceMotion: false,
    highContrast: false,
    largeText: false,
    soundAlerts: false,
    confirmDelete: true
  };

  state.focusSessions = [];
  state.focusNotes = { goal: "", distraction: "" };
  state.planChecks = {};
  state.plannerPrefs = {
    minutes: 120, energy: "medium", priority: "balanced",
    date: todayISO(), includeFlexible: true, includeBreaks: true
  };
  state.plan = null;
  state.recommendationId = null;
  state.categoryFilter = "all";
  state.search = "";
  state.taskFilter = "all";

  $("#globalSearch").value = "";
  applyAccessibility();
  persist();
  persistSessions();
  persistPlanner();
  syncSettingsControls();
  syncPlannerControls();
  renderAll();
  renderCalendar();
  toast("Local workspace cleared.");
}

/* ----------------------- Event delegation -------------------- */

document.addEventListener("click", event => {
  const target = event.target.closest("button, [data-detail-task], [data-open-add], [data-goto], [data-calendar-date]");
  if (!target) return;

  if (target.matches("[data-close-dialog]")) {
    const dialog = target.closest("dialog");
    if (dialog) closeDialog(dialog);
    return;
  }

  if (target.dataset.view) {
    navigate(target.dataset.view);
    return;
  }

  if (target.dataset.goto) {
    navigate(target.dataset.goto);
    return;
  }

  if (target.matches("[data-open-add]")) {
    openTaskForm();
    return;
  }

  if (target.dataset.toggleTask) {
    toggleTask(target.dataset.toggleTask);
    return;
  }

  if (target.dataset.editTask) {
    const task = getTask(target.dataset.editTask);
    if (task) openTaskForm(task);
    return;
  }

  if (target.dataset.deleteTask) {
    deleteTask(target.dataset.deleteTask);
    return;
  }

  if (target.dataset.detailTask) {
    openTaskDetails(target.dataset.detailTask);
    return;
  }

  if (target.dataset.startTask) {
    const task = getTask(target.dataset.startTask);
    if (!task) return;

    closeDialog($("#detailDialog"));
    closeDialog($("#rescueDialog"));

    navigate("focus");
    renderFocusTaskOptions();
    $("#focusTaskSelect").value = task.id;
    $("#focusTaskSubtitle").textContent = task.title;
    $("#sessionGoal").value = task.subtasks.find(step => !step.done)?.title || task.title;
    startTimer();
    return;
  }

  if (target.dataset.breakTask) {
    breakTaskDown(target.dataset.breakTask, "stuck");
    return;
  }

  if (target.dataset.planCheck) {
    if (!state.plan) return;
    const date = state.plan.date;
    state.planChecks[date] ||= {};
    state.planChecks[date][target.dataset.planCheck] = !state.planChecks[date][target.dataset.planCheck];
    persistPlanner();
    renderGeneratedPlan();
    return;
  }

  if (target.dataset.calendarDate) {
    state.calendarSelected = target.dataset.calendarDate;
    renderCalendar();
    return;
  }

  if (target.dataset.suggestionTask) {
    if (target.dataset.suggestionTask) {
      openTaskDetails(target.dataset.suggestionTask);
    } else if (target.dataset.suggestionAction === "planner") {
      navigate("planner");
    } else if (target.dataset.suggestionAction === "ten") {
      openTenMinuteMode();
    }
    return;
  }

  if (target.dataset.suggestionAction === "planner") {
    navigate("planner");
    return;
  }

  if (target.dataset.suggestionAction === "ten") {
    openTenMinuteMode();
    return;
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeSidebar();

  if (event.key === "Enter" && event.target.matches("[data-detail-task]")) {
    openTaskDetails(event.target.dataset.detailTask);
  }
});

document.addEventListener("change", event => {
  const target = event.target;

  if (target.matches("[data-step-id]")) {
    toggleSubtask(state.selectedTaskId, target.dataset.stepId, target.checked);
  }
});

function openTenMinuteMode() {
  const recommended = sortTasks(activeTasks(), "duration")[0];

  if (!recommended) {
    toast("Add a task first to make the most of ten minutes.");
    openTaskForm();
    return;
  }

  breakTaskDown(recommended.id, "ten");
}

function openGlobalSearch() {
  navigate("tasks");
  $("#globalSearch").focus();
}

function bindEvents() {
  $$(".nav-link").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.view));
  });

  $$("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => closeDialog(button.closest("dialog")));
  });

  $("#taskForm").addEventListener("submit", saveTask);
  $("#openAddTask").addEventListener("click", () => openTaskForm());
  $("#tasksAddButton").addEventListener("click", () => openTaskForm());
  $("#addCategory").addEventListener("click", addCategory);
  $("#categoryForm").addEventListener("submit", saveCategory);

  $("#refreshRecommendation").addEventListener("click", () => {
    const active = activeTasks();
    if (!active.length) {
      toast("All clear. Add a task whenever you're ready.");
      return;
    }

    const current = getRecommendedTask();
    const next = active.find(task => task.id !== current?.id) || current;
    state.recommendationId = next?.id || null;
    renderRecommendation();
  });

  $("#tenMinuteButton").addEventListener("click", openTenMinuteMode);
  $("#buildPlanButton").addEventListener("click", buildPlan);
  $("#exportPlanButton").addEventListener("click", exportPlan);
  $("#exportDataButton").addEventListener("click", exportData);
  $("#backupDataButton").addEventListener("click", exportData);
  $("#clearDataButton").addEventListener("click", clearAllData);

  $("#availableMinutes").addEventListener("input", event => {
    state.plannerPrefs.minutes = Number(event.target.value);
    $("#availableTimeLabel").textContent = minutesLabel(state.plannerPrefs.minutes);
    persistPlanner();
  });

  $("#energyLevel").addEventListener("change", event => {
    state.plannerPrefs.energy = event.target.value;
    persistPlanner();
    renderStats();
  });

  $("#planningPriority").addEventListener("change", event => {
    state.plannerPrefs.priority = event.target.value;
    persistPlanner();
  });

  $("#planDate").addEventListener("change", event => {
    state.plannerPrefs.date = event.target.value || todayISO();
    persistPlanner();
  });

  $("#includeFlexible").addEventListener("change", event => {
    state.plannerPrefs.includeFlexible = event.target.checked;
    persistPlanner();
  });

  $("#includeBreaks").addEventListener("change", event => {
    state.plannerPrefs.includeBreaks = event.target.checked;
    persistPlanner();
  });

  $$(".filter-tab").forEach(button => {
    button.addEventListener("click", () => {
      state.taskFilter = button.dataset.filter;
      updateFilterTabs();
      renderTaskPage();
    });
  });

  $("#categoryFilter").addEventListener("change", event => {
    state.categoryFilter = event.target.value;
    renderTaskPage();
  });

  $("#sortTasks").addEventListener("change", event => {
    state.sort = event.target.value;
    renderTaskPage();
  });

  $("#globalSearch").addEventListener("input", event => {
    state.search = event.target.value.trim();
    if (state.search) {
      navigate("tasks");
      $("#globalSearch").value = state.search;
    }
    renderTaskPage();
  });

  document.addEventListener("keydown", event => {
    const tag = document.activeElement?.tagName;
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
      document.activeElement?.isContentEditable;

    if (event.key === "/" && !typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      $("#globalSearch").focus();
    }
  });

  $("#prevMonth").addEventListener("click", () => {
    state.calendarMonth = new Date(
      state.calendarMonth.getFullYear(),
      state.calendarMonth.getMonth() - 1,
      1
    );
    renderCalendar();
  });

  $("#nextMonth").addEventListener("click", () => {
    state.calendarMonth = new Date(
      state.calendarMonth.getFullYear(),
      state.calendarMonth.getMonth() + 1,
      1
    );
    renderCalendar();
  });

  $("#calendarToday").addEventListener("click", () => {
    state.calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    state.calendarSelected = todayISO();
    renderCalendar();
  });

  $("#timerStart").addEventListener("click", startTimer);
  $("#timerReset").addEventListener("click", () => {
    pauseTimer(false);
    state.timer.remaining = state.timer.duration;
    renderTimer();
  });
  $("#timerSkip").addEventListener("click", skipTimer);

  $$(".timer-mode").forEach(button => {
    button.addEventListener("click", () => {
      setTimerMode(Number(button.dataset.minutes), button.dataset.mode);
    });
  });

  $("#focusTaskSelect").addEventListener("change", event => {
    const task = getTask(event.target.value);
    $("#focusTaskSubtitle").textContent = task
      ? task.title
      : "Choose a task or start a quiet session.";

    if (task && !$("#sessionGoal").value.trim()) {
      $("#sessionGoal").value = task.subtasks.find(step => !step.done)?.title || task.title;
    }
  });

  $("#saveFocusNotes").addEventListener("click", saveFocusNotes);
  $("#saveSettings").addEventListener("click", saveSettings);

  $("#profileButton").addEventListener("click", () => navigate("settings"));
  $("#topAvatar").addEventListener("click", () => navigate("settings"));
  $("#notificationButton").addEventListener("click", () => {
    const overdue = activeTasks().filter(isOverdue);
    const due = activeTasks().filter(isDueToday);
    toast(overdue.length
      ? `You have ${overdue.length} overdue task(s) and ${due.length} due today.`
      : `${due.length} task(s) due today. Take it one step at a time.`);
  });

  $("#openSidebar").addEventListener("click", openSidebar);
  $("#closeSidebar").addEventListener("click", closeSidebar);
  $("#mobileOverlay").addEventListener("click", closeSidebar);

  $("#detailEditButton").addEventListener("click", () => {
    const task = getTask(state.selectedTaskId);
    if (!task) return;
    closeDialog($("#detailDialog"));
    openTaskForm(task);
  });

  $("#detailStartButton").addEventListener("click", () => {
    const task = getTask(state.selectedTaskId);
    if (!task) return;
    closeDialog($("#detailDialog"));
    navigate("focus");
    renderFocusTaskOptions();
    $("#focusTaskSelect").value = task.id;
    $("#focusTaskSubtitle").textContent = task.title;
    $("#sessionGoal").value = task.subtasks.find(step => !step.done)?.title || task.title;
  });

  $("#rescueStartButton").addEventListener("click", startRescueTask);

  for (const id of ["reduceMotion", "highContrast", "largeText", "soundAlerts", "confirmDelete"]) {
    $(`#${id}`).addEventListener("change", event => {
      settings[id] = event.target.checked;
      persist();
      applyAccessibility();
      toast("Preference updated.");
    });
  }

  $("#taskDialog").addEventListener("click", event => {
    if (event.target === $("#taskDialog")) closeDialog($("#taskDialog"));
  });

  $("#detailDialog").addEventListener("click", event => {
    if (event.target === $("#detailDialog")) closeDialog($("#detailDialog"));
  });

  $("#rescueDialog").addEventListener("click", event => {
    if (event.target === $("#rescueDialog")) closeDialog($("#rescueDialog"));
  });
}

/* --------------------------- Startup ------------------------- */

function initialize() {
  applyAccessibility();
  updateGreeting();

  const date = new Date();
  $("#currentDate").textContent = date.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });

  const dayNumber = Math.floor(date.getTime() / 86400000);
  $("#dailyQuote").textContent = QUOTES[((dayNumber % QUOTES.length) + QUOTES.length) % QUOTES.length];

  syncSettingsControls();
  syncPlannerControls();

  $("#sessionGoal").value = state.focusNotes.goal || "";
  $("#distractionNote").value = state.focusNotes.distraction || "";

  renderTimer();
  bindEvents();
  renderAll();
  renderCalendar();

  // Restore today's planner if the user already generated one this session.
  // Plans are intentionally not treated as fixed commitments across days.
  navigate("home");

  // Handle a page refresh while a timer is running: time continues to be
  // calculated from timestamps rather than relying on interval tick counts.
  document.addEventListener("visibilitychange", () => {
    if (state.timer.running && state.timer.endAt) {
      state.timer.remaining = Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
      renderTimer();
      if (state.timer.remaining <= 0) completeTimer();
    }
  });

  console.info("TaskTamer initialized.");
}

initialize();
