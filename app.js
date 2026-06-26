/* ======================================
   打工記帳 — Application Logic (Firebase)
   ====================================== */

import { db } from './firebase-config.js';
import { onLogin, onLogout } from './auth.js';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  onSnapshot,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ─── Utility helpers ─────────────────────────────
const $ = (sel) => document.querySelector(sel);
const formatCurrency = (n) => n.toLocaleString('zh-Hant');
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ─── Global State ───────────────────────────────
const state = {
  uid: null,
  jobs: [],       // { id, name, type, rate }
  records: [],    // { id, jobId, date, units }
  startDate: '',
  endDate: '',
};

// Active Firestore unsubscribe functions
let unsubJobs = null;
let unsubRecords = null;

// ─── DOM References ─────────────────────────────
const elStartDate    = $('#startDate');
const elEndDate      = $('#endDate');
const elTotalIncome  = $('#totalIncome');
const elJobName      = $('#jobName');
const elJobType      = $('#jobType');
const elJobRate      = $('#jobRate');
const elRecordJob    = $('#recordJob');
const elRecordDate   = $('#recordDate');
const elRecordUnits  = $('#recordUnits');
const elRecordUnitsLabel = $('#recordUnitsLabel');
const elJobList      = $('#jobList');
const elEmptyState   = $('#emptyState');
const elToast        = $('#toastContainer');
const elConfirmOverlay = $('#confirmOverlay');
const elConfirmMessage = $('#confirmMessage');
const elConfirmSub     = $('#confirmSub');
const elConfirmDelete  = $('#confirmDelete');
const elConfirmCancel  = $('#confirmCancel');
const elPrevMonth      = $('#prevMonth');
const elNextMonth      = $('#nextMonth');
const elMonthLabel     = $('#monthLabel');

// ─── Toast Notifications ────────────────────────
function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span><span>${message}</span>`;
  elToast.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove());
  }, 2200);
}

// ─── Validation ─────────────────────────────────
function clearErrors() {
  document.querySelectorAll('.error').forEach((el) => el.classList.remove('error'));
}

function markError(el) {
  el.classList.add('error');
  el.addEventListener('input', () => el.classList.remove('error'), { once: true });
  el.addEventListener('change', () => el.classList.remove('error'), { once: true });
}

// ─── Confirmation Dialog ─────────────────────────
let confirmCallback = null;

function showConfirm(message, sub, onConfirm) {
  elConfirmMessage.textContent = message;
  elConfirmSub.textContent = sub;
  confirmCallback = onConfirm;
  elConfirmOverlay.style.display = 'flex';
  elConfirmOverlay.classList.remove('closing');
}

function hideConfirm() {
  elConfirmOverlay.classList.add('closing');
  elConfirmOverlay.addEventListener('animationend', () => {
    elConfirmOverlay.style.display = 'none';
    elConfirmOverlay.classList.remove('closing');
  }, { once: true });
  confirmCallback = null;
}

elConfirmDelete.addEventListener('click', () => {
  if (confirmCallback) confirmCallback();
  hideConfirm();
});

elConfirmCancel.addEventListener('click', hideConfirm);

elConfirmOverlay.addEventListener('click', (e) => {
  if (e.target === elConfirmOverlay) hideConfirm();
});

// ─── Firestore Helpers ──────────────────────────
function jobsCol() {
  return collection(db, 'users', state.uid, 'jobs');
}

function recordsCol() {
  return collection(db, 'users', state.uid, 'records');
}

// ─── Firestore CRUD ─────────────────────────────
async function addJob(name, type, rate) {
  await addDoc(jobsCol(), {
    name,
    type,
    rate,
    createdAt: serverTimestamp(),
  });
}

async function addRecord(jobId, date, units) {
  await addDoc(recordsCol(), {
    jobId,
    date,
    units,
    createdAt: serverTimestamp(),
  });
}

async function removeJob(jobId) {
  // Delete the job document
  await deleteDoc(doc(db, 'users', state.uid, 'jobs', jobId));
  // Batch delete all records for this job
  const q = query(recordsCol());
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  snap.forEach((d) => {
    if (d.data().jobId === jobId) {
      batch.delete(d.ref);
    }
  });
  await batch.commit();
}

async function removeRecord(recordId) {
  await deleteDoc(doc(db, 'users', state.uid, 'records', recordId));
}

// ─── Delete Handlers (with UI) ──────────────────
function deleteJob(jobId) {
  const job = getJobById(jobId);
  if (!job) return;
  const recordCount = state.records.filter((r) => r.jobId === jobId).length;
  const sub = recordCount > 0
    ? `此操作將同時刪除該工作底下的 ${recordCount} 筆出勤紀錄，且無法復原。`
    : '此操作無法復原。';
  showConfirm(
    `確定要刪除「${job.name}」嗎？`,
    sub,
    async () => {
      try {
        await removeJob(jobId);
        toast(`已刪除工作「${job.name}」`);
      } catch (e) {
        toast('刪除失敗，請再試一次', 'error');
      }
    }
  );
}

function deleteRecord(recordId) {
  const el = document.querySelector(`[data-record-id="${recordId}"]`);
  if (el) {
    el.classList.add('removing');
    el.addEventListener('animationend', async () => {
      try {
        await removeRecord(recordId);
        toast('已刪除出勤紀錄');
      } catch (e) {
        toast('刪除失敗，請再試一次', 'error');
      }
    }, { once: true });
  } else {
    removeRecord(recordId).then(() => toast('已刪除出勤紀錄'));
  }
}

// ─── Core Calculation ───────────────────────────
function getJobById(id) {
  return state.jobs.find((j) => j.id === id);
}

function calcRecordIncome(record) {
  const job = getJobById(record.jobId);
  if (!job) return 0;
  return job.type === 'hourly' ? record.units * job.rate : job.rate;
}

function calcTotalIncome() {
  const start = state.startDate;
  const end = state.endDate;
  return state.records.reduce((sum, r) => {
    if (r.date >= start && r.date <= end) {
      return sum + calcRecordIncome(r);
    }
    return sum;
  }, 0);
}

// ─── Render: Dashboard ──────────────────────────
function renderDashboard() {
  const total = calcTotalIncome();
  const el = elTotalIncome;
  el.textContent = formatCurrency(total);
  el.classList.remove('animate-pop');
  void el.offsetWidth;
  el.classList.add('animate-pop');
}

// ─── Render: Record Job Dropdown ────────────────
function renderJobDropdown() {
  const current = elRecordJob.value;
  elRecordJob.innerHTML = '<option value="" disabled>請選擇工作</option>';
  state.jobs.forEach((job) => {
    const opt = document.createElement('option');
    opt.value = job.id;
    opt.textContent = job.name;
    elRecordJob.appendChild(opt);
  });
  if (state.jobs.some((j) => j.id === current)) {
    elRecordJob.value = current;
  } else {
    elRecordJob.value = '';
  }
  updateUnitsLabel();
}

// ─── Render: Job List & Records ─────────────────
function renderJobList() {
  if (state.jobs.length === 0) {
    elJobList.style.display = 'none';
    elEmptyState.style.display = 'block';
    return;
  }
  elJobList.style.display = 'flex';
  elEmptyState.style.display = 'none';

  elJobList.innerHTML = '';
  state.jobs.forEach((job) => {
    const records = state.records
      .filter((r) => r.jobId === job.id)
      .sort((a, b) => (b.date > a.date ? 1 : -1));

    const typeLabel = job.type === 'hourly' ? '時薪制' : '按次固定制';
    const badgeClass = job.type === 'hourly' ? 'badge-hourly' : 'badge-fixed';
    const rateLabel = job.type === 'hourly'
      ? `NT$${formatCurrency(job.rate)}/時`
      : `NT$${formatCurrency(job.rate)}/次`;

    const jobTotal = records.reduce((sum, r) => {
      if (r.date >= state.startDate && r.date <= state.endDate) {
        return sum + calcRecordIncome(r);
      }
      return sum;
    }, 0);

    const card = document.createElement('div');
    card.className = 'job-card';
    card.innerHTML = `
      <div class="job-card-header" role="button" tabindex="0" aria-expanded="false">
        <div class="job-card-info">
          <div class="job-card-name">${escapeHtml(job.name)}</div>
          <div class="job-card-meta">
            <span class="job-type-badge ${badgeClass}">${typeLabel}</span>
            <span class="job-card-rate">${rateLabel}</span>
          </div>
        </div>
        <div class="job-card-right">
          <span class="job-card-total">$${formatCurrency(jobTotal)}</span>
          <button class="btn-delete-job" data-delete-job="${job.id}" title="刪除工作">✕</button>
          <span class="chevron">▶</span>
        </div>
      </div>
      <div class="job-card-body">
        <div class="record-list">
          <div class="record-list-title">出勤紀錄</div>
          ${records.length === 0
            ? '<div class="no-records">尚無出勤紀錄</div>'
            : records.map((r) => {
                const income = calcRecordIncome(r);
                const unitLabel = job.type === 'hourly' ? `${r.units} 小時` : `${r.units} 次`;
                return `
                  <div class="record-item" data-record-id="${r.id}">
                    <div>
                      <div class="record-date">${r.date}</div>
                      <div class="record-detail">${unitLabel}</div>
                    </div>
                    <div class="job-card-right">
                      <div class="record-amount">+$${formatCurrency(income)}</div>
                      <button class="btn-delete-record" data-delete-record="${r.id}" title="刪除紀錄">✕</button>
                    </div>
                  </div>`;
              }).join('')
          }
        </div>
      </div>
    `;

    // Toggle expand
    const header = card.querySelector('.job-card-header');
    header.addEventListener('click', (e) => {
      if (e.target.closest('[data-delete-job]')) return;
      const expanded = card.classList.toggle('expanded');
      header.setAttribute('aria-expanded', expanded);
    });

    // Delete job
    card.querySelector('[data-delete-job]').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteJob(job.id);
    });

    // Delete record
    card.querySelectorAll('[data-delete-record]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteRecord(btn.dataset.deleteRecord);
      });
    });

    elJobList.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Update units label based on selected job ───
function updateUnitsLabel() {
  const job = getJobById(elRecordJob.value);
  if (job && job.type === 'fixed') {
    elRecordUnitsLabel.textContent = '次數';
    elRecordUnits.placeholder = '1';
    elRecordUnits.step = '1';
  } else {
    elRecordUnitsLabel.textContent = '時數';
    elRecordUnits.placeholder = '0';
    elRecordUnits.step = '0.5';
  }
}

// ─── Full Re-render ─────────────────────────────
function renderAll() {
  renderDashboard();
  renderJobDropdown();
  renderJobList();
}

// ─── Month Navigation Helpers ───────────────────
function getMonthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function formatMonthLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`;
}

function setMonth(year, month) {
  const d = new Date(year, month - 1, 1);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const range = getMonthRange(y, m);
  state.startDate = range.start;
  state.endDate = range.end;
  syncDateInputs();
  animateMonthLabel();
  renderDashboard();
  renderJobList();
}

function getCurrentViewMonth() {
  const d = new Date(state.startDate + 'T00:00:00');
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function syncDateInputs() {
  elStartDate.value = state.startDate;
  elEndDate.value = state.endDate;
}

function renderMonthLabel() {
  elMonthLabel.textContent = formatMonthLabel(state.startDate);
}

function animateMonthLabel() {
  renderMonthLabel();
  elMonthLabel.classList.remove('animate-slide');
  void elMonthLabel.offsetWidth;
  elMonthLabel.classList.add('animate-slide');
}

// ─── Event: Month Navigation ────────────────────
elPrevMonth.addEventListener('click', () => {
  const { year, month } = getCurrentViewMonth();
  setMonth(year, month - 1);
});

elNextMonth.addEventListener('click', () => {
  const { year, month } = getCurrentViewMonth();
  setMonth(year, month + 1);
});

elMonthLabel.addEventListener('click', () => {
  const now = new Date();
  setMonth(now.getFullYear(), now.getMonth() + 1);
});

// ─── Event: Date Range Change ───────────────────
elStartDate.addEventListener('change', () => {
  state.startDate = elStartDate.value;
  renderMonthLabel();
  renderDashboard();
  renderJobList();
});
elEndDate.addEventListener('change', () => {
  state.endDate = elEndDate.value;
  renderMonthLabel();
  renderDashboard();
  renderJobList();
});

// ─── Event: Add Job ─────────────────────────────
$('#addJobForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  let valid = true;
  const name = elJobName.value.trim();
  const type = elJobType.value;
  const rate = parseFloat(elJobRate.value);

  if (!name) { markError(elJobName); valid = false; }
  if (isNaN(rate) || rate < 0) { markError(elJobRate); valid = false; }

  if (!valid) {
    toast('請填寫所有必填欄位，金額不可為負數', 'error');
    return;
  }

  try {
    await addJob(name, type, rate);
    toast(`已新增工作「${name}」`);
    elJobName.value = '';
    elJobRate.value = '';
  } catch (e) {
    toast('新增失敗，請再試一次', 'error');
  }
});

// ─── Event: Add Record ──────────────────────────
$('#addRecordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors();

  let valid = true;
  const jobId = elRecordJob.value;
  const date = elRecordDate.value;
  const units = parseFloat(elRecordUnits.value);

  if (!jobId) { markError(elRecordJob); valid = false; }
  if (!date) { markError(elRecordDate); valid = false; }
  if (isNaN(units) || units <= 0) { markError(elRecordUnits); valid = false; }

  if (!valid) {
    toast('請完整填寫出勤資料', 'error');
    return;
  }

  try {
    await addRecord(jobId, date, units);
    const job = getJobById(jobId);
    const income = job.type === 'hourly' ? units * job.rate : job.rate;
    toast(`已記錄「${job.name}」出勤，收入 $${formatCurrency(income)}`);
    elRecordUnits.value = '';
  } catch (e) {
    toast('新增紀錄失敗，請再試一次', 'error');
  }
});

// ─── Event: Job type selection changes units label
elRecordJob.addEventListener('change', updateUnitsLabel);

// ─── Firestore Real-time Listeners ──────────────
function startListeners() {
  // Listen to jobs
  const jobsQuery = query(jobsCol(), orderBy('createdAt', 'asc'));
  unsubJobs = onSnapshot(jobsQuery, (snapshot) => {
    state.jobs = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    renderAll();
  }, (err) => {
    console.error('Jobs listener error:', err);
  });

  // Listen to records
  const recordsQuery = query(recordsCol(), orderBy('createdAt', 'asc'));
  unsubRecords = onSnapshot(recordsQuery, (snapshot) => {
    state.records = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    renderAll();
  }, (err) => {
    console.error('Records listener error:', err);
  });
}

function stopListeners() {
  if (unsubJobs) { unsubJobs(); unsubJobs = null; }
  if (unsubRecords) { unsubRecords(); unsubRecords = null; }
}

// ─── Init dates ─────────────────────────────────
function initDates() {
  const now = new Date();
  const range = getMonthRange(now.getFullYear(), now.getMonth() + 1);
  state.startDate = range.start;
  state.endDate = range.end;
  elStartDate.value = state.startDate;
  elEndDate.value = state.endDate;
  elRecordDate.value = todayStr();
  renderMonthLabel();
}

// ─── Auth Callbacks ─────────────────────────────
onLogin((user) => {
  state.uid = user.uid;
  state.jobs = [];
  state.records = [];
  initDates();
  startListeners();
});

onLogout(() => {
  stopListeners();
  state.uid = null;
  state.jobs = [];
  state.records = [];
});
