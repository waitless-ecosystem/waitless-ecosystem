/**
 * KIOSK Interface Script
 * Handles service display, token generation, and customer experience
 * Implements real-time queue tracking and activity logging
 */

// Firebase Auth/DB are already initialized and available (loaded via `kiosk-db.js`).

// UI Elements
const messageEl = document.getElementById('message');
const kioskNameDisplay = document.getElementById('kiosk-name-display');
const kioskIdDisplay = document.getElementById('kiosk-id-display');
const orgNameDisplay = document.getElementById('org-name-display');
const servicesContainer = document.getElementById('services-container');
const servicesView = document.getElementById('services-view');
const tokenView = document.getElementById('token-view');
const tokenNumberEl = document.getElementById('token-number');
const tokenServiceEl = document.getElementById('token-service');
const tokenPositionEl = document.getElementById('token-position');
const newTokenBtn = document.getElementById('new-token-btn');
const resetBtn = document.getElementById('reset-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentTimeEl = document.getElementById('current-time');
const backToKioskBtn = document.getElementById('back-to-kiosk-btn');

// Session Data
let kioskId = null;
let kioskName = null;
let organizationId = null;
let services = {};
let selectedServiceId = null;
let selectedServiceName = null;
let lastTokenNumber = null;
let sessionStartTime = null;
let inactivityTimeout = null;

// Constants
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const INACTIVITY_CHECK_MS = 30 * 1000; // Check every 30 seconds

// ============================================================
// MESSAGE DISPLAY
// ============================================================

function showMessage(text, type = 'info', duration = 5000) {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`;
  messageEl.classList.remove('hidden');
  
  if (duration > 0) {
    setTimeout(() => {
      messageEl.classList.add('hidden');
      messageEl.textContent = '';
    }, duration);
  }
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

/**
 * Initialize session from sessionStorage
 */
async function initializeSession() {
  kioskId = sessionStorage.getItem('kioskId');
  kioskName = sessionStorage.getItem('kioskName');
  organizationId = sessionStorage.getItem('organizationId');
  sessionStartTime = new Date(sessionStorage.getItem('kioskLoginTime'));

  if (!kioskId || !organizationId) {
    showMessage('Session expired. Redirecting to login...', 'error');
    setTimeout(() => {
      window.location.href = 'kiosk-login.html';
    }, 2000);
    return false;
  }

  kioskNameDisplay.textContent = kioskName || 'KIOSK Terminal';
  kioskIdDisplay.textContent = kioskId;

  // Load organization name if possible
  if (orgNameDisplay) {
    try {
      const snap = await db.ref(`users/${organizationId}/profile/name`).once('value');
      const orgName = snap.val();
      orgNameDisplay.textContent = orgName ? `Organization: ${orgName}` : '';
    } catch (err) {
      orgNameDisplay.textContent = '';
    }
  }

  return true;
}

/**
 * Update clock display
 */
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  currentTimeEl.textContent = `${hours}:${minutes}`;
}

/**
 * Check session timeout
 */
function checkSessionTimeout() {
  const now = new Date();
  const elapsed = now - sessionStartTime;

  if (elapsed > SESSION_TIMEOUT_MS) {
    showMessage('Session timeout. Returning to login...', 'error');
    setTimeout(() => {
      window.location.href = 'kiosk-login.html';
    }, 2000);
  }
}

/**
 * Reset inactivity timer
 */
function resetInactivityTimer() {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
}

/**
 * Logout and return to login
 */
function logout() {
  sessionStorage.removeItem('kioskId');
  sessionStorage.removeItem('kioskName');
  sessionStorage.removeItem('organizationId');
  sessionStorage.removeItem('kioskUserId');
  sessionStorage.removeItem('kioskLoginTime');
  
  window.location.href = 'kiosk-login.html';
}

// ============================================================
// SERVICE LOADING & DISPLAY
// ============================================================

/**
 * Load active services for the organization
 */
async function loadServices() {
  try {
    const snap = await db
      .ref(`users/${organizationId}/services`)
      .orderByChild('status')
      .equalTo('active')
      .once('value');
    
    services = snap.val() || {};

    if (Object.keys(services).length === 0) {
      showMessage('No services available', 'error');
      return;
    }

    renderServices();
    setUpServiceListener();
  } catch (err) {
    console.error('Error loading services:', err);
    showMessage('Failed to load services: ' + err.message, 'error');
  }
}

/**
 * Render service cards
 */
function renderServices() {
  servicesContainer.innerHTML = '';

  Object.entries(services).forEach(([serviceId, service]) => {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.onclick = () => selectService(serviceId, service.name);

    const name = document.createElement('div');
    name.className = 'service-name';
    name.textContent = service.name;

    const description = document.createElement('div');
    description.className = 'service-description';
    description.textContent = service.description || 'General Service';

    const time = document.createElement('div');
    time.className = 'service-time';
    const estimatedTime = service.estimatedTime || 0;
    time.textContent = estimatedTime > 0 
      ? `⏱ Est. ${estimatedTime} min`
      : '⏱ Time varies';

    card.appendChild(name);
    card.appendChild(description);
    card.appendChild(time);
    servicesContainer.appendChild(card);
  });
}

/**
 * Set up real-time service listener
 */
function setUpServiceListener() {
  const ref = db.ref(`users/${organizationId}/services`);
  ref.on('value', (snap) => {
    services = snap.val() || {};
    renderServices();
  });
}

// ============================================================
// TOKEN GENERATION
// ============================================================

/**
 * Select a service and prepare for token generation
 */
async function selectService(serviceId, serviceName) {
  selectedServiceId = serviceId;
  selectedServiceName = serviceName;

  // Disable service selection during token generation
  document.querySelectorAll('.service-card').forEach(card => {
    card.style.pointerEvents = 'none';
    card.style.opacity = '0.5';
  });

  try {
    const result = await generateToken();
    displayToken(result, serviceName);
  } catch (err) {
    console.error('Error generating token:', err);
    showMessage('Failed to generate token: ' + err.message, 'error');
  } finally {
    // Re-enable service selection
    document.querySelectorAll('.service-card').forEach(card => {
      card.style.pointerEvents = 'auto';
      card.style.opacity = '1';
    });
  }
}

/**
 * Generate token with KIOSK tracking
 */
async function generateToken() {
  try {
    const result = await kioskTokenDB.generateToken(
      organizationId,
      kioskId,
      kioskName,
      selectedServiceId
    );

    lastTokenNumber = result.tokenNumber;
    return result;
  } catch (err) {
    console.error('Token generation error:', err);
    throw err;
  }
}

/**
 * Display generated token
 */
async function displayToken(tokenData, serviceName) {
  tokenNumberEl.textContent = tokenData.tokenNumber;
  tokenServiceEl.textContent = serviceName;

  // Get queue position
  const queueLength = await kioskTokenDB.getQueueLength(organizationId, selectedServiceId);
  tokenPositionEl.textContent = `${queueLength} in queue`;

  // Switch views
  servicesView.classList.add('hidden');
  tokenView.classList.remove('hidden');

  showMessage('Token generated successfully!', 'success');

  // Play notification sound if available
  playNotificationSound();
}

/**
 * Play notification sound
 */
function playNotificationSound() {
  // Create a simple beep using Web Audio API
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (err) {
    console.log('Audio not available:', err);
  }
}

// ============================================================
// QUEUE POSITION TRACKING
// ============================================================

/**
 * Get queue length for a service
 */
kioskTokenDB.getQueueLength = async function(organizationId, serviceId) {
  try {
    const snap = await db
      .ref(`users/${organizationId}/queue/${serviceId}`)
      .orderByChild('status')
      .equalTo('waiting')
      .once('value');
    
    return Object.keys(snap.val() || {}).length;
  } catch (err) {
    console.error('Error getting queue length:', err);
    return 0;
  }
};

// ============================================================
// EVENT LISTENERS
// ============================================================

/**
 * New Token Button
 */
newTokenBtn.addEventListener('click', (e) => {
  e.preventDefault();
  resetInactivityTimer();
  
  // Reset to service selection
  tokenView.classList.add('hidden');
  servicesView.classList.remove('hidden');
  selectedServiceId = null;
  selectedServiceName = null;
});

/**
 * Reset Button
 */
resetBtn.addEventListener('click', (e) => {
  e.preventDefault();
  resetInactivityTimer();
  
  tokenView.classList.add('hidden');
  servicesView.classList.remove('hidden');
  selectedServiceId = null;
  selectedServiceName = null;
});

/**
 * Logout Button
 */
logoutBtn.addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

/**
 * Reset inactivity on any interaction
 */
['click', 'touchstart', 'keydown'].forEach(event => {
  document.addEventListener(event, resetInactivityTimer, true);
});

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize session
  const sessionOk = await initializeSession();
  if (!sessionOk) {
    return;
  }

  // Start clock updates
  updateClock();
  setInterval(updateClock, 1000);

  // Check session timeout periodically
  setInterval(checkSessionTimeout, INACTIVITY_CHECK_MS);

  // Load services
  await loadServices();

  showMessage('Welcome! Please select a service.', 'info');
});
// Back to KIOSK selection (logout)
if (backToKioskBtn) {
  backToKioskBtn.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });
}

// Handle page visibility (pause timer when minimized)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden');
  } else {
    console.log('Page visible');
    resetInactivityTimer();
  }
});

// Handle offline/online status
window.addEventListener('offline', () => {
  showMessage('No internet connection. Services may not be available.', 'error', 0);
});

window.addEventListener('online', () => {
  showMessage('Connection restored', 'success', 3000);
});

// Prevent back button and user from navigating away
window.addEventListener('popstate', () => {
  window.history.pushState(null, null, window.location.href);
});

// Clear history on load
window.history.pushState(null, null, window.location.href);
