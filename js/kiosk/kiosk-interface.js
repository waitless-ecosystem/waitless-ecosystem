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
const tokenSummaryIntro = document.getElementById('token-summary-intro');
const newTokenBtn = document.getElementById('new-token-btn');
const resetBtn = document.getElementById('reset-btn');
const currentTimeEl = document.getElementById('current-time');
const customerDetailsSection = document.getElementById('customer-details-section');
const customerDetailsNote = document.getElementById('customer-details-note');
const customerLookupResult = document.getElementById('customer-lookup-result');
const customerNameInput = document.getElementById('customer-name-input');
const customerPhoneInput = document.getElementById('customer-phone-input');
const customerNameGroup = document.getElementById('customer-name-group');
const continueToServicesBtn = document.getElementById('continue-to-services-btn');
const customerPhoneGroup = customerPhoneInput ? customerPhoneInput.closest('.form-group') : null;

// Session Data
let kioskId = null;
let kioskName = null;
let organizationId = null;
let services = {};
let counters = {};
let assignments = {};
let selectedServiceIds = new Set();
let generatedTokens = null;
let sessionStartTime = null;
let inactivityTimeout = null;
let isGeneratingTokens = false;
let customerStepCompleted = false;
let customerPhoneChecked = false;
let customerLookup = null;
let serviceCategoriesEnabled = false;
let selectedServiceCategory = '';
let customerDetailSettings = {
  enabled: false,
  requireName: false,
  requirePhone: false,
  basicModeEnabled: false
};
let autoReturnSeconds = 0;
let autoReturnTimeout = null;

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

// Small HTML-escaping helper (queue-manager defines this elsewhere,
// but kiosk-interface may run without that file loaded). Prevents
// runtime errors when rendering category buttons with innerHTML.
function escapeHtml(text) {
  return String(text || '').replace(/[&<>\"']/g, function (m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '\"': '&quot;',
      "'": '&#39;'
    }[m];
  });
}
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

function getNormalizedServiceCategory(category) {
  const raw = String(category || '').trim();
  if (!raw) return 'uncategorized';
  return raw.toLowerCase();
}

function getServiceCategoryLabel(category) {
  const raw = String(category || '').trim();
  return raw || 'Uncategorized';
}

function getAvailableServiceCategories() {
  const categories = {};
  Object.values(services).forEach((service) => {
    const key = getNormalizedServiceCategory(service.category);
    if (!categories[key]) {
      categories[key] = {
        label: getServiceCategoryLabel(service.category),
        count: 0
      };
    }
    categories[key].count += 1;
  });
  return Object.entries(categories)
    .map(([key, value]) => ({
      value: key,
      label: value.label,
      count: value.count
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function selectServiceCategory(categoryValue) {
  // Allow explicit empty string to show the category chooser again.
  if (categoryValue === '' || categoryValue === null) {
    selectedServiceCategory = '';
  } else {
    selectedServiceCategory = String(categoryValue || '').trim() || 'all';
  }
  selectedServiceIds = new Set(
    Array.from(selectedServiceIds).filter((serviceId) => {
      const service = services[serviceId];
      if (!service) return false;
      if (selectedServiceCategory === 'all') return true;
      return getNormalizedServiceCategory(service.category) === selectedServiceCategory;
    })
  );
  renderServices();
  updateSelectionUI();
}

function normalizeCustomerDetailSettings(raw) {
  const data = raw || {};
  return {
    enabled: !!data.enabled,
    requireName: !!data.requireName,
    requirePhone: !!data.requirePhone,
    serviceCategoriesEnabled: !!data.serviceCategoriesEnabled,
    basicModeEnabled: !!data.basicModeEnabled,
    autoReturnSeconds: Number(data.autoReturnSeconds || 0)
  };
}

function normalizeAssignments(raw) {
  return raw || {};
}

function getCounterName(counterId) {
  return String(counters?.[counterId]?.name || '').trim();
}

function getCounterForService(serviceId) {
  const matches = Object.values(assignments).filter((assignment) => {
    const serviceIds = Array.isArray(assignment?.services) ? assignment.services : [];
    return serviceIds.includes(serviceId);
  });

  if (matches.length === 0) return null;

  const activeMatches = matches.filter((assignment) => {
    const counter = counters[assignment.counterId];
    return counter && counter.status !== 'inactive';
  });

  const assignment = activeMatches[0] || matches[0];
  if (!assignment) return null;

  return {
    counterId: assignment.counterId,
    counterName: getCounterName(assignment.counterId) || `Counter ${assignment.counterId}`
  };
}

function getRecommendedCounter(serviceIds) {
  const uniqueServiceIds = Array.from(new Set((serviceIds || []).filter(Boolean)));
  if (uniqueServiceIds.length === 0) return null;

  const countersForServices = uniqueServiceIds
    .map((serviceId) => getCounterForService(serviceId))
    .filter(Boolean);

  if (countersForServices.length === 0) return null;

  const firstCounterId = countersForServices[0].counterId;
  const allMatch = countersForServices.every((entry) => entry.counterId === firstCounterId);

  return allMatch ? countersForServices[0] : countersForServices[0];
}

function getCounterDisplayValue(counter) {
  const counterName = String(counter?.counterName || '').trim();
  const numericMatch = counterName.match(/\d+/);

  if (numericMatch) {
    return numericMatch[0];
  }

  if (counterName) {
    return counterName;
  }

  return String(counter?.counterId || '').trim();
}

function sanitizePhoneNumber(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizePhoneLookupKey(value) {
  let s = String(value || '').trim().replace(/[^0-9+]/g, '');
  if (!s) return '';

  // Normalize international Sri Lanka prefixes to local 0-prefixed form
  // +94xxxxxxxxx  -> 0xxxxxxxxx
  // 0094xxxxxxxxx -> 0xxxxxxxxx
  // 94xxxxxxxxx   -> 0xxxxxxxxx
  if (s.startsWith('+94')) return '0' + s.slice(3);
  if (s.startsWith('0094')) return '0' + s.slice(4);
  if (s.startsWith('94') && s.length > 2) return '0' + s.slice(2);

  // Already local format
  if (s.startsWith('0')) return s;

  // Fallback: return digits-only string
  return s.replace(/[^0-9]/g, '');
}

function formatPhoneForDisplay(value) {
  const phone = String(value || '').trim().replace(/\s+/g, '');
  if (!phone) return '';

  const normalized = phone.replace(/[^0-9+]/g, '');

  if (normalized.startsWith('+94')) {
    return `0${normalized.slice(3)}`;
  }

  if (normalized.startsWith('0094')) {
    return `0${normalized.slice(4)}`;
  }

  if (normalized.startsWith('94') && normalized.length >= 11) {
    return `0${normalized.slice(2)}`;
  }

  return normalized;
}

function isValidPhoneNumber(value) {
  const phone = sanitizePhoneNumber(value);
  if (!phone) return false;
  return /^[0-9+()\-\s]{6,20}$/.test(phone);
}

function setCustomerLookupResult(message, type = 'info') {
  if (!customerLookupResult) return;
  customerLookupResult.textContent = message || '';
  customerLookupResult.className = `customer-lookup-result ${type}`;
}

async function lookupAppUserByPhone(phone) {
  const rawKey = String(phone || '').trim().replace(/[^0-9+]/g, '');
  if (!rawKey) return null;

  // Build candidate keys to try, covering common stored formats.
  const candidates = new Set();
  candidates.add(rawKey);

  const canonicalZero = normalizePhoneLookupKey(phone); // our canonical 0-prefixed form
  if (canonicalZero) candidates.add(canonicalZero);

  // Variants with international prefixes
  if (canonicalZero && canonicalZero.startsWith('0')) {
    const rest = canonicalZero.slice(1);
    candidates.add('+94' + rest);
    candidates.add('0094' + rest);
    candidates.add('94' + rest);
  }

  // Also try without plus if raw had plus
  if (rawKey.startsWith('+')) {
    candidates.add(rawKey.slice(1));
  }

  // Try each candidate until one matches
  for (const key of candidates) {
    try {
      const snap = await db.ref(`appuserPhones/${key}`).once('value');
      if (snap.exists()) return snap.val();
    } catch (err) {
      // ignore and try next
    }
  }

  return null;
}

function applyCustomerDetailSettingsUI() {
  if (!customerDetailsSection) return;

  if (customerDetailSettings.basicModeEnabled) {
    customerDetailsSection.classList.add('hidden');
    if (servicesStep) {
      servicesStep.classList.remove('hidden');
    }
    customerStepCompleted = true;
    if (customerNameInput) {
      customerNameInput.required = false;
      customerNameInput.value = '';
    }
    if (customerNameGroup) {
      customerNameGroup.classList.add('hidden');
    }
    if (customerPhoneInput) {
      customerPhoneInput.required = false;
      customerPhoneInput.value = '';
    }
    customerPhoneChecked = false;
    customerLookup = null;
    setCustomerLookupResult('');
    if (customerDetailsNote) {
      customerDetailsNote.textContent = 'Basic mode is enabled. Select a service to see the assigned counter.';
    }
    return;
  }

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
    if (customerNameGroup) {
      customerNameGroup.classList.add('hidden');
    }
    if (customerPhoneInput) {
      customerPhoneInput.required = false;
      customerPhoneInput.value = '';
    }
    customerPhoneChecked = false;
    customerLookup = null;
    setCustomerLookupResult('');
    return;
  }

  customerDetailsSection.classList.remove('hidden');
  if (servicesStep) {
    servicesStep.classList.add('hidden');
  }
  customerStepCompleted = false;

  if (customerPhoneGroup) {
    customerPhoneGroup.classList.remove('hidden');
  }

  // Show name input only when the flow has checked the phone, a lookup exists,
  // or the org requires a name. This prevents asking for a name before phone
  // verification.
  const shouldShowName = !!customerDetailSettings.requireName || !!customerLookup || !!customerPhoneChecked;
  if (customerNameGroup) {
    customerNameGroup.classList.toggle('hidden', !shouldShowName);
  }

  if (customerNameInput) {
    customerNameInput.required = !!customerDetailSettings.requireName || !!customerLookup || !!customerPhoneChecked;
    customerNameInput.placeholder = customerDetailSettings.requireName || customerLookup
      ? 'Customer name'
      : 'Customer name (optional)';
  }

  if (customerPhoneInput) {
    customerPhoneInput.required = true;
    customerPhoneInput.placeholder = 'Enter phone number';
  }

  if (customerNameInput && !customerDetailSettings.requireName && !customerLookup) {
    customerNameInput.value = '';
    customerNameInput.required = false;
  }

  if (customerDetailsNote) {
    customerDetailsNote.textContent = customerLookup
      ? `Welcome, ${customerLookup.name || 'Customer'}.`
      : 'Enter the phone number first, then check the customer profile.';
  }

  if (continueToServicesBtn) {
    continueToServicesBtn.textContent = customerPhoneChecked && !customerLookup
      ? 'Continue to Services'
      : 'Check Phone';
  }
  renderCustomerWelcome();
}

function renderCustomerWelcome() {
  if (!servicesStep) return;
  let welcomeEl = servicesStep.querySelector('#services-welcome');
  if (!welcomeEl) {
    welcomeEl = document.createElement('div');
    welcomeEl.id = 'services-welcome';
    welcomeEl.className = 'services-welcome';
    const header = servicesStep.querySelector('.kiosk-step-header');
    if (header && header.parentNode) header.parentNode.insertBefore(welcomeEl, header.nextSibling);
    else servicesStep.insertBefore(welcomeEl, servicesStep.firstChild);
  }

  let message = '';
  if (customerLookup && customerLookup.name) {
    message = `Welcome, ${customerLookup.name}.`;
  } else if (customerNameInput && (customerNameInput.value || '').trim()) {
    message = `Welcome, ${customerNameInput.value.trim()}.`;
  } else if (customerDetailSettings.requireName) {
    message = 'Please provide the customer name before selecting services.';
  } else {
    message = 'Welcome! Select the services you need.';
  }

  welcomeEl.innerHTML = `<div class="welcome-text">${escapeHtml(message)}</div>`;

  // If admin allows name prompting or we have a lookup, offer edit button
  if (customerDetailSettings.enabled || customerDetailSettings.requireName || customerLookup) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'button-small button-secondary';
    editBtn.textContent = 'Edit customer';
    editBtn.addEventListener('click', () => {
      if (customerDetailsSection) customerDetailsSection.classList.remove('hidden');
      if (servicesStep) servicesStep.classList.add('hidden');
      customerStepCompleted = false;
      if (customerNameInput) customerNameInput.focus();
    });
    welcomeEl.appendChild(editBtn);
  }
}

function continueToServicesStep() {
  if (customerDetailSettings.basicModeEnabled) {
    customerStepCompleted = true;
    if (customerDetailsSection) {
      customerDetailsSection.classList.add('hidden');
    }
    if (servicesStep) {
      servicesStep.classList.remove('hidden');
    }
    showMessage('Select the service you need to see the correct counter.', 'info');
    return;
  }

  if (!customerDetailSettings.enabled) {
    customerStepCompleted = true;
    if (servicesStep) {
      servicesStep.classList.remove('hidden');
    }
    return;
  }

  try {
    const phone = sanitizePhoneNumber(customerPhoneInput?.value || '');
    if (!phone) {
      throw new Error('Customer phone number is required before continuing');
    }

    if (!customerPhoneChecked) {
      return lookupAppUserByPhone(phone)
        .then((match) => {
          customerPhoneChecked = true;
          customerLookup = match || null;

          if (customerLookup) {
            if (customerNameInput && customerLookup.name) {
              customerNameInput.value = customerLookup.name;
            }
            if (customerNameGroup) {
              customerNameGroup.classList.add('hidden');
            }
            const matchedPhone = formatPhoneForDisplay(customerLookup.phone || phone);
            setCustomerLookupResult(
              `Welcome, ${customerLookup.name || 'Customer'}.${matchedPhone ? ` Phone: ${matchedPhone}.` : ''}`,
              'success'
            );
            applyCustomerDetailSettingsUI();
            customerStepCompleted = true;
            if (customerDetailsSection) {
              customerDetailsSection.classList.add('hidden');
            }
            if (servicesStep) {
              servicesStep.classList.remove('hidden');
            }
            showMessage('Customer profile matched. Continue to services.', 'success');
            return;
          }

          setCustomerLookupResult('No app profile found for that phone. Please enter the customer name.', 'info');
          if (customerNameGroup) {
            customerNameGroup.classList.remove('hidden');
          }
          if (customerNameInput) {
            customerNameInput.required = true;
            customerNameInput.placeholder = 'Enter customer name';
            customerNameInput.focus();
          }
          if (continueToServicesBtn) {
            continueToServicesBtn.textContent = 'Continue to Services';
          }
        })
        .catch((lookupErr) => {
          customerPhoneChecked = false;
          throw lookupErr;
        });
    }

    const customerDetails = getCustomerDetailsFromForm();
    if (!customerDetails?.name && !customerLookup) {
      throw new Error('Customer name is required before continuing');
    }

    customerStepCompleted = true;
    const displayPhone = formatPhoneForDisplay(phone);
    if (customerDetailsSection) {
      customerDetailsSection.classList.add('hidden');
    }
    if (servicesStep) {
      servicesStep.classList.remove('hidden');
    }
    if (customerLookupResult) {
      customerLookupResult.textContent = `Welcome, ${customerDetails?.name || customerLookup?.name || 'Customer'}.${displayPhone ? ` Phone: ${displayPhone}.` : ''}`;
      customerLookupResult.className = 'customer-lookup-result success';
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
  const matchedName = String(customerLookup?.name || '').trim();
  const matchedUid = String(customerLookup?.uid || '').trim();

  if (customerDetailSettings.requireName && !name && !matchedName) {
    throw new Error('Customer name is required');
  }

  if (!phone) {
    throw new Error('Customer phone number is required');
  }

  if (phone && !isValidPhoneNumber(phone)) {
    throw new Error('Please enter a valid phone number');
  }

  if (!name && !matchedName && !phone) {
    return null;
  }

  return {
    name: name || matchedName,
    phone,
    uid: matchedUid || null
  };
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

  // TEST MODE: Allow testing without proper session if ?test=1 is present
  const urlParams = new URLSearchParams(window.location.search);
  const testMode = urlParams.get('test') === '1';
  
  if (testMode && (!kioskId || !organizationId)) {
    kioskId = 'test-kiosk-001';
    organizationId = 'test-org';
    kioskName = 'Test Kiosk';
    sessionStartTime = new Date();
    sessionStorage.setItem('kioskId', kioskId);
    sessionStorage.setItem('organizationId', organizationId);
    sessionStorage.setItem('kioskLoginTime', sessionStartTime.toISOString());
    console.log('TEST MODE ENABLED - Using mock session data');
  }

  if (!kioskId || !organizationId) {
    showMessage('Session expired. Redirecting to login...', 'error');
    setTimeout(() => {
      window.location.href = 'kiosk-login.html';
    }, 2000);
    return false;
  }

  try {
    const disabledSnap = await db.ref(`users/${organizationId}/settings/disabled`).once('value');
    if (disabledSnap.val()) {
      showMessage('This organization is temporarily disabled.', 'error');
      sessionStorage.clear();
      setTimeout(() => {
        window.location.href = 'kiosk-login.html';
      }, 2000);
      return false;
    }
  } catch (err) {
    console.log('Failed to load organization status', err);
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
    autoReturnSeconds = Number(customerDetailSettings.autoReturnSeconds || 0);
  } catch (err) {
    customerDetailSettings = normalizeCustomerDetailSettings(null);
  }

  serviceCategoriesEnabled = !!customerDetailSettings.serviceCategoriesEnabled;
  selectedServiceCategory = serviceCategoriesEnabled ? '' : 'all';
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
    // Do not redirect to login if the token view is currently displayed;
    // allow the kiosk to stay on the token screen for staff/customer visibility.
    if (tokenView && !tokenView.classList.contains('hidden')) {
      console.log('Session timeout detected but token view is visible — skipping redirect.');
      return;
    }

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
    // TEST MODE: Load mock data if ?test=1
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('test') === '1') {
      const mockServices = {
        'service-001': {
          name: 'Account Opening',
          description: 'Open a new account with our bank',
          estimatedTime: 15,
          category: 'Banking',
          status: 'active'
        },
        'service-002': {
          name: 'Cash Deposit',
          description: 'Deposit cash into your account',
          estimatedTime: 5,
          category: 'Transactions',
          status: 'active'
        },
        'service-003': {
          name: 'Cash Withdrawal',
          description: 'Withdraw cash from your account',
          estimatedTime: 5,
          category: 'Transactions',
          status: 'active'
        },
        'service-004': {
          name: 'Fixed Deposit',
          description: 'Open a fixed deposit account',
          estimatedTime: 20,
          category: 'Investments',
          status: 'active'
        },
        'service-005': {
          name: 'Loan Inquiry',
          description: 'Get information about our loan products',
          estimatedTime: 30,
          category: 'Loans',
          status: 'active'
        },
        'service-006': {
          name: 'Customer Support',
          description: 'General customer support and queries',
          estimatedTime: 10,
          category: 'Support',
          status: 'active'
        }
      };
      console.log('TEST MODE: Raw mock services:', mockServices);
      services = normalizeServices(mockServices);
      console.log('TEST MODE: Normalized services:', services);
      console.log('TEST MODE: Services count:', Object.keys(services).length);
    } else {
      const [privateSnapResult, publicSnapResult] = await Promise.allSettled([
        db.ref(`users/${organizationId}/services`).once('value'),
        db.ref(`publicOrganizations/${organizationId}/services`).once('value')
      ]);

      const privateServices = privateSnapResult.status === 'fulfilled' ? (privateSnapResult.value.val() || {}) : {};
      const publicServices = publicSnapResult.status === 'fulfilled' ? (publicSnapResult.value.val() || {}) : {};

      const chosenServices = Object.keys(privateServices).length > 0 ? privateServices : publicServices;
      services = normalizeServices(chosenServices);
    }

    selectedServiceCategory = serviceCategoriesEnabled ? '' : 'all';

    renderServices();
    setUpServiceListener();
    await loadQueueConfiguration();

    if (Object.keys(services).length === 0) {
      showMessage('No services available', 'error');
      return;
    }
  } catch (err) {
    console.error('Error loading services:', err);
    showMessage('Failed to load services: ' + err.message, 'error');
  }
}

async function loadQueueConfiguration() {
  try {
    const [countersSnap, assignmentsSnap] = await Promise.all([
      db.ref(`users/${organizationId}/counters`).once('value'),
      db.ref(`users/${organizationId}/assignments`).once('value')
    ]);

    counters = countersSnap.val() || {};
    assignments = normalizeAssignments(assignmentsSnap.val());
  } catch (err) {
    counters = {};
    assignments = {};
    console.log('Queue configuration not available', err);
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

  if (serviceCategoriesEnabled && !selectedServiceCategory) {
    const categories = getAvailableServiceCategories();
    if (categories.length === 0) {
      selectedServiceCategory = 'all';
    } else {
      const intro = document.createElement('div');
      intro.className = 'category-selection-intro';
      intro.innerHTML = `
        <div class="service-category-header">
          <h3>Select a service category</h3>
          <p>Pick a category first, then choose the services inside it.</p>
        </div>
      `;
      servicesContainer.appendChild(intro);

      const categoryGrid = document.createElement('div');
      categoryGrid.className = 'service-category-grid';
      // Ensure the category grid spans the full width of the parent grid
      categoryGrid.style.gridColumn = '1 / -1';

      const allOption = document.createElement('button');
      allOption.type = 'button';
      allOption.className = 'service-card category-card';
      allOption.textContent = 'All services';
      allOption.addEventListener('click', () => selectServiceCategory('all'));
      categoryGrid.appendChild(allOption);

      categories.forEach((category) => {
        const categoryCard = document.createElement('button');
        categoryCard.type = 'button';
        categoryCard.className = 'service-card category-card';
        categoryCard.innerHTML = `<strong>${escapeHtml(category.label)}</strong><span>${category.count} service${category.count === 1 ? '' : 's'}</span>`;
        categoryCard.addEventListener('click', () => selectServiceCategory(category.value));
        categoryGrid.appendChild(categoryCard);
      });

      servicesContainer.appendChild(categoryGrid);
      updateSelectionUI();
      return;
    }
  }

  const filteredEntries = serviceCategoriesEnabled && selectedServiceCategory && selectedServiceCategory !== 'all'
    ? entries.filter(([, service]) => getNormalizedServiceCategory(service.category) === selectedServiceCategory)
    : entries;

  if (serviceCategoriesEnabled && selectedServiceCategory) {
    const currentCategoryLabel = selectedServiceCategory === 'all'
      ? 'All services'
      : getAvailableServiceCategories().find((cat) => cat.value === selectedServiceCategory)?.label || getServiceCategoryLabel(selectedServiceCategory);
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-filter-header';
    categoryHeader.innerHTML = `
      <div class="category-filter-label">Category: <strong>${escapeHtml(currentCategoryLabel)}</strong></div>
      <button type="button" class="button-secondary button-small" id="change-category-btn">Change category</button>
    `;
    servicesContainer.appendChild(categoryHeader);
    const changeButton = categoryHeader.querySelector('#change-category-btn');
    if (changeButton) {
      changeButton.addEventListener('click', () => selectServiceCategory(''));
    }
  }

  if (filteredEntries.length === 0) {
    servicesContainer.innerHTML += '<p class="empty-state">No services are available for this category.</p>';
    updateSelectionUI();
    return;
  }

  filteredEntries.forEach(([serviceId, service]) => {
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
  const privateRef = db.ref(`users/${organizationId}/services`);
  const publicRef = db.ref(`publicOrganizations/${organizationId}/services`);

  privateRef.on('value', (snap) => {
    const privateServices = snap.val() || {};
    const hasPrivate = Object.keys(privateServices).length > 0;
    if (hasPrivate) {
      services = normalizeServices(privateServices);
    } else {
      publicRef.once('value').then((publicSnap) => {
        services = normalizeServices(publicSnap.val() || {});
        selectedServiceIds = new Set(
          Array.from(selectedServiceIds).filter((serviceId) => services[serviceId])
        );
        renderServices();
      }).catch(() => {
        services = normalizeServices(privateServices);
        selectedServiceIds = new Set(
          Array.from(selectedServiceIds).filter((serviceId) => services[serviceId])
        );
        renderServices();
      });
      return;
    }

    selectedServiceIds = new Set(
      Array.from(selectedServiceIds).filter((serviceId) => services[serviceId])
    );
    renderServices();
  });

  publicRef.on('value', (snap) => {
    const publicServices = snap.val() || {};
    const hasPrivate = Object.keys(services).length > 0 && Object.keys(services).some((id) => services[id]);
    if (!hasPrivate) {
      services = normalizeServices(publicServices);
      selectedServiceIds = new Set(
        Array.from(selectedServiceIds).filter((serviceId) => services[serviceId])
      );
      renderServices();
    }
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
    if (serviceCategoriesEnabled && !selectedServiceCategory) {
      selectedCountEl.textContent = 'Choose a category to see services';
    } else {
      selectedCountEl.textContent = selectedCount === 0
        ? 'No services selected'
        : `${selectedCount} service${selectedCount === 1 ? '' : 's'} selected`;
    }
  }

  if (generateTokensBtn) {
    generateTokensBtn.disabled = (serviceCategoriesEnabled && !selectedServiceCategory) || selectedCount === 0 || isGeneratingTokens;
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
  customerPhoneChecked = false;
  customerLookup = null;
  setCustomerLookupResult('');
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
  selectedServiceCategory = serviceCategoriesEnabled ? '' : 'all';
  renderServices();
  updateSelectionUI();
  // clear any pending auto-return timer
  if (autoReturnTimeout) {
    clearTimeout(autoReturnTimeout);
    autoReturnTimeout = null;
  }
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
    const recommendedCounter = customerDetailSettings.basicModeEnabled
      ? getRecommendedCounter(serviceIds)
      : null;

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
        organizationName: String(orgNameDisplay?.textContent || '').replace(/^Organization:\s*/i, '').trim() || organizationId,
        customerDetails,
        customerUid: customerDetails?.uid || null
      }
    );

    const queuePosition = await kioskTokenDB.getQueuePosition(
      organizationId,
      primaryServiceId,
      result.tokenId
    );

    generatedTokens = { ...result, queuePosition };
    displayTokenSummary(generatedTokens, recommendedCounter);
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

function displayTokenSummary(tokenResult, recommendedCounter = null) {
  tokenSummaryList.innerHTML = '';

  if (tokenSummaryIntro) {
    tokenSummaryIntro.textContent = customerDetailSettings.basicModeEnabled
      ? 'Go to the counter shown below.'
      : 'Show this token number to the staff when called.';
  }

  const card = document.createElement('div');
  card.className = 'token-result-card';

  const counterEl = document.createElement('div');
  counterEl.className = 'token-result-primary-queue';
  if (customerDetailSettings.basicModeEnabled) {
    counterEl.classList.add('token-result-number');
    counterEl.textContent = getCounterDisplayValue(recommendedCounter) || 'Assigned Counter';
  }

  if (customerDetailSettings.basicModeEnabled) {
    card.appendChild(counterEl);
  } else {
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

    card.appendChild(labelEl);
    card.appendChild(numberEl);
    card.appendChild(positionEl);

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

    card.appendChild(servicesEl);

    if (servicesList.length > 1) {
      const primaryEl = document.createElement('div');
      primaryEl.className = 'token-result-primary-queue';
      primaryEl.textContent = 'Primary Queue: ' + (tokenResult.primaryServiceName || servicesList[0].name);
      card.appendChild(primaryEl);
    }
  }

  tokenSummaryList.appendChild(card);

  servicesView.classList.add('hidden');
  tokenView.classList.remove('hidden');

  // Auto-return to services after configured seconds (0 = disabled)
  if (autoReturnTimeout) {
    clearTimeout(autoReturnTimeout);
    autoReturnTimeout = null;
  }
  if (Number(autoReturnSeconds) > 0) {
    autoReturnTimeout = setTimeout(() => {
      resetToServices();
    }, Number(autoReturnSeconds) * 1000);
  }
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

if (customerPhoneInput) {
  customerPhoneInput.addEventListener('input', () => {
    customerPhoneChecked = false;
    customerLookup = null;
    setCustomerLookupResult('');
    applyCustomerDetailSettingsUI();
  });
}

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
