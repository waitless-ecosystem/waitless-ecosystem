if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

const state = {
  orgId: new URLSearchParams(window.location.search).get('orgId') || '',
  onlineBookingMode: new URLSearchParams(window.location.search).get('booking') === 'online',
  currentProfile: null,
  appUser: null,
  profileManagerOpen: false,
  services: {},
  assignments: {},
  counters: {},
  kiosks: [],
  mobileAppBlocked: false,
  serviceCategoriesEnabled: false,
  selectedServiceCategory: '',
  liveTokenTracking: false,
  tokenHistory: {
    loading: false,
    ongoing: [],
    past: [],
    ongoingVisibleCount: 3,
    pastVisibleCount: 3,
    totalOngoing: 0,
    totalPast: 0,
    lastLoadedAt: null,
    error: '',
    tokenSnapshots: {},
    recentNotifications: []
  },
  tokenHistoryRef: null,
  tokenQueueRefs: {},
  tokenNotificationPrefs: {},
  tokenHistoryRefreshTimer: null,
  scanner: null
};

function getFocusableElementFromNode(node) {
  if (!node || !(node instanceof HTMLElement)) return null;
  return typeof node.focus === 'function' ? node : null;
}

function $(selector) { return document.querySelector(selector); }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[char]));
}

function normalizeTokenStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isPastTokenStatus(status) {
  return ['completed', 'cancelled', 'canceled', 'done', 'removed', 'rejected', 'served', 'expired', 'missed', 'no-show', 'noshow'].includes(normalizeTokenStatus(status));
}

function isOngoingTokenStatus(status) {
  const normalized = normalizeTokenStatus(status);
  if (!normalized) return true;
  return ['waiting', 'new', 'queued', 'pending', 'serving', 'processing', 'recall', 'called', 'hold'].includes(normalized) || !isPastTokenStatus(normalized);
}

function formatTokenTimestamp(timestamp) {
  const numericValue = Number(timestamp || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Unknown time';
  const date = new Date(numericValue);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString();
}

function normalizeMinutes(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  return Math.max(0, Math.round(numericValue));
}

function formatEstimateTime(minutes) {
  const normalizedMinutes = Number(minutes || 0);

  const estimateDate = new Date(Date.now() + Math.max(0, normalizedMinutes) * 60000);

  return estimateDate.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDateTimeLabel(value) {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null;
  const date = new Date(numericValue);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getCurrentAppUserUid() {
  return String(state.appUser?.uid || auth.currentUser?.uid || '').trim();
}

function getCurrentAppUserPhoneKeys() {
  const phone = String(state.appUser?.phone || '').trim();
  const normalized = phone.replace(/[^0-9+]/g, '');
  return normalized ? [normalized] : [];
}

function isTokenOwnedByCurrentUser(token) {
  const currentUid = getCurrentAppUserUid();
  const currentPhoneKeys = getCurrentAppUserPhoneKeys();
  const tokenUid = String(token?.customerUid || token?.uid || '').trim();
  const tokenPhone = String(token?.customerPhone || token?.customerDetails?.phone || '').trim().replace(/[^0-9+]/g, '');

  if (currentUid && tokenUid && tokenUid === currentUid) return true;
  if (currentPhoneKeys.length > 0 && tokenPhone && currentPhoneKeys.includes(tokenPhone)) return true;
  return false;
}

function resolveTokenEstimatedMinutes(token) {
  const directMinutes = normalizeMinutes(token?.serviceEstimatedTime || token?.estimatedTime || token?.estimatedMinutes);
  if (directMinutes > 0) {
    return directMinutes;
  }

  return normalizeMinutes(state.services?.[token?.serviceId]?.estimatedTime);
}

function resolveTokenDisplayData(token, queueState = null, queueData = null) {
  const status = normalizeTokenStatus(token?.status) || 'waiting';
  const livePositionValue = Number(queueState?.position ?? token?.livePosition ?? token?.position ?? 0);
  const serviceEstimatedMinutes = resolveTokenEstimatedMinutes(token);
  const isServing = !!queueState?.isServing || status === 'serving';
  const isScheduled = status === 'scheduled' || !!queueState?.scheduledFor || !!token?.scheduledFor || !!token?.deferredUntil;
  // livePositionValue is the 1-based position in queue. Show as `#N` for clarity.
  let livePositionLabel;
  if (isServing) {
    livePositionLabel = 'Now serving';
  } else if (Number.isFinite(livePositionValue) && livePositionValue > 0) {
    livePositionLabel = `#${livePositionValue}`;
  } else {
    livePositionLabel = isPastTokenStatus(status) ? 'Completed' : 'Waiting';
  }
  // If we have the raw queue data for this service, compute estimate as
  // sum of estimated minutes of all waiting tokens ahead of this token.
 
  let estimateMinutes = 0;

if (isPastTokenStatus(status)) {

  estimateMinutes = 0;

} else if (queueData && typeof queueData === 'object') {

  try {

    const normalizeTokenNumberLocal = (v) =>
      String(v || '').trim().toUpperCase();

    const activeEntries = Object.entries(queueData || {})
      .map(([id, t]) => ({
        id,
        ...(t || {})
      }))
      .filter((entry) => !isPastTokenStatus(entry.status))
      .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

    const targetIndex = activeEntries.findIndex(
      (entry) =>
        normalizeTokenNumberLocal(entry.tokenNumber) ===
        normalizeTokenNumberLocal(token?.tokenNumber || token?.id)
    );

    if (targetIndex > 0) {

      estimateMinutes = activeEntries
        .slice(0, targetIndex)
        .reduce(
          (sum, entry) =>
            sum + resolveTokenEstimatedMinutes(entry),
          0
        );

    } else if (targetIndex === 0) {

      estimateMinutes = 0;

    } else {

      estimateMinutes =
        Number.isFinite(livePositionValue) && livePositionValue > 1
          ? (livePositionValue - 1) * serviceEstimatedMinutes
          : 0;
    }

  } catch (err) {

    estimateMinutes =
      Number.isFinite(livePositionValue) && livePositionValue > 1
        ? (livePositionValue - 1) * serviceEstimatedMinutes
        : 0;
  }

} else {

  estimateMinutes =
    Number.isFinite(livePositionValue) && livePositionValue > 1
      ? (livePositionValue - 1) * serviceEstimatedMinutes
      : 0;
}

  const scheduledAt = formatDateTimeLabel(queueState?.effectiveEtaMs || queueState?.scheduledFor || token?.scheduledFor || token?.deferredUntil);
  const queueEtaLabel = formatEstimateTime(estimateMinutes);

  return {
    tokenNumber: token?.tokenNumber || token?.id || '---',
    counterLabel: resolveCounterName(
      queueState?.counter
      || token?.assignedCounterName
      || token?.counterName
      || token?.resolvedCounterName
      || token?.assignedCounterId
      || token?.counterId
    ),
    livePositionLabel: isScheduled && Number.isFinite(livePositionValue) && livePositionValue > 0 ? `#${livePositionValue}` : livePositionLabel,
    estimateTimeLabel: scheduledAt || queueEtaLabel
  };
}

function renderTokenItem(token, type = 'ongoing') {
  const status = normalizeTokenStatus(token?.status) || 'waiting';
  const serviceName = token?.serviceName || token?.serviceId || 'Service';
  const tokenKey = token?.tokenKey || getTokenHistoryKey(token);
  // Prefer hydrated display labels if present to avoid recomputing without queue snapshot
  let displayData;
  if (token?.counterLabel && token?.estimateTimeLabel && token?.livePositionLabel) {
    displayData = {
      tokenNumber: token?.tokenNumber || token?.id || '---',
      counterLabel: token.counterLabel,
      livePositionLabel: token.livePositionLabel,
      estimateTimeLabel: token.estimateTimeLabel
    };
  } else {
    displayData = resolveTokenDisplayData(token, token?.queueState || null, token?.queueData || null);
  }
  const isServingNow = type !== 'past' && (
    status === 'serving'
    || /^(0|0\s+ahead)$/i.test(String(displayData.livePositionLabel || '').trim())
    || /\b0\s+ahead\b/i.test(String(displayData.livePositionLabel || ''))
    || /now\s+serving/i.test(String(displayData.livePositionLabel || ''))
  );
  const statusLabel = type === 'past'
    ? status.replace(/[-_]/g, ' ')
    : (isServingNow ? 'Serving' : status.replace(/[-_]/g, ' '));
  const customerName = token?.customerName || 'Walk-in';
  const customerPhone = token?.customerPhone || token?.customerDetails?.phone || '';
  const orgLabel = token?.organizationName || token?.orgName || token?.resolvedOrganizationName || token?.orgId || token?.organizationId || 'Unknown org';
  const notificationsEnabled = type !== 'past' && isTokenNotificationsEnabled(tokenKey);

  if (type === 'past') {
    return `
      <div class="token-item token-item-past">
        <div class="token-item-number">${escapeHtml(displayData.tokenNumber)}</div>
        <div class="token-item-meta">
          <div><strong>Token:</strong> ${escapeHtml(displayData.tokenNumber)}</div>
                    <div><strong>Organization:</strong> ${escapeHtml(orgLabel)}</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="token-item">
      <div class="token-item-top">
        <div>
          <div class="token-item-number">${escapeHtml(displayData.tokenNumber)}</div>
          <div class="token-item-meta">${escapeHtml(serviceName)}</div>
        </div>
        <div class="token-item-actions">
          <span class="token-status-pill ${type === 'past' ? 'past' : ''} ${isServingNow ? 'serving' : ''}">${escapeHtml(statusLabel)}</span>
          <button
            type="button"
            class="secondary button-small token-notify-btn ${notificationsEnabled ? 'active' : ''}"
            data-token-key="${escapeHtml(tokenKey)}"
            data-notify-enabled="${notificationsEnabled ? '1' : '0'}"
            aria-pressed="${notificationsEnabled ? 'true' : 'false'}"
          >
            ${notificationsEnabled ? 'Notifications on' : 'Notify updates'}
          </button>
        </div>
      </div>
      <div class="token-item-meta">
        <div><strong>Token:</strong> ${escapeHtml(displayData.tokenNumber)}</div>
        <div><strong>Counter:</strong> ${escapeHtml(displayData.counterLabel)}</div>
        <div><strong>ETA:</strong> ${escapeHtml(displayData.estimateTimeLabel)}</div>
        <div><strong>Live Position:</strong> ${escapeHtml(displayData.livePositionLabel)}</div>
        <div><strong>Organization:</strong> ${escapeHtml(orgLabel)}</div>
        <div><strong>Customer:</strong> ${escapeHtml(customerName)}</div>
        ${customerPhone ? `<div><strong>Phone:</strong> ${escapeHtml(customerPhone)}</div>` : ''}
        <div><strong>Time:</strong> ${escapeHtml(formatTokenTimestamp(token?.timestamp))}</div>
      </div>
    </div>
  `;
}

function renderTokenNotificationArea() {
  const listEl = $('#token-notification-list');
  if (!listEl) return;

  const notifications = Array.isArray(state.tokenHistory.recentNotifications)
    ? state.tokenHistory.recentNotifications
    : [];

  if (notifications.length === 0) {
    listEl.innerHTML = '<div class="token-list-empty">No updates yet.</div>';
    return;
  }

  listEl.innerHTML = notifications.map((entry) => `
    <div class="token-notification-item">
      <div class="token-notification-title">${escapeHtml(entry.title || 'Token update')}</div>
      <div class="token-notification-body">${escapeHtml(entry.body || '')}</div>
      <div class="token-notification-time">${escapeHtml(entry.timeLabel || '')}</div>
    </div>
  `).join('');
}

function renderTokenHistory() {
  const section = $('#token-history-section');
  const summaryEl = $('#token-history-summary');
  const ongoingList = $('#ongoing-token-list');
  const pastList = $('#past-token-list');
  const ongoingToggleBtn = $('#ongoing-token-toggle-btn');
  const pastLoadMoreBtn = $('#past-token-load-more-btn');

  if (!section || !summaryEl || !ongoingList || !pastList) return;

  const currentUid = getCurrentAppUserUid();

  if (!currentUid) {
    summaryEl.textContent = 'Sign in required';
    ongoingList.innerHTML = '<div class="token-list-empty">Sign in to view your booked tokens.</div>';
    pastList.innerHTML = '<div class="token-list-empty">Sign in to view your booked tokens.</div>';
    renderTokenNotificationArea();
    return;
  }

  if (state.tokenHistory.loading) {
    summaryEl.textContent = 'Loading...';
  } else if (state.tokenHistory.error) {
    summaryEl.textContent = 'Load failed';
  } else {
    summaryEl.textContent = `${state.tokenHistory.totalOngoing} ongoing • ${state.tokenHistory.totalPast} past`;
  }

  const ongoingVisibleCount = Math.max(3, Number(state.tokenHistory.ongoingExpanded ? state.tokenHistory.ongoing.length : state.tokenHistory.ongoingVisibleCount || 3));
  const visibleOngoingTokens = state.tokenHistory.ongoing.slice(0, ongoingVisibleCount);

  ongoingList.innerHTML = state.tokenHistory.loading
    ? '<div class="token-list-empty">Loading ongoing tokens...</div>'
    : state.tokenHistory.error
      ? `<div class="token-list-empty">${escapeHtml(state.tokenHistory.error)}</div>`
    : visibleOngoingTokens.length > 0
      ? visibleOngoingTokens.map((token) => renderTokenItem(token, 'ongoing')).join('')
      : '<div class="token-list-empty">No ongoing tokens found.</div>';

  if (ongoingToggleBtn) {
    const hasMoreOngoingTokens = !state.tokenHistory.loading && !state.tokenHistory.error && state.tokenHistory.ongoing.length > ongoingVisibleCount;
    ongoingToggleBtn.classList.toggle('hidden', !hasMoreOngoingTokens);
    ongoingToggleBtn.textContent = state.tokenHistory.ongoingExpanded ? 'Show less' : `See more (${state.tokenHistory.ongoing.length - ongoingVisibleCount})`;
  }

  pastList.innerHTML = state.tokenHistory.loading
    ? '<div class="token-list-empty">Loading past tokens...</div>'
    : state.tokenHistory.error
      ? `<div class="token-list-empty">${escapeHtml(state.tokenHistory.error)}</div>`
    : state.tokenHistory.past.length > 0
      ? state.tokenHistory.past.slice(0, Math.max(0, Number(state.tokenHistory.pastVisibleCount || 3))).map((token) => renderTokenItem(token, 'past')).join('')
      : '<div class="token-list-empty">No past tokens found.</div>';

  if (pastLoadMoreBtn) {
    const visibleCount = Math.max(0, Number(state.tokenHistory.pastVisibleCount || 3));
    const hasMorePastTokens = !state.tokenHistory.loading && !state.tokenHistory.error && state.tokenHistory.past.length > visibleCount;
    pastLoadMoreBtn.classList.toggle('hidden', !hasMorePastTokens);
    pastLoadMoreBtn.textContent = hasMorePastTokens
      ? `Load more (${state.tokenHistory.past.length - visibleCount})`
      : 'Load more';
  }

  renderTokenNotificationArea();
}

async function loadTokenHistory() {
  const currentUid = getCurrentAppUserUid();

  if (!currentUid) {
    stopTokenQueueListeners();
    state.tokenHistory = {
      loading: false,
      ongoing: [],
      past: [],
      ongoingExpanded: false,
      ongoingVisibleCount: 3,
      pastVisibleCount: 3,
      totalOngoing: 0,
      totalPast: 0,
      lastLoadedAt: null,
      error: '',
      tokenSnapshots: {},
      recentNotifications: []
    };
    renderTokenHistory();
    return;
  }

  state.tokenNotificationPrefs = loadTokenNotificationPrefs(currentUid);

  state.tokenHistory = {
    ...state.tokenHistory,
    loading: true,
    error: ''
  };
  renderTokenHistory();

  try {
    const tokens = [];
    const snap = await db.ref(`appuserTokens/${currentUid}`).once('value');
    const groupedTokens = snap.val() || {};
    const orgContextCache = new Map();

    async function getOrgContext(orgId) {
      if (orgContextCache.has(orgId)) {
        return orgContextCache.get(orgId);
      }

      const context = {
        organizationName: orgId,
        assignments: {},
        counters: {},
        services: {}
      };

      const [profileSnap, assignmentsSnap, countersSnap, servicesSnap] = await Promise.all([
        db.ref(`users/${orgId}/profile`).once('value'),
        db.ref(`users/${orgId}/assignments`).once('value'),
        db.ref(`users/${orgId}/counters`).once('value'),
        db.ref(`users/${orgId}/services`).once('value')
      ]);

      const profile = profileSnap.val() || {};
      context.organizationName = profile.name || profile.organizationName || profile.displayName || orgId;
      context.assignments = assignmentsSnap.val() || {};
      context.counters = countersSnap.val() || {};
      context.services = servicesSnap.val() || {};

      orgContextCache.set(orgId, context);
      return context;
    }

    Object.entries(groupedTokens).forEach(([orgId, orgTokens]) => {
      Object.entries(orgTokens || {}).forEach(([tokenId, tokenData]) => {
        tokens.push({
          id: tokenId,
          orgId,
          organizationId: orgId,
          ...tokenData
        });
      });
    });

    const hydratedTokens = await Promise.all(tokens.map(async (token) => {
      if (!token?.orgId || !token?.serviceId || !token?.id) {
        return token;
      }

      try {
        const orgContext = await getOrgContext(token.orgId);
        // Read the full service queue so we can compute positions and estimates
        const queueSnap = await db.ref(`users/${token.orgId}/queue/${token.serviceId}`).once('value');
        const queueData = queueSnap.val() || {};
        const liveToken = queueData[token.id] || {};
        const queueState = window.userAppTracker?.computeQueueState?.(queueData, token.tokenNumber) || null;
        const assignment = Object.values(orgContext.assignments || {}).find((entry) => Array.isArray(entry?.services) && entry.services.includes(token.serviceId));
        const assignedCounterId = liveToken.assignedCounterId || liveToken.counterId || token.assignedCounterId || token.counterId || assignment?.counterId || null;
        const assignedCounter = assignedCounterId ? orgContext.counters?.[assignedCounterId] : null;
        const assignedCounterName = liveToken.assignedCounterName || liveToken.counterName || token.assignedCounterName || token.counterName || assignedCounter?.name || assignedCounter?.counterName || assignment?.counterName || null;
        const serviceEstimatedTime = normalizeMinutes(liveToken.serviceEstimatedTime || token.serviceEstimatedTime || orgContext.services?.[token.serviceId]?.estimatedTime);
        const displayData = resolveTokenDisplayData({
          ...token,
          ...liveToken,
          serviceEstimatedTime,
          assignedCounterId,
          assignedCounterName
        }, queueState, queueData);

        return {
          ...token,
          ...liveToken,
          serviceEstimatedTime,
          organizationName: token.organizationName || liveToken.organizationName || liveToken.orgName || orgContext.organizationName,
          orgName: token.orgName || liveToken.orgName || orgContext.organizationName,
          resolvedOrganizationName: orgContext.organizationName,
          assignedCounterId,
          assignedCounterName,
          resolvedCounterName: assignedCounterName,
          counterLabel: displayData.counterLabel,
          livePositionLabel: displayData.livePositionLabel,
          estimateTimeLabel: displayData.estimateTimeLabel,
          queueData: queueData
        };
      } catch (_) {
        return token;
      }
    }));

    const ownedTokens = hydratedTokens.filter((token) => isTokenOwnedByCurrentUser(token)).map((token) => ({
      ...token,
      tokenKey: getTokenHistoryKey(token)
    }));

    const previousSnapshots = state.tokenHistory.tokenSnapshots || {};
    const nextSnapshots = {};
    const notificationEvents = [];

    ownedTokens.forEach((token) => {
      const tokenKey = token.tokenKey;
      nextSnapshots[tokenKey] = {
        status: normalizeTokenStatus(token.status),
        counterLabel: String(token.counterLabel || '').trim(),
        livePositionLabel: String(token.livePositionLabel || '').trim(),
        estimateTimeLabel: String(token.estimateTimeLabel || '').trim()
      };

      const previousToken = previousSnapshots[tokenKey];
      const changeSummary = getTokenChangeSummary(previousToken, nextSnapshots[tokenKey]);
      if (changeSummary && isTokenNotificationsEnabled(tokenKey)) {
        notificationEvents.push({
          tokenNumber: token.tokenNumber,
          tokenKey,
          changeSummary
        });
      }
    });

    ownedTokens.sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));

    const ongoing = ownedTokens.filter((token) => isOngoingTokenStatus(token.status));
    const past = ownedTokens.filter((token) => isPastTokenStatus(token.status));

    state.tokenHistory = {
      loading: false,
      ongoing: ongoing.slice(0, 12),
      past: past.slice(0, 12),
      ongoingExpanded: !!state.tokenHistory.ongoingExpanded,
      ongoingVisibleCount: state.tokenHistory.ongoingExpanded ? ongoing.length : 3,
      pastVisibleCount: state.tokenHistory.pastVisibleCount || 3,
      totalOngoing: ongoing.length,
      totalPast: past.length,
      lastLoadedAt: Date.now(),
      error: '',
      tokenSnapshots: nextSnapshots,
      recentNotifications: state.tokenHistory.recentNotifications || []
    };

    syncTokenQueueListeners(ongoing);

    notificationEvents.forEach((event) => {
      emitTokenNotification(`Token ${event.tokenNumber}`, event.changeSummary).catch(() => {});
    });
  } catch (err) {
    stopTokenQueueListeners();
    state.tokenHistory = {
      ...state.tokenHistory,
      loading: false,
      error: err.message || 'Unable to load token history.'
    };
  }

  renderTokenHistory();
}

function stopTokenHistoryListener() {
  if (state.tokenHistoryRef) {
    state.tokenHistoryRef.off();
    state.tokenHistoryRef = null;
  }
  clearTimeout(state.tokenHistoryRefreshTimer);
  state.tokenHistoryRefreshTimer = null;
  stopTokenQueueListeners();
}

function startTokenHistoryListener() {
  const currentUid = getCurrentAppUserUid();

  stopTokenHistoryListener();

  if (!currentUid) {
    return;
  }

  state.tokenHistoryRef = db.ref(`appuserTokens/${currentUid}`);
  state.tokenHistoryRef.on('value', async () => {
    await loadTokenHistory();
  }, (error) => {
    state.tokenHistory = {
      ...state.tokenHistory,
      loading: false,
      error: error?.message || 'Unable to load token history.'
    };
    renderTokenHistory();
  });
}

function showMessage(message, type = 'info') {
  const el = $('#message');
  if (!el) return;
  el.textContent = message;
  el.className = `message ${type}`;
  clearTimeout(showMessage._timer);
  showMessage._timer = setTimeout(() => {
    el.textContent = '';
    el.className = 'message';
  }, 4500);
}

function getTokenHistoryKey(token) {
  return [
    String(token?.orgId || token?.organizationId || token?.resolvedOrganizationId || '').trim(),
    String(token?.serviceId || '').trim(),
    String(token?.id || '').trim(),
    String(token?.tokenNumber || '').trim()
  ].join('::');
}

function getTokenNotificationStorageKey(uid) {
  return `wAITLESS_token_notifications_${String(uid || '').trim()}`;
}

function loadTokenNotificationPrefs(uid) {
  if (!uid) return {};
  try {
    const raw = window.localStorage.getItem(getTokenNotificationStorageKey(uid));
    return raw ? JSON.parse(raw) || {} : {};
  } catch (_) {
    return {};
  }
}

function saveTokenNotificationPrefs(uid) {
  if (!uid) return;
  try {
    window.localStorage.setItem(getTokenNotificationStorageKey(uid), JSON.stringify(state.tokenNotificationPrefs || {}));
  } catch (_) {
    // Ignore storage failures.
  }
}

function isTokenNotificationsEnabled(tokenKey) {
  return !!state.tokenNotificationPrefs?.[tokenKey];
}

function setTokenNotificationsEnabled(tokenKey, enabled) {
  const currentUid = getCurrentAppUserUid();
  if (!tokenKey) return;
  if (!state.tokenNotificationPrefs || typeof state.tokenNotificationPrefs !== 'object') {
    state.tokenNotificationPrefs = {};
  }
  if (enabled) {
    state.tokenNotificationPrefs[tokenKey] = true;
  } else {
    delete state.tokenNotificationPrefs[tokenKey];
  }
  saveTokenNotificationPrefs(currentUid);
}

async function emitTokenNotification(title, body) {
  const message = body || '';
  const notificationTitle = String(title || 'Token update').trim() || 'Token update';
  const notificationBody = String(message || '').trim();

  state.tokenHistory = {
    ...state.tokenHistory,
    recentNotifications: [
      {
        title: notificationTitle,
        body: notificationBody,
        timeLabel: new Date().toLocaleString()
      },
      ...(state.tokenHistory.recentNotifications || [])
    ].slice(0, 5)
  };
  renderTokenNotificationArea();

  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(notificationTitle, { body: notificationBody });
      } catch (_) {
        showMessage(`${notificationTitle}${notificationBody ? `: ${notificationBody}` : ''}`, 'info');
      }
      return;
    }

    if (Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(notificationTitle, { body: notificationBody });
          return;
        }
      } catch (_) {
        // fall through to in-app message
      }
    }
  }

  showMessage(`${notificationTitle}${notificationBody ? `: ${notificationBody}` : ''}`, 'info');
}

function getTokenChangeSummary(previousToken, nextToken) {
  if (!previousToken || !nextToken) return '';

  const changes = [];
  const previousStatus = normalizeTokenStatus(previousToken.status);
  const nextStatus = normalizeTokenStatus(nextToken.status);
  const previousCounter = String(previousToken.counterLabel || previousToken.assignedCounterName || previousToken.counterName || '').trim();
  const nextCounter = String(nextToken.counterLabel || nextToken.assignedCounterName || nextToken.counterName || '').trim();
  const previousPosition = String(previousToken.livePositionLabel || '').trim();
  const nextPosition = String(nextToken.livePositionLabel || '').trim();

  if (previousStatus !== nextStatus) {
    changes.push(`status ${previousStatus || 'waiting'} -> ${nextStatus || 'waiting'}`);
  }
  if (previousPosition !== nextPosition && nextPosition) {
    changes.push(`position ${nextPosition}`);
  }
  if (previousCounter !== nextCounter && nextCounter) {
    changes.push(`counter ${nextCounter}`);
  }

  return changes.join(' • ');
}

function stopTokenQueueListeners() {
  Object.values(state.tokenQueueRefs || {}).forEach((ref) => {
    try {
      ref.off('value');
    } catch (_) {
      // ignore listener cleanup errors
    }
  });
  state.tokenQueueRefs = {};
}

function scheduleTokenHistoryReload() {
  clearTimeout(state.tokenHistoryRefreshTimer);
  state.tokenHistoryRefreshTimer = setTimeout(() => {
    loadTokenHistory().catch(() => {});
  }, 150);
}

function syncTokenQueueListeners(tokens = []) {
  const desiredPaths = new Map();

  (tokens || []).forEach((token) => {
    if (!token?.orgId || !token?.serviceId) return;
    const path = `users/${token.orgId}/queue/${token.serviceId}`;
    desiredPaths.set(path, true);
  });

  Object.entries(state.tokenQueueRefs || {}).forEach(([path, ref]) => {
    if (desiredPaths.has(path)) return;
    try {
      ref.off('value');
    } catch (_) {
      // ignore listener cleanup errors
    }
    delete state.tokenQueueRefs[path];
  });

  desiredPaths.forEach((_, path) => {
    if (state.tokenQueueRefs[path]) return;
    const queueRef = db.ref(path);
    state.tokenQueueRefs[path] = queueRef;
    queueRef.on('value', () => {
      if (!getCurrentAppUserUid()) return;
      scheduleTokenHistoryReload();
    });
  });
}

function getLoginUrl() {
  const url = new URL('login.html', window.location.href);
  const currentUrl = new URL(window.location.href);
  if (currentUrl.searchParams.get('orgId')) {
    url.searchParams.set('orgId', currentUrl.searchParams.get('orgId'));
  }
  return url.toString();
}

function setMobileAppBlocked(isBlocked) {
  state.mobileAppBlocked = !!isBlocked;

  const blockedPanel = $('#blocked-panel');
  const scanSection = $('#scan-section');
  const orgPanel = $('#org-panel');
  const trackerSection = $('#tracker-section');

  if (blockedPanel) blockedPanel.classList.toggle('hidden', !state.mobileAppBlocked);
  if (scanSection) scanSection.classList.toggle('hidden', state.mobileAppBlocked);
  if (orgPanel) orgPanel.classList.toggle('hidden', state.mobileAppBlocked || !state.orgId);
  if (trackerSection) trackerSection.classList.toggle('hidden', state.mobileAppBlocked);

  if (state.mobileAppBlocked) {
    state.services = {};
    hideTokenOverlay();
    hideTrackerOverlay();
    stopScanner();
    renderServices();
    showMessage('This process is not allowed by organization.', 'error');
  }
}

async function loadAppUserProfile(user) {
  if (!user) return null;
  const snap = await db.ref(`appuser/${user.uid}`).once('value');
  return snap.val() || null;
}

async function saveAppUserProfile(updates) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to save your profile.');

  const normalizePhoneLookupKey = (value) => String(value || '').trim().replace(/[^0-9+]/g, '');

  const name = String(updates.name || '').trim();
  const phone = String(updates.phone || '').trim();
  const email = String(updates.email || user.email || '').trim();

  if (!name) {
    throw new Error('Name is required.');
  }

  if (!phone) {
    throw new Error('Phone number is required.');
  }

  const currentSnap = await db.ref(`appuser/${user.uid}`).once('value');
  const current = currentSnap.val() || {};
  const payload = {
    uid: user.uid,
    name,
    phone,
    email,
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  };

  if (!current.createdAt) {
    payload.createdAt = firebase.database.ServerValue.TIMESTAMP;
  }

  await db.ref(`appuser/${user.uid}`).update(payload);
  const phoneKey = normalizePhoneLookupKey(phone);
  if (phoneKey) {
    await db.ref(`appuserPhones/${phoneKey}`).set({
      uid: user.uid,
      name,
      phone,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }
  const previousPhoneKey = normalizePhoneLookupKey(current.phone);
  if (previousPhoneKey && previousPhoneKey !== phoneKey) {
    await db.ref(`appuserPhones/${previousPhoneKey}`).remove();
  }
  state.appUser = { ...current, ...payload };
  return state.appUser;
}

async function syncAppUserPhoneIndex(appUser) {
  const phone = String(appUser?.phone || '').trim();
  const name = String(appUser?.name || appUser?.displayName || '').trim();
  const uid = String(appUser?.uid || '').trim();
  const normalizePhoneLookupKey = (value) => String(value || '').trim().replace(/[^0-9+]/g, '');
  const phoneKey = normalizePhoneLookupKey(phone);

  if (!phoneKey || !uid) return;

  await db.ref(`appuserPhones/${phoneKey}`).set({
    uid,
    name,
    phone,
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  });
}

function resolveOrganizationName() {
  return state.currentProfile?.profile?.name
    || state.currentProfile?.name
    || state.currentProfile?.organizationName
    || '(NO NAME)';
}

function updateTokenOverlay({ tokenNumber, serviceName, orgId, position, counter, status, estimateTimeLabel, message }) {
  const overlay = $('#token-overlay');
  const numberEl = $('#token-overlay-number');
  const metaEl = $('#token-overlay-meta');
  const positionEl = $('#token-overlay-position');
  const counterEl = $('#token-overlay-counter');
  const estimateEl = $('#token-overlay-estimate');
  const statusEl = $('#token-overlay-status');

  if (!overlay || !numberEl || !metaEl || !positionEl || !counterEl || !estimateEl || !statusEl) return;

  numberEl.textContent = tokenNumber || '---';
  metaEl.innerHTML = `${escapeHtml(serviceName || 'Service')} • ${escapeHtml(resolveOrganizationName())}${message ? `<div class="token-overlay-message">${escapeHtml(message)}</div>` : ''}`;
  const normalizedPosition = Number(position);
  const normalizedStatus = String(status || '').trim().toLowerCase();
  positionEl.textContent = normalizedStatus === 'serving'
    ? 'Now serving'
    : (Number.isFinite(normalizedPosition) && normalizedPosition > 0 ? `#${normalizedPosition}` : 'Waiting');
  counterEl.textContent = resolveCounterName(counter);
  estimateEl.textContent = estimateTimeLabel || 'N/A';
  statusEl.textContent = status || 'waiting';
}

function showTokenOverlay(data) {
  state.tokenOverlayRestoreFocus = getFocusableElementFromNode(document.activeElement);
  updateTokenOverlay(data);
  const overlay = $('#token-overlay');

  if (!overlay) return;

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function startLiveTokenOverlayTracking(tokenNumber, serviceName) {
  if (!window.userAppTracker || typeof userAppTracker.startTracking !== 'function') {
    return;
  }

  state.liveTokenTracking = true;
  userAppTracker.stopTracking?.();

  userAppTracker.startTracking(db, tokenNumber, {
    onUpdate: ({ match, state: queueState, queueData }) => {
      if (!state.liveTokenTracking) return;
      const displayData = resolveTokenDisplayData(queueState?.token || {}, queueState, queueData);

      updateTokenOverlay({
        tokenNumber: displayData.tokenNumber,
        serviceName: queueState?.token?.serviceName || serviceName || match?.serviceId || 'Service',
        orgId: match?.orgId || state.orgId,
        position: queueState?.position,
        status: queueState?.token?.status || 'waiting',
        counter: displayData.counterLabel,
        estimateTimeLabel: displayData.estimateTimeLabel,
      });
    },
    onError: (message) => {
      if (!state.liveTokenTracking) return;
      showMessage(message, 'error');
    }
  }, state.orgId).catch(() => {});
}

function hideTokenOverlay() {
  const overlay = $('#token-overlay');
  if (!overlay) return;
  state.liveTokenTracking = false;
  userAppTracker.stopTracking?.();
  const activeElement = document.activeElement;
  if (activeElement && overlay.contains(activeElement) && typeof activeElement.blur === 'function') {
    activeElement.blur();
  }
  const restoreTarget = getFocusableElementFromNode(state.tokenOverlayRestoreFocus)
    || getFocusableElementFromNode(document.querySelector('#services-list .qm-item button, #services-list .qm-item'))
    || getFocusableElementFromNode(document.body);
  if (restoreTarget && document.contains(restoreTarget)) {
    try {
      restoreTarget.focus({ preventScroll: true });
    } catch (_) {
      restoreTarget.focus();
    }
  }
  overlay.inert = false;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  state.tokenOverlayRestoreFocus = null;
}

function showTrackerOverlay({ tokenNumber, serviceName, orgId, position, counter, status, contentHtml }) {
  const overlay = $('#tracker-overlay');
  const numberEl = $('#tracker-overlay-number');
  const metaEl = $('#tracker-overlay-meta');
  const contentEl = $('#tracker-overlay-content');

  if (!overlay || !numberEl || !metaEl || !contentEl) return;

  numberEl.textContent = tokenNumber || '---';
  metaEl.textContent = `${serviceName || 'Service'} • ${resolveOrganizationName()}`;
  contentEl.innerHTML = contentHtml || '';
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function hideTrackerOverlay() {
  const overlay = $('#tracker-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

function getNormalizedServiceCategory(category) {
  const raw = String(category || '').trim();
  if (!raw) return 'uncategorized';
  return raw.toLowerCase();
}

function getServiceCategoryLabel(category) {
  const raw = String(category || '').trim();
  return raw || 'Uncategorized';
}

function getAvailableServiceCategories() {
  const categories = {};
  Object.values(state.services || {}).forEach((service) => {
    const key = getNormalizedServiceCategory(service.category);
    if (!categories[key]) {
      categories[key] = {
        label: getServiceCategoryLabel(service.category),
        count: 0
      };
    }
    categories[key].count += 1;
  });
  return Object.entries(categories)
    .map(([value, info]) => ({ value, label: info.label, count: info.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function selectServiceCategory(categoryValue) {
  state.selectedServiceCategory = String(categoryValue || '').trim() || 'all';
  renderServices();
}

function resolveCounterName(counterValue) {
  if (!counterValue) return 'Waiting';

  const rawValue = String(counterValue).trim();
  const fromRecord = state.counters?.[rawValue] || state.counters?.[String(counterValue || '').trim()];
  if (fromRecord && typeof fromRecord === 'object') {
    return fromRecord.name || fromRecord.counterName || rawValue;
  }

  const recordMatch = Object.values(state.counters || {}).find((counter) => {
    const name = String(counter?.name || counter?.counterName || '').trim();
    return name && name.toLowerCase() === rawValue.toLowerCase();
  });

  return recordMatch?.name || recordMatch?.counterName || rawValue;
}

function setOrgState(orgId) {
  state.orgId = String(orgId || '').trim();
  const input = $('#org-id-input');
  if (input) input.value = state.orgId;
  renderOrgSummary();
}

async function activateOrganization(orgId) {
  setOrgState(orgId);
  if (!state.orgId) {
    return;
  }

  try {
    await loadOrganizationContext();
  } catch (err) {
    showMessage('Unable to load organization: ' + err.message, 'error');
  }
}

function parseScannedValue(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const url = new URL(text, window.location.href);
    return url.searchParams.get('orgId') || url.searchParams.get('organizationId') || url.searchParams.get('org') || text;
  } catch (_) {
    return text;
  }
}

function renderOrgSummary() {
  const panel = $('#org-panel');
  if (!panel) return;

  if (!state.orgId) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  renderTokenHistory();
}

function renderCategories() {
  const categoriesPanel = $('#categories-panel');
  if (!categoriesPanel) return;
  const categories = getAvailableServiceCategories();
  categoriesPanel.innerHTML = '';

  if (categories.length === 0) {
    categoriesPanel.classList.add('hidden');
    return;
  }

  const intro = document.createElement('div');
  intro.className = 'category-selection-intro';
  intro.innerHTML = `
    <div class="service-category-header">
      <h3>Select a service category</h3>
      <p>Pick a category first, then choose the correct service.</p>
    </div>
  `;
  categoriesPanel.appendChild(intro);

  const categoryGrid = document.createElement('div');
  categoryGrid.className = 'service-category-grid';

  const allOption = document.createElement('button');
  allOption.type = 'button';
  allOption.className = 'service-card category-card';
  allOption.textContent = 'All services';
  allOption.addEventListener('click', () => selectServiceCategory('all'));
  categoryGrid.appendChild(allOption);

  categories.forEach((category) => {
    const categoryCard = document.createElement('button');
    categoryCard.type = 'button';
    categoryCard.className = 'service-card category-card';
    categoryCard.innerHTML = `<strong>${escapeHtml(category.label)}</strong><span>${category.count} service${category.count === 1 ? '' : 's'}</span>`;
    categoryCard.addEventListener('click', () => selectServiceCategory(category.value));
    categoryGrid.appendChild(categoryCard);
  });

  categoriesPanel.appendChild(categoryGrid);
  categoriesPanel.classList.remove('hidden');
}

function renderServices() {
  const categoriesPanel = $('#categories-panel');
  const grid = $('#services-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const serviceEntries = Object.entries(state.services || {});
  if (serviceEntries.length === 0) {
    if (categoriesPanel) categoriesPanel.classList.add('hidden');
    grid.innerHTML = '<p class="lead" style="color:#64748b;">No services available for this organization.</p>';
    return;
  }

  if (state.serviceCategoriesEnabled && state.selectedServiceCategory === '') {
    renderCategories();
    if (grid) grid.classList.add('hidden');
    return;
  }

  if (categoriesPanel) {
    categoriesPanel.classList.toggle('hidden', !state.serviceCategoriesEnabled);
  }

  const filteredEntries = state.serviceCategoriesEnabled && state.selectedServiceCategory && state.selectedServiceCategory !== 'all'
    ? serviceEntries.filter(([, service]) => getNormalizedServiceCategory(service.category) === state.selectedServiceCategory)
    : serviceEntries;

  if (state.serviceCategoriesEnabled && state.selectedServiceCategory) {
    const currentCategoryLabel = state.selectedServiceCategory === 'all'
      ? 'All services'
      : getAvailableServiceCategories().find((cat) => cat.value === state.selectedServiceCategory)?.label || getServiceCategoryLabel(state.selectedServiceCategory);
    const header = document.createElement('div');
    header.className = 'category-filter-header';
    header.innerHTML = `
      <div class="category-filter-label">Category: <strong>${escapeHtml(currentCategoryLabel)}</strong></div>
      <button type="button" class="secondary button-small" id="change-category-btn">Change category</button>
    `;
    grid.appendChild(header);
    const changeButton = header.querySelector('#change-category-btn');
    if (changeButton) {
      changeButton.addEventListener('click', () => selectServiceCategory(''));
    }
  }

  if (filteredEntries.length === 0) {
    grid.innerHTML += '<p class="lead" style="color:#64748b;">No services available for this category.</p>';
    grid.classList.remove('hidden');
    return;
  }

  filteredEntries.forEach(([serviceId, service], index) => {
    const card = document.createElement('div');
    card.className = 'service-card';

    const counterInfo = resolveCounterForService(serviceId);
    card.innerHTML = `
      <h4>${escapeHtml(service.name || `Service ${index + 1}`)}</h4>
      <p>${escapeHtml(service.description || 'Please select this service to continue.')}</p>
      <p class="meta">Estimated time: ${escapeHtml(service.estimatedTime ? `${service.estimatedTime} min` : 'N/A')}</p>
      <p class="meta">Counter: ${escapeHtml(counterInfo?.counterName || 'Not assigned')}</p>
    `;

    const button = document.createElement('button');
    button.className = 'primary';
    button.type = 'button';
    button.textContent = 'Get Token';
    button.addEventListener('click', () => issueToken(serviceId, service, button));
    card.appendChild(button);

    grid.appendChild(card);
  });

  grid.classList.remove('hidden');
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

async function loadOrganizationContext() {
  if (!state.orgId) return;

  const [publicServicesResult, privateServicesResult] = await Promise.allSettled([
    db.ref(`publicOrganizations/${state.orgId}/services`).once('value'),
    db.ref(`users/${state.orgId}/services`).once('value')
  ]);

  const publicServices = publicServicesResult.status === 'fulfilled' ? (publicServicesResult.value.val() || {}) : {};
  const privateServices = privateServicesResult.status === 'fulfilled' ? (privateServicesResult.value.val() || {}) : {};
  state.services = Object.keys(publicServices).length > 0 ? publicServices : privateServices;

  const optionalReads = await Promise.allSettled([
    db.ref(`users/${state.orgId}/profile`).once('value'),
    db.ref(`users/${state.orgId}/settings`).once('value'),
    db.ref(`users/${state.orgId}/settings/kioskCustomerDetails`).once('value'),
    db.ref(`users/${state.orgId}/assignments`).once('value'),
    db.ref(`users/${state.orgId}/counters`).once('value')
  ]);

  const profileSnap = optionalReads[0].status === 'fulfilled' ? optionalReads[0].value : null;
  const settingsSnap = optionalReads[1].status === 'fulfilled' ? optionalReads[1].value : null;
  const kioskSettingsSnap = optionalReads[2].status === 'fulfilled' ? optionalReads[2].value : null;
  const assignmentsSnap = optionalReads[3].status === 'fulfilled' ? optionalReads[3].value : null;
  const countersSnap = optionalReads[4].status === 'fulfilled' ? optionalReads[4].value : null;

  const profile = profileSnap ? (profileSnap.val() || {}) : {};
  const settings = settingsSnap ? (settingsSnap.val() || {}) : {};
  const kioskSettings = kioskSettingsSnap ? (kioskSettingsSnap.val() || {}) : {};
  state.currentProfile = { profile, settings };
  state.serviceCategoriesEnabled = !!kioskSettings.serviceCategoriesEnabled;
  state.selectedServiceCategory = state.serviceCategoriesEnabled ? '' : 'all';
  setMobileAppBlocked(!!kioskSettings.mobileAppBlocked || !!settings.mobileAppBlocked);

  state.assignments = assignmentsSnap ? (assignmentsSnap.val() || {}) : {};
  state.counters = countersSnap ? (countersSnap.val() || {}) : {};

  renderOrgSummary();
  renderServices();
  await loadTokenHistory();

  if (state.mobileAppBlocked) {
    return;
  }

}
async function issueToken(serviceId, service, buttonEl = null) {
  if (!state.orgId) {
    showMessage('Scan or enter an organization first.', 'error');
    return;
  }

  if (state.mobileAppBlocked) {
    showMessage('This process is not allowed by organization.', 'error');
    return;
  }

  const currentUid = state.appUser?.uid || auth.currentUser?.uid;
  if (!currentUid) {
    showMessage('Sign in to your app account before booking.', 'error');
    window.location.replace(getLoginUrl());
    return;
  }

  const kioskId = 'WALK_IN';
  const kioskName = 'Walk-in';
  const serviceName = service?.name || 'Service';

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.dataset.originalText = buttonEl.textContent || 'Get Token';
    buttonEl.textContent = 'Creating...';
  }

  try {
    showMessage(`Creating token for ${serviceName}...`, 'info');
    const prefix = await tokenFactory.resolveOrganizationTokenPrefix(db, state.orgId);
    const tokenId = tokenFactory.generateTokenId('TOKEN');
    const bookingPrefix = state.onlineBookingMode ? `${prefix}OB` : prefix;
    const tokenNumber = await tokenFactory.generateSequentialTokenNumber(db, {
      organizationId: state.orgId,
      prefix: bookingPrefix,
      serviceId,
      skipOpenHoursCheck: true
    });

    const counterInfo = resolveCounterForService(serviceId) || {};
    const customerUid = currentUid;
    const customerName = String(state.appUser?.name || state.appUser?.displayName || '').trim() || null;
    const customerPhone = String(state.appUser?.phone || '').trim() || null;
    const customerEmail = String(state.appUser?.email || auth.currentUser?.email || '').trim() || null;
    const organizationName = resolveOrganizationName();
    const serviceScheduleState = await tokenFactory.resolveServiceScheduleState(db, state.orgId, serviceId);
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
      organizationId: state.orgId,
      organizationName,
      kioskId,
      kioskName,
      serviceId,
      serviceName,
      serviceEstimatedTime: Number(service?.estimatedTime || 0) || null,
      customerUid,
      customerName,
      customerPhone,
      customerEmail,
      source: 'mobile-app',
      assignedCounterId: counterInfo.counterId || null,
      assignedCounterName: counterInfo.counterName || null
    });

    const updates = {
      [`users/${state.orgId}/queue/${serviceId}/${tokenId}`]: {
        ...tokenData,
        serviceId,
        serviceName,
        kioskId,
        kioskName
      }
    };

    if (customerUid && !customerUid.startsWith('guest:')) {
      updates[`appuserTokens/${customerUid}/${state.orgId}/${tokenId}`] = {
        ...tokenData,
        organizationName,
        serviceId,
        serviceName,
        kioskId,
        kioskName
      };
    }

    await db.ref().update(updates);

    showMessage(`Token created: ${tokenNumber}`, 'success');

    if (serviceScheduleBlocked) {
      const deferredUntil = serviceScheduleNextStart ? serviceScheduleNextStart.getTime() : null;
      if (deferredUntil && serviceScheduleNextStart) {
        await db.ref(`users/${state.orgId}/queue/${serviceId}/${tokenId}`).update({
          deferredUntil,
          scheduledFor: serviceScheduleNextStart.toISOString(),
          status: 'scheduled'
        });
        if (customerUid && !customerUid.startsWith('guest:')) {
          await db.ref(`appuserTokens/${customerUid}/${state.orgId}/${tokenId}`).update({
            deferredUntil,
            scheduledFor: serviceScheduleNextStart.toISOString(),
            status: 'scheduled'
          });
        }
      }

      const scheduledLabel = serviceScheduleNextStart ? serviceScheduleNextStart.toLocaleString() : 'Scheduled';
      showMessage(`Token created: ${tokenNumber}. ${serviceScheduleMessage}`, 'info');
      showTokenOverlay({
        tokenNumber,
        serviceName,
        orgId: state.orgId,
        position: 1,
        counter: 'Scheduled',
        estimateTimeLabel: scheduledLabel,
        status: 'scheduled',
        message: serviceScheduleMessage
      });
      startLiveTokenOverlayTracking(tokenNumber, serviceName);
      return;
    }

    // Compute served-at estimate by summing estimated minutes of tokens ahead in queue
    try {
      const queueSnap = await db.ref(`users/${state.orgId}/queue/${serviceId}`).once('value');
      const queueData = queueSnap.val() || {};
      const entries = Object.entries(queueData).map(([id, t]) => ({ id, ...(t || {}) }));
      const waitingEntries = entries
        .filter((entry) => !isPastTokenStatus(entry.status) && isWaitingToken(entry.status))
        .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));

      const normalizeTokenNumberLocal = (value) => String(value || '').trim().toUpperCase();
      const targetIndex = waitingEntries.findIndex((entry) => normalizeTokenNumberLocal(entry.tokenNumber) === normalizeTokenNumberLocal(tokenNumber));

      let estimateMinutes = Number(service?.estimatedTime || 0) || 0;
      if (targetIndex >= 0) {
        estimateMinutes = waitingEntries.slice(0, targetIndex).reduce((sum, entry) => sum + resolveTokenEstimatedMinutes(entry), 0);
      }

      const openSnap = await db.ref(`users/${state.orgId}/settings/openHours`).once('value');
      const openHours = openSnap.val() || {};

      function parseHM(v) {
        if (!v) return null;
        const parts = String(v || '').split(':');
        if (parts.length < 2) return null;
        return { h: parseInt(parts[0], 10), m: parseInt(parts[1], 10) };
      }

      function isWithinOpenHours(hoursObj, dt) {
        const key = ['sun','mon','tue','wed','thu','fri','sat'][dt.getDay()];
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
        for (let i = 0; i < 8; i += 1) {
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
          await db.ref(`users/${state.orgId}/queue/${serviceId}/${tokenId}`).update({
            deferredUntil,
            scheduledFor: nextOpen.toISOString(),
            status: 'scheduled'
          });
          if (customerUid && !customerUid.startsWith('guest:')) {
            await db.ref(`appuserTokens/${customerUid}/${state.orgId}/${tokenId}`).update({
              deferredUntil,
              scheduledFor: nextOpen.toISOString(),
              status: 'scheduled'
            });
          }
        }
      }

      const estimateLabel = deferredUntil
        ? new Date(deferredUntil).toLocaleString()
        : formatEstimateTime(estimateMinutes);

      showTokenOverlay({
        tokenNumber,
        serviceName,
        orgId: state.orgId,
        position: deferredUntil ? 1 : (Number.isFinite(targetIndex) ? targetIndex + 1 : 'Waiting'),
        counter: deferredUntil ? 'Scheduled' : 'Waiting',
        estimateTimeLabel: estimateLabel,
        status: deferredUntil ? 'scheduled' : 'waiting',
        message: deferredUntil ? 'Service will be served at the scheduled time.' : ''
      });
    } catch (err) {
      showTokenOverlay({
        tokenNumber,
        serviceName,
        orgId: state.orgId,
        position: 'Waiting',
        counter: 'Waiting',
        estimateTimeLabel: formatEstimateTime(service?.estimatedTime),
        status: 'waiting'
      });
    }
    startLiveTokenOverlayTracking(tokenNumber, serviceName);
  } catch (err) {
    console.error('Token creation failed:', err);
    showMessage('Failed to create token: ' + err.message, 'error');
  } finally {
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.textContent = buttonEl.dataset.originalText || 'Get Token';
      delete buttonEl.dataset.originalText;
    }
  }
}

async function bindTracker(tokenNumber) {
  const resultEl = $('#tracker-result');
  if (!resultEl) return;

  resultEl.className = 'tracker-result';
  resultEl.innerHTML = '<div class="tracker-row"><span class="tracker-label">Searching</span><span class="tracker-value">Loading...</span></div>';

  showTrackerOverlay({
    tokenNumber,
    serviceName: 'Searching',
    contentHtml: '<div class="tracker-row"><span class="tracker-label">Status</span><span class="tracker-value">Loading...</span></div>'
  });

  try {
    await userAppTracker.startTracking(db, tokenNumber, {
      onUpdate: ({ match, state: queueState, queueData }) => {
        if (!queueState || !queueState.token) {
          resultEl.className = 'tracker-result';
          resultEl.innerHTML = '<div class="tracker-row"><span class="tracker-label">Status</span><span class="tracker-value">Token located, but queue state is unavailable.</span></div>';
          showTrackerOverlay({
            tokenNumber,
            serviceName: 'Token found',
            contentHtml: '<div class="tracker-row"><span class="tracker-label">Status</span><span class="tracker-value">Token located, but queue state is unavailable.</span></div>'
          });
          return;
        }

        resultEl.className = 'tracker-result';
        const displayData = resolveTokenDisplayData(queueState.token, queueState, queueData);
        resultEl.innerHTML = `
          <div class="tracker-row"><span class="tracker-label">Token</span><span class="tracker-value">${escapeHtml(displayData.tokenNumber)}</span></div>
          <div class="tracker-row"><span class="tracker-label">Counter</span><span class="tracker-value">${escapeHtml(displayData.counterLabel)}</span></div>
          <div class="tracker-row"><span class="tracker-label">Estimate Time</span><span class="tracker-value">${escapeHtml(displayData.estimateTimeLabel)}</span></div>
          <div class="tracker-row"><span class="tracker-label">Live Position</span><span class="tracker-value">${escapeHtml(displayData.livePositionLabel)}</span></div>
          <div class="tracker-row"><span class="tracker-label">Organization</span><span class="tracker-value">${escapeHtml(resolveOrganizationName())}</span></div>
          <div class="tracker-row"><span class="tracker-label">Service</span><span class="tracker-value">${escapeHtml(queueState.token.serviceName || queueState.token.serviceId || match.serviceId)}</span></div>
          <div class="tracker-row"><span class="tracker-label">Status</span><span class="tracker-value">${escapeHtml(queueState.token.status || 'waiting')}</span></div>
        `;
        showTrackerOverlay({
          tokenNumber: displayData.tokenNumber,
          serviceName: queueState.token.serviceName || queueState.token.serviceId || match.serviceId,
          contentHtml: resultEl.innerHTML
        });
      },
      onError: (message) => {
        resultEl.className = 'tracker-result empty';
        resultEl.textContent = message;
        showTrackerOverlay({
          tokenNumber,
          serviceName: 'Token lookup',
          contentHtml: `<div class="tracker-row"><span class="tracker-label">Status</span><span class="tracker-value">${escapeHtml(message)}</span></div>`
        });
      }
    }, state.orgId);
  } catch (err) {
    resultEl.className = 'tracker-result empty';
    resultEl.textContent = err.message;
    showTrackerOverlay({
      tokenNumber,
      serviceName: 'Token lookup',
      contentHtml: `<div class="tracker-row"><span class="tracker-label">Status</span><span class="tracker-value">${escapeHtml(err.message)}</span></div>`
    });
  }
}

function stopScanner() {
  if (state.scanner) {
    state.scanner.stop().catch(() => {});
    state.scanner = null;
  }
}

async function startScanner() {
  const readerId = 'qr-reader';
  const readerEl = document.getElementById(readerId);
  if (!readerEl || typeof Html5Qrcode === 'undefined') {
    showMessage('QR scanner is not available.', 'error');
    return;
  }

  stopScanner();
  readerEl.innerHTML = '';
  state.scanner = new Html5Qrcode(readerId);

  try {
    await state.scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        const orgId = parseScannedValue(decodedText);
        stopScanner();
        if (orgId) {
          await activateOrganization(orgId);
          showMessage('Organization loaded from QR.', 'success');
        }
      },
      () => {}
    );
    showMessage('Scanner started. Point it at the organization QR.', 'info');
  } catch (err) {
    showMessage('Unable to start scanner: ' + err.message, 'error');
  }
}

function wireEvents() {
  $('#start-scan-btn')?.addEventListener('click', startScanner);
  $('#stop-scan-btn')?.addEventListener('click', () => {
    stopScanner();
    showMessage('Scanner stopped.', 'info');
  });

  $('#set-org-btn')?.addEventListener('click', async () => {
    const value = $('#org-id-input')?.value || '';
    await activateOrganization(parseScannedValue(value));
  });

  $('#org-id-input')?.addEventListener('input', () => {
    if (state.mobileAppBlocked) {
      setMobileAppBlocked(true);
    }
  });

  $('#tracker-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const tokenNumber = $('#token-number-input')?.value.trim();
    if (!tokenNumber) {
      showMessage('Enter a token number to track.', 'error');
      return;
    }
    await bindTracker(tokenNumber);
  });

  $('#refresh-token-history-btn')?.addEventListener('click', async () => {
    await loadTokenHistory();
    showMessage('Token history refreshed.', 'success');
  });

  $('#past-token-load-more-btn')?.addEventListener('click', () => {
    state.tokenHistory.pastVisibleCount = Math.max(3, Number(state.tokenHistory.pastVisibleCount || 3) + 3);
    renderTokenHistory();
  });

  $('#ongoing-token-toggle-btn')?.addEventListener('click', () => {
    state.tokenHistory.ongoingExpanded = !state.tokenHistory.ongoingExpanded;
    renderTokenHistory();
  });

  $('#ongoing-token-list')?.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('.token-notify-btn');
    if (!button) return;

    const tokenKey = String(button.dataset.tokenKey || '').trim();
    if (!tokenKey) return;

    const enabled = button.dataset.notifyEnabled !== '1';
    setTokenNotificationsEnabled(tokenKey, enabled);

    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (_) {
        // ignore permission errors and keep the in-app toggle enabled
      }
    }

    renderTokenHistory();
    showMessage(enabled ? 'Token updates enabled.' : 'Token updates muted.', 'success');
  });

  $('#close-token-overlay-btn')?.addEventListener('click', hideTokenOverlay);
  $('#token-overlay')?.addEventListener('click', (event) => {
    if (event.target?.id === 'token-overlay' || event.target?.classList?.contains('token-overlay-backdrop')) {
      hideTokenOverlay();
    }
  });

  $('#close-tracker-overlay-btn')?.addEventListener('click', hideTrackerOverlay);
  $('#tracker-overlay')?.addEventListener('click', (event) => {
    if (event.target?.id === 'tracker-overlay' || event.target?.classList?.contains('tracker-overlay-backdrop')) {
      hideTrackerOverlay();
    }
  });

  $('#close-profile-manager-btn')?.addEventListener('click', () => {
    state.profileManagerOpen = false;
    renderProfileManager();
  });

  $('#profile-manager-panel')?.addEventListener('click', (event) => {
    if (event.target?.id === 'profile-manager-panel') {
      state.profileManagerOpen = false;
      renderProfileManager();
    }
  });

  $('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const saveBtn = $('#save-profile-btn');
    const statusEl = $('#profile-status');
    const name = $('#profile-name-input')?.value || '';
    const phone = $('#profile-phone-input')?.value || '';
    const email = $('#profile-email-input')?.value || '';

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    if (statusEl) statusEl.textContent = '';

    try {
      await saveAppUserProfile({ name, phone, email });
      renderUserPanel();
      renderProfileManager();
      showMessage('Profile updated.', 'success');
      if (statusEl) statusEl.textContent = 'Saved';
    } catch (err) {
      showMessage(err.message, 'error');
      if (statusEl) statusEl.textContent = 'Save failed';
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save profile';
      }
    }
  });

}

function renderUserPanel() {
  const panel = $('#user-panel');
  if (!panel) return;
  if (state.appUser) {
    const name = escapeHtml(state.appUser.name || state.appUser.displayName || state.appUser.uid || 'You');
    const email = escapeHtml(state.appUser.email || '');
    panel.innerHTML = `
      <button id="profile-icon-btn" class="profile-icon-btn" type="button" aria-label="Open profile manager">👤</button>
      <div class="user-name">${name}</div>
      <div class="user-email">${email}</div>
      <button id="signout-btn" class="signout-btn">Sign out</button>
    `;
    $('#profile-icon-btn')?.addEventListener('click', () => {
      state.profileManagerOpen = true;
      renderProfileManager();
    });
    const signoutBtn = $('#signout-btn');
    signoutBtn?.addEventListener('click', async () => {
      try {
        stopTokenHistoryListener();
        await auth.signOut();
        window.location.replace(getLoginUrl());
      } catch (err) {
        showMessage('Sign out failed: ' + err.message, 'error');
      }
    });
  } else {
    panel.innerHTML = '';
  }
}

function renderProfileManager() {
  const panel = $('#profile-manager-panel');
  const nameInput = $('#profile-name-input');
  const phoneInput = $('#profile-phone-input');
  const emailInput = $('#profile-email-input');
  const statusEl = $('#profile-status');

  if (!panel || !nameInput || !phoneInput || !emailInput || !statusEl) return;

  if (!state.appUser || !state.profileManagerOpen) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  nameInput.value = state.appUser.name || state.appUser.displayName || '';
  phoneInput.value = state.appUser.phone || '';
  emailInput.value = state.appUser.email || auth.currentUser?.email || '';
  statusEl.textContent = '';
}

async function bootstrapApp() {
  wireEvents();
  renderOrgSummary();
  setMobileAppBlocked(false);
  renderTokenHistory();

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      stopTokenHistoryListener();
      window.location.replace(getLoginUrl());
      return;
    }
    // Require email-verified accounts for app access
    if (user.email && !user.emailVerified) {
      try {
        await user.reload();
      } catch (e) {
        // ignore reload errors
      }
      if (!user.emailVerified) {
        stopTokenHistoryListener();
        window.location.replace(getLoginUrl());
        return;
      }
    }
    try {
      const appUser = await loadAppUserProfile(user);
      if (!appUser) {
        stopTokenHistoryListener();
        window.location.replace(getLoginUrl());
        return;
      }

      state.appUser = appUser;
      try {
        await syncAppUserPhoneIndex(appUser);
      } catch (_) {
        // Index sync is best-effort.
      }
      renderUserPanel();
      renderProfileManager();
      startTokenHistoryListener();
      await loadTokenHistory();

      if (state.orgId) {
        await activateOrganization(state.orgId);
      } else {
        renderOrgSummary();
      }
    } catch (err) {
      showMessage('Unable to load app profile: ' + err.message, 'error');
      stopTokenHistoryListener();
      window.location.replace(getLoginUrl());
    }
  });
}

bootstrapApp();
