// ============================================================
// DASHBOARD COMMAND CENTER — Real-time analytics engine
// ============================================================

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function showMessage(msg, type) {
  const el = $('#message');
  if (!el) return;
  el.textContent = msg;
  el.className = 'message ' + type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatDateValue(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function getProfileField(profile, key) {
  return profile?.profile?.[key] || profile?.[key] || '';
}

// ============================================================
// MOBILE SIDEBAR TOGGLE
// ============================================================
(function initSidebar() {
  const toggle = $('#mobile-toggle');
  const sidebar = $('#dash-sidebar');
  if (!toggle || !sidebar) return;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'dash-sidebar-overlay';
  document.body.appendChild(overlay);

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);
})();

// ============================================================
// ORG INFO TOGGLE
// ============================================================
(function initOrgToggle() {
  const btn = $('#org-toggle');
  const details = $('#org-details');
  if (!btn || !details) return;
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', !expanded);
    details.style.display = expanded ? 'none' : 'block';
  });
})();

// ============================================================
// LIVE CLOCK
// ============================================================
(function initClock() {
  const el = $('#dash-clock');
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
})();

// ============================================================
// DATA STORE (in-memory cache for real-time data)
// ============================================================
const store = {
  services: {},
  counters: {},
  assignments: {},
  queueData: {},     // full queue: { serviceId: { tokenId: token } }
  tokens: {},        // historical tokens
  kiosks: {},
  uid: null
};

// ============================================================
// MAIN AUTH + DATA BINDING
// ============================================================
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '../index.html';
    return;
  }
  await initDashboard(user);
});

async function initDashboard(user) {
  store.uid = user.uid;

  // Load profile and check approval
  try {
    const snap = await db.ref('users/' + user.uid).once('value');
    const profile = snap.val() || {};
    const role = profile.role || 'unknown';

    renderOrgInfo(user, profile, role);

    if (role !== 'approved' && role !== 'admin') {
      showMessage('Your account is not yet approved. Dashboard features are limited.', 'error');
      return;
    }

    // Set up real-time listeners
    setupRealtimeListeners(user.uid);

<<<<<<< Updated upstream
    const queueBtn = $('#back-queue');
    const signoutBtn = $('#signout');

    if (canAccess && queueBtn) {
      queueBtn.style.display = 'block';
      queueBtn.addEventListener('click', () => {
        window.location.href = 'queue-manager.html';
      });
    }

=======
    // Set up date picker for day summary
    setupDatePicker(user.uid);

    // Render organization QR card
    renderOrganizationQr(user.uid);

    // Sign out
    const signoutBtn = $('#signout');
>>>>>>> Stashed changes
    if (signoutBtn) {
      signoutBtn.addEventListener('click', async () => {
        await auth.signOut();
        window.location.href = '../index.html';
      });
    }

  } catch (err) {
    showMessage('Error loading dashboard: ' + err.message, 'error');
  }
}

// ============================================================
// ORG INFO RENDER
// ============================================================
function renderOrgInfo(user, profile, role) {
  const nestedProfile = profile.profile || {};
  const email = profile.email || user.email || 'no-email';
  const organizationName = getProfileField(profile, 'name') || getProfileField(profile, 'organizationName') || profile.displayName || user.displayName || email;
  const contactNumber = getProfileField(profile, 'contactNumber') || 'N/A';
  const address = getProfileField(profile, 'address') || 'N/A';
  const registeredAt = profile.createdAt || nestedProfile.updatedAt || user.metadata.creationTime;

  // Short name
  const nameEl = $('#org-name-short');
  if (nameEl) nameEl.textContent = organizationName.length > 20 ? organizationName.slice(0, 18) + '…' : organizationName;

  let statusBadge = 'Unknown';
  let statusClass = '';
  if (role === 'approved') { statusBadge = 'Approved'; statusClass = 'badge-approved'; }
  else if (role === 'pending') { statusBadge = 'Pending Review'; statusClass = 'badge-pending'; }
  else if (role === 'rejected') { statusBadge = 'Rejected'; statusClass = 'badge-rejected'; }

  const statusEl = $('#status-info');
  if (statusEl) {
    statusEl.innerHTML = `
      <div class="status-badge ${statusClass}">${statusBadge}</div>
      <div class="status-content">
        <div class="status-row">
          <div class="status-label">Organization:</div>
          <div class="status-value">${escapeHtml(organizationName)}</div>
        </div>
        <div class="status-row">
          <div class="status-label">Email:</div>
          <div class="status-value">${escapeHtml(email)}</div>
        </div>
        <div class="status-row">
          <div class="status-label">Contact:</div>
          <div class="status-value">${escapeHtml(contactNumber)}</div>
        </div>
        <div class="status-row">
          <div class="status-label">Address:</div>
          <div class="status-value">${escapeHtml(address)}</div>
        </div>
        <div class="status-row">
          <div class="status-label">ID:</div>
          <div class="status-value">${user.uid.substring(0, 12)}…</div>
        </div>
        <div class="status-row">
          <div class="status-label">Since:</div>
          <div class="status-value">${formatDateValue(registeredAt)}</div>
        </div>
      </div>
    `;
  }
}

// ============================================================
// REAL-TIME LISTENERS
// ============================================================
function setupRealtimeListeners(uid) {
  // Services
  db.ref(`users/${uid}/services`).on('value', snap => {
    store.services = snap.val() || {};
    const el = $('#stat-services-count');
    if (el) el.textContent = Object.keys(store.services).length;
    refreshAll();
  });

  // Counters
  db.ref(`users/${uid}/counters`).on('value', snap => {
    store.counters = snap.val() || {};
    const el = $('#stat-counters-count');
    if (el) el.textContent = Object.keys(store.counters).length;
    refreshAll();
  });

  // Kiosks
  db.ref(`users/${uid}/kiosks`).on('value', snap => {
    store.kiosks = snap.val() || {};
    const el = $('#stat-kiosks-count');
    if (el) el.textContent = Object.keys(store.kiosks).length;
  });

  // Assignments
  db.ref(`users/${uid}/assignments`).on('value', snap => {
    store.assignments = snap.val() || {};
    refreshAll();
  });

  // Queue (live tokens)
  db.ref(`users/${uid}/queue`).on('value', snap => {
    store.queueData = snap.val() || {};
    refreshAll();
  });

  // Historical tokens
  db.ref(`users/${uid}/tokens`).on('value', snap => {
    store.tokens = snap.val() || {};
    refreshDaySummary();
  });
}

// ============================================================
// REFRESH ALL PANELS
// ============================================================
function refreshAll() {
  updateLiveQueueCount();
  renderLiveQueueTable();
  renderServiceCustomerCards();
  renderWarnings();
  renderCounterPerformance();
  renderQueueAlerts();
}

// ============================================================
// LIVE QUEUE COUNT (stat card)
// ============================================================
function updateLiveQueueCount() {
  let count = 0;
  Object.values(store.queueData).forEach(serviceQueue => {
    Object.values(serviceQueue || {}).forEach(token => {
      if (token.status === 'waiting' || token.status === 'serving') count++;
    });
  });
  const el = $('#stat-live-queue-count');
  if (el) el.textContent = count;
}

// ============================================================
// LIVE QUEUE TABLE
// ============================================================
function renderLiveQueueTable() {
  const tbody = $('#live-queue-tbody');
  const badge = $('#queue-total-badge');
  if (!tbody) return;

  const allTokens = [];
  const now = Date.now();

  Object.entries(store.queueData).forEach(([serviceId, serviceQueue]) => {
    Object.entries(serviceQueue || {}).forEach(([tokenId, token]) => {
      if (token.status === 'waiting' || token.status === 'serving') {
        const service = store.services[serviceId] || store.services[token.serviceId] || {};
        const counterName = token.assignedCounterName || findCounterName(token.assignedCounterId) || '—';
        const waitMs = now - (token.timestamp || now);
        const waitMin = Math.max(0, Math.round(waitMs / 60000));
        const estimatedTime = Number(token.serviceEstimatedTime || service.estimatedTime || 15);

        allTokens.push({
          tokenNumber: token.tokenNumber || tokenId,
          serviceName: token.serviceName || service.name || serviceId,
          counterName,
          status: token.status || 'waiting',
          waitMin,
          estimatedTime,
          customerName: token.customerName || '—',
          timestamp: token.timestamp || 0
        });
      }
    });
  });

  allTokens.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  if (badge) badge.textContent = allTokens.length + ' token' + (allTokens.length !== 1 ? 's' : '');

  if (allTokens.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="dash-table-empty">No active tokens in queue</td></tr>';
    return;
  }

  tbody.innerHTML = allTokens.map(t => {
    const statusClass = 'dash-status dash-status-' + t.status;
    let waitClass = 'dash-wait-ok';
    if (t.waitMin > t.estimatedTime) waitClass = 'dash-wait-danger';
    else if (t.waitMin > t.estimatedTime * 0.7) waitClass = 'dash-wait-warn';

    return `<tr>
      <td><span class="dash-token-num">${escapeHtml(t.tokenNumber)}</span></td>
      <td>${escapeHtml(t.serviceName)}</td>
      <td>${escapeHtml(t.counterName)}</td>
      <td><span class="${statusClass}">${t.status}</span></td>
      <td><span class="dash-wait-time ${waitClass}">${t.waitMin}m</span></td>
      <td>${escapeHtml(t.customerName)}</td>
    </tr>`;
  }).join('');
}

function findCounterName(counterId) {
  if (!counterId) return null;
  const counter = store.counters[counterId];
  return counter ? (counter.name || counter.counterName || counterId) : counterId;
}

// ============================================================
// CUSTOMERS PER SERVICE
// ============================================================
function renderServiceCustomerCards() {
  const container = $('#service-customer-cards');
  if (!container) return;

  const serviceIds = Object.keys(store.services);
  if (serviceIds.length === 0) {
    container.innerHTML = '<div class="dash-empty-state">No services configured</div>';
    return;
  }

  container.innerHTML = serviceIds.map(serviceId => {
    const service = store.services[serviceId];
    const serviceQueue = store.queueData[serviceId] || {};
    const tokens = Object.values(serviceQueue);
    const waiting = tokens.filter(t => t.status === 'waiting').length;
    const serving = tokens.filter(t => t.status === 'serving').length;

    return `<div class="dash-svc-card">
      <div class="dash-svc-name">${escapeHtml(service.name || serviceId)}</div>
      <div class="dash-svc-counts">
        <div class="dash-svc-count-item">
          <div class="dash-svc-count-val waiting">${waiting}</div>
          <div class="dash-svc-count-lbl">Waiting</div>
        </div>
        <div class="dash-svc-count-item">
          <div class="dash-svc-count-val serving">${serving}</div>
          <div class="dash-svc-count-lbl">Serving</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// WARNINGS PANEL
// Compares actual wait time vs service estimated time
// ============================================================
function renderWarnings() {
  const section = $('#warnings-section');
  const list = $('#warnings-list');
  const countBadge = $('#warning-count');
  if (!section || !list) return;

  const warnings = [];
  const now = Date.now();

  Object.entries(store.queueData).forEach(([serviceId, serviceQueue]) => {
    const service = store.services[serviceId] || {};
    const estimatedTime = Number(service.estimatedTime || 15);
    const tokens = Object.values(serviceQueue || {});
    const waitingTokens = tokens.filter(t => t.status === 'waiting');

    if (waitingTokens.length === 0) return;

    // Find max actual wait time among waiting tokens
    let maxWaitMin = 0;
    let totalWaitMin = 0;
    waitingTokens.forEach(t => {
      const waitMs = now - (t.timestamp || now);
      const waitMin = Math.max(0, Math.round(waitMs / 60000));
      totalWaitMin += waitMin;
      if (waitMin > maxWaitMin) maxWaitMin = waitMin;
    });

    const avgWaitMin = Math.round(totalWaitMin / waitingTokens.length);

    if (maxWaitMin > estimatedTime) {
      // Suggest a rounded-up time
      const suggestedTime = Math.ceil(maxWaitMin / 5) * 5; // Round to nearest 5 minutes
      warnings.push({
        serviceName: service.name || serviceId,
        currentEstimate: estimatedTime,
        actualMax: maxWaitMin,
        actualAvg: avgWaitMin,
        suggested: suggestedTime
      });
    }
  });

  if (warnings.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  if (countBadge) countBadge.textContent = warnings.length;

  list.innerHTML = warnings.map(w => `
    <div class="dash-warning-item">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div>
        <strong>${escapeHtml(w.serviceName)}</strong>: Actual wait is <strong>${w.actualMax} min</strong> (avg ${w.actualAvg} min), exceeding current estimate of <strong>${w.currentEstimate} min</strong>.
        <span class="dash-warning-suggest">→ Update estimate to ${w.suggested} min</span>
      </div>
    </div>
  `).join('');
}

// ============================================================
// COUNTER PERFORMANCE
// ============================================================
function renderCounterPerformance() {
  const tbody = $('#counter-perf-tbody');
  if (!tbody) return;

  const counterIds = Object.keys(store.counters);
  if (counterIds.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="dash-table-empty">No counters configured</td></tr>';
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  // Count tokens per counter from historical data (today)
  const counterStats = {};
  counterIds.forEach(id => { counterStats[id] = { served: 0, totalServeTime: 0 }; });

  Object.values(store.tokens).forEach(token => {
    if (token.date === today && token.counterId && counterStats[token.counterId]) {
      counterStats[token.counterId].served++;
      counterStats[token.counterId].totalServeTime += Number(token.serveTime || 0);
    }
  });

  // Build counter → currently serving token and waiting count from live queue
  const counterLive = {};
  counterIds.forEach(id => { counterLive[id] = { currentlyServing: null, waiting: 0 }; });

  Object.values(store.queueData).forEach(serviceQueue => {
    Object.values(serviceQueue || {}).forEach(token => {
      const cid = token.assignedCounterId;
      if (!cid || !counterLive[cid]) return;
      if (token.status === 'serving') {
        counterLive[cid].currentlyServing = token.tokenNumber || token.id || '—';
      }
      if (token.status === 'waiting') {
        counterLive[cid].waiting++;
      }
    });
  });

  tbody.innerHTML = counterIds.map(counterId => {
    const counter = store.counters[counterId];
    const name = counter.name || counter.counterName || counterId;
    const status = counter.status || 'active';
    const stats = counterStats[counterId];
    const live = counterLive[counterId];
    const avgServe = stats.served > 0 ? Math.round(stats.totalServeTime / stats.served) : 0;

    const statusClass = status === 'active' ? 'dash-counter-active' : 'dash-counter-inactive';

    return `<tr>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td><span class="dash-counter-status ${statusClass}">${status}</span></td>
      <td>${live.currentlyServing ? '<span class="dash-token-num">' + escapeHtml(live.currentlyServing) + '</span>' : '<span style="color:var(--waitless-muted)">—</span>'}</td>
      <td>${live.waiting}</td>
      <td><strong>${stats.served}</strong></td>
      <td>${avgServe > 0 ? avgServe + 'm' : '—'}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// QUEUE ALERTS
// Alert when counter gets overloaded
// ============================================================
function renderQueueAlerts() {
  const section = $('#alerts-section');
  const list = $('#alerts-list');
  const countBadge = $('#alert-count');
  if (!section || !list) return;

  const counterIds = Object.keys(store.counters);
  if (counterIds.length === 0) {
    section.style.display = 'none';
    return;
  }

  // Count waiting tokens per counter
  const counterWaiting = {};
  counterIds.forEach(id => { counterWaiting[id] = 0; });

  Object.values(store.queueData).forEach(serviceQueue => {
    Object.values(serviceQueue || {}).forEach(token => {
      if (token.status === 'waiting' && token.assignedCounterId && counterWaiting.hasOwnProperty(token.assignedCounterId)) {
        counterWaiting[token.assignedCounterId]++;
      }
    });
  });

  const counts = Object.values(counterWaiting);
  const totalWaiting = counts.reduce((a, b) => a + b, 0);
  const avgWaiting = counterIds.length > 0 ? totalWaiting / counterIds.length : 0;

  const alerts = [];
  counterIds.forEach(counterId => {
    const waiting = counterWaiting[counterId];
    const counter = store.counters[counterId];
    const name = counter.name || counter.counterName || counterId;

    // Alert if: has >= 3 waiting AND is >= 2x average
    if (waiting >= 3 && (avgWaiting === 0 || waiting >= avgWaiting * 2)) {
      alerts.push({ name, waiting, avg: Math.round(avgWaiting) });
    }
  });

  if (alerts.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  if (countBadge) countBadge.textContent = alerts.length;

  list.innerHTML = alerts.map(a => `
    <div class="dash-alert-item">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
      <div>
        <strong>${escapeHtml(a.name)}</strong> is overloaded with <strong>${a.waiting} waiting tokens</strong> (avg across counters: ${a.avg}).
        Consider redistributing services or activating additional counters.
      </div>
    </div>
  `).join('');
}

// ============================================================
// DAY SUMMARY
// ============================================================
function setupDatePicker(uid) {
  const dateInput = $('#summary-date');
  const prevBtn = $('#date-prev');
  const nextBtn = $('#date-next');
  if (!dateInput) return;

  // Default to today
  const today = new Date().toISOString().split('T')[0];
  dateInput.value = today;

  dateInput.addEventListener('change', () => refreshDaySummary());

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const d = new Date(dateInput.value);
      d.setDate(d.getDate() - 1);
      dateInput.value = d.toISOString().split('T')[0];
      refreshDaySummary();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const d = new Date(dateInput.value);
      d.setDate(d.getDate() + 1);
      dateInput.value = d.toISOString().split('T')[0];
      refreshDaySummary();
    });
  }

  // Initial render
  refreshDaySummary();
}

function refreshDaySummary() {
  const dateInput = $('#summary-date');
  if (!dateInput) return;
  const selectedDate = dateInput.value;
  if (!selectedDate) return;

  // Filter historical tokens by date
  const dayTokens = Object.values(store.tokens).filter(t => t.date === selectedDate);

  // Total tokens
  const totalEl = $('#sum-total-tokens');
  if (totalEl) totalEl.textContent = dayTokens.length;

  // Avg wait time
  const waitTimes = dayTokens.map(t => Number(t.waitTime || 0)).filter(v => v > 0);
  const avgWait = waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0;
  const avgWaitEl = $('#sum-avg-wait');
  if (avgWaitEl) avgWaitEl.textContent = avgWait > 0 ? avgWait + 'm' : '0m';

  // Avg serve time
  const serveTimes = dayTokens.map(t => Number(t.serveTime || 0)).filter(v => v > 0);
  const avgServe = serveTimes.length > 0 ? Math.round(serveTimes.reduce((a, b) => a + b, 0) / serveTimes.length) : 0;
  const avgServeEl = $('#sum-avg-serve');
  if (avgServeEl) avgServeEl.textContent = avgServe > 0 ? avgServe + 'm' : '0m';

  // Overall peak hour
  const peakHour = computePeakHour(dayTokens);
  const peakEl = $('#sum-peak-hour');
  if (peakEl) peakEl.textContent = peakHour || '—';

  // Peak hours per counter
  renderPeakHoursTable(dayTokens, selectedDate);
}

function computePeakHour(tokens) {
  if (tokens.length === 0) return null;
  const hourCounts = {};
  tokens.forEach(t => {
    if (!t.timestamp) return;
    const hour = new Date(t.timestamp).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  let maxHour = null;
  let maxCount = 0;
  Object.entries(hourCounts).forEach(([h, c]) => {
    if (c > maxCount) { maxCount = c; maxHour = Number(h); }
  });

  if (maxHour === null) return null;
  return formatHourRange(maxHour);
}

function formatHourRange(hour) {
  const start = hour % 12 || 12;
  const end = (hour + 1) % 12 || 12;
  const startAmPm = hour < 12 ? 'AM' : 'PM';
  const endAmPm = (hour + 1) < 12 || (hour + 1) === 24 ? 'AM' : 'PM';
  return `${start}${startAmPm} – ${end}${endAmPm}`;
}

function renderPeakHoursTable(dayTokens, selectedDate) {
  const tbody = $('#peak-hours-tbody');
  if (!tbody) return;

  const counterIds = Object.keys(store.counters);
  if (counterIds.length === 0 || dayTokens.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="dash-table-empty">No data for this date</td></tr>';
    return;
  }

  // Group tokens by counter
  const counterTokens = {};
  counterIds.forEach(id => { counterTokens[id] = []; });

  dayTokens.forEach(t => {
    if (t.counterId && counterTokens[t.counterId]) {
      counterTokens[t.counterId].push(t);
    }
  });

  const rows = counterIds.map(counterId => {
    const counter = store.counters[counterId];
    const name = counter.name || counter.counterName || counterId;
    const tokens = counterTokens[counterId];
    const totalServed = tokens.length;

    if (totalServed === 0) {
      return `<tr>
        <td><strong>${escapeHtml(name)}</strong></td>
        <td style="color:var(--waitless-muted)">—</td>
        <td style="color:var(--waitless-muted)">0</td>
        <td>0</td>
      </tr>`;
    }

    // Compute peak hour for this counter
    const hourCounts = {};
    tokens.forEach(t => {
      if (!t.timestamp) return;
      const hour = new Date(t.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    let peakHour = null;
    let peakCount = 0;
    Object.entries(hourCounts).forEach(([h, c]) => {
      if (c > peakCount) { peakCount = c; peakHour = Number(h); }
    });

    const peakLabel = peakHour !== null ? formatHourRange(peakHour) : '—';

    return `<tr>
      <td><strong>${escapeHtml(name)}</strong></td>
      <td>${peakLabel}</td>
      <td><strong>${peakCount}</strong></td>
      <td>${totalServed}</td>
    </tr>`;
  }).join('');

  tbody.innerHTML = rows;
}

// Auto-refresh wait times every 30 seconds
setInterval(() => {
  renderLiveQueueTable();
  renderWarnings();
}, 30000);

function getMobileAppUrl(orgId) {
  const url = new URL('../customer/index.html', window.location.href);
  if (orgId) {
    url.searchParams.set('orgId', orgId);
  }
  return url.toString();
}

function renderOrganizationQr(orgId) {
  const qrEl = $('#org-qr-code');
  const urlEl = $('#org-qr-url');
  const copyBtn = $('#copy-org-qr-link');
  if (!qrEl || !urlEl) return;

  const mobileUrl = getMobileAppUrl(orgId);
  urlEl.textContent = mobileUrl;
  qrEl.innerHTML = '';

  if (window.QRCode) {
    new QRCode(qrEl, {
      text: mobileUrl,
      width: 180,
      height: 180,
      colorDark: '#0b1220',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    qrEl.innerHTML = `<a href="${mobileUrl}">${mobileUrl}</a>`;
  }

  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = 'true';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(mobileUrl);
        showMessage('Mobile app link copied', 'success');
      } catch (err) {
        showMessage('Unable to copy mobile link', 'error');
      }
    });
  }
}
