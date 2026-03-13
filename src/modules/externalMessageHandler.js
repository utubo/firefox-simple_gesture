'use strict';

export const handler = async (msg, sender, callback) => {
	const arg = await msgToArg(msg, sender);
	const f = exec[arg.command];
	const r = f && await f(arg);
	callback(r);
};

const msgToArg = async (msg, sender) => {
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

const createCustomGestureId = arg => `$${arg.senderId}#${arg.excludeId}`;

const getExData = async arg => {
	const v = await browser.storage.local.get('simple_gesture_exdata');
	const exData = v['simple_gesture_exdata'] || {};
	exData.customGestureList = exData.customGestureList ?? [];
	if (arg.excludeId) {
		exData.customGestureList = exData.customGestureList.filter(f => f.id !== arg.excludeId)
	}
	return exData;
};

const saveExData = async (simple_gesture_exdata) => {
	browser.storage.local.set({ simple_gesture_exdata });
};

const exec = {
	enable(arg) {
		browser.scripting.executeScript({
			target: { tabId: arg.tab.id },
			func: () => { SimpleGesture.doCommand('disableGesture', true); }
		});
	},
	disable(arg) {
		browser.scripting.executeScript({
			target: { tabId: arg.tab.id },
			func: () => { SimpleGesture.doCommand('disableGesture', false); }
		});
	},
	async register(arg) {
		if (!arg.id) return;
		const id = createCustomGestureId(arg);
		const exData = await getExData({ excludeId: id });
		exData.customGestureList.push({ id: id, title: arg.title || arg.id, });
		await saveExData(exData);
		const details = {};
		details[`simple_gesture_${id}`] = {
			type: 'message',
			extensionId: arg.senderId,
			message: arg.message || arg.id,
			messageType: 'string'
		};
		await browser.storage.local.set(details);
	},
	async delete(arg) {
		if (!arg.id) return;
		const id = createCustomGestureId(arg);
		const exData = await getExData({ excludeId: id });
		await saveExData(exData);
		await browser.storage.local.remove(`simple_gesture_${id}`);
	},
};

