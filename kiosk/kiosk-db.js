/**
 * KIOSK Database Module
 * Handles CRUD operations, authentication, and tracking for KIOSK accounts and tokens
 * Enforces data isolation per user (organization)
 */

// Utility function for element selection
const $ = (sel) => document.querySelector(sel);

// Initialize Firebase (should already be initialized in main app)
const auth = firebase.auth();
const db = firebase.database();

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
   * Resolve the best counter for a service.
   * Prefers an active counter assigned to the service.
   */
  async resolveAssignedCounter(organizationId, serviceId) {
    if (!organizationId || !serviceId) return null;

    const [assignmentsSnap, countersSnap] = await Promise.all([
      db.ref(`users/${organizationId}/assignments`).once('value'),
      db.ref(`users/${organizationId}/counters`).once('value')
    ]);

    const assignments = assignmentsSnap.val() || {};
    const counters = countersSnap.val() || {};

    const candidates = Object.entries(assignments)
      .filter(([counterId, assignment]) => {
        const serviceIds = Array.isArray(assignment?.services) ? assignment.services : [];
        return serviceIds.includes(serviceId) && counters[counterId] && counters[counterId].status === 'active';
      })
      .map(([counterId]) => ({
        counterId,
        counterName: counters[counterId]?.name || counterId
      }))
      .sort((a, b) => String(a.counterName).localeCompare(String(b.counterName)));

    return candidates[0] || null;
  },

  /**
   * Generate token with KIOSK tracking using transaction
   * Ensures atomic operation and prevents race conditions
   * @param {string} organizationId - Organization ID
   * @param {string} kioskId - KIOSK ID
   * @param {string} kioskName - KIOSK name (denormalized)
   * @param {string} serviceId - Selected service ID
   * @returns {Promise<object>} Generated token
   */
  async generateToken(organizationId, kioskId, kioskName, serviceId) {
    if (!organizationId || !kioskId || !serviceId) {
      throw new Error('Organization ID, KIOSK ID, and Service ID required');
    }

    const tokenNumber = this.generateTokenNumber();
    const tokenId = this.generateTokenId();
    const generatedAt = new Date().toISOString();

    // Verify service exists and is active
    const servicePath = `users/${organizationId}/services/${serviceId}`;
    const serviceSnap = await db.ref(servicePath).once('value');
    const serviceData = serviceSnap.val();
    if (!serviceData) throw new Error('Service not found');

    const assignedCounter = await this.resolveAssignedCounter(organizationId, serviceId);
    const assignedCounterId = assignedCounter ? assignedCounter.counterId : null;
    const assignedCounterName = assignedCounter ? assignedCounter.counterName : 'Unassigned';

    const qrPayload = JSON.stringify({
      version: 1,
      organizationId,
      kioskId,
      kioskName,
      serviceId,
      serviceName: serviceData.name || '',
      tokenId,
      tokenNumber,
      assignedCounterId,
      assignedCounterName,
      generatedAt
    });

    const queueTokenData = {
      id: tokenId,
      tokenNumber,
      serviceId,
      serviceName: serviceData.name || '',
      timestamp: firebase.database.ServerValue.TIMESTAMP,
      status: 'waiting',
      assignedCounterId,
      assignedCounterName,
      kioskId,
      kioskName,
      organizationId,
      qrPayload
    };

    const historyTokenData = {
      id: tokenId,
      tokenNumber,
      serviceId,
      serviceName: serviceData.name || '',
      counterId: assignedCounterId,
      counterName: assignedCounterName,
      kioskId,
      kioskName,
      organizationId,
      status: 'waiting',
      date: generatedAt.slice(0, 10),
      generatedAt,
      qrPayload,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    try {
      const updates = {};
      updates[`users/${organizationId}/queue/${serviceId}/${tokenId}`] = queueTokenData;
      updates[`users/${organizationId}/tokens/${tokenId}`] = historyTokenData;

      await db.ref().update(updates);

      // Log activity
      await this.logKioskActivity(organizationId, kioskId, 'token_generated', {
        tokenNumber,
        serviceId,
        serviceName: serviceData.name || '',
        tokenId,
        counterId: assignedCounterId,
        counterName: assignedCounterName
      });

      // Increment KIOSK token counter
      await db.ref(`users/${organizationId}/kiosks/${kioskId}/tokensGenerated`).transaction(current => {
        return (current || 0) + 1;
      });

      return {
        tokenId,
        tokenNumber,
        serviceId,
        serviceName: serviceData.name || '',
        assignedCounterId,
        assignedCounterName,
        kioskId,
        kioskName,
        organizationId,
        qrPayload
      };
    } catch (err) {
      console.error('Token generation failed:', err);
      await this.logKioskActivity(organizationId, kioskId, 'token_generation_failed', {
        error: err.message
      });
      throw err;
    }
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
   * Generate unique token number (e.g., "A001")
   * @returns {string} Token number
   */
  generateTokenNumber() {
    const prefix = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
    const number = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return prefix + number;
  },

  /**
   * Generate unique token ID
   * @returns {string} Token ID
   */
  generateTokenId() {
    return 'TOKEN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
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
