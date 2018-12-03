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
		newTab: async arg => {
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
		closeAll: async arg => {
			const tabs = await browser.tabs.query({});
			for (let i = tabs.length - 1; 0 <= i; i --) {
				browser.tabs.remove(tabs[i].id);
			}
		},
		closeOthers : async arg => {
			const tabs = await browser.tabs.query({});
			for (let i = tabs.length - 1; 0 <= i; i --) {
				if (tabs[i].id !== arg.tab.id)
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
		prevTab: async arg => {
			if (arg.tab.index) {
				exec.showTab(arg.tab.index - 1);
			} else {
				let all = await browser.tabs.query({});
				exec.showTab(all.length - 1);
			}
		},
		nextTab: async arg => {
			(await exec.showTab(arg.tab.index + 1)) || exec.showTab(0);
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
			browser.tabs.reload(arg.tab.id);
		},
		openAddonSettings: arg => {
			browser.tabs.create({ active: true, url: 'options.html' });
		},
		reloadAllTabsIni: async () => {
			const tabs = await browser.tabs.query({});
			for (let tab of tabs) {
				browser.tabs.executeScript(tab.id, { code: 'SimpleGesture.loadIni();' });
			}
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
		},
		open: async arg => {
			const active = !('active' in arg) || !!arg.active;
			const code = arg.code || arg.script;
			// open in new tab
			if (arg.inNewTab || !('inNewTab' in arg)) {
				let tab = await browser.tabs.create({ active: active, url: arg.url });// Firefox for Android doesn't support openerTabId.
				code && exec.executeScript({ tabId: tab.id, code: code});
				return;
			}
			// open in current tab
			if (code) {
				const removeListener = () => { browser.tabs.onUpdated.removeListener(f); };
				const timer = setTimeout(removeListener, 5000); // when the tab doesn't complete.
				const f = (tabId, changeInfo, tab) => {
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
			try {
				const result = await browser.tabs.executeScript(arg.tabId, { code: userScript });
				result && result[0] && result[0].url && exec.open(result[0]);
			} catch (e) {
				if (e.message === 'SimpleGestureExit') return;
				if (e.message.indexOf('result is non-structured-clonable data') !== -1) return;// Ignore the invalid return value.
				const msg = e.message.replace(/(['\\])/g, '\\$1');
				const code = `alert('${msg}');`; // TODO: Always e.lineNumber is 0.
				browser.tabs.executeScript({ code: code });
			}
		}
	};

	browser.runtime.onMessage.addListener(async (command, sender, sendResponse) => {
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

