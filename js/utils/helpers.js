function waitlessFormatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  try {
    return new Date(timestamp).toLocaleString();
  } catch (_) {
    return String(timestamp);
  }
}

function waitlessNormalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function waitlessIsBootstrapSuperadmin(user) {
  if (!user) return false;

  const bootstrapUid = typeof WAITLESS_BOOTSTRAP_SUPERADMIN_UID !== 'undefined'
    ? WAITLESS_BOOTSTRAP_SUPERADMIN_UID
    : '';
  const bootstrapEmail = typeof WAITLESS_BOOTSTRAP_SUPERADMIN_EMAIL !== 'undefined'
    ? waitlessNormalizeEmail(WAITLESS_BOOTSTRAP_SUPERADMIN_EMAIL)
    : '';

  return user.uid === bootstrapUid || waitlessNormalizeEmail(user.email) === bootstrapEmail;
}

async function waitlessHasSuperadminClaim(user) {
  if (!user || typeof user.getIdTokenResult !== 'function') return false;

  try {
    const tokenResult = await user.getIdTokenResult(true);
    return !!(tokenResult.claims && tokenResult.claims.superadmin === true);
  } catch (err) {
    console.warn('Unable to read superadmin claim:', err);
    return false;
  }
}

async function waitlessIsSuperadmin(user, profile = {}) {
  if (!user) return false;
  if (profile.role === 'superadmin') return true;
  if (waitlessIsBootstrapSuperadmin(user)) return true;
  return waitlessHasSuperadminClaim(user);
}

async function waitlessCanAccessOrganizationTools(user, profile = {}) {
  if (!user) return false;
  if (profile.role === 'approved' || profile.role === 'superadmin') return true;
  return waitlessIsSuperadmin(user, profile);
}
