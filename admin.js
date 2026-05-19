if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();
const BOOTSTRAP_SUPERADMIN_UID = 'tcWCQtILJNcahfAQA3qakrUP9Nv1';
const BOOTSTRAP_SUPERADMIN_EMAIL = 'contact.pasan@gmail.com';

function $(sel){ return document.querySelector(sel); }
function showMessage(msg, type){
  let wrap = $('#toast-wrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = msg;
  wrap.appendChild(toast);

  setTimeout(()=>{
    toast.classList.add('hide');
    setTimeout(()=>toast.remove(), 250);
  }, 2800);
}
function formatDate(ts){
  if(!ts) return 'Unknown date';
  try { return new Date(ts).toLocaleString(); }
  catch(_) { return String(ts); }
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"]/g, (c)=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;'
  }[c]));
}

function generateKioskId(){
  return 'KIOSK_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function hashPin(pin){
  return 'hash_' + String(pin).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

async function loadOrganizationsForKiosk(){
  const select = $('#org-select');
  if(!select) return;
  select.innerHTML = '';

  try{
    const snap = await db.ref('users').once('value');
    const users = snap.val() || {};
    const entries = Object.entries(users);

    if(entries.length === 0){
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No organizations found';
      select.appendChild(opt);
      return;
    }

    // Put approved first, then pending/rejected.
    entries.sort(([uidA, a], [uidB, b]) => {
      const roleA = (a && a.role) || '';
      const roleB = (b && b.role) || '';
      const score = (r)=> (r === 'approved' ? 0 : r === 'pending' ? 1 : 2);
      const sA = score(roleA), sB = score(roleB);
      if(sA !== sB) return sA - sB;
      return String(uidA).localeCompare(String(uidB));
    });

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select organization...';
    select.appendChild(placeholder);

    for(const [uid, profile] of entries){
      const opt = document.createElement('option');
      opt.value = uid;
      const email = (profile && profile.email) ? profile.email : 'no-email';
      const role = (profile && profile.role) ? profile.role : 'unknown';
      opt.textContent = `${email} (${role}) — ${uid}`;
      select.appendChild(opt);
    }
  }catch(err){
    showMessage('Failed to load org list: ' + err.message, 'error');
  }
}

async function addKioskToOrganization(){
  const orgId = $('#org-select')?.value;
  const name = ($('#admin-kiosk-name')?.value || '').trim();
  const pin = ($('#admin-kiosk-pin')?.value || '').trim();
  const result = $('#admin-kiosk-result');
  if(result) result.textContent = '';

  if(!orgId){
    showMessage('Please select an organization', 'error');
    return;
  }
  if(!name){
    showMessage('KIOSK name is required', 'error');
    return;
  }
  if(!/^[0-9]{4,6}$/.test(pin)){
    showMessage('PIN must be 4-6 digits', 'error');
    return;
  }

  try{
    const kioskId = generateKioskId();
    const kioskUserId = `kiosk_${kioskId}`;
    const pinHash = await hashPin(pin);

    const kioskData = {
      id: kioskId,
      name,
      status: 'active',
      organizationId: orgId,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: auth.currentUser?.uid || 'system',
      tokensGenerated: 0,
      lastActivityAt: firebase.database.ServerValue.TIMESTAMP
    };

    const kioskUserData = {
      id: kioskUserId,
      kioskId,
      organizationId: orgId,
      pinHash,
      role: 'kiosk',
      status: 'active',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      lastLoginAt: null
    };

    const updates = {};
    updates[`users/${orgId}/kiosks/${kioskId}`] = kioskData;
    updates[`kioskUsers/${kioskUserId}`] = kioskUserData;
    await db.ref().update(updates);

    $('#admin-kiosk-name').value = '';
    $('#admin-kiosk-pin').value = '';

    showMessage('KIOSK added to organization', 'success');
    if(result){
      result.innerHTML = `Created: <strong>${escapeHtml(kioskData.name)}</strong> | KIOSK ID: <strong>${escapeHtml(kioskId)}</strong> | KIOSK User: <strong>${escapeHtml(kioskUserId)}</strong>`;
    }
  }catch(err){
    showMessage('Failed to add KIOSK: ' + err.message, 'error');
  }
}

async function requireSuperAdmin(user){
  if(!user){
    window.location.href = 'index.html';
    return false;
  }
  if(user.uid === BOOTSTRAP_SUPERADMIN_UID) return true;
  if((user.email || '').toLowerCase() === BOOTSTRAP_SUPERADMIN_EMAIL) return true;
  const token = await user.getIdTokenResult(true);
  const allowed = !!(token.claims && token.claims.superadmin === true);
  if(!allowed){
    showMessage('Access denied. Superadmin only.', 'error');
    await auth.signOut();
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

async function setRole(uid, role){
  try{
    await db.ref('users/' + uid + '/role').set(role);
    showMessage('Role updated to ' + role + ' for ' + uid, 'success');
    await Promise.all([loadPendingUsers(), loadAllUsers()]);
  }catch(err){
    showMessage(err.message, 'error');
  }
}

async function removeUserProfile(uid){
  if(!window.confirm('Remove account profile for ' + uid + '?')) return;
  try{
    await db.ref('users/' + uid).remove();
    showMessage('Removed account profile for ' + uid, 'success');
    await Promise.all([loadPendingUsers(), loadAllUsers()]);
  }catch(err){
    showMessage(err.message, 'error');
  }
}

function renderUserCard(uid, profile, opts){
  const item = document.createElement('div');
  item.className = 'pending-item';

  const left = document.createElement('div');
  const email = profile.email || 'no-email@unknown';
  left.innerHTML = '<div><strong>' + email + '</strong></div>' +
    '<div class="pending-meta">UID: ' + uid + '</div>' +
    '<div class="pending-meta">Role: ' + (profile.role || 'unknown') + ' | Created: ' + formatDate(profile.createdAt) + '</div>';

  const actions = document.createElement('div');
  actions.className = 'pending-actions';

  if(opts.showApprove){
    const approveBtn = document.createElement('button');
    approveBtn.className = 'approve-btn';
    approveBtn.type = 'button';
    approveBtn.textContent = 'Approve';
    approveBtn.addEventListener('click', ()=>setRole(uid, 'approved'));
    actions.appendChild(approveBtn);
  }

  if(opts.showReject){
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'reject-btn';
    rejectBtn.type = 'button';
    rejectBtn.textContent = 'Reject';
    rejectBtn.addEventListener('click', ()=>setRole(uid, 'rejected'));
    actions.appendChild(rejectBtn);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'reject-btn';
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', ()=>removeUserProfile(uid));
  actions.appendChild(removeBtn);

  item.appendChild(left);
  item.appendChild(actions);
  return item;
}

async function loadPendingUsers(){
  const list = $('#pending-list');
  if(!list) return;
  list.innerHTML = '<p class="muted small">Loading...</p>';
  try{
    const snap = await db.ref('users').orderByChild('role').equalTo('pending').once('value');
    const data = snap.val() || {};
    const entries = Object.entries(data);
    if(entries.length === 0){
      list.innerHTML = '<p class="muted small">No pending users.</p>';
      return;
    }
    list.innerHTML = '';
    entries.forEach(([uid, profile])=>{
      list.appendChild(renderUserCard(uid, profile, { showApprove: true, showReject: true }));
    });
  }catch(err){
    list.innerHTML = '<p class="muted small">Failed to load pending users.</p>';
    showMessage(err.message, 'error');
  }
}

async function loadAllUsers(){
  const list = $('#all-users-list');
  if(!list) return;
  list.innerHTML = '<p class="muted small">Loading...</p>';
  try{
    const snap = await db.ref('users').once('value');
    const data = snap.val() || {};
    const entries = Object.entries(data);
    if(entries.length === 0){
      list.innerHTML = '<p class="muted small">No users found.</p>';
      return;
    }
    list.innerHTML = '';
    entries.forEach(([uid, profile])=>{
      list.appendChild(renderUserCard(uid, profile, { showApprove: false, showReject: false }));
    });
  }catch(err){
    list.innerHTML = '<p class="muted small">Failed to load users.</p>';
    showMessage(err.message, 'error');
  }
}

$('#refresh-pending').addEventListener('click', ()=>loadPendingUsers());
$('#refresh-all').addEventListener('click', async ()=>{
  await loadAllUsers();
  await loadOrganizationsForKiosk();
});
$('#kiosk-mgmt').addEventListener('click', ()=>{ window.location.href = 'kiosk-management.html'; });
$('#kiosk-terminal').addEventListener('click', ()=>{ window.location.href = 'kiosk-login.html'; });
$('#go-app').addEventListener('click', ()=>{ window.location.href = 'index.html'; });
$('#signout').addEventListener('click', async ()=>{
  await auth.signOut();
  window.location.href = 'index.html';
});

$('#admin-add-kiosk')?.addEventListener('click', ()=>addKioskToOrganization());
$('#admin-refresh-orgs')?.addEventListener('click', ()=>loadOrganizationsForKiosk());

auth.onAuthStateChanged(async (user)=>{
  const allowed = await requireSuperAdmin(user);
  if(!allowed) return;
  await Promise.all([loadPendingUsers(), loadAllUsers(), loadOrganizationsForKiosk()]);
});
