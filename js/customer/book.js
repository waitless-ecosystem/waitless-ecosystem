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
  if (!profile) return 'Organization';
  return profile.organizationName || profile.displayName || (profile.meta && profile.meta.name) || profile.name || 'Organization';
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

function getOnlineBookingSlotSettings(service = null) {
  const meta = state.selectedOrg?.meta || {};
  const serviceScheduled = !!(service && service.scheduledServiceEnabled);
  const globalSlots = !!meta.onlineBookingSlotsEnabled;
  return {
    enabled: serviceScheduled || globalSlots,
    durationMinutes: Number(serviceScheduled ? (service.bookingSlotMinutes || service.schedule?.slotMinutes) : meta.onlineBookingSlotDurationMinutes) || 30,
    slotsPerInterval: Number(serviceScheduled ? (service.bookingSlotCapacity || service.schedule?.capacity) : meta.onlineBookingSlotCapacity) || 1
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
  if (!panel) return;

  const meta = state.selectedOrg?.meta || {};
  const hasScheduledServices = Array.isArray(state.selectedServices) && state.selectedServices.some(s => s.scheduledServiceEnabled);
  const showDate = !!(meta.onlineBookingSlotsEnabled || hasScheduledServices);

  if (!showDate) {
    panel.innerHTML = '';
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  panel.innerHTML = `<label>Booking Date: </label><input type="date" id="booking-date-field" value="${state.selectedBookingDate}">`;
  panel.querySelector('#booking-date-field')?.addEventListener('change', (e) => {
    state.selectedBookingDate = e.target.value;
    state.selectedSlot = null;
    if (state.selectedService) {
      openBookingSlotPicker(state.selectedService);
    } else {
      renderSelectedOrganization();
    }
  });
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
    resultEl.className = 'booking-result ' + (isError ? 'error' : 'success');
    resultEl.removeAttribute('style');
  } else {
    console.log(`Result (${isError ? 'Error' : 'Success'}):`, message);
  }
}

function updateTokenOverlay({ tokenNumber, serviceName, orgId, position, counter, status, estimateTimeLabel }) {
  const overlay = $('#token-overlay');
  if (!overlay) return;

  const numberEl = $('#token-overlay-number');
  const metaEl = $('#token-overlay-meta');
  const positionEl = $('#token-overlay-position');
  const counterEl = $('#token-overlay-counter');
  const estimateEl = $('#token-overlay-estimate');
  const statusEl = $('#token-overlay-status');
  const titleEl = $('#token-overlay-title');
  const statsContainer = overlay.querySelector('.token-overlay-stats');

  const isBasicMode = !!(state.selectedOrg?.meta?.basicModeEnabled);

  if (isBasicMode) {
    if (titleEl) titleEl.textContent = 'Please proceed to';
    if (numberEl) {
      numberEl.textContent = resolveCounterName(counter) || 'Waiting';
      numberEl.style.fontSize = '2.5rem';
    }
    if (metaEl) metaEl.textContent = '';
    if (statsContainer) statsContainer.style.display = 'none';
  } else {
    if (titleEl) titleEl.textContent = 'Your queue token is ready';
    if (numberEl) {
      numberEl.textContent = tokenNumber || '---';
      numberEl.style.fontSize = '';
    }
    const resolvedOrgName = state.selectedOrg?.organizationName || state.selectedOrg?.name || 'Organization';
    if (metaEl) metaEl.textContent = `${serviceName || 'Service'} · ${resolvedOrgName}`;
    if (statsContainer) statsContainer.style.display = '';

    const normalizedPosition = Number(position);
    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (positionEl) {
      if (normalizedStatus === 'serving') {
        positionEl.textContent = 'Now serving';
      } else if (Number.isFinite(normalizedPosition) && normalizedPosition > 0) {
        positionEl.textContent = normalizedStatus === 'scheduled'
          ? `#${normalizedPosition} in slot`
          : `#${normalizedPosition}`;
      } else {
        positionEl.textContent = 'Waiting';
      }
    }

    if (counterEl) counterEl.textContent = resolveCounterName(counter);
    if (estimateEl) estimateEl.textContent = estimateTimeLabel || 'N/A';
    if (statusEl) {
      statusEl.textContent = String(status || 'waiting').toLowerCase();
      statusEl.className = 'token-overlay-stat-value ' + String(status || 'waiting').toLowerCase();
    }
  }

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function resolveCounterName(counterValue) {
  if (!counterValue) return 'Waiting';
  if (counterValue === 'Waiting') return 'Waiting';
  const rawValue = String(counterValue).trim();
  const fromRecord = state.counters?.[rawValue];
  if (fromRecord) {
    return fromRecord.name || fromRecord.counterName || rawValue;
  }
  const recordMatch = Object.values(state.counters || {}).find((c) => {
    const name = String(c?.name || c?.counterName || '').trim();
    return name.toLowerCase() === rawValue.toLowerCase();
  });
  return recordMatch?.name || recordMatch?.counterName || rawValue;
}

function computeLivePositionForToken(queueData, tokenNumber) {
  const normalizedToken = String(tokenNumber || '').trim().toUpperCase();
  
  // Flatten nested or flat queueData
  let entries = [];
  if (queueData) {
    const values = Object.values(queueData);
    const firstVal = values[0];
    if (firstVal && typeof firstVal === 'object' && !firstVal.hasOwnProperty('tokenNumber') && !firstVal.hasOwnProperty('status')) {
      values.forEach((serviceQueue) => {
        if (serviceQueue && typeof serviceQueue === 'object') {
          Object.entries(serviceQueue).forEach(([id, token]) => {
            if (token) {
              entries.push({ id, ...token });
            }
          });
        }
      });
    } else {
      Object.entries(queueData).forEach(([id, token]) => {
        if (token) {
          entries.push({ id, ...token });
        }
      });
    }
  }

  const target = entries.find((e) => String(e.tokenNumber || '').trim().toUpperCase() === normalizedToken);
  if (!target) return 'Unknown';

  const isPast = (s) => {
    const v = String(s || '').trim().toLowerCase();
    return ['completed', 'cancelled', 'canceled', 'done', 'removed', 'rejected'].includes(v);
  };
  const isWaiting = (s) => {
    const v = String(s || '').trim().toLowerCase();
    return ['waiting', 'new', 'queued', 'pending'].includes(v) || !v;
  };

  // Filter entries by assigned counter
  const targetCounterId = target.assignedCounterId || null;
  const counterEntries = entries.filter((entry) => {
    if (targetCounterId) {
      return entry.assignedCounterId === targetCounterId;
    }
    return entry.serviceId === target.serviceId;
  });

  const waitingEntries = counterEntries
    .filter((e) => !isPast(e.status) && isWaiting(e.status))
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

  const isScheduled = String(target.status || '').trim().toLowerCase() === 'scheduled' || !!(target.scheduledFor || target.deferredUntil);
  if (!isScheduled) {
    const index = waitingEntries.findIndex((e) => String(e.tokenNumber || '').trim().toUpperCase() === normalizedToken);
    return index >= 0 ? index + 1 : 'Unknown';
  }

  // Scheduled calculation
  const parseTimestampMs = (val) => {
    if (!val) return null;
    const parsed = Date.parse(val);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const resolveServiceMinutes = (t) => {
    return Number(t?.serviceEstimatedTime || t?.estimatedTime || 15) || 15;
  };

  const scheduledStartMs = parseTimestampMs(target.scheduledFor || target.deferredUntil);
  if (scheduledStartMs === null) return 1;

  const projectedEntries = counterEntries
    .filter((e) => !isPast(e.status) && (isWaiting(e.status) || String(e.status || '').trim().toLowerCase() === 'scheduled'))
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .reduce((state, entry) => {
      const entrySched = parseTimestampMs(entry.scheduledFor || entry.deferredUntil);
      const startAt = entrySched !== null ? Math.max(state.cursor, entrySched) : state.cursor;
      const endAt = startAt + (resolveServiceMinutes(entry) * 60000);
      state.items.push({
        ...entry,
        projectedStartAt: startAt
      });
      state.cursor = endAt;
      return state;
    }, { cursor: Date.now(), items: [] }).items;

  const scheduledTarget = projectedEntries.find((e) => String(e.tokenNumber || '').trim().toUpperCase() === normalizedToken);
  if (!scheduledTarget) return 1;

  const targetProjectedStartMs = Number(scheduledTarget.projectedStartAt || 0);
  const targetServiceMinutes = resolveServiceMinutes(scheduledTarget);
  const delayedByMs = Math.max(0, targetProjectedStartMs - scheduledStartMs);

  return (delayedByMs <= 0 || targetServiceMinutes <= 0)
    ? 1
    : Math.max(1, Math.ceil(delayedByMs / Math.max(targetServiceMinutes * 60000, 1)));
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

function renderUserPanel() {
  const panel = $('#user-panel');
  if (!panel) return;
  const user = auth.currentUser;
  if (user) {
    const name = escapeHtml(user.displayName || user.email || 'You');
    const email = escapeHtml(user.email || '');
    panel.innerHTML = `
      <div class="user-name">${name}</div>
      <div class="user-email">${email}</div>
      <button id="signout-btn" class="signout-btn" type="button">Sign out</button>
    `;
    $('#signout-btn')?.addEventListener('click', async () => {
      try {
        await auth.signOut();
        window.location.replace(getLoginUrl());
      } catch (err) {
        console.error('Sign out failed', err);
      }
    });
  } else {
    panel.innerHTML = `
      <a href="${getLoginUrl()}" id="signin-btn" class="secondary booking-link" style="padding:6px 12px;font-size:0.85rem;margin:0;">Sign in</a>
    `;
  }
}

function resolveCounterForService(serviceId, queueData = null) {
  const assignments = state.assignments || {};
  const counters = state.counters || {};

  const candidateMatches = Object.values(assignments).filter(
    (assignment) => Array.isArray(assignment?.services) && assignment.services.includes(serviceId)
  );

  if (candidateMatches.length === 0) return null;

  if (candidateMatches.length === 1) {
    const match = candidateMatches[0];
    const counter = counters[match.counterId] || {};
    return {
      counterId: match.counterId,
      counterName: counter.name || counter.counterName || match.counterName || null
    };
  }

  // Multiple candidates: find the one with the least ETA workload
  let bestMatch = candidateMatches[0];
  let minWorkload = Infinity;

  const isWaiting = (s) => {
    const v = String(s || '').trim().toLowerCase();
    return ['waiting', 'new', 'queued', 'pending'].includes(v) || !v;
  };
  const isPast = (s) => {
    const v = String(s || '').trim().toLowerCase();
    return ['completed', 'cancelled', 'canceled', 'done', 'removed', 'rejected', 'served', 'expired', 'missed', 'no-show', 'noshow'].includes(v);
  };

  candidateMatches.forEach((match) => {
    let workload = 0;
    if (queueData) {
      Object.entries(queueData).forEach(([sId, sQueue]) => {
        if (!sQueue) return;
        Object.values(sQueue).forEach((token) => {
          if (token && !isPast(token.status) && isWaiting(token.status)) {
            if (token.assignedCounterId === match.counterId) {
              workload += Number(token.serviceEstimatedTime || token.estimatedTime || 15) || 15;
            }
          }
        });
      });
    }
    if (workload < minWorkload) {
      minWorkload = workload;
      bestMatch = match;
    }
  });

  const counter = counters[bestMatch.counterId] || {};
  return {
    counterId: bestMatch.counterId,
    counterName: counter.name || counter.counterName || bestMatch.counterName || null
  };
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
  const directoryContainer = $('#booking-directory-container');
  const section = $('#booking-token-section');
  const titleEl = $('#booking-selected-org-title');
  const subtitleEl = $('#booking-selected-org-subtitle');
  const categoriesPanel = $('#booking-categories-panel');
  const servicesGrid = $('#booking-services-grid');
  const slotPanel = $('#booking-slot-panel');

  if (!section || !titleEl || !subtitleEl || !categoriesPanel || !servicesGrid) return;

  if (!state.selectedOrg) {
    directoryContainer?.classList.remove('hidden');
    section.classList.add('hidden');
    categoriesPanel.innerHTML = '';
    servicesGrid.innerHTML = '';
    if (slotPanel) {
      slotPanel.innerHTML = '';
      slotPanel.classList.add('hidden');
    }
    return;
  }

  directoryContainer?.classList.add('hidden');

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
    : `${org.userName || org.email || org.organizationName || org.name} · Prefix ${org.tokenPrefix || 'ORG'}OB`;

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
    const serviceSlotSettings = getOnlineBookingSlotSettings(service);
    const card = document.createElement('div');
    card.className = 'service-card';
    card.innerHTML = `
      <h4>${escapeHtml(service.name || `Service ${index + 1}`)}</h4>
      <p>${escapeHtml(service.description || 'Please select this service to continue.')}</p>
      <p class="meta">Estimated time: ${escapeHtml(service.estimatedTime ? `${service.estimatedTime} min` : 'N/A')}</p>
      ${serviceSlotSettings.enabled ? `<p class="meta">Time-slot booking available</p>` : ''}
    `;

    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = serviceSlotSettings.enabled ? 'Choose slot' : 'Get Token';
    button.addEventListener('click', async () => {
      if (serviceSlotSettings.enabled) {
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

    const [assignmentsSnap, countersSnap, settingsSnap] = await Promise.all([
      db.ref(`users/${orgId}/assignments`).once('value'),
      db.ref(`users/${orgId}/counters`).once('value'),
      db.ref(`users/${orgId}/settings`).once('value')
    ]);

    state.assignments = assignmentsSnap.val() || {};
    state.counters = countersSnap.val() || {};
    state.settings = settingsSnap.val() || {};
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
    
    const fullQueueSnap = await db.ref(`users/${orgId}/queue`).once('value');
    const fullQueueData = fullQueueSnap.val() || {};
    const counterInfo = (typeof resolveCounterForService === 'function') ? resolveCounterForService(service.id, fullQueueData) || {} : {};
    const slotSettings = getOnlineBookingSlotSettings(service);

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
    const basePayload = {
      ...tokenData,
      serviceId: service.id,
      serviceName: service.name,
      kioskId: 'ONLINE_BOOKING',
      kioskName: 'Online Booking',
      assignedCounterId: counterInfo.counterId || null,
      assignedCounterName: counterInfo.counterName || null,
      livePosition: slotData?.position || null,
      position: slotData?.position || null,
      status: slotData ? 'scheduled' : 'waiting',
      bookingSlotKey: slotData?.key || null,
      bookingSlotStartMs: slotData?.startMs || null,
      bookingSlotEndMs: slotData?.endMs || null,
      bookingSlotPosition: slotData?.position || null,
      bookingSlotCapacity: slotData?.capacity || null,
      bookingSlotOccupied: slotData?.occupied || null,
      bookingSlotEtaMs: slotData?.etaMs || null,
      scheduledFor: slotData ? new Date(slotData.etaMs).toISOString() : null
    };

    updates[`users/${orgId}/queue/${service.id}/${tokenId}`] = basePayload;

    if (slotData && customerUid && !customerUid.startsWith('guest:')) {
      updates[`appuserTokens/${customerUid}/${orgId}/${tokenId}`] = {
        ...basePayload,
        organizationName: state.selectedOrg.organizationName || state.selectedOrg.name || orgId
      };
    }

    await db.ref().update(updates);

    const queueSnap = await db.ref(`users/${orgId}/queue`).once('value');
    const queueData = queueSnap.val() || {};
    const livePosition = computeLivePositionForToken(queueData, tokenNumber);

    if (slotData) {
      const timeLabel = (typeof formatTimeLabel === 'function') ? formatTimeLabel(slotData.etaMs) : new Date(slotData.etaMs).toLocaleTimeString();
      updateResult(`Token created: ${tokenNumber} | Customer: ${customerName || customerEmail || 'Customer'} | Counter: ${counterInfo.counterName || 'Waiting'} | ETA: ${timeLabel} | Live Position: ${livePosition}`);
      
      updateTokenOverlay({
        tokenNumber,
        serviceName: service.name,
        orgId: orgId,
        position: livePosition,
        counter: counterInfo.counterName || 'Waiting',
        status: 'scheduled',
        estimateTimeLabel: timeLabel
      });
      return;
    }

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
    const estimateMinutes = targetIndex >= 0
      ? waitingEntries.slice(0, targetIndex).reduce((sum, entry) => sum + (Number(entry.serviceEstimatedTime || entry.estimatedTime || 0) || 0), 0)
      : Number(service?.estimatedTime || 0) || 0;

    const etaLabel = (typeof formatEtaLabel === 'function') ? formatEtaLabel(estimateMinutes) : `${estimateMinutes} mins`;
    updateResult(`Token created: ${tokenNumber} | Customer: ${customerName || customerEmail || 'Customer'} | Counter: ${counterInfo.counterName || 'Waiting'} | ETA: ${etaLabel} | Live Position: ${livePosition}`);

    updateTokenOverlay({
      tokenNumber,
      serviceName: service.name,
      orgId: orgId,
      position: livePosition,
      counter: counterInfo.counterName || 'Waiting',
      status: 'waiting',
      estimateTimeLabel: etaLabel
    });
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

    // Auto-select preselected organization from URL search params if present
    const params = new URLSearchParams(window.location.search);
    const orgId = params.get('orgId');
    if (orgId) {
      const matched = allowed.find(o => o.uid === orgId);
      if (matched) {
        selectOrganization(orgId);
      }
    }
  } catch (err) {
    console.error('online booking load failed', err);
    state.organizations = [];
    updateStatus('Failed to load organizations: ' + String(err.message || err));
  } finally {
    state.loading = false;
    renderOrgCards();
  }
}

async function loadServiceSlots(service) {
  if (!state.selectedOrg || !state.selectedBookingDate) return [];
  const org = state.selectedOrg;
  const meta = org.meta || {};
  const settings = state.settings || {};

  const dateStr = state.selectedBookingDate;
  const [year, month, day] = dateStr.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);
  const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const selectedDayName = daysOfWeek[currentDate.getDay()];

  let startHour = 9;
  let startMin = 0;
  let endHour = 17;
  let endMin = 0;
  let slotDuration = 30;
  let slotCapacity = 1;

  if (service && service.scheduledServiceEnabled) {
    const schedule = service.schedule || {};
    const days = Array.isArray(schedule.days) ? schedule.days : [];
    if (!days.includes(selectedDayName)) {
      return []; // Service not scheduled for this day
    }
    const openTime = schedule.open || '09:00';
    const closeTime = schedule.close || '17:00';
    const [hOpen, mOpen] = openTime.split(':').map(Number);
    const [hClose, mClose] = closeTime.split(':').map(Number);
    
    startHour = hOpen;
    startMin = mOpen;
    endHour = hClose;
    endMin = mClose;
    slotDuration = Number(service.bookingSlotMinutes || schedule.slotMinutes || meta.onlineBookingSlotDurationMinutes) || 30;
    slotCapacity = Number(service.bookingSlotCapacity || schedule.capacity || meta.onlineBookingSlotCapacity) || 1;
  } else if (meta.onlineBookingSlotsEnabled) {
    const openHours = settings.openHours || {};
    const dayConfig = openHours[selectedDayName] || {};
    const isDayEnabled = dayConfig.enabled !== undefined ? !!dayConfig.enabled : true;
    if (!isDayEnabled) {
      return []; // Business closed on this day
    }
    const openTime = dayConfig.open || '09:00';
    const closeTime = dayConfig.close || '17:00';
    const [hOpen, mOpen] = openTime.split(':').map(Number);
    const [hClose, mClose] = closeTime.split(':').map(Number);

    startHour = hOpen;
    startMin = mOpen;
    endHour = hClose;
    endMin = mClose;
    slotDuration = Number(meta.onlineBookingSlotDurationMinutes) || 30;
    slotCapacity = Number(meta.onlineBookingSlotCapacity) || 1;
  } else {
    return []; // Slots not enabled
  }

  const serviceEst = Number(service?.estimatedTime) || 0;
  const finalCapacity = (serviceEst > 0 && slotDuration > 0)
    ? Math.max(1, Math.floor(slotDuration / serviceEst))
    : slotCapacity;

  const slots = [];
  let current = new Date(year, month - 1, day, startHour, startMin, 0, 0);
  const endLimit = new Date(year, month - 1, day, endHour, endMin, 0, 0);

  let index = 0;
  while (current < endLimit) {
    const startMs = current.getTime();
    const next = new Date(current.getTime() + slotDuration * 60000);
    const endMs = next.getTime();

    const formatTime = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const key = `${dateStr}_${formatTime(current)}`;

    slots.push({
      key,
      label: `${formatTime(current)} - ${formatTime(next)}`,
      startMs,
      endMs,
      etaMs: startMs,
      position: index + 1,
      capacity: finalCapacity,
      occupied: 0
    });

    current = next;
    index++;
  }

  // Count occupancy from actual database queue
  try {
    const queueSnap = await db.ref(`users/${org.uid}/queue/${service.id}`).once('value');
    const queueData = queueSnap.val() || {};
    Object.values(queueData).forEach(token => {
      if (token.bookingSlotKey && token.status !== 'completed' && token.status !== 'cancelled' && token.status !== 'skipped') {
        const matchedSlot = slots.find(s => s.key === token.bookingSlotKey);
        if (matchedSlot) {
          matchedSlot.occupied++;
        }
      }
    });
  } catch (err) {
    console.warn('Failed to load occupancy from database', err);
  }

  // Filter out past slots for today
  const now = Date.now();
  return slots.filter(s => s.startMs > now);
}

async function openBookingSlotPicker(service) {
  state.selectedService = service;
  state.selectedSlot = null;

  const slotPanel = $('#booking-slot-panel');
  if (!slotPanel) return;

  slotPanel.innerHTML = '<p class="booking-empty">Loading available time slots...</p>';
  slotPanel.classList.remove('hidden');

  // Smooth scroll to the slot picker
  slotPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const slots = await loadServiceSlots(service);

  if (slots.length === 0) {
    slotPanel.innerHTML = `
      <h3>Available Time Slots for ${escapeHtml(service.name)}</h3>
      <p class="booking-empty" style="color: var(--waitless-danger);">No available time slots left for today. Please choose a future booking date.</p>
    `;
    return;
  }

  slotPanel.innerHTML = `
    <h3>Available Time Slots for ${escapeHtml(service.name)}</h3>
    <div class="slots-grid" id="slots-grid-container"></div>
    <div class="slot-confirm-row hidden" id="slot-confirm-row">
      <button class="primary" id="slot-confirm-booking-btn" type="button">Confirm Appointment</button>
    </div>
  `;

  const gridContainer = $('#slots-grid-container');
  const confirmRow = $('#slot-confirm-row');
  const confirmBtn = $('#slot-confirm-booking-btn');

  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-btn';
    const isFull = slot.occupied >= slot.capacity;
    btn.disabled = isFull;

    btn.innerHTML = `
      <span>${escapeHtml(slot.label)}</span>
      <span class="slot-occupancy" style="color: ${isFull ? 'var(--waitless-danger)' : 'var(--waitless-success)'}">
        ${isFull ? 'Full' : `${slot.capacity - slot.occupied} left`}
      </span>
    `;

    btn.addEventListener('click', () => {
      // Toggle selection styling
      gridContainer.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      state.selectedSlot = slot;
      confirmRow.classList.remove('hidden');
      updateResult(`Selected slot: ${slot.label}. Click Confirm Appointment below to book.`);
    });

    gridContainer.appendChild(btn);
  });

  confirmBtn?.addEventListener('click', async () => {
    if (!state.selectedSlot) return;
    await issueToken(service, confirmBtn, state.selectedSlot);
  });
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
  const closeOverlayBtn = $('#close-token-overlay-btn');

  closeOverlayBtn?.addEventListener('click', () => {
    const overlay = $('#token-overlay');
    overlay?.classList.add('hidden');
    overlay?.setAttribute('aria-hidden', 'true');
  });

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

    renderUserPanel();

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