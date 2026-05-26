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

const ACTIVE_TOKEN_STATUSES = new Set(['waiting', 'arrived']);

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
  if(!authUserEl) return;
  if(!user){
    authUserEl.textContent = 'Not signed in';
    return;
  }
  authUserEl.textContent = profile?.organizationName || profile?.name || user.email || user.uid;
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
    orgs = Object.fromEntries(Object.entries(all).filter(([uid, p]) => (p && p.role === 'approved')));

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
    if(currentRunId !== renderRunId) return;
    const queueSnap = await db.ref(`users/${orgId}/queue`).once('value');
    const queue = queueSnap.val() || {};
    if(currentRunId !== renderRunId) return;

    const tokensById = new Map();
    Object.entries(queue).forEach(([serviceId, serviceTokens])=>{
      Object.entries(serviceTokens || {}).forEach(([tokenId, t])=>{
        const assigned = t.assignedCounterId === counterId;
        const existing = tokensById.get(tokenId);
        const candidate = { serviceId, tokenId, ...t, assigned };
        if(!existing || (candidate.timestamp || 0) < (existing.timestamp || 0)){
          tokensById.set(tokenId, candidate);
        }
      });
    });

    const assignSnap = await db.ref(`users/${orgId}/assignments/${counterId}`).once('value');
    const assignment = assignSnap.val() || { services: [] };
    const serviceIds = Array.isArray(assignment.services) ? assignment.services : Object.values(assignment.services || {});
    const visible = Array.from(tokensById.values())
      .filter(t => (t.assigned || serviceIds.includes(t.serviceId)))
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

      const stage = document.createElement('div');
      stage.className = 'token-stage';

      const numberEl = document.createElement('div');
      numberEl.className = 'token-number';
      numberEl.textContent = String(activeToken.tokenNumber || activeToken.id || '—');

      const metaEl = document.createElement('div');
      metaEl.className = 'token-meta';

      const servicePill = document.createElement('span');
      servicePill.className = 'meta-pill';
      servicePill.innerHTML = `<strong>${escapeHtml(activeToken.serviceName || activeToken.serviceId)}</strong>`;
      metaEl.appendChild(servicePill);

      const kioskPill = document.createElement('span');
      kioskPill.className = 'meta-pill';
      kioskPill.textContent = activeToken.kioskName || 'Live queue';
      metaEl.appendChild(kioskPill);

      const statusPill = document.createElement('span');
      statusPill.className = 'meta-pill';
      statusPill.textContent = `Status: ${activeToken.status || 'waiting'}`;
      metaEl.appendChild(statusPill);

      if((kioskCustomerSettings && kioskCustomerSettings.enabled && kioskCustomerSettings.requireName) || activeToken.customerName){
        const customerPill = document.createElement('span');
        customerPill.className = 'customer-name';
        customerPill.innerHTML = `<small>Customer</small><span>${escapeHtml(activeToken.customerName || 'Not provided')}</span>`;
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
      serveBtn.onclick = ()=> updateTokenStatus(orgId, activeToken.serviceId, activeToken.tokenId, 'serving', counterId, (counters[counterId]||{}).name);

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

    const calledTokens = Array.from(tokensById.values())
      .filter(t => (t.assigned || serviceIds.includes(t.serviceId)))
      .filter(t => (t.status || 'waiting').toLowerCase() === 'serving')
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
      title: 'Already Called Tokens',
      subtitle: kioskCustomerSettings.recallEnabled ? 'Recall one of these if the customer comes back.' : 'These are tokens that have already been called.',
      emptyText: 'No called tokens right now.',
      tokens: calledTokens,
      counterId,
      orgId,
      allowRecall: !!kioskCustomerSettings.recallEnabled,
      kind: 'called',
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
      <div class="token-list-title">${displayNumber} <span style="font-weight:700;color:#5d6e82">${escapeHtml(token.serviceName || token.serviceId)}</span></div>
      <div class="token-list-meta">
        <span>${escapeHtml(token.kioskName || 'Live queue')}</span>
        <span>Status: ${escapeHtml(token.status || 'waiting')}</span>
        ${token.customerName ? `<span>Customer: ${escapeHtml(token.customerName)}</span>` : ''}
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'token-list-actions';

    // allow recall when requested (for called tokens or no-show tokens per user request)
    if(allowRecall){
      const recallBtn = document.createElement('button');
      recallBtn.type = 'button';
      recallBtn.className = 'mini-btn mini-btn-primary';
      recallBtn.textContent = 'Recall';
      recallBtn.onclick = () => updateTokenStatus(orgId, token.serviceId, token.tokenId, 'arrived', counterId, (counters[counterId]||{}).name);
      actions.appendChild(recallBtn);
    }

    // keep the "Still Serving" action for called tokens
    if(kind === 'called'){
      const doneBtn = document.createElement('button');
      doneBtn.type = 'button';
      doneBtn.className = 'mini-btn mini-btn-ghost';
      doneBtn.textContent = 'Still Serving';
      doneBtn.onclick = () => updateTokenStatus(orgId, token.serviceId, token.tokenId, 'serving', counterId, (counters[counterId]||{}).name);
      actions.appendChild(doneBtn);
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

async function updateTokenStatus(orgId, serviceId, tokenId, status, counterId=null, counterName=null){
  try{
    const updates = {};
    updates[`users/${orgId}/queue/${serviceId}/${tokenId}/status`] = status;
    updates[`users/${orgId}/queue/${serviceId}/${tokenId}/assignedCounterId`] = counterId || null;
    updates[`users/${orgId}/queue/${serviceId}/${tokenId}/assignedCounterName`] = counterName || null;

    updates[`users/${orgId}/tokens/${tokenId}/status`] = status;
    updates[`users/${orgId}/tokens/${tokenId}/counterId`] = counterId || null;
    updates[`users/${orgId}/tokens/${tokenId}/counterName`] = counterName || null;

    await db.ref().update(updates);
    setStatus(`Token ${tokenId} updated to ${status}`);
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
