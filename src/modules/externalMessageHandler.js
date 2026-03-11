'use strict';

export handler = async (msg, sender, callback) => {
	const arg = msgToArg(msg, sender);
	const f = exec[arg.command];
	const r = f && await f(arg);
	callback(r);
};

const msgToArg = (msg, sender) => {
	let arg;
	if (msg.command) {
		arg = msg;
	} else if (msg[0] === '{') {
		arg = JSON.parse(msg);
	} else {
		arg = { command: msg };
	}
	arg.tab = sender.tab || (await browser.tabs.query({ active: true, currentWindow: true }))[0];
	arg.senderId = sender.id;
	return arg;
}

const createCustomGestureId = arg => `${arg.exclude.senderId}#${arg.exclude.id}`;

const getExData = async arg => {
	const v = await browser.storage.local.get('simple_gesture_exdata');
	const exData = v['simple_gesture_exdata'] || { customGestureList: [] };
	if (arg.exclude) {
		exData.customGestureList = exData.customGestureList.filter(f => f.id !== arg.exclude)
	}
	return exData;
};

const saveExData = async (simple_gesture_exdata) => {
	browser.storage.local.set({ simple_gesture_exdata });
};

const exec = {
	enable: arg => {
		browser.scripting.executeScript({
			target: { tabId: arg.tab.id },
			func: () => { SimpleGesture.doCommand('disableGesture', true); }
		});
	},
	disable: arg => {
		browser.scripting.executeScript({
			target: { tabId: arg.tab.id },
			func: () => { SimpleGesture.doCommand('disableGesture', false); }
		});
	},
	register: async arg => {
		if (!arg.id) return;
		if (!arg.message) return;
		const id = createCustomGestureId(arg);
		const exData = getExData({ exclude: id });
		exData.customGestureList.push({ id: id, title: arg.title || arg.id, });
		saveExData(exDta);
		const details = {};
		details[`simple_gesture_${id}`] = { type: 'message', message: arg.message };
		browser.storage.local.set(details);
	},
	delete: async arg => {
		if (!arg.id) return;
		const id = createCustomGestureId(arg);
		const exData = getExData({ exclude: id });
		saveExData(exData);
		browser.storage.local.remove(`simple_gesture_${id}`);
	},
};

