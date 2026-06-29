// Counter Live display script (moved to /counter)
if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

const orgSelect = document.getElementById('org-select');
const counterSelect = document.getElementById('counter-select');
const tokensEl = document.getElementById('tokens');
const statusEl = document.getElementById('status');
const refreshOrgsBtn = document.getElementById('refresh-orgs');
const authUserEl = document.getElementById('auth-user');
const selectionRow = document.getElementById('selection-row');

const orgLogoutBtn = document.getElementById('org-logout');
const signInBtn = document.getElementById('sign-in-btn');
const signInModal = document.getElementById('sign-in-modal');
const signInForm = document.getElementById('sign-in-form');
const signInCancel = document.getElementById('sign-in-cancel');
const signInMsg = document.getElementById('sign-in-msg');

let orgs = {};
let counters = {};
let activeListeners = [];
let chosenOrg = null;
let chosenCounter = null;
let renderRunId = 0;
let kioskCustomerSettings = { enabled: false, requireName: false, requirePhone: false, recallEnabled: false };
let tokenFilterQuery = '';

const ACTIVE_TOKEN_STATUSES = new Set(['waiting', 'arrived', 'scheduled']);

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

function setStatus(txt){ if(statusEl) statusEl.textContent = txt; }

function escapeHtml(text){
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setAuthUserLabel(user, profile){
  const badge = document.getElementById('user-profile-badge');
  const avatarChar = document.getElementById('user-avatar-char');
  if(!authUserEl) return;
  if(!user){
    authUserEl.textContent = 'Not signed in';
    if(badge) badge.style.display = 'none';
    return;
  }
  const name = profile?.organizationName || profile?.name || user.email || user.uid;
  authUserEl.textContent = name;
  if(badge) badge.style.display = 'flex';
  if(avatarChar) {
    avatarChar.textContent = String(name || 'U').trim().charAt(0).toUpperCase();
  }
}

function setSelectionVisibility(visible){
  if(selectionRow){
    selectionRow.style.display = visible ? 'flex' : 'none';
  }
}

function hideOrgSelectorKeepCounter() {
  // hide org label + select, keep counter select visible in the row
  const orgLabel = document.querySelector("label[for='org-select']");
  if (orgLabel) orgLabel.style.display = 'none';
  if (orgSelect) orgSelect.style.display = 'none';
  // ensure counter select and refresh remain visible
  const counterLabel = document.querySelector("label[for='counter-select']");
  if (counterLabel) counterLabel.style.display = '';
  if (counterSelect) counterSelect.style.display = '';
  if (refreshOrgsBtn) refreshOrgsBtn.style.display = '';
}

function showOrgSelector() {
  const orgLabel = document.querySelector("label[for='org-select']");
  if (orgLabel) orgLabel.style.display = '';
  if (orgSelect) orgSelect.style.display = '';
  const counterLabel = document.querySelector("label[for='counter-select']");
  if (counterLabel) counterLabel.style.display = '';
  if (counterSelect) counterSelect.style.display = '';
  if (refreshOrgsBtn) refreshOrgsBtn.style.display = '';
}

async function loadOrgs(){
  setStatus('Loading organizations...');
  try{
    const snap = await db.ref('users').once('value');
    const all = snap.val() || {};
    orgs = Object.fromEntries(Object.entries(all).filter(([uid, p]) => {
      return p && p.role === 'approved' && !p?.settings?.disabled;
    }));

    orgSelect.innerHTML = '<option value="">-- Select organization --</option>';
    Object.entries(orgs).forEach(([uid, profile])=>{
      const opt = document.createElement('option');
      opt.value = uid;
      opt.textContent = (profile.organizationName || profile.name || profile.email || uid);
      orgSelect.appendChild(opt);
    });

    orgSelect.disabled = false;
    refreshOrgsBtn.disabled = false;
    setStatus('Organizations loaded');
  }catch(err){
    console.error(err);
    setStatus('Failed to load organizations: ' + err.message);
  }
}

async function loadCounters(orgId){
  counterSelect.innerHTML = '<option value="">-- Select counter --</option>';
  counterSelect.disabled = true;
  if(!orgId) return;
  setStatus('Loading counters...');
  try{
    const snap = await db.ref(`users/${orgId}/counters`).once('value');
    counters = snap.val() || {};
    Object.entries(counters).forEach(([cid, c])=>{
      const opt = document.createElement('option');
      opt.value = cid;
      opt.textContent = (c.name || cid);
      counterSelect.appendChild(opt);
    });
    counterSelect.disabled = false;
    setStatus('Counters loaded');
    // load kiosk customer detail settings for this organization
    await loadKioskCustomerSettings(orgId);
  }catch(err){
    console.error(err);
    setStatus('Failed to load counters: ' + err.message);
  }
}

async function loadKioskCustomerSettings(orgId){
  try{
    const snap = await db.ref(`users/${orgId}/settings/kioskCustomerDetails`).once('value');
    const raw = snap.val() || {};
    kioskCustomerSettings = {
      enabled: !!raw.enabled,
      requireName: !!raw.requireName,
      requirePhone: !!raw.requirePhone,
      recallEnabled: !!raw.recallEnabled
    };
  }catch(err){
    console.error('Failed to load kiosk customer settings', err);
    kioskCustomerSettings = { enabled:false, requireName:false, requirePhone:false };
  }
}

function clearListeners(){
  activeListeners.forEach(off=>off());
  activeListeners = [];
}

async function listenForTokens(orgId, counterId){
  clearListeners();
  tokensEl.innerHTML = '';
  setStatus('Listening for tokens...');

  const allQueueRef = db.ref(`users/${orgId}/queue`);
  const allListener = allQueueRef.on('value', snap=>{ renderTokens(orgId, counterId); });
  activeListeners.push(()=>allQueueRef.off('value', allListener));

  await renderTokens(orgId, counterId);
}

async function renderTokens(orgId, counterId){
  const currentRunId = ++renderRunId;
  tokensEl.innerHTML = '';
  try{
    const nowMs = Date.now();
    if(currentRunId !== renderRunId) return;
    const queueSnap = await db.ref(`users/${orgId}/queue`).once('value');
    const queue = queueSnap.val() || {};
    if(currentRunId !== renderRunId) return;

    const tokensById = new Map();
    Object.entries(queue).forEach(([serviceId, serviceTokens])=>{
      Object.entries(serviceTokens || {}).forEach(([tokenId, t])=>{
        const assigned = t.assignedCounterId === counterId;
        const stageIndex = Number(t.currentServiceIndex ?? t.serviceStageIndex ?? 0);
        const tokenKey = `${tokenId}:${serviceId}:${stageIndex}`;
        tokensById.set(tokenKey, { serviceId, tokenId, ...t, assigned, tokenKey, stageIndex });
      });
    });

    const assignSnap = await db.ref(`users/${orgId}/assignments/${counterId}`).once('value');
    const assignment = assignSnap.val() || { services: [] };
    const serviceIds = Array.isArray(assignment.services) ? assignment.services : Object.values(assignment.services || {});
    const visible = Array.from(tokensById.values())
      .filter(t => {
        const scheduledAt = parseTimestampMs(t.scheduledFor || t.deferredUntil);
        if (scheduledAt !== null && scheduledAt > nowMs) {
          return false;
        }

        if (t.assignedCounterId) {
          return String(t.assignedCounterId).trim() === String(counterId).trim();
        }

        return serviceIds.includes(t.serviceId);
      })
      .filter(t => ACTIVE_TOKEN_STATUSES.has((t.status || 'waiting').toLowerCase()));

    if(currentRunId !== renderRunId) return;

    visible.sort((a,b)=> (a.timestamp||0) - (b.timestamp||0));
    const activeToken = visible[0] || null;

    // Panels will be rendered as siblings inside the workspace grid so they can appear side-by-side on wide screens.
    const workspaceGrid = document.querySelector('.workspace-grid');

    const tokenPanel = document.createElement('section');
    tokenPanel.className = 'portrait-panel';
    tokenPanel.appendChild(createPortraitHeader(
      '1. Token Display',
      activeToken ? 'Current live token for this counter' : 'No live token is active right now',
      activeToken ? 'Active' : 'Idle'
    ));

    const tokenBody = document.createElement('div');
    tokenBody.className = 'portrait-panel-body';

    if(activeToken){
      const item = document.createElement('div');
      item.className = 'token';
      const normalizedStatus = String(activeToken.status || 'waiting').toLowerCase();
      const statusText = normalizedStatus === 'scheduled'
        ? 'Status: Scheduled'
        : normalizedStatus === 'arrived'
          ? 'Status: Arrived'
          : normalizedStatus === 'waiting'
            ? 'Status: Waiting'
            : `Status: ${normalizedStatus || 'Waiting'}`;

      const stage = document.createElement('div');
      stage.className = 'token-stage';

      const numberEl = document.createElement('div');
      numberEl.className = 'token-number';
      numberEl.textContent = String(activeToken.tokenNumber || activeToken.id || '—');

      const metaEl = document.createElement('div');
      metaEl.className = 'token-meta';

      const servicePill = document.createElement('span');
      servicePill.className = 'meta-pill';
      servicePill.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg><strong>${escapeHtml(activeToken.serviceName || activeToken.serviceId)}</strong>`;
      metaEl.appendChild(servicePill);

      const kioskPill = document.createElement('span');
      kioskPill.className = 'meta-pill';
      kioskPill.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg><span>${escapeHtml(activeToken.kioskName || 'Live queue')}</span>`;
      metaEl.appendChild(kioskPill);

      const statusPill = document.createElement('span');
      statusPill.className = 'meta-pill';
      statusPill.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span>${statusText}</span>`;
      metaEl.appendChild(statusPill);

      if((kioskCustomerSettings && kioskCustomerSettings.enabled && kioskCustomerSettings.requireName) || activeToken.customerName){
        const customerPill = document.createElement('span');
        customerPill.className = 'customer-name';
        customerPill.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><small>Customer</small><span>${escapeHtml(activeToken.customerName || 'Not provided')}</span>`;
        metaEl.appendChild(customerPill);
      }

      stage.appendChild(numberEl);
      stage.appendChild(metaEl);

      const right = document.createElement('div');
      right.className='actions actions-panel';
      right.setAttribute('aria-label', 'token actions');

      const actionsHeading = document.createElement('div');
      actionsHeading.className = 'actions-title';
      actionsHeading.textContent = 'Operator Actions';
      right.appendChild(actionsHeading);

      const serveBtn = document.createElement('button');
      serveBtn.type='button';
      serveBtn.className='btn-serve';
      serveBtn.textContent='Call Next';
      serveBtn.onclick = ()=> updateTokenStatus(orgId, activeToken.serviceId, activeToken.tokenId, 'served', counterId, (counters[counterId]||{}).name, activeToken);

      const noshowBtn = document.createElement('button');
      noshowBtn.type='button';
      noshowBtn.className='btn-noshow';
      noshowBtn.textContent='No show';
      noshowBtn.onclick = ()=> updateTokenStatus(orgId, activeToken.serviceId, activeToken.tokenId, 'no-show', counterId, (counters[counterId]||{}).name);

      right.appendChild(serveBtn);
      right.appendChild(noshowBtn);

      item.appendChild(stage);
      item.appendChild(right);
      tokenBody.appendChild(item);
    } else {
      const empty = document.createElement('div');
      empty.className = 'token-empty';
      empty.textContent = 'No ongoing token for this counter.';
      tokenBody.appendChild(empty);
      setStatus('No ongoing token for the selected counter');
    }

    tokenPanel.appendChild(tokenBody);
    // (panel insertion moved until both panels are constructed)

    const servedTokens = Array.from(tokensById.values())
      .filter(t => (t.assigned || serviceIds.includes(t.serviceId)))
      .filter(t => (t.status || 'waiting').toLowerCase() === 'served')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const noShowTokens = Array.from(tokensById.values())
      .filter(t => (t.assigned || serviceIds.includes(t.serviceId)))
      .filter(t => (t.status || 'waiting').toLowerCase() === 'no-show')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const statePanel = document.createElement('section');
    statePanel.className = 'portrait-panel';
    statePanel.appendChild(createPortraitHeader(
      '2. Recall and No Show Tokens',
      'Search and manage previously handled tokens',
      kioskCustomerSettings.recallEnabled ? 'Recall on' : 'Recall off'
    ));

    const stateBody = document.createElement('div');
    stateBody.className = 'portrait-panel-body';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Search token, service, customer, or kiosk';
    searchInput.value = tokenFilterQuery;
    searchInput.addEventListener('input', () => {
      tokenFilterQuery = searchInput.value || '';
      renderTokens(orgId, counterId);
    });

    const searchLabel = document.createElement('span');
    searchLabel.className = 'search-pill';
    searchLabel.textContent = 'Live filter';
    searchWrap.appendChild(searchInput);
    searchWrap.appendChild(searchLabel);

    const stateGrid = document.createElement('div');
    stateGrid.className = 'state-grid';
    stateGrid.appendChild(createTokenStatePanel({
      title: 'Served Tokens',
      subtitle: kioskCustomerSettings.recallEnabled ? 'Recall one of these if the customer comes back.' : 'These are tokens that have already been served.',
      emptyText: 'No served tokens right now.',
      tokens: servedTokens,
      counterId,
      orgId,
      allowRecall: !!kioskCustomerSettings.recallEnabled,
      kind: 'served',
      query: tokenFilterQuery
    }));

    stateGrid.appendChild(createTokenStatePanel({
      title: 'No Show Tokens',
      subtitle: 'Tokens marked as no-show for this counter.',
      emptyText: 'No no-show tokens yet.',
      tokens: noShowTokens,
      counterId,
      orgId,
      // allow recall from no-show list as requested: enable when kiosk setting allows or always for no-show
      allowRecall: true,
      kind: 'noshow',
      query: tokenFilterQuery
    }));

    stateBody.appendChild(searchWrap);
    stateBody.appendChild(stateGrid);
    statePanel.appendChild(stateBody);
    // insert both panels as siblings into the workspace grid so they render side-by-side on wide screens
    if(workspaceGrid) workspaceGrid.replaceChildren(tokenPanel, statePanel);

    setStatus(`Showing live queue for ${counters[counterId]?.name || counterId}`);
  }catch(err){
    console.error(err);
    setStatus('Failed to render tokens: ' + err.message);
  }
}

function createPortraitHeader(title, subtitle, badgeText) {
  const header = document.createElement('div');
  header.className = 'portrait-panel-header';
  header.innerHTML = `<div><div class="portrait-panel-title">${title}</div><div class="portrait-panel-subtitle">${subtitle}</div></div><div class="status-chip">${badgeText}</div>`;
  return header;
}

function createTokenStatePanel({ title, subtitle, emptyText, tokens, counterId, orgId, allowRecall, kind, query }){
  const panel = document.createElement('section');
  panel.className = 'state-panel';

  const header = document.createElement('div');
  header.className = 'state-panel-header';
  const tokenCount = filterTokensByQuery(tokens, query).length;
  header.innerHTML = `<div><div class="state-panel-title">${title}</div><div class="state-panel-subtitle">${subtitle}</div></div><div class="status-chip">${tokenCount}</div>`;
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'state-panel-body';

  const filteredTokens = filterTokensByQuery(tokens, query);
  if(!filteredTokens.length){
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = tokens.length ? 'No tokens match your search.' : emptyText;
    body.appendChild(empty);
    panel.appendChild(body);
    return panel;
  }

  const list = document.createElement('div');
  list.className = 'token-list';

  filteredTokens.forEach(token => {
    const row = document.createElement('div');
    row.className = 'token-list-item';

    const info = document.createElement('div');
    const displayNumber = String(token.tokenNumber || token.id || '—');
    info.innerHTML = `
      <div class="token-list-title">${displayNumber} <span style="font-weight:700;color:var(--accent);font-size:0.95rem;margin-left:8px;">${escapeHtml(token.serviceName || token.serviceId)}</span></div>
      <div class="token-list-meta">
        <span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>${escapeHtml(token.kioskName || 'Live queue')}</span>
        <span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${escapeHtml(token.status || 'waiting')}</span>
        ${token.customerName ? `<span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${escapeHtml(token.customerName)}</span>` : ''}
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'token-list-actions';

    // allow recall when requested (for served tokens or no-show tokens per user request)
    if(allowRecall){
      const recallBtn = document.createElement('button');
      recallBtn.type = 'button';
      recallBtn.className = 'mini-btn mini-btn-primary';
      recallBtn.textContent = 'Recall';
      recallBtn.onclick = () => updateTokenStatus(orgId, token.serviceId, token.tokenId, 'arrived', counterId, (counters[counterId]||{}).name, token);
      actions.appendChild(recallBtn);
    }

    row.appendChild(info);
    row.appendChild(actions);
    list.appendChild(row);
  });

  body.appendChild(list);
  panel.appendChild(body);
  return panel;
}

function filterTokensByQuery(tokens, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return tokens;

  return tokens.filter(token => {
    const haystack = [
      token.tokenNumber,
      token.id,
      token.serviceName,
      token.serviceId,
      token.kioskName,
      token.customerName,
      token.customerPhone,
      token.status
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

async function updateTokenStatus(orgId, serviceId, tokenId, status, counterId=null, counterName=null, tokenRecord=null){
  try{
    const profileSnap = await db.ref(`users/${orgId}/profile`).once('value');
    const profile = profileSnap.val() || {};
    const organizationName = profile.name || profile.organizationName || profile.displayName || orgId;
    const selectedServices = Array.isArray(tokenRecord?.selectedServices) ? tokenRecord.selectedServices : [];
    const currentServiceIndex = Number(tokenRecord?.currentServiceIndex ?? tokenRecord?.serviceStageIndex ?? 0);
    const nextService = selectedServices[currentServiceIndex + 1] || null;
    const customerUid = String(tokenRecord?.customerUid || tokenRecord?.customerDetails?.uid || '').trim();

    const currentUpdates = {
      status,
      assignedCounterId: counterId || null,
      assignedCounterName: counterName || null,
      organizationName,
      currentServiceIndex,
      serviceStageIndex: currentServiceIndex
    };

    const currentUserUpdates = customerUid ? {
      status,
      assignedCounterId: counterId || null,
      assignedCounterName: counterName || null,
      counterId: counterId || null,
      counterName: counterName || null,
      organizationName,
      currentServiceIndex,
      serviceStageIndex: currentServiceIndex
    } : null;

    if (status === 'served' && nextService) {
      const nextStageIndex = currentServiceIndex + 1;
      const nextTokenData = {
        ...tokenRecord,
        serviceId: nextService.id,
        serviceName: nextService.name || nextService.id,
        currentServiceId: nextService.id,
        currentServiceName: nextService.name || nextService.id,
        currentServiceIndex: nextStageIndex,
        serviceStageIndex: nextStageIndex,
        assignedCounterId: null,
        assignedCounterName: null,
        counterId: null,
        counterName: null,
        status: 'waiting',
        organizationName
      };
      currentUpdates.status = 'served';

      await db.ref(`users/${orgId}/queue/${serviceId}/${tokenId}`).update(currentUpdates);
      await db.ref(`users/${orgId}/tokens/${tokenId}`).update(currentUpdates);

      if (customerUid) {
        await db.ref(`appuserTokens/${customerUid}/${orgId}/${tokenId}`).update(currentUserUpdates);
      }

      await db.ref(`users/${orgId}/queue/${nextService.id}/${tokenId}`).set(nextTokenData);
      if (customerUid) {
        await db.ref(`appuserTokens/${customerUid}/${orgId}/${tokenId}`).set(nextTokenData);
      }
    } else {
      await db.ref(`users/${orgId}/queue/${serviceId}/${tokenId}`).update(currentUpdates);
      await db.ref(`users/${orgId}/tokens/${tokenId}`).update(currentUpdates);
      if (customerUid) {
        await db.ref(`appuserTokens/${customerUid}/${orgId}/${tokenId}`).update(currentUserUpdates);
      }
    }
    setStatus(nextService && status === 'served'
      ? `Token ${tokenId} served and moved to ${nextService.name || nextService.id}`
      : `Token ${tokenId} updated to ${status}`);
    const nextCounterId = counterId || chosenCounter;
    if(nextCounterId){
      await renderTokens(orgId, nextCounterId);
    }
  }catch(err){
    console.error(err);
    setStatus('Failed to update token: ' + err.message);
  }
}

orgSelect.addEventListener('change', async ()=>{
  chosenOrg = orgSelect.value || null;
  if(!chosenOrg){ counterSelect.innerHTML = '<option value="">-- Select counter --</option>'; counterSelect.disabled = true; return; }
  await loadCounters(chosenOrg);
});

counterSelect.addEventListener('change', async ()=>{
  chosenCounter = counterSelect.value || null;
  if(!chosenCounter){
    tokensEl.innerHTML='';
    setSelectionVisibility(true);
    setStatus('No counter selected');
    return;
  }
  setSelectionVisibility(false);
  await listenForTokens(chosenOrg, chosenCounter);
});

refreshOrgsBtn.addEventListener('click', ()=> loadOrgs());

orgLogoutBtn.addEventListener('click', async ()=>{
  await auth.signOut();
});

// Show/hide sign-in modal helpers
function showSignInModal(){ if(signInModal){ signInModal.setAttribute('aria-hidden','false'); signInMsg.textContent=''; document.getElementById('sign-email').focus(); } }
function hideSignInModal(){ if(signInModal){ signInModal.setAttribute('aria-hidden','true'); } }

if(signInBtn){ signInBtn.addEventListener('click', ()=> showSignInModal()); }
if(signInCancel){ signInCancel.addEventListener('click', ()=> hideSignInModal()); }

if(signInForm){
  signInForm.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const email = document.getElementById('sign-email').value.trim();
    const password = document.getElementById('sign-password').value;
    if(!email || !password){ signInMsg.textContent = 'Please enter email and password.'; return; }
    signInMsg.textContent = 'Signing in...';
    try{
      await auth.signInWithEmailAndPassword(email, password);
      signInMsg.textContent = '';
      hideSignInModal();
    }catch(err){
      console.error('Sign-in failed', err);
      signInMsg.textContent = err.message || 'Sign-in failed';
    }
  });
}

async function isCustomerUser(user) {
  if (!user) return false;
  const appuserSnap = await db.ref(`appuser/${user.uid}`).once('value');
  if (appuserSnap.exists()) return true;
  
  const orgSnap = await db.ref(`users/${user.uid}`).once('value');
  const org = orgSnap.val();
  if (!org || !org.role) {
    return true; // No business profile or role means it is not an org account
  }
  return false;
}

auth.onAuthStateChanged(async user=>{
  if(!user){
    setStatus('Not signed in');
    setAuthUserLabel(null, null);
    orgLogoutBtn.style.display='none';
    if(signInBtn) signInBtn.style.display = 'inline-block';
    setSelectionVisibility(true);
    showOrgSelector();
    orgSelect.innerHTML = '<option value="">-- Sign in first --</option>'; orgSelect.disabled = true;
    counterSelect.innerHTML = '<option value="">-- Select counter --</option>'; counterSelect.disabled = true;
    refreshOrgsBtn.disabled = true;
    hideSignInModal();
    return;
  }

  try {
    const isCust = await isCustomerUser(user);
    if (isCust) {
      await auth.signOut();
      setStatus('Access denied');
      showSignInModal();
      signInMsg.textContent = 'Access denied. Customer accounts are not allowed here.';
      return;
    }
  } catch (err) {
    console.error('Error during customer validation', err);
  }

  orgLogoutBtn.style.display='inline-block';
  if(signInBtn) signInBtn.style.display = 'none';

  try{
    const profSnap = await db.ref(`users/${user.uid}`).once('value');
    const profile = profSnap.val();
    setAuthUserLabel(user, profile);
    if(profile && profile.role === 'approved'){
      orgSelect.innerHTML = '';
      const opt = document.createElement('option'); opt.value = user.uid; opt.textContent = (profile.organizationName||profile.name||profile.email||user.uid);
      orgSelect.appendChild(opt);
      orgSelect.disabled = true;
      chosenOrg = user.uid;
      await loadCounters(chosenOrg);
      setStatus('Organization loaded for account');
      // Hide the organization selector (organization is the signed-in user)
      // but keep the counter selector visible so operator can pick a counter.
      setSelectionVisibility(true);
      hideOrgSelectorKeepCounter();
      return;
    }
  }catch(err){ console.error(err); }

  setSelectionVisibility(true);
  await loadOrgs();
});

setAuthUserLabel(null, null);

// Cycle to the next counter option (skips empty placeholder options)
function cycleCounterSelectNext(){
  if(!counterSelect){ setStatus('No counter selector present'); return; }
  if(counterSelect.disabled){ setStatus('Counter selector is disabled'); return; }
  const options = Array.from(counterSelect.options).filter(o=>o && o.value);
  if(!options.length){ setStatus('No available counters to select'); return; }
  const currentValue = counterSelect.value || '';
  const idx = options.findIndex(o=>o.value === currentValue);
  const nextIdx = (idx < 0) ? 0 : ((idx + 1) % options.length);
  counterSelect.value = options[nextIdx].value;
  // trigger the change handler so the UI updates
  counterSelect.dispatchEvent(new Event('change', { bubbles:true }));
  setStatus(`Switched to counter: ${options[nextIdx].textContent}`);
}

// Keyboard shortcut: Ctrl+9 (or Cmd+9 on Mac) to cycle counters
document.addEventListener('keydown', (ev)=>{
  if((ev.ctrlKey || ev.metaKey) && (ev.key === '9' || ev.code === 'Digit9')){
    ev.preventDefault();
    try{ cycleCounterSelectNext(); }catch(e){ console.error(e); }
  }
});
