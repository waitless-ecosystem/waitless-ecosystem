// Initialize Firebase once, even if another page script already did it.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

// Helpers
function $(sel){ return document.querySelector(sel); }
function showSection(id){
  document.querySelectorAll('.panel').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  const panel = document.querySelector(id);
  if(panel) panel.classList.add('active');
  // activate tab with matching aria-labelledby or id mapping
  const tabMap = {
    '#login-section':'#show-login',
    '#register-section':'#show-register',
    '#reset-section':'#show-reset',
    '#profile-section':'#show-login'
  };
  const tabSel = tabMap[id];
  if(tabSel){ const t = document.querySelector(tabSel); if(t) t.classList.add('active'); }
}
function showMessage(msg, type='info'){ const el = $('#message'); el.textContent = msg; el.className = 'message ' + type; setTimeout(()=>{ el.textContent=''; el.className='message'; }, 6000); }
function generateSalt(){ const a = new Uint8Array(16); window.crypto.getRandomValues(a); return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function isSuperAdmin(user, profile = {}){
  return waitlessIsSuperadmin(user, profile);
}
function formatDate(ts){
  if(!ts) return 'Unknown date';
  try { return new Date(ts).toLocaleString(); }
  catch(_) { return String(ts); }
}

// Wire tab buttons (existing ids used as tabs)
['#show-login','#show-register','#show-reset'].forEach(id=>{
  const btn = document.querySelector(id);
  if(btn) btn.addEventListener('click', e=>{ e.preventDefault(); showSection('#' + id.replace('#show-','') + '-section'); });
});

// Extra internal links
const showRegisterLink = $('#show-register-link'); if(showRegisterLink) showRegisterLink.addEventListener('click', e=>{ e.preventDefault(); document.querySelector('#show-register').click(); });
const showLoginLink = $('#show-login-link'); if(showLoginLink) showLoginLink.addEventListener('click', e=>{ e.preventDefault(); document.querySelector('#show-login').click(); });
const backToLoginLink = $('#back-to-login'); if(backToLoginLink) backToLoginLink.addEventListener('click', e=>{ e.preventDefault(); document.querySelector('#show-login').click(); });

// Password toggle buttons
document.querySelectorAll('.pwd-toggle').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const target = document.querySelector(btn.dataset.target);
    if(!target) return;
    if(target.type === 'password'){ target.type = 'text'; btn.textContent = '🙈'; }
    else { target.type = 'password'; btn.textContent = '👁️'; }
  });
});

async function loadPendingUsers(){
  const listEl = $('#pending-list');
  if(!listEl) return;
  listEl.innerHTML = '<p class="muted small">Loading...</p>';
  try{
    const snap = await db.ref('users').orderByChild('role').equalTo('pending').once('value');
    const data = snap.val() || {};
    const entries = Object.entries(data);
    if(entries.length === 0){
      listEl.innerHTML = '<p class="muted small">No pending users.</p>';
      return;
    }

    listEl.innerHTML = '';
    entries.forEach(([uid, profile])=>{
      const item = document.createElement('div');
      item.className = 'pending-item';

      const left = document.createElement('div');
      const email = profile.email || 'no-email@unknown';
      left.innerHTML = `<div><strong>${email}</strong></div><div class="pending-meta">UID: ${uid}</div><div class="pending-meta">Created: ${formatDate(profile.createdAt)} | Role: ${profile.role}</div>`;

      const actions = document.createElement('div');
      actions.className = 'pending-actions';

      const approveBtn = document.createElement('button');
      approveBtn.className = 'approve-btn';
      approveBtn.type = 'button';
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', ()=>updateUserRole(uid, 'approved'));

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'reject-btn';
      rejectBtn.type = 'button';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', ()=>updateUserRole(uid, 'rejected'));

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      item.appendChild(left);
      item.appendChild(actions);
      listEl.appendChild(item);
    });
  }catch(err){
    listEl.innerHTML = '<p class="muted small">Failed to load pending users.</p>';
    showMessage(err.message, 'error');
  }
}

async function updateUserRole(uid, role){
  try{
    await db.ref('users/' + uid + '/role').set(role);
    showMessage('Updated role for ' + uid + ' to ' + role, 'success');
    await loadPendingUsers();
  }catch(err){
    showMessage(err.message, 'error');
  }
}

const refreshBtn = $('#refresh-pending');
if(refreshBtn){
  refreshBtn.addEventListener('click', ()=>{ loadPendingUsers(); });
}

// Register
$('#register-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const email = $('#register-email').value.trim();
  const password = $('#register-password').value;
  try{
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCred.user.uid;
    const salt = generateSalt();
    const updates = {};
    updates['users/' + uid + '/email'] = email;
    updates['users/' + uid + '/role'] = 'pending';
    updates['users/' + uid + '/createdAt'] = firebase.database.ServerValue.TIMESTAMP;
    updates['users/' + uid + '/cryptoSalt'] = salt;
    await db.ref().update(updates);
    showMessage('Registration successful. Awaiting approval (role: pending).', 'success');
    showSection('#profile-section');
    renderProfile(userCred.user);
  }catch(err){ showMessage(err.message, 'error'); }
});

// Login
$('#login-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  try{
    const userCred = await auth.signInWithEmailAndPassword(email, password);
    const snap = await db.ref('users/' + userCred.user.uid).once('value');
    const profile = snap.val() || {};
    const superAdmin = await isSuperAdmin(userCred.user, profile);
    if(superAdmin){
      window.location.href = 'pages/admin.html';
      return;
    }
    if(profile.role === 'approved'){
      window.location.href = 'pages/dashboard.html';
      return;
    }
    showMessage('Logged in', 'success');
    showSection('#profile-section');
    renderProfile(userCred.user);
  }catch(err){ showMessage(err.message, 'error'); }
});

// Reset
$('#reset-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const email = $('#reset-email').value.trim();
  try{
    await auth.sendPasswordResetEmail(email);
    showMessage('Password reset email sent.', 'success');
    document.querySelector('#show-login').click();
  }catch(err){ showMessage(err.message, 'error'); }
});

// Sign out
$('#signout').addEventListener('click', async ()=>{
  await auth.signOut();
  showMessage('Signed out', 'info');
  document.querySelector('#show-login').click();
});

// Render profile
async function renderProfile(user){
  const info = $('#profile-info');
  if(!user) { info.innerHTML='Not signed in'; return; }
  info.innerHTML = `<p><strong>UID:</strong> ${user.uid}</p><p><strong>Email:</strong> ${user.email}</p>`;

  const adminPanel = $('#admin-panel');
  if(!adminPanel) return;
  const snap = await db.ref('users/' + user.uid).once('value');
  const superAdmin = await isSuperAdmin(user, snap.val() || {});
  if(superAdmin){
    adminPanel.classList.remove('hidden');
    await loadPendingUsers();
  }else{
    adminPanel.classList.add('hidden');
  }
}

// Monitor auth state
auth.onAuthStateChanged(async user=>{
  if(user){
    const snap = await db.ref('users/' + user.uid).once('value');
    const profile = snap.val() || {};
    const superAdmin = await isSuperAdmin(user, profile);
    if(superAdmin){
      window.location.href = 'pages/admin.html';
      return;
    }
    if(profile.role === 'approved'){
      window.location.href = 'pages/dashboard.html';
      return;
    }
    await renderProfile(user);
    showSection('#profile-section');
  }
  else {
    const adminPanel = $('#admin-panel');
    if(adminPanel) adminPanel.classList.add('hidden');
    await renderProfile(null);
    showSection('#register-section');
  }
});
