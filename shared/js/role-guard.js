(function (global) {
  const DEFAULT_ROUTES = {
    home: '/index.html',
    login: '/auth/login.html',
    pending: '/auth/pending-approval.html',
    business: '/business/dashboard.html',
    staff: '/staff/counter.html',
    kiosk: '/kiosk/interface.html',
    admin: '/admin/dashboard.html',
    customer: '/customer/index.html'
  };

  function normalizeRole(profile) {
    const role = String(profile?.role || '').toLowerCase();
    if (role === 'superadmin') return 'admin';
    if (role === 'approved') return 'business';
    if (role === 'staff') return 'staff';
    if (role === 'kiosk') return 'kiosk';
    if (role === 'customer') return 'customer';
    if (role === 'pending') return 'pending';
    return role || 'unknown';
  }

  function routeForRole(role, routes = DEFAULT_ROUTES) {
    return routes[role] || routes.login;
  }

  async function hasSuperadminClaim(user) {
    if (!user || typeof user.getIdTokenResult !== 'function') return false;
    try {
      const token = await user.getIdTokenResult(true);
      return !!(token.claims && token.claims.superadmin === true);
    } catch (_) {
      return false;
    }
  }

  async function getCurrentProfile(firebaseAuth, firebaseDb) {
    const user = firebaseAuth?.currentUser;
    if (!user || !firebaseDb) return { user, profile: null, role: 'unknown' };
    const snap = await firebaseDb.ref(`users/${user.uid}`).once('value');
    const profile = snap.val() || {};
    if (await hasSuperadminClaim(user)) {
      return { user, profile, role: 'admin' };
    }
    return { user, profile, role: normalizeRole(profile) };
  }

  async function requireRole(options) {
    const opts = options || {};
    const allowed = Array.isArray(opts.allowed) ? opts.allowed : [];
    const routes = { ...DEFAULT_ROUTES, ...(opts.routes || {}) };
    const firebaseAuth = opts.auth || global.firebase?.auth?.();
    const firebaseDb = opts.db || global.firebase?.database?.();

    if (!firebaseAuth || !firebaseDb) return false;

    return new Promise((resolve) => {
      firebaseAuth.onAuthStateChanged(async (user) => {
        if (!user) {
          global.location.href = routes.login;
          resolve(false);
          return;
        }

        const state = await getCurrentProfile(firebaseAuth, firebaseDb);
        if (state.role === 'pending') {
          global.location.href = routes.pending;
          resolve(false);
          return;
        }

        if (allowed.length && !allowed.includes(state.role)) {
          global.location.href = routeForRole(state.role, routes);
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  global.WaitlessRoleGuard = {
    DEFAULT_ROUTES,
    normalizeRole,
    routeForRole,
    getCurrentProfile,
    hasSuperadminClaim,
    requireRole
  };
})(window);
