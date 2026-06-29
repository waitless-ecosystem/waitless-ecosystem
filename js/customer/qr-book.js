/**
 * =========================================================================
 * CORE HELPERS & UTILITIES
 * =========================================================================
 */

function getOrganizationTitle(uid, profile) {
  if (!profile) return 'Organization';
  return profile.organizationName || profile.displayName || (profile.meta && profile.meta.name) || profile.name || 'Organization';
}

function getOrganizationEmail(profile) {
  if (!profile) return '';
  return (profile.meta && profile.meta.email) || profile.email || '';
}

function normalizeCategory(category) {
  return String(category || '').trim().toLowerCase();
}

function getCategoryLabel(categoryVal) {
  if (!categoryVal || categoryVal === 'all') return 'All Services';
  return categoryVal.charAt(0).toUpperCase() + categoryVal.slice(1);
}

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

function normalizeText(text) {
  return String(text || '').trim().toLowerCase();
}

function updateStatus(message) {
  const statusEl = $('#booking-status') || document.querySelector('.status-message');
  if (statusEl) {
    statusEl.textContent = message;
  } else {
    console.log('Status Update:', message);
  }
}

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function $(selector) {
  return document.querySelector(selector);
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
  loading: false,
  organizations: [],
  search: '',
  selectedOrg: null,
  selectedOrgLoading: false,
  selectedServices: [],
  selectedServiceCategory: '',
  selectedService: null,
  assignments: {},
  counters: {},
  fromQr: false
};

function getLoginUrl() {
  const url = new URL('login.html', window.location.href);
  url.searchParams.set('booking', 'qr');
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


/**
 * =========================================================================
 * UI RENDERING ENGINES
 * =========================================================================
 */

function renderOrgCards() {
  const container = $('#booking-org-grid');
  if (!container) return;

  if (state.loading) {
    container.innerHTML = '<p class="booking-empty">Loading approved organizations...</p>';
    return;
  }

  const query = normalizeText(state.search);
  const filtered = state.organizations.filter(org => {
    if (!query) return true;
    const haystack = [org.uid, org.name, org.organizationName, org.userName, org.email, org.tokenPrefix].join(' ').toLowerCase();
    return haystack.indexOf(query) !== -1;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="booking-empty">No matching organizations found.</p>';
    return;
  }

  container.innerHTML = '';
  filtered.forEach(org => {
    const card = document.createElement('div');
    card.className = 'booking-org-card';
    card.innerHTML = `
      <h3>${escapeHtml(org.name)}</h3>
      <p class="meta">Email: ${escapeHtml(org.email || 'N/A')}</p>
      <p class="meta">Prefix: <strong>${escapeHtml(org.tokenPrefix || 'ORG')}</strong></p>
    `;
    card.addEventListener('click', () => {
      selectOrganization(org.uid);
    });
    container.appendChild(card);
  });
}

function renderSelectedOrganization() {
  const directoryContainer = $('#booking-directory-container');
  const tokenSection = $('#booking-token-section');

  if (!state.selectedOrg) {
    directoryContainer?.classList.remove('hidden');
    tokenSection?.classList.add('hidden');
    return;
  }

  directoryContainer?.classList.add('hidden');
  tokenSection?.classList.remove('hidden');

  const titleEl = $('#booking-selected-org-title');
  const subtitleEl = $('#booking-selected-org-subtitle');
  const categoriesPanel = $('#booking-categories-panel');
  const servicesGrid = $('#booking-services-grid');
  const backBtn = $('#booking-back-btn');

  const org = state.selectedOrg;

  // Change back button text if redirected via QR
  if (backBtn) {
    backBtn.textContent = state.fromQr ? 'Scan another QR' : 'Change organization';
  }

  const bookableServices = state.selectedServices;
  const categories = getCategories(bookableServices);
  const categoryMode = !!org.meta?.serviceCategoriesEnabled && categories.length > 0;

  titleEl.textContent = org.organizationName || org.name || 'Generate a token';
  subtitleEl.textContent = state.selectedOrgLoading
    ? 'Loading organization details...'
    : `${org.userName || org.email || org.organizationName || org.name} · Prefix ${org.tokenPrefix || 'ORG'}`;

  if (state.selectedOrgLoading) {
    categoriesPanel.classList.add('hidden');
    servicesGrid.innerHTML = '<p class="booking-empty">Loading booking options...</p>';
    return;
  }

  if (bookableServices.length === 0) {
    categoriesPanel.classList.add('hidden');
    servicesGrid.innerHTML = '<p class="booking-empty" style="color: var(--waitless-danger);">No services available for this organization at the moment.</p>';
    return;
  }

  if (categoryMode) {
    categoriesPanel.classList.remove('hidden');
    renderCategoryFilters(categories);
  } else {
    categoriesPanel.classList.add('hidden');
  }

  renderServiceGrid(bookableServices, categoryMode);
}

function renderCategoryFilters(categories) {
  const panel = $('#booking-categories-panel');
  if (!panel) return;

  panel.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'category-pill' + (!state.selectedServiceCategory ? ' active' : '');
  allBtn.textContent = `All (${state.selectedServices.length})`;
  allBtn.addEventListener('click', () => {
    state.selectedServiceCategory = '';
    state.selectedService = null;
    renderSelectedOrganization();
  });
  panel.appendChild(allBtn);

  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-pill' + (state.selectedServiceCategory === cat.value ? ' active' : '');
    btn.textContent = `${cat.label} (${cat.count})`;
    btn.addEventListener('click', () => {
      state.selectedServiceCategory = cat.value;
      state.selectedService = null;
      renderSelectedOrganization();
    });
    panel.appendChild(btn);
  });
}

function renderServiceGrid(services, categoryMode) {
  const servicesGrid = $('#booking-services-grid');
  if (!servicesGrid) return;

  servicesGrid.innerHTML = '';

  const activeCategory = state.selectedServiceCategory;
  const filteredServices = activeCategory
    ? services.filter(s => normalizeCategory(s.category) === activeCategory)
    : services;

  if (categoryMode && activeCategory) {
    const header = document.createElement('div');
    const categoryLabel = getCategoryLabel(activeCategory);
    header.className = 'category-filter-header';
    header.innerHTML = `
      <div class="category-filter-label">Category: <strong>${escapeHtml(categoryLabel)}</strong></div>
      <button type="button" class="secondary button-small" id="booking-change-category-btn">Change category</button>
    `;
    servicesGrid.appendChild(header);
    header.querySelector('#booking-change-category-btn')?.addEventListener('click', () => {
      state.selectedServiceCategory = '';
      state.selectedService = null;
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
    `;

    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = 'Get Token';
    button.addEventListener('click', async () => {
      await issueToken(service, button);
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

    renderSelectedOrganization();
    $('#booking-token-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const snap = await db.ref(`publicOrganizations/${orgId}`).once('value');
    const profile = snap.val() || {};
    const meta = profile.meta || {};
    
    const publicServicesSnap = await db.ref(`publicOrganizations/${orgId}/services`).once('value');
    const publicServices = publicServicesSnap.val() || {};
    const privateServicesSnap = await db.ref(`users/${orgId}/services`).once('value');
    const privateServices = privateServicesSnap.val() || {};

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

async function issueToken(service, buttonEl) {
  if (!state.selectedOrg) return;

  const user = auth.currentUser;
  if (!user) {
    updateResult('Sign in with your app account before booking.', true);
    return;
  }

  try {
    await user.reload();
  } catch (_) {}

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
    
    if (typeof tokenFactory === 'undefined') {
      throw new Error('Global tokenFactory helper is missing from script architecture.');
    }

    const prefix = await tokenFactory.resolveOrganizationTokenPrefix(db, orgId);
    const tokenId = tokenFactory.generateTokenId('TOKEN');
    const tokenNumber = await tokenFactory.generateSequentialTokenNumber(db, {
      organizationId: orgId,
      prefix: prefix,
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

    const tokenData = tokenFactory.createBaseTokenData({
      tokenId,
      tokenNumber,
      organizationId: orgId,
      kioskId: 'QR_BOOKING',
      kioskName: 'QR Scan Booking',
      serviceId: service.id,
      serviceName: service.name,
      serviceEstimatedTime: Number(service?.estimatedTime || 0) || null,
      customerUid,
      customerName,
      customerPhone,
      customerEmail,
      source: 'mobile-app',
      status: 'waiting'
    });

    const updates = {};
    const basePayload = {
      ...tokenData,
      serviceId: service.id,
      serviceName: service.name,
      kioskId: 'QR_BOOKING',
      kioskName: 'QR Scan Booking',
      assignedCounterId: counterInfo.counterId || null,
      assignedCounterName: counterInfo.counterName || null,
      livePosition: null,
      position: null,
      status: 'waiting'
    };

    updates[`users/${orgId}/queue/${service.id}/${tokenId}`] = basePayload;

    // No need to add basic on-place/QR scanned tokens to appuserTokens / My Appointments

    await db.ref().update(updates);

    const queueSnap = await db.ref(`users/${orgId}/queue`).once('value');
    const queueData = queueSnap.val() || {};
    const livePosition = computeLivePositionForToken(queueData, tokenNumber);

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

    const target = entries.find((e) => String(e.tokenNumber || '').trim().toUpperCase() === String(tokenNumber || '').trim().toUpperCase());
    const targetCounterId = target?.assignedCounterId || counterInfo.counterId || null;

    const isPast = (s) => {
      const v = String(s || '').trim().toLowerCase();
      return ['completed', 'cancelled', 'canceled', 'done', 'removed', 'rejected', 'served', 'expired', 'missed', 'no-show', 'noshow'].includes(v);
    };
    const isWaiting = (s) => {
      const v = String(s || '').trim().toLowerCase();
      return ['waiting', 'new', 'queued', 'pending'].includes(v) || !v;
    };

    const counterEntries = entries.filter((entry) => {
      if (targetCounterId) {
        return entry.assignedCounterId === targetCounterId;
      }
      return entry.serviceId === service.id;
    });

    const waitingEntries = counterEntries
      .filter((e) => !isPast(e.status) && isWaiting(e.status))
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    const normalizeTokenNumberLocal = (v) => String(v || '').trim().toUpperCase();
    const targetIndex = waitingEntries.findIndex((entry) => normalizeTokenNumberLocal(entry.tokenNumber) === normalizeTokenNumberLocal(tokenNumber));
    const estimateMinutes = targetIndex >= 0
      ? waitingEntries.slice(0, targetIndex).reduce((sum, entry) => sum + (Number(entry.serviceEstimatedTime || entry.estimatedTime || 0) || 0), 0)
      : Number(service?.estimatedTime || 0) || 0;

    const etaLabel = `${estimateMinutes} mins`;
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
    console.error('QR booking token failed', err);
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
      .map(([uid, profile]) => {
        const meta = profile?.meta || {};
        return {
          uid,
          userName: profile?.displayName || meta.name || profile?.name || '',
          email: getOrganizationEmail(profile),
          name: getOrganizationTitle(uid, profile),
          organizationName: profile?.organizationName || profile?.displayName || meta.name || profile?.name || uid,
          tokenPrefix: String(meta.tokenPrefix || profile?.tokenPrefix || '').trim(),
          meta
        };
      });

    state.organizations = allowed;
    state.loading = false;
    updateStatus('');
    renderOrgCards();
  } catch (err) {
    console.error('Failed to load public organizations', err);
    state.loading = false;
    updateStatus('Failed to load organizations.');
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

      // Handle direct orgId selection via QR query parameter
      const urlParams = new URLSearchParams(window.location.search);
      const orgIdParam = urlParams.get('orgId') || urlParams.get('organizationId') || urlParams.get('org');
      if (orgIdParam) {
        state.fromQr = true;
        await selectOrganization(orgIdParam);
      } else {
        state.fromQr = false;
        await loadOrganizations();
      }
    } catch (err) {
      console.error('QR booking bootstrap failed', err);
      state.loading = false;
      state.organizations = [];
      updateStatus('Failed to initialize: ' + String(err.message || err));
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
    if (state.fromQr) {
      // Redirect back to QR scanner page
      window.location.href = 'index.html';
      return;
    }
    state.selectedOrg = null;
    state.selectedOrgLoading = false;
    state.selectedServices = [];
    state.selectedServiceCategory = '';
    state.selectedService = null;
    renderSelectedOrganization();
    updateResult('Select a service to create a token.');
  });
}

bindEvents();
