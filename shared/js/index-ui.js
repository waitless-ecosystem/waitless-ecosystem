(function () {
  // 1. Initialize Theme Immediately to avoid theme flash on loading
  const savedTheme = localStorage.getItem('waitless-theme');
  const userPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (userPrefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  // 2. Resolve root prefix synchronously while document.currentScript is defined and active
  let rootPrefix = './';
  const script = document.currentScript;
  if (script && script.src) {
    const url = new URL(script.src, window.location.href);
    rootPrefix = url.href.replace(/shared\/js\/index-ui\.js(?:\?.*)?$/, '');
  }

  function addGlobalTopbar() {
    const isKiosk = window.location.pathname.indexOf('/kiosk/') !== -1;
    const isLogin = window.location.pathname.indexOf('login.html') !== -1;
    if (isKiosk || isLogin) {
      setupThemeToggle();
      return;
    }
    if (document.querySelector('.wl-topbar')) {
      setupThemeToggle();
      return;
    }
    const isCustomerPage = window.location.pathname.indexOf('/customer/') !== -1;
    const loginPath = isCustomerPage ? `${rootPrefix}customer/login.html` : `${rootPrefix}auth/login.html`;
    const topbar = document.createElement('header');
    topbar.className = 'wl-topbar waitless-global-topbar';
    topbar.innerHTML = `
      <a class="wl-brand" href="${rootPrefix}index.html" aria-label="Waitless home">
        <img src="${rootPrefix}images/new.png" alt="" />
        <span>Waitless</span>
      </a>
      <nav class="wl-topnav" aria-label="Primary">
        <a href="${rootPrefix}index.html#how">How it works</a>
        <a href="${rootPrefix}index.html#roles">Workspaces</a>
        <a href="${loginPath}">Sign in</a>
      </nav>
    `;
    document.body.insertBefore(topbar, document.body.firstChild);
    document.body.classList.add('waitless-index-ui');
    setupThemeToggle();
    setupAuthObserver(topbar);
  }

  function setupAuthObserver(topbar, retries = 10) {
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.apps && firebase.apps.length > 0) {
      try {
        firebase.auth().onAuthStateChanged((user) => {
          const signinLink = topbar.querySelector('a[href*="/login.html"]');
          if (signinLink) {
            if (user) {
              signinLink.style.display = 'none';
            } else {
              signinLink.style.display = '';
            }
          }
        });
      } catch (e) {
        // ignore
      }
    } else if (retries > 0) {
      setTimeout(() => setupAuthObserver(topbar, retries - 1), 200);
    }
  }

  function setupThemeToggle() {
    let toggleBtn = document.getElementById('waitless-theme-toggle');
    if (!toggleBtn) {
      toggleBtn = document.createElement('button');
      toggleBtn.id = 'waitless-theme-toggle';
      toggleBtn.className = 'waitless-theme-toggle';
      toggleBtn.type = 'button';
      toggleBtn.setAttribute('aria-label', 'Toggle theme');
      toggleBtn.innerHTML = `
        <svg class="theme-icon-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        <svg class="theme-icon-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
      `;

      // Always append to body to ensure a floating action button on all pages
      document.body.appendChild(toggleBtn);
    }

    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('waitless-theme', newTheme);
    });
  }

  document.addEventListener('DOMContentLoaded', addGlobalTopbar);
})();
