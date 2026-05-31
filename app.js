'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  semesterId: null,   // current semester file id (filename without .json)
  semester: null,     // loaded semester object
  openWeeks: new Set(), // weeks currently expanded
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
const api = {
  list: () => fetch('/api/semesters').then((r) => r.json()),
  load: (id) => fetch(`/api/semesters/${id}`).then((r) => r.json()),
  save: (id, data) =>
    fetch(`/api/semesters/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),
};

// Persist the current semester, then re-render.
let saveTimer = null;
function persist() {
  if (!state.semester) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => api.save(state.semesterId, state.semester), 250);
}

const uid = (prefix) => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// Status cycles
const READING_CYCLE = ['pending', 'seen', 'summarized', 'studied'];
const TASK_CYCLE = ['not done', 'done', 'reviewed'];

function nextStatus(cycle, current) {
  const i = cycle.indexOf(current);
  return cycle[(i + 1) % cycle.length];
}

// ---------------------------------------------------------------------------
// Week / date helpers
// ---------------------------------------------------------------------------
function weekStart(startDate, week) {
  const d = new Date(startDate + 'T00:00:00');
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Which week of the semester is "today"? Returns 0 if outside the semester.
function currentWeek(sem) {
  const start = new Date(sem.startDate + 'T00:00:00');
  const now = new Date();
  const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  const wk = Math.floor(diffDays / 7) + 1;
  if (wk < 1 || wk > sem.weeks) return 0;
  return wk;
}

// ---------------------------------------------------------------------------
// Loading & selector
// ---------------------------------------------------------------------------
async function populateSelector() {
  const list = await api.list();
  const select = document.getElementById('semester-select');
  select.innerHTML = '';
  list.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
  return list;
}

async function loadSemester(id) {
  state.semesterId = id;
  state.semester = await api.load(id);
  state.openWeeks = new Set();
  const cw = currentWeek(state.semester);
  if (cw) state.openWeeks.add(cw); // auto-expand current week
  document.getElementById('semester-select').value = id;
  render();
}

// ---------------------------------------------------------------------------
// Render (filled in by later feature sections)
// ---------------------------------------------------------------------------
function render() {
  renderDashboard();
  renderPlanner();
}

function renderDashboard() {}

// ---------------------------------------------------------------------------
// Planner: collapsible weeks, one course card per week
// ---------------------------------------------------------------------------
function renderPlanner() {
  const sem = state.semester;
  const root = document.getElementById('planner');
  root.innerHTML = '';
  const cw = currentWeek(sem);

  for (let week = 1; week <= sem.weeks; week++) {
    const isOpen = state.openWeeks.has(week);
    const start = weekStart(sem.startDate, week);
    const end = weekStart(sem.startDate, week);
    end.setDate(end.getDate() + 6);

    const weekEl = document.createElement('div');
    weekEl.className = 'week' + (isOpen ? ' open' : '');

    const header = document.createElement('div');
    header.className = 'week-header';
    header.innerHTML = `
      <span class="chevron">▶</span>
      <span class="week-title">Week ${week}</span>
      <span class="week-dates">${formatDate(start)} – ${formatDate(end)}</span>
      ${week === cw ? '<span class="week-badge">Current</span>' : ''}
    `;
    header.addEventListener('click', () => toggleWeek(week));
    weekEl.appendChild(header);

    const body = document.createElement('div');
    body.className = 'week-body';

    const coursesWithContent = sem.courses.filter(
      (c) =>
        c.readings.some((r) => r.week === week) ||
        c.tasks.some((t) => t.week === week)
    );

    if (coursesWithContent.length === 0) {
      body.innerHTML = '<div class="week-empty">No readings or tasks this week.</div>';
    } else {
      coursesWithContent.forEach((course) => {
        body.appendChild(renderCourseCard(course, week));
      });
    }

    weekEl.appendChild(body);
    root.appendChild(weekEl);
  }
}

function toggleWeek(week) {
  if (state.openWeeks.has(week)) state.openWeeks.delete(week);
  else state.openWeeks.add(week);
  renderPlanner();
}

function renderCourseCard(course, week) {
  const card = document.createElement('div');
  card.className = 'course-card';
  card.style.borderLeftColor = course.color;

  const title = document.createElement('h4');
  title.textContent = course.name;
  title.style.color = course.color;
  card.appendChild(title);

  const readings = course.readings.filter((r) => r.week === week);
  const tasks = course.tasks.filter((t) => t.week === week);

  if (readings.length) {
    card.appendChild(sectionTitle('Readings'));
    card.appendChild(renderItemList(readings, 'reading'));
  }
  if (tasks.length) {
    card.appendChild(sectionTitle('Tasks'));
    card.appendChild(renderItemList(tasks, 'task'));
  }

  return card;
}

function sectionTitle(text) {
  const el = document.createElement('p');
  el.className = 'card-section-title';
  el.textContent = text;
  return el;
}

function renderItemList(items, type) {
  const ul = document.createElement('ul');
  ul.className = 'item-list';
  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'item';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'item-title';
    titleSpan.textContent = item.title;
    li.appendChild(titleSpan);

    if (type === 'task' && item.dueDate) {
      const due = document.createElement('span');
      due.className = 'item-due';
      due.textContent = 'due ' + item.dueDate;
      li.appendChild(due);
    }

    const badge = document.createElement('button');
    badge.className = 'badge ' + item.status.replace(/\s+/g, '');
    badge.textContent = item.status;
    badge.title = 'Click to change status';
    badge.addEventListener('click', () => {
      const cycle = type === 'reading' ? READING_CYCLE : TASK_CYCLE;
      item.status = nextStatus(cycle, item.status);
      persist();
      render();
    });
    li.appendChild(badge);

    ul.appendChild(li);
  });
  return ul;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  const list = await populateSelector();
  if (list.length) await loadSemester(list[0].id);

  document.getElementById('semester-select').addEventListener('change', (e) => {
    loadSemester(e.target.value);
  });
}

init();
