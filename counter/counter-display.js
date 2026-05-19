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

let orgs = {};
let counters = {};
let activeListeners = [];
let chosenOrg = null;
let chosenCounter = null;
let renderRunId = 0;

const ACTIVE_TOKEN_STATUSES = new Set(['waiting', 'arrived']);

function setStatus(txt){ if(statusEl) statusEl.textContent = txt; }

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
  }catch(err){
    console.error(err);
    setStatus('Failed to load counters: ' + err.message);
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

    if(!activeToken){
      tokensEl.innerHTML = '<div class="token-empty">No ongoing token for this counter.</div>';
      setStatus('No ongoing token for the selected counter');
      return;
    }

    const item = document.createElement('div');
    item.className = 'token';

    const stage = document.createElement('div');
    stage.className = 'token-stage';

    const numberEl = document.createElement('div');
    numberEl.className = 'token-number';
    numberEl.textContent = String(activeToken.tokenNumber || activeToken.id || '—');

    const metaEl = document.createElement('div');
    metaEl.className = 'token-meta';
    metaEl.innerHTML = `<strong style="font-size:1.05rem">${activeToken.serviceName || activeToken.serviceId}</strong><div style="font-size:0.95rem;color:#475569">${activeToken.kioskName || ''}</div><div style="font-size:0.9rem;color:#6b7280">Status: ${activeToken.status || 'waiting'}</div>`;

    stage.appendChild(numberEl);
    stage.appendChild(metaEl);

    const right = document.createElement('div'); right.className='actions';
    right.setAttribute('aria-label', 'token actions');

    const serveBtn = document.createElement('button'); serveBtn.className='btn-serve'; serveBtn.textContent='Call Next';
    serveBtn.onclick = ()=> updateTokenStatus(orgId, activeToken.serviceId, activeToken.tokenId, 'serving', counterId, (counters[counterId]||{}).name);

    const noshowBtn = document.createElement('button'); noshowBtn.className='btn-noshow'; noshowBtn.textContent='No show';
    noshowBtn.onclick = ()=> updateTokenStatus(orgId, activeToken.serviceId, activeToken.tokenId, 'no-show', null, null);

    right.appendChild(serveBtn);
    right.appendChild(noshowBtn);

    item.appendChild(stage); item.appendChild(right);
    tokensEl.appendChild(item);

    setStatus(`Showing 1 ongoing token for ${counters[counterId]?.name || counterId}`);
  }catch(err){
    console.error(err);
    setStatus('Failed to render tokens: ' + err.message);
  }
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

auth.onAuthStateChanged(async user=>{
  if(!user){
    setStatus('Not signed in');
    setAuthUserLabel(null, null);
    orgLogoutBtn.style.display='none';
    setSelectionVisibility(true);
    showOrgSelector();
    orgSelect.innerHTML = '<option value="">-- Sign in first --</option>'; orgSelect.disabled = true;
    counterSelect.innerHTML = '<option value="">-- Select counter --</option>'; counterSelect.disabled = true;
    refreshOrgsBtn.disabled = true;
    return;
  }

  orgLogoutBtn.style.display='inline-block';

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
