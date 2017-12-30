(() => {
	'use strict';

	const withIni = f => {
		browser.storage.local.get('simple_gesture').then(res => {
			f(res.simple_gesture  || {});
		}, reason => {
			f({});
		});
	};

	let userAgent = null;
	const rewriteUserAgentHeader = e => {
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

	const exec = {
		newTab: tab => {
			withIni(ini => {
				const url = ini.newTabUrl || null;
				browser.tabs.create({ active: true, url: url });
			});
		},
		close: tab => {
			browser.tabs.remove(tab.id);
		},
		closeAll: tab => {
			browser.tabs.query({}).then(tabs => {
				for (let i = tabs.length - 1; 0 <= i; i --) {
					browser.tabs.remove(tabs[i].id);
				}
			});
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
		},
		openNewTabIfUrl: url => {
			if ((typeof url) !== 'string') return false;
			if (!url.match(/^(https?|about|moz-extension):\/\//)) return false;
			browser.tabs.create({ active: true, url: url });
			return true;
		},
		customGesture: id => {
			let key = 'simple_gesture_' + id;
			browser.storage.local.get(key).then( res => {
				let c = res[key];
				if (c.url) {
					browser.tabs.create({ active: true, url: c.url });
				} else if (c.script) {
					const userScript = `{ const SimpleGesture = { target: document.getElementsByClassName('simple-gesture-target')[0]}; ${c.script} }`;
					browser.tabs.executeScript({ code: userScript }).then(result => {
						exec.openNewTabIfUrl(result[0]);
					});
				}
			});
		}
	};

	browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		if (msg[0] === '$') { // custom gesture prefix
			exec.customGesture(msg);
			return;
		}
		const f = exec[msg];
		if (sender.tab) {
			f(sender.tab);
		} else {
			// Somtimes sender.tab is undefined.
			browser.tabs.query({ active: true, currentWindow: true }).then(tabs => { f(tabs[0]); });
		}
	});

	// for old beta version. (TODO: delete this code.)
	browser.storage.local.get().then(res => {
		for (let key in res) {
			if (key.indexOf('$') === -1) continue;
			const c = res[key];
			if (c.url || c.script) continue;
			if ((typeof c) !== 'string') continue;
			if (c.match(/^(https?|about|moz-extension):\/\//)) {
				const w = {};
				w[key] = { type: 'url', url: c };
				browser.storage.local.set(w);
			} else {
				const w = {};
				w[key] = { type: 'script', script: c };
				browser.storage.local.set(w);
			}
		}
	});

})();

