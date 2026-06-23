if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

function $(sel) { return document.querySelector(sel); }

function showMessage(msg, type) {
  let wrap = $('#toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = msg;
  wrap.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

function formatDate(ts) {
  if (!ts) return 'Unknown date';
  try { return new Date(ts).toLocaleString(); }
  catch (_) { return String(ts); }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[c]));
}

function getProfileRole(profile) {
  return String(profile?.role || '').trim().toLowerCase();
}

function isApprovedOrganization(profile) {
  return getProfileRole(profile) === 'approved';
}

function isPendingRequest(profile) {
  return getProfileRole(profile) === 'pending';
}

function getOrganizationTitle(uid, profile) {
  return profile?.profile?.name || profile?.displayName || profile?.organizationName || profile?.name || profile?.email || uid;
}

function getOrganizationSubtitle(uid, profile) {
  const email = profile?.email || 'no-email';
  return `${email} · ${uid}`;
}

function getOrganizationContact(profile) {
  return profile?.profile?.contactNumber || profile?.phone || profile?.phoneNumber || profile?.contactPhone || profile?.organizationPhone || profile?.contact || '';
}

function getOrganizationAddress(profile) {
  return profile?.profile?.address || profile?.address || '';
}

function getOrganizationEmail(profile) {
  return profile?.email || '';
}

function getKioskCount(profile) {
  return Object.keys(profile?.kiosks || {}).length || Number(profile?.tokensGenerated || 0) || 0;
}

function renderApprovedOrganizationCard(uid, profile) {
  const card = document.createElement('button');
  card.className = 'org-card';
  card.type = 'button';

  const header = document.createElement('div');
  header.className = 'org-card-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'org-card-title-wrap';
  const title = document.createElement('h3');
  const orgName = profile?.profile?.name || profile?.displayName || profile?.organizationName || profile?.name || '';
  const email = getOrganizationEmail(profile);
  title.textContent = orgName || email || uid;
  const subtitle = document.createElement('p');
  subtitle.className = 'org-card-subtitle';
  subtitle.textContent = orgName ? '' : (email || uid);
  titleWrap.appendChild(title);
  if (subtitle.textContent) titleWrap.appendChild(subtitle);

  const status = document.createElement('span');
  const isDisabled = !!profile?.settings?.disabled;
  status.className = 'org-status-pill' + (isDisabled ? ' org-status-pill--disabled' : '');
  status.textContent = isDisabled ? 'Disabled' : 'Active';

  header.appendChild(titleWrap);
  header.appendChild(status);

  card.appendChild(header);
  card.addEventListener('click', () => openOrgManagePanel(uid, profile));
  return card;
}

let currentManagedOrgId = null;

function getOrgManageEls() {
  return {
    modal: $('#org-manage-modal'),
    panel: $('#org-manage-panel'),
    backdrop: $('#org-manage-backdrop'),
    title: $('#org-manage-title'),
    meta: $('#org-manage-meta'),
    closeBtn: $('#org-manage-close'),
    summaryCounters: $('#org-summary-counters'),
    summaryServices: $('#org-summary-services'),
    toggleDisableBtn: $('#org-toggle-disable'),
    nameInput: $('#org-name-input'),
    contactInput: $('#org-contact-input'),
    addressInput: $('#org-address-input'),
    profileSaveBtn: $('#org-profile-save'),
    prefixInput: $('#org-prefix-input'),
    prefixSaveBtn: $('#org-prefix-save'),
    kioskNameInput: $('#kiosk-name-input'),
    kioskPinInput: $('#kiosk-pin-input'),
    kioskAddBtn: $('#kiosk-add-btn'),
    kioskList: $('#kiosk-list')
  };
}

function findOrganizationWithTokenPrefix(prefix, excludeOrgId) {
  const entries = Object.entries(dashboardUsersCache || {});
  return entries.find(([uid, profile]) => {
    if (uid === excludeOrgId) return false;
    const existing = String(profile?.settings?.tokenPrefix || '').trim().toUpperCase();
    return existing && existing === prefix;
  });
}

function normalizePrefixInput(prefix) {
  if (!prefix) return '';
  if (tokenFactory?.normalizeTokenPrefix) return tokenFactory.normalizeTokenPrefix(prefix);
  return String(prefix).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function openOrgManagePanel(orgId, profile) {
  const els = getOrgManageEls();
  if (!els.panel) return;

  let freshProfile = dashboardUsersCache?.[orgId] || profile || {};
  try {
    const snap = await db.ref(`users/${orgId}`).once('value');
    freshProfile = snap.val() || freshProfile || {};
  } catch (err) {
    console.log('Failed to load org profile for manage panel', err);
  }

  currentManagedOrgId = orgId;
  els.modal?.classList.remove('hidden');
  els.modal?.setAttribute('aria-hidden', 'false');
  if (els.title) els.title.textContent = getOrganizationTitle(orgId, freshProfile);
  if (els.meta) {
    const email = getOrganizationEmail(freshProfile);
    els.meta.textContent = email ? `${email} · ${orgId}` : `UID: ${orgId}`;
  }

  if (els.nameInput) els.nameInput.value = freshProfile?.profile?.name || freshProfile?.displayName || freshProfile?.organizationName || '';
  if (els.contactInput) els.contactInput.value = getOrganizationContact(freshProfile) || '';
  if (els.addressInput) els.addressInput.value = getOrganizationAddress(freshProfile) || '';
  if (els.prefixInput) els.prefixInput.value = freshProfile?.settings?.tokenPrefix || '';

  await Promise.all([
    loadOrgSummary(orgId),
    loadOrgKiosks(orgId)
  ]);

  await refreshDisableButton(orgId);
  els.panel.focus?.();
}

async function refreshDisableButton(orgId) {
  const els = getOrgManageEls();
  if (!els.toggleDisableBtn) return;
  const snap = await db.ref(`users/${orgId}/settings/disabled`).once('value');
  const disabled = !!snap.val();
  els.toggleDisableBtn.textContent = disabled ? 'Enable Organization' : 'Temporarily Disable';
  els.toggleDisableBtn.dataset.disabled = disabled ? 'true' : 'false';
}

async function loadOrgSummary(orgId) {
  const els = getOrgManageEls();
  if (!els.summaryCounters || !els.summaryServices) return;
  try {
    const [countersSnap, servicesSnap] = await Promise.all([
      db.ref(`users/${orgId}/counters`).once('value'),
      db.ref(`users/${orgId}/services`).once('value')
    ]);
    const counters = countersSnap.val() || {};
    const services = servicesSnap.val() || {};
    els.summaryCounters.textContent = String(Object.keys(counters).length);
    els.summaryServices.textContent = String(Object.keys(services).length);
  } catch (err) {
    els.summaryCounters.textContent = '0';
    els.summaryServices.textContent = '0';
  }
}

function generateKioskId() {
  return 'KIOSK_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function hashPin(pin) {
  return 'hash_' + String(pin).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

async function loadOrgKiosks(orgId) {
  const els = getOrgManageEls();
  if (!els.kioskList) return;
  els.kioskList.innerHTML = '';
  const snap = await db.ref(`users/${orgId}/kiosks`).once('value');
  const kiosks = snap.val() || {};

  const entries = Object.entries(kiosks);
  if (entries.length === 0) {
    els.kioskList.innerHTML = '<p class="muted small">No kiosks yet.</p>';
    return;
  }

  entries.forEach(([kioskId, kiosk]) => {
    const row = document.createElement('div');
    row.className = 'kiosk-row';
    const nameCell = document.createElement('div');
    nameCell.textContent = kiosk?.name || kioskId;
    const statusCell = document.createElement('div');
    statusCell.textContent = kiosk?.status || 'active';
    const actions = document.createElement('div');
    actions.className = 'kiosk-row-actions';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'ghost';
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset PIN';
    resetBtn.addEventListener('click', async () => {
      const newPin = window.prompt('Enter new 4-6 digit PIN');
      if (!newPin) return;
      if (!/^\d{4,6}$/.test(newPin)) {
        showMessage('PIN must be 4-6 digits', 'error');
        return;
      }
      try {
        await db.ref(`kioskUsers/kiosk_${kioskId}/pinHash`).set(hashPin(newPin));
        showMessage('Kiosk PIN updated', 'success');
      } catch (err) {
        showMessage('Failed to update PIN: ' + err.message, 'error');
      }
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'reject-btn';
    removeBtn.type = 'button';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', async () => {
      if (!confirm('Remove this kiosk?')) return;
      try {
        await db.ref(`users/${orgId}/kiosks/${kioskId}`).remove();
        await db.ref(`kioskUsers/kiosk_${kioskId}/status`).set('inactive');
        showMessage('Kiosk removed', 'success');
        await loadOrgKiosks(orgId);
      } catch (err) {
        showMessage('Failed to remove kiosk: ' + err.message, 'error');
      }
    });

    actions.appendChild(resetBtn);
    actions.appendChild(removeBtn);

    row.appendChild(nameCell);
    row.appendChild(statusCell);
    row.appendChild(actions);
    els.kioskList.appendChild(row);
  });
}

function renderPendingRequestCard(uid, profile) {
  const card = document.createElement('article');
  card.className = 'request-card';

  const info = document.createElement('div');
  info.className = 'request-card-info request-table-row';
  info.innerHTML = `
    <div class="request-cell request-cell--email">${escapeHtml(profile.email || 'no-email@unknown')}</div>
    <div class="request-cell request-cell--uid">${escapeHtml(uid)}</div>
    <div class="request-cell request-cell--date">${escapeHtml(formatDate(profile.createdAt))}</div>
    <div class="request-cell request-cell--contact">${escapeHtml(getOrganizationContact(profile) || 'N/A')}</div>
  `;

  const actions = document.createElement('div');
  actions.className = 'request-card-actions request-cell';

  const approveBtn = document.createElement('button');
  approveBtn.className = 'approve-btn';
  approveBtn.type = 'button';
  approveBtn.textContent = 'Approve';
  approveBtn.addEventListener('click', async () => {
    approveBtn.disabled = true;
    try {
      await approveUser(uid);
      showMessage('Approved ' + (profile.email || uid), 'success');
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showMessage('Approve failed: ' + String(err.message || err), 'error');
    } finally { approveBtn.disabled = false; }
  });

  const rejectBtn = document.createElement('button');
  rejectBtn.className = 'reject-btn';
  rejectBtn.type = 'button';
  rejectBtn.textContent = 'Reject';
  rejectBtn.addEventListener('click', async () => {
    if (!confirm('Reject this request?')) return;
    rejectBtn.disabled = true;
    try {
      await rejectUser(uid);
      showMessage('Rejected ' + (profile.email || uid), 'info');
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showMessage('Reject failed: ' + String(err.message || err), 'error');
    } finally { rejectBtn.disabled = false; }
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'neutral-btn';
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', async () => {
    if (!confirm('Permanently delete this user entry?')) return;
    removeBtn.disabled = true;
    try {
      await deleteUserEntry(uid);
      showMessage('Removed ' + (profile.email || uid), 'info');
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showMessage('Remove failed: ' + String(err.message || err), 'error');
    } finally { removeBtn.disabled = false; }
  });

  actions.appendChild(approveBtn);
  actions.appendChild(rejectBtn);
  actions.appendChild(removeBtn);

  card.appendChild(info);
  card.appendChild(actions);
  return card;
}

async function approveUser(uid) {
  return setUserRole(uid, 'approved');
}

async function rejectUser(uid) {
  return setUserRole(uid, 'rejected');
}

async function setUserRole(uid, role) {
  return db.ref('users/' + uid + '/role').set(role);
}

async function deleteUserEntry(uid) {
  return db.ref('users/' + uid).remove();
}

function renderApprovedRequestCard(uid, profile) {
  const card = document.createElement('article');
  card.className = 'request-card request-card--approved';

  const info = document.createElement('div');
  info.className = 'request-card-info request-table-row';
  info.innerHTML = `
    <div class="request-cell request-cell--email">${escapeHtml(getOrganizationTitle(uid, profile))}</div>
    <div class="request-cell request-cell--uid">${escapeHtml(uid)}</div>
    <div class="request-cell request-cell--date">${escapeHtml(formatDate(profile.createdAt))}</div>
    <div class="request-cell request-cell--contact">${escapeHtml(getOrganizationContact(profile) || 'N/A')}</div>
  `;

  const actions = document.createElement('div');
  actions.className = 'request-card-actions request-cell';

  const suspendBtn = document.createElement('button');
  suspendBtn.className = 'reject-btn';
  suspendBtn.type = 'button';
  suspendBtn.textContent = 'Suspend';
  suspendBtn.addEventListener('click', async () => {
    if (!confirm('Suspend this organization?')) return;
    suspendBtn.disabled = true;
    try {
      await rejectUser(uid);
      showMessage('Suspended ' + (profile.email || uid), 'info');
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showMessage('Suspend failed: ' + String(err.message || err), 'error');
    } finally { suspendBtn.disabled = false; }
  });

  const pendingBtn = document.createElement('button');
  pendingBtn.className = 'neutral-btn';
  pendingBtn.type = 'button';
  pendingBtn.textContent = 'Move to pending';
  pendingBtn.addEventListener('click', async () => {
    if (!confirm('Move this organization back to pending?')) return;
    pendingBtn.disabled = true;
    try {
      await setUserRole(uid, 'pending');
      showMessage('Moved to pending ' + (profile.email || uid), 'info');
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showMessage('Update failed: ' + String(err.message || err), 'error');
    } finally { pendingBtn.disabled = false; }
  });

  actions.appendChild(suspendBtn);
  actions.appendChild(pendingBtn);

  card.appendChild(info);
  card.appendChild(actions);
  return card;
}
function renderRejectedRequestCard(uid, profile) {
  const card = document.createElement('article');
  card.className = 'request-card request-card--rejected';

  const info = document.createElement('div');
  info.className = 'request-card-info request-table-row';
  info.innerHTML = `
    <div class="request-cell request-cell--email">${escapeHtml(profile.email || 'no-email@unknown')}</div>
    <div class="request-cell request-cell--uid">${escapeHtml(uid)}</div>
    <div class="request-cell request-cell--date">${escapeHtml(formatDate(profile.createdAt))}</div>
    <div class="request-cell request-cell--contact">${escapeHtml(getOrganizationContact(profile) || 'N/A')}</div>
  `;

  const actions = document.createElement('div');
  actions.className = 'request-card-actions request-cell';

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'neutral-btn';
  restoreBtn.type = 'button';
  restoreBtn.textContent = 'Restore to pending';
  restoreBtn.addEventListener('click', async () => {
    if (!confirm('Restore this request to pending?')) return;
    restoreBtn.disabled = true;
    try {
      await setUserRole(uid, 'pending');
      showMessage('Restored ' + (profile.email || uid), 'info');
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showMessage('Restore failed: ' + String(err.message || err), 'error');
    } finally { restoreBtn.disabled = false; }
  });

  const approveBtn = document.createElement('button');
  approveBtn.className = 'approve-btn';
  approveBtn.type = 'button';
  approveBtn.textContent = 'Approve';
  approveBtn.addEventListener('click', async () => {
    approveBtn.disabled = true;
    try {
      await approveUser(uid);
      showMessage('Approved ' + (profile.email || uid), 'success');
      await loadDashboard();
    } catch (err) {
      console.error(err);
      showMessage('Approve failed: ' + String(err.message || err), 'error');
    } finally { approveBtn.disabled = false; }
  });

  actions.appendChild(restoreBtn);
  actions.appendChild(approveBtn);

  card.appendChild(info);
  card.appendChild(actions);
  return card;
}

async function requireSuperAdmin(user) {
  if (!user) {
    window.location.href = '../index.html';
    return false;
  }

  const snap = await db.ref('users/' + user.uid).once('value');
  const allowed = await waitlessIsSuperadmin(user, snap.val() || {});
  if (!allowed) {
    showMessage('Access denied. Superadmin only.', 'error');
    await auth.signOut();
    window.location.href = '../index.html';
    return false;
  }

  return true;
}

let dashboardUsersCache = {};

function updateAdminCounts(data) {
  const entries = Object.entries(data || {});
  const pending = entries.filter(([, profile]) => isPendingRequest(profile));
  const approved = entries.filter(([, profile]) => isApprovedOrganization(profile));
  const rejected = entries.filter(([, profile]) => getProfileRole(profile) === 'rejected');
  const kiosks = entries.reduce((total, [, profile]) => total + getKioskCount(profile), 0);
  const customPrefix = approved.filter(([, profile]) => !!profile?.settings?.tokenPrefix).length;

  if ($('#pending-count')) $('#pending-count').textContent = String(pending.length);
  if ($('#approved-count')) $('#approved-count').textContent = String(approved.length);
  if ($('#total-kiosk-count')) $('#total-kiosk-count').textContent = String(kiosks);
  if ($('#custom-prefix-count')) $('#custom-prefix-count').textContent = String(customPrefix);
  if ($('#pending-count-inline')) $('#pending-count-inline').textContent = String(pending.length);
  if ($('#approved-count-inline')) $('#approved-count-inline').textContent = String(approved.length);
  if ($('#rejected-count-inline')) $('#rejected-count-inline').textContent = String(rejected.length);
}

function renderDashboard(data) {
  const entries = Object.entries(data || {});
  const filterValue = String($('#request-filter-select')?.value || 'all');

  const msgEl = $('#message');
  if (msgEl) msgEl.textContent = '';

  const pendingList = $('#pending-list');
  if (pendingList) {
    const pendingColumn = pendingList.closest('.request-column');
    if (pendingColumn) pendingColumn.style.display = (filterValue === 'all' || filterValue === 'pending') ? '' : 'none';
    const pendingEntries = entries.filter(([, profile]) => isPendingRequest(profile));
    pendingList.innerHTML = '';
    if (pendingEntries.length === 0) {
      pendingList.innerHTML = '<p class="muted small">No pending requests right now.</p>';
    } else {
      pendingEntries.forEach(([uid, profile]) => pendingList.appendChild(renderPendingRequestCard(uid, profile)));
    }
  }

  const rejectedList = $('#rejected-list');
  if (rejectedList) {
    const rejectedColumn = rejectedList.closest('.request-column');
    if (rejectedColumn) rejectedColumn.style.display = (filterValue === 'all' || filterValue === 'rejected') ? '' : 'none';
    const rejectedEntries = entries.filter(([, profile]) => getProfileRole(profile) === 'rejected');
    rejectedList.innerHTML = '';
    if (rejectedEntries.length === 0) {
      rejectedList.innerHTML = '<p class="muted small">No rejected requests.</p>';
    } else {
      rejectedEntries.forEach(([uid, profile]) => rejectedList.appendChild(renderRejectedRequestCard(uid, profile)));
    }
  }

  const approvedList = $('#approved-list');
  if (approvedList) {
    const approvedColumn = approvedList.closest('.request-column');
    if (approvedColumn) approvedColumn.style.display = (filterValue === 'all' || filterValue === 'approved') ? '' : 'none';
    const approvedEntries = entries.filter(([, profile]) => isApprovedOrganization(profile));
    approvedList.innerHTML = '';
    if (approvedEntries.length === 0) {
      approvedList.innerHTML = '<p class="muted small">No approved accounts.</p>';
    } else {
      approvedEntries.forEach(([uid, profile]) => approvedList.appendChild(renderApprovedRequestCard(uid, profile)));
    }
  }

  const approvedGrid = $('#approved-orgs-grid');
  if (approvedGrid) {
    const searchValue = String($('#org-search')?.value || '').trim().toLowerCase();
    const sortValue = String($('#org-sort')?.value || 'active');

    let approvedEntries = entries
      .filter(([, profile]) => isApprovedOrganization(profile))
      .filter(([uid, profile]) => {
        if (!searchValue) return true;
        const haystack = `${getOrganizationTitle(uid, profile)} ${profile?.email || ''} ${uid} ${profile?.settings?.tokenPrefix || ''}`.toLowerCase();
        return haystack.includes(searchValue);
      });

    approvedEntries.sort((a, b) => {
      const [uidA, profileA] = a;
      const [uidB, profileB] = b;

      if (sortValue === 'name') {
        return getOrganizationTitle(uidA, profileA).localeCompare(getOrganizationTitle(uidB, profileB));
      }

      if (sortValue === 'kiosks') {
        return getKioskCount(profileB) - getKioskCount(profileA);
      }

      if (sortValue === 'newest') {
        return Number(profileB?.createdAt || 0) - Number(profileA?.createdAt || 0);
      }

      const activeDiff = Number(profileB?.lastActivityAt || 0) - Number(profileA?.lastActivityAt || 0);
      if (activeDiff !== 0) return activeDiff;

      return Number(profileB?.createdAt || 0) - Number(profileA?.createdAt || 0);
    });

    approvedGrid.innerHTML = '';
    if (approvedEntries.length === 0) {
      approvedGrid.innerHTML = '<p class="muted small">No approved organizations match the current search.</p>';
    } else {
      approvedEntries.forEach(([uid, profile]) => approvedGrid.appendChild(renderApprovedOrganizationCard(uid, profile)));
    }
  }

  updateAdminCounts(data);
}

async function loadDashboard() {
  try {
    const snap = await db.ref('users').once('value');
    dashboardUsersCache = snap.val() || {};
    const msgEl = $('#message');
    if (msgEl) msgEl.textContent = '';
    renderDashboard(dashboardUsersCache);
  } catch (err) {
    console.error('admin: failed to load users', err);
    const msgEl = $('#message');
    if (msgEl) msgEl.textContent = 'Failed to load users: ' + String(err.message || err);
  }
}

$('#signout')?.addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = '../index.html';
});

$('#org-search')?.addEventListener('input', () => renderDashboard(dashboardUsersCache));
$('#org-sort')?.addEventListener('change', () => renderDashboard(dashboardUsersCache));
$('#request-filter-select')?.addEventListener('change', () => renderDashboard(dashboardUsersCache));

const orgManageEls = getOrgManageEls();
if (orgManageEls.closeBtn) {
  orgManageEls.closeBtn.addEventListener('click', () => {
    orgManageEls.modal?.classList.add('hidden');
    orgManageEls.modal?.setAttribute('aria-hidden', 'true');
  });
}

if (orgManageEls.backdrop) {
  orgManageEls.backdrop.addEventListener('click', () => {
    orgManageEls.modal?.classList.add('hidden');
    orgManageEls.modal?.setAttribute('aria-hidden', 'true');
  });
}

if (orgManageEls.toggleDisableBtn) {
  orgManageEls.toggleDisableBtn.addEventListener('click', async () => {
    if (!currentManagedOrgId) return;
    const isDisabled = orgManageEls.toggleDisableBtn.dataset.disabled === 'true';
    const confirmMsg = isDisabled ? 'Enable this organization?' : 'Temporarily disable this organization?';
    if (!confirm(confirmMsg)) return;
    try {
      await db.ref(`users/${currentManagedOrgId}/settings/disabled`).set(!isDisabled);
      await refreshDisableButton(currentManagedOrgId);
      await loadDashboard();
      showMessage(isDisabled ? 'Organization enabled' : 'Organization disabled', 'success');
    } catch (err) {
      showMessage('Failed to update status: ' + err.message, 'error');
    }
  });
}

if (orgManageEls.profileSaveBtn) {
  orgManageEls.profileSaveBtn.addEventListener('click', async () => {
    if (!currentManagedOrgId) return;
    const name = orgManageEls.nameInput?.value.trim() || '';
    const contact = orgManageEls.contactInput?.value.trim() || '';
    const address = orgManageEls.addressInput?.value.trim() || '';
    try {
      await db.ref(`users/${currentManagedOrgId}/profile`).update({
        name,
        contactNumber: contact,
        address,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`users/${currentManagedOrgId}`).update({
        displayName: name,
        organizationName: name
      });
      showMessage('Profile updated', 'success');
      await loadDashboard();
    } catch (err) {
      showMessage('Failed to update profile: ' + err.message, 'error');
    }
  });
}

if (orgManageEls.prefixSaveBtn) {
  orgManageEls.prefixSaveBtn.addEventListener('click', async () => {
    if (!currentManagedOrgId) return;
    const rawPrefix = orgManageEls.prefixInput?.value || '';
    const normalized = normalizePrefixInput(rawPrefix);
    if (!normalized) {
      showMessage('Prefix cannot be empty', 'error');
      return;
    }
    const conflict = findOrganizationWithTokenPrefix(normalized, currentManagedOrgId);
    if (conflict) {
      showMessage('Prefix already used by another organization', 'error');
      return;
    }
    try {
      await db.ref(`users/${currentManagedOrgId}/settings/tokenPrefix`).set(normalized);
      showMessage('Prefix updated', 'success');
      await loadDashboard();
    } catch (err) {
      showMessage('Failed to update prefix: ' + err.message, 'error');
    }
  });
}

if (orgManageEls.kioskAddBtn) {
  orgManageEls.kioskAddBtn.addEventListener('click', async () => {
    if (!currentManagedOrgId) return;
    const name = orgManageEls.kioskNameInput?.value.trim() || '';
    const pin = orgManageEls.kioskPinInput?.value.trim() || '';
    if (!name) {
      showMessage('Kiosk name is required', 'error');
      return;
    }
    if (!/^\d{4,6}$/.test(pin)) {
      showMessage('PIN must be 4-6 digits', 'error');
      return;
    }
    const kioskId = generateKioskId();
    try {
      await db.ref(`users/${currentManagedOrgId}/kiosks/${kioskId}`).set({
        id: kioskId,
        name,
        status: 'active',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`kioskUsers/kiosk_${kioskId}`).set({
        id: `kiosk_${kioskId}`,
        kioskId,
        organizationId: currentManagedOrgId,
        pinHash: hashPin(pin),
        role: 'kiosk',
        status: 'active',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        lastLoginAt: null
      });
      orgManageEls.kioskNameInput.value = '';
      orgManageEls.kioskPinInput.value = '';
      showMessage('Kiosk added', 'success');
      await loadOrgKiosks(currentManagedOrgId);
    } catch (err) {
      showMessage('Failed to add kiosk: ' + err.message, 'error');
    }
  });
}

auth.onAuthStateChanged(async (user) => {
  const allowed = await requireSuperAdmin(user);
  if (!allowed) return;
  await loadDashboard();
});
