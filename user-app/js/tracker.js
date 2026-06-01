(function(global) {
  let activeListenerRef = null;

  function normalizeTokenNumber(value) {
    return String(value || '').trim().toUpperCase();
  }

  function isActiveToken(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return !['completed', 'cancelled', 'canceled', 'done', 'removed', 'rejected'].includes(normalized);
  }

  function isWaitingToken(status) {
    const normalized = String(status || '').trim().toLowerCase();
    return ['waiting', 'new', 'queued', 'pending'].includes(normalized) || !normalized;
  }

  function parseTimestampMs(value) {
    if (value instanceof Date) {
      const time = value.getTime();
      return Number.isFinite(time) && time > 0 ? time : null;
    }

    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    const numeric = Number(value || 0);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }

  function resolveServiceMinutes(token) {
    const numeric = Number(token?.serviceEstimatedTime || token?.estimatedTime || token?.estimatedMinutes || 0);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  function getScheduledStartMs(token) {
    return parseTimestampMs(token?.scheduledFor || token?.deferredUntil);
  }

  function computeQueueState(queueData, tokenNumber) {
    const normalizedToken = normalizeTokenNumber(tokenNumber);
    const entries = Object.entries(queueData || {}).map(([id, token]) => ({ id, ...(token || {}) }));
    const target = entries.find((entry) => normalizeTokenNumber(entry.tokenNumber) === normalizedToken);

    if (!target) {
      return null;
    }

    const waitingEntries = entries
      .filter((entry) => isActiveToken(entry.status) && isWaitingToken(entry.status))
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    const projectedEntries = entries
      .filter((entry) => isActiveToken(entry.status) && (isWaitingToken(entry.status) || String(entry.status || '').trim().toLowerCase() === 'scheduled'))
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
      .reduce((state, entry) => {
        const scheduledAt = parseTimestampMs(entry.scheduledFor || entry.deferredUntil);
        const startAt = scheduledAt !== null ? Math.max(state.cursor, scheduledAt) : state.cursor;
        const endAt = startAt + (resolveServiceMinutes(entry) * 60000);
        state.items.push({
          ...entry,
          projectedStartAt: startAt,
          projectedEndAt: endAt
        });
        state.cursor = endAt;
        return state;
      }, { cursor: Date.now(), items: [] }).items;

    const index = waitingEntries.findIndex((entry) => normalizeTokenNumber(entry.tokenNumber) === normalizedToken);
    const scheduledTarget = target && (
      String(target.status || '').trim().toLowerCase() === 'scheduled'
      || getScheduledStartMs(target) !== null
    )
      ? projectedEntries.find((entry) => normalizeTokenNumber(entry.tokenNumber) === normalizedToken)
      : null;

    const scheduledStartMs = scheduledTarget ? getScheduledStartMs(scheduledTarget) : null;
    const targetProjectedStartMs = scheduledTarget ? Number(scheduledTarget.projectedStartAt || 0) : null;
    const targetServiceMinutes = resolveServiceMinutes(scheduledTarget || target);

    let position = index >= 0 ? index + 1 : null;
    let effectiveEtaMs = null;

    if (scheduledTarget && scheduledStartMs !== null && targetProjectedStartMs !== null) {
      const delayedByMs = Math.max(0, targetProjectedStartMs - scheduledStartMs);
      position = delayedByMs <= 0 || targetServiceMinutes <= 0
        ? 1
        : Math.max(1, Math.ceil(delayedByMs / Math.max(targetServiceMinutes * 60000, 1)));
      effectiveEtaMs = delayedByMs <= 0 ? scheduledStartMs : targetProjectedStartMs;
    } else if (scheduledTarget && scheduledStartMs !== null) {
      position = 1;
      effectiveEtaMs = scheduledStartMs;
    }

    const isServing = String(target.status || '').trim().toLowerCase() === 'serving';
    const counter = target.assignedCounterName || target.assignedCounterId || target.counterName || target.counter || 'Waiting';

    return {
      token: target,
      position,
      scheduledPosition: position,
      scheduledFor: scheduledStartMs,
      effectiveEtaMs,
      isServing,
      counter,
      activeCount: waitingEntries.length
    };
  }

  async function findToken(dbInstance, tokenNumber, organizationId) {
    if (!dbInstance || typeof dbInstance.ref !== 'function') {
      throw new Error('Firebase database is not available');
    }

    const normalizedToken = normalizeTokenNumber(tokenNumber);
    const orgId = String(organizationId || '').trim();
    if (!orgId) {
      return null;
    }

    const queueSnap = await dbInstance.ref(`users/${orgId}/queue`).once('value');
    const queue = queueSnap.val() || {};

    for (const [serviceId, serviceQueue] of Object.entries(queue)) {
      for (const [tokenId, tokenData] of Object.entries(serviceQueue || {})) {
        if (normalizeTokenNumber(tokenData?.tokenNumber) === normalizedToken) {
          return {
            orgId,
            serviceId,
            tokenId,
            tokenData
          };
        }
      }
    }

    return null;
  }

  function stopTracking() {
    if (activeListenerRef) {
      activeListenerRef.off('value');
      activeListenerRef = null;
    }
  }

  async function startTracking(dbInstance, tokenNumber, callbacks = {}, organizationId) {
    stopTracking();

    const normalizedToken = normalizeTokenNumber(tokenNumber);
    if (!normalizedToken) {
      if (typeof callbacks.onError === 'function') {
        callbacks.onError('Token number is required');
      }
      return null;
    }

    const match = await findToken(dbInstance, normalizedToken, organizationId);
    if (!match) {
      if (typeof callbacks.onError === 'function') {
        callbacks.onError('Token not found in the scanned organization');
      }
      return null;
    }

    const queueRef = dbInstance.ref(`users/${match.orgId}/queue/${match.serviceId}`);
    activeListenerRef = queueRef;

    queueRef.on('value', (snap) => {
      const queueData = snap.val() || {};
      const state = computeQueueState(queueData, normalizedToken);
      if (typeof callbacks.onUpdate === 'function') {
        callbacks.onUpdate({ match, state, queueData });
      }
    });

    return match;
  }

  global.userAppTracker = {
    startTracking,
    stopTracking,
    findToken,
    computeQueueState
  };
})(window);
