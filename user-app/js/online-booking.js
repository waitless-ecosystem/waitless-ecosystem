if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

const state = {
  search: '',
  loading: false,
  organizations: [],
  selectedOrg: null,
  selectedServices: [],
  selectedServiceCategory: '',
  assignments: {},
  counters: {}
};

function getLoginUrl() {
  const url = new URL('login.html', window.location.href);
  url.searchParams.set('booking', 'online');
  return url.toString();
}

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCategory(category) {
  const raw = String(category || '').trim();
  return raw ? raw.toLowerCase() : 'uncategorized';
}

function getCategoryLabel(category) {
  const raw = String(category || '').trim();
  return raw || 'Uncategorized';
}

function getOrganizationTitle(uid, profile) {
  return profile?.meta?.name || profile?.name || profile?.displayName || profile?.organizationName || profile?.email || uid;
}

function getOrganizationEmail(profile) {
  return profile?.meta?.email || profile?.email || '';
}

function hasOnlineBooking(profile) {
  const meta = profile?.meta || {};
  return !!(meta.allowOnlineBooking || profile?.allowOnlineBooking);
}

function getPublicServices(profile) {
  return Object.entries(profile?.services || {})
    .filter(([serviceId]) => serviceId !== '__meta__')
    .map(([id, service]) => ({ id, ...service }));
}

function resolveCounterForService(serviceId) {
  const assignments = state.assignments || {};
  const counters = state.counters || {};
  const match = Object.values(assignments).find((assignment) => Array.isArray(assignment?.services) && assignment.services.includes(serviceId));
  if (!match) return null;

  const counter = counters[match.counterId] || {};
  return {
    counterId: match.counterId,
    counterName: counter.name || counter.counterName || match.counterId || 'Counter'
  };
}

function getCategories(services) {
  const categories = {};
  services.forEach((service) => {
    const key = normalizeCategory(service.category);
    if (!categories[key]) {
      categories[key] = { label: getCategoryLabel(service.category), count: 0 };
    }
    categories[key].count += 1;
  });
  return Object.entries(categories)
    .map(([value, info]) => ({ value, label: info.label, count: info.count }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function updateStatus(message) {
  const el = $('#booking-status');
  if (el) el.textContent = message;
}

function updateResult(message, isError = false) {
  const el = $('#booking-result');
  if (!el) return;
  el.className = 'booking-result' + (isError ? ' empty' : '');
  el.textContent = message;
}

function formatEtaLabel(minutes) {
  const normalizedMinutes = Number(minutes || 0);
  if (!Number.isFinite(normalizedMinutes) || normalizedMinutes <= 0) {
    return new Date().toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  return new Date(Date.now() + (normalizedMinutes * 60000)).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function renderOrgCards() {
  const grid = $('#booking-org-grid');
  const searchValue = normalizeText(state.search);

  if (!grid) return;

  const filtered = state.organizations.filter((org) => {
    if (!searchValue) return true;
    const haystack = [org.uid, org.name, org.email, org.tokenPrefix].join(' ').toLowerCase();
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
      <div class="booking-org-badges">
        <span class="booking-badge">Online booking</span>
        ${org.tokenPrefix ? `<span class="booking-badge">Prefix ${escapeHtml(org.tokenPrefix)}OB</span>` : ''}
      </div>
      <div>
        <h3>${escapeHtml(org.name)}</h3>
        <div class="booking-org-meta">${escapeHtml(org.email || org.uid)}</div>
      </div>
      <div class="booking-org-meta">
        <div><strong>Organization ID:</strong> ${escapeHtml(org.uid)}</div>
        <div><strong>Services:</strong> ${escapeHtml(String(org.serviceCount || 0))}</div>
      </div>
      <div class="booking-card-actions">
        <button type="button" class="primary" data-action="select">Book token</button>
        <button type="button" class="secondary" data-action="open">Open token section</button>
      </div>
    `;

    card.querySelector('[data-action="select"]').addEventListener('click', () => {
      selectOrganization(org.uid);
    });

    card.querySelector('[data-action="open"]').addEventListener('click', () => {
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

  if (!section || !titleEl || !subtitleEl || !categoriesPanel || !servicesGrid) return;

  if (!state.selectedOrg) {
    section.classList.add('hidden');
    categoriesPanel.innerHTML = '';
    servicesGrid.innerHTML = '';
    return;
  }

  const org = state.selectedOrg;
  const services = state.selectedServices;
  const categories = getCategories(services);
  const categoryMode = !!org.meta?.serviceCategoriesEnabled && categories.length > 1;

  section.classList.remove('hidden');
  titleEl.textContent = org.name || 'Generate a token';
  subtitleEl.textContent = `${org.email || org.uid} · Prefix ${org.tokenPrefix || 'ORG'}OB`;

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
    ? services.filter((service) => normalizeCategory(service.category) === state.selectedServiceCategory)
    : services;

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
    button.addEventListener('click', () => issueToken(service, button));
    card.appendChild(button);

    servicesGrid.appendChild(card);
  });
}

async function selectOrganization(orgId) {
  try {
    const snap = await db.ref(`publicOrganizations/${orgId}`).once('value');
    const profile = snap.val() || {};
    const meta = profile.meta || {};
    const services = getPublicServices(profile);

    const [assignmentsSnap, countersSnap] = await Promise.all([
      db.ref(`users/${orgId}/assignments`).once('value'),
      db.ref(`users/${orgId}/counters`).once('value')
    ]);

    state.assignments = assignmentsSnap.val() || {};
    state.counters = countersSnap.val() || {};

    state.selectedOrg = {
      uid: orgId,
      name: meta.name || orgId,
      email: meta.email || '',
      tokenPrefix: String(meta.tokenPrefix || '').trim(),
      meta
    };
    state.selectedServices = services;
    state.selectedServiceCategory = '';

    renderSelectedOrganization();
    $('#booking-token-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error('Failed to load organization details', err);
    updateResult('Failed to load organization details: ' + String(err.message || err), true);
  }
}

async function issueToken(service, buttonEl) {
  if (!state.selectedOrg) return;

  const user = auth.currentUser;
  if (!user) {
    updateResult('Sign in with your app account before booking.', true);
    window.location.replace(getLoginUrl());
    return;
  }

  try {
    await user.reload();
  } catch (_) {
    // Keep going with the current auth state if reload fails.
  }

  if (user.email && !user.emailVerified) {
    updateResult('Verify your email before booking.', true);
    window.location.replace(getLoginUrl());
    return;
  }

  const appUserSnap = await db.ref(`appuser/${user.uid}`).once('value');
  if (!appUserSnap.exists()) {
    updateResult('Create your app account before booking.', true);
    window.location.replace(getLoginUrl());
    return;
  }

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.dataset.originalText = buttonEl.textContent || 'Get Token';
    buttonEl.textContent = 'Creating...';
  }

  try {
    const orgId = state.selectedOrg.uid;
    const prefix = await tokenFactory.resolveOrganizationTokenPrefix(db, orgId);
    const bookingPrefix = `${prefix}OB`;
    const tokenId = tokenFactory.generateTokenId('TOKEN');
    const tokenNumber = await tokenFactory.generateSequentialTokenNumber(db, {
      organizationId: orgId,
      prefix: bookingPrefix,
      serviceId: service.id,
      skipOpenHoursCheck: true
    });

    const appUser = appUserSnap.val() || {};
    const customerUid = String(appUser.uid || user.uid).trim();
    const customerName = String(appUser.name || appUser.displayName || '').trim() || null;
    const customerPhone = String(appUser.phone || '').trim() || null;
    const customerEmail = String(appUser.email || user.email || '').trim() || null;
    const counterInfo = resolveCounterForService(service.id) || {};
    const serviceScheduleState = await tokenFactory.resolveServiceScheduleState(db, orgId, service.id);
    const serviceScheduleBlocked = !!(serviceScheduleState.enabled && !tokenFactory.isWithinServiceScheduleConfig(serviceScheduleState.serviceData, new Date()));
    const serviceScheduleNextStart = serviceScheduleBlocked
      ? tokenFactory.findNextScheduledServiceStart(serviceScheduleState.serviceData, new Date())
      : null;
    const serviceScheduleMessage = serviceScheduleBlocked
      ? `Selected service is only available ${tokenFactory.formatServiceScheduleLabel(serviceScheduleState.serviceData)}${serviceScheduleNextStart ? `. Next available: ${serviceScheduleNextStart.toLocaleString()}.` : '.'}`
      : '';

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
      source: 'mobile-app'
    });

    const updates = {};
    updates[`users/${orgId}/queue/${service.id}/${tokenId}`] = {
      ...tokenData,
      serviceId: service.id,
      serviceName: service.name,
      kioskId: 'ONLINE_BOOKING',
      kioskName: 'Online Booking',
      assignedCounterId: counterInfo.counterId || null,
      assignedCounterName: counterInfo.counterName || null
    };

    updates[`appuserTokens/${customerUid}/${orgId}/${tokenId}`] = {
      ...tokenData,
      organizationName: state.selectedOrg.name || orgId,
      serviceId: service.id,
      serviceName: service.name,
      kioskId: 'ONLINE_BOOKING',
      kioskName: 'Online Booking',
      assignedCounterId: counterInfo.counterId || null,
      assignedCounterName: counterInfo.counterName || null
    };

    await db.ref().update(updates);

    if (serviceScheduleBlocked) {
      const deferredUntil = serviceScheduleNextStart ? serviceScheduleNextStart.getTime() : null;
      if (deferredUntil && serviceScheduleNextStart) {
        await db.ref(`users/${orgId}/queue/${service.id}/${tokenId}`).update({
          deferredUntil,
          scheduledFor: serviceScheduleNextStart.toISOString(),
          status: 'scheduled'
        });
        await db.ref(`appuserTokens/${customerUid}/${orgId}/${tokenId}`).update({
          deferredUntil,
          scheduledFor: serviceScheduleNextStart.toISOString(),
          status: 'scheduled'
        });
      }

      updateResult(`Token created: ${tokenNumber} | ${serviceScheduleMessage}`);
      return;
    }

    // Compute estimate as now + sum(estimated minutes of tokens ahead in this service queue)
    try {
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

      let estimateMinutes = Number(service?.estimatedTime || 0) || 0;
      if (targetIndex >= 0) {
        estimateMinutes = waitingEntries.slice(0, targetIndex).reduce((sum, entry) => sum + (Number(entry.serviceEstimatedTime || entry.estimatedTime || 0) || 0), 0);
      }

      // Enforce open hours: if servedAt falls outside open hours, schedule to next open slot
      try {
        const openSnap = await db.ref(`users/${orgId}/settings/openHours`).once('value');
        const openHours = openSnap.val() || {};
        function parseHM(v) {
          if (!v) return null;
          const parts = String(v || '').split(':');
          if (parts.length < 2) return null;
          return { h: parseInt(parts[0], 10), m: parseInt(parts[1], 10) };
        }
        function isWithinOpenHours(hoursObj, dt) {
          const day = dt.getDay();
          const key = ['sun','mon','tue','wed','thu','fri','sat'][day];
          const conf = hoursObj && hoursObj[key];
          if (!conf || !conf.enabled) return false;
          const open = parseHM(conf.open);
          const close = parseHM(conf.close);
          if (!open || !close) return false;
          const start = new Date(dt);
          start.setHours(open.h, open.m, 0, 0);
          const end = new Date(dt);
          end.setHours(close.h, close.m, 0, 0);
          return dt >= start && dt <= end;
        }
        function findNextOpenStart(hoursObj, fromDt) {
          for (let i = 0; i < 8; i++) {
            const candidate = new Date(fromDt.getTime() + i * 24 * 3600 * 1000);
            const key = ['sun','mon','tue','wed','thu','fri','sat'][candidate.getDay()];
            const conf = hoursObj && hoursObj[key];
            if (!conf || !conf.enabled) continue;
            const open = parseHM(conf.open);
            if (!open) continue;
            const start = new Date(candidate);
            start.setHours(open.h, open.m, 0, 0);
            if (start.getTime() >= fromDt.getTime()) return start;
          }
          return null;
        }

        const now = new Date();
        const servedAt = new Date(now.getTime() + Math.max(0, estimateMinutes) * 60000);
        let deferredUntil = null;
        if (!isWithinOpenHours(openHours, servedAt)) {
          const nextOpen = findNextOpenStart(openHours, now);
          if (nextOpen) {
            deferredUntil = nextOpen.getTime();
            await db.ref(`users/${orgId}/queue/${service.id}/${tokenId}`).update({
              deferredUntil,
              scheduledFor: nextOpen.toISOString(),
              status: 'scheduled'
            });
            await db.ref(`appuserTokens/${customerUid}/${orgId}/${tokenId}`).update({
              deferredUntil,
              scheduledFor: nextOpen.toISOString(),
              status: 'scheduled'
            });
          }
        }

        const estimateLabel = deferredUntil ? (new Date(deferredUntil)).toLocaleString() : formatEtaLabel(estimateMinutes);
        const customerLabel = customerName || customerEmail || customerUid;
        const counterLabel = counterInfo.counterName || 'Waiting';

        updateResult(
  `Token created: ${tokenNumber} | Customer: ${customerLabel || 'Unknown'} | Counter: ${counterLabel} | ETA: ${estimateLabel} | Live Position: ${livePosition}`
);
      } catch (err) {
        const estimateLabel = formatEtaLabel(estimateMinutes);
        const customerLabel = customerName || customerEmail || customerUid;
        const counterLabel = counterInfo.counterName || 'Waiting';
        updateResult(
  `Token created: ${tokenNumber} | Customer: ${customerLabel || 'Unknown'} | Counter: ${counterLabel} | ETA: ${estimateLabel} | Live Position: ${livePosition}`
);
      }
    } catch (err) {
      const estimatedMinutes = Number(service?.estimatedTime || 0) || 0;
      const estimateLabel = formatEtaLabel(estimatedMinutes);
      const customerLabel = customerName || customerEmail || customerUid;
      const counterLabel = counterInfo.counterName || 'Waiting';
      updateResult(
  `Token created: ${tokenNumber} | Customer: ${customerLabel || 'Unknown'} | Counter: ${counterLabel} | ETA: ${estimateLabel} | Live Position: ${livePosition}`
);
    }
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
  state.loading = true;
  renderOrgCards();

  try {
    const snap = await db.ref('publicOrganizations').once('value');
    const orgs = snap.val() || {};
    const allowed = Object.entries(orgs)
      .filter(([, profile]) => hasOnlineBooking(profile))
      .map(([uid, profile]) => {
        const meta = profile?.meta || {};
        const serviceCount = getPublicServices(profile).length;
        return {
          uid,
          name: getOrganizationTitle(uid, profile),
          email: getOrganizationEmail(profile),
          role: meta.role || profile?.role || '',
          tokenPrefix: String(meta.tokenPrefix || profile?.tokenPrefix || '').trim(),
          allowOnlineBooking: true,
          serviceCount
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

function bindEvents() {
  const searchInput = $('#booking-search-input');
  const clearBtn = $('#booking-clear-btn');
  const backBtn = $('#booking-back-btn');

  searchInput?.addEventListener('input', () => {
    state.search = searchInput.value;
    renderOrgCards();
  });

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.replace(getLoginUrl());
      return;
    }

    try {
      await user.reload();
    } catch (_) {
      // Ignore reload failures and continue checking the stored profile.
    }

    const appUserSnap = await db.ref(`appuser/${user.uid}`).once('value');
    if (!appUserSnap.exists()) {
      window.location.replace(getLoginUrl());
      return;
    }

    await loadOrganizations();
  });

  clearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    state.search = '';
    renderOrgCards();
    searchInput?.focus();
  });

  backBtn?.addEventListener('click', () => {
    state.selectedOrg = null;
    state.selectedServices = [];
    state.selectedServiceCategory = '';
    renderSelectedOrganization();
    updateResult('Select a service to create a token.');
  });
}

bindEvents();