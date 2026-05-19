/**
 * Shared auth guard helpers for future plain-JS pages.
 * Existing pages keep their local guards to avoid changing behavior during the structure refactor.
 */
window.WaitlessAuthGuard = {
  requireUser(auth, redirectTo) {
    auth.onAuthStateChanged((user) => {
      if (!user) window.location.href = redirectTo;
    });
  }
};
