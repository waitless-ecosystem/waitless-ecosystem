if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();

function $(sel){ return document.querySelector(sel); }
function showMessage(msg, type){ const el = $('#message'); el.textContent = msg; el.className = 'message ' + type; }

function formatDateValue(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function getProfileField(profile, key) {
  return profile?.profile?.[key] || profile?.[key] || '';
}

async function checkApprovalStatus(user) {
  if (!user) {
    window.location.href = '../index.html';
    return;
  }

  try {
    const snap = await db.ref('users/' + user.uid).once('value');
    const profile = snap.val() || {};
      const nestedProfile = profile.profile || {};
    const role = profile.role || 'unknown';
    const email = profile.email || user.email || 'no-email';
      const organizationName = getProfileField(profile, 'name') || getProfileField(profile, 'organizationName') || profile.displayName || user.displayName || email;
      const contactNumber = getProfileField(profile, 'contactNumber') || 'N/A';
      const address = getProfileField(profile, 'address') || 'N/A';
      const registeredAt = profile.createdAt || nestedProfile.updatedAt || user.metadata.creationTime;

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
            <div class="status-label">Organization:</div>
            <div class="status-value">${organizationName}</div>
          </div>
        <div class="status-row">
          <div class="status-label">Email:</div>
          <div class="status-value">${email}</div>
        </div>
          <div class="status-row">
            <div class="status-label">Contact Number:</div>
            <div class="status-value">${contactNumber}</div>
          </div>
          <div class="status-row">
            <div class="status-label">Address:</div>
            <div class="status-value">${address}</div>
          </div>
        <div class="status-row">
          <div class="status-label">Account ID:</div>
          <div class="status-value">${user.uid.substring(0, 12)}...</div>
        </div>
        <div class="status-row">
          <div class="status-label">Member Since:</div>
            <div class="status-value">${formatDateValue(registeredAt)}</div>
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
