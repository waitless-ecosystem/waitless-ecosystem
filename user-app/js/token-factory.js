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

  function normalizeSlotMinutes(value, fallback = 30) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Math.max(1, Math.round(numericValue));
    }

    const fallbackValue = Number(fallback);
    if (Number.isFinite(fallbackValue) && fallbackValue > 0) {
      return Math.max(1, Math.round(fallbackValue));
    }

    return 30;
  }

  function normalizeSlotCapacity(value, fallback = 1) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return Math.max(1, Math.round(numericValue));
    }

    const fallbackValue = Number(fallback);
    if (Number.isFinite(fallbackValue) && fallbackValue > 0) {
      return Math.max(1, Math.round(fallbackValue));
    }

    return 1;
  }

  function getServiceBookingSlotConfig(serviceData, options = {}) {
    const schedule = serviceData && serviceData.schedule && typeof serviceData.schedule === 'object'
      ? serviceData.schedule
      : {};
    const defaultSlotMinutes = normalizeSlotMinutes(
      options.defaultSlotMinutes || options.slotMinutes || 30,
      30
    );
    const slotMinutes = normalizeSlotMinutes(
      serviceData?.bookingSlotMinutes
        || schedule.slotMinutes
        || serviceData?.slotDurationMinutes
        || serviceData?.slotMinutes
        || defaultSlotMinutes,
      defaultSlotMinutes
    );
    const serviceMinutes = normalizeSlotMinutes(
      serviceData?.estimatedTime || serviceData?.serviceEstimatedTime || options.serviceMinutes || slotMinutes,
      slotMinutes
    );
    const slotCapacity = serviceMinutes > 0
      ? Math.max(1, Math.floor(slotMinutes / serviceMinutes))
      : 1;
    const forceEnabled = options.forceEnabled === true;
    const serviceSlotEnabled = !!(serviceData && serviceData.scheduledServiceEnabled);

    return {
      enabled: !!((forceEnabled || serviceSlotEnabled) && slotMinutes > 0),
      slotMinutes,
      slotCapacity,
      serviceMinutes
    };
  }

  function formatBookingSlotLabel(startMs, endMs) {
    const startDate = new Date(Number(startMs) || 0);
    const endDate = new Date(Number(endMs) || 0);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return 'Selected slot';
    }

    const dateText = startDate.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const startText = startDate.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });
    const endText = endDate.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });

    return `${dateText} · ${startText} - ${endText}`;
  }

  function normalizeSlotKey(value) {
    return String(value || '').trim();
  }

  function isPastTokenStatus(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return ['completed', 'cancelled', 'canceled', 'done', 'removed', 'rejected', 'served', 'expired', 'missed', 'no-show', 'noshow'].includes(normalized);
  }

  function deriveSlotKeyFromEntry(entry, slotDurationMs) {
    const directKey = normalizeSlotKey(
      entry?.bookingSlotKey || entry?.bookingSlotStartMs || entry?.scheduledSlotKey || entry?.slotKey
    );
    if (directKey) {
      return directKey;
    }

    const scheduledMs = Number(entry?.bookingSlotEtaMs || entry?.scheduledFor || entry?.deferredUntil || 0);
    if (!Number.isFinite(scheduledMs) || scheduledMs <= 0) {
      return '';
    }

    const alignedMs = Math.floor(scheduledMs / slotDurationMs) * slotDurationMs;
    if (!Number.isFinite(alignedMs) || alignedMs <= 0) {
      return '';
    }

    return String(alignedMs);
  }

  function buildServiceBookingSlots(serviceData, queueData = {}, fromDt = new Date(), options = {}) {
    const slotConfig = getServiceBookingSlotConfig(serviceData, options);
    const openHours = options?.openHours && typeof options.openHours === 'object' ? options.openHours : null;
    if (!slotConfig.enabled || !serviceData || !serviceData.schedule) {
      const rollingWindowSlots = [];
      const slotDurationMs = slotConfig.slotMinutes * 60000;
      const nowMs = fromDt instanceof Date ? fromDt.getTime() : new Date(fromDt || Date.now()).getTime();
      const startMs = Math.ceil(nowMs / slotDurationMs) * slotDurationMs;
      const maxBookings = Math.max(1, slotConfig.slotCapacity);
      const activeEntries = (Array.isArray(queueData)
        ? queueData.map((entry) => entry || {})
        : Object.entries(queueData || {}).map(([id, entry]) => ({ id, ...(entry || {}) })))
        .filter((entry) => !isPastTokenStatus(entry.status));
      const slotOccupancy = new Map();

      activeEntries.forEach((entry) => {
        const key = deriveSlotKeyFromEntry(entry, slotDurationMs);
        if (!key) return;
        slotOccupancy.set(key, (slotOccupancy.get(key) || 0) + 1);
      });

      const horizonEndMs = nowMs + (24 * 60 * 60 * 1000);
      for (let slotStartMs = startMs; slotStartMs + slotDurationMs <= horizonEndMs; slotStartMs += slotDurationMs) {
        const slotEndMs = slotStartMs + slotDurationMs;
        if (openHours) {
          const slotStartDate = new Date(slotStartMs);
          const slotEndDate = new Date(slotEndMs - 1);
          if (!isWithinOpenHoursConfig(openHours, slotStartDate) || !isWithinOpenHoursConfig(openHours, slotEndDate)) {
            continue;
          }
        }
        const slotKey = String(slotStartMs);
        const occupied = Number(slotOccupancy.get(slotKey) || 0);
        if (occupied >= maxBookings) continue;

        const position = occupied + 1;
        const etaMs = slotStartMs + (occupied * slotConfig.serviceMinutes * 60000);
        if (etaMs + (slotConfig.serviceMinutes * 60000) > slotEndMs) continue;

        rollingWindowSlots.push({
          key: slotKey,
          startMs: slotStartMs,
          endMs: slotEndMs,
          label: formatBookingSlotLabel(slotStartMs, slotEndMs),
          serviceMinutes: slotConfig.serviceMinutes,
          slotMinutes: slotConfig.slotMinutes,
          capacity: maxBookings,
          occupied,
          remaining: maxBookings - occupied,
          position,
          etaMs
        });
      }

      return rollingWindowSlots;
    }

    const schedule = serviceData.schedule || {};
    const days = Array.isArray(schedule.days)
      ? schedule.days.map((day) => String(day || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const open = parseHM(schedule.open);
    const close = parseHM(schedule.close);
    if (!open || !close) {
      return [];
    }

    const serviceMinutes = slotConfig.serviceMinutes;
    const maxBookingsByDuration = Math.floor(slotConfig.slotMinutes / serviceMinutes);
    if (maxBookingsByDuration < 1) {
      return [];
    }

    const queueEntries = Array.isArray(queueData)
      ? queueData.map((entry) => entry || {})
      : Object.entries(queueData || {}).map(([id, entry]) => ({ id, ...(entry || {}) }));
    const activeEntries = queueEntries.filter((entry) => !isPastTokenStatus(entry.status));
    const slotOccupancy = new Map();
    const slotDurationMs = slotConfig.slotMinutes * 60000;

    activeEntries.forEach((entry) => {
      const key = deriveSlotKeyFromEntry(entry, slotDurationMs);
      if (!key) {
        return;
      }
      slotOccupancy.set(key, (slotOccupancy.get(key) || 0) + 1);
    });

    const slots = [];
    const nowMs = fromDt instanceof Date ? fromDt.getTime() : new Date(fromDt || Date.now()).getTime();
    const maxBookings = Math.max(1, Math.min(slotConfig.slotCapacity, maxBookingsByDuration));
    const dayOffsets = Array.from({ length: 8 }, (_, index) => index);

    dayOffsets.forEach((offset) => {
      const baseDate = new Date(nowMs + offset * 24 * 60 * 60 * 1000);
      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][baseDate.getDay()];
      if (days.length > 0 && !days.includes(dayKey)) {
        return;
      }

      const openDate = new Date(baseDate);
      openDate.setHours(open.h, open.m, 0, 0);
      const closeDate = new Date(baseDate);
      closeDate.setHours(close.h, close.m, 0, 0);

      for (let slotStartMs = openDate.getTime(); slotStartMs + slotDurationMs <= closeDate.getTime(); slotStartMs += slotDurationMs) {
        if (slotStartMs < nowMs) {
          continue;
        }

        const slotEndMs = slotStartMs + slotDurationMs;
        if (openHours) {
          const slotStartDate = new Date(slotStartMs);
          const slotEndDate = new Date(slotEndMs - 1);
          if (!isWithinOpenHoursConfig(openHours, slotStartDate) || !isWithinOpenHoursConfig(openHours, slotEndDate)) {
            continue;
          }
        }
        const slotKey = String(slotStartMs);
        const occupied = Number(slotOccupancy.get(slotKey) || 0);
        if (occupied >= maxBookings) {
          continue;
        }

        const position = occupied + 1;
        const etaMs = slotStartMs + (occupied * serviceMinutes * 60000);
        if (etaMs + (serviceMinutes * 60000) > slotEndMs) {
          continue;
        }

        slots.push({
          key: slotKey,
          startMs: slotStartMs,
          endMs: slotEndMs,
          label: formatBookingSlotLabel(slotStartMs, slotEndMs),
          serviceMinutes,
          slotMinutes: slotConfig.slotMinutes,
          capacity: maxBookings,
          occupied,
          remaining: maxBookings - occupied,
          position,
          etaMs
        });
      }
    });

    return slots.sort((left, right) => Number(left.startMs || 0) - Number(right.startMs || 0));
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
    const bookingSlotKey = String(data.bookingSlotKey || '').trim() || null;
    const bookingSlotStartMs = Number(data.bookingSlotStartMs || 0) || null;
    const bookingSlotEndMs = Number(data.bookingSlotEndMs || 0) || null;
    const bookingSlotPosition = Number(data.bookingSlotPosition || 0) || null;
    const bookingSlotCapacity = Number(data.bookingSlotCapacity || 0) || null;
    const bookingSlotOccupied = Number(data.bookingSlotOccupied || 0) || null;
    const bookingSlotEtaMs = Number(data.bookingSlotEtaMs || 0) || null;
    const scheduledFor = data.scheduledFor || (bookingSlotEtaMs ? new Date(bookingSlotEtaMs).toISOString() : null);
    const deferredUntil = data.deferredUntil || null;

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
      scheduledFor,
      deferredUntil,
      bookingSlotKey,
      bookingSlotStartMs,
      bookingSlotEndMs,
      bookingSlotPosition,
      bookingSlotCapacity,
      bookingSlotOccupied,
      bookingSlotEtaMs,
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
    formatServiceScheduleLabel,
    getServiceBookingSlotConfig,
    buildServiceBookingSlots,
    formatBookingSlotLabel
  };
})(window);
