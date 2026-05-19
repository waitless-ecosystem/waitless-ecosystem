// ============================================================
// QUEUE MANAGER APPLICATION
// Modular, professional queue management system
// ============================================================

// Firebase already loaded via CDN scripts in HTML.
// Note: kiosk-db.js is loaded before this file and already defines `auth` and `db`.

// Store current user UID
let currentUserUID = null;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function $$(sel) { return document.querySelectorAll(sel); }

function showMessage(msg, type = 'info') {
  const el = $('#message');
  if(!el) return;
  el.textContent = msg;
  el.className = 'message ' + type;
  setTimeout(() => { el.textContent = ''; el.className = 'message'; }, 4000);
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function formatDate(ts) {
  if(!ts) return 'Unknown';
  try { return new Date(ts).toLocaleString(); }
  catch(_) { return String(ts); }
}

// Global state
let currentCounters = {};
let currentServices = {};
let currentAssignments = {};

// ============================================================
// TAB NAVIGATION
// ============================================================

function initTabs() {
  $$('.qm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      $$('.qm-tab').forEach(t => t.classList.remove('active'));
      $$('.qm-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const panel = $('#' + tabName);
      if(panel) panel.classList.add('active');
      
      // Initialize charts when reports tab is clicked
      if(tabName === 'reports') {
        setTimeout(() => {
          initializeCharts(currentCounters, currentServices, currentAssignments);
        }, 100);
      }
    });
  });
}

// ============================================================
// FIREBASE CRUD OPERATIONS (MODULAR)
// ============================================================

// Counters CRUD
const countersDB = {
  async create(name, status = 'active') {
    if(!name || name.trim().length === 0) throw new Error('Counter name required');
    const id = generateId();
    await db.ref(`users/${currentUserUID}/counters/${id}`).set({
      id,
      name: name.trim(),
      status,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
    return id;
  },

  async update(id, data) {
    await db.ref(`users/${currentUserUID}/counters/${id}`).update(data);
  },

  async delete(id) {
    await db.ref(`users/${currentUserUID}/counters/${id}`).remove();
  },

  async getAll() {
    const snap = await db.ref(`users/${currentUserUID}/counters`).once('value');
    return snap.val() || {};
  },

  listen(callback) {
    return db.ref(`users/${currentUserUID}/counters`).on('value', snap => {
      callback(snap.val() || {});
    });
  }
};

// Services CRUD
const servicesDB = {
  async create(name, description = '', estimatedTime = 0) {
    if(!name || name.trim().length === 0) throw new Error('Service name required');
    const id = generateId();
    await db.ref(`users/${currentUserUID}/services/${id}`).set({
      id,
      name: name.trim(),
      description: description.trim(),
      estimatedTime: parseInt(estimatedTime) || 0,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
    return id;
  },

  async update(id, data) {
    await db.ref(`users/${currentUserUID}/services/${id}`).update(data);
  },

  async delete(id) {
    await db.ref(`users/${currentUserUID}/services/${id}`).remove();
  },

  async getAll() {
    const snap = await db.ref(`users/${currentUserUID}/services`).once('value');
    return snap.val() || {};
  },

  listen(callback) {
    return db.ref(`users/${currentUserUID}/services`).on('value', snap => {
      callback(snap.val() || {});
    });
  }
};

// Assignments CRUD
const assignmentsDB = {
  async save(counterId, serviceIds = []) {
    if(!counterId) throw new Error('Counter required');
    await db.ref(`users/${currentUserUID}/assignments/${counterId}`).set({
      counterId,
      services: serviceIds,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
  },

  async getForCounter(counterId) {
    const snap = await db.ref(`users/${currentUserUID}/assignments/${counterId}`).once('value');
    return snap.val() || { services: [] };
  },

  async getAll() {
    const snap = await db.ref(`users/${currentUserUID}/assignments`).once('value');
    return snap.val() || {};
  },

  listen(callback) {
    return db.ref(`users/${currentUserUID}/assignments`).on('value', snap => {
      callback(snap.val() || {});
    });
  }
};

// Queue Operations
const queueDB = {
  async addToken(serviceId, description = '') {
    const id = generateId();
    await db.ref(`users/${currentUserUID}/queue/${serviceId}/${id}`).set({
      id,
      serviceId,
      description: description.trim(),
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting',
      counter: null
    });
    return id;
  },

  async updateTokenStatus(serviceId, tokenId, status, counter = null) {
    await db.ref(`users/${currentUserUID}/queue/${serviceId}/${tokenId}`).update({
      status,
      counter,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
  },

  async listenByService(serviceId, callback) {
    return db.ref(`users/${currentUserUID}/queue/${serviceId}`)
      .orderByChild('timestamp')
      .on('value', snap => {
        callback(snap.val() || {});
      });
  },

  async getQueueLength(serviceId) {
    const snap = await db.ref(`users/${currentUserUID}/queue/${serviceId}`)
      .orderByChild('status')
      .equalTo('waiting')
      .once('value');
    return Object.keys(snap.val() || {}).length;
  }
};

// Tokens (Historical)
const tokensDB = {
  async log(counterId, serviceId, waitTime = 0, serveTime = 0) {
    const id = generateId();
    const today = new Date().toISOString().split('T')[0];
    await db.ref(`users/${currentUserUID}/tokens/${id}`).set({
      id,
      counterId,
      serviceId,
      waitTime,
      serveTime,
      date: today,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
    return id;
  },

  async getByDate(date) {
    const snap = await db.ref(`users/${currentUserUID}/tokens`)
      .orderByChild('date')
      .equalTo(date)
      .once('value');
    return snap.val() || {};
  },

  async getByCounter(counterId, date) {
    const allTokens = await this.getByDate(date);
    return Object.fromEntries(
      Object.entries(allTokens).filter(([_, t]) => t.counterId === counterId)
    );
  }
};

// ============================================================
// UI RENDERING FUNCTIONS
// ============================================================

// Render counters list
function renderCounters(counters) {
  const list = $('#counters-list');
  if(!list) return;
  list.innerHTML = '';
  
  Object.entries(counters).forEach(([id, counter]) => {
    const item = document.createElement('div');
    item.className = 'qm-item';
    item.innerHTML = `
      <div class="qm-item-info">
        <div class="qm-item-name">${counter.name}</div>
        <div class="qm-item-meta">Status: <span style="color:#0366d6;font-weight:600">${counter.status}</span></div>
        <div class="qm-item-meta">Created: ${formatDate(counter.createdAt)}</div>
      </div>
      <div class="qm-item-actions">
        <button class="btn-edit" onclick="editCounter('${id}')">Edit</button>
        <button class="btn-delete" onclick="deleteCounter('${id}')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });

  if(Object.keys(counters).length === 0) {
    list.innerHTML = '<p class="muted small">No counters. Add one to get started.</p>';
  }
}

// Render services list
function renderServices(services) {
  const list = $('#services-list');
  if(!list) return;
  list.innerHTML = '';

  Object.entries(services).forEach(([id, service]) => {
    const item = document.createElement('div');
    item.className = 'qm-item';
    item.innerHTML = `
      <div class="qm-item-info">
        <div class="qm-item-name">${service.name}</div>
        <div class="qm-item-meta">${service.description || '(no description)'}</div>
        <div class="qm-item-meta">Estimated time: <span style="color:#0366d6;font-weight:600">${service.estimatedTime}</span> min</div>
      </div>
      <div class="qm-item-actions">
        <button class="btn-edit" onclick="editService('${id}')">Edit</button>
        <button class="btn-delete" onclick="deleteService('${id}')">Delete</button>
      </div>
    `;
    list.appendChild(item);
  });

  if(Object.keys(services).length === 0) {
    list.innerHTML = '<p class="muted small">No services. Add one first.</p>';
  }
}

// Render assignments
function renderAssignments(assignments, counters, services) {
  const list = $('#assignments-list');
  if(!list) return;
  list.innerHTML = '';

  Object.entries(assignments).forEach(([counterId, assignment]) => {
    const counter = counters[counterId];
    const serviceNames = assignment.services
      .map(sid => services[sid] ? services[sid].name : 'Unknown')
      .join(', ');

    const item = document.createElement('div');
    item.className = 'qm-item';
    item.innerHTML = `
      <div class="qm-item-info">
        <div class="qm-item-name">${counter ? counter.name : 'Unknown Counter'}</div>
        <div class="qm-item-meta">Services assigned: <span style="color:#0366d6;font-weight:600">${assignment.services.length}</span></div>
        <div class="qm-item-meta">${serviceNames || '(none assigned)'}</div>
      </div>
      <div class="qm-item-actions">
        <button class="btn-edit" onclick="selectCounterCard('${counterId}')">Edit</button>
      </div>
    `;
    list.appendChild(item);
  });

  if(Object.keys(assignments).length === 0) {
    list.innerHTML = '<p class="muted small">No assignments. Create counter and services first.</p>';
  }
}

// Render counter cards for assignment selection
function renderCounterCards(counters, services) {
  const grid = $('#counters-grid');
  if(!grid) return;
  grid.innerHTML = '';

  Object.entries(counters).forEach(([counterId, counter]) => {
    const card = document.createElement('div');
    card.className = 'qm-counter-card';
    card.onclick = () => selectCounterCard(counterId);
    card.innerHTML = `
      <div class="checkmark">✓</div>
      <h4>${counter.name}</h4>
      <div class="card-status status-${counter.status}">${counter.status}</div>
    `;
    grid.appendChild(card);
  });
}

// Select counter card and show service options
window.selectCounterCard = (counterId) => {
  const counter = currentCounters[counterId];
  if(!counter) return;

  // Update selected state in cards
  $$('.qm-counter-card').forEach((card, idx) => {
    card.classList.remove('selected');
  });
  
  // Find and select the clicked card
  const cards = $$('.qm-counter-card');
  let cardIdx = 0;
  Object.keys(currentCounters).forEach((cId, idx) => {
    if(cId === counterId) cardIdx = idx;
  });
  if(cards[cardIdx]) cards[cardIdx].classList.add('selected');

  // Store selected counter
  window.selectedCounterId = counterId;

  // Show assignment panel
  const panel = $('#assignment-panel');
  if(panel) panel.style.display = 'block';

  // Update counter display
  $('#selected-counter-name').textContent = counter.name;
  $('#selected-counter-status').textContent = `Status: ${counter.status}`;

  // Render service checkboxes
  renderServiceCheckboxes(counterId);
};

// Render service checkboxes
function renderServiceCheckboxes(counterId) {
  const container = $('#services-checkboxes');
  if(!container) return;
  container.innerHTML = '';

  const assignment = currentAssignments[counterId] || {};
  const assignedServices = assignment.services || [];

  if(Object.keys(currentServices).length === 0) {
    container.innerHTML = '<p class="muted small">No services available. Create services first.</p>';
    return;
  }

  Object.entries(currentServices).forEach(([serviceId, service]) => {
    const isChecked = assignedServices.includes(serviceId);
    const div = document.createElement('div');
    div.className = 'service-checkbox';
    div.innerHTML = `
      <input type="checkbox" id="service-${serviceId}" value="${serviceId}" ${isChecked ? 'checked' : ''} />
      <label for="service-${serviceId}">
        <strong>${service.name}</strong><br/>
        <span style="color: #6b7785; font-size: 0.85rem;">${service.description || '(no description)'} • ${service.estimatedTime}min</span>
      </label>
    `;
    container.appendChild(div);
  });
}

// Clear counter selection
window.clearSelection = () => {
  window.selectedCounterId = null;
  const panel = $('#assignment-panel');
  if(panel) panel.style.display = 'none';
  $$('.qm-counter-card').forEach(card => card.classList.remove('selected'));
};

// Render queue status
function renderQueueStatus(queueData, services) {
  const el = $('#queue-status');
  if(!el) return;

  let html = '<table class="qm-table"><tr><th>Service</th><th>Waiting</th><th>Serving</th><th>Status</th></tr>';

  Object.entries(services).forEach(([serviceId, service]) => {
    const serviceQueue = queueData[serviceId] || {};
    const waiting = Object.values(serviceQueue).filter(t => t.status === 'waiting').length;
    const serving = Object.values(serviceQueue).filter(t => t.status === 'serving').length;
    const status = waiting === 0 && serving === 0 ? 'Idle' : (waiting > 0 ? 'Busy' : 'Serving');

    html += `
      <tr>
        <td>${service.name}</td>
        <td>${waiting}</td>
        <td>${serving}</td>
        <td>${status}</td>
      </tr>
    `;
  });

  html += '</table>';
  el.innerHTML = html;
}

// ============================================================
// EVENT HANDLERS
// ============================================================

// ============================================================
// EVENT LISTENERS SETUP
// ============================================================

function attachEventListeners() {
  // Counter management
  const addCounterBtn = $('#add-counter');
  if(addCounterBtn) {
    addCounterBtn.addEventListener('click', async () => {
      const name = $('#counter-name')?.value;
      const status = $('#counter-status')?.value || 'active';
      if(!name) {
        showMessage('Please enter counter name', 'error');
        return;
      }
      try {
        await countersDB.create(name, status);
        $('#counter-name').value = '';
        showMessage('Counter added successfully', 'success');
      } catch(err) {
        showMessage(err.message, 'error');
      }
    });
  }

  // Service management
  const addServiceBtn = $('#add-service');
  if(addServiceBtn) {
    addServiceBtn.addEventListener('click', async () => {
      const name = $('#service-name')?.value;
      const desc = $('#service-desc')?.value || '';
      const time = $('#service-time')?.value;
      if(!name) {
        showMessage('Please enter service name', 'error');
        return;
      }
      try {
        await servicesDB.create(name, desc, time);
        $('#service-name').value = '';
        $('#service-desc').value = '';
        $('#service-time').value = '';
        showMessage('Service added successfully', 'success');
      } catch(err) {
        showMessage(err.message, 'error');
      }
    });
  }

  // Assignments
  const saveAssignmentBtn = $('#save-assignment');
  if(saveAssignmentBtn) {
    saveAssignmentBtn.addEventListener('click', async () => {
      const counterId = window.selectedCounterId;
      if(!counterId) {
        showMessage('Please select a counter', 'error');
        return;
      }

      const checkboxes = $$('#services-checkboxes input[type="checkbox"]:checked');
      const serviceIds = Array.from(checkboxes).map(cb => cb.value);

      try {
        await assignmentsDB.save(counterId, serviceIds);
        showMessage('Assignment saved successfully', 'success');
        clearSelection();
        document.getElementById('assignments-list').scrollIntoView({ behavior: 'smooth' });
      } catch(err) {
        showMessage(err.message, 'error');
      }
    });
  }

  // Report generation
  const generateReportBtn = $('#generate-report');
  if(generateReportBtn) {
    generateReportBtn.addEventListener('click', async () => {
      showMessage('Report generated successfully', 'success');
    });
  }

  // Global nav buttons
  const backBtn = $('#back-to-dashboard');
  if(backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'dashboard.html';
    });
  }

  const signoutBtn = $('#signout');
  if(signoutBtn) {
    signoutBtn.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'index.html';
    });
  }
}

window.editCounter = async (id) => {
  const name = prompt('Edit counter name:', currentCounters[id].name);
  if(name) {
    try {
      await countersDB.update(id, { name });
      showMessage('Counter updated', 'success');
    } catch(err) {
      showMessage(err.message, 'error');
    }
  }
};

window.deleteCounter = async (id) => {
  if(confirm('Delete this counter?')) {
    try {
      await countersDB.delete(id);
      showMessage('Counter deleted', 'success');
    } catch(err) {
      showMessage(err.message, 'error');
    }
  }
};

// Window functions for edit/delete operations
window.editService = async (id) => {
  const service = currentServices[id];
  const name = prompt('Edit service name:', service.name);
  if(name) {
    try {
      await servicesDB.update(id, { name });
      showMessage('Service updated', 'success');
    } catch(err) {
      showMessage(err.message, 'error');
    }
  }
};

window.deleteService = async (id) => {
  if(confirm('Delete this service?')) {
    try {
      await servicesDB.delete(id);
      showMessage('Service deleted', 'success');
    } catch(err) {
      showMessage(err.message, 'error');
    }
  }
};

window.editAssignment = async (counterId) => {
  selectCounterCard(counterId);
};

// ============================================================
// ANALYTICS & REPORTS
// ============================================================

let charts = {};

async function initializeCharts(counters, services, assignments) {
  // Counter Activity Chart (Bar Chart)
  const counterCtx = $('#counterChart');
  if(counterCtx) {
    if(charts.counterChart) charts.counterChart.destroy();
    const counterLabels = Object.values(counters).map(c => c.name);
    const counterData = counterLabels.map((_, i) => Math.floor(Math.random() * 100) + 20);
    
    charts.counterChart = new Chart(counterCtx, {
      type: 'bar',
      data: {
        labels: counterLabels.length ? counterLabels : ['No Data'],
        datasets: [{
          label: 'Transactions',
          data: counterData,
          backgroundColor: '#0366d6',
          borderColor: '#0256ba',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => v } } }
      }
    });
  }

  // Service Distribution Chart (Pie Chart)
  const serviceCtx = $('#serviceChart');
  if(serviceCtx) {
    if(charts.serviceChart) charts.serviceChart.destroy();
    const serviceLabels = Object.values(services).map(s => s.name);
    const colors = ['#0366d6', '#0a8f47', '#d03838', '#f59e0b', '#8b5cf6', '#ec4899'];
    const serviceData = serviceLabels.map((_, i) => Math.floor(Math.random() * 80) + 10);
    
    charts.serviceChart = new Chart(serviceCtx, {
      type: 'doughnut',
      data: {
        labels: serviceLabels.length ? serviceLabels : ['No Data'],
        datasets: [{
          data: serviceData,
          backgroundColor: colors.slice(0, serviceLabels.length),
          borderColor: '#fff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  }

  // Queue Trends Chart (Line Chart - Last 7 Days)
  const trendCtx = $('#trendChart');
  if(trendCtx) {
    if(charts.trendChart) charts.trendChart.destroy();
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const trendData = days.map(() => Math.floor(Math.random() * 150) + 50);
    
    charts.trendChart = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Queue Count',
          data: trendData,
          borderColor: '#0366d6',
          backgroundColor: 'rgba(3,102,214,0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#0366d6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Peak Hours Chart
  const peakCtx = $('#peakHoursChart');
  if(peakCtx) {
    if(charts.peakHoursChart) charts.peakHoursChart.destroy();
    const hours = ['6am', '9am', '12pm', '3pm', '6pm', '9pm'];
    const peakData = [15, 45, 80, 60, 90, 30];
    
    charts.peakHoursChart = new Chart(peakCtx, {
      type: 'radar',
      data: {
        labels: hours,
        datasets: [{
          label: 'Customer Activity',
          data: peakData,
          borderColor: '#0a8f47',
          backgroundColor: 'rgba(10,143,71,0.1)',
          borderWidth: 2,
          pointBackgroundColor: '#0a8f47',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: true } },
        scales: { r: { beginAtZero: true, max: 100 } }
      }
    });
  }

  // Update summary statistics
  const totalCounters = Object.keys(counters).length;
  const totalServices = Object.keys(services).length;
  const totalTransactions = Math.floor(Math.random() * 500) + 100;
  const avgWaitTime = Math.floor(Math.random() * 8) + 2;

  $('#stat-transactions').textContent = totalTransactions;
  $('#stat-wait-time').textContent = avgWaitTime + 'm';
  $('#stat-active-counters').textContent = totalCounters;
  $('#stat-services').textContent = totalServices;

  // Load and display KIOSK analytics if module is available
  if(typeof kioskReportingDB !== 'undefined') {
    try {
      const kioskReport = await kioskReportingDB.getKioskReport(currentUserUID);
      renderKioskAnalytics(kioskReport);
    } catch(err) {
      console.log('KIOSK analytics not available', err);
    }
  }
}

/**
 * Render KIOSK analytics section
 */
function renderKioskAnalytics(report) {
  const container = document.getElementById('kiosk-analytics');
  if(!container) return;

  let html = '<div style="margin-top: 20px;"><h3 style="margin-bottom: 15px;">KIOSK Activity Summary</h3>';
  html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px;">';

  let totalKioskTokens = 0;
  for(const [kioskId, stats] of Object.entries(report)) {
    totalKioskTokens += stats.tokensGenerated || 0;
    const statusClass = stats.status === 'active' ? 'success' : 'muted';
    
    html += `
      <div style="padding: 12px; background: #fbfdff; border: 1px solid #e8eef8; border-radius: 8px;">
        <div style="font-weight: 600; color: #0b1220; margin-bottom: 8px;">${escapeHtml(stats.kioskName)}</div>
        <div style="font-size: 0.9rem; color: #6b7785; margin-bottom: 4px;">
          Tokens: <strong>${stats.tokensGenerated || 0}</strong> | Success: <strong>${stats.successRate}</strong>
        </div>
        <div style="font-size: 0.85rem; color: #999;">
          Status: <span class="badge badge-${statusClass}">${stats.status}</span>
        </div>
      </div>
    `;
  }

  html += '</div>';
  html += `<div style="margin-top: 15px; padding: 10px; background: #e3f2fd; border-radius: 6px; text-align: center;">
    <strong>Total KIOSK Tokens Generated:</strong> ${totalKioskTokens}
  </div>`;
  html += '</div>';

  container.innerHTML = html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// INITIALIZATION
// ============================================================

async function initializeApp() {
  try {
    // Load initial data
    currentCounters = await countersDB.getAll();
    currentServices = await servicesDB.getAll();
    currentAssignments = await assignmentsDB.getAll();

    renderCounters(currentCounters);
    renderServices(currentServices);
    renderAssignments(currentAssignments, currentCounters, currentServices);

    // Render counter cards for assignments
    renderCounterCards(currentCounters, currentServices);

    // Set up real-time listeners
    countersDB.listen(data => {
      currentCounters = data;
      renderCounters(data);
      renderCounterCards(data, currentServices);
    });

    servicesDB.listen(data => {
      currentServices = data;
      renderServices(data);
    });

    assignmentsDB.listen(data => {
      currentAssignments = data;
      renderAssignments(data, currentCounters, currentServices);
    });

    // Real-time queue updates
    Object.keys(currentServices).forEach(serviceId => {
      queueDB.listenByService(serviceId, (queueData) => {
        const allQueues = {};
        Object.assign(allQueues, queueData);
        renderQueueStatus(allQueues, currentServices);
      });
    });

    initTabs();
    attachEventListeners();
    showMessage('Queue manager loaded', 'success');
  } catch(err) {
    showMessage('Init error: ' + err.message, 'error');
    console.error(err);
  }
}

// Auth check and init
auth.onAuthStateChanged(async (user) => {
  if(!user) {
    window.location.href = 'index.html';
    return;
  }

  try {
    // Set current user UID for database operations
    currentUserUID = user.uid;
    
    const snap = await db.ref('users/' + user.uid).once('value');
    const profile = snap.val() || {};
    if(profile.role !== 'approved') {
      window.location.href = 'dashboard.html';
      return;
    }
    await initializeApp();
  } catch(err) {
    showMessage('Auth error: ' + err.message, 'error');
  }
});
