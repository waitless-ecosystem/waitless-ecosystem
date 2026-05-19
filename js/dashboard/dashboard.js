if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

function $(sel){ return document.querySelector(sel); }
function showMessage(msg, type){ const el = $('#message'); el.textContent = msg; el.className = 'message ' + type; }

async function checkApprovalStatus(user) {
  if (!user) {
    window.location.href = '../index.html';
    return;
  }

  try {
    const snap = await db.ref('users/' + user.uid).once('value');
    const profile = snap.val() || {};
    const role = profile.role || 'unknown';
    const email = profile.email || user.email || 'no-email';

    let statusBadge = 'Unknown';
    let statusClass = '';
    let canAccess = false;

    if (role === 'approved') {
      statusBadge = 'Approved';
      statusClass = 'badge-approved';
      canAccess = true;
    } else if (role === 'pending') {
      statusBadge = 'Pending Review';
      statusClass = 'badge-pending';
      canAccess = false;
    } else if (role === 'rejected') {
      statusBadge = 'Rejected';
      statusClass = 'badge-rejected';
      canAccess = false;
    }

    const statusEl = $('#status-info');
    statusEl.innerHTML = `
      <div class="status-badge ${statusClass}">${statusBadge}</div>
      <div class="status-content">
        <div class="status-row">
          <div class="status-label">Email:</div>
          <div class="status-value">${email}</div>
        </div>
        <div class="status-row">
          <div class="status-label">Account ID:</div>
          <div class="status-value">${user.uid.substring(0, 12)}...</div>
        </div>
        <div class="status-row">
          <div class="status-label">Member Since:</div>
          <div class="status-value">${new Date(user.metadata.creationTime).toLocaleDateString()}</div>
        </div>
      </div>
    `;

    const queueBtn = $('#back-queue');
    const signoutBtn = $('#signout');

    if (canAccess && queueBtn) {
      queueBtn.style.display = 'block';
      queueBtn.addEventListener('click', () => {
        window.location.href = 'queue-manager.html';
      });
    }

    if (signoutBtn) {
      signoutBtn.addEventListener('click', async () => {
        await auth.signOut();
        window.location.href = '../index.html';
      });
    }

  } catch (err) {
    showMessage('Error loading account status: ' + err.message, 'error');
  }
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '../index.html';
  } else {
    await checkApprovalStatus(user);
  }
});
