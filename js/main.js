document.addEventListener('DOMContentLoaded', () => {
	const openHelp = document.getElementById('openHelp');
	const closeHelp = document.getElementById('closeHelp');
	const helpPanel = document.getElementById('helpPanel');

	if (!openHelp || !closeHelp || !helpPanel) {
		return;
	}

	const setPanelOpen = (isOpen) => {
		helpPanel.classList.toggle('open', isOpen);
		helpPanel.setAttribute('aria-hidden', String(!isOpen));
	};

	openHelp.addEventListener('click', () => setPanelOpen(true));
	closeHelp.addEventListener('click', () => setPanelOpen(false));

	const faqItems = document.querySelectorAll('.help-panel .faq-item');
	faqItems.forEach((item) => {
		item.addEventListener('toggle', () => {
			if (!item.open) {
				return;
			}

			faqItems.forEach((otherItem) => {
				if (otherItem !== item) {
					otherItem.removeAttribute('open');
				}
			});
		});
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && helpPanel.classList.contains('open')) {
			setPanelOpen(false);
		}
	});
});
