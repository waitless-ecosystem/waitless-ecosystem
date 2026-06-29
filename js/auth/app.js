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
function showMessage(msg, type = 'info') {
  const el = $('#message');
  if (!el) return;
  if (!msg) {
    el.innerHTML = '';
    return;
  }

  // Custom Firebase error translations
  let friendlyMsg = msg;
  if (type === 'error') {
    if (msg.includes('auth/wrong-password') || msg.includes('Incorrect password')) {
      friendlyMsg = 'Incorrect password. Please verify and try again.';
    } else if (msg.includes('auth/user-not-found') || msg.includes('No account exists')) {
      friendlyMsg = 'No account exists with this email address.';
    } else if (msg.includes('auth/invalid-email')) {
      friendlyMsg = 'Please enter a valid email address.';
    } else if (msg.includes('auth/email-already-in-use')) {
      friendlyMsg = 'This email is already registered to a business.';
    } else if (msg.includes('auth/weak-password')) {
      friendlyMsg = 'Password must be at least 6 characters long.';
    } else if (msg.includes('auth/too-many-requests')) {
      friendlyMsg = 'Too many failed login attempts. Please try again in a few minutes.';
    } else if (msg.includes('Access denied')) {
      friendlyMsg = msg; // Custom access denied messages
    }
  }

  // Icons based on alert type
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = `<svg class="wl-alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg class="wl-alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    iconSvg = `<svg class="wl-alert-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="8"></line></svg>`;
  }

  el.innerHTML = `
    <div class="wl-alert wl-alert-${type}">
      <span class="wl-alert-icon-wrap">${iconSvg}</span>
      <span class="wl-alert-text">${escapeHtml(friendlyMsg)}</span>
      <button class="wl-alert-close" type="button" aria-label="Close message" onclick="this.parentElement.remove()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  `;
}

function clearInputError(input) {
  if (!input) return;
  input.classList.remove('invalid');
  const errorSpan = input.parentElement.querySelector('.field-error');
  if (errorSpan) errorSpan.remove();
}

function showInputError(input, msg) {
  if (!input) return;
  input.classList.add('invalid');
  let errorSpan = input.parentElement.querySelector('.field-error');
  if (!errorSpan) {
    errorSpan = document.createElement('span');
    errorSpan.className = 'field-error';
    input.parentElement.appendChild(errorSpan);
  }
  errorSpan.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    <span>${msg}</span>
  `;
}

// Automatically bind input clear on type
document.querySelectorAll('input').forEach(input => {
  input.addEventListener('input', () => {
    clearInputError(input);
  });
});
function generateSalt(){ const a = new Uint8Array(16); window.crypto.getRandomValues(a); return Array.from(a).map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function isSuperAdmin(user, profile = {}){
  return waitlessIsSuperadmin(user, profile);
}
function formatDate(ts){
  if(!ts) return 'Unknown date';
  try { return new Date(ts).toLocaleString(); }
  catch(_) { return String(ts); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
  }[ch]));
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
  const emailInput = $('#register-email');
  const orgInput = $('#register-organization');
  const contactInput = $('#register-contact');
  const addressInput = $('#register-address');
  const passwordInput = $('#register-password');

  const email = emailInput.value.trim();
  const organizationName = orgInput.value.trim();
  const contactNumber = contactInput.value.trim();
  const address = addressInput.value.trim();
  const password = passwordInput.value;

  let hasError = false;
  if (!email) { showInputError(emailInput, 'Email is required'); hasError = true; }
  if (!organizationName) { showInputError(orgInput, 'Organization name is required'); hasError = true; }
  if (!contactNumber) { showInputError(contactInput, 'Contact number is required'); hasError = true; }
  if (!address) { showInputError(addressInput, 'Address is required'); hasError = true; }
  if (!password) { showInputError(passwordInput, 'Password is required'); hasError = true; }
  else if (password.length < 6) { showInputError(passwordInput, 'Password must be at least 6 characters'); hasError = true; }

  if (hasError) {
    showMessage('Please correct the highlighted errors.', 'error');
    return;
  }

  try{
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = userCred.user.uid;
    const salt = generateSalt();
    const now = firebase.database.ServerValue.TIMESTAMP;
    const profileData = {
      email,
      name: organizationName,
      contactNumber,
      address,
      updatedAt: now
    };
    const updates = {};
    updates['users/' + uid + '/email'] = email;
    updates['users/' + uid + '/role'] = 'pending';
    updates['users/' + uid + '/createdAt'] = now;
    updates['users/' + uid + '/cryptoSalt'] = salt;
    updates['users/' + uid + '/name'] = organizationName;
    updates['users/' + uid + '/displayName'] = organizationName;
    updates['users/' + uid + '/organizationName'] = organizationName;
    updates['users/' + uid + '/updatedAt'] = now;
    updates['users/' + uid + '/profile'] = profileData;
    await db.ref().update(updates);
    showMessage('Registration successful. Awaiting approval (role: pending).', 'success');
    showSection('#profile-section');
    renderProfile(userCred.user);
  }catch(err){ showMessage(err.message, 'error'); }
});

// Login
$('#login-form').addEventListener('submit', async e=>{
  e.preventDefault();
  const emailInput = $('#login-email');
  const passwordInput = $('#login-password');

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  let hasError = false;
  if (!email) { showInputError(emailInput, 'Email is required'); hasError = true; }
  if (!password) { showInputError(passwordInput, 'Password is required'); hasError = true; }

  if (hasError) {
    showMessage('Please fill in your email and password.', 'error');
    return;
  }

  try{
    const userCred = await auth.signInWithEmailAndPassword(email, password);
    const snap = await db.ref('users/' + userCred.user.uid).once('value');
    const profile = snap.val() || {};
    
    // Block customer account
    const appuserSnap = await db.ref('appuser/' + userCred.user.uid).once('value');
    if (appuserSnap.exists() || !profile.role) {
      await auth.signOut();
      showMessage('Access denied. Customer accounts cannot access the business portal.', 'error');
      return;
    }

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
  const emailInput = $('#reset-email');
  const email = emailInput.value.trim();

  if (!email) {
    showInputError(emailInput, 'Email is required');
    showMessage('Please enter your email address.', 'error');
    return;
  }

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

  const adminPanel = $('#admin-panel');
  if(!adminPanel) return;
  const snap = await db.ref('users/' + user.uid).once('value');
  const profile = snap.val() || {};
  const profileData = profile.profile || {};
  const superAdmin = await isSuperAdmin(user, profile);

  info.innerHTML = `
    <p><strong>Organization:</strong> ${escapeHtml(profileData.name || profile.name || profile.organizationName || user.email || 'N/A')}</p>
    <p><strong>Email:</strong> ${escapeHtml(profile.email || user.email || 'N/A')}</p>
    <p><strong>Contact Number:</strong> ${escapeHtml(profileData.contactNumber || 'N/A')}</p>
    <p><strong>Address:</strong> ${escapeHtml(profileData.address || 'N/A')}</p>
    <p><strong>UID:</strong> ${escapeHtml(user.uid)}</p>
    <p><strong>Role:</strong> ${escapeHtml(profile.role || 'pending')}</p>
    <p><strong>Created At:</strong> ${escapeHtml(formatDate(profile.createdAt || user.metadata.creationTime))}</p>
  `;
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
    
    // Block customer account
    const appuserSnap = await db.ref('appuser/' + user.uid).once('value');
    if (appuserSnap.exists() || !profile.role) {
      await auth.signOut();
      showMessage('Access denied. Customer accounts cannot access the business portal.', 'error');
      return;
    }

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
