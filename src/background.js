if (typeof browser === 'undefined') {
	const storageOrg = chrome.storage;
	self.browser = chrome;
	chrome.storage = {
		local: {
			get: key => new Promise(resolve => { storageOrg.local.get(key, resolve); }),
		},
		session: {
			get: key => new Promise(resolve => { storageOrg.session.get(key, resolve); }),
			set: obj => new Promise(resolve => { storageOrg.session.set(obj, resolve); }),
		}
	}
}
(async () => {
	'use strict';

	const iniValue = async key => {
		try {
			const res = await browser.storage.local.get('simple_gesture');
			return res.simple_gesture[key] || null;
		} catch (e) {
			return null;
		}
	};

	const showTextToast = (tabId, msg) => {
		browser.scripting.executeScript({
			target: { tabId: tabId },
			args: [msg],
			func: msg => SimpleGesture.showTextToast(msg)
		});
	};

	// For suspended tabs
	let iniTimestamp = await browser.storage.session.get('iniTimestamp')?.iniTimestamp || Date.now();
	const reloadIni = tabId => {
		browser.scripting.executeScript({
			target: { tabId: tabId },
			args: [iniTimestamp],
			func: (iniTimestamp) => SimpleGesture.loadIni(iniTimestamp)
		});
	};
	browser.tabs.onActivated.addListener(e => {
		reloadIni(e.tabId);
	});

	// UserAgent switcher
	let userAgent = await browser.storage.session.get('userAgent')?.userAgent || null;
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

	// For reopen closed tabs without browser.sessions.
	let allTabs = null;
	let closedTabs = null;
	if (!browser.sessions) {
		const MAX_CLOSED_TABS = 100;
		allTabs = new Map();
		closedTabs = await browser.storage.session.get('closedTabs')?.closedTabs || [];
		browser.tabs.onUpdated.addListener((id, _, tab) => { allTabs.set(id, tab.url); });
		browser.tabs.onRemoved.addListener(async id => {
			const url = allTabs.get(id);
			allTabs.delete(id);
			if (!url) return;
			if (url.startsWith('about:')) return;
			const index = closedTabs.indexOf(url);
			if (index !== -1) {
				closedTabs.splice(index, 1);
			}
			if (MAX_CLOSED_TABS <= closedTabs.length) {
				closedTabs.splice(closedTabs.length - MAX_CLOSED_TABS);
			}
			closedTabs.push(url);
			browser.storage.session.set({ 'closedTabs': closedTabs });
		});
	}

	const decorateUrl = arg => (arg.discarded ? 'modules/discarded.html?' : '') + arg.url;

	// Gestures
	const exec = {
		openLinkInNewTab: async arg => {
			browser.tabs.create({ active: true, url: arg.url });
		},
		openLinkInBackground: async arg => {
			// Firefox for Android doesn't support `openerTabId`, `discarded` and `active`.
			arg.discarded = await iniValue('openLinkInBackgroundDiscarded');
			const url = decorateUrl(arg);
			const newTab = await browser.tabs.create({ active: false, url: url });
			await browser.tabs.update(arg.tab.id, { active: true });
			// show toast
			const pos = await iniValue('toastForNewTabPosition') || '';
			if (pos === 'none') return;
			browser.scripting.executeScript({
				target: { tabId: arg.tab.id },
				args: [newTab.id, pos],
				func: (newTabId, pos) => 
					SimpleGesture.mod('toastForNewTab', m => m.show(newTabId, pos))
			});
		},
		newTab: async () => {
			const url = await iniValue('newTabUrl');
			browser.tabs.create({ active: true, url: url });
		},
		close: async arg => {
			let a = await iniValue('afterClose');
			switch (a) {
				case 'prevTab': await exec.prevTab(arg); break;
				case 'nextTab': await exec.nextTab(arg); break;
			}
			browser.tabs.remove(arg.tab.id);
		},
		closeIf: async filter => {
			const tabs = await browser.tabs.query({});
			const ids = [];
			for (let tab of tabs)
				if (filter(tab)) ids.push(tab.id);
			if (ids[0])
				browser.tabs.remove(ids);
		},
		closeAll: async () => {
			exec.closeIf(() => true);
		},
		closeOthers: async arg => {
			exec.closeIf(tab => tab.id !== arg.tab.id);
		},
		closeSameUrl: async arg => {
			const matchType = arg.matchType || await iniValue('closeSameUrlMatchType');
			if (matchType === 'domain') {
				const domain = arg.tab.url.replace(/^([^/]+:\/\/[^/?#]+).*/, '$1');
				exec.closeIf(tab => tab.url.startsWith(domain));
				return;
			}
			if (matchType === 'contextRoot') {
				const contextRoot = arg.tab.url.replace(/^([^/]+:\/\/[^/?#]+).*/, '$1');
				exec.closeIf(tab => tab.url.startsWith(contextRoot));
				return;
			}
			exec.closeIf(tab => tab.url === arg.tab.url);
		},
		reopen: async arg => {
			if (browser.sessions) {
				// for Firefox for Desktop
				const session = (await browser.sessions.getRecentlyClosed({ maxResults: 1 }))[0];
				if (session) {
					browser.sessions.restore(session.tab ? session.tab.sessionId : session.window.sessionId);
					return;
				}
			} else {
				// for Firefox for Android
				const url = closedTabs.pop();
				if (url) {
					browser.tabs.create({ active: true, url: url });
					return;
				}
			}
			showTextToast(arg.tab.id, browser.i18n.getMessage('No recently closed tabs'));
		},
		duplicateTab: async arg => {
			if (browser.tabs.duplicate) {
				browser.tabs.duplicate(arg.tab.id);
			} else {
				browser.tabs.create({ active: true, url: arg.tab.url });
			}
		},
		prevTab: async arg => {
			for (let i = arg.tab.index - 1; 0 <= i; i--) {
				const tab = (await browser.tabs.query({ index: i }))[0];
				if (!tab || tab.hidden) continue;
				browser.tabs.update(tab.id, { active: true });
				return;
			}
			exec.lastTab();
		},
		lastTab: async () => {
			const all = await browser.tabs.query({});
			let last = { index: -1 };
			for (let tab of all) {
				if (tab.hidden || tab.index < last.index) continue;
				last = tab;
			}
			browser.tabs.update(last.id, { active: true });
		},
		nextTab: async arg => {
			for (let i = arg.tab.index + 1; true; i++) {
				const tab = (await browser.tabs.query({ index: i }))[0];
				if (!tab) break;
				if (tab.hidden) continue;
				browser.tabs.update(tab.id, { active: true });
				return;
			}
			// show 1st tab that is not hidden.
			if (arg.tab.index !== -1) exec.nextTab({ tab: { index: -1 } });
		},
		showTab: async arg => {
			browser.tabs.update(arg.tabId, { active: true });
		},
		toggleUserAgent: async arg => {
			if (userAgent && !arg.force || arg.userAgent === null) {
				userAgent = null;
				browser.webRequest.onBeforeSendHeaders.removeListener(rewriteUserAgentHeader);
			} else {
				userAgent =
					arg.userAgent ||
					(await iniValue('userAgent')) ||
					navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux');
				browser.webRequest.onBeforeSendHeaders.addListener(
					rewriteUserAgentHeader,
					{ urls: [ '*://*/*' ] },
					[ "blocking", "requestHeaders" ]
				);
			}
			browser.storage.session.set({ userAgent });
			await browser.tabs.reload(arg.tab.id);
			showTextToast(arg.tab.id, `${browser.i18n.getMessage('toggleUserAgent')}: ${userAgent ? 'ON' : 'OFF'}`);
		},
		openAddonSettings: () => {
			browser.tabs.create({ active: true, url: 'options.html' });
		},
		reloadAllTabsIni: async () => {
			iniTimestamp = Date.now();
			browser.storage.session.set({ iniTimestamp });
			const tabs = await browser.tabs.query({ active: true });
			if (tabs[0]) {
				reloadIni(tabs[0].id);
			}
			// DO NOT SEND MESSAGE TOO MANY TABS.
			// const tabs = await browser.tabs.query({});
			// for (let tab of tabs) {
			// 	browser.scripting.executeScript({
			// 		target: tab.id,
			// 		func: () => SimpleGesture.loadIni()
			// 	});
			// }
		},
		customGesture: async arg => {
			const key = 'simple_gesture_' + arg.command;
			const c = (await browser.storage.local.get(key))[key];
			if (c.url) {
				browser.tabs.create({ active: true, url: c.url });
				return;
			}
			if (c.script) {
				exec.executeScript({ tabId: arg.tab.id, code: c.script });
			}
			if (c.message) {
				const esc = s => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`';
				const id = esc(c.extensionId);
				let msg = esc(c.message);
				if (c.messageType === 'json') {
					msg = `JSON.parse(${msg})`;
				}
				browser.scripting.executeScript({
					target: { tabId: arg.tab.id },
					args: [id, msg],
					func: (id, msg) =>
						browser.runtime.sendMessage(id, msg)
							.catch(e => { alert(e.message); })
				});
			}
		},
		open: async arg => {
			const active = !('active' in arg) || !!arg.active;
			const code = arg.code || arg.script;
			// open in new tab
			if (arg.inNewTab || !('inNewTab' in arg)) {
				// Firefox for Android doesn't support `openerTabId`, `discarded` and `active`.
				let tab = await browser.tabs.create({ active: active, url: decorateUrl(arg) });
				if (!active) {
					browser.tabs.update(arg.tab.id, { active: true });
				}
				// execute the additional script.
				code && exec.executeScript({ tabId: tab.id, code: code});
				return;
			}
			// open in current tab
			if (code) {
				const removeListener = () => { browser.tabs.onUpdated.removeListener(f); };
				const timer = setTimeout(removeListener, 5000); // when the tab doesn't complete.
				const f = (tabId, changeInfo) => {
					if (changeInfo.status !== 'complete' || tabId !== arg.tab.id) return;
					clearTimeout(timer);
					removeListener();
					exec.executeScript({ tabId: tabId, code: code});
				};
				browser.tabs.onUpdated.addListener(f);// Firefox for Android doesn't support extraParameter.tabId.
			}
			browser.tabs.update({ url: arg.url });
		},
		executeScript: async arg => {
			const userScript = `{
				SimpleGesture.target = document.getElementsByClassName('simple-gesture-target')[0];
				SimpleGesture.exit = v => { throw new Error('SimpleGestureExit'); };
				SimpleGesture.open = (url, options) => {
					let msg = Object.assign({ command: 'open', url: url }, options);
					browser.runtime.sendMessage(JSON.stringify(msg));
				};
				${arg.code || arg.script}
			}`;
			// TODO: Migrate to Manifest V3.
			browser.tabs.executeScript(arg.tabId, { code: userScript })
			.then(result => { result && result[0] && result[0].url && exec.open(result[0]); })
			.catch (e => {
				if (e.message === 'SimpleGestureExit') return;
				if (e.message.indexOf('result is non-structured-clonable data') !== -1) return;// Ignore the invalid return value.
				const msg = e.message.replace(/(['\\])/g, '\\$1');
				browser.tabs.executeScript({
					target: { tabId: arg.tabId },
					args: [msg],
					func: (msg) => alert(msg),
				});
			});
		}
	};

	browser.runtime.onMessage.addListener(async (command, sender) => {
		let arg;
		if (command[0] === '{') {
			arg = JSON.parse(command);
			command = arg.command;
		} else {
			arg = { command: command };
		}
		arg.tab = sender.tab || (await browser.tabs.query({ active: true, currentWindow: true }))[0]; // Somtimes sender.tab is undefined.
		const f = command[0] === '$' ? exec.customGesture : exec[command]; // '$' is custom-gesture prefix.
		f(arg);
	});

})();

