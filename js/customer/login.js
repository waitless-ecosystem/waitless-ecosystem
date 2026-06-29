(function () {
  const auth = firebase.auth();
  const db = firebase.database();
  const messageEl = document.getElementById('message');
  const tabButtons = Array.from(document.querySelectorAll('.customer-auth-tabs button'));
  const panels = {
    login: document.getElementById('login-panel'),
    register: document.getElementById('register-panel'),
    reset: document.getElementById('reset-panel')
  };

  function showMessage(text, type = 'info') {
    if (!messageEl) return;
    messageEl.textContent = text;
    messageEl.className = `message ${type}`.trim();
  }

  function setActiveView(view) {
    tabButtons.forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });

    Object.entries(panels).forEach(([key, panel]) => {
      panel.classList.toggle('active', key === view);
    });
  }

  async function ensureAppUserProfile(user, displayName, phone) {
    const profileRef = db.ref(`appuser/${user.uid}`);
    const snap = await profileRef.once('value');
    const existing = snap.val() || {};
    const payload = {
      uid: user.uid,
      name: displayName || existing.name || user.displayName || '',
      email: user.email || existing.email || '',
      phone: phone || existing.phone || '',
      createdAt: existing.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    if (!snap.exists()) {
      await profileRef.set(payload);
    } else {
      await profileRef.update(payload);
    }

    return payload;
  }

  async function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const phone = document.getElementById('register-phone').value.trim();
    const password = document.getElementById('register-password').value;

    if (!name || !email || !password) {
      showMessage('Please fill in your name, email, and password.', 'error');
      return;
    }

    try {
      showMessage('Creating your account...', 'info');
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: name });
      await ensureAppUserProfile(cred.user, name, phone);
      showMessage('Account created. Redirecting to the customer app...', 'success');
      window.location.href = 'index.html';
    } catch (error) {
      showMessage(error.message || 'Registration failed.', 'error');
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      showMessage('Signing you in...', 'info');
      await auth.signInWithEmailAndPassword(email, password);
      showMessage('Signed in. Redirecting to the customer app...', 'success');
      window.location.href = 'index.html';
    } catch (error) {
      showMessage(error.message || 'Sign in failed.', 'error');
    }
  }

  async function handleReset(event) {
    event.preventDefault();
    const email = document.getElementById('reset-email').value.trim();
    if (!email) {
      showMessage('Please enter your email address.', 'error');
      return;
    }

    try {
      showMessage('Sending password reset email...', 'info');
      await auth.sendPasswordResetEmail(email);
      showMessage('Password reset email sent. Check your inbox.', 'success');
    } catch (error) {
      showMessage(error.message || 'Password reset failed.', 'error');
    }
  }

  function wireForms() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('reset-form').addEventListener('submit', handleReset);

    tabButtons.forEach((button) => {
      button.addEventListener('click', () => setActiveView(button.dataset.view));
    });
  }

  async function checkIsOrgUser(user) {
    if (!user) return false;
    const snap = await db.ref(`users/${user.uid}`).once('value');
    const val = snap.val();
    if (val && val.role) {
      const role = String(val.role).toLowerCase();
      return ['superadmin', 'admin', 'approved', 'staff', 'kiosk', 'pending'].includes(role);
    }
    return false;
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      try {
        const isOrg = await checkIsOrgUser(user);
        if (isOrg) {
          showMessage('Access denied. Organization accounts cannot access the customer portal.', 'error');
          await auth.signOut();
          wireForms();
          setActiveView('login');
          return;
        }
        window.location.href = 'index.html';
        return;
      } catch (err) {
        showMessage('Authentication check failed: ' + err.message, 'error');
        await auth.signOut();
        wireForms();
        setActiveView('login');
        return;
      }
    }

    wireForms();
    setActiveView('login');
    showMessage('Use your customer account to continue.', 'info');
  });
})();
