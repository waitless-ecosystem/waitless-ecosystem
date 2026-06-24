// ============================================================
// QUEUE MANAGER APPLICATION
// Modular, professional queue management system
// ============================================================

// Firebase already loaded via CDN scripts in HTML.
// Note: kiosk-db.js is loaded before this file and already defines `auth` and `db`.

// Store current user UID
let currentUserUID = null;
let currentOrganizationProfile = null;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function $(sel) { return document.querySelector(sel); }
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

function normalizeServiceCategory(category) {
  return String(category || '').trim().replace(/\s+/g, ' ');
}

function formatDate(ts) {
  if(!ts) return 'Unknown';
  try { return new Date(ts).toLocaleString(); }
  catch(_) { return String(ts); }
}

function getMobileAppUrl(orgId) {
  const url = new URL('../user-app/index.html', window.location.href);
  if (orgId) {
    url.searchParams.set('orgId', orgId);
  }
  return url.toString();
}

function getPublicServicesRef(orgId) {
  return db.ref(`publicOrganizations/${orgId}/services`);
}

async function syncPublicService(orgId, serviceId, serviceData) {
  await getPublicServicesRef(orgId).child(serviceId).set({
    ...serviceData,
    category: normalizeServiceCategory(serviceData?.category)
  });
}

async function syncPublicOrganizationMeta(profile = currentOrganizationProfile) {
  if (!currentUserUID) return;

  await db.ref(`publicOrganizations/${currentUserUID}`).update({
    meta: {
      orgId: currentUserUID,
      name: profile?.profile?.name || profile?.displayName || profile?.organizationName || profile?.name || currentUserUID,
      email: profile?.email || '',
      role: profile?.role || 'approved',
      tokenPrefix: String(profile?.settings?.tokenPrefix || '').trim(),
      allowOnlineBooking: !!kioskCustomerDetailsSettings.allowOnlineBooking,
      serviceCategoriesEnabled: !!kioskCustomerDetailsSettings.serviceCategoriesEnabled,
      scheduledServicesEnabled: !!kioskCustomerDetailsSettings.scheduledServicesEnabled,
      onlineBookingSlotsEnabled: !!kioskCustomerDetailsSettings.onlineBookingSlotsEnabled,
      onlineBookingSlotDurationMinutes: Number(kioskCustomerDetailsSettings.onlineBookingSlotDurationMinutes || 0),
      onlineBookingSlotCapacity: Number(kioskCustomerDetailsSettings.onlineBookingSlotCapacity || 0),
      basicModeEnabled: !!kioskCustomerDetailsSettings.basicModeEnabled,
      bookingReminderEnabled: !!kioskCustomerDetailsSettings.bookingReminderEnabled,
      bookingReminderLeadMinutes: Number(kioskCustomerDetailsSettings.bookingReminderLeadMinutes || 0),
      tokenSequenceResetMinutes: Number(kioskCustomerDetailsSettings.tokenSequenceResetMinutes || 0),
      serviceCount: Object.keys(currentServices || {}).length,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    }
  });
}

async function removePublicService(orgId, serviceId) {
  await getPublicServicesRef(orgId).child(serviceId).remove();
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

// Global state
let currentCounters = {};
let currentServices = {};
let currentAssignments = {};
let currentQueueData = {};
let onlineBookingReminderIntervalId = null;
let onlineBookingReminderRunning = false;
let kioskCustomerDetailsSettings = {
  enabled: false,
  requireName: false,
  requirePhone: false,
  recallEnabled: false,
  serviceCategoriesEnabled: false,
  scheduledServicesEnabled: false,
  onlineBookingSlotsEnabled: true,
  onlineBookingSlotDurationMinutes: 30,
  onlineBookingSlotCapacity: 1,
  basicModeEnabled: false,
  allowOnlineBooking: false,
  bookingReminderEnabled: false,
  bookingReminderLeadMinutes: 30,
  bookingReminderEmailjsPublicKey: '',
  bookingReminderEmailjsServiceId: '',
  bookingReminderEmailjsTemplateId: ''
};

function normalizeCustomerDetailSettings(raw) {
  const data = raw || {};
  return {
    enabled: !!data.enabled,
    requireName: !!data.requireName,
    requirePhone: !!data.requirePhone,
    recallEnabled: !!data.recallEnabled,
    serviceCategoriesEnabled: !!data.serviceCategoriesEnabled,
    scheduledServicesEnabled: !!data.scheduledServicesEnabled,
    onlineBookingSlotsEnabled: data.onlineBookingSlotsEnabled !== undefined ? !!data.onlineBookingSlotsEnabled : true,
    onlineBookingSlotDurationMinutes: Math.max(5, Number(data.onlineBookingSlotDurationMinutes || 30) || 30),
    onlineBookingSlotCapacity: Math.max(1, Number(data.onlineBookingSlotCapacity || 1) || 1),
    basicModeEnabled: !!data.basicModeEnabled,
    mobileAppBlocked: !!data.mobileAppBlocked,
    allowOnlineBooking: !!data.allowOnlineBooking,
    autoReturnSeconds: Number(data.autoReturnSeconds || 0),
    tokenSequenceResetMinutes: Number(data.tokenSequenceResetMinutes || 0),
    bookingReminderEnabled: !!data.bookingReminderEnabled,
    bookingReminderLeadMinutes: Math.max(1, Number(data.bookingReminderLeadMinutes || 30) || 30),
    bookingReminderEmailjsPublicKey: String(data.bookingReminderEmailjsPublicKey || '').trim(),
    bookingReminderEmailjsServiceId: String(data.bookingReminderEmailjsServiceId || '').trim(),
    bookingReminderEmailjsTemplateId: String(data.bookingReminderEmailjsTemplateId || '').trim()
  };
}

function syncCustomizeControlsWithBasicMode() {
  const basicModeEnabled = !!$('#collect-basic-enabled')?.checked;
  const mobileAppBlocked = !!$('#block-mobile-app-enabled')?.checked;
  const scheduledServicesEnabled = !!$('#scheduled-services-enabled')?.checked;
  const bookingSlotsEnabled = $('#online-booking-slots-enabled');
  const bookingSlotDurationInput = $('#online-booking-slot-duration-minutes');
  const bookingReminderEnabledInput = $('#booking-reminder-enabled');
  const bookingReminderLeadInput = $('#booking-reminder-lead-minutes');
  const bookingReminderPublicKeyInput = $('#booking-reminder-emailjs-public-key');
  const bookingReminderServiceIdInput = $('#booking-reminder-emailjs-service-id');
  const bookingReminderTemplateIdInput = $('#booking-reminder-emailjs-template-id');
  const detailsEnabledInput = $('#collect-customer-details-enabled');
  const nameInput = $('#collect-customer-name-required');
  const phoneInput = $('#collect-customer-phone-required');
  const recallInput = $('#collect-recall-enabled');
  const nameRow = $('#customer-name-required-row');
  const phoneRow = $('#customer-phone-required-row');
  const customizeCard = $('#customer-details-customize-card');
  const bookingSlotCard = document.querySelector('.qm-booking-slot-card');
  const customizeStatus = $('#customize-settings-status');

  if(detailsEnabledInput) {
    detailsEnabledInput.disabled = basicModeEnabled;
    if(basicModeEnabled) {
      detailsEnabledInput.checked = false;
    }
  }

  if(nameInput) {
    nameInput.disabled = basicModeEnabled || !detailsEnabledInput?.checked;
    if(basicModeEnabled) {
      nameInput.checked = false;
    }
  }

  if(phoneInput) {
    phoneInput.disabled = basicModeEnabled || !detailsEnabledInput?.checked;
    if(basicModeEnabled) {
      phoneInput.checked = false;
    }
  }

  if(recallInput) {
    recallInput.disabled = basicModeEnabled;
    if(basicModeEnabled) {
      recallInput.checked = false;
    }
  }

  const mobileAppBlockedInput = $('#block-mobile-app-enabled');
  if(mobileAppBlockedInput) {
    mobileAppBlockedInput.disabled = basicModeEnabled;
    if(basicModeEnabled) {
      mobileAppBlockedInput.checked = false;
    }
  }

  const scheduledServicesInput = $('#scheduled-services-enabled');
  if(scheduledServicesInput) {
    scheduledServicesInput.disabled = basicModeEnabled;
    if(basicModeEnabled) {
      scheduledServicesInput.checked = false;
    }
  }

  if (bookingSlotsEnabled) {
    bookingSlotsEnabled.disabled = basicModeEnabled;
    if (basicModeEnabled) {
      bookingSlotsEnabled.checked = false;
    }
  }

  if (bookingSlotDurationInput) {
    bookingSlotDurationInput.disabled = basicModeEnabled || !bookingSlotsEnabled?.checked;
    if (basicModeEnabled) {
      bookingSlotDurationInput.value = '';
    }
  }

  if (bookingReminderEnabledInput) {
    bookingReminderEnabledInput.disabled = basicModeEnabled;
    if (basicModeEnabled) {
      bookingReminderEnabledInput.checked = false;
    }
  }

  const reminderFieldsDisabled = basicModeEnabled || !bookingReminderEnabledInput?.checked;
  if (bookingReminderLeadInput) {
    bookingReminderLeadInput.disabled = reminderFieldsDisabled;
  }
  if (bookingReminderPublicKeyInput) {
    bookingReminderPublicKeyInput.disabled = reminderFieldsDisabled;
  }
  if (bookingReminderServiceIdInput) {
    bookingReminderServiceIdInput.disabled = reminderFieldsDisabled;
  }
  if (bookingReminderTemplateIdInput) {
    bookingReminderTemplateIdInput.disabled = reminderFieldsDisabled;
  }

  if(nameRow) nameRow.style.display = basicModeEnabled ? 'none' : (detailsEnabledInput?.checked ? '' : 'none');
  if(phoneRow) phoneRow.style.display = basicModeEnabled ? 'none' : (detailsEnabledInput?.checked ? '' : 'none');
  if(customizeCard) customizeCard.style.display = basicModeEnabled ? 'none' : '';
  if(bookingSlotCard) bookingSlotCard.style.display = basicModeEnabled ? 'none' : '';

  if(customizeStatus && basicModeEnabled) {
    customizeStatus.textContent = 'Basic mode is on. Other customization options are hidden.';
  }
  const autoReturnInput = $('#kiosk-auto-return-seconds');
  if (autoReturnInput) autoReturnInput.value = kioskCustomerDetailsSettings.autoReturnSeconds || '';
  const tokenResetInput = $('#token-sequence-reset-minutes');
  if (tokenResetInput) tokenResetInput.value = kioskCustomerDetailsSettings.tokenSequenceResetMinutes || '';
}

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

      if(tabName === 'online-bookings') {
        renderOnlineBookings(currentQueueData, currentServices);
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
  async create(name, description = '', estimatedTime = 0, category = '') {
    if(!name || name.trim().length === 0) throw new Error('Service name required');
    const id = generateId();
    const normalizedCategory = normalizeServiceCategory(category);
    const serviceData = {
      id,
      name: name.trim(),
      description: description.trim(),
      category: normalizedCategory,
      status: 'active',
      onlineBookingEnabled: true,
      estimatedTime: parseInt(estimatedTime) || 0,
      scheduledServiceEnabled: false,
      schedule: null,
      bookingSlotMinutes: 0,
      bookingSlotCapacity: 1,
      createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    await db.ref(`users/${currentUserUID}/services/${id}`).set(serviceData);
    await syncPublicService(currentUserUID, id, serviceData);
    return id;
  },

  async update(id, data) {
    const currentSnap = await db.ref(`users/${currentUserUID}/services/${id}`).once('value');
    const currentData = currentSnap.val() || {};
    const normalizedUpdate = {
      ...data,
      category: data.category !== undefined
        ? normalizeServiceCategory(data.category)
        : normalizeServiceCategory(currentData.category)
    };
    const mergedData = {
      ...currentData,
      ...normalizedUpdate
    };
    await db.ref(`users/${currentUserUID}/services/${id}`).update(normalizedUpdate);
    await syncPublicService(currentUserUID, id, mergedData);
  },

  async delete(id) {
    await db.ref(`users/${currentUserUID}/services/${id}`).remove();
    await removePublicService(currentUserUID, id);
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
    const normalizedServiceIds = Array.from(new Set((serviceIds || []).map((serviceId) => String(serviceId || '').trim()).filter(Boolean)));
    const assignmentRef = db.ref(`users/${currentUserUID}/assignments/${counterId}`);
    const previousSnap = await assignmentRef.once('value');
    const previousAssignment = previousSnap.val() || {};
    const previousServiceIds = Array.from(new Set((previousAssignment.services || []).map((serviceId) => String(serviceId || '').trim()).filter(Boolean)));

    if (normalizedServiceIds.length === 0) {
      await assignmentRef.remove();
    } else {
      await assignmentRef.set({
        counterId,
        counterName,
        services: normalizedServiceIds,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
    }

    const counter = currentCounters[counterId] || {};
    const counterName = String(counter.name || counter.counterName || counterId || 'Counter').trim();
    const affectedServiceIds = Array.from(new Set([...previousServiceIds, ...normalizedServiceIds]));
    if (affectedServiceIds.length === 0) {
      return;
    }

    const queueSnap = await db.ref(`users/${currentUserUID}/queue`).once('value');
    const queueData = queueSnap.val() || {};
    const tokenSnap = await db.ref(`users/${currentUserUID}/tokens`).once('value');
    const tokenDataById = tokenSnap.val() || {};
    const serviceSet = new Set(normalizedServiceIds);
    const updates = {};

    affectedServiceIds.forEach((serviceId) => {
      const serviceQueue = queueData[serviceId] || {};
      const shouldAssign = serviceSet.has(serviceId);

      Object.entries(serviceQueue || {}).forEach(([tokenId]) => {
        const basePath = `users/${currentUserUID}/queue/${serviceId}/${tokenId}`;
        const nextCounterId = shouldAssign ? counterId : null;
        const nextCounterName = shouldAssign ? counterName : null;

        updates[`${basePath}/assignedCounterId`] = nextCounterId;
        updates[`${basePath}/assignedCounterName`] = nextCounterName;
        updates[`${basePath}/resolvedCounterName`] = nextCounterName;
        updates[`${basePath}/counterId`] = nextCounterId;
        updates[`${basePath}/counterName`] = nextCounterName;
        updates[`${basePath}/counter`] = nextCounterName;
        updates[`${basePath}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;

        const mirrorToken = tokenDataById[tokenId] || {};
        if (Object.keys(mirrorToken).length > 0) {
          const tokenBasePath = `users/${currentUserUID}/tokens/${tokenId}`;
          updates[`${tokenBasePath}/assignedCounterId`] = nextCounterId;
          updates[`${tokenBasePath}/assignedCounterName`] = nextCounterName;
          updates[`${tokenBasePath}/resolvedCounterName`] = nextCounterName;
          updates[`${tokenBasePath}/counterId`] = nextCounterId;
          updates[`${tokenBasePath}/counterName`] = nextCounterName;
          updates[`${tokenBasePath}/counter`] = nextCounterName;
          updates[`${tokenBasePath}/updatedAt`] = firebase.database.ServerValue.TIMESTAMP;
        }

        const customerUid = String(serviceQueue?.[tokenId]?.customerUid || mirrorToken.customerUid || '').trim();
        if (customerUid) {
          const customerBasePath = `appuserTokens/${customerUid}/${currentUserUID}/${tokenId}`;
          updates[`${customerBasePath}/assignedCounterId`] = nextCounterId;
          updates[`${customerBasePath}/assignedCounterName`] = nextCounterName;
          updates[`${customerBasePath}/resolvedCounterName`] = nextCounterName;
          updates[`${customerBasePath}/counterId`] = nextCounterId;
          updates[`${customerBasePath}/counterName`] = nextCounterName;
          updates[`${customerBasePath}/counter`] = nextCounterName;
        }
      });
    });

    if (Object.keys(updates).length > 0) {
      await db.ref().update(updates);
    }
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
    const id = tokenFactory.generateTokenId('QUEUE');
    const prefix = await tokenFactory.resolveOrganizationTokenPrefix(db, currentUserUID);
    const tokenNumber = await tokenFactory.generateSequentialTokenNumber(db, { organizationId: currentUserUID, prefix, serviceId });
    await db.ref(`users/${currentUserUID}/queue/${serviceId}/${id}`).set({
      ...tokenFactory.createBaseTokenData({
        tokenId: id,
        tokenNumber,
        organizationId: currentUserUID,
        kioskId: null,
        kioskName: null,
        serviceId,
        serviceName: null,
        customerUid: currentUserUID,
        source: 'admin'
      }),
      serviceId,
      description: description.trim()
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

  async deleteAllTokens() {
    // Collect all token IDs from queue and tokens mirrors, and remove them
    const queueSnap = await db.ref(`users/${currentUserUID}/queue`).once('value');
    const queueData = queueSnap.val() || {};
    const tokenSnap = await db.ref(`users/${currentUserUID}/tokens`).once('value');
    const tokenData = tokenSnap.val() || {};
    const appuserTokensSnap = await db.ref('appuserTokens').once('value');
    const appuserTokensData = appuserTokensSnap.val() || {};

    const updates = {};
    const queueTokenIds = new Set();
    const allTokenIdsToDelete = new Set();

    Object.entries(queueData).forEach(([serviceId, serviceQueue]) => {
      Object.keys(serviceQueue || {}).forEach((tokenId) => {
        queueTokenIds.add(tokenId);
        allTokenIdsToDelete.add(tokenId);
        updates[`users/${currentUserUID}/queue/${serviceId}/${tokenId}`] = null;
        updates[`users/${currentUserUID}/tokens/${tokenId}`] = null;

        const customerUid = String((serviceQueue && serviceQueue[tokenId] && serviceQueue[tokenId].customerUid) || (tokenData[tokenId] && tokenData[tokenId].customerUid) || '').trim();
        if (customerUid) {
          updates[`appuserTokens/${customerUid}/${currentUserUID}/${tokenId}`] = null;
        }
      });
    });

    // Also remove any leftover tokens present in tokens mirror but not in queue
    Object.keys(tokenData || {}).forEach((tokenId) => {
      allTokenIdsToDelete.add(tokenId);
      if (!queueTokenIds.has(tokenId)) {
        updates[`users/${currentUserUID}/tokens/${tokenId}`] = null;
        const customerUid = String(tokenData[tokenId] && tokenData[tokenId].customerUid || '').trim();
        if (customerUid) {
          updates[`appuserTokens/${customerUid}/${currentUserUID}/${tokenId}`] = null;
        }
      }
    });

    // Fallback sweep: remove org token copies from appuserTokens even when queue data
    // has missing customerUid (common with legacy kiosk/online-booking writes).
    if (allTokenIdsToDelete.size > 0) {
      Object.entries(appuserTokensData).forEach(([appUserId, orgMap]) => {
        const orgTokens = orgMap && orgMap[currentUserUID];
        if (!orgTokens || typeof orgTokens !== 'object') return;

        allTokenIdsToDelete.forEach((tokenId) => {
          if (Object.prototype.hasOwnProperty.call(orgTokens, tokenId)) {
            updates[`appuserTokens/${appUserId}/${currentUserUID}/${tokenId}`] = null;
          }
        });
      });
    }

    if (Object.keys(updates).length === 0) {
      // Nothing to update; ensure queue root removed
      await db.ref(`users/${currentUserUID}/queue`).remove();
      await db.ref(`users/${currentUserUID}/tokens`).remove();
      return;
    }

    await db.ref().update(updates);
  },

  async listenByService(serviceId, callback) {
    return db.ref(`users/${currentUserUID}/queue/${serviceId}`)
      .orderByChild('timestamp')
      .on('value', snap => {
        callback(snap.val() || {});
      });
  },

  listenAll(callback) {
    return db.ref(`users/${currentUserUID}/queue`).on('value', snap => {
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

const organizationSettingsDB = {
  async getCustomerDetailSettings() {
    const snap = await db.ref(`users/${currentUserUID}/settings/kioskCustomerDetails`).once('value');
    return normalizeCustomerDetailSettings(snap.val());
  },
  async saveCustomerDetailSettings(settings) {
    const normalized = normalizeCustomerDetailSettings(settings);
    await db.ref(`users/${currentUserUID}/settings/kioskCustomerDetails`).set({
      enabled: normalized.enabled,
      requireName: normalized.enabled ? normalized.requireName : false,
      requirePhone: normalized.enabled ? normalized.requirePhone : false,
      recallEnabled: !!normalized.recallEnabled,
      serviceCategoriesEnabled: !!normalized.serviceCategoriesEnabled,
      scheduledServicesEnabled: !!normalized.scheduledServicesEnabled,
      basicModeEnabled: !!normalized.basicModeEnabled,
      mobileAppBlocked: !!normalized.mobileAppBlocked,
      allowOnlineBooking: !!normalized.allowOnlineBooking,
      autoReturnSeconds: Number(normalized.autoReturnSeconds || 0),
      bookingReminderEnabled: !!normalized.bookingReminderEnabled,
      bookingReminderLeadMinutes: Math.max(1, Number(normalized.bookingReminderLeadMinutes || 30) || 30),
      bookingReminderEmailjsPublicKey: String(normalized.bookingReminderEmailjsPublicKey || '').trim(),
      bookingReminderEmailjsServiceId: String(normalized.bookingReminderEmailjsServiceId || '').trim(),
      bookingReminderEmailjsTemplateId: String(normalized.bookingReminderEmailjsTemplateId || '').trim(),
      tokenSequenceResetMinutes: Number(normalized.tokenSequenceResetMinutes || 0),
      updatedAt: firebase.database.ServerValue.TIMESTAMP,
      updatedBy: auth.currentUser ? auth.currentUser.uid : currentUserUID
    });

    return normalized;
  }
};

// Open Hours CRUD
organizationSettingsDB.getOpenHours = async function() {
  const snap = await db.ref(`users/${currentUserUID}/settings/openHours`).once('value');
  return snap.val() || {};
};

organizationSettingsDB.saveOpenHours = async function(openHours) {
  await db.ref(`users/${currentUserUID}/settings/openHours`).set({
    ...(openHours || {}),
    updatedAt: firebase.database.ServerValue.TIMESTAMP,
    updatedBy: auth.currentUser ? auth.currentUser.uid : currentUserUID
  });
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
    item.dataset.id = id;
    item.innerHTML =
      '<div class="qm-item-info">' +
      '<div class="qm-item-name">' + escapeHtml(counter.name) + '</div>' +
      '<div class="qm-item-meta">Status: <span class="qm-meta-highlight">' + escapeHtml(counter.status || 'active') + '</span></div>' +
      '<div class="qm-item-meta">Created: ' + formatDate(counter.createdAt) + '</div>' +
      '</div>' +
      '<div class="qm-item-actions">' +
      '<button class="btn-edit" onclick="editCounter(\'' + id + '\')">Edit</button>' +
      '<button class="btn-delete" onclick="deleteCounter(\'' + id + '\')">Delete</button>' +
      '</div>';
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
    item.dataset.id = id;
    item.innerHTML =
      '<div class="qm-item-info">' +
      '<div class="qm-item-name">' + escapeHtml(service.name) + '</div>' +
      '<div class="qm-item-meta">' + escapeHtml(service.description || '(no description)') + '</div>' +
      (service.category ? '<div class="qm-item-meta">Category: <span class="qm-meta-highlight">' + escapeHtml(service.category) + '</span></div>' : '') +
      (service.scheduledServiceEnabled ? '<div class="qm-item-meta"><span class="qm-schedule-badge">Scheduled</span> ' + escapeHtml(formatServiceScheduleSummary(service)) + '</div>' : '') +
      (service.scheduledServiceEnabled ? '<div class="qm-item-meta"><span class="qm-schedule-badge qm-slot-badge">Slots</span> ' + escapeHtml(formatServiceBookingSlotSummary(service)) + '</div>' : '') +
      '<div class="qm-item-meta">Est. time: <span class="qm-meta-highlight">' + (service.estimatedTime || 0) + '</span> min' +
      ' | Status: <span class="qm-meta-highlight">' + escapeHtml(service.status || 'active') + '</span></div>' +
      '</div>' +
      '<div class="qm-item-actions">' +
      '<button class="btn-edit" onclick="editService(\'' + id + '\')">Edit</button>' +
      '<button class="btn-delete" onclick="deleteService(\'' + id + '\')">Delete</button>' +
      '</div>';
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
    const displayCounterName = String(assignment?.counterName || counter?.name || counter?.counterName || counterId || 'Counter').trim();
    const serviceNames = assignment.services
      .map(sid => services[sid] ? services[sid].name : 'Unknown')
      .join(', ');

    const item = document.createElement('div');
    item.className = 'qm-item';
    item.innerHTML = `
      <div class="qm-item-info">
        <div class="qm-item-name">${escapeHtml(displayCounterName)}</div>
        <div class="qm-item-meta">Services assigned: <span class="qm-meta-highlight">${assignment.services.length}</span></div>
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

function formatServiceScheduleSummary(service) {
  const schedule = service?.schedule || {};
  const days = Array.isArray(schedule.days) ? schedule.days : [];
  const open = schedule.open || '';
  const close = schedule.close || '';
  const labels = {
    sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat'
  };
  const dayText = days.length
    ? days.map((day) => labels[day] || day).join(', ')
    : 'No days selected';
  if (!open || !close) return dayText;
  return `${dayText} • ${open} - ${close}`;
}

function formatServiceBookingSlotSummary(service) {
  const slotMinutes = Number(service?.bookingSlotMinutes || service?.schedule?.slotMinutes || service?.slotDurationMinutes || 0) || 0;
  if (!service?.scheduledServiceEnabled) {
    return 'Time slots are off';
  }
  return `${slotMinutes || 'Auto'} min slots`;
}

function toggleScheduledServicesTabVisibility(forceVisible) {
  const tab = document.querySelector('.qm-tab[data-tab="scheduled-services"]');
  const panel = $('#scheduled-services');
  const shouldShow = typeof forceVisible === 'boolean'
    ? forceVisible
    : !!kioskCustomerDetailsSettings.scheduledServicesEnabled;

  if (tab) tab.style.display = shouldShow ? '' : 'none';
  if (panel) panel.style.display = shouldShow ? '' : 'none';

  if (!shouldShow) {
    const activeTab = document.querySelector('.qm-tab.active');
    const activePanel = document.querySelector('.qm-content.active');
    if (activeTab && activeTab.dataset.tab === 'scheduled-services') {
      const servicesTab = document.querySelector('.qm-tab[data-tab="services"]');
      servicesTab?.click();
    }
    if (activePanel && activePanel.id === 'scheduled-services') {
      const servicesPanel = $('#services');
      activePanel.classList.remove('active');
      servicesPanel?.classList.add('active');
    }
  }
}

function renderScheduledServices(services) {
  const list = $('#scheduled-services-list');
  if (!list) return;

  if (!kioskCustomerDetailsSettings.scheduledServicesEnabled) {
    list.innerHTML = '<p class="muted small">Enable scheduled services in Customize to configure service availability.</p>';
    return;
  }

  const entries = Object.entries(services || {});
  if (!entries.length) {
    list.innerHTML = '<p class="muted small">No services. Add one first.</p>';
    return;
  }

  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  list.innerHTML = '';
  entries.forEach(([serviceId, service]) => {
    const schedule = service?.schedule || {};
    const enabled = !!service?.scheduledServiceEnabled;
    const days = Array.isArray(schedule.days) ? schedule.days : [];
    const open = schedule.open || '09:00';
    const close = schedule.close || '17:00';
    const slotMinutes = Number(service?.bookingSlotMinutes || schedule.slotMinutes || service?.slotDurationMinutes || service?.estimatedTime || 30) || 30;
    const item = document.createElement('div');
    item.className = 'qm-item qm-schedule-item';
    item.dataset.id = serviceId;
    item.innerHTML = `
      <div class="qm-item-info qm-schedule-info">
        <div class="qm-item-name">${escapeHtml(service.name)}</div>
        <div class="qm-item-meta">${escapeHtml(service.description || '(no description)')}</div>
        <div class="qm-item-meta schedule-summary">${escapeHtml(formatServiceScheduleSummary(service))}</div>
      </div>
      <div class="qm-schedule-form">
        <label class="qm-checkbox-row qm-schedule-enabled-row">
          <input type="checkbox" class="online-booking-enabled" ${service.onlineBookingEnabled === false ? '' : 'checked'} />
          <span>Allow online booking for this service</span>
        </label>
        <label class="qm-checkbox-row qm-schedule-enabled-row">
          <input type="checkbox" class="scheduled-service-enabled" ${enabled ? 'checked' : ''} />
          <span>Service is scheduled only</span>
        </label>
        <div class="qm-schedule-hours">
          <label>Open <input type="time" class="scheduled-service-open" value="${escapeHtml(open)}" /></label>
          <label>Close <input type="time" class="scheduled-service-close" value="${escapeHtml(close)}" /></label>
        </div>
        <div class="qm-schedule-hours">
          <label>Slot duration (minutes) <input type="number" min="1" step="1" class="scheduled-service-slot-minutes" value="${escapeHtml(slotMinutes)}" /></label>
        </div>
        <div class="qm-schedule-days">
          ${dayKeys.map((day, index) => `
            <label class="qm-schedule-day-pill">
              <input type="checkbox" class="scheduled-service-day" value="${day}" ${days.includes(day) ? 'checked' : ''} />
              <span>${dayLabels[index]}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
    list.appendChild(item);
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
        <span class="service-checkbox-meta">${service.description || '(no description)'} • ${service.estimatedTime}min</span>
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

  if(!Object.keys(services).length) {
    el.innerHTML = '<p class="lead">No services configured.</p>';
    return;
  }

  // Summary table
  let html = '<table class="qm-table"><thead><tr>' +
    '<th>Service</th><th>Waiting</th><th>Serving</th><th>Status</th>' +
    '</tr></thead><tbody>';

  Object.entries(services).forEach(([serviceId, service]) => {
    const serviceQueue = queueData[serviceId] || {};
    const waiting = Object.values(serviceQueue).filter(t => t.status === 'waiting').length;
    const serving = Object.values(serviceQueue).filter(t => t.status === 'serving').length;
    const status = waiting === 0 && serving === 0 ? 'Idle' : (serving > 0 ? 'Serving' : 'Busy');

    html +=
      '<tr>' +
      '<td>' + escapeHtml(service.name) + '</td>' +
      '<td><strong>' + waiting + '</strong></td>' +
      '<td>' + serving + '</td>' +
      '<td><span class="qm-status-badge qm-status-' + status.toLowerCase() + '">' + status + '</span></td>' +
      '</tr>';
  });

  html += '</tbody></table>';

  // Per-service active token list
  let hasActiveTokens = false;
  Object.entries(services).forEach(([serviceId, service]) => {
    const serviceQueue = queueData[serviceId] || {};
    const tokens = Object.values(serviceQueue)
      .filter(function(t) { return t.status === 'waiting' || t.status === 'serving'; })
      .sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });

    if(!tokens.length) return;
    hasActiveTokens = true;

    html += '<div class="qm-queue-service-block">' +
      '<div class="qm-queue-service-header">' + escapeHtml(service.name) + '</div>' +
      '<div class="qm-token-rows">';

    tokens.forEach(function(token) {
      var isMulti = (token.serviceCount && token.serviceCount > 1) ||
                    (Array.isArray(token.selectedServices) && token.selectedServices.length > 1);
      var multiCount = token.serviceCount ||
                       (Array.isArray(token.selectedServices) ? token.selectedServices.length : 1);
      var multiInfo = isMulti
        ? '<span class="qm-multi-badge">' + multiCount + ' services</span>'
        : '';
      var kioskBadge = token.source === 'kiosk'
        ? '<span class="qm-source-badge">KIOSK</span>'
        : '';
      var servingClass = token.status === 'serving' ? ' qm-token-serving' : '';

      html += '<div class="qm-token-row' + servingClass + '">' +
        '<span class="qm-token-num">' + escapeHtml(token.tokenNumber || token.id) + '</span>' +
        '<span class="qm-token-svc">' + escapeHtml(token.serviceName || service.name) + '</span>' +
        multiInfo + kioskBadge +
        '<span class="qm-token-stat qm-stat-' + (token.status || 'waiting') + '">' + (token.status || 'waiting') + '</span>' +
        '</div>';
    });

    html += '</div></div>';
  });

  if(!hasActiveTokens) {
    html += '<p class="lead" style="margin-top:16px;">No active tokens in queue.</p>';
  }

  el.innerHTML = html;
}

function parseDateTimeMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const date = new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatDateTimeValue(value) {
  const ms = parseDateTimeMs(value);
  if (!ms) return 'Not scheduled';
  return new Date(ms).toLocaleString();
}

function isOnlineBookingToken(token) {
  const source = String(token?.source || '').trim().toLowerCase();
  const kioskId = String(token?.kioskId || '').trim().toUpperCase();
  const kioskName = String(token?.kioskName || '').trim().toLowerCase();

  if (source === 'mobile-app' || source === 'mobile app' || source === 'online-booking') {
    return true;
  }

  if (kioskId === 'ONLINE_BOOKING') {
    return true;
  }

  if (kioskName === 'online booking') {
    return true;
  }

  return false;
}

function collectOnlineBookings(queueData, services) {
  const bookings = [];
  Object.entries(queueData || {}).forEach(([serviceId, serviceQueue]) => {
    const service = services?.[serviceId] || {};
    Object.entries(serviceQueue || {}).forEach(([tokenId, token]) => {
      if (!isOnlineBookingToken(token)) return;

      const scheduledMs = parseDateTimeMs(token.scheduledFor) || parseDateTimeMs(token.bookingSlotEtaMs);
      bookings.push({
        tokenId,
        serviceId,
        serviceName: token?.serviceName || service?.name || serviceId,
        tokenNumber: token?.tokenNumber || tokenId,
        customerName: token?.customerName || '',
        customerEmail: token?.customerEmail || '',
        customerUid: token?.customerUid || '',
        status: String(token?.status || 'waiting').toLowerCase(),
        scheduledMs,
        scheduledFor: token?.scheduledFor || null,
        slotLabel: token?.bookingSlotKey || '',
        livePosition: token?.livePosition || token?.bookingSlotPosition || null,
        reminderEmailSentAt: token?.reminderEmailSentAt || null,
        reminderEmailStatus: token?.reminderEmailStatus || '',
        reminderEmailLastAttemptAt: token?.reminderEmailLastAttemptAt || null,
        reminderEmailError: token?.reminderEmailError || ''
      });
    });
  });

  bookings.sort((left, right) => {
    const leftTime = left.scheduledMs || Number.MAX_SAFE_INTEGER;
    const rightTime = right.scheduledMs || Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left.tokenNumber).localeCompare(String(right.tokenNumber));
  });

  return bookings;
}

function getBookingReminderConfig() {
  return {
    enabled: !!kioskCustomerDetailsSettings.bookingReminderEnabled,
    leadMinutes: Math.max(1, Number(kioskCustomerDetailsSettings.bookingReminderLeadMinutes || 30) || 30),
    publicKey: String(kioskCustomerDetailsSettings.bookingReminderEmailjsPublicKey || '').trim(),
    serviceId: String(kioskCustomerDetailsSettings.bookingReminderEmailjsServiceId || '').trim(),
    templateId: String(kioskCustomerDetailsSettings.bookingReminderEmailjsTemplateId || '').trim()
  };
}

function hasCompleteEmailJsConfig(config) {
  if (!config) return false;
  return !!(config.publicKey && config.serviceId && config.templateId);
}

function getReminderStatusBadge(booking) {
  if (booking.reminderEmailSentAt) {
    return '<span class="qm-reminder-state sent">Sent</span>';
  }
  if (String(booking.reminderEmailStatus || '').toLowerCase() === 'failed') {
    return '<span class="qm-reminder-state failed">Failed</span>';
  }
  return '<span class="qm-reminder-state pending">Pending</span>';
}

function getBookingStatusBadge(status) {
  const normalized = String(status || 'waiting').toLowerCase();
  const safe = ['scheduled', 'waiting', 'serving', 'done'].includes(normalized) ? normalized : 'waiting';
  return `<span class="qm-booking-status-badge qm-booking-status-${safe}">${safe}</span>`;
}

function getOnlineBookingByTokenId(tokenId) {
  const bookings = collectOnlineBookings(currentQueueData, currentServices);
  return bookings.find((booking) => booking.tokenId === tokenId) || null;
}

async function updateBookingReminderFields(booking, fields) {
  if (!booking || !booking.serviceId || !booking.tokenId) return;
  const updates = {};
  const queueBasePath = `users/${currentUserUID}/queue/${booking.serviceId}/${booking.tokenId}`;
  Object.entries(fields || {}).forEach(([key, value]) => {
    updates[`${queueBasePath}/${key}`] = value;
  });

  const customerUid = String(booking.customerUid || '').trim();
  if (customerUid) {
    const customerBasePath = `appuserTokens/${customerUid}/${currentUserUID}/${booking.tokenId}`;
    Object.entries(fields || {}).forEach(([key, value]) => {
      updates[`${customerBasePath}/${key}`] = value;
    });
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }
}

async function sendReminderThroughEmailJs(booking) {
  const config = getBookingReminderConfig();
  if (!config.publicKey || !config.serviceId || !config.templateId) {
    throw new Error('Reminder email requires EmailJS keys in Customize.');
  }

  const recipient = String(booking.customerEmail || '').trim();
  if (!recipient || !recipient.includes('@')) {
    throw new Error('Booking has no valid customer email.');
  }

  const scheduleLabel = formatDateTimeValue(booking.scheduledFor || booking.scheduledMs);
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      template_params: {
        to_email: recipient,
        to_name: booking.customerName || 'Customer',
        organization_name: currentOrganizationProfile?.profile?.name || currentOrganizationProfile?.name || currentUserUID,
        token_number: booking.tokenNumber,
        service_name: booking.serviceName,
        scheduled_time: scheduleLabel,
        slot_label: booking.slotLabel || 'N/A',
        live_position: booking.livePosition || 'N/A'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email send failed (${response.status}): ${errorText || 'Unknown error'}`);
  }
}

async function sendBookingReminderNow(tokenId) {
  const booking = getOnlineBookingByTokenId(tokenId);
  if (!booking) {
    showMessage('Booking not found. Try refresh.', 'error');
    return;
  }

  try {
    await sendReminderThroughEmailJs(booking);
    await updateBookingReminderFields(booking, {
      reminderEmailSentAt: firebase.database.ServerValue.TIMESTAMP,
      reminderEmailStatus: 'sent',
      reminderEmailLastAttemptAt: firebase.database.ServerValue.TIMESTAMP,
      reminderEmailError: null,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    showMessage(`Reminder email sent for ${booking.tokenNumber}.`, 'success');
  } catch (err) {
    await updateBookingReminderFields(booking, {
      reminderEmailStatus: 'failed',
      reminderEmailLastAttemptAt: firebase.database.ServerValue.TIMESTAMP,
      reminderEmailError: String(err?.message || 'Failed to send reminder').slice(0, 250),
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
    showMessage('Reminder email failed: ' + err.message, 'error');
  }
}

window.sendBookingReminderNow = sendBookingReminderNow;

function renderOnlineBookings(queueData, services) {
  const summaryEl = $('#online-bookings-summary');
  const listEl = $('#online-bookings-list');
  if (!summaryEl || !listEl) return;

  const bookings = collectOnlineBookings(queueData, services);
  const scheduledBookings = bookings.filter((booking) => booking.status === 'scheduled');
  const sentReminders = bookings.filter((booking) => booking.reminderEmailSentAt).length;
  const config = getBookingReminderConfig();
  const hasKeys = hasCompleteEmailJsConfig(config);
  const setupWarning = config.enabled && !hasKeys
    ? ' Email reminders are enabled, but EmailJS keys are missing in Customize.'
    : '';

  summaryEl.textContent = `${bookings.length} online booking(s), ${scheduledBookings.length} scheduled, ${sentReminders} reminder email(s) sent. Auto-reminder: ${config.enabled ? `ON (${config.leadMinutes} min before)` : 'OFF'}.${setupWarning}`;
  summaryEl.classList.toggle('warning', !!setupWarning);

  if (!bookings.length) {
    listEl.innerHTML = '<p class="muted small">No online bookings found yet.</p>';
    return;
  }

  let html = '<div class="qm-online-bookings-table-wrap"><table class="qm-online-bookings-table"><thead><tr>' +
    '<th>Token</th><th>Customer</th><th>Service</th><th>Scheduled Time</th><th>Status</th><th>Reminder</th><th>Action</th>' +
    '</tr></thead><tbody>';

  bookings.forEach((booking) => {
    const customerLabel = booking.customerName || booking.customerEmail || booking.customerUid || 'Unknown customer';
    const reminderBadge = getReminderStatusBadge(booking);
    const reminderMeta = booking.reminderEmailSentAt
      ? ` at ${escapeHtml(formatDate(booking.reminderEmailSentAt))}`
      : (booking.reminderEmailError ? ` (${escapeHtml(booking.reminderEmailError)})` : '');
    const disableManualButton = !booking.customerEmail || booking.reminderEmailSentAt || !hasKeys;
    const sendButtonTitle = !hasKeys
      ? 'Configure EmailJS keys in Customize first'
      : (!booking.customerEmail ? 'Customer email is missing' : (booking.reminderEmailSentAt ? 'Reminder already sent' : 'Send reminder now'));

    html += '<tr>' +
      `<td><strong>${escapeHtml(booking.tokenNumber)}</strong><div class="qm-item-meta">${escapeHtml(booking.slotLabel || '')}</div></td>` +
      `<td>${escapeHtml(customerLabel)}<div class="qm-item-meta">${escapeHtml(booking.customerEmail || '')}</div></td>` +
      `<td>${escapeHtml(booking.serviceName)}<div class="qm-item-meta">Position: ${escapeHtml(String(booking.livePosition || '-'))}</div></td>` +
      `<td>${escapeHtml(formatDateTimeValue(booking.scheduledFor || booking.scheduledMs))}</td>` +
      `<td>${getBookingStatusBadge(booking.status)}</td>` +
      `<td>${reminderBadge}<span class="qm-item-meta">${reminderMeta}</span></td>` +
        `<td><button type="button" class="qm-inline-reminder-btn" title="${escapeHtml(sendButtonTitle)}" onclick="sendBookingReminderNow('${escapeHtml(booking.tokenId)}')" ${disableManualButton ? 'disabled' : ''}>Send Now</button></td>` +
      '</tr>';
  });

  html += '</tbody></table></div>';
  listEl.innerHTML = html;
}

async function processAutomaticBookingReminders() {
  if (!currentUserUID || onlineBookingReminderRunning) return;

  const config = getBookingReminderConfig();
  if (!config.enabled) return;
  if (!hasCompleteEmailJsConfig(config)) return;

  onlineBookingReminderRunning = true;
  try {
    const nowMs = Date.now();
    const leadMs = config.leadMinutes * 60000;
    const bookings = collectOnlineBookings(currentQueueData, currentServices)
      .filter((booking) => booking.status === 'scheduled')
      .filter((booking) => !booking.reminderEmailSentAt)
      .filter((booking) => !!booking.customerEmail)
      .filter((booking) => {
        const scheduledMs = booking.scheduledMs;
        if (!scheduledMs) return false;
        const diff = scheduledMs - nowMs;
        if (diff < 0 || diff > leadMs) return false;
        const lastAttemptMs = parseDateTimeMs(booking.reminderEmailLastAttemptAt);
        if (!lastAttemptMs) return true;
        return (nowMs - lastAttemptMs) >= 10 * 60000;
      });

    for (const booking of bookings) {
      try {
        await sendReminderThroughEmailJs(booking);
        await updateBookingReminderFields(booking, {
          reminderEmailSentAt: firebase.database.ServerValue.TIMESTAMP,
          reminderEmailStatus: 'sent',
          reminderEmailLastAttemptAt: firebase.database.ServerValue.TIMESTAMP,
          reminderEmailError: null,
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (err) {
        await updateBookingReminderFields(booking, {
          reminderEmailStatus: 'failed',
          reminderEmailLastAttemptAt: firebase.database.ServerValue.TIMESTAMP,
          reminderEmailError: String(err?.message || 'Failed to send reminder').slice(0, 250),
          updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
      }
    }
  } finally {
    onlineBookingReminderRunning = false;
  }
}

function startOnlineBookingReminderWorker() {
  if (onlineBookingReminderIntervalId) {
    clearInterval(onlineBookingReminderIntervalId);
    onlineBookingReminderIntervalId = null;
  }

  onlineBookingReminderIntervalId = window.setInterval(() => {
    processAutomaticBookingReminders().catch((err) => {
      console.log('Auto reminder run failed', err);
    });
  }, 60000);

  processAutomaticBookingReminders().catch((err) => {
    console.log('Initial auto reminder run failed', err);
  });
}

// ============================================================
// EVENT HANDLERS
// ============================================================

// ============================================================
// EVENT LISTENERS SETUP
// ============================================================

function attachEventListeners() {
  // Queue management
  const deleteAllTokensBtn = $('#delete-all-tokens');
  if(deleteAllTokensBtn) {
    deleteAllTokensBtn.addEventListener('click', async () => {
      const tokenCount = Object.values(currentQueueData || {}).reduce((count, serviceQueue) => {
        return count + Object.keys(serviceQueue || {}).length;
      }, 0);

      if(tokenCount === 0) {
        showMessage('There are no tokens to delete.', 'info');
        return;
      }

      const confirmed = window.confirm(`Delete all ${tokenCount} token(s) in this queue? This cannot be undone.`);
      if(!confirmed) return;

      deleteAllTokensBtn.disabled = true;
      try {
        await queueDB.deleteAllTokens();
        currentQueueData = {};
        renderQueueStatus(currentQueueData, currentServices);
        showMessage('All tokens deleted successfully', 'success');
      } catch(err) {
        showMessage(err.message, 'error');
      } finally {
        deleteAllTokensBtn.disabled = false;
      }
    });
  }

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
      const category = $('#service-category')?.value || '';
      if(!name) {
        showMessage('Please enter service name', 'error');
        return;
      }
      try {
        await servicesDB.create(name, desc, time, category);
        $('#service-name').value = '';
        $('#service-desc').value = '';
        $('#service-time').value = '';
        if($('#service-category')) $('#service-category').value = '';
        showMessage('Service added successfully', 'success');
      } catch(err) {
        showMessage(err.message, 'error');
      }
    });
  }

  const refreshOnlineBookingsBtn = $('#refresh-online-bookings');
  if (refreshOnlineBookingsBtn) {
    refreshOnlineBookingsBtn.addEventListener('click', () => {
      renderOnlineBookings(currentQueueData, currentServices);
      showMessage('Online bookings refreshed.', 'success');
    });
  }

  const reloadScheduledServicesBtn = $('#reload-scheduled-services');
  if (reloadScheduledServicesBtn) {
    reloadScheduledServicesBtn.addEventListener('click', () => {
      renderScheduledServices(currentServices);
      showMessage('Scheduled services reloaded.', 'success');
    });
  }

  const saveScheduledServicesBtn = $('#save-scheduled-services');
  if (saveScheduledServicesBtn) {
    saveScheduledServicesBtn.addEventListener('click', async () => {
      if (!kioskCustomerDetailsSettings.scheduledServicesEnabled) {
        showMessage('Enable scheduled services in Customize first.', 'error');
        return;
      }

      try {
        const rows = document.querySelectorAll('.qm-schedule-item');
        for (const row of rows) {
          const serviceId = row.dataset.id;
          const onlineBookingEnabled = !!row.querySelector('.online-booking-enabled')?.checked;
          const enabled = !!row.querySelector('.scheduled-service-enabled')?.checked;
          const open = row.querySelector('.scheduled-service-open')?.value || '';
          const close = row.querySelector('.scheduled-service-close')?.value || '';
          const days = Array.from(row.querySelectorAll('.scheduled-service-day:checked')).map((input) => input.value);
          const slotMinutes = Number(row.querySelector('.scheduled-service-slot-minutes')?.value || 0) || 0;
          const currentService = currentServices[serviceId] || {};
          const serviceMinutes = Number(currentService.estimatedTime || currentService.serviceEstimatedTime || 0) || 0;
          const slotCapacity = serviceMinutes > 0 && slotMinutes > 0
            ? Math.max(1, Math.floor(slotMinutes / serviceMinutes))
            : 1;
          const mergedService = {
            ...currentService,
            onlineBookingEnabled,
            scheduledServiceEnabled: enabled,
            schedule: enabled ? { days, open, close, slotMinutes, capacity: slotCapacity } : null,
            bookingSlotMinutes: enabled ? slotMinutes : 0,
            bookingSlotCapacity: enabled ? slotCapacity : 1,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
          };

          await db.ref(`users/${currentUserUID}/services/${serviceId}`).update(mergedService);
          await syncPublicService(currentUserUID, serviceId, mergedService);
          currentServices[serviceId] = mergedService;
        }
        renderServices(currentServices);
        renderScheduledServices(currentServices);
        showMessage('Scheduled services saved.', 'success');
      } catch (err) {
        showMessage('Failed to save scheduled services: ' + err.message, 'error');
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

      if (serviceIds.length === 0) {
        showMessage('Select at least one service before saving the assignment.', 'error');
        return;
      }

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

  // Migrate test service names
  const migrateServiceBtn = $('#migrate-service-names');
  if(migrateServiceBtn) {
    migrateServiceBtn.addEventListener('click', cleanTestServiceNames);
  }

  // Migrate test counter names
  const migrateCounterBtn = $('#migrate-counter-names');
  if(migrateCounterBtn) {
    migrateCounterBtn.addEventListener('click', cleanTestCounterNames);
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
      window.location.href = '../index.html';
    });
  }

  const detailsEnabledInput = $('#collect-customer-details-enabled');
  if(detailsEnabledInput) {
    detailsEnabledInput.addEventListener('change', () => {
      syncCustomizeControlsWithBasicMode();
    });
  }

  const basicModeInput = $('#collect-basic-enabled');
  if(basicModeInput) {
    basicModeInput.addEventListener('change', async () => {
      syncCustomizeControlsWithBasicMode();

      const saveBtn = $('#save-customer-detail-settings');
      if (!saveBtn) {
        showMessage('Basic mode changed, but save button was not found.', 'error');
        return;
      }

      // Persist immediately so the setting is always written to DB when toggled.
      saveBtn.click();
    });
  }

  const bookingReminderEnabledInput = $('#booking-reminder-enabled');
  if (bookingReminderEnabledInput) {
    bookingReminderEnabledInput.addEventListener('change', () => {
      syncCustomizeControlsWithBasicMode();
    });
  }

  const saveCustomerSettingsBtn = $('#save-customer-detail-settings');
  if(saveCustomerSettingsBtn) {
    saveCustomerSettingsBtn.addEventListener('click', async () => {
      const basicModeEnabled = !!$('#collect-basic-enabled')?.checked;
      const enabled = basicModeEnabled ? false : !!$('#collect-customer-details-enabled')?.checked;
      const requireName = basicModeEnabled ? false : (enabled && !!$('#collect-customer-name-required')?.checked);
      const requirePhone = basicModeEnabled ? false : (enabled && !!$('#collect-customer-phone-required')?.checked);
      const recallEnabled = basicModeEnabled ? false : !!$('#collect-recall-enabled')?.checked;
      const serviceCategoriesEnabled = !!$('#service-categories-enabled')?.checked;
      const scheduledServicesEnabled = basicModeEnabled ? false : !!$('#scheduled-services-enabled')?.checked;
      const onlineBookingSlotsEnabled = basicModeEnabled ? false : !!$('#online-booking-slots-enabled')?.checked;
      const onlineBookingSlotDurationMinutes = Math.max(5, Number($('#online-booking-slot-duration-minutes')?.value || 30) || 30);
      const bookingReminderEnabled = !!$('#booking-reminder-enabled')?.checked;
      const bookingReminderLeadMinutes = Math.max(1, Number($('#booking-reminder-lead-minutes')?.value || 30) || 30);
      const bookingReminderEmailjsPublicKey = String($('#booking-reminder-emailjs-public-key')?.value || '').trim();
      const bookingReminderEmailjsServiceId = String($('#booking-reminder-emailjs-service-id')?.value || '').trim();
      const bookingReminderEmailjsTemplateId = String($('#booking-reminder-emailjs-template-id')?.value || '').trim();
      const mobileAppBlocked = basicModeEnabled ? false : !!$('#block-mobile-app-enabled')?.checked;
      const allowOnlineBooking = !!$('#allow-online-booking-enabled')?.checked;
      const tokenResetMinutes = Number($('#token-sequence-reset-minutes')?.value || 0);

      try {
        const autoReturn = Number($('#kiosk-auto-return-seconds')?.value || 0);
        kioskCustomerDetailsSettings = await organizationSettingsDB.saveCustomerDetailSettings({
          enabled,
          requireName,
          requirePhone,
          recallEnabled,
          serviceCategoriesEnabled,
          scheduledServicesEnabled,
          onlineBookingSlotsEnabled,
          onlineBookingSlotDurationMinutes,
          bookingReminderEnabled,
          bookingReminderLeadMinutes,
          bookingReminderEmailjsPublicKey,
          bookingReminderEmailjsServiceId,
          bookingReminderEmailjsTemplateId,
          basicModeEnabled,
          mobileAppBlocked,
          allowOnlineBooking,
          autoReturnSeconds: autoReturn,
          tokenSequenceResetMinutes: tokenResetMinutes
        });
        await syncPublicOrganizationMeta();
        renderCustomizeSettings();
        showMessage('Customize settings saved', 'success');
      } catch(err) {
        showMessage('Failed to save customize settings: ' + err.message, 'error');
      }
    });
  }

  // Open Hours load/save
  const loadOpenHoursBtn = $('#load-open-hours');
  const saveOpenHoursBtn = $('#save-open-hours');
  if (loadOpenHoursBtn) {
    loadOpenHoursBtn.addEventListener('click', async () => {
      try {
        const hours = await organizationSettingsDB.getOpenHours();
        renderOpenHours(hours);
        showMessage('Open hours loaded.', 'success');
      } catch (err) {
        showMessage('Failed to load open hours: ' + err.message, 'error');
      }
    });
  }

  if (saveOpenHoursBtn) {
    saveOpenHoursBtn.addEventListener('click', async () => {
      try {
        const rows = document.querySelectorAll('.open-hours-row');
        const payload = {};
        rows.forEach((row) => {
          const day = row.dataset.day;
          const enabled = row.querySelector('.oh-enabled').checked;
          const open = row.querySelector('.oh-open').value || '';
          const close = row.querySelector('.oh-close').value || '';
          payload[day] = { enabled, open, close };
        });
        await organizationSettingsDB.saveOpenHours(payload);
        showMessage('Open hours saved.', 'success');
      } catch (err) {
        showMessage('Failed to save open hours: ' + err.message, 'error');
      }
    });
  }
}

// Render Open Hours UI rows
function renderOpenHours(openHours) {
  const container = $('#open-hours-rows');
  if (!container) return;
  const days = ['sun','mon','tue','wed','thu','fri','sat'];
  const labels = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  container.innerHTML = '';
  days.forEach((d, idx) => {
    const data = openHours && openHours[d] ? openHours[d] : { enabled: true, open: '09:00', close: '17:00' };
    const row = document.createElement('div');
    row.className = 'open-hours-row';
    row.dataset.day = d;
    row.innerHTML = `
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <input type="checkbox" class="oh-enabled" ${data.enabled ? 'checked' : ''} />
        <strong style="width:120px;display:inline-block">${labels[idx]}</strong>
        <input type="time" class="oh-open" value="${data.open || ''}" />
        <span style="margin:0 6px;">to</span>
        <input type="time" class="oh-close" value="${data.close || ''}" />
      </label>
    `;
    container.appendChild(row);
  });
}

// Load open hours on initial profile load
async function loadInitialOpenHours() {
  try {
    const hours = await organizationSettingsDB.getOpenHours();
    renderOpenHours(hours);
  } catch (err) {
    // ignore silently
  }
}

function renderCustomizeSettings() {
  const enabledInput = $('#collect-customer-details-enabled');
  const nameInput = $('#collect-customer-name-required');
  const phoneInput = $('#collect-customer-phone-required');
  const nameRow = $('#customer-name-required-row');
  const phoneRow = $('#customer-phone-required-row');
  const statusEl = $('#customize-settings-status');

  if(enabledInput) enabledInput.checked = !!kioskCustomerDetailsSettings.enabled;
  if(nameInput) {
    nameInput.checked = !!kioskCustomerDetailsSettings.requireName;
  }
  if(phoneInput) {
    phoneInput.checked = !!kioskCustomerDetailsSettings.requirePhone;
  }
  const recallInput = $('#collect-recall-enabled');
  if(recallInput) recallInput.checked = !!kioskCustomerDetailsSettings.recallEnabled;
  const categoriesInput = $('#service-categories-enabled');
  if(categoriesInput) categoriesInput.checked = !!kioskCustomerDetailsSettings.serviceCategoriesEnabled;
  const scheduledServicesInput = $('#scheduled-services-enabled');
  if(scheduledServicesInput) scheduledServicesInput.checked = !!kioskCustomerDetailsSettings.scheduledServicesEnabled;
  const bookingSlotsInput = $('#online-booking-slots-enabled');
  if (bookingSlotsInput) bookingSlotsInput.checked = !!kioskCustomerDetailsSettings.onlineBookingSlotsEnabled;
  const bookingSlotDurationInput = $('#online-booking-slot-duration-minutes');
  if (bookingSlotDurationInput) bookingSlotDurationInput.value = kioskCustomerDetailsSettings.onlineBookingSlotDurationMinutes || '';
  const bookingReminderEnabledInput = $('#booking-reminder-enabled');
  if (bookingReminderEnabledInput) bookingReminderEnabledInput.checked = !!kioskCustomerDetailsSettings.bookingReminderEnabled;
  const bookingReminderLeadInput = $('#booking-reminder-lead-minutes');
  if (bookingReminderLeadInput) bookingReminderLeadInput.value = kioskCustomerDetailsSettings.bookingReminderLeadMinutes || 30;
  const reminderPublicKeyInput = $('#booking-reminder-emailjs-public-key');
  if (reminderPublicKeyInput) reminderPublicKeyInput.value = kioskCustomerDetailsSettings.bookingReminderEmailjsPublicKey || '';
  const reminderServiceIdInput = $('#booking-reminder-emailjs-service-id');
  if (reminderServiceIdInput) reminderServiceIdInput.value = kioskCustomerDetailsSettings.bookingReminderEmailjsServiceId || '';
  const reminderTemplateIdInput = $('#booking-reminder-emailjs-template-id');
  if (reminderTemplateIdInput) reminderTemplateIdInput.value = kioskCustomerDetailsSettings.bookingReminderEmailjsTemplateId || '';
  const basicModeInput = $('#collect-basic-enabled');
  if(basicModeInput) basicModeInput.checked = !!kioskCustomerDetailsSettings.basicModeEnabled;
  const mobileAppBlockedInput = $('#block-mobile-app-enabled');
  if(mobileAppBlockedInput) mobileAppBlockedInput.checked = !!kioskCustomerDetailsSettings.mobileAppBlocked;
  const allowOnlineBookingInput = $('#allow-online-booking-enabled');
  if(allowOnlineBookingInput) allowOnlineBookingInput.checked = !!kioskCustomerDetailsSettings.allowOnlineBooking;

  syncCustomizeControlsWithBasicMode();

  if(statusEl) {
    if(!kioskCustomerDetailsSettings.enabled) {
      statusEl.textContent = kioskCustomerDetailsSettings.basicModeEnabled
        ? 'Basic mode is on. Other customization options are hidden.'
        : 'Customer details collection is currently disabled.';
    } else {
      const required = [];
      if(kioskCustomerDetailsSettings.requireName) required.push('Name');
      if(kioskCustomerDetailsSettings.requirePhone) required.push('Phone');
      const summary = required.length
        ? ('Enabled. Required fields: ' + required.join(', ') + '.')
        : 'Enabled. Name and phone are optional.';
      statusEl.textContent = summary;
    }
    if(kioskCustomerDetailsSettings.mobileAppBlocked) {
      statusEl.textContent += ' Mobile app access is blocked.';
    }
  }

  toggleScheduledServicesTabVisibility();
  renderScheduledServices(currentServices);
  renderOnlineBookings(currentQueueData, currentServices);
}

window.editCounter = function(id) {
  const counter = currentCounters[id];
  if(!counter) return;

  const item = document.querySelector('#counters-list .qm-item[data-id="' + id + '"]');
  if(!item) return;

  item.innerHTML =
    '<div class="qm-inline-edit">' +
    '<div class="qm-inline-edit-fields">' +
    '<input class="qm-edit-field" data-f="name" placeholder="Counter name" />' +
    '<select class="qm-edit-field" data-f="status">' +
    '<option value="active">Active</option>' +
    '<option value="inactive">Inactive</option>' +
    '</select>' +
    '</div>' +
    '<div class="qm-item-actions qm-edit-actions">' +
    '<button class="btn-edit qm-save-btn">Save</button>' +
    '<button class="btn-cancel">Cancel</button>' +
    '</div></div>';

  item.querySelector('[data-f="name"]').value = counter.name || '';
  item.querySelector('[data-f="status"]').value = counter.status || 'active';

  item.querySelector('.qm-save-btn').onclick = async function() {
    const name = item.querySelector('[data-f="name"]').value.trim();
    if(!name) { showMessage('Counter name required', 'error'); return; }
    try {
      await countersDB.update(id, {
        name: name,
        status: item.querySelector('[data-f="status"]').value,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      showMessage('Counter updated', 'success');
    } catch(err) { showMessage(err.message, 'error'); }
  };
  item.querySelector('.btn-cancel').onclick = function() { renderCounters(currentCounters); };
  item.querySelector('[data-f="name"]').focus();
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
window.editService = function(id) {
  const service = currentServices[id];
  if(!service) return;

  const item = document.querySelector('#services-list .qm-item[data-id="' + id + '"]');
  if(!item) return;

  item.innerHTML =
    '<div class="qm-inline-edit">' +
    '<div class="qm-inline-edit-fields">' +
    '<input class="qm-edit-field" data-f="name" placeholder="Service name" />' +
    '<input class="qm-edit-field" data-f="desc" placeholder="Description (optional)" />' +
    '<input class="qm-edit-field" data-f="category" placeholder="Category (optional)" />' +
    '<input class="qm-edit-field" data-f="time" type="number" min="0" placeholder="Est. time (min)" />' +
    '<select class="qm-edit-field" data-f="status">' +
    '<option value="active">Active</option>' +
    '<option value="inactive">Inactive</option>' +
    '</select>' +
    '</div>' +
    '<div class="qm-item-actions qm-edit-actions">' +
    '<button class="btn-edit qm-save-btn">Save</button>' +
    '<button class="btn-cancel">Cancel</button>' +
    '</div></div>';

  item.querySelector('[data-f="name"]').value = service.name || '';
  item.querySelector('[data-f="desc"]').value = service.description || '';
  item.querySelector('[data-f="category"]').value = service.category || '';
  item.querySelector('[data-f="time"]').value = service.estimatedTime || 0;
  item.querySelector('[data-f="status"]').value = service.status || 'active';

  item.querySelector('.qm-save-btn').onclick = async function() {
    const name = item.querySelector('[data-f="name"]').value.trim();
    if(!name) { showMessage('Service name required', 'error'); return; }
    try {
      await servicesDB.update(id, {
        name: name,
        description: item.querySelector('[data-f="desc"]').value.trim(),
        category: item.querySelector('[data-f="category"]').value.trim(),
        estimatedTime: parseInt(item.querySelector('[data-f="time"]').value) || 0,
        status: item.querySelector('[data-f="status"]').value,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      showMessage('Service updated', 'success');
    } catch(err) { showMessage(err.message, 'error'); }
  };
  item.querySelector('.btn-cancel').onclick = function() { renderServices(currentServices); };
  item.querySelector('[data-f="name"]').focus();
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
// TEST NAME MIGRATION
// ============================================================

const SERVICE_TEST_NAME_MAP = {
  'one':             'Account Opening',
  'two':             'Cash Deposit',
  'three':           'Cash Withdrawal',
  'four':            'Fixed Deposit',
  'test':            'Customer Support',
  'sample':          'Customer Support',
  'general service': 'General Inquiries',
  'service 1':       'Account Opening',
  'service 2':       'Cash Deposit',
  'service 3':       'Cash Withdrawal'
};

const COUNTER_TEST_NAME_MAP = {
  'one':          'Counter 1',
  'two':          'Counter 2',
  'three':        'Counter 3',
  'twoc':         'Counter 2',
  'test':         'Counter 1',
  'test counter': 'Counter 1'
};

async function cleanTestServiceNames() {
  const toUpdate = [];
  Object.entries(currentServices).forEach(function([id, service]) {
    const norm = String(service.name || '').trim().toLowerCase();
    if(SERVICE_TEST_NAME_MAP[norm]) {
      toUpdate.push({ id: id, oldName: service.name, newName: SERVICE_TEST_NAME_MAP[norm] });
    }
  });

  if(toUpdate.length === 0) {
    showMessage('No test service names found to update.', 'info');
    return;
  }

  const summary = toUpdate.map(function(u) { return '"' + u.oldName + '" → "' + u.newName + '"'; }).join('\n');
  if(!confirm('Update ' + toUpdate.length + ' service name(s) in Firebase?\n\n' + summary)) return;

  try {
    for(const { id, newName } of toUpdate) {
      await servicesDB.update(id, { name: newName, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    }
    showMessage('Updated ' + toUpdate.length + ' service name(s). Kiosk will reflect changes immediately.', 'success');
  } catch(err) {
    showMessage('Error updating names: ' + err.message, 'error');
  }
}

async function cleanTestCounterNames() {
  const toUpdate = [];
  Object.entries(currentCounters).forEach(function([id, counter]) {
    const norm = String(counter.name || '').trim().toLowerCase();
    if(COUNTER_TEST_NAME_MAP[norm]) {
      toUpdate.push({ id: id, oldName: counter.name, newName: COUNTER_TEST_NAME_MAP[norm] });
    }
  });

  if(toUpdate.length === 0) {
    showMessage('No test counter names found to update.', 'info');
    return;
  }

  const summary = toUpdate.map(function(u) { return '"' + u.oldName + '" → "' + u.newName + '"'; }).join('\n');
  if(!confirm('Update ' + toUpdate.length + ' counter name(s) in Firebase?\n\n' + summary)) return;

  try {
    for(const { id, newName } of toUpdate) {
      await countersDB.update(id, { name: newName, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    }
    showMessage('Updated ' + toUpdate.length + ' counter name(s).', 'success');
  } catch(err) {
    showMessage('Error updating names: ' + err.message, 'error');
  }
}

// ============================================================
// ANALYTICS & REPORTS
// ============================================================

let charts = {};

async function initializeCharts(counters, services, assignments) {
  // Prototype chart data. Replace with real Firebase token statistics before production.
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

  let html = '<div class="qm-kiosk-summary"><h3>KIOSK Activity Summary</h3>';
  html += '<div class="qm-kiosk-summary-grid">';

  let totalKioskTokens = 0;
  for(const [kioskId, stats] of Object.entries(report)) {
    totalKioskTokens += stats.tokensGenerated || 0;
    const statusClass = stats.status === 'active' ? 'success' : 'muted';
    
    html += `
      <div class="qm-kiosk-summary-card">
        <div class="qm-kiosk-summary-name">${escapeHtml(stats.kioskName)}</div>
        <div class="qm-kiosk-summary-meta">
          Tokens: <strong>${stats.tokensGenerated || 0}</strong> | Success: <strong>${stats.successRate}</strong>
        </div>
        <div class="qm-kiosk-summary-status">
          Status: <span class="badge badge-${statusClass}">${stats.status}</span>
        </div>
      </div>
    `;
  }

  html += '</div>';
  html += `<div class="qm-kiosk-summary-total">
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

async function initializeApp(profile = currentOrganizationProfile) {
  try {
    // Load initial data
    currentCounters = await countersDB.getAll();
    currentServices = await servicesDB.getAll();
    currentAssignments = await assignmentsDB.getAll();
    kioskCustomerDetailsSettings = await organizationSettingsDB.getCustomerDetailSettings();

    renderCounters(currentCounters);
    renderServices(currentServices);
    renderScheduledServices(currentServices);
    renderAssignments(currentAssignments, currentCounters, currentServices);
    renderCustomizeSettings();
    renderOnlineBookings(currentQueueData, currentServices);

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
      renderScheduledServices(data);
      renderQueueStatus(currentQueueData, currentServices);
      renderOnlineBookings(currentQueueData, currentServices);
      syncPublicOrganizationMeta().catch(err => console.log('Public meta sync failed', err));
    });

    assignmentsDB.listen(data => {
      currentAssignments = data;
      renderAssignments(data, currentCounters, currentServices);
    });

    // Real-time queue updates, keyed by service ID.
    queueDB.listenAll(data => {
      currentQueueData = data;
      renderQueueStatus(currentQueueData, currentServices);
      renderOnlineBookings(currentQueueData, currentServices);
    });

    initTabs();
    attachEventListeners();
    startOnlineBookingReminderWorker();
    // Load Open Hours UI
    await loadInitialOpenHours();
    await syncPublicOrganizationMeta(profile);
    showMessage('Queue manager loaded', 'success');
  } catch(err) {
    showMessage('Init error: ' + err.message, 'error');
    console.error(err);
  }
}

// Auth check and init
auth.onAuthStateChanged(async (user) => {
  if(!user) {
    window.location.href = '../index.html';
    return;
  }

  try {
    // Set current user UID for database operations
    currentUserUID = user.uid;
    currentOrganizationProfile = null;
    
    const snap = await db.ref('users/' + user.uid).once('value');
    const profile = snap.val() || {};
    currentOrganizationProfile = profile;
    renderOrganizationQr(user.uid);
    if (profile?.settings?.disabled) {
      showMessage('Organization is temporarily disabled. Access blocked.', 'error');
      await auth.signOut();
      setTimeout(() => { window.location.href = '../index.html'; }, 1200);
      return;
    }

    const canAccess = await waitlessCanAccessOrganizationTools(user, profile);
    if(!canAccess) {
      window.location.href = 'dashboard.html';
      return;
    }
    await initializeApp(profile);
  } catch(err) {
    showMessage('Auth error: ' + err.message, 'error');
  }
});
