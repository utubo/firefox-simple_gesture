(() => {
	'use strict';

	let exec = {
		newTab: tab => {
			browser.tabs.create({ active: true });
		},
		close: tab => {
			browser.tabs.remove(tab.id);
		},
		showTab: targetIndex => {
			browser.tabs.query({ index: targetIndex }).then(tabs => {
				if (tabs[0]) {
					browser.tabs.update(tabs[0].id, { active: true });
				}
			});
		},
		prevTab: tab => {
			exec.showTab(tab.index - 1);
		},
		nextTab: tab => {
			exec.showTab((tab.index || 0) + 1); // sometimes "tab.index" may be broken...
		}
	};

	browser.runtime.onMessage.addListener((msg, sender, res) => {
		let f = exec[msg];
		f && f(sender.tab);
	});

})();

