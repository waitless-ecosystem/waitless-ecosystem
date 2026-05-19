/**
 * KIOSK Management Script
 * Admin panel for creating, managing, and monitoring KIOSK accounts
 * Handles PIN management, activity logging, and reporting
 */

// Firebase Auth/DB are already initialized and available (loaded via `kiosk-db.js`).

// UI Elements
const messageEl = document.getElementById('message');
const tabButtons = document.querySelectorAll('.tab');
const tabs = document.querySelectorAll('[id$="-tab"]');
const newKioskBtn = document.getElementById('new-kiosk-btn');
const backBtn = document.getElementById('back-btn');
const orgSelectSuper = document.getElementById('org-select-super');
const kioskModal = document.getElementById('new-kiosk-modal');
const closeModalBtn = document.getElementById('close-modal');
const cancelModalBtn = document.getElementById('cancel-modal');
const newKioskForm = document.getElementById('new-kiosk-form');
const editKioskModal = document.getElementById('edit-kiosk-modal');
const closeEditModalBtn = document.getElementById('close-edit-modal');
const cancelEditModalBtn = document.getElementById('cancel-edit-modal');
const editKioskForm = document.getElementById('edit-kiosk-form');
const kioskContainer = document.getElementById('kiosks-container');
const totalKiosksEl = document.getElementById('total-kiosks');
const activeKiosksEl = document.getElementById('active-kiosks');
const totalTokensEl = document.getElementById('total-tokens');
const credentialsTableEl = document.getElementById('credentials-table');
const reportKioskSelect = document.getElementById('report-kiosk');
const generateReportBtn = document.getElementById('generate-report-btn');
const reportContainer = document.getElementById('report-container');
const filterActivityBtn = document.getElementById('filter-activity-btn');
const activityContainer = document.getElementById('activity-container');

// State
let currentUser = null;
let organizationId = null;
let kiosks = {};
let unsubscribeKiosks = null;

// ============================================================
// MESSAGE DISPLAY
// ============================================================

function showMessage(text, type = 'info', duration = 5000) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.classList.remove('hidden');

  if (duration > 0) {
    setTimeout(() => {
      messageEl.classList.add('hidden');
      messageEl.textContent = '';
    }, duration);
  }
}

// ============================================================
// AUTHENTICATION CHECK
// ============================================================

/**
 * Check authentication and load organization data
 */
auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  try {
    currentUser = user;
    organizationId = user.uid;

    // Verify user is approved
    const snap = await db.ref(`users/${organizationId}/role`).once('value');
    const role = snap.val();

    if (role !== 'approved' && role !== 'superadmin') {
      showMessage('You do not have permission to access this page', 'error');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 2000);
      return;
    }

    currentUser = user;
    initializeUI();

    if (role === 'superadmin') {
      // show org selector and allow picking any org to manage
      if (orgSelectSuper) orgSelectSuper.style.display = '';
      await loadOrganizationsForSuperadmin();
      // default: no organization selected until superadmin picks one
      kiosks = {};
      renderKiosks();
      updateStats();
    } else {
      organizationId = user.uid;
      await loadKiosks();
    }
  } catch (err) {
    console.error('Auth error:', err);
    showMessage('Authentication error: ' + err.message, 'error');
  }
});

// ============================================================
// UI INITIALIZATION
// ============================================================

function initializeUI() {
  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });

  // Modal handlers
  newKioskBtn.addEventListener('click', () => openModal(kioskModal));
  closeModalBtn.addEventListener('click', () => closeModal(kioskModal));
  cancelModalBtn.addEventListener('click', () => closeModal(kioskModal));
  closeEditModalBtn.addEventListener('click', () => closeModal(editKioskModal));
  cancelEditModalBtn.addEventListener('click', () => closeModal(editKioskModal));

  // Back button
  backBtn.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  // Superadmin org select
  if (orgSelectSuper) {
    orgSelectSuper.addEventListener('change', async () => {
      const orgId = orgSelectSuper.value || null;
      // unsubscribe previous listeners
      if (unsubscribeKiosks) { unsubscribeKiosks(); unsubscribeKiosks = null; }
      organizationId = orgId;
      if (!orgId) {
        kiosks = {};
        renderKiosks();
        updateStats();
        return;
      }
      await loadKiosks();
    });
  }

  // Forms
  newKioskForm.addEventListener('submit', handleCreateKiosk);
  editKioskForm.addEventListener('submit', handleEditKiosk);

  // Report actions
  generateReportBtn.addEventListener('click', handleGenerateReport);
  filterActivityBtn.addEventListener('click', handleFilterActivity);

  // Close modals on background click
  kioskModal.addEventListener('click', (e) => {
    if (e.target === kioskModal) closeModal(kioskModal);
  });
  editKioskModal.addEventListener('click', (e) => {
    if (e.target === editKioskModal) closeModal(editKioskModal);
  });
}

// ============================================================
// TAB MANAGEMENT
// ============================================================

function switchTab(tabName) {
  // Update active tab button
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update active tab content
  tabs.forEach(tab => {
    tab.classList.toggle('hidden', !tab.id.startsWith(tabName));
  });

  // Load tab-specific data
  if (tabName === 'credentials') {
    loadCredentialsTab();
  } else if (tabName === 'activity') {
    loadActivityTab();
  } else if (tabName === 'reports') {
    populateReportKioskSelect();
  }
}

// ============================================================
// KIOSK LOADING & DISPLAY
// ============================================================

/**
 * Load list of organizations for superadmin
 */
async function loadOrganizationsForSuperadmin(){
  if(!orgSelectSuper) return;
  orgSelectSuper.innerHTML = '';
  try{
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    const entries = Object.entries(users);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select organization...';
    orgSelectSuper.appendChild(placeholder);
    entries.forEach(([uid, profile])=>{
      const opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = (profile.organizationName || profile.name || profile.email || uid) + ' (' + (profile.role||'') + ')';
      orgSelectSuper.appendChild(opt);
    });
    orgSelectSuper.disabled = false;
  }catch(err){
    console.error('Failed to load organizations for superadmin', err);
    showMessage('Failed to load organizations: ' + err.message, 'error');
  }
}

/**
 * Load all KIOSKs for organization
 */
async function loadKiosks() {
  try {
    if (!organizationId) {
      showMessage('Please select an organization to manage', 'info');
      return;
    }

    // Set up real-time listener
    if (unsubscribeKiosks) { unsubscribeKiosks(); unsubscribeKiosks = null; }
    unsubscribeKiosks = kioskDB.listenKiosks(organizationId, (data) => {
      kiosks = data || {};
      renderKiosks();
      updateStats();
    });

    // Initial load
    kiosks = await kioskDB.getAllKiosks(organizationId);
    renderKiosks();
    updateStats();
  } catch (err) {
    console.error('Error loading KIOSKs:', err);
    showMessage('Failed to load KIOSKs: ' + err.message, 'error');
  }
}

/**
 * Render KIOSK cards
 */
function renderKiosks() {
  kioskContainer.innerHTML = '';

  const kioskList = Object.entries(kiosks);
  if (kioskList.length === 0) {
    kioskContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📱</div>
        <p>No KIOSKs created yet</p>
      </div>
    `;
    return;
  }

  kioskList.forEach(([kioskId, kiosk]) => {
    const card = createKioskCard(kioskId, kiosk);
    kioskContainer.appendChild(card);
  });
}

/**
 * Create KIOSK card element
 */
function createKioskCard(kioskId, kiosk) {
  const card = document.createElement('div');
  card.className = 'kiosk-card';

  const statusBadge = `
    <span class="status-badge status-${kiosk.status || 'active'}">
      ${kiosk.status === 'inactive' ? '⊘ Inactive' : '● Active'}
    </span>
  `;

  const tokensCount = kiosk.tokensGenerated || 0;
  const createdDate = kiosk.createdAt
    ? new Date(kiosk.createdAt).toLocaleDateString()
    : 'Unknown';

  card.innerHTML = `
    <div class="kiosk-card-header">
      <div class="kiosk-card-title">${escapeHtml(kiosk.name)}</div>
      ${statusBadge}
    </div>

    <div class="kiosk-card-info">
      <div class="info-row">
        <strong>Tokens Generated:</strong>
        <span>${tokensCount}</span>
      </div>
      <div class="info-row">
        <strong>Status:</strong>
        <span>${kiosk.status || 'active'}</span>
      </div>
      <div class="info-row">
        <strong>Created:</strong>
        <span>${createdDate}</span>
      </div>
      <div class="info-row">
        <strong>KIOSK ID:</strong>
        <span style="font-family: monospace; font-size: 11px;">${kioskId}</span>
      </div>
    </div>

    <div class="kiosk-card-actions">
      <button class="button button-secondary button-small" onclick="openEditKiosk('${escapeHtml(kioskId)}')">
        Edit
      </button>
      <button class="button button-danger button-small" onclick="deleteKiosk('${escapeHtml(kioskId)}')">
        Delete
      </button>
    </div>
  `;

  return card;
}

/**
 * Update statistics display
 */
function updateStats() {
  const kioskList = Object.entries(kiosks);
  const total = kioskList.length;
  const active = kioskList.filter(([_, k]) => k.status !== 'inactive').length;
  const tokens = kioskList.reduce((sum, [_, k]) => sum + (k.tokensGenerated || 0), 0);

  totalKiosksEl.textContent = total;
  activeKiosksEl.textContent = active;
  totalTokensEl.textContent = tokens;
}

// ============================================================
// KIOSK CRUD OPERATIONS
// ============================================================

/**
 * Handle create KIOSK form submission
 */
async function handleCreateKiosk(e) {
  e.preventDefault();

  const name = document.getElementById('kiosk-name').value.trim();
  const pin = document.getElementById('kiosk-pin').value;

  if (!name) {
    showMessage('KIOSK name is required', 'error');
    return;
  }

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    showMessage('PIN must be 4-6 digits', 'error');
    return;
  }

  try {
    const kioskId = await kioskDB.createKiosk(organizationId, name);
    await kioskAuthDB.createKioskUser(organizationId, kioskId, pin);

    showMessage('KIOSK created successfully', 'success');
    closeModal(kioskModal);
    newKioskForm.reset();
  } catch (err) {
    console.error('Error creating KIOSK:', err);
    showMessage('Failed to create KIOSK: ' + err.message, 'error');
  }
}

/**
 * Open edit KIOSK modal
 */
function openEditKiosk(kioskId) {
  const kiosk = kiosks[kioskId];
  if (!kiosk) {
    showMessage('KIOSK not found', 'error');
    return;
  }

  document.getElementById('edit-kiosk-id').value = kioskId;
  document.getElementById('edit-kiosk-name').value = kiosk.name;
  document.getElementById('edit-kiosk-description').value = kiosk.description || '';
  document.getElementById('edit-kiosk-status').value = kiosk.status || 'active';

  openModal(editKioskModal);
}

/**
 * Handle edit KIOSK form submission
 */
async function handleEditKiosk(e) {
  e.preventDefault();

  const kioskId = document.getElementById('edit-kiosk-id').value;
  const name = document.getElementById('edit-kiosk-name').value.trim();
  const description = document.getElementById('edit-kiosk-description').value.trim();
  const status = document.getElementById('edit-kiosk-status').value;

  if (!name) {
    showMessage('KIOSK name is required', 'error');
    return;
  }

  try {
    await kioskDB.updateKiosk(organizationId, kioskId, {
      name,
      description,
      status
    });

    showMessage('KIOSK updated successfully', 'success');
    closeModal(editKioskModal);
  } catch (err) {
    console.error('Error updating KIOSK:', err);
    showMessage('Failed to update KIOSK: ' + err.message, 'error');
  }
}

/**
 * Delete KIOSK
 */
async function deleteKiosk(kioskId) {
  if (!confirm('Are you sure you want to delete this KIOSK?')) {
    return;
  }

  try {
    await kioskDB.deleteKiosk(organizationId, kioskId);
    showMessage('KIOSK deleted successfully', 'success');
  } catch (err) {
    console.error('Error deleting KIOSK:', err);
    showMessage('Failed to delete KIOSK: ' + err.message, 'error');
  }
}

// ============================================================
// CREDENTIALS TAB
// ============================================================

/**
 * Load credentials tab
 */
function loadCredentialsTab() {
  credentialsTableEl.innerHTML = '';

  const kioskList = Object.entries(kiosks);
  if (kioskList.length === 0) {
    credentialsTableEl.innerHTML = `<tr><td colspan="4" class="empty-state">No KIOSKs available</td></tr>`;
    return;
  }

  kioskList.forEach(([kioskId, kiosk]) => {
    const row = document.createElement('tr');
    const createdDate = kiosk.createdAt
      ? new Date(kiosk.createdAt).toLocaleDateString()
      : 'Unknown';

    row.innerHTML = `
      <td>${escapeHtml(kiosk.name)}</td>
      <td><span class="status-badge status-${kiosk.status || 'active'}">
        ${kiosk.status === 'inactive' ? '⊘ Inactive' : '● Active'}
      </span></td>
      <td>${createdDate}</td>
      <td>
        <button class="button button-secondary button-small" onclick="openPinResetDialog('${escapeHtml(kioskId)}')">
          Reset PIN
        </button>
      </td>
    `;
    credentialsTableEl.appendChild(row);
  });
}

/**
 * Open PIN reset dialog
 */
function openPinResetDialog(kioskId) {
  const newPin = prompt('Enter new PIN (4-6 digits):');
  if (!newPin) return;

  if (!/^\d{4,6}$/.test(newPin)) {
    showMessage('PIN must be 4-6 digits', 'error');
    return;
  }

  resetKioskPin(kioskId, newPin);
}

/**
 * Reset KIOSK PIN
 */
async function resetKioskPin(kioskId, newPin) {
  try {
    const kioskUserId = `kiosk_${kioskId}`;
    await kioskAuthDB.updateKioskPin(kioskUserId, newPin);
    showMessage('PIN reset successfully', 'success');
  } catch (err) {
    console.error('Error resetting PIN:', err);
    showMessage('Failed to reset PIN: ' + err.message, 'error');
  }
}

// ============================================================
// ACTIVITY TAB
// ============================================================

/**
 * Load activity tab
 */
async function loadActivityTab() {
  try {
    const logs = await kioskTokenDB.getKioskActivityLogs(organizationId);
    renderActivityLogs(logs);
  } catch (err) {
    console.error('Error loading activity logs:', err);
    showMessage('Failed to load activity logs: ' + err.message, 'error');
  }
}

/**
 * Handle filter activity
 */
async function handleFilterActivity() {
  const startDate = new Date(document.getElementById('activity-start-date').value).getTime();
  const endDate = new Date(document.getElementById('activity-end-date').value).getTime();

  if (isNaN(startDate) || isNaN(endDate)) {
    showMessage('Please select both start and end dates', 'error');
    return;
  }

  try {
    const logs = await kioskTokenDB.getKioskActivityLogs(organizationId);
    const filtered = Object.fromEntries(
      Object.entries(logs).filter(([_, log]) => {
        return log.timestamp >= startDate && log.timestamp <= endDate;
      })
    );
    renderActivityLogs(filtered);
  } catch (err) {
    console.error('Error filtering activity:', err);
    showMessage('Failed to filter activity: ' + err.message, 'error');
  }
}

/**
 * Render activity logs
 */
function renderActivityLogs(logs) {
  const logList = Object.values(logs).sort((a, b) => b.timestamp - a.timestamp);

  if (logList.length === 0) {
    activityContainer.innerHTML = '<p class="empty-state">No activity logs</p>';
    return;
  }

  let html = '<table><thead><tr><th>Event</th><th>KIOSK</th><th>Time</th><th>Details</th></tr></thead><tbody>';

  logList.forEach(log => {
    const kioskName = kiosks[log.kioskId]?.name || log.kioskId;
    const eventType = log.eventType.replace(/_/g, ' ').toUpperCase();
    const time = new Date(log.timestamp).toLocaleString();

    html += `
      <tr>
        <td>${escapeHtml(eventType)}</td>
        <td>${escapeHtml(kioskName)}</td>
        <td>${time}</td>
        <td>${log.metadata?.tokenNumber ? `Token: ${log.metadata.tokenNumber}` : ''}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  activityContainer.innerHTML = html;
}

// ============================================================
// REPORTS TAB
// ============================================================

/**
 * Populate report KIOSK select
 */
function populateReportKioskSelect() {
  reportKioskSelect.innerHTML = '<option value="">All KIOSKs</option>';

  Object.entries(kiosks).forEach(([kioskId, kiosk]) => {
    const option = document.createElement('option');
    option.value = kioskId;
    option.textContent = kiosk.name;
    reportKioskSelect.appendChild(option);
  });
}

/**
 * Handle generate report
 */
async function handleGenerateReport() {
  const kioskId = reportKioskSelect.value || null;
  const reportDate = document.getElementById('report-date').value;

  if (!reportDate) {
    showMessage('Please select a date', 'error');
    return;
  }

  try {
    const startOfDay = new Date(reportDate).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    const report = await kioskReportingDB.getKioskReport(organizationId, {
      startDate: startOfDay,
      endDate: endOfDay,
      kioskId
    });

    renderReport(report, reportDate);
  } catch (err) {
    console.error('Error generating report:', err);
    showMessage('Failed to generate report: ' + err.message, 'error');
  }
}

/**
 * Render report
 */
function renderReport(report, date) {
  let html = `<h4>Report for ${date}</h4>`;
  html += '<table><thead><tr><th>KIOSK</th><th>Tokens Generated</th><th>Success Rate</th><th>Failed Attempts</th></tr></thead><tbody>';

  Object.entries(report).forEach(([kioskId, stats]) => {
    html += `
      <tr>
        <td>${escapeHtml(stats.kioskName)}</td>
        <td>${stats.tokensGeneratedPeriod}</td>
        <td>${stats.successRate}</td>
        <td>${stats.failedAttempts}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  reportContainer.innerHTML = html;
}

// ============================================================
// MODAL UTILITIES
// ============================================================

function openModal(modal) {
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// CLEANUP
// ============================================================

window.addEventListener('beforeunload', () => {
  if (unsubscribeKiosks) {
    unsubscribeKiosks();
  }
});
