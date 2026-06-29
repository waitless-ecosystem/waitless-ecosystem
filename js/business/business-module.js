(function () {
  const MODULES = {
    queue: { label: 'Live Queue', href: 'queue.html' },
    services: { label: 'Services', href: 'services.html' },
    counters: { label: 'Counters', href: 'counters.html' },
    assignments: { label: 'Counters', href: 'counters.html' },
    'online-bookings': { label: 'Online Bookings', href: 'bookings.html' },
    'open-hours': { label: 'Settings', href: 'settings.html' },
    customize: { label: 'Settings', href: 'settings.html' },
    reports: { label: 'Reports', href: 'reports.html' },
    'scheduled-services': { label: 'Services', href: 'services.html' }
  };

  const PAGE_TITLES = {
    queue: 'Live Queue',
    services: 'Services',
    counters: 'Counters',
    bookings: 'Online Bookings',
    reports: 'Reports',
    settings: 'Settings'
  };

  function activateTab(tabName) {
    document.querySelectorAll('.qm-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.qm-content').forEach((panel) => {
      panel.classList.toggle('active', panel.id === tabName);
    });

    if (tabName === 'reports' && typeof initializeCharts === 'function') {
      setTimeout(() => initializeCharts(window.currentCounters || {}, window.currentServices || {}, window.currentAssignments || {}), 100);
    }
  }

  function configurePageTitle(pageKey) {
    const title = PAGE_TITLES[pageKey] || 'Queue Manager';
    document.title = `Waitless — ${title}`;
    const heading = document.querySelector('.brand h1');
    if (heading) heading.textContent = title;
  }

  function configureBusinessNav() {
    document.querySelectorAll('.qm-tab').forEach((tab) => {
      const target = MODULES[tab.dataset.tab];
      if (!target) return;

      tab.addEventListener('click', (event) => {
        if (window.WAITLESS_BUSINESS_PAGE_ALLOW_TABS) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (window.location.pathname.endsWith('/' + target.href)) {
          activateTab(tab.dataset.tab);
        } else {
          window.location.href = target.href;
        }
      }, true);
    });
  }

  function configurePageModules() {
    const pageKey = document.body.dataset.businessPage || 'queue';
    const initialTab = document.body.dataset.initialTab || pageKey;
    configurePageTitle(pageKey);
    configureBusinessNav();
    activateTab(initialTab);
  }

  document.addEventListener('DOMContentLoaded', configurePageModules);
})();
