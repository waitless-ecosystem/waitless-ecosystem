// ─────────────────────────────────────────────
//  token.js  — Customer Token & Queue Position
//  Reads: ?orgId=xxx&serviceId=xxx&kioskId=xxx
//  Writes to: users/{orgId}/queue/{serviceId}/{tokenId}
//  Live-listens for position updates
// ─────────────────────────────────────────────

// Firebase config is loaded by token.html from ../../js/config/firebase-config.js.
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

// ── Helpers ──────────────────────────────────
function $id(id) { return document.getElementById(id); }

function show(id)  { $id(id).classList.remove('hidden'); }
function hide(id)  { $id(id).classList.add('hidden'); }

function showError(msg) {
    hide('loading-view');
    hide('token-view');
    $id('error-msg').textContent = msg;
    show('error-view');
}

/** Generate a token number like A001 */
function generateTokenNumber() {
    const letter = 'A';
    const num    = Math.floor(Math.random() * 900) + 100; // 100–999
    return letter + num;
}

/** Generate a unique token ID */
function generateTokenId() {
    return 'TOKEN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// ── URL Params ────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const orgId     = urlParams.get('orgId');
const serviceId = urlParams.get('serviceId');
const serviceName = urlParams.get('serviceName') || 'Requested Service';
const kioskId   = urlParams.get('kioskId') || 'WALK_IN';

// Validate required params
if (!orgId || !serviceId) {
    document.addEventListener('DOMContentLoaded', () => {
        showError('Invalid link. Please scan the QR code again.');
    });
}

// ── State ─────────────────────────────────────
let myTokenId     = null;  // the token ID written to Firebase
let myTokenNumber = null;  // display number e.g. "A123"
let queueListener = null;  // Firebase listener reference (for cleanup)

// ── Main Flow ─────────────────────────────────
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        // Save return URL so we come back after login
        sessionStorage.setItem('returnAfterLogin', window.location.href);
        window.location.href = 'login.html';
        return;
    }
    if (!orgId || !serviceId) return;
    await joinQueue(orgId, serviceId, kioskId, user.uid);
});

// ── Join Queue ────────────────────────────────
async function joinQueue(orgId, serviceId, kioskId, customerUid) {
    try {
        // 1. Verify service exists
        const serviceSnap = await db.ref(`users/${orgId}/services/${serviceId}`).once('value');
        const serviceData  = serviceSnap.val();
        if (!serviceData) {
            showError('This service is not available right now.');
            return;
        }

        // 2. Check if this customer already has an active token for this service
        //    (prevents double-joining on refresh)
        const existingSnap = await db.ref(`users/${orgId}/queue/${serviceId}`)
            .orderByChild('customerUid')
            .equalTo(customerUid)
            .once('value');

        let existingToken = null;
        if (existingSnap.exists()) {
            existingSnap.forEach(child => {
                const t = child.val();
                if (t.status === 'waiting' || t.status === 'serving') {
                    existingToken = t;
                }
            });
        }

        if (existingToken) {
            // Re-attach to existing token
            myTokenId     = existingToken.id;
            myTokenNumber = existingToken.tokenNumber;
        } else {
            // 3. Create new token
            myTokenNumber = generateTokenNumber();
            myTokenId     = generateTokenId();

            const tokenData = {
                id:           myTokenId,
                tokenNumber:  myTokenNumber,
                serviceId:    serviceId,
                serviceName:  serviceData.name || serviceId,
                organizationId: orgId,
                kioskId:      kioskId,
                customerUid:  customerUid,
                timestamp:    firebase.database.ServerValue.TIMESTAMP,
                status:       'waiting',      // waiting | serving | done
                assignedCounterId:   null,
                assignedCounterName: null,
            };

            const updates = {};
            updates[`users/${orgId}/queue/${serviceId}/${myTokenId}`] = tokenData;
            updates[`users/${customerUid}/tokens/${myTokenId}`] = tokenData;
            await db.ref().update(updates);
        }

        // 4. Show the UI and start listening
        hide('loading-view');
        show('token-view');
        $id('token-number-display').textContent = myTokenNumber;
        $id('service-name-display').textContent  = serviceData.name || '';
        $id('org-display').textContent           = `Organisation: ${orgId}`;

        startQueueListener(orgId, serviceId);

    } catch (err) {
        console.error('joinQueue error:', err);
        showError('Failed to join queue: ' + err.message);
    }
}

// ── Live Queue Listener ───────────────────────
function startQueueListener(orgId, serviceId) {
    const queueRef = db.ref(`users/${orgId}/queue/${serviceId}`);

    queueListener = queueRef.on('value', (snapshot) => {
        const all = snapshot.val() || {};
        updateQueueUI(all);
    }, (err) => {
        console.error('Queue listener error:', err);
    });
}
// ── Update UI from queue snapshot ────────────
function updateQueueUI(allTokens) {
    // Sort all waiting tokens by timestamp (oldest first = position 1)
    const waitingList = Object.values(allTokens)
        .filter(t => t.status === 'waiting')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Find the token currently being served (for "Now Serving" display)
    const servingList = Object.values(allTokens)
        .filter(t => t.status === 'serving')
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    const myToken = allTokens[myTokenId];

    // ── Now Serving number ──
    if (servingList.length > 0) {
        $id('now-serving-number').textContent = servingList[0].tokenNumber;
    } else if (waitingList.length > 0) {
        $id('now-serving-number').textContent = '—';
    }

    // ── Handle my token's status ──
    if (!myToken) {
        // Token was removed (edge case)
        showError('Your token was removed. Please rejoin.');
        return;
    }

    const status = myToken.status;

    // Update status badge
    const badge   = $id('status-badge');
    const badgeTxt = $id('status-text');
    badge.className = 'status-badge ' + status;

    if (status === 'waiting') {
        badgeTxt.textContent = 'Waiting';

        // My position in the waiting list
        const myPos    = waitingList.findIndex(t => t.id === myTokenId) + 1;
        const peopleAhead = myPos - 1;

        $id('position-display').textContent = myPos > 0 ? '#' + myPos : '—';
        $id('ahead-display').textContent    = peopleAhead >= 0 ? peopleAhead : '—';

        // Show/hide sections
        show('now-serving-section');
        show('queue-stats');
        hide('counter-section');
        hide('your-turn-section');
        hide('done-section');

    } else if (status === 'serving') {
        badgeTxt.textContent = 'Being Served';

        // It's this customer's turn
        $id('position-display').textContent = '#1';
        $id('ahead-display').textContent    = '0';

        hide('now-serving-section');
        show('queue-stats');
        hide('counter-section');

        // Show your-turn alert
        if (myToken.assignedCounterName) {
            $id('your-turn-counter').textContent = `Please go to: ${myToken.assignedCounterName}`;
            show('counter-section');
            $id('counter-name-display').textContent = myToken.assignedCounterName;
        }
        show('your-turn-section');
        hide('done-section');

    } else if (status === 'done') {
        badgeTxt.textContent = 'Done';

        hide('now-serving-section');
        hide('queue-stats');
        hide('counter-section');
        hide('your-turn-section');
        show('done-section');

        // Stop listening — no more updates needed
        if (queueListener) {
            db.ref(`users/${orgId}/queue/${serviceId}`).off('value', queueListener);
        }
    }
}

// ── Cleanup on page leave ─────────────────────
window.addEventListener('beforeunload', () => {
    if (queueListener && orgId && serviceId) {
        db.ref(`users/${orgId}/queue/${serviceId}`).off('value', queueListener);
    }
});
