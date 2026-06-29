(function () {
  function getRootPrefix() {
    const script = document.currentScript;
    if (script && script.src) {
      const url = new URL(script.src, window.location.href);
      return url.href.replace(/shared\/js\/index-ui\.js(?:\?.*)?$/, '');
    }
    return './';
  }

  function addGlobalTopbar() {
    if (document.querySelector('.wl-topbar')) return;
    const root = getRootPrefix();
    const topbar = document.createElement('header');
    topbar.className = 'wl-topbar waitless-global-topbar';
    topbar.innerHTML = `
      <a class="wl-brand" href="${root}index.html" aria-label="Waitless home">
        <img src="${root}images/new.png" alt="" />
        <span>Waitless</span>
      </a>
      <nav class="wl-topnav" aria-label="Primary">
        <a href="${root}index.html#how">How it works</a>
        <a href="${root}index.html#roles">Workspaces</a>
        <a href="${root}auth/login.html">Sign in</a>
      </nav>
    `;
    document.body.insertBefore(topbar, document.body.firstChild);
    document.body.classList.add('waitless-index-ui');
  }

  document.addEventListener('DOMContentLoaded', addGlobalTopbar);
})();
