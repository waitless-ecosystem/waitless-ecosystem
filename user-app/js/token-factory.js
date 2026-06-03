/* Shared token creation helpers for kiosk and admin flows */
(function(global) {
  function randomSegment() {
    return Math.random().toString(36).slice(2, 11);
  }

  function normalizeTokenPrefix(prefix, fallback = 'ORG') {
    const cleaned = String(prefix || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    return cleaned || String(fallback || 'ORG').trim().toUpperCase();
  }

  function hashString(value) {
    let hash = 0;
    const input = String(value || '');

    for (let index = 0; index < input.length; index += 1) {
      hash = ((hash << 5) - hash) + input.charCodeAt(index);
      hash |= 0;
    }

    return Math.abs(hash).toString(36).toUpperCase();
  }

  function deriveOrganizationTokenPrefix(organizationId, fallback = 'ORG') {
    const normalizedFallback = normalizeTokenPrefix(fallback, 'ORG');
    const orgId = String(organizationId || '').trim();

    if (!orgId) {
      return normalizedFallback;
    }

    const shortCode = hashString(orgId).padStart(4, '0').slice(0, 4);
    return normalizeTokenPrefix(normalizedFallback + shortCode, normalizedFallback);
  }

  async function resolveOrganizationTokenPrefix(dbInstance, organizationId, fallback = 'ORG') {
    if (!dbInstance || typeof dbInstance.ref !== 'function') {
      return deriveOrganizationTokenPrefix(organizationId, fallback);
    }

    if (!organizationId) {
      return normalizeTokenPrefix(fallback, 'ORG');
    }

    try {
      const publicSnap = await dbInstance.ref(`publicOrganizations/${organizationId}/meta`).once('value');
      const publicMeta = publicSnap.val() || {};
      const storedPrefix = publicMeta.tokenPrefix;
      if (storedPrefix) {
        return normalizeTokenPrefix(storedPrefix, deriveOrganizationTokenPrefix(organizationId, fallback));
      }

      const snap = await dbInstance.ref(`users/${organizationId}/settings/tokenPrefix`).once('value');
      const fallbackPrefix = snap.val();
      if (fallbackPrefix) {
        return normalizeTokenPrefix(fallbackPrefix, deriveOrganizationTokenPrefix(organizationId, fallback));
      }
    } catch (_) {
      // Fall back to the derived prefix if the setting cannot be read.
    }

    return deriveOrganizationTokenPrefix(organizationId, fallback);
  }

  function generateTokenId(prefix = 'TOKEN') {
    return String(prefix || 'TOKEN').trim().toUpperCase() + '_' + Date.now() + '_' + randomSegment();
  }

  function generateLegacyTokenNumber(tokenId) {
    return String(tokenId || '').trim().toUpperCase();
  }

  function getSequenceStatePath(organizationId, sequencePath) {
    if (sequencePath) return sequencePath;
    return organizationId
      ? `publicOrganizations/${organizationId}/systemCounters/visitTokenSequenceState`
      : 'publicOrganizations/systemCounters/visitTokenSequenceState';
  }

  async function resolveTokenSequenceResetMinutes(dbInstance, organizationId, fallbackMinutes = 0) {
    if (!dbInstance || typeof dbInstance.ref !== 'function' || !organizationId) {
      return Math.max(0, Number(fallbackMinutes) || 0);
    }

    try {
      const publicSnap = await dbInstance.ref(`publicOrganizations/${organizationId}/meta`).once('value');
      const publicMeta = publicSnap.val() || {};
      if (publicMeta.tokenSequenceResetMinutes !== undefined && publicMeta.tokenSequenceResetMinutes !== null) {
        return Math.max(0, Number(publicMeta.tokenSequenceResetMinutes) || 0);
      }

      const snap = await dbInstance.ref(`users/${organizationId}/settings/kioskCustomerDetails`).once('value');
      const settings = snap.val() || {};
      return Math.max(0, Number(settings.tokenSequenceResetMinutes || fallbackMinutes) || 0);
    } catch (_) {
      return Math.max(0, Number(fallbackMinutes) || 0);
    }
  }

  
  // Helper: determine if a given datetime is within configured open hours
  function parseHM(v) {
    if (!v) return null;
    const parts = String(v || '').split(':');
    if (parts.length < 2) return null;
    return { h: parseInt(parts[0], 10), m: parseInt(parts[1], 10) };
  }

  function isWithinOpenHoursConfig(hoursObj, dt) {
    if (!hoursObj || typeof hoursObj !== 'object') return true;
    const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][dt.getDay()];
    const conf = hoursObj[dayKey];
    if (!conf) return true; // no config means open
    if (!conf.enabled) return false;
    const open = parseHM(conf.open);
    const close = parseHM(conf.close);
    if (!open || !close) return true; // incomplete config -> treat as open
    const start = new Date(dt);
    start.setHours(open.h, open.m, 0, 0);
    const end = new Date(dt);
    end.setHours(close.h, close.m, 0, 0);
    return dt >= start && dt <= end;
  }

  function isWithinServiceScheduleConfig(serviceData, dt) {
    const schedule = serviceData && serviceData.schedule;
    if (!serviceData || !serviceData.scheduledServiceEnabled || !schedule || typeof schedule !== 'object') {
      return true;
    }

    const days = Array.isArray(schedule.days) ? schedule.days.map((day) => String(day || '').trim().toLowerCase()) : [];
    const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][dt.getDay()];
    if (days.length > 0 && !days.includes(dayKey)) {
      return false;
    }

    const open = parseHM(schedule.open);
    const close = parseHM(schedule.close);
    if (!open || !close) return true;

    const start = new Date(dt);
    start.setHours(open.h, open.m, 0, 0);
    const end = new Date(dt);
    end.setHours(close.h, close.m, 0, 0);
    return dt >= start && dt <= end;
  }

  async function resolveServiceScheduleState(dbInstance, organizationId, serviceId) {
    if (!dbInstance || typeof dbInstance.ref !== 'function' || !organizationId || !serviceId) {
      return { enabled: false, schedule: null };
    }

    try {
      const serviceSnap = await dbInstance.ref(`users/${organizationId}/services/${serviceId}`).once('value');
      const serviceData = serviceSnap.val() || {};
      return {
        enabled: !!serviceData.scheduledServiceEnabled,
        schedule: serviceData.schedule || null,
        serviceData
      };
    } catch (_) {
      return { enabled: false, schedule: null };
    }
  }

  function findNextScheduledServiceStart(serviceData, fromDt) {
    const schedule = serviceData && serviceData.schedule;
    if (!serviceData || !serviceData.scheduledServiceEnabled || !schedule || typeof schedule !== 'object') {
      return null;
    }

    const days = Array.isArray(schedule.days) ? schedule.days.map((day) => String(day || '').trim().toLowerCase()) : [];
    const open = parseHM(schedule.open);
    if (!open) return null;

    for (let i = 0; i < 8; i += 1) {
      const candidate = new Date(fromDt.getTime() + i * 24 * 60 * 60 * 1000);
      const dayKey = ['sun','mon','tue','wed','thu','fri','sat'][candidate.getDay()];
      if (days.length > 0 && !days.includes(dayKey)) continue;

      const start = new Date(candidate);
      start.setHours(open.h, open.m, 0, 0);
      if (start.getTime() >= fromDt.getTime()) {
        return start;
      }
    }

    return null;
  }

  function formatServiceScheduleLabel(serviceData) {
    const schedule = serviceData && serviceData.schedule;
    if (!serviceData || !serviceData.scheduledServiceEnabled || !schedule || typeof schedule !== 'object') {
      return '';
    }

    const dayLabels = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
    const days = Array.isArray(schedule.days) ? schedule.days.map((day) => String(day || '').trim().toLowerCase()).filter(Boolean) : [];
    const open = String(schedule.open || '').trim();
    const close = String(schedule.close || '').trim();
    const dayText = days.length > 0 ? days.map((day) => dayLabels[day] || day).join(', ') : 'selected days';
    const timeText = open && close ? `${open} - ${close}` : 'selected time';
    return `${dayText} ${timeText}`;
  }

  function generateSequentialTokenNumber(dbInstance, organizationIdOrOptions = null, sequencePath = null, fallbackPrefix = 'ORG', width = 0) {
    if (!dbInstance || typeof dbInstance.ref !== 'function') {
      return Promise.reject(new Error('Firebase database instance required to generate token number'));
    }

    const options = typeof organizationIdOrOptions === 'object' && organizationIdOrOptions !== null
      ? organizationIdOrOptions
      : { organizationId: organizationIdOrOptions };
    const prefix = normalizeTokenPrefix(options.prefix || deriveOrganizationTokenPrefix(options.organizationId, fallbackPrefix), fallbackPrefix);
    const statePath = getSequenceStatePath(options.organizationId, sequencePath);
    const resetMinutesOption = Number(options.resetMinutes || options.tokenSequenceResetMinutes || options.resetAfterMinutes || 0);

    // Before allocating numbers, check open hours for organization and block if currently closed
    const orgIdForCheck = options.organizationId;
    const checkOpenHours = (orgIdForCheck && dbInstance && typeof dbInstance.ref === 'function')
      ? dbInstance.ref(`users/${orgIdForCheck}/settings/openHours`).once('value').then(snap => snap.val() || {}).catch(() => ({}))
      : Promise.resolve({});

    return checkOpenHours.then(async (openHours) => {
      const now = new Date();
      if (!options.skipOpenHoursCheck && orgIdForCheck && openHours && Object.keys(openHours).length > 0) {
        const allowed = isWithinOpenHoursConfig(openHours, now);
        if (!allowed) {
          return Promise.reject(new Error('Organization is currently closed according to configured open hours'));
        }
      }

      return resolveTokenSequenceResetMinutes(dbInstance, options.organizationId, resetMinutesOption).then((resetMinutes) => {
      return new Promise((resolve, reject) => {
        dbInstance.ref(statePath).transaction(
          (current) => {
            const now = Date.now();
            const intervalMs = Math.max(0, Number(resetMinutes) || 0) * 60000;
            const state = current && typeof current === 'object'
              ? { ...current }
              : { count: Number(current || 0) || 0, lastResetAt: 0 };

            if (intervalMs > 0) {
              const lastResetAt = Number(state.lastResetAt || 0);
              if (!lastResetAt || (now - lastResetAt) >= intervalMs) {
                state.count = 0;
                state.lastResetAt = now;
              }
            }

            state.count = Number(state.count || 0) + 1;
            state.prefix = prefix;
            state.updatedAt = now;
            state.resetMinutes = Number(resetMinutes) || 0;
            return state;
          },
          (error, committed, snapshot) => {
          if (error) {
            reject(error);
            return;
          }

          if (!committed || !snapshot) {
            reject(new Error('Unable to allocate a unique token number'));
            return;
          }

          const state = snapshot.val() || {};
          const safeSequence = Number(state.count || 0);
          const digitText = String(safeSequence);
          const minimumWidth = Math.max(0, Number(width) || 0);
          const formattedDigits = minimumWidth > 0
            ? digitText.padStart(Math.max(minimumWidth, digitText.length), '0')
            : digitText;
          resolve(prefix + formattedDigits);
          }
        );
      });
    });
    });
  }

  function createBaseTokenData(options = {}) {
    const data = options || {};
    const serviceEstimatedTime = Number(data.serviceEstimatedTime || data.estimatedTime || 0) || null;
    const customerName = String(data.customerName || '').trim() || null;
    const customerPhone = String(data.customerPhone || '').trim() || null;
    const customerEmail = String(data.customerEmail || '').trim() || null;

    return {
      id: data.tokenId,
      tokenNumber: data.tokenNumber,
      organizationId: data.organizationId,
      kioskId: data.kioskId,
      kioskName: data.kioskName,
      serviceId: data.serviceId || null,
      serviceName: data.serviceName || null,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      status: data.status || 'waiting',
      source: data.source || 'kiosk',
      assignedCounterId: data.assignedCounterId || null,
      assignedCounterName: data.assignedCounterName || null,
      serviceEstimatedTime,
      customerUid: data.customerUid || null,
      customerName,
      customerPhone,
      customerEmail
    };
  }

  global.tokenFactory = {
    generateTokenId,
    generateLegacyTokenNumber,
    generateSequentialTokenNumber,
    normalizeTokenPrefix,
    deriveOrganizationTokenPrefix,
    resolveOrganizationTokenPrefix,
    createBaseTokenData,
    isWithinOpenHoursConfig,
    isWithinServiceScheduleConfig,
    resolveServiceScheduleState,
    findNextScheduledServiceStart,
    formatServiceScheduleLabel
  };
})(window);
