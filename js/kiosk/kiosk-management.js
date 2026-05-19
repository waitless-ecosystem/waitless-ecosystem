/**
 * KIOSK Management Script v2 - Full CRUD, PIN Management, and Reporting
 */

const messageEl = document.getElementById('message');
const tabButtons = document.querySelectorAll('.tab');
const tabs = document.querySelectorAll('[id$="-tab"]');
const newKioskBtn = document.getElementById('new-kiosk-btn');
const backBtn = document.getElementById('back-btn');
const orgSelectSuper = document.getElementById('org-select-super');
const kioskModal = document.getElementById('new-kiosk-modal');
const editKioskModal = document.getElementById('edit-kiosk-modal');
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
const newKioskForm = document.getElementById('new-kiosk-form');
const editKioskForm = document.getElementById('edit-kiosk-form');

let currentUser = null;
let organizationId = null;
let kiosks = {};
let unsubscribeKiosks = null;
let reportChart = null;

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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openModal(modal) {
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modal) {
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

// ============================================================
// AUTHENTICATION
// ============================================================

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '../../index.html';
    return;
  }

  try {
    currentUser = user;
    const snap = await db.ref(`users/${user.uid}`).once('value');
    const profile = snap.val() || {};
    const role = profile.role;
    const isSuperadmin = await waitlessIsSuperadmin(user, profile);

    const canAccess = await waitlessCanAccessOrganizationTools(user, profile);
    if (!canAccess) {
      showMessage('You do not have permission to access this page', 'error');
      setTimeout(() => {
        window.location.href = '../dashboard.html';
      }, 2000);
      return;
    }

    initializeUI();

    if (role === 'superadmin' || isSuperadmin) {
      if (orgSelectSuper) orgSelectSuper.style.display = '';
      await loadOrganizationsForSuperadmin();
    } else {
      organizationId = user.uid;
      await loadKiosks();
    }
  } catch (err) {
    console.error('Auth error:', err);
    showMessage('Error: ' + err.message, 'error');
  }
});

// ============================================================
// UI INITIALIZATION
// ============================================================

function initializeUI() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  newKioskBtn.addEventListener('click', () => {
    if (!organizationId) {
      showMessage('Please select an organization first', 'error');
      return;
    }
    document.getElementById('kiosk-name').value = '';
    document.getElementById('kiosk-description').value = '';
    document.getElementById('kiosk-pin').value = '';
    openModal(kioskModal);
  });

  document.getElementById('close-modal').addEventListener('click', () => closeModal(kioskModal));
  document.getElementById('cancel-modal').addEventListener('click', () => closeModal(kioskModal));
  document.getElementById('close-edit-modal').addEventListener('click', () => closeModal(editKioskModal));
  document.getElementById('cancel-edit-modal').addEventListener('click', () => closeModal(editKioskModal));

  backBtn.addEventListener('click', () => {
    window.location.href = '../dashboard.html';
  });

  if (orgSelectSuper) {
    orgSelectSuper.addEventListener('change', async () => {
      organizationId = orgSelectSuper.value || null;
      if (unsubscribeKiosks) { unsubscribeKiosks(); unsubscribeKiosks = null; }
      if (!organizationId) {
        kiosks = {};
        renderKiosks();
        updateStats();
        return;
      }
      await loadKiosks();
    });
  }

  newKioskForm.addEventListener('submit', handleCreateKiosk);
  editKioskForm.addEventListener('submit', handleEditKiosk);

  generateReportBtn.addEventListener('click', handleGenerateReport);
  filterActivityBtn.addEventListener('click', handleFilterActivity);

  kioskModal.addEventListener('click', (e) => {
    if (e.target === kioskModal) closeModal(kioskModal);
  });
  editKioskModal.addEventListener('click', (e) => {
    if (e.target === editKioskModal) closeModal(editKioskModal);
  });
}

// ============================================================
// TAB SWITCHING
// ============================================================

function switchTab(tabName) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  tabs.forEach(tab => {
    tab.classList.toggle('hidden', !tab.id.startsWith(tabName));
  });

  if (tabName === 'credentials') {
    loadCredentialsTab();
  } else if (tabName === 'activity') {
    loadActivityTab();
  } else if (tabName === 'reports') {
    populateReportKioskSelect();
  }
}

// ============================================================
// LOAD ORGANIZATIONS
// ============================================================

async function loadOrganizationsForSuperadmin() {
  if (!orgSelectSuper) return;
  orgSelectSuper.innerHTML = '';
  try {
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    const entries = Object.entries(users)
      .filter(([_, profile]) => profile && profile.role === 'approved');

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select organization...';
    orgSelectSuper.appendChild(placeholder);

    entries.forEach(([uid, profile]) => {
      const opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = (profile.organizationName || profile.name || profile.email || uid);
      orgSelectSuper.appendChild(opt);
    });

    orgSelectSuper.disabled = false;

    if (entries.length > 0) {
      orgSelectSuper.value = entries[0][0];
      organizationId = entries[0][0];
      await loadKiosks();
    } else {
      kiosks = {};
      renderKiosks();
      updateStats();
      showMessage('No approved organizations found', 'info');
    }
  } catch (err) {
    console.error('Error loading organizations:', err);
    showMessage('Failed to load organizations: ' + err.message, 'error');
  }
}

// ============================================================
// KIOSK LOADING
// ============================================================

async function loadKiosks() {
  try {
    if (!organizationId) {
      showMessage('Please select an organization', 'info');
      return;
    }

    if (unsubscribeKiosks) { unsubscribeKiosks(); unsubscribeKiosks = null; }
    
    unsubscribeKiosks = kioskDB.listenKiosks(organizationId, (data) => {
      kiosks = data || {};
      renderKiosks();
      updateStats();
    });

    kiosks = await kioskDB.getAllKiosks(organizationId);
    renderKiosks();
    updateStats();
  } catch (err) {
    console.error('Error loading KIOSKs:', err);
    showMessage('Failed to load KIOSKs: ' + err.message, 'error');
  }
}

// ============================================================
// RENDER KIOSKS
// ============================================================

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
        <span class="kiosk-id-inline">${kioskId}</span>
      </div>
    </div>

    <div class="kiosk-card-actions">
      <button class="button button-secondary button-small" type="button" onclick="window.openEditKioskGlobal('${escapeHtml(kioskId)}')">
        Edit
      </button>
      <button class="button button-danger button-small" type="button" onclick="window.deleteKioskGlobal('${escapeHtml(kioskId)}')">
        Delete
      </button>
    </div>
  `;

  return card;
}

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
// CREATE KIOSK
// ============================================================

async function handleCreateKiosk(e) {
  e.preventDefault();

  const name = document.getElementById('kiosk-name').value.trim();
  const pin = document.getElementById('kiosk-pin').value.trim();

  if (!name) {
    showMessage('KIOSK name is required', 'error');
    return;
  }

  if (!pin || !/^\d{4,6}$/.test(pin)) {
    showMessage('PIN must be 4-6 digits', 'error');
    return;
  }

  if (!organizationId) {
    showMessage('Organization not selected', 'error');
    return;
  }

  try {
    showMessage('Creating KIOSK...', 'info', 0);
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

// ============================================================
// EDIT KIOSK
// ============================================================

window.openEditKioskGlobal = function(kioskId) {
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
};

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
    showMessage('Updating KIOSK...', 'info', 0);
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

// ============================================================
// DELETE KIOSK
// ============================================================

window.deleteKioskGlobal = async function(kioskId) {
  if (!confirm(`Delete KIOSK "${escapeHtml(kiosks[kioskId]?.name || kioskId)}"?`)) {
    return;
  }

  try {
    showMessage('Deleting KIOSK...', 'info', 0);
    await kioskDB.deleteKiosk(organizationId, kioskId);
    showMessage('KIOSK deleted successfully', 'success');
  } catch (err) {
    console.error('Error deleting KIOSK:', err);
    showMessage('Failed to delete KIOSK: ' + err.message, 'error');
  }
};

// ============================================================
// CREDENTIALS TAB (PIN MANAGEMENT)
// ============================================================

function loadCredentialsTab() {
  credentialsTableEl.innerHTML = '';

  const kioskList = Object.entries(kiosks);
  if (kioskList.length === 0) {
    credentialsTableEl.innerHTML = `<tr><td colspan="4" class="empty-state">No KIOSKs available</td></tr>`;
    return;
  }

  kioskList.forEach(([kioskId, kiosk]) => {
    const createdDate = kiosk.createdAt
      ? new Date(kiosk.createdAt).toLocaleDateString()
      : 'Unknown';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(kiosk.name)}</td>
      <td><span class="status-badge status-${kiosk.status || 'active'}">
        ${kiosk.status === 'inactive' ? '⊘ Inactive' : '● Active'}
      </span></td>
      <td>${createdDate}</td>
      <td>
        <button class="button button-secondary button-small" type="button" onclick="window.openPinResetDialog('${escapeHtml(kioskId)}')">
          Reset PIN
        </button>
      </td>
    `;
    credentialsTableEl.appendChild(row);
  });
}

window.openPinResetDialog = function(kioskId) {
  const kiosk = kiosks[kioskId];
  if (!kiosk) {
    showMessage('KIOSK not found', 'error');
    return;
  }

  const newPin = prompt(`Enter new PIN for "${escapeHtml(kiosk.name)}" (4-6 digits):`);
  if (!newPin) return;

  if (!/^\d{4,6}$/.test(newPin)) {
    showMessage('PIN must be 4-6 digits', 'error');
    return;
  }

  resetKioskPin(kioskId, newPin);
};

async function resetKioskPin(kioskId, newPin) {
  try {
    showMessage('Resetting PIN...', 'info', 0);
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

async function loadActivityTab() {
  try {
    if (!organizationId) {
      activityContainer.innerHTML = '<p class="empty-state">Select an organization</p>';
      return;
    }

    showMessage('Loading activity logs...', 'info', 0);
    const logs = await kioskTokenDB.getKioskActivityLogs(organizationId);
    renderActivityLogs(logs);
    showMessage('', 'info', 0);
  } catch (err) {
    console.error('Error loading activity logs:', err);
    showMessage('Failed to load activity logs: ' + err.message, 'error');
  }
}

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
    showMessage(`Filtered ${Object.keys(filtered).length} activities`, 'success', 3000);
  } catch (err) {
    console.error('Error filtering activity:', err);
    showMessage('Failed to filter activity: ' + err.message, 'error');
  }
}

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

function populateReportKioskSelect() {
  reportKioskSelect.innerHTML = '<option value="">All KIOSKs</option>';

  Object.entries(kiosks).forEach(([kioskId, kiosk]) => {
    const option = document.createElement('option');
    option.value = kioskId;
    option.textContent = kiosk.name;
    reportKioskSelect.appendChild(option);
  });
}

async function handleGenerateReport() {
  const kioskId = reportKioskSelect.value || null;
  const reportDate = document.getElementById('report-date').value;

  if (!reportDate) {
    showMessage('Please select a date', 'error');
    return;
  }

  if (!organizationId) {
    showMessage('Organization not selected', 'error');
    return;
  }

  try {
    showMessage('Generating report...', 'info', 0);
    const startOfDay = new Date(reportDate).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    const report = await kioskReportingDB.getKioskReport(organizationId, {
      startDate: startOfDay,
      endDate: endOfDay,
      kioskId
    });

    renderReport(report, reportDate);
    showMessage('Report generated', 'success');
  } catch (err) {
    console.error('Error generating report:', err);
    showMessage('Failed to generate report: ' + err.message, 'error');
  }
}

function renderReport(report, date) {
  const reportData = Object.entries(report);
  const safeDate = escapeHtml(String(date));

  if (reportData.length === 0) {
    reportContainer.innerHTML = `<p class="empty-state">No data for ${safeDate}</p>`;
    return;
  }

  // Table
  let html = `<h4>Report for ${safeDate}</h4>`;
  html += '<table><thead><tr><th>KIOSK</th><th>Tokens</th><th>Success Rate</th><th>Failed</th></tr></thead><tbody>';

  reportData.forEach(([kioskId, stats]) => {
    html += `
      <tr>
        <td>${escapeHtml(stats.kioskName)}</td>
        <td>${stats.tokensGeneratedPeriod}</td>
        <td>${stats.successRate}</td>
        <td>${stats.failedAttempts}</td>
      </tr>
    `;
  });

  html += '</tbody></table><div id="report-chart-container" style="margin-top: 20px;"><canvas id="report-chart"></canvas></div>';
  reportContainer.innerHTML = html;

  // Chart
  const canvasEl = document.getElementById('report-chart');
  if (canvasEl && reportData.length > 0) {
    if (reportChart) reportChart.destroy();
    
    const labels = reportData.map(([_, s]) => s.kioskName);
    const tokens = reportData.map(([_, s]) => s.tokensGeneratedPeriod);
    const failed = reportData.map(([_, s]) => s.failedAttempts);

    reportChart = new Chart(canvasEl, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Tokens Generated',
            data: tokens,
            backgroundColor: '#4f6bed',
            borderColor: '#415fdd',
            borderWidth: 1
          },
          {
            label: 'Failed Attempts',
            data: failed,
            backgroundColor: '#ea5b76',
            borderColor: '#d9415e',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top' }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }
}

// ============================================================
// CLEANUP
// ============================================================

window.addEventListener('beforeunload', () => {
  if (unsubscribeKiosks) {
    unsubscribeKiosks();
  }
  if (reportChart) {
    reportChart.destroy();
  }
});
