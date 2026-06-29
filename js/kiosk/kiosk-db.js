/**
 * KIOSK Database Module
 * Handles CRUD operations, authentication, and tracking for KIOSK accounts and tokens
 * Enforces data isolation per user (organization)
 */

// Initialize Firebase once, even if the page script already did it.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

function getLeastQueueCounter(serviceId, assignments, counters, queueData) {
  const candidateMatches = Object.values(assignments || {}).filter(
    (assignment) => Array.isArray(assignment?.services) && assignment.services.includes(serviceId)
  );

  if (candidateMatches.length === 0) return null;
  if (candidateMatches.length === 1) return candidateMatches[0];

  let bestMatch = candidateMatches[0];
  let minQueue = Infinity;

  const isWaiting = (s) => {
    const v = String(s || '').trim().toLowerCase();
    return ['waiting', 'new', 'queued', 'pending'].includes(v) || !v;
  };
  const isPast = (s) => {
    const v = String(s || '').trim().toLowerCase();
    return ['completed', 'cancelled', 'canceled', 'done', 'removed', 'rejected', 'served', 'expired', 'missed', 'no-show', 'noshow'].includes(v);
  };

  candidateMatches.forEach((match) => {
    let queueSize = 0;
    if (queueData) {
      Object.entries(queueData).forEach(([sId, sQueue]) => {
        if (!sQueue) return;
        Object.values(sQueue).forEach((token) => {
          if (token && !isPast(token.status) && isWaiting(token.status)) {
            if (token.assignedCounterId === match.counterId) {
              queueSize += 1;
            }
          }
        });
      });
    }
    if (queueSize < minQueue) {
      minQueue = queueSize;
      bestMatch = match;
    }
  });

  return bestMatch;
}

// ============================================================
// KIOSK CRUD OPERATIONS
// ============================================================

const kioskDB = {
  /**
   * Create a new KIOSK account
   * @param {string} organizationId - User ID (organization owner)
   * @param {string} name - KIOSK name
   * @returns {Promise<string>} KIOSK ID
   */
  async createKiosk(organizationId, name) {
    if (!name || name.trim().length === 0) throw new Error('KIOSK name required');
    if (!organizationId) throw new Error('Organization ID required');

    // Check for duplicate names within this organization
    const snap = await db
      .ref(`users/${organizationId}/kiosks`)
      .orderByChild('name')
      .equalTo(name.trim())
      .once('value');
    if (snap.val()) throw new Error('KIOSK name already exists');

    const kioskId = this.generateKioskId();
    const kioskData = {
      id: kioskId,
      name: name.trim(),
      status: 'active',
      organizationId,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      createdBy: auth.currentUser?.uid || 'system',
      tokensGenerated: 0,
      lastActivityAt: firebase.database.ServerValue.TIMESTAMP
    };

    await db.ref(`users/${organizationId}/kiosks/${kioskId}`).set(kioskData);
    return kioskId;
  },

  /**
   * Update KIOSK details
   * @param {string} organizationId - User ID
   * @param {string} kioskId - KIOSK ID
   * @param {object} updates - Fields to update
   */
  async updateKiosk(organizationId, kioskId, updates) {
    if (!kioskId || !organizationId) throw new Error('KIOSK ID and Organization ID required');
    
    const allowedFields = ['name', 'status', 'description'];
    const sanitizedUpdates = {};
    
    for (const field of allowedFields) {
      if (field in updates) {
        sanitizedUpdates[field] = updates[field];
      }
    }
    
    // Check for duplicate names if name is being updated
    if (sanitizedUpdates.name) {
      const snap = await db
        .ref(`users/${organizationId}/kiosks`)
        .orderByChild('name')
        .equalTo(sanitizedUpdates.name.trim())
        .once('value');
      const existing = snap.val() || {};
      if (Object.keys(existing).some(id => id !== kioskId)) {
        throw new Error('KIOSK name already exists');
      }
      sanitizedUpdates.name = sanitizedUpdates.name.trim();
    }

    await db.ref(`users/${organizationId}/kiosks/${kioskId}`).update(sanitizedUpdates);
  },

  /**
   * Delete/Archive KIOSK
   * @param {string} organizationId - User ID
   * @param {string} kioskId - KIOSK ID
   */
  async deleteKiosk(organizationId, kioskId) {
    if (!kioskId || !organizationId) throw new Error('KIOSK ID and Organization ID required');
    await db.ref(`users/${organizationId}/kiosks/${kioskId}`).remove();
  },

  /**
   * Get all KIOSKs for an organization
   * @param {string} organizationId - User ID
   * @returns {Promise<object>} KIOSKs map
   */
  async getAllKiosks(organizationId) {
    if (!organizationId) throw new Error('Organization ID required');
    const snap = await db.ref(`users/${organizationId}/kiosks`).once('value');
    return snap.val() || {};
  },

  /**
   * Get single KIOSK details
   * @param {string} organizationId - User ID
   * @param {string} kioskId - KIOSK ID
   * @returns {Promise<object>} KIOSK data
   */
  async getKiosk(organizationId, kioskId) {
    if (!kioskId || !organizationId) throw new Error('KIOSK ID and Organization ID required');
    const snap = await db.ref(`users/${organizationId}/kiosks/${kioskId}`).once('value');
    return snap.val();
  },

  /**
   * Listen for real-time KIOSK updates
   * @param {string} organizationId - User ID
   * @param {function} callback - Called with KIOSKs data
   * @returns {function} Unsubscribe function
   */
  listenKiosks(organizationId, callback) {
    if (!organizationId) throw new Error('Organization ID required');
    const ref = db.ref(`users/${organizationId}/kiosks`);
    const listener = ref.on('value', snap => callback(snap.val() || {}));
    return () => ref.off('value', listener);
  },

  /**
   * Generate unique KIOSK ID
   * @returns {string} Unique ID
   */
  generateKioskId() {
    return 'KIOSK_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
};

// ============================================================
// KIOSK AUTHENTICATION & USER MANAGEMENT
// ============================================================

const kioskAuthDB = {
  /**
   * Create a KIOSK user account (for KIOSK login)
   * Stores in separate collection for KIOSK authentication
   * @param {string} organizationId - Organization owner UID
   * @param {string} kioskId - Associated KIOSK ID
   * @param {string} pinCode - PIN for KIOSK login (4-6 digits)
   * @returns {Promise<object>} KIOSK user credentials
   */
  async createKioskUser(organizationId, kioskId, pinCode) {
    if (!organizationId || !kioskId) throw new Error('Organization ID and KIOSK ID required');
    if (!pinCode || !/^\d{4,6}$/.test(pinCode)) throw new Error('PIN must be 4-6 digits');

    const kioskUserId = `kiosk_${kioskId}`;
    const hashedPin = await this.hashPin(pinCode);

    await db.ref(`kioskUsers/${kioskUserId}`).set({
      id: kioskUserId,
      kioskId,
      organizationId,
      pinHash: hashedPin,
      role: 'kiosk',
      status: 'active',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      lastLoginAt: null
    });

    return { kioskUserId, kioskId, organizationId };
  },

  /**
   * Verify KIOSK PIN (simplified - in production use proper hashing)
   * @param {string} kioskUserId - KIOSK user ID
   * @param {string} pinCode - PIN to verify
   * @returns {Promise<object|null>} KIOSK user data or null
   */
  async verifyKioskPin(kioskUserId, pinCode) {
    const snap = await db.ref(`kioskUsers/${kioskUserId}`).once('value');
    const kioskUser = snap.val();
    if (!kioskUser || kioskUser.status !== 'active') return null;

    const hashedPin = await this.hashPin(pinCode);
    if (kioskUser.pinHash === hashedPin) {
      // Update last login
      await db.ref(`kioskUsers/${kioskUserId}/lastLoginAt`).set(firebase.database.ServerValue.TIMESTAMP);
      return kioskUser;
    }
    return null;
  },

  /**
   * Simple PIN hash (in production, use proper cryptographic hashing)
   * @param {string} pin - PIN code
   * @returns {Promise<string>} Hashed PIN
   */
  async hashPin(pin) {
    // Simple hash for demo - use bcrypt or similar in production
    return 'hash_' + pin.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  },

  /**
   * Update KIOSK PIN
   * @param {string} kioskUserId - KIOSK user ID
   * @param {string} newPin - New PIN
   */
  async updateKioskPin(kioskUserId, newPin) {
    if (!newPin || !/^\d{4,6}$/.test(newPin)) throw new Error('PIN must be 4-6 digits');
    const hashedPin = await this.hashPin(newPin);
    await db.ref(`kioskUsers/${kioskUserId}/pinHash`).set(hashedPin);
  },

  /**
   * Deactivate KIOSK user
   * @param {string} kioskUserId - KIOSK user ID
   */
  async deactivateKioskUser(kioskUserId) {
    await db.ref(`kioskUsers/${kioskUserId}/status`).set('inactive');
  }
};

// ============================================================
// TOKEN GENERATION WITH KIOSK TRACKING
// ============================================================

const kioskTokenDB = {
  /**
   * Generate token with KIOSK tracking using transaction
   * Ensures atomic operation and prevents race conditions
   * @param {string} organizationId - Organization ID
   * @param {string} kioskId - KIOSK ID
   * @param {string} kioskName - KIOSK name (denormalized)
   * @param {string} serviceId - Selected service ID
   * @param {object} options - Optional display data
   * @returns {Promise<object>} Generated token
   */
  async generateToken(organizationId, kioskId, kioskName, serviceId, options = {}) {
    if (!organizationId || !kioskId || !serviceId) {
      throw new Error('Organization ID, KIOSK ID, and Service ID required');
    }

    const tokenId = tokenFactory.generateTokenId();
    let tokenNumber;
    let generationBlocked = false;
    try {
      tokenNumber = await this.generateTokenNumber(organizationId, serviceId);
    } catch (err) {
      if (String(err.message || '').toLowerCase().includes('currently closed')) {
        generationBlocked = true;
        tokenNumber = tokenFactory.generateLegacyTokenNumber(tokenId) || tokenId;
      } else {
        throw err;
      }
    }

    // Verify service exists and is active
    const servicePath = `users/${organizationId}/services/${serviceId}`;
    const serviceSnap = await db.ref(servicePath).once('value');
    const serviceData = serviceSnap.val();
    if (!serviceData) throw new Error('Service not found');
    const serviceName = options.serviceName || serviceData.name || serviceId;

    const [assignmentsSnap, countersSnap, queueSnap] = await Promise.all([
      db.ref(`users/${organizationId}/assignments`).once('value'),
      db.ref(`users/${organizationId}/counters`).once('value'),
      db.ref(`users/${organizationId}/queue`).once('value')
    ]);
    const assignments = assignmentsSnap.val() || {};
    const counters = countersSnap.val() || {};
    const queueData = queueSnap.val() || {};

    const match = getLeastQueueCounter(serviceId, assignments, counters, queueData);
    let assignedCounterId = null;
    let assignedCounterName = null;
    if (match) {
      assignedCounterId = match.counterId;
      const counter = counters[match.counterId] || {};
      assignedCounterName = counter.name || counter.counterName || match.counterId || 'Counter';
    }

    try {
      const tokenData = tokenFactory.createBaseTokenData({
        tokenId,
        tokenNumber,
        organizationId,
        kioskId,
        kioskName,
        serviceId,
        serviceName,
        customerUid: auth.currentUser?.uid || `kiosk:${kioskId}`,
        assignedCounterId: assignedCounterId,
        assignedCounterName: assignedCounterName
      });

      const activityId = this.generateActivityId();
      const updates = {};
      updates[`users/${organizationId}/queue/${serviceId}/${tokenId}`] = tokenData;
      updates[`users/${organizationId}/kioskActivity/${activityId}`] = {
        id: activityId,
        kioskId,
        eventType: 'token_generated',
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        metadata: { tokenNumber, serviceId, serviceName, tokenId },
        userId: auth.currentUser?.uid || 'unknown'
      };
      updates[`users/${organizationId}/kiosks/${kioskId}/lastActivityAt`] = firebase.database.ServerValue.TIMESTAMP;

      await db.ref().update(updates);
      await db.ref(`users/${organizationId}/kiosks/${kioskId}/tokensGenerated`).transaction(current => {
        return (current || 0) + 1;
      });

      if (generationBlocked) {
        try {
          const wantSchedule = window.confirm('The selected organization is currently closed. Generate a token scheduled for the next open day?');
          if (!wantSchedule) {
            // remove created entries and decrement counter
            try {
              await db.ref(`users/${organizationId}/queue/${serviceId}/${tokenId}`).remove();
              // remove kiosk activity - find by activity metadata tokenId
              // we know activityId used earlier in updates variable
              if (updates && updates[`users/${organizationId}/kioskActivity/${activityId}`]) {
                await db.ref(`users/${organizationId}/kioskActivity/${activityId}`).remove();
              }
              await db.ref(`users/${organizationId}/kiosks/${kioskId}/tokensGenerated`).transaction(current => {
                return Math.max(0, (current || 0) - 1);
              });
            } catch (remErr) {
              console.warn('Failed to remove declined kiosk token:', remErr);
            }
            await this.logKioskActivity(organizationId, kioskId, 'token_creation_declined_closed', { tokenId, tokenNumber, serviceId });
            throw new Error('Token creation cancelled because organization is closed');
          }

          // find next open and schedule
          const openSnap = await db.ref(`users/${organizationId}/settings/openHours`).once('value');
          const openHours = openSnap.val() || {};
          function parseHM(v) {
            if (!v) return null;
            const parts = String(v || '').split(':');
            if (parts.length < 2) return null;
            return { h: parseInt(parts[0], 10), m: parseInt(parts[1], 10) };
          }
          function findNextOpenStart(hoursObj, fromDt) {
            for (let i = 0; i < 8; i++) {
              const candidate = new Date(fromDt.getTime() + i * 24 * 3600 * 1000);
              const key = ['sun','mon','tue','wed','thu','fri','sat'][candidate.getDay()];
              const conf = hoursObj && hoursObj[key];
              if (!conf || !conf.enabled) continue;
              const open = parseHM(conf.open);
              if (!open) continue;
              const start = new Date(candidate);
              start.setHours(open.h, open.m, 0, 0);
              if (start.getTime() >= fromDt.getTime()) return start;
            }
            return null;
          }

          const now = new Date();
          const nextOpen = findNextOpenStart(openHours, now);
          if (nextOpen) {
            const deferredUntil = nextOpen.getTime();
            await db.ref(`users/${organizationId}/queue/${serviceId}/${tokenId}`).update({
              deferredUntil,
              scheduledFor: nextOpen.toISOString(),
              status: 'scheduled'
            });
            // update kiosk activity metadata
            if (updates && updates[`users/${organizationId}/kioskActivity/${activityId}`]) {
              await db.ref(`users/${organizationId}/kioskActivity/${activityId}/metadata`).update({ scheduledFor: nextOpen.toISOString(), deferredUntil });
            }
            await this.logKioskActivity(organizationId, kioskId, 'token_scheduled_closed', { tokenId, tokenNumber, serviceId, scheduledFor: nextOpen.toISOString() });
          }
        } catch (schedErr) {
          console.warn('Scheduling for closed org failed:', schedErr);
        }
      }

      return { tokenId, tokenNumber, serviceId, serviceName, organizationId, kioskId, kioskName };
    } catch (err) {
      console.error('Token generation failed:', err);
      await this.logKioskActivity(organizationId, kioskId, 'token_generation_failed', {
        error: err.message
      });
      throw err;
    }
  },

  /**
   * Generate a single visit token for one customer selecting multiple services.
   * Creates ONE token under users/{orgId}/queue/{primaryServiceId}/{tokenId}.
   * The primary service is the first item in selectedServices.
   * @param {string} organizationId
   * @param {string} kioskId
   * @param {string} kioskName
   * @param {string} primaryServiceId - First selected service (determines queue path)
   * @param {Array<{id,name,estimatedTime}>} selectedServices - All chosen services
   * @param {object} options - Optional overrides (e.g. primaryServiceName)
   * @returns {Promise<object>} Generated token data
   */
  async generateVisitToken(organizationId, kioskId, kioskName, primaryServiceId, selectedServices, options) {
    if (!organizationId || !kioskId || !primaryServiceId) {
      throw new Error('Organization ID, KIOSK ID, and primary Service ID required');
    }
    if (!Array.isArray(selectedServices) || selectedServices.length === 0) {
      throw new Error('At least one service required');
    }

    var opts = options || {};
    var tokenNumber = await this.generateTokenNumber(organizationId, primaryServiceId);
    var tokenId = tokenFactory.generateTokenId();

    var serviceSnap = await db.ref('users/' + organizationId + '/services/' + primaryServiceId).once('value');
    var serviceData = serviceSnap.val();
    if (!serviceData) throw new Error('Primary service not found');

    var primaryServiceName = opts.primaryServiceName || serviceData.name || primaryServiceId;
    var organizationName = String(opts.organizationName || '').trim();
    var customerDetails = opts.customerDetails || null;

    var cleanedCustomerDetails = null;
    if (customerDetails && typeof customerDetails === 'object') {
      var customerName = String(customerDetails.name || '').trim();
      var customerPhone = String(customerDetails.phone || '').trim();
      if (customerName || customerPhone) {
        cleanedCustomerDetails = {
          name: customerName,
          phone: customerPhone
        };
      }
    }

    var cleanedServices = selectedServices.map(function(s) {
      return {
        id: s.id,
        name: s.name,
        estimatedTime: Number(s.estimatedTime || 0)
      };
    });

    var customerUid = opts.customerUid || (cleanedCustomerDetails && cleanedCustomerDetails.uid) || (auth.currentUser ? auth.currentUser.uid : ('kiosk:' + kioskId));

    const [assignmentsSnap, countersSnap, queueSnap] = await Promise.all([
      db.ref(`users/${organizationId}/assignments`).once('value'),
      db.ref(`users/${organizationId}/counters`).once('value'),
      db.ref(`users/${organizationId}/queue`).once('value')
    ]);
    const assignments = assignmentsSnap.val() || {};
    const counters = countersSnap.val() || {};
    const queueData = queueSnap.val() || {};

    const match = getLeastQueueCounter(primaryServiceId, assignments, counters, queueData);
    let assignedCounterId = null;
    let assignedCounterName = null;
    if (match) {
      assignedCounterId = match.counterId;
      const counter = counters[match.counterId] || {};
      assignedCounterName = counter.name || counter.counterName || match.counterId || 'Counter';
    }

    var tokenData = tokenFactory.createBaseTokenData({
      tokenId: tokenId,
      tokenNumber: tokenNumber,
      organizationId: organizationId,
      organizationName: organizationName || organizationId,
      kioskId: kioskId,
      kioskName: kioskName,
      serviceId: primaryServiceId,
      serviceName: primaryServiceName,
      customerUid: customerUid,
      assignedCounterId: assignedCounterId,
      assignedCounterName: assignedCounterName
    });

    tokenData.primaryServiceId = primaryServiceId;
    tokenData.primaryServiceName = primaryServiceName;
    tokenData.serviceId = primaryServiceId;
    tokenData.serviceName = primaryServiceName;
    tokenData.currentServiceId = primaryServiceId;
    tokenData.currentServiceName = primaryServiceName;
    tokenData.currentServiceIndex = 0;
    tokenData.serviceStageIndex = 0;
    tokenData.selectedServices = cleanedServices;
    tokenData.selectedServiceIds = cleanedServices.map(function(s) { return s.id; });
    tokenData.selectedServiceNames = cleanedServices.map(function(s) { return s.name; });
    tokenData.serviceCount = cleanedServices.length;

    if (cleanedCustomerDetails) {
      tokenData.customerDetails = cleanedCustomerDetails;
      tokenData.customerName = cleanedCustomerDetails.name || null;
      tokenData.customerPhone = cleanedCustomerDetails.phone || null;
    }

    var activityId = this.generateActivityId();
    var updates = {};
    updates['users/' + organizationId + '/queue/' + primaryServiceId + '/' + tokenId] = tokenData;
    if (customerUid && !String(customerUid).startsWith('kiosk:')) {
      updates['appuserTokens/' + customerUid + '/' + organizationId + '/' + tokenId] = tokenData;
    }
    updates['users/' + organizationId + '/kioskActivity/' + activityId] = {
      id: activityId,
      kioskId: kioskId,
      eventType: 'token_generated',
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      metadata: {
        tokenNumber: tokenNumber,
        primaryServiceId: primaryServiceId,
        primaryServiceName: primaryServiceName,
        serviceCount: cleanedServices.length,
        hasCustomerDetails: !!cleanedCustomerDetails,
        tokenId: tokenId
      },
      userId: auth.currentUser ? auth.currentUser.uid : 'unknown'
    };
    updates['users/' + organizationId + '/kiosks/' + kioskId + '/lastActivityAt'] = firebase.database.ServerValue.TIMESTAMP;

    await db.ref().update(updates);
    await db.ref('users/' + organizationId + '/kiosks/' + kioskId + '/tokensGenerated').transaction(function(current) {
      return (current || 0) + 1;
    });

    return {
      tokenId: tokenId,
      tokenNumber: tokenNumber,
      primaryServiceId: primaryServiceId,
      primaryServiceName: primaryServiceName,
      organizationId: organizationId,
      kioskId: kioskId,
      kioskName: kioskName,
      selectedServices: cleanedServices,
      serviceCount: cleanedServices.length
    };
  },

  /**
   * Log KIOSK activity
   * @param {string} organizationId - Organization ID
   * @param {string} kioskId - KIOSK ID
   * @param {string} eventType - Activity type
   * @param {object} metadata - Additional data
   */
  async logKioskActivity(organizationId, kioskId, eventType, metadata = {}) {
    const activityId = this.generateActivityId();
    const activityData = {
      id: activityId,
      kioskId,
      eventType,
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      metadata,
      userId: auth.currentUser?.uid || 'unknown'
    };

    await db.ref(`users/${organizationId}/kioskActivity/${activityId}`).set(activityData);
  },

  /**
   * Get KIOSK activity logs
   * @param {string} organizationId - Organization ID
   * @param {string} kioskId - Optional KIOSK ID filter
   * @returns {Promise<object>} Activity logs
   */
  async getKioskActivityLogs(organizationId, kioskId = null) {
    let ref = db.ref(`users/${organizationId}/kioskActivity`).orderByChild('timestamp');
    const snap = await ref.once('value');
    let logs = snap.val() || {};

    // Filter by KIOSK if specified
    if (kioskId) {
      logs = Object.fromEntries(
        Object.entries(logs).filter(([_, log]) => log.kioskId === kioskId)
      );
    }

    return logs;
  },

  /**
   * Get this token's current position among waiting tokens for a service.
   * @param {string} organizationId - Organization ID
   * @param {string} serviceId - Service ID
   * @param {string} tokenId - Token ID
   * @returns {Promise<number|null>} Position or null if token is not waiting
   */
  async getQueuePosition(organizationId, serviceId, tokenId) {
    const snap = await db.ref(`users/${organizationId}/queue/${serviceId}`).once('value');
    const waitingTokens = Object.values(snap.val() || {})
      .filter(token => token.status === 'waiting')
      .sort((a, b) => {
        const timeDiff = (a.timestamp || 0) - (b.timestamp || 0);
        if (timeDiff !== 0) return timeDiff;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

    const index = waitingTokens.findIndex(token => token.id === tokenId);
    return index >= 0 ? index + 1 : null;
  },

  /**
   * Generate unique token number (e.g., "A001")
   * @returns {string} Token number
   */
  async generateTokenNumber(organizationId = null, serviceId = null) {
    const prefix = await tokenFactory.resolveOrganizationTokenPrefix(db, organizationId);
    return tokenFactory.generateSequentialTokenNumber(db, {
      organizationId,
      prefix,
      serviceId,
      skipOpenHoursCheck: true
    });
  },

  /**
   * Generate unique token ID
   * @returns {string} Token ID
   */
  generateTokenId() {
    return tokenFactory.generateTokenId();
  },

  /**
   * Generate unique activity ID
   * @returns {string} Activity ID
   */
  generateActivityId() {
    return 'ACT_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
};

// ============================================================
// KIOSK REPORTING & ANALYTICS
// ============================================================

const kioskReportingDB = {
  /**
   * Get KIOSK statistics for reporting
   * @param {string} organizationId - Organization ID
   * @param {object} options - Report options
   * @returns {Promise<object>} Report data
   */
  async getKioskReport(organizationId, options = {}) {
    const { startDate = null, endDate = null, kioskId = null } = options;

    const kiosks = await kioskDB.getAllKiosks(organizationId);
    const report = {};

    for (const [id, kiosk] of Object.entries(kiosks)) {
      if (kioskId && id !== kioskId) continue;

      const stats = await this.getKioskStats(organizationId, id, startDate, endDate);
      report[id] = {
        kioskName: kiosk.name,
        status: kiosk.status,
        tokensGenerated: kiosk.tokensGenerated || 0,
        ...stats
      };
    }

    return report;
  },

  /**
   * Get statistics for a single KIOSK
   * @param {string} organizationId - Organization ID
   * @param {string} kioskId - KIOSK ID
   * @param {number} startDate - Timestamp or null
   * @param {number} endDate - Timestamp or null
   * @returns {Promise<object>} Statistics
   */
  async getKioskStats(organizationId, kioskId, startDate = null, endDate = null) {
    const activities = await kioskTokenDB.getKioskActivityLogs(organizationId, kioskId);
    
    // Filter by date if provided
    const filtered = Object.values(activities).filter(log => {
      if (startDate && log.timestamp < startDate) return false;
      if (endDate && log.timestamp > endDate) return false;
      return true;
    });

    const tokenGenerated = filtered.filter(log => log.eventType === 'token_generated').length;
    const tokensFailed = filtered.filter(log => log.eventType === 'token_generation_failed').length;

    return {
      tokensGeneratedPeriod: tokenGenerated,
      failedAttempts: tokensFailed,
      successRate: tokenGenerated + tokensFailed > 0 
        ? ((tokenGenerated / (tokenGenerated + tokensFailed)) * 100).toFixed(2) + '%'
        : 'N/A',
      lastActivityAt: filtered.length > 0 
        ? Math.max(...filtered.map(log => log.timestamp))
        : null
    };
  },

  /**
   * Get service-wise token breakdown per KIOSK
   * @param {string} organizationId - Organization ID
   * @param {string} kioskId - KIOSK ID
   * @returns {Promise<object>} Service breakdown
   */
  async getKioskServiceBreakdown(organizationId, kioskId) {
    const activities = await kioskTokenDB.getKioskActivityLogs(organizationId, kioskId);
    const breakdown = {};

    Object.values(activities)
      .filter(log => log.eventType === 'token_generated')
      .forEach(log => {
        const serviceId = log.metadata?.serviceId;
        if (serviceId) {
          breakdown[serviceId] = (breakdown[serviceId] || 0) + 1;
        }
      });

    return breakdown;
  }
};

// Export modules for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { kioskDB, kioskAuthDB, kioskTokenDB, kioskReportingDB };
}
