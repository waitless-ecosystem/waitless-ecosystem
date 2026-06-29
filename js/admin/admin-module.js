(function () {
  function setAdminPage() {
    const page = document.body.dataset.adminPage || 'dashboard';
    const titleMap = {
      dashboard: 'Admin Dashboard',
      approvals: 'Pending Approvals',
      organizations: 'Organizations'
    };

    const heading = document.querySelector('.admin-brand h1');
    if (heading && titleMap[page]) heading.textContent = titleMap[page];
    document.title = `Waitless — ${titleMap[page] || 'Admin'}`;

    if (page === 'approvals') {
      const filter = document.getElementById('request-filter-select');
      if (filter) {
        filter.value = 'pending';
        filter.dispatchEvent(new Event('change'));
      }
      document.querySelector('.admin-requests-panel')?.scrollIntoView({ block: 'start' });
    }

    if (page === 'organizations') {
      document.querySelector('.admin-orgs-panel')?.scrollIntoView({ block: 'start' });
    }
  }

  window.addEventListener('load', () => setTimeout(setAdminPage, 250));
})();
