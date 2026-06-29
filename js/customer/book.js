/**
 * =========================================================================
 * CORE HELPERS & UTILITIES (Fixed Missing Definitions)
 * =========================================================================
 */

// Fixes: ReferenceError: hasOnlineBooking is not defined
function hasOnlineBooking(profile) {
  if (!profile) return false;
  // Safely check if explicit online booking flags are present or true
  return profile.allowOnlineBooking === true || 
         (profile.meta && profile.meta.allowOnlineBooking === true) ||
         profile.onlineBookingEnabled === true;
}

// Fixes: ReferenceError: getOrganizationTitle is not defined
function getOrganizationTitle(uid, profile) {
  if (!profile) return uid;
  return profile.organizationName || profile.displayName || (profile.meta && profile.meta.name) || profile.name || uid;
}

// Fixes: ReferenceError: getOrganizationEmail is not defined
function getOrganizationEmail(profile) {
  if (!profile) return '';
  return (profile.meta && profile.meta.email) || profile.email || '';
}

// Fixes: ReferenceError: normalizeCategory is not defined
function normalizeCategory(category) {
  return String(category || '').trim().toLowerCase();
}

// Fixes: ReferenceError: getCategoryLabel is not defined
function getCategoryLabel(categoryVal) {
  if (!categoryVal || categoryVal === 'all') return 'All Services';
  return categoryVal.charAt(0).toUpperCase() + categoryVal.slice(1);
}

// Fixes: ReferenceError: getOnlineBookingSlotSettings is not defined
function getOnlineBookingSlotSettings() {
  // Returns a safe fallback setup configuration. Customize matching your app architecture
  return {
    enabled: !!(state.selectedOrg && state.selectedOrg.meta && state.selectedOrg.meta.slotBookingEnabled)
  };
}

// Fixes: ReferenceError: getCategories is not defined
function getCategories(services) {
  if (!Array.isArray(services)) return [];
  const map = {};
  services.forEach(s => {
    if (!s.category) return;
    const normalized = normalizeCategory(s.category);
    if (!map[normalized]) {
      map[normalized] = { label: s.category, value: normalized, count: 0 };
    }
    map[normalized].count++;
  });
  return Object.values(map);
}

// Fixes: ReferenceError: getTodayDateInputValue is not defined
function getTodayDateInputValue() {
  const local = new Date();
  const offset = local.getTimezoneOffset();
  const safeDate = new Date(local.getTime() - (offset * 60 * 1000));
  return safeDate.toISOString().split('T')[0];
}

// Fixes: ReferenceError: getSelectedBookingDateTime is not defined
function getSelectedBookingDateTime() {
  return state.selectedBookingDate ? new Date(state.selectedBookingDate).getTime() : null;
}

// Fixes: ReferenceError: renderBookingDatePanel is not defined
function renderBookingDatePanel() {
  const panel = $('#booking-date-panel') || document.querySelector('.date-panel');
  if (panel) {
    panel.innerHTML = `<label>Booking Date: </label><input type="date" id="booking-date-field" value="${state.selectedBookingDate}">`;
    panel.querySelector('#booking-date-field')?.addEventListener('change', (e) => {
      state.selectedBookingDate = e.target.value;
      renderSelectedOrganization();
    });
  }
}

// Fixes: ReferenceError: withTimeout is not defined
function withTimeout(promise, ms, timeoutErrorMsg = 'Operation timed out.') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutErrorMsg));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Fixes: ReferenceError: normalizeText is not defined
function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

// Fixes: ReferenceError: updateStatus is not defined
function updateStatus(message) {
  const statusEl = $('#booking-status') || document.querySelector('.status-message');
  if (statusEl) {
    statusEl.textContent = message;
  } else {
    console.log('Status Update:', message);
  }
}

// Fixes: ReferenceError: updateResult is not defined
function updateResult(message, isError = false) {
  const resultEl = $('#booking-result') || document.querySelector('.result-message');
  if (resultEl) {
    resultEl.textContent = message;
    resultEl.style.color = isError ? '#dc3545' : 'inherit';
  } else {
    console.log(`Result (${isError ? 'Error' : 'Success'}):`, message);
  }
}

// Escape HTML utility helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/**
 * =========================================================================
 * INITIALIZATION & STATE MANAGEMENT
 * =========================================================================
 */

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();
let authBootstrapTimer = null;
let authBootstrapResolved = false;

const state = {
  search: '',
  loading: false,
  organizations: [],
  selectedOrg: null,
  selectedOrgLoading: false,
  selectedServices: [],
  selectedService: null,
  selectedSlot: null,
  selectedBookingDate: '',
  selectedServiceCategory: '',
  assignments: {},
  counters: {}
};

function getLoginUrl() {
  const url = new URL('login.html', window.location.href);
  url.searchParams.set('booking', 'online');
  return url.toString();
}

function redirectToLogin() {
  window.location.replace(getLoginUrl());
}

function $(selector) {
  return document.querySelector(selector);
}


/**
 * =========================================================================
 * RENDERING ENGINE
 * =========================================================================
 */

function renderOrgCards() {
  const grid = $('#booking-org-grid');
  const searchValue = normalizeText(state.search);

  if (!grid) return;

  const filtered = state.organizations.filter((org) => {
    if (!searchValue) return true;
    const haystack = [org.uid, org.name, org.organizationName, org.userName, org.email, org.tokenPrefix].join(' ').toLowerCase();
    return haystack.includes(searchValue);
  });

  updateStatus(state.loading
    ? 'Loading organizations...'
    : `${filtered.length} organization${filtered.length === 1 ? '' : 's'} available`);

  if (state.loading) {
    grid.innerHTML = '<p class="booking-empty">Loading organizations...</p>';
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="booking-empty">No organizations match your search.</p>';
    return;
  }

  grid.innerHTML = '';
  filtered.forEach((org) => {
    const card = document.createElement('article');
    card.className = 'booking-org-card';
    card.innerHTML = `
      
      <div>
        <h3>${escapeHtml(org.organizationName || org.name)}</h3>
      </div>
      <div class="booking-card-actions">
        <button type="button" class="primary" data-action="select">Book now</button>
      </div>
    `;

    card.querySelector('[data-action="select"]').addEventListener('click', () => {
      if (!auth.currentUser) {
        redirectToLogin();
        return;
      }
      selectOrganization(org.uid);
    });

    grid.appendChild(card);
  });
}

function renderSelectedOrganization() {
  const section = $('#booking-token-section');
  const titleEl = $('#booking-selected-org-title');
  const subtitleEl = $('#booking-selected-org-subtitle');
  const categoriesPanel = $('#booking-categories-panel');
  const servicesGrid = $('#booking-services-grid');
  const slotPanel = $('#booking-slot-panel');

  if (!section || !titleEl || !subtitleEl || !categoriesPanel || !servicesGrid) return;

  if (!state.selectedOrg) {
    section.classList.add('hidden');
    categoriesPanel.innerHTML = '';
    servicesGrid.innerHTML = '';
    if (slotPanel) {
      slotPanel.innerHTML = '';
      slotPanel.classList.add('hidden');
    }
    return;
  }

  renderBookingDatePanel();

  const org = state.selectedOrg;
  const services = state.selectedServices;
  const bookableServices = services.filter((service) => service.onlineBookingEnabled !== false);
  const categories = getCategories(bookableServices);
  const categoryMode = !!org.meta?.serviceCategoriesEnabled && categories.length > 0;
  const slotSettings = getOnlineBookingSlotSettings();

  section.classList.remove('hidden');
  titleEl.textContent = org.organizationName || org.name || 'Generate a token';
  subtitleEl.textContent = state.selectedOrgLoading
    ? 'Loading organization details...'
    : `${org.userName || org.email || org.uid} · Prefix ${org.tokenPrefix || 'ORG'}OB`;

  if (state.selectedOrgLoading) {
    categoriesPanel.classList.add('hidden');
    servicesGrid.innerHTML = '<p class="booking-empty">Loading booking options...</p>';
    if (slotPanel) {
      slotPanel.innerHTML = '';
      slotPanel.classList.add('hidden');
    }
    return;
  }

  categoriesPanel.innerHTML = '';
  if (categoryMode) {
    const intro = document.createElement('div');
    intro.className = 'category-selection-intro';
    intro.innerHTML = `
      <div class="service-category-header">
        <h3>Select a service category</h3>
        <p>Pick a category first, then choose the service you need.</p>
      </div>
    `;
    categoriesPanel.appendChild(intro);

    const grid = document.createElement('div');
    grid.className = 'service-category-grid';

    const allOption = document.createElement('button');
    allOption.type = 'button';
    allOption.className = 'service-card category-card';
    allOption.textContent = 'All services';
    allOption.addEventListener('click', () => {
      state.selectedServiceCategory = 'all';
      state.selectedService = null;
      state.selectedSlot = null;
      renderSelectedOrganization();
    });
    grid.appendChild(allOption);

    categories.forEach((category) => {
      const categoryCard = document.createElement('button');
      categoryCard.type = 'button';
      categoryCard.className = 'service-card category-card';
      categoryCard.innerHTML = `<strong>${escapeHtml(category.label)}</strong><span>${category.count} service${category.count === 1 ? '' : 's'}</span>`;
      categoryCard.addEventListener('click', () => {
        state.selectedServiceCategory = category.value;
        state.selectedService = null;
        state.selectedSlot = null;
        renderSelectedOrganization();
      });
      grid.appendChild(categoryCard);
    });

    categoriesPanel.appendChild(grid);
    categoriesPanel.classList.remove('hidden');
  } else {
    categoriesPanel.classList.add('hidden');
    state.selectedServiceCategory = 'all';
  }

  const filteredServices = categoryMode && state.selectedServiceCategory && state.selectedServiceCategory !== 'all'
    ? bookableServices.filter((service) => normalizeCategory(service.category) === state.selectedServiceCategory)
    : bookableServices;

  if (!state.selectedBookingDate || !getSelectedBookingDateTime()) {
    categoriesPanel.classList.add('hidden');
    servicesGrid.innerHTML = '<p class="booking-empty">Select booking date first to view available services.</p>';
    if (slotPanel) {
      slotPanel.innerHTML = '';
      slotPanel.classList.add('hidden');
    }
    return;
  }

  servicesGrid.innerHTML = '';
  if (filteredServices.length === 0) {
    servicesGrid.innerHTML = '<p class="booking-empty">No services available for this category.</p>';
    return;
  }

  if (categoryMode && state.selectedServiceCategory && state.selectedServiceCategory !== 'all') {
    const categoryLabel = categories.find((category) => category.value === state.selectedServiceCategory)?.label || getCategoryLabel(state.selectedServiceCategory);
    const header = document.createElement('div');
    header.className = 'category-filter-header';
    header.innerHTML = `
      <div class="category-filter-label">Category: <strong>${escapeHtml(categoryLabel)}</strong></div>
      <button type="button" class="secondary button-small" id="booking-change-category-btn">Change category</button>
    `;
    servicesGrid.appendChild(header);
    header.querySelector('#booking-change-category-btn')?.addEventListener('click', () => {
      state.selectedServiceCategory = '';
      state.selectedService = null;
      state.selectedSlot = null;
      renderSelectedOrganization();
    });
  }

  filteredServices.forEach((service, index) => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <h4>${escapeHtml(service.name || `Service ${index + 1}`)}</h4>
      <p>${escapeHtml(service.description || 'Please select this service to continue.')}</p>
      <p class="meta">Estimated time: ${escapeHtml(service.estimatedTime ? `${service.estimatedTime} min` : 'N/A')}</p>
      ${slotSettings.enabled ? `<p class="meta">Time-slot booking available</p>` : ''}
    `;

    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = slotSettings.enabled ? 'Choose slot' : 'Get Token';
    button.addEventListener('click', async () => {
      if (slotSettings.enabled) {
        // Must be supplemented by your date/slot module configurations
        if (typeof openBookingSlotPicker === 'function') {
          await openBookingSlotPicker(service);
        } else {
          console.warn('openBookingSlotPicker implementation missing');
        }
        return;
      }
      await issueToken(service, button, null);
    });
    card.appendChild(button);

    servicesGrid.appendChild(card);
  });
}


/**
 * =========================================================================
 * CORE ACTIONS & TRANSACTION PIPELINES
 * =========================================================================
 */

async function selectOrganization(orgId) {
  try {
    if (!auth.currentUser) {
      redirectToLogin();
      return;
    }

    state.selectedOrg = {
      uid: orgId,
      name: orgId,
      email: '',
      tokenPrefix: '',
      meta: {},
      userName: '',
      organizationName: orgId
    };
    state.selectedOrgLoading = true;
    state.selectedServices = [];
    state.selectedServiceCategory = '';
    state.selectedService = null;
    state.selectedSlot = null;
    state.selectedBookingDate = getTodayDateInputValue();

    renderSelectedOrganization();
    $('#booking-token-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const snap = await db.ref(`publicOrganizations/${orgId}`).once('value');
    const profile = snap.val() || {};
    const meta = profile.meta || {};
    
    const publicServicesSnap = await db.ref(`publicOrganizations/${orgId}/services`).once('value');
    const publicServices = publicServicesSnap.val() || {};
    const privateServicesSnap = await db.ref(`users/${orgId}/services`).once('value');
    const privateServices = privateServicesSnap.val() || {};

    // Prefer the public mirror, but fall back to the org's private services for older data.
    const services = Object.keys(publicServices).length > 0
      ? Object.values(publicServices)
      : Object.values(privateServices);

    const [assignmentsSnap, countersSnap] = await Promise.all([
      db.ref(`users/${orgId}/assignments`).once('value'),
      db.ref(`users/${orgId}/counters`).once('value')
    ]);

    state.assignments = assignmentsSnap.val() || {};
    state.counters = countersSnap.val() || {};
    state.selectedOrg = {
      uid: orgId,
      name: profile?.organizationName || profile?.displayName || meta.name || profile?.name || orgId,
      organizationName: profile?.organizationName || profile?.displayName || meta.name || profile?.name || orgId,
      userName: profile?.displayName || meta.name || profile?.name || '',
      email: meta.email || profile?.email || '',
      tokenPrefix: String(meta.tokenPrefix || profile?.tokenPrefix || '').trim(),
      meta
    };
    state.selectedServices = services;
    state.selectedOrgLoading = false;

    renderSelectedOrganization();
  } catch (err) {
    console.error('Failed to load organization details', err);
    state.selectedOrgLoading = false;
    updateResult('Failed to load organization details: ' + String(err.message || err), true);
    renderSelectedOrganization();
  }
}

async function issueToken(service, buttonEl, selectedSlot = null) {
  if (!state.selectedOrg) return;

  if (!state.selectedBookingDate || !getSelectedBookingDateTime()) {
    updateResult('Select a booking date before choosing service and slot.', true);
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    updateResult('Sign in with your app account before booking.', true);
    return;
  }

  try {
    await user.reload();
  } catch (_) {}

  if (user.email && !user.emailVerified) {
    updateResult('Your email is not verified yet, but you can continue with booking for this session.', false);
  }

  const appUserSnap = await db.ref(`appuser/${user.uid}`).once('value');
  const appUser = appUserSnap.val() || {};
  const fallbackName = String(user.displayName || user.email || '').trim();
  const fallbackEmail = String(user.email || '').trim();
  const fallbackPhone = String(user.phoneNumber || '').trim();
  const normalizedAppUser = appUserSnap.exists()
    ? appUser
    : {
        uid: user.uid,
        name: fallbackName || null,
        email: fallbackEmail || null,
        phone: fallbackPhone || null
      };

  if (!appUserSnap.exists()) {
    try {
      await db.ref(`appuser/${user.uid}`).set({
        uid: user.uid,
        name: normalizedAppUser.name || fallbackName || null,
        email: normalizedAppUser.email || fallbackEmail || null,
        phone: normalizedAppUser.phone || fallbackPhone || null,
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
    } catch (profileErr) {
      console.warn('Failed to backfill appuser profile before booking', profileErr);
    }
  }

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.dataset.originalText = buttonEl.textContent || 'Get Token';
    buttonEl.textContent = 'Creating...';
  }

  try {
    const orgId = state.selectedOrg.uid;
    
    // Safety check on global token factories
    if (typeof tokenFactory === 'undefined') {
      throw new Error('Global tokenFactory helper is missing from script architecture.');
    }

    const prefix = await tokenFactory.resolveOrganizationTokenPrefix(db, orgId);
    const bookingPrefix = `${prefix}OB`;
    const tokenId = tokenFactory.generateTokenId('TOKEN');
    const tokenNumber = await tokenFactory.generateSequentialTokenNumber(db, {
      organizationId: orgId,
      prefix: bookingPrefix,
      serviceId: service.id,
      skipOpenHoursCheck: true
    });

    const customerUid = String(normalizedAppUser.uid || user.uid).trim();
    const customerName = String(normalizedAppUser.name || user.displayName || '').trim() || null;
    const customerPhone = String(normalizedAppUser.phone || '').trim() || null;
    const customerEmail = String(normalizedAppUser.email || user.email || '').trim() || null;
    
    const counterInfo = (typeof resolveCounterForService === 'function') ? resolveCounterForService(service.id) || {} : {};
    const slotSettings = getOnlineBookingSlotSettings();

    let slotData = null;
    if (slotSettings.enabled) {
      if (!selectedSlot) {
        updateResult('Choose an available time slot before booking.', true);
        return;
      }

      const availableSlots = (typeof loadServiceSlots === 'function') ? await loadServiceSlots(service) : [];
      slotData = availableSlots.find((slot) => slot.key === selectedSlot.key) || null;
      if (!slotData) {
        updateResult('That slot is no longer available. Please choose another one.', true);
        if (typeof openBookingSlotPicker === 'function') await openBookingSlotPicker(service);
        return;
      }
    }

    const tokenData = tokenFactory.createBaseTokenData({
      tokenId,
      tokenNumber,
      organizationId: orgId,
      kioskId: 'ONLINE_BOOKING',
      kioskName: 'Online Booking',
      serviceId: service.id,
      serviceName: service.name,
      serviceEstimatedTime: Number(service?.estimatedTime || 0) || null,
      customerUid,
      customerName,
      customerPhone,
      customerEmail,
      source: 'mobile-app',
      status: 'waiting',
      bookingSlotKey: slotData?.key || null,
      bookingSlotStartMs: slotData?.startMs || null,
      bookingSlotEndMs: slotData?.endMs || null,
      bookingSlotPosition: slotData?.position || null,
      bookingSlotCapacity: slotData?.capacity || null,
      bookingSlotOccupied: slotData?.occupied || null,
      bookingSlotEtaMs: slotData?.etaMs || null,
      scheduledFor: slotData ? new Date(slotData.etaMs).toISOString() : null,
      livePosition: slotData?.position || null
    });

    const updates = {};
    updates[`users/${orgId}/queue/${service.id}/${tokenId}`] = {
      ...tokenData,
      serviceId: service.id,
      serviceName: service.name,
      kioskId: 'ONLINE_BOOKING',
      kioskName: 'Online Booking',
      assignedCounterId: counterInfo.counterId || null,
      assignedCounterName: counterInfo.counterName || null,
      livePosition: slotData?.position || null,
      position: slotData?.position || null,
      status: 'waiting'
    };

    updates[`appuserTokens/${customerUid}/${orgId}/${tokenId}`] = {
      ...tokenData,
      organizationName: state.selectedOrg.organizationName || state.selectedOrg.name || orgId,
      serviceId: service.id,
      serviceName: service.name,
      kioskId: 'ONLINE_BOOKING',
      kioskName: 'Online Booking',
      assignedCounterId: counterInfo.counterId || null,
      assignedCounterName: counterInfo.counterName || null,
      livePosition: slotData?.position || null,
      position: slotData?.position || null,
      status: 'waiting'
    };

    await db.ref().update(updates);

    if (slotData) {
      const slotEta = new Date(slotData.etaMs);
      const slotUpdates = {
        status: 'scheduled',
        scheduledFor: slotEta.toISOString(),
        bookingSlotKey: slotData.key,
        bookingSlotStartMs: slotData.startMs,
        bookingSlotEndMs: slotData.endMs,
        bookingSlotPosition: slotData.position,
        bookingSlotCapacity: slotData.capacity,
        bookingSlotOccupied: slotData.occupied,
        bookingSlotEtaMs: slotData.etaMs,
        livePosition: slotData.position,
        position: slotData.position
      };

      await db.ref(`users/${orgId}/queue/${service.id}/${tokenId}`).update(slotUpdates);
      await db.ref(`appuserTokens/${customerUid}/${orgId}/${tokenId}`).update(slotUpdates);

      const timeLabel = (typeof formatTimeLabel === 'function') ? formatTimeLabel(slotData.etaMs) : new Date(slotData.etaMs).toLocaleTimeString();
      updateResult(`Token created: ${tokenNumber} | Customer: ${customerName || customerEmail || customerUid || 'Unknown'} | Counter: ${counterInfo.counterName || 'Waiting'} | ETA: ${timeLabel} | Live Position: #${slotData.position} in this slot`);
      return;
    }

    const queueSnap = await db.ref(`users/${orgId}/queue/${service.id}`).once('value');
    const queueData = queueSnap.val() || {};
    const entries = Object.entries(queueData).map(([id, t]) => ({ id, ...(t || {}) }));
    const isPast = (s) => {
      const v = String(s || '').trim().toLowerCase();
      return ['completed', 'cancelled', 'canceled', 'done', 'removed', 'rejected', 'served', 'expired', 'missed', 'no-show', 'noshow'].includes(v);
    };
    const isWaiting = (s) => {
      const v = String(s || '').trim().toLowerCase();
      return ['waiting', 'new', 'queued', 'pending'].includes(v) || !v;
    };

    const waitingEntries = entries
      .filter((e) => !isPast(e.status) && isWaiting(e.status))
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    const normalizeTokenNumberLocal = (v) => String(v || '').trim().toUpperCase();
    const targetIndex = waitingEntries.findIndex((entry) => normalizeTokenNumberLocal(entry.tokenNumber) === normalizeTokenNumberLocal(tokenNumber));
    const livePosition = targetIndex >= 0 ? targetIndex + 1 : 'Unknown';
    const estimateMinutes = targetIndex >= 0
      ? waitingEntries.slice(0, targetIndex).reduce((sum, entry) => sum + (Number(entry.serviceEstimatedTime || entry.estimatedTime || 0) || 0), 0)
      : Number(service?.estimatedTime || 0) || 0;

    const etaLabel = (typeof formatEtaLabel === 'function') ? formatEtaLabel(estimateMinutes) : `${estimateMinutes} mins`;
    updateResult(`Token created: ${tokenNumber} | Customer: ${customerName || customerEmail || customerUid || 'Unknown'} | Counter: ${counterInfo.counterName || 'Waiting'} | ETA: ${etaLabel} | Live Position: ${livePosition}`);
  } catch (err) {
    console.error('online booking token failed', err);
    updateResult('Failed to create token: ' + String(err.message || err), true);
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = buttonEl.dataset.originalText || 'Get Token';
      delete buttonEl.dataset.originalText;
    }
  }
}

async function loadOrganizations() {
  if (!auth.currentUser) {
    state.loading = false;
    renderOrgCards();
    redirectToLogin();
    return;
  }

  state.loading = true;
  renderOrgCards();

  try {
    const snap = await withTimeout(
      db.ref('publicOrganizations').once('value'),
      12000,
      'Timed out while loading organizations.'
    );
    const orgs = snap.val() || {};
    const allowed = Object.entries(orgs)
      .filter(([, profile]) => hasOnlineBooking(profile))
      .map(([uid, profile]) => {
        const meta = profile?.meta || {};
        return {
          uid,
          userName: profile?.displayName || meta.name || profile?.name || '',
          organizationName: profile?.organizationName || profile?.displayName || meta.name || profile?.name || 'Unnamed organization',
          name: getOrganizationTitle(uid, profile),
          email: getOrganizationEmail(profile),
          role: meta.role || profile?.role || '',
          tokenPrefix: String(meta.tokenPrefix || profile?.tokenPrefix || '').trim(),
          allowOnlineBooking: true
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    state.organizations = allowed;
  } catch (err) {
    console.error('online booking load failed', err);
    state.organizations = [];
    updateStatus('Failed to load organizations: ' + String(err.message || err));
  } finally {
    state.loading = false;
    renderOrgCards();
  }
}


/**
 * =========================================================================
 * ASYNC LIFECYCLE & APP EVENT LISTENERS
 * =========================================================================
 */

function bindEvents() {
  const searchInput = $('#booking-search-input');
  const clearBtn = $('#booking-clear-btn');
  const backBtn = $('#booking-back-btn');

  authBootstrapResolved = false;
  if (authBootstrapTimer) {
    clearTimeout(authBootstrapTimer);
  }
  authBootstrapTimer = setTimeout(() => {
    if (!authBootstrapResolved && !auth.currentUser) {
      redirectToLogin();
    }
  }, 8000);

  searchInput?.addEventListener('input', () => {
    state.search = searchInput.value;
    renderOrgCards();
  });

  auth.onAuthStateChanged(async (user) => {
    authBootstrapResolved = true;
    if (authBootstrapTimer) {
      clearTimeout(authBootstrapTimer);
      authBootstrapTimer = null;
    }

    try {
      if (!user) {
        redirectToLogin();
        return;
      }

      try {
        await user.reload();
      } catch (_) {}

      try {
        await withTimeout(
          db.ref(`appuser/${user.uid}`).once('value'),
          10000,
          'Timed out while checking your app profile.'
        );
      } catch (profileErr) {
        console.warn('App profile check failed, continuing to load organizations', profileErr);
      }

      await loadOrganizations();
    } catch (err) {
      console.error('online booking bootstrap failed', err);
      state.loading = false;
      state.organizations = [];
      updateStatus('Failed to load organizations: ' + String(err.message || err));
      renderOrgCards();
    }
  });

  clearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    state.search = '';
    renderOrgCards();
    searchInput?.focus();
  });

  backBtn?.addEventListener('click', () => {
    state.selectedOrg = null;
    state.selectedOrgLoading = false;
    state.selectedServices = [];
    state.selectedServiceCategory = '';
    state.selectedService = null;
    state.selectedSlot = null;
    state.selectedBookingDate = '';
    renderSelectedOrganization();
    updateResult('Select a service to create a token.');
  });
}

// Initialize logic pipeline
bindEvents();