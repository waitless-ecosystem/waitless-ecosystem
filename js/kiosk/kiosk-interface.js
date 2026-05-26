/**
 * KIOSK Interface Script
 * Handles service display, multi-service token generation, and customer experience.
 */

// Firebase Auth/DB are already initialized and available (loaded via `kiosk-db.js`).

// UI Elements
const messageEl = document.getElementById('message');
const kioskNameDisplay = document.getElementById('kiosk-name-display');
const orgNameDisplay = document.getElementById('org-name-display');
const servicesContainer = document.getElementById('services-container');
const serviceSelectForm = document.getElementById('service-select-form');
const selectedCountEl = document.getElementById('selected-count');
const generateTokensBtn = document.getElementById('generate-tokens-btn');
const servicesView = document.getElementById('services-view');
const servicesStep = document.getElementById('services-step');
const tokenView = document.getElementById('token-view');
const tokenSummaryList = document.getElementById('token-summary-list');
const newTokenBtn = document.getElementById('new-token-btn');
const resetBtn = document.getElementById('reset-btn');
const currentTimeEl = document.getElementById('current-time');
const customerDetailsSection = document.getElementById('customer-details-section');
const customerDetailsNote = document.getElementById('customer-details-note');
const customerNameInput = document.getElementById('customer-name-input');
const customerPhoneInput = document.getElementById('customer-phone-input');
const continueToServicesBtn = document.getElementById('continue-to-services-btn');
const customerNameGroup = customerNameInput ? customerNameInput.closest('.form-group') : null;
const customerPhoneGroup = customerPhoneInput ? customerPhoneInput.closest('.form-group') : null;

// Session Data
let kioskId = null;
let kioskName = null;
let organizationId = null;
let services = {};
let selectedServiceIds = new Set();
let generatedTokens = null;
let sessionStartTime = null;
let inactivityTimeout = null;
let isGeneratingTokens = false;
let customerStepCompleted = false;
let customerDetailSettings = {
  enabled: false,
  requireName: false,
  requirePhone: false
};

// Constants
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const INACTIVITY_CHECK_MS = 30 * 1000; // Check every 30 seconds

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

const SERVICE_FALLBACK_NAMES = [
  'Account Opening',
  'Cash Deposit',
  'Cash Withdrawal',
  'Fixed Deposit',
  'Loan Inquiry',
  'Customer Support',
  'Card Services',
  'General Inquiries'
];

const SERVICE_NAME_REPLACEMENTS = {
  one: 'Account Opening',
  two: 'Cash Deposit',
  test: 'Customer Support',
  sample: 'Customer Support',
  'general service': 'General Inquiries'
};

// ============================================================
// DISPLAY HELPERS
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

function isNumericName(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function getFriendlyKioskName(name, index = 0) {
  const existingName = String(name || '').trim();
  if (existingName && !isNumericName(existingName)) {
    return existingName;
  }

  return FRIENDLY_KIOSK_NAMES[index] || `Kiosk Terminal ${index + 1}`;
}

function getServiceDisplayName(service, serviceId, index) {
  const rawName = String(service?.name || '').trim();
  const normalized = rawName.toLowerCase();

  if (SERVICE_NAME_REPLACEMENTS[normalized]) {
    return SERVICE_NAME_REPLACEMENTS[normalized];
  }

  if (rawName) {
    return rawName;
  }

  return SERVICE_FALLBACK_NAMES[index % SERVICE_FALLBACK_NAMES.length] || `Service ${index + 1}`;
}

function getServiceDescription(service) {
  return String(service?.description || '').trim() || 'Please select this service to continue.';
}

function normalizeCustomerDetailSettings(raw) {
  const data = raw || {};
  return {
    enabled: !!data.enabled,
    requireName: !!data.requireName,
    requirePhone: !!data.requirePhone
  };
}

function sanitizePhoneNumber(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isValidPhoneNumber(value) {
  const phone = sanitizePhoneNumber(value);
  if (!phone) return false;
  return /^[0-9+()\-\s]{6,20}$/.test(phone);
}

function applyCustomerDetailSettingsUI() {
  if (!customerDetailsSection) return;

  if (!customerDetailSettings.enabled) {
    customerDetailsSection.classList.add('hidden');
    if (servicesStep) {
      servicesStep.classList.remove('hidden');
    }
    customerStepCompleted = true;
    if (customerNameInput) {
      customerNameInput.required = false;
      customerNameInput.value = '';
    }
    if (customerPhoneInput) {
      customerPhoneInput.required = false;
      customerPhoneInput.value = '';
    }
    return;
  }

  customerDetailsSection.classList.remove('hidden');
  if (servicesStep) {
    servicesStep.classList.add('hidden');
  }
  customerStepCompleted = false;

  if (customerNameGroup) {
    customerNameGroup.classList.toggle('hidden', !customerDetailSettings.requireName);
  }

  if (customerPhoneGroup) {
    customerPhoneGroup.classList.toggle('hidden', !customerDetailSettings.requirePhone);
  }

  if (customerNameInput) {
    customerNameInput.required = customerDetailSettings.requireName;
    customerNameInput.placeholder = customerDetailSettings.requireName
      ? 'Customer name (required)'
      : 'Customer name (optional)';
  }

  if (customerPhoneInput) {
    customerPhoneInput.required = customerDetailSettings.requirePhone;
    customerPhoneInput.placeholder = customerDetailSettings.requirePhone
      ? 'Phone number (required)'
      : 'Phone number (optional)';
  }

  if (customerNameInput && !customerDetailSettings.requireName) {
    customerNameInput.value = '';
    customerNameInput.required = false;
  }

  if (customerPhoneInput && !customerDetailSettings.requirePhone) {
    customerPhoneInput.value = '';
    customerPhoneInput.required = false;
  }

  if (customerDetailsNote) {
    const requiredParts = [];
    if (customerDetailSettings.requireName) requiredParts.push('name');
    if (customerDetailSettings.requirePhone) requiredParts.push('phone number');
    customerDetailsNote.textContent = requiredParts.length
      ? ('Please enter ' + requiredParts.join(' and ') + ' first, then continue to services.')
      : 'Customer name is requested first, then you can continue to services.';
  }

  if (continueToServicesBtn) {
    continueToServicesBtn.textContent = customerDetailSettings.requireName
      ? 'Continue to Services'
      : 'Continue to Services';
  }
}

function continueToServicesStep() {
  if (!customerDetailSettings.enabled) {
    customerStepCompleted = true;
    if (servicesStep) {
      servicesStep.classList.remove('hidden');
    }
    return;
  }

  try {
    const customerDetails = getCustomerDetailsFromForm();
    if (customerDetailSettings.requireName && !customerDetails?.name) {
      throw new Error('Customer name is required before continuing');
    }
    customerStepCompleted = true;
    if (customerDetailsSection) {
      customerDetailsSection.classList.add('hidden');
    }
    if (servicesStep) {
      servicesStep.classList.remove('hidden');
    }
    showMessage('Now select the services you need.', 'info');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

function bindPressAction(element, handler) {
  if (!element) return;
  let lastTriggeredAt = 0;
  const invoke = (event) => {
    const now = Date.now();
    if (now - lastTriggeredAt < 400) {
      return;
    }
    lastTriggeredAt = now;
    event.preventDefault();
    handler(event);
  };
  element.addEventListener('click', invoke);
  element.addEventListener('pointerup', invoke);
  element.addEventListener('touchend', invoke, { passive: false });
}

function getCustomerDetailsFromForm() {
  if (!customerDetailSettings.enabled) {
    return null;
  }

  const name = String(customerNameInput?.value || '').trim();
  const phone = sanitizePhoneNumber(customerPhoneInput?.value || '');

  if (customerDetailSettings.requireName && !name) {
    throw new Error('Customer name is required');
  }

  if (customerDetailSettings.requirePhone && !phone) {
    throw new Error('Customer phone number is required');
  }

  if (phone && !isValidPhoneNumber(phone)) {
    throw new Error('Please enter a valid phone number');
  }

  if (!name && !phone) {
    return null;
  }

  return { name, phone };
}

function updateKioskIdDisplays(value) {
  document.querySelectorAll('#kiosk-id-display, #footer-kiosk-id-display').forEach((el) => {
    if (el) {
      el.textContent = value;
    }
  });
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

async function initializeSession() {
  kioskId = sessionStorage.getItem('kioskId');
  kioskName = getFriendlyKioskName(sessionStorage.getItem('kioskName'), 0);
  organizationId = sessionStorage.getItem('organizationId');
  sessionStartTime = new Date(sessionStorage.getItem('kioskLoginTime'));

  if (!kioskId || !organizationId) {
    showMessage('Session expired. Redirecting to login...', 'error');
    setTimeout(() => {
      window.location.href = 'kiosk-login.html';
    }, 2000);
    return false;
  }

  if (kioskNameDisplay) {
    kioskNameDisplay.textContent = kioskName || 'KIOSK Terminal';
  }
  updateKioskIdDisplays(kioskId);

  const footerNameEl = document.getElementById('footer-kiosk-name-display');
  if (footerNameEl) {
    footerNameEl.textContent = kioskName || kioskId || 'Unknown';
  }

  if (currentTimeEl) {
    updateClock();
  }

  if (orgNameDisplay) {
    try {
      const snap = await db.ref(`users/${organizationId}/profile/name`).once('value');
      const orgName = snap.val();
      orgNameDisplay.textContent = orgName ? `Organization: ${orgName}` : '';
    } catch (err) {
      orgNameDisplay.textContent = '';
    }
  }

  try {
    const settingsSnap = await db.ref(`users/${organizationId}/settings/kioskCustomerDetails`).once('value');
    customerDetailSettings = normalizeCustomerDetailSettings(settingsSnap.val());
  } catch (err) {
    customerDetailSettings = normalizeCustomerDetailSettings(null);
  }

  applyCustomerDetailSettingsUI();

  return true;
}

function updateClock() {
  if (!currentTimeEl) return;
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  currentTimeEl.textContent = `${hours}:${minutes}`;
}

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

function resetInactivityTimer() {
  if (inactivityTimeout) {
    clearTimeout(inactivityTimeout);
  }
}

// ============================================================
// SERVICE LOADING & DISPLAY
// ============================================================

async function loadServices() {
  try {
    const snap = await db.ref(`users/${organizationId}/services`).once('value');
    services = normalizeServices(snap.val() || {});

    renderServices();
    setUpServiceListener();

    if (Object.keys(services).length === 0) {
      showMessage('No services available', 'error');
      return;
    }
  } catch (err) {
    console.error('Error loading services:', err);
    showMessage('Failed to load services: ' + err.message, 'error');
  }
}

function normalizeServices(serviceMap) {
  const normalized = {};

  Object.entries(serviceMap)
    .filter(([_, service]) => service && service.status !== 'inactive')
    .forEach(([serviceId, service], index) => {
      normalized[serviceId] = {
        ...service,
        id: service.id || serviceId,
        displayName: getServiceDisplayName(service, serviceId, index),
        displayDescription: getServiceDescription(service)
      };
    });

  return normalized;
}

function renderServices() {
  servicesContainer.innerHTML = '';

  const entries = Object.entries(services);
  if (entries.length === 0) {
    servicesContainer.innerHTML = '<p class="empty-state">No services available</p>';
    updateSelectionUI();
    return;
  }

  entries.forEach(([serviceId, service]) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'service-card';
    card.dataset.serviceId = serviceId;
    card.setAttribute('aria-pressed', selectedServiceIds.has(serviceId) ? 'true' : 'false');
    card.addEventListener('click', () => toggleServiceSelection(serviceId));

    const selectedIndicator = document.createElement('div');
    selectedIndicator.className = 'service-selected-indicator';
    selectedIndicator.textContent = 'Selected';

    const name = document.createElement('div');
    name.className = 'service-name';
    name.textContent = service.displayName;

    const description = document.createElement('div');
    description.className = 'service-description';
    description.textContent = service.displayDescription;

    const time = document.createElement('div');
    time.className = 'service-time';
    const estimatedTime = Number(service.estimatedTime || 0);
    time.textContent = estimatedTime > 0
      ? `Est. ${estimatedTime} min`
      : 'Time varies';

    card.appendChild(selectedIndicator);
    card.appendChild(name);
    card.appendChild(description);
    card.appendChild(time);
    servicesContainer.appendChild(card);
  });

  updateSelectionUI();
}

function setUpServiceListener() {
  const ref = db.ref(`users/${organizationId}/services`);
  ref.on('value', (snap) => {
    services = normalizeServices(snap.val() || {});
    selectedServiceIds = new Set(
      Array.from(selectedServiceIds).filter((serviceId) => services[serviceId])
    );
    renderServices();
  });
}

// ============================================================
// MULTI-SERVICE SELECTION
// ============================================================

function toggleServiceSelection(serviceId) {
  if (isGeneratingTokens) return;

  if (selectedServiceIds.has(serviceId)) {
    selectedServiceIds.delete(serviceId);
  } else {
    selectedServiceIds.add(serviceId);
  }

  updateSelectionUI();
}

function updateSelectionUI() {
  const selectedCount = selectedServiceIds.size;
  servicesContainer.classList.toggle('is-generating', isGeneratingTokens);

  document.querySelectorAll('.service-card').forEach((card) => {
    const isSelected = selectedServiceIds.has(card.dataset.serviceId);
    card.classList.toggle('selected', isSelected);
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });

  if (selectedCountEl) {
    selectedCountEl.textContent = selectedCount === 0
      ? 'No services selected'
      : `${selectedCount} service${selectedCount === 1 ? '' : 's'} selected`;
  }

  if (generateTokensBtn) {
    generateTokensBtn.disabled = selectedCount === 0 || isGeneratingTokens;
  }
}

function resetToServices() {
  tokenView.classList.add('hidden');
  servicesView.classList.remove('hidden');
  customerStepCompleted = !customerDetailSettings.enabled;
  selectedServiceIds.clear();
  generatedTokens = null;
  if (customerNameInput) customerNameInput.value = '';
  if (customerPhoneInput) customerPhoneInput.value = '';
  if (customerDetailsSection && customerDetailSettings.enabled) {
    customerDetailsSection.classList.remove('hidden');
  }
  if (servicesStep) {
    if (customerDetailSettings.enabled) {
      servicesStep.classList.add('hidden');
    } else {
      servicesStep.classList.remove('hidden');
    }
  }
  renderServices();
  updateSelectionUI();
}

// ============================================================
// TOKEN GENERATION
// ============================================================

async function handleGenerateTokens(e) {
  e.preventDefault();
  resetInactivityTimer();

  const serviceIds = Array.from(selectedServiceIds).filter((serviceId) => services[serviceId]);
  if (serviceIds.length === 0) {
    showMessage('Please select at least one service', 'error');
    return;
  }

  if (customerDetailSettings.enabled && !customerStepCompleted) {
    showMessage('Please continue through the customer name step first.', 'error');
    return;
  }

  isGeneratingTokens = true;
  generateTokensBtn.textContent = 'Generating...';
  updateSelectionUI();

  try {
    const customerDetails = getCustomerDetailsFromForm();
    const primaryServiceId = serviceIds[0];
    const primaryService = services[primaryServiceId];

    const selectedServicesList = serviceIds.map((id) => ({
      id,
      name: services[id].displayName,
      estimatedTime: Number(services[id].estimatedTime || 0)
    }));

    const result = await kioskTokenDB.generateVisitToken(
      organizationId,
      kioskId,
      kioskName,
      primaryServiceId,
      selectedServicesList,
      {
        primaryServiceName: primaryService.displayName,
        customerDetails
      }
    );

    const queuePosition = await kioskTokenDB.getQueuePosition(
      organizationId,
      primaryServiceId,
      result.tokenId
    );

    generatedTokens = { ...result, queuePosition };
    displayTokenSummary(generatedTokens);
    showMessage('Token generated successfully!', 'success');
    playNotificationSound();
  } catch (err) {
    console.error('Error generating token:', err);
    showMessage('Failed to generate token: ' + err.message, 'error');
  } finally {
    isGeneratingTokens = false;
    generateTokensBtn.textContent = 'Generate Token';
    updateSelectionUI();
  }
}

function displayTokenSummary(tokenResult) {
  tokenSummaryList.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'token-result-card';

  const labelEl = document.createElement('div');
  labelEl.className = 'token-result-label';
  labelEl.textContent = 'Token Number';

  const numberEl = document.createElement('div');
  numberEl.className = 'token-result-number';
  numberEl.textContent = tokenResult.tokenNumber;

  const positionEl = document.createElement('div');
  positionEl.className = 'token-result-position';
  positionEl.textContent = tokenResult.queuePosition
    ? `Position ${tokenResult.queuePosition} in queue`
    : 'Calculating position...';

  const servicesEl = document.createElement('div');
  servicesEl.className = 'token-result-services';

  const servicesTitle = document.createElement('div');
  servicesTitle.className = 'token-result-services-title';
  servicesTitle.textContent = 'Selected Services';
  servicesEl.appendChild(servicesTitle);

  const servicesList = tokenResult.selectedServices || [];
  servicesList.forEach((service) => {
    const item = document.createElement('div');
    item.className = 'token-result-service-item';
    item.textContent = '✓ ' + service.name;
    servicesEl.appendChild(item);
  });

  card.appendChild(labelEl);
  card.appendChild(numberEl);
  card.appendChild(positionEl);
  card.appendChild(servicesEl);

  if (servicesList.length > 1) {
    const primaryEl = document.createElement('div');
    primaryEl.className = 'token-result-primary-queue';
    primaryEl.textContent = 'Primary Queue: ' + (tokenResult.primaryServiceName || servicesList[0].name);
    card.appendChild(primaryEl);
  }

  tokenSummaryList.appendChild(card);

  servicesView.classList.add('hidden');
  tokenView.classList.remove('hidden');
}

function playNotificationSound() {
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
// EVENT LISTENERS
// ============================================================

serviceSelectForm.addEventListener('submit', handleGenerateTokens);
bindPressAction(generateTokensBtn, handleGenerateTokens);
bindPressAction(continueToServicesBtn, continueToServicesStep);

bindPressAction(newTokenBtn, () => {
  resetInactivityTimer();
  resetToServices();
});

bindPressAction(resetBtn, () => {
  resetInactivityTimer();
  resetToServices();
});

['click', 'touchstart', 'keydown'].forEach((event) => {
  document.addEventListener(event, resetInactivityTimer, true);
});

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  const sessionOk = await initializeSession();
  if (!sessionOk) return;

  updateClock();
  setInterval(updateClock, 1000);
  setInterval(checkSessionTimeout, INACTIVITY_CHECK_MS);

  await loadServices();
  if (servicesStep && !customerDetailSettings.enabled) {
    servicesStep.classList.remove('hidden');
  }
  showMessage('Welcome! Select one or more services.', 'info');
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden');
  }
});
