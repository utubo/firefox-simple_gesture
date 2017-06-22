(() => {
	'use strict';

	let exec = {
		newTab: function(tab) {
			browser.tabs.create({ active: true });
		}
		close: function(tab) {
			browser.tabs.remove(tab.id);
		},
		xxTab: function(tab, d) {
			browser.tabs.query({index: tab.index + d}).then(tabs => {
				if (tabs[0]) {
					browser.tabs.update(tabs[0].id, { active: true });
				}
			});
		},
		prevTab: function(tab) {
			exec.xxTab(tab, -1);
		},
		nextTab: function(tab) {
			exec.xxTab(tab, 1);
		},
	};

	browser.runtime.onMessage.addListener((msg, sender, res) => {
		let f = exec[msg];
		f && exec[msg](sender.tab);
	});

})();

