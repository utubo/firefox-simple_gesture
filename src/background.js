(() => {
	'use strict';

	const iniValue = async key => {
		try {
			const res = await browser.storage.local.get('simple_gesture');
			return res.simple_gesture[key] || null;
		} catch (e) {
			return null;
		}
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
		newTab: async tab => {
			const url = await iniValue('newTabUrl');
			browser.tabs.create({ active: true, url: url });
		},
		close: async tab => {
			let a = await iniValue('afterClose');
			switch (a) {
				case 'prevTab': await exec.prevTab(tab); break;
				case 'nextTab': await exec.nextTab(tab); break;
			}
			browser.tabs.remove(tab.id);
		},
		closeAll: async tab => {
			const tabs = await browser.tabs.query({});
			for (let i = tabs.length - 1; 0 <= i; i --) {
				browser.tabs.remove(tabs[i].id);
			}
		},
		closeOthers : async tab => {
			const tabs = await browser.tabs.query({});
			for (let i = tabs.length - 1; 0 <= i; i --) {
				if (tabs[i].id !== tab.id)
					browser.tabs.remove(tabs[i].id);
			}
		},
		showTab: async targetIndex => {
			const tabs = await browser.tabs.query({ index: targetIndex });
			if (tabs[0]) {
				browser.tabs.update(tabs[0].id, { active: true });
				return true;
			}
		},
		prevTab: async tab => {
			if (tab.index) {
				exec.showTab(tab.index - 1);
			} else {
				let all = await browser.tabs.query({});
				exec.showTab(all.length - 1);
			}
		},
		nextTab: async tab => {
			(await exec.showTab(tab.index + 1)) || exec.showTab(0);
		},
		toggleUserAgent: async tab => {
			if (userAgent) {
				userAgent = null;
				browser.webRequest.onBeforeSendHeaders.removeListener(rewriteUserAgentHeader);
				browser.tabs.reload(tab.id);
				return;
			}
			userAgent = (await iniValue('userAgent')) || navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux');
			browser.webRequest.onBeforeSendHeaders.addListener(
				rewriteUserAgentHeader,
				{ urls: [ '*://*/*' ] },
				[ "blocking", "requestHeaders" ]
			);
			browser.tabs.reload(tab.id);
		},
		openAddonSettings: tab => {
			browser.tabs.create({ active: true, url: 'options.html' });
		},
		customGesture: async (tab, id) => {
			const key = 'simple_gesture_' + id;
			const c = (await browser.storage.local.get(key))[key];
			if (c.url) {
				browser.tabs.create({ active: true, url: c.url });
				return;
			}
			if (c.script) {
				const userScript = `{
					SimpleGesture.target = document.getElementsByClassName('simple-gesture-target')[0];
					SimpleGesture.exit = v => { throw new Error('SimpleGestureExit'); };
					${c.script}
				}`;
				try {
					const result = await browser.tabs.executeScript({ code: userScript });
					const r = result && result[0];
					if (!r) return;
					if (!r.url) return;
					browser.tabs.create({
						url: r.url,
						active: (!('active' in r) || r.active)
						//openerTabId: tab.id // Firefox for Android does not support this.
					});
				} catch (e) {
					if (
						e.message !== 'SimpleGestureExit' &&
						e.message.indexOf('result is non-structured-clonable data') === -1 // Ignore invalid value.
					) {
						const msg = e.message.replace(/(['\\])/g, '\\$1');
						const code = `alert('${msg}');`; // TODO: Always e.lineNumber is 0.
						browser.tabs.executeScript({ code: code });
						return;
					}
				}
			}
		},
		reloadAllTabsIni: async () => {
			const tabs = await browser.tabs.query({});
			for (let tab of tabs) {
				browser.tabs.executeScript(tab.id, { code: 'SimpleGesture.loadIni();' });
			}
		}
	};

	browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
		const f = msg[0] === '$' ? exec.customGesture : exec[msg]; // '$' is custom-gesture prefix.
		if (sender.tab) {
			f(sender.tab, msg);
		} else {
			// Somtimes sender.tab is undefined.
			browser.tabs.query({ active: true, currentWindow: true }).then(tabs => { f(tabs[0], msg); });
		}
	});

})();

