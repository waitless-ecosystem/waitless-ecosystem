/**
 * KIOSK Login Script - THREE STEP AUTHENTICATION
 * Step 1: User account authentication (email/password)
 * Step 2: KIOSK device selection (from their organization only)
 * Step 3: KIOSK PIN entry
 */

// Firebase Auth/DB are already initialized and available (loaded via `kiosk-db.js`).

// UI Elements
const messageEl = document.getElementById('message');

// Step 1: User Authentication
const userAuthView = document.getElementById('user-auth-view');
const userAuthForm = document.getElementById('user-auth-form');
const userEmailInput = document.getElementById('user-email');
const userPasswordInput = document.getElementById('user-password');

// Step 2: KIOSK Selection
const kioskSelectView = document.getElementById('kiosk-select-view');
const kioskSelectForm = document.getElementById('kiosk-select-form');
const kioskSelect = document.getElementById('kiosk-select');
const backFromKioskBtn = document.getElementById('back-from-kiosk-btn');

// Step 3: PIN Entry
const pinEntryView = document.getElementById('pin-entry-view');
const pinLoginForm = document.getElementById('pin-login-form');
const pinInput = document.getElementById('pin-input');
const clearBtn = document.getElementById('clear-btn');
const backBtn = document.getElementById('back-btn');
const pinButtons = document.querySelectorAll('.pin-button');

// Step indicators
const step1El = document.getElementById('step1');
const step2El = document.getElementById('step2');
const step3El = document.getElementById('step3');

// State
let currentUser = null;
let currentUserUID = null;
let currentPin = '';
let selectedKioskId = null;
let selectedKioskName = null;
let organizationId = null;
let loadedKiosks = [];

const FRIENDLY_KIOSK_NAMES = [
  'Door 1',
  'Door 2',
  'Main Entrance Kiosk',
  'Front Desk Kiosk',
  'Customer Service Kiosk',
  'Information Desk Kiosk',
  'Cashier Area Kiosk',
  'Loan Section Kiosk'
];

// ============================================================
// MESSAGE DISPLAY UTILITIES
// ============================================================

function showMessage(text, type = 'info') {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  setTimeout(() => {
    messageEl.textContent = '';
    messageEl.className = 'message';
  }, 5000);
}

function isNumericName(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function getFriendlyKioskName(kiosk, index) {
  const existingName = String(kiosk?.name || '').trim();
  if (existingName && !isNumericName(existingName)) {
    return existingName;
  }

  return FRIENDLY_KIOSK_NAMES[index] || `Kiosk Terminal ${index + 1}`;
}

// ============================================================
// STEP INDICATOR UTILITIES
// ============================================================

function updateStepIndicator(activeStep) {
  // activeStep: 1, 2, or 3
  const steps = [step1El, step2El, step3El];
  steps.forEach((step, idx) => {
    step.classList.remove('active', 'completed');
    if (idx + 1 === activeStep) {
      step.classList.add('active');
    } else if (idx + 1 < activeStep) {
      step.classList.add('completed');
    }
  });
}

// ============================================================
// STEP 1: USER AUTHENTICATION
// ============================================================

userAuthForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = userEmailInput.value.trim();
  const password = userPasswordInput.value;

  if (!email || !password) {
    showMessage('Please enter email and password', 'error');
    return;
  }

  try {
    const userAuthButton = userAuthForm.querySelector('button[type="submit"]');
    userAuthButton.disabled = true;
    userAuthButton.textContent = 'Logging in...';

    // Authenticate with Firebase
    const result = await auth.signInWithEmailAndPassword(email, password);
    currentUser = result.user;
    currentUserUID = result.user.uid;

    showMessage('Authentication successful!', 'success');
    
    // Move to step 2: KIOSK selection
    setTimeout(() => {
      goToKioskSelection();
    }, 500);
  } catch (err) {
    console.error('Authentication error:', err);
    showMessage('Authentication failed: ' + err.message, 'error');
  } finally {
    const userAuthButton = userAuthForm.querySelector('button[type="submit"]');
    userAuthButton.disabled = false;
    userAuthButton.textContent = 'Login';
  }
});

// ============================================================
// STEP 2: KIOSK SELECTION
// ============================================================

async function goToKioskSelection() {
  updateStepIndicator(2);
  userAuthView.classList.add('hidden');
  kioskSelectView.classList.remove('hidden');

  // Load KIOSKs from current user's organization
  await loadKiosksForSelection();
  kioskSelect.focus();
}

/**
 * Load KIOSKs for the authenticated user's organization
 * Only shows KIOSKs from their organization
 */
async function loadKiosksForSelection() {
  try {
    // Get current user's profile to verify they're approved
    const userSnap = await db.ref(`users/${currentUserUID}`).once('value');
    const userProfile = userSnap.val();

    if (!userProfile || userProfile.role !== 'approved') {
      showMessage('Your account is not approved for KIOSK access', 'error');
      setTimeout(() => { window.location.href = 'kiosk-login.html'; }, 2000);
      return;
    }

    organizationId = currentUserUID;

    // Load only KIOSKs from THIS user's organization
    const kioskSnap = await db
      .ref(`users/${currentUserUID}/kiosks`)
      .orderByChild('status')
      .equalTo('active')
      .once('value');

    const kiosks = kioskSnap.val() || {};
    loadedKiosks = [];

    Object.entries(kiosks)
      .sort(([idA, kioskA], [idB, kioskB]) => {
        const createdA = kioskA?.createdAt || 0;
        const createdB = kioskB?.createdAt || 0;
        if (createdA !== createdB) return createdA - createdB;
        return idA.localeCompare(idB);
      })
      .forEach(([kioskId, kiosk], index) => {
        const displayName = getFriendlyKioskName(kiosk, index);
        loadedKiosks.push({
          kioskId,
          name: kiosk.name,
          displayName,
          organizationId: currentUserUID
        });
      });

    // Populate select dropdown
    kioskSelect.innerHTML = '<option value="">-- Choose a KIOSK --</option>';
    kioskSelect.disabled = false;
    
    if (loadedKiosks.length === 0) {
      showMessage('No KIOSKs available in your organization', 'error');
      kioskSelect.innerHTML = '<option value="">-- No KIOSKs available --</option>';
      kioskSelect.disabled = true;
      return;
    }

    loadedKiosks.forEach(kiosk => {
      const option = document.createElement('option');
      option.value = JSON.stringify({
        kioskId: kiosk.kioskId,
        organizationId: kiosk.organizationId,
        name: kiosk.displayName
      });
      option.textContent = kiosk.displayName;
      kioskSelect.appendChild(option);
    });

    showMessage(`Loaded ${loadedKiosks.length} KIOSK(s) from your organization`, 'info');
  } catch (err) {
    console.error('Error loading KIOSKs:', err);
    showMessage('Failed to load KIOSKs: ' + err.message, 'error');
  }
}

/**
 * Handle KIOSK selection and move to PIN entry
 */
kioskSelectForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!kioskSelect.value) {
    showMessage('Please select a KIOSK', 'error');
    return;
  }

  try {
    const selected = JSON.parse(kioskSelect.value);
    selectedKioskId = selected.kioskId;
    selectedKioskName = selected.name;

    showMessage(`KIOSK Selected: ${selectedKioskName}`, 'success');

    // Move to step 3: PIN entry
    setTimeout(() => {
      goToPinEntry();
    }, 500);
  } catch (err) {
    console.error('Error selecting KIOSK:', err);
    showMessage('Error selecting KIOSK', 'error');
  }
});

/**
 * Go back from KIOSK selection to user authentication
 */
backFromKioskBtn.addEventListener('click', (e) => {
  e.preventDefault();
  
  // Logout and go back
  auth.signOut().then(() => {
    currentUser = null;
    currentUserUID = null;
    organizationId = null;
    loadedKiosks = [];
    userEmailInput.value = '';
    userPasswordInput.value = '';
    
    kioskSelectView.classList.add('hidden');
    userAuthView.classList.remove('hidden');
    updateStepIndicator(1);
    
    showMessage('Logged out. Please login again.', 'info');
    userEmailInput.focus();
  }).catch(err => {
    console.error('Logout error:', err);
    showMessage('Error logging out', 'error');
  });
});

// ============================================================
// STEP 3: PIN ENTRY
// ============================================================

async function goToPinEntry() {
  updateStepIndicator(3);
  kioskSelectView.classList.add('hidden');
  pinEntryView.classList.remove('hidden');
  currentPin = '';
  updatePinDisplay();
  pinInput.focus();
}

/**
 * Go back to KIOSK selection
 */
function goBackToKioskSelection() {
  currentPin = '';
  updatePinDisplay();
  selectedKioskId = null;
  selectedKioskName = null;
  
  pinEntryView.classList.add('hidden');
  kioskSelectView.classList.remove('hidden');
  updateStepIndicator(2);
  kioskSelect.focus();
}

// ============================================================
// PIN VERIFICATION & FINAL AUTHENTICATION
// ============================================================

/**
 * Submit PIN and authenticate KIOSK
 */
async function submitPin() {
  if (currentPin.length < 4) {
    showMessage('PIN must be at least 4 digits', 'error');
    return;
  }

  try {
    const submitBtn = pinLoginForm.querySelector('button[data-action="submit"]');
    submitBtn.disabled = true;

    // KIOSK user ID format: kiosk_{kioskId}
    const kioskUserId = `kiosk_${selectedKioskId}`;
    
    // Verify PIN against KIOSK user in kioskUsers collection
    try {
      const kioskUser = await kioskAuthDB.verifyKioskPin(kioskUserId, currentPin);
      
      if (!kioskUser) {
        showMessage('Invalid PIN', 'error');
        currentPin = '';
        updatePinDisplay();
        submitBtn.disabled = false;
        return;
      }

      showMessage('KIOSK Authentication successful!', 'success');
      
      // Store KIOSK session data in sessionStorage
      sessionStorage.setItem('kioskId', selectedKioskId);
      sessionStorage.setItem('kioskName', selectedKioskName);
      sessionStorage.setItem('organizationId', organizationId);
      sessionStorage.setItem('kioskUserId', kioskUserId);
      sessionStorage.setItem('kioskLoginTime', new Date().toISOString());
      sessionStorage.setItem('authenticatedUserUID', currentUserUID);

      // Redirect to KIOSK interface
      setTimeout(() => {
        window.location.href = 'kiosk-interface.html';
      }, 500);
    } catch (err) {
      console.error('KIOSK user verification error:', err);
      showMessage('KIOSK authentication failed: ' + err.message, 'error');
      currentPin = '';
      updatePinDisplay();
      submitBtn.disabled = false;
    }
  } catch (err) {
    console.error('PIN verification error:', err);
    showMessage('Authentication failed: ' + err.message, 'error');
    currentPin = '';
    updatePinDisplay();
  }
}

// ============================================================
// PIN ENTRY HANDLING
// ============================================================

/**
 * Update PIN display (dots)
 */
function updatePinDisplay() {
  pinInput.value = '•'.repeat(currentPin.length);
}

/**
 * Handle PIN button clicks
 */
pinButtons.forEach(button => {
  button.addEventListener('click', (e) => {
    e.preventDefault();
    
    const pin = button.dataset.pin;
    const action = button.dataset.action;

    if (pin) {
      // Digit button
      if (currentPin.length < 6) {
        currentPin += pin;
        updatePinDisplay();
      }
    } else if (action === 'delete') {
      // Delete button
      currentPin = currentPin.slice(0, -1);
      updatePinDisplay();
    } else if (action === 'submit') {
      // Submit button
      submitPin();
    }
  });
});

/**
 * Clear button handler
 */
clearBtn.addEventListener('click', (e) => {
  e.preventDefault();
  currentPin = '';
  updatePinDisplay();
});

/**
 * Back button handler
 */
backBtn.addEventListener('click', (e) => {
  e.preventDefault();
  goBackToKioskSelection();
});

// ============================================================
// KEYBOARD SUPPORT
// ============================================================

document.addEventListener('keydown', (e) => {
  if (!pinEntryView.classList.contains('hidden')) {
    // Only handle keys when in PIN entry view
    if (/^\d$/.test(e.key)) {
      // Number key
      if (currentPin.length < 6) {
        currentPin += e.key;
        updatePinDisplay();
      }
    } else if (e.key === 'Backspace') {
      // Delete
      currentPin = currentPin.slice(0, -1);
      updatePinDisplay();
    } else if (e.key === 'Enter') {
      // Submit
      submitPin();
    }
  }
});

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Check if user is already authenticated
  auth.onAuthStateChanged((user) => {
    if (user && sessionStorage.getItem('kioskId')) {
      // User is already in a KIOSK session, redirect to interface
      window.location.href = 'kiosk-interface.html';
    } else if (user) {
      // User is authenticated in Firebase but no KIOSK session
      // Take them to step 2 (KIOSK selection)
      currentUser = user;
      currentUserUID = user.uid;
      goToKioskSelection();
    } else {
      // User not authenticated, show step 1
      updateStepIndicator(1);
      userAuthView.classList.remove('hidden');
      userEmailInput.focus();
    }
  });

  // Clear form on page load (security best practice)
  userPasswordInput.value = '';
});

// Handle offline/online status
window.addEventListener('online', () => {
  showMessage('Connection restored', 'success');
});

window.addEventListener('offline', () => {
  showMessage('No internet connection', 'error');
});
