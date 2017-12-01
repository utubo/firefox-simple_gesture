(() => {
	'use strict';

	let withIni = f => {
		browser.storage.local.get('simple_gesture').then(res => {
			f(res.simple_gesture  || {});
		}, reason => {
			f({});
		});
	};

	let userAgent = null;
	let rewriteUserAgentHeader = e => {
		if (userAgent) {
			for (let header of e.requestHeaders) {
				if (header.name.toLowerCase() === "user-agent") {
					header.value = userAgent;
					break;
				}
			}
		}
		return { requestHeaders: e.requestHeaders };
	};

	let exec = {
		newTab: tab => {
			withIni(ini => {
				let url = ini.newTabUrl || null;
				browser.tabs.create({ active: true, url: url });
			});
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
			exec.showTab(tab.index + 1);
		},
		toggleUserAgent: tab => {
			if (userAgent) {
				userAgent = null;
				browser.webRequest.onBeforeSendHeaders.removeListener(rewriteUserAgentHeader);
				browser.tabs.reload(tab.id);
				return;
			}
			withIni(ini => {
				userAgent = ini.userAgent || navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux');
				browser.webRequest.onBeforeSendHeaders.addListener(
					rewriteUserAgentHeader,
					{ urls: [ '*://*/*' ] },
					[ "blocking", "requestHeaders" ]
				);
				browser.tabs.reload(tab.id);
			});
		}
	};

	browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		let f = exec[msg];
		if (!f) return;
		if (sender.tab) {
			f(sender.tab);
		} else {
			// Somtimes sender.tab is undefined.
			browser.tabs.query({ active: true }).then(tabs => { f(tabs[0]); });
		}
	});

})();

