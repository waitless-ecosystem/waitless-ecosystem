// Initialize Firebase once, even if another page script already did it.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();
const waitlessRoutes = window.WAITLESS_ROUTES || {
  admin: 'admin/dashboard.html',
  business: 'business/dashboard.html',
  pending: 'auth/pending-approval.html'
};
const requestedView = new URLSearchParams(window.location.search).get('view');
const initialAuthSection = {
  login: '#login-section',
  register: '#register-section',
  reset: '#reset-section'
}[requestedView] || '#register-section';

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

const organizationTypeSelect = $('#register-organization-type');
const organizationTypeOtherWrap = $('#register-organization-type-other-wrap');
const organizationTypeOtherInput = $('#register-organization-type-other');
function updateOrganizationTypeOtherVisibility(){
  const isOther = organizationTypeSelect && organizationTypeSelect.value === 'Other';
  if(organizationTypeOtherWrap) organizationTypeOtherWrap.classList.toggle('hidden', !isOther);
  if(organizationTypeOtherInput) {
    organizationTypeOtherInput.required = !!isOther;
    if(!isOther) organizationTypeOtherInput.value = '';
  }
}
if(organizationTypeSelect) {
  organizationTypeSelect.addEventListener('change', updateOrganizationTypeOtherVisibility);
  updateOrganizationTypeOtherVisibility();
}

function getRadioValue(name) {
  const selected = document.querySelector(`input[name="${name}"]:checked`);
  return selected ? selected.value : '';
}

function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
}

function togglePanel(panel, show) {
  if(panel) panel.classList.toggle('hidden', !show);
}

function createScheduledServiceRow() {
  const row = document.createElement('div');
  row.className = 'scheduled-service-row';
  row.innerHTML = `
    <input type="text" data-scheduled-field="serviceName" placeholder="Service name" />
    <input type="text" data-scheduled-field="availableDays" placeholder="Available days" />
    <input type="time" data-scheduled-field="startTime" aria-label="Start time" />
    <input type="time" data-scheduled-field="endTime" aria-label="End time" />
    <button type="button" class="secondary compact remove-row">Remove</button>
  `;
  row.querySelector('.remove-row').addEventListener('click', () => row.remove());
  return row;
}

function collectScheduledServices() {
  if(getRadioValue('service-availability') !== 'scheduled') return [];
  return Array.from(document.querySelectorAll('#scheduled-services-list .scheduled-service-row')).map(row => {
    const item = {};
    row.querySelectorAll('[data-scheduled-field]').forEach(input => {
      item[input.dataset.scheduledField] = input.value.trim();
    });
    return item;
  }).filter(item => item.serviceName || item.availableDays || item.startTime || item.endTime);
}

function collectCategoryNames() {
  if(getRadioValue('service-categories') !== 'yes') return [];
  return Array.from(document.querySelectorAll('[data-category-name]'))
    .map(input => input.value.trim())
    .filter(Boolean);
}

function collectBusinessPreferences() {
  const bookingSlotLength = $('#booking-slot-length') ? $('#booking-slot-length').value : '';
  const customBookingSlotLength = $('#booking-slot-custom') ? $('#booking-slot-custom').value.trim() : '';
  const onlineBooking = getRadioValue('online-booking');
  return {
    serviceAvailability: getRadioValue('service-availability'),
    scheduledServices: collectScheduledServices(),
    customerInformation: {
      collectBeforeToken: getRadioValue('customer-info-needed') === 'yes',
      fields: getCheckedValues('customer-info-fields'),
      requiredFields: getCheckedValues('customer-info-required')
    },
    tokenRecall: getRadioValue('token-recall') === 'yes',
    serviceCategories: {
      enabled: getRadioValue('service-categories') === 'yes',
      categoryNames: collectCategoryNames()
    },
    mobileQrAccess: getRadioValue('mobile-qr-access') === 'yes',
    onlineBooking: {
      preference: onlineBooking,
      enabled: onlineBooking === 'yes',
      slotLengthMinutes: onlineBooking === 'yes' && bookingSlotLength === 'custom' ? customBookingSlotLength : bookingSlotLength,
      maximumBookingsPerSlot: onlineBooking === 'yes' && $('#booking-slot-capacity') ? $('#booking-slot-capacity').value.trim() : ''
    }
  };
}

function formatBusinessPreferenceSummary(preferences = {}) {
  const lines = [];
  const serviceAvailability = preferences.serviceAvailability === 'scheduled'
    ? 'Some services have specific times'
    : 'All services available during opening hours';
  lines.push(`Service availability: ${serviceAvailability}`);

  if(Array.isArray(preferences.scheduledServices) && preferences.scheduledServices.length) {
    const names = preferences.scheduledServices.map(service => service.serviceName).filter(Boolean).join(', ');
    if(names) lines.push(`Scheduled services: ${names}`);
  }

  const customerInformation = preferences.customerInformation || {};
  lines.push(`Customer details before token: ${customerInformation.collectBeforeToken ? 'Yes' : 'No'}`);
  if(Array.isArray(customerInformation.fields) && customerInformation.fields.length) {
    lines.push(`Details collected: ${customerInformation.fields.join(', ')}`);
  }
  if(Array.isArray(customerInformation.requiredFields) && customerInformation.requiredFields.length) {
    lines.push(`Required details: ${customerInformation.requiredFields.join(', ')}`);
  }

  lines.push(`Token recall: ${preferences.tokenRecall ? 'Allowed' : 'Not allowed'}`);
  const serviceCategories = preferences.serviceCategories || {};
  lines.push(`Service categories: ${serviceCategories.enabled ? 'Yes' : 'No'}`);
  if(Array.isArray(serviceCategories.categoryNames) && serviceCategories.categoryNames.length) {
    lines.push(`Category names: ${serviceCategories.categoryNames.join(', ')}`);
  }

  lines.push(`Mobile / QR queue access: ${preferences.mobileQrAccess ? 'Allowed' : 'Blocked'}`);
  const onlineBooking = preferences.onlineBooking || {};
  const bookingLabel = onlineBooking.preference === 'yes' ? 'Yes' : onlineBooking.preference === 'later' ? 'Maybe later' : 'No';
  lines.push(`Online booking: ${bookingLabel}`);
  if(onlineBooking.preference === 'yes') {
    if(onlineBooking.slotLengthMinutes) lines.push(`Default booking slot: ${onlineBooking.slotLengthMinutes} minutes`);
    if(onlineBooking.maximumBookingsPerSlot) lines.push(`Maximum bookings per slot: ${onlineBooking.maximumBookingsPerSlot}`);
  }

  return lines;
}

function updateRegistrationPreferenceVisibility() {
  togglePanel($('#scheduled-services-wrap'), getRadioValue('service-availability') === 'scheduled');
  togglePanel($('#customer-info-wrap'), getRadioValue('customer-info-needed') === 'yes');
  togglePanel($('#service-categories-wrap'), getRadioValue('service-categories') === 'yes');
  togglePanel($('#booking-slots-wrap'), getRadioValue('online-booking') === 'yes');

  const customSlot = $('#booking-slot-length') && $('#booking-slot-length').value === 'custom';
  togglePanel($('#booking-slot-custom'), customSlot);
  togglePanel($('#booking-slot-custom-label'), customSlot);
  if($('#booking-slot-custom')) $('#booking-slot-custom').required = customSlot && getRadioValue('online-booking') === 'yes';
  if($('#booking-slot-capacity')) $('#booking-slot-capacity').required = getRadioValue('online-booking') === 'yes';
  updateRegisterWizard();
}

document.querySelectorAll('input[name="service-availability"], input[name="customer-info-needed"], input[name="service-categories"], input[name="online-booking"]').forEach(input => {
  input.addEventListener('change', updateRegistrationPreferenceVisibility);
});

const addScheduledServiceBtn = $('#add-scheduled-service');
if(addScheduledServiceBtn) {
  addScheduledServiceBtn.addEventListener('click', () => {
    const list = $('#scheduled-services-list');
    if(list) list.appendChild(createScheduledServiceRow());
  });
}

const addServiceCategoryBtn = $('#add-service-category');
if(addServiceCategoryBtn) {
  addServiceCategoryBtn.addEventListener('click', () => {
    const list = $('#service-categories-list');
    if(!list) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.categoryName = '';
    input.placeholder = 'Category name';
    list.appendChild(input);
  });
}

const bookingSlotLengthSelect = $('#booking-slot-length');
if(bookingSlotLengthSelect) bookingSlotLengthSelect.addEventListener('change', updateRegistrationPreferenceVisibility);

document.querySelectorAll('.info-button').forEach(button => {
  button.addEventListener('click', event => {
    event.preventDefault();
    document.querySelectorAll('.info-button.is-open').forEach(openButton => {
      if(openButton !== button) openButton.classList.remove('is-open');
    });
    button.classList.toggle('is-open');
  });
});

document.addEventListener('click', event => {
  if(!event.target.closest('.info-button')) {
    document.querySelectorAll('.info-button.is-open').forEach(button => button.classList.remove('is-open'));
  }
});

const registerWizard = {
  currentIndex: 0,
  steps: Array.from(document.querySelectorAll('#register-form .register-step'))
};

function getVisibleRegisterSteps() {
  return registerWizard.steps.filter(step => {
    if(step.dataset.conditional === 'booking') return getRadioValue('online-booking') === 'yes';
    return true;
  });
}

function validateRegisterStep(step) {
  if(!step) return true;
  const fields = Array.from(step.querySelectorAll('input, select, textarea')).filter(field => {
    return !field.disabled && field.type !== 'button' && field.type !== 'submit' && field.offsetParent !== null;
  });
  for(const field of fields) {
    if(!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  return true;
}

function setRegisterWizardIndex(nextIndex) {
  const visibleSteps = getVisibleRegisterSteps();
  const boundedIndex = Math.max(0, Math.min(nextIndex, visibleSteps.length - 1));
  registerWizard.currentIndex = boundedIndex;
  registerWizard.steps.forEach(step => step.classList.remove('active'));
  if(visibleSteps[boundedIndex]) visibleSteps[boundedIndex].classList.add('active');
  updateRegisterWizard();
}

function updateRegisterWizard() {
  if(!registerWizard.steps.length) return;
  const visibleSteps = getVisibleRegisterSteps();
  if(registerWizard.currentIndex >= visibleSteps.length) registerWizard.currentIndex = visibleSteps.length - 1;
  const currentStep = visibleSteps[registerWizard.currentIndex];
  registerWizard.steps.forEach(step => step.classList.toggle('active', step === currentStep));

  const total = visibleSteps.length || 1;
  const current = Math.max(registerWizard.currentIndex + 1, 1);
  const percent = Math.round((current / total) * 100);
  const progressLabel = $('#register-progress-label');
  const progressPercent = $('#register-progress-percent');
  const progressFill = $('#register-progress-fill');
  if(progressLabel) progressLabel.textContent = `Step ${current} of ${total}`;
  if(progressPercent) progressPercent.textContent = `${percent}%`;
  if(progressFill) progressFill.style.width = `${percent}%`;

  const backBtn = $('#register-back');
  const nextBtn = $('#register-next');
  const submitBtn = $('#register-submit');
  const isLast = registerWizard.currentIndex === total - 1;
  if(backBtn) {
    backBtn.disabled = registerWizard.currentIndex === 0;
    backBtn.classList.toggle('hidden', registerWizard.currentIndex === 0);
  }
  if(nextBtn) nextBtn.classList.toggle('hidden', isLast);
  if(submitBtn) submitBtn.classList.toggle('hidden', !isLast);
}

const registerBackBtn = $('#register-back');
if(registerBackBtn) {
  registerBackBtn.addEventListener('click', () => setRegisterWizardIndex(registerWizard.currentIndex - 1));
}

const registerNextBtn = $('#register-next');
if(registerNextBtn) {
  registerNextBtn.addEventListener('click', () => {
    const visibleSteps = getVisibleRegisterSteps();
    const currentStep = visibleSteps[registerWizard.currentIndex];
    if(!validateRegisterStep(currentStep)) return;
    setRegisterWizardIndex(registerWizard.currentIndex + 1);
  });
}

updateRegistrationPreferenceVisibility();

// Password toggle buttons
document.querySelectorAll('.pwd-toggle').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const target = document.querySelector(btn.dataset.target);
    if(!target) return;
    if(target.type === 'password'){
      target.type = 'text';
      btn.textContent = 'Hide';
      btn.setAttribute('aria-label', 'Hide password');
    }
    else {
      target.type = 'password';
      btn.textContent = 'Show';
      btn.setAttribute('aria-label', 'Show password');
    }
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
      const profileData = profile.profile || {};
      const preferences = profile.businessPreferences || profileData.businessPreferences || {};
      const preferenceSummary = Object.keys(preferences).length
        ? formatBusinessPreferenceSummary(preferences).map(line => `<li>${escapeHtml(line)}</li>`).join('')
        : '';
      left.innerHTML = `
        <div><strong>${escapeHtml(profile.organizationName || profileData.name || email)}</strong></div>
        <div class="pending-meta">${escapeHtml(email)}</div>
        <div class="pending-meta">Type: ${escapeHtml(profile.organizationType || profile.businessType || profileData.organizationType || 'N/A')}</div>
        <div class="pending-meta">Contact: ${escapeHtml(profileData.contactNumber || 'N/A')} | Address: ${escapeHtml(profileData.address || 'N/A')}</div>
        <div class="pending-meta">UID: ${escapeHtml(uid)}</div>
        <div class="pending-meta">Created: ${escapeHtml(formatDate(profile.createdAt))} | Role: ${escapeHtml(profile.role || 'pending')}</div>
        ${preferenceSummary ? `<ul class="pending-preferences">${preferenceSummary}</ul>` : ''}
      `;

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
  const visibleSteps = getVisibleRegisterSteps();
  const currentStep = visibleSteps[registerWizard.currentIndex];
  const isFinalStep = registerWizard.currentIndex === visibleSteps.length - 1;
  if(!isFinalStep) {
    if(validateRegisterStep(currentStep)) setRegisterWizardIndex(registerWizard.currentIndex + 1);
    return;
  }
  const email = $('#register-email').value.trim();
  const organizationName = $('#register-organization').value.trim();
  const selectedOrganizationType = $('#register-organization-type') ? $('#register-organization-type').value.trim() : '';
  const customOrganizationType = $('#register-organization-type-other') ? $('#register-organization-type-other').value.trim() : '';
  const organizationType = selectedOrganizationType === 'Other' ? customOrganizationType : selectedOrganizationType;
  const contactNumber = $('#register-contact').value.trim();
  const address = $('#register-address').value.trim();
  const password = $('#register-password').value;
  const businessPreferences = collectBusinessPreferences();
  if (!organizationName || !organizationType || !contactNumber || !address) {
    showMessage('Please fill in organization name, organization type, contact number, and address.', 'error');
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
      organizationType,
      contactNumber,
      address,
      businessPreferences,
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
    updates['users/' + uid + '/organizationType'] = organizationType;
    updates['users/' + uid + '/businessType'] = organizationType;
    updates['users/' + uid + '/businessPreferences'] = businessPreferences;
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
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  try{
    const userCred = await auth.signInWithEmailAndPassword(email, password);
    const snap = await db.ref('users/' + userCred.user.uid).once('value');
    const profile = snap.val() || {};
    const superAdmin = await isSuperAdmin(userCred.user, profile);
    if(superAdmin){
      window.location.href = waitlessRoutes.admin || 'admin/dashboard.html';
      return;
    }
    if(profile.role === 'approved'){
      window.location.href = waitlessRoutes.business || 'business/dashboard.html';
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

  const adminPanel = $('#admin-panel');
  if(!adminPanel) return;
  const snap = await db.ref('users/' + user.uid).once('value');
  const profile = snap.val() || {};
  const profileData = profile.profile || {};
  const superAdmin = await isSuperAdmin(user, profile);

  info.innerHTML = `
    <p><strong>Organization:</strong> ${escapeHtml(profileData.name || profile.name || profile.organizationName || user.email || 'N/A')}</p>
    <p><strong>Email:</strong> ${escapeHtml(profile.email || user.email || 'N/A')}</p>
    <p><strong>Organization Type:</strong> ${escapeHtml(profileData.organizationType || profile.organizationType || profile.businessType || 'N/A')}</p>
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
    const superAdmin = await isSuperAdmin(user, profile);
    if(superAdmin){
      window.location.href = waitlessRoutes.admin || 'admin/dashboard.html';
      return;
    }
    if(profile.role === 'approved'){
      window.location.href = waitlessRoutes.business || 'business/dashboard.html';
      return;
    }
    await renderProfile(user);
    showSection('#profile-section');
  }
  else {
    const adminPanel = $('#admin-panel');
    if(adminPanel) adminPanel.classList.add('hidden');
    await renderProfile(null);
    showSection(initialAuthSection);
  }
});
