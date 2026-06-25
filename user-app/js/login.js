if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

function $(selector) { return document.querySelector(selector); }

function showMessage(message, type = 'info') {
  const el = $('#message');
  if (!el) return;
  el.textContent = message;
  el.className = `message ${type}`;
}
function isValidSriLankanPhone(phone) {
  // Remove spaces, dashes and other non-digits
  phone = phone.replace(/\D/g, '');

  // Valid Sri Lankan mobile prefixes
  const validPrefixes = [
    '070', '071', '072', '074',
    '075', '076', '077', '078'
  ];

  // Must be exactly 10 digits
  if (phone.length !== 10) {
    return false;
  }

  const prefix = phone.substring(0, 3);
  return validPrefixes.includes(prefix);
}

function getReturnUrl() {
  const currentUrl = new URL(window.location.href);
  const isOnlineBooking = currentUrl.searchParams.get('booking') === 'online';
  const url = new URL(isOnlineBooking ? 'online-booking.html' : 'selectpage.html', window.location.href);
  const orgId = currentUrl.searchParams.get('orgId');
  if (orgId) {
    url.searchParams.set('orgId', orgId);
  }
  if (isOnlineBooking) {
    url.searchParams.set('booking', 'online');
  }
  return url.toString();
}

async function saveAppUserProfile(user, profile) {
  const normalizePhoneLookupKey = (value) => String(value || '').trim().replace(/[^0-9+]/g, '');
  const currentSnap = await db.ref(`appuser/${user.uid}`).once('value');
  const current = currentSnap.val() || {};

  await db.ref(`appuser/${user.uid}`).set({
    uid: user.uid,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    updatedAt: firebase.database.ServerValue.TIMESTAMP
  });

  const phoneKey = normalizePhoneLookupKey(profile.phone);
  if (phoneKey) {
    await db.ref(`appuserPhones/${phoneKey}`).set({
      uid: user.uid,
      name: profile.name,
      phone: profile.phone,
      updatedAt: firebase.database.ServerValue.TIMESTAMP
    });
  }

  const previousPhoneKey = normalizePhoneLookupKey(current.phone);
  if (previousPhoneKey && previousPhoneKey !== phoneKey) {
    await db.ref(`appuserPhones/${previousPhoneKey}`).remove();
  }
}

async function ensureAppUserExistsAndRedirect(user, profile) {
  try {
    const snap = await db.ref(`appuser/${user.uid}`).once('value');
    if (!snap.exists()) {
      await saveAppUserProfile(user, profile);
    }
    window.location.replace(getReturnUrl());
  } catch (err) {
    showMessage('Failed to save profile: ' + err.message, 'error');
  }
}

auth.onAuthStateChanged(async (user) => {
  if (!user) return;
  // If user exists and is verified, ensure profile and redirect.
  try {
    if (user.email && user.emailVerified) {
      const snap = await db.ref(`appuser/${user.uid}`).once('value');
      if (snap.exists()) {
        window.location.replace(getReturnUrl());
      }
    }
  } catch (_) {
    // Stay on login page if profile check fails.
  }
});

const signinForm = $('#signin-form');
const signupForm = $('#signup-form');
const recoverForm = $('#recover-form');
const signinBtn = $('#signin-btn');
const signupBtn = $('#signup-btn');
const recoverBtn = $('#recover-btn');
const resendBtn = $('#resend-verification-btn');
const checkBtn = $('#check-verification-btn');
const verificationPanel = $('#verification-panel');

function switchTo(mode) {
  // mode: 'signin' | 'signup' | 'recover'
  $('#signin-panel')?.classList.toggle('hidden', mode !== 'signin');
  $('#signup-panel')?.classList.toggle('hidden', mode !== 'signup');
  $('#recover-panel')?.classList.toggle('hidden', mode !== 'recover');
  $('#tab-signin')?.classList.toggle('active', mode === 'signin');
  $('#tab-signup')?.classList.toggle('active', mode === 'signup');
  $('#tab-recover')?.classList.toggle('active', mode === 'recover');
  if (verificationPanel) verificationPanel.classList.add('hidden');
}

$('#tab-signin')?.addEventListener('click', () => switchTo('signin'));
$('#tab-signup')?.addEventListener('click', () => switchTo('signup'));
$('#tab-recover')?.addEventListener('click', () => switchTo('recover'));

signupForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = ($('#name-input')?.value || '').trim();
  const email = ($('#email-input')?.value || '').trim();
  const password = ($('#password-input')?.value || '').trim();
  const phone = ($('#phone-input')?.value || '').trim();
  if (!name || !email || !phone || !password) {
    showMessage('Please enter name, email, phone and password.', 'error');
    return;
  }
  if (!isValidSriLankanPhone(phone)) {
    showMessage('Enter a valid Sri Lankan mobile number (070,071,072,074,075,076,077,078) with exactly 10 digits.', 'error');
    return;
  }
  if (password.length < 6) { showMessage('Password must be at least 6 characters.', 'error'); return; }
  signupBtn.disabled = true;
  signupBtn.textContent = 'Creating...';
  try {
    const result = await auth.createUserWithEmailAndPassword(email, password);
    const user = result.user;
    if (!user) throw new Error('Account creation failed.');
    await user.sendEmailVerification();
    showMessage('Verification email sent. Check your inbox.', 'info');
    if (verificationPanel) verificationPanel.classList.remove('hidden');
  } catch (err) {
    showMessage(err.message || 'Failed to create account.', 'error');
  } finally {
    signupBtn.disabled = false;
    signupBtn.textContent = 'Create account';
  }
});

resendBtn?.addEventListener('click', async () => {
  const email = ($('#email-input')?.value || '').trim();
  const password = ($('#password-input')?.value || '').trim();
  if (!email || !password) { showMessage('Enter email and password first to resend verification.', 'error'); return; }
  try {
    const signInResult = await auth.signInWithEmailAndPassword(email, password);
    const user = signInResult.user;
    if (!user) throw new Error('Unable to sign in to resend verification.');
    if (user.emailVerified) { showMessage('Email already verified. Please continue.', 'success'); return; }
    await user.sendEmailVerification();
    showMessage('Verification email resent.', 'info');
  } catch (err) {
    showMessage(err.message || 'Failed to resend verification.', 'error');
  }
});

checkBtn?.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) { showMessage('Sign in first to check verification status.', 'error'); return; }
  try {
    await user.reload();
    if (user.emailVerified) {
      // build profile values from signup inputs when possible
      const name = ($('#name-input')?.value || user.displayName || '').trim();
      const email = user.email || ($('#email-input')?.value || '').trim();
      const phone = ($('#phone-input')?.value || '').trim();
      if (!isValidSriLankanPhone(phone)) {
        showMessage('Enter a valid mobile number.', 'error');
        return;
      }
      await ensureAppUserExistsAndRedirect(user, { name, email, phone });
    } else {
      showMessage('Email not yet verified. Check your inbox and click the verification link.', 'error');
    }
  } catch (err) { showMessage(err.message || 'Unable to check verification status.', 'error'); }
});

signinForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = ($('#signin-email')?.value || '').trim();
  const password = ($('#signin-password')?.value || '').trim();
  if (!email || !password) { showMessage('Enter email and password.', 'error'); return; }
  signinBtn.disabled = true; signinBtn.textContent = 'Signing in...';
  try {
    const res = await auth.signInWithEmailAndPassword(email, password);
    const user = res.user;
    if (!user) throw new Error('Sign in failed.');
    await user.reload();
    if (!user.emailVerified) {
      showMessage('Email not verified. Check your inbox.', 'error');
      if (verificationPanel) verificationPanel.classList.remove('hidden');
      return;
    }
    // ensure appuser record exists and redirect
    const name = user.displayName || '';
    const phone = '';
    await ensureAppUserExistsAndRedirect(user, { name, email: user.email || email, phone });
  } catch (err) {
    showMessage(err.message || 'Sign in failed.', 'error');
  } finally { signinBtn.disabled = false; signinBtn.textContent = 'Sign in'; }
});

recoverForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = ($('#recover-email')?.value || '').trim();
  if (!email) { showMessage('Enter your email address.', 'error'); return; }
  recoverBtn.disabled = true; recoverBtn.textContent = 'Sending...';
  try {
    await auth.sendPasswordResetEmail(email);
    showMessage('Password reset email sent. Check your inbox.', 'info');
    switchTo('signin');
  } catch (err) {
    showMessage(err.message || 'Unable to send reset email.', 'error');
  } finally { recoverBtn.disabled = false; recoverBtn.textContent = 'Send reset email'; }
});

function showTutorialPanel(visible) {
  const panel = $('#tutorial-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !visible);
  panel.setAttribute('aria-hidden', String(!visible));
}

function setTutorialSeen() {
  try { localStorage.setItem('loginTutorialSeen', '1'); } catch (_) {}
}

function closeTutorialPanel() {
  showTutorialPanel(false);
  setTutorialSeen();
}

$('#tutorial-toggle')?.addEventListener('click', () => showTutorialPanel(true));
$('#tutorial-close')?.addEventListener('click', closeTutorialPanel);
$('#tutorial-got-it')?.addEventListener('click', closeTutorialPanel);

// Tutorial: step-by-step data and rendering
const tutorialSteps = [
  {
    title: 'Sign in',
    text: 'Tap the Sign In tab, enter your email and password, then press Sign in.',
    img: 'sign in01.png'
  },
  {
    title: 'Create account',
    text: 'Tap the Sign Up tab. Enter your name, email, phone and password, then press Create account.',
    img: 'sign up02.png'
  },
  {
    title: 'Verify email',
    text: "Open your email and click the verification link. Return to login and press 'I've verified' if needed.",
    img: 'verification05.png'
  },
  {
    title: 'Recover password',
    text: 'If you forget your password, use the Recover tab, enter your email, and send the reset email.',
    img: 'recover03.png'
  }
];

let tutorialIndex = 0;
const tutorialFolder = 'main application ss'; // folder where you place images (has a space)

function renderTutorialStep(idx) {
  const step = tutorialSteps[idx];
  const titleEl = $('#tutorial-title');
  const imgEl = $('#tutorial-screenshot');
  const textEl = $('#tutorial-step-text');
  const indicator = $('#tutorial-step-indicator');
  const prevBtn = $('#tutorial-prev');
  const nextBtn = $('#tutorial-next');

  if (titleEl) titleEl.textContent = `Login tutorial — ${step.title}`;
  if (textEl) textEl.innerHTML = `<strong>${step.title}</strong><p>${step.text}</p>`;
  if (indicator) indicator.textContent = `Step ${idx + 1} of ${tutorialSteps.length}`;

  // Build path and encode spaces
  const path = encodeURI(`${tutorialFolder}/${step.img}`);
  if (imgEl) {
    imgEl.src = path;
    imgEl.alt = `${step.title} screenshot`;
  }

  if (prevBtn) prevBtn.disabled = idx === 0;
  if (nextBtn) nextBtn.disabled = idx === tutorialSteps.length - 1;
}

$('#tutorial-prev')?.addEventListener('click', () => {
  if (tutorialIndex === 0) return;
  tutorialIndex -= 1;
  renderTutorialStep(tutorialIndex);
});

$('#tutorial-next')?.addEventListener('click', () => {
  if (tutorialIndex >= tutorialSteps.length - 1) return;
  tutorialIndex += 1;
  renderTutorialStep(tutorialIndex);
});

$('#tutorial-done')?.addEventListener('click', () => {
  closeTutorialPanel();
});

// When opening the panel, render the current step (start at 0)
$('#tutorial-toggle')?.addEventListener('click', () => {
  tutorialIndex = 0;
  renderTutorialStep(tutorialIndex);
});

document.addEventListener('click', (event) => {
  const panel = $('#tutorial-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  if (!event.target.closest('#tutorial-panel .tutorial-panel-card') && !event.target.closest('#tutorial-toggle')) {
    closeTutorialPanel();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeTutorialPanel();
});

// Note: tutorial panel opens when user clicks the three-dot button.
// Auto-opening on first load was removed to avoid blocking form interactions.
