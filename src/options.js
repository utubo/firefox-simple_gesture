'use strict';

// const -------------
const manifest = browser.runtime.getManifest()
const CUSTOM_GESTURE_PREFIX = '$';
const INSTEAD_OF_EMPTY = {
	userAgent: navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux'),
	noGesture: ' ',
	defaultTitle: 'Custom Gesture',
	toastForeground: '#ffffff',
	toastBackground: '#21a1de99',
	toastMinStroke: 2,
	interval: 0,
	touchHoldMsec: 0,
};
const TIMERS = {};
const MAX_LENGTH = SimpleGesture.MAX_LENGTH;
SimpleGesture.MAX_LENGTH += 3; // margin of cancel to input.
const NOP = () => {};
const SHOW_TAP_HOLD_DELAY = 1000;
const TAP_HOLD_MSEC_DEFAULT = 1200;

// fields ------------
let gestureNames = [];
let target = null;
let minX;
let maxX;
let minY;
let maxY;
let startTime = null;
let exData = { customGestureList: [] };

// utils -------------
const wantsClick = e => {
	return ['INPUT', 'SELECT', 'BUTTON', 'LABEL'].includes(e?.target?.tagName);
};

const timeout = {
	backup: 0,
	disable() {
		if (SimpleGesture.ini.timeout) {
			timeout.backup = SimpleGesture.ini.timeout;
			SimpleGesture.ini.timeout = 0;
		}
	},
	restore() {
		if (timeout.backup) {
			SimpleGesture.ini.timeout = timeout.backup;
		}
	},
};

const safePreventDefault = e => {
	try {
		if (e?.cancelable) {
			e.preventDefault();
		}
	} catch {
		// nop
	}
}

// utils for Simple gesture
const reloadAllTabsIni = () => {
	browser.runtime.sendMessage('reloadAllTabsIni');
	SimpleGesture.loadIni();
};

const findCustomGesture = id => exData.customGestureList.find(c => c.id === id);

const toGestureObj = s => {
	let g = {
		startPosition: '',
		fingers: '',
		arrows: [],
	}
	if (!s) return g;
	const a = s.split(':');
	if (a[2]) {
		g.startPosition = a[0];
		g.fingers = a[1];
		g.arrows = a[2];
	} else if (!a[1]) {
		g.arrows = s;
	} else if (a[0].match(/[WELRTB]/)) {
		g.startPosition = a[0];
		g.arrows = a[1];
	} else {
		g.fingers = a[0];
		g.arrows = a[1];
	}
	g.startPosition += g.startPosition ? ':' : '';
	g.fingers += g.fingers ? ':' : '';
	g.arrows = g.arrows.split('-');
	return g;
};

const fromGestureObj = g => `${g.startPosition || ''}${g.fingers || ''}${(g.arrows || []).slice(0, MAX_LENGTH).join('-')}`;

// DOM objects --------------
const $gestureTemplate = byClass($templates, 'gesture-item');
const $buttonsTamplate = byClass($templates, 'custom-gesture-buttons');
const $inputedGesture = byId('inputedGesture');
const $inputedFingers = byId('inputedFingers');
const $dupName = byId('dupName');
const $cancelInputGesture = byId('cancelInputGesture');
const $customGestureList = byId('customGestureList');
const $customGestureDlgContainer = byId('customGestureDlgContainer');
const $customGestureTitle = byId('customGestureTitle');
const $customGestureType = byId('customGestureType');
const $customGestureUrl = byId('customGestureUrl');
const $customGestureScript = byId('customGestureScript');
const $userAgentStatus = byId('userAgentStatus');
const $timeout = byId('timeout');
const $strokeSize = byId('strokeSize');
const $preventPullToRefresh = byId('preventPullToRefresh');
const $touchHoldMsec = byId('touchHoldMsec');
const $startPosition = byId('startPosition');
const $gestureArea= byClass(document, 'gesture-area');

// edit U-D-L-R ------
const updateGestureLabel = (arrowsLabel, addnlLabel, g) => {
	if (g.arrows.length) {
		SimpleGesture.drawArrows(g.arrows, arrowsLabel);
	} else {
		arrowsLabel.textContent = INSTEAD_OF_EMPTY.noGesture;
	}
	const addnl = SimpleGesture.getAddnlText(g.startPosition, g.fingers);
	addnlLabel.textContent = addnl;
	toggleClass(!addnl, 'hide', addnlLabel);
};
const updateGestureItem = (label, gesture) => {
	const note = byClass(label.parentNode, 'arrows-note');
	const g = toGestureObj(gesture);
	updateGestureLabel(label, note, g);
	toggleClass(!g.arrows.length, 'arrows-na', label);
	label.setAttribute('data-gesture', gesture || '');
};

const CLEAR_GESTURE = 'n/a'; // magic number
const updateGesture = (gestureObj) => {
	if (gestureObj.arrows.length) {
		// make key. e.g.) `T:2:U-D`
		const key = fromGestureObj(gestureObj);
		const swaped = {};
		for (const [k, v] of Object.entries(SimpleGesture.ini.gestures)) {
			if (v === target.name) {
				// remove old key
				delete SimpleGesture.ini.gestures[k];
			} else if (k !== key) {
				// for label
				swaped[v] = k;
			}
			// register maxFingers
			const g = toGestureObj(k);
			if (SimpleGesture.ini.maxFingers < g.fingers) {
				SimpleGesture.ini.maxFingers = g.fingers;
			}
		}
		// register
		if (key !== CLEAR_GESTURE) {
			SimpleGesture.ini.gestures[key] = target.name;
			swaped[target.name] = key;
		}
		saveIni();
		for (const name of gestureNames) {
			updateGestureItem(byId(`${name}_arrows`), swaped[name]);
		}
	}
	toggleDoubleTapNote();
};

const toggleDoubleTapNote = () => {
	toggleClass(
		!SimpleGesture.isDelaySingleTap() || SimpleGesture.ini.delaySingleTap,
		'hide',
		byId('doubleTapNote')
	);
};

dlgs.gestureDlg = {
	FREE_FOR_EDIT: 999,
	onShow(id) {
		target = { name: id.replace(/_[^_]+$/, '') };
		target.caption = byId(`${target.name}_caption`);
		target.arrows = byId(`${target.name}_arrows`);
		editStart(target.arrows);
		byId('editTarget').textContent = target.caption.textContent;
		$startPosition.selectedIndex = 0;
		const g = toGestureObj(target.arrows.getAttribute('data-gesture'));
		$startPosition.value = g.startPosition;
		dlgs.gestureDlg.updateLabel(g);
		toggleClass(false, 'dup', $inputedGesture, $inputedFingers);
		toggleClass(false, 'canceled', $inputedGesture);
		toggleClass(false, 'hover', $cancelInputGesture);
		$dupName.textContent = '';
		$preventPullToRefresh.scrollTop = 1000;
		$preventPullToRefresh.scrollLeft = 1000;
		dlgs.gestureDlg.backup = SimpleGesture.ini.maxFingers;
		SimpleGesture.ini.maxFingers = dlgs.gestureDlg.FREE_FOR_EDIT;
	},
	onHide() {
		timeout.restore();
		if (SimpleGesture.ini.maxFingers === dlgs.gestureDlg.FREE_FOR_EDIT) {
			SimpleGesture.ini.maxFingers = dlgs.gestureDlg.backup;
		}
		if (!target) return;
		editEnd(target.arrows);
		target = null;
	},
	updateLabel(g) {
		$gestureArea.setAttribute('data-startPosition', $startPosition.value);
		if (!g) return;
		updateGestureLabel(
			$inputedGesture,
			$inputedFingers,
			{ arrows: g.arrows, fingers: g.fingers, startPosition: '' }
		);
	},
	getGesture(g) {
		return fromGestureObj({
			arrows: g.arrows,
			startPosition: $startPosition.value,
			fingers: g.fingers,
		});
	},
};

const getGesture = name => {
	for (const g in SimpleGesture.ini.gestures) {
		if (SimpleGesture.ini.gestures[g] === name) return g;
	}
};

const createGestureItem = (name, isExperimental = false) => {
	const item = $gestureTemplate.cloneNode(true);
	item.id = `${name}_item`;
	const label = byClass(item, 'arrows');
	label.id = `${name}_arrows`;
	updateGestureItem(label, getGesture(name));
	const caption = byClass(item, 'gesture-caption');
	caption.id = `${name}_caption`;
	caption.textContent = name;
	if (name[0] === CUSTOM_GESTURE_PREFIX) {
		const b = $buttonsTamplate.cloneNode(true);
		byClass(b, 'custom-gesture-edit').setAttribute('data-targetId', name);
		byClass(b, 'custom-gesture-delete').setAttribute('data-targetId', name);
		item.appendChild(b);
	}
	if (isExperimental) {
		item.classList.add('experimental');
		caption.classList.add('icon-flask');
	}
	return item;
};

const setupGestureList = () => {
	gestureNames = [];
	for (const list of allByClass('gesture-list')) {
		const gestures = list.getAttribute('data-gestures');
		if (!gestures) continue;
		for (const nameAndOpt of gestures.split(/\s+/)) {
			if (!nameAndOpt) continue;
			const name = nameAndOpt.replace(/!$/, '');
			const isExperimental = nameAndOpt.match(/!$/);
			list.appendChild(createGestureItem(name, isExperimental));
			gestureNames.push(name);
		}
	}
	for (const c of exData.customGestureList) {
		$customGestureList.appendChild(createGestureItem(c.id));
		gestureNames.push(c.id);
	}
	toggleDoubleTapNote();
	window.addEventListener('click', e => {
		if (!e.target.classList) return;
		if (wantsClick(e)) return;
		if (e.target.classList.contains('with-checkbox')) return;
		if (e.target.classList.contains('custom-gesture-edit')) {
			changeState({dlg: 'editDlg', targetId: dataTargetId(e)});
			return;
		}
		if (e.target.classList.contains('custom-gesture-delete')) {
			setupConfirmDeleteDlg(e);
			changeState({dlg: 'confirmDeleteDlg'});
			return;
		}
		const item = parentByClass(e.target, 'gesture-item');
		if (item) {
			changeState({dlg: 'gestureDlg', targetId: item.id});
			return;
		}
	});
	// Touchstart event prevents click event in Input gesture Dialog.
	SimpleGesture.addTouchEventListener(byId('clearGesture'), { start: e => {
		updateGesture({ arrows: [CLEAR_GESTURE] });
		timeout.restore();
		history.back();
		safePreventDefault(e);
	}, move: NOP, end: NOP, cancel: NOP, });
	SimpleGesture.addTouchEventListener($cancelInputGesture, { start: e => {
		timeout.restore();
		history.back();
		safePreventDefault(e);
	}, move: NOP, end: NOP, cancel: NOP, });
	$startPosition.addEventListener('change', () => {
		dlgs.gestureDlg.updateLabel();
	});
};

// inject settings-page behavior
SimpleGesture.onStart = e => {
	if (!target) return;
	if (wantsClick(e)) return;
	timeout.disable();
	safePreventDefault(e);
	return true;
};
SimpleGesture.onInput = e => {
	if (!target) return;
	if (wantsClick(e)) return;
	if (e.arrows.length > SimpleGesture.MAX_LENGTH) {
		$inputedGesture.classList.add('canceled');
		$cancelInputGesture.classList.add('hover');
	}
	toggleClass(!e.fingers, 'hide', $inputedFingers);
	dlgs.gestureDlg.updateLabel(e);
	const gesture = dlgs.gestureDlg.getGesture(e);
	let dup = SimpleGesture.ini.gestures[gesture];
	dup = (dup && dup !== target.name) ? getMsg(dup) : '';
	$dupName.textContent = dup ? `\u00a0(${dup})` : '';
	toggleClass(dup, 'dup', $inputedGesture, $inputedFingers);
	safePreventDefault(e);
	return true;
};
let touchEndTimer = null;
SimpleGesture.onEnd = e => {
	clearTimeout(touchEndTimer);
	timeout.restore();
	if (!target) return;
	if (wantsClick(e)) return;
	if ($inputedGesture.classList.contains('canceled')) {
		history.back();
	} else {
		if (e.arrows?.length) {
			e.startPosition = $startPosition.value;
			updateGesture(e);
			setTimeout(
				() => { history.back(); },
				e.arrows.at(-1) === 'H' ? SHOW_TAP_HOLD_DELAY : 0
			);
		}
	}
	safePreventDefault(e);
	return true;
};
SimpleGesture.isNowaitSingleTap = () => false;

// custom gesture ----
const addCustomGesture = () => {
	let newId;
	do {
		newId = CUSTOM_GESTURE_PREFIX + Math.random().toString(36).slice(-8);
	} while (findCustomGesture(newId));
	gestureNames.push(newId);
	// save list
	const c = { id: newId, title: INSTEAD_OF_EMPTY.defaultTitle, };
	exData.customGestureList.push(c);
	browser.storage.local.set({ simple_gesture_exdata: exData });
	// save details
	const details = {};
	details[`simple_gesture_${newId}`] = { type: 'url', url: '' };
	browser.storage.local.set(details);
	// update list
	$customGestureList.appendChild(createGestureItem(c.id));
	byId(`${newId}_caption`).textContent = c.title;
};
const deleteCustomGesture = id => {
	browser.storage.local.remove(`simple_gesture_${id}`);
	exData.customGestureList = exData.customGestureList.filter(c => c.id !== id);
	browser.storage.local.set({ simple_gesture_exdata: exData });
	byId(`${id}_item`).remove();
	gestureNames.some((v,i) => {
		if (v === id) gestureNames.splice(i, 1);
	});
	for (const g in SimpleGesture.ini.gestures) {
		if (SimpleGesture.ini.gestures[g] === id) {
			SimpleGesture.ini.gestures[g] = null;
		}
	}
	reloadAllTabsIni();
};
dlgs.editDlg = {
	targetId: null,
	async onShow(id) {
		dlgs.editDlg.targetId = id;
		$customGestureTitle.value = findCustomGesture(id).title;
		const details = await storageValue(`simple_gesture_${id}`);
		$customGestureType.value = [
			details.type,
			details.currentTab ? 'currentTab' : '',
		].filter(Boolean).join(',');
		$customGestureUrl.value = details.type === 'url' ? details.url : '';
		$customGestureScript.value = details.type === 'script' ? details.script : '';
		const m = document.forms.customGestureMsg;
		m.customGestureMsgId.value = details.extensionId || '';
		m.customGestureMsgValue.value = details.message || '';
		m.messageType.value = details.messageType || 'string';
		const c = findCustomGesture(dlgs.editDlg.targetId);
		editStart(byId(`${c.id}_caption`));
		toggleEditor();
	},
	onHide() {
		const c = findCustomGesture(dlgs.editDlg.targetId);
		editEnd(byId(`${c.id}_caption`));
		dlgs.editDlg.targetId = null;
	},
	onSubmit() {
		// save list
		const c = findCustomGesture(dlgs.editDlg.targetId);
		c.title = $customGestureTitle.value;
		browser.storage.local.set({ simple_gesture_exdata: exData });
		// save detail
		const d = { type: $customGestureType.value };
		switch(d.type) {
			case 'url,currentTab':
				d.type = 'url';
				d.currentTab = true;
				// not break;
			case 'url':
				d.url = $customGestureUrl.value;
				break;
			case 'script':
				d.script = $customGestureScript.value;
				break;
			case 'message':
				const m = document.forms.customGestureMsg;
				d.extensionId = m.customGestureMsgId.value;
				d.message = m.customGestureMsgValue.value;
				d.messageType = m.messageType.value;
				break;
		}
		const details = {};
		details[`simple_gesture_${c.id}`] = d;
		browser.storage.local.set(details);
		// update list
		byId(`${c.id}_caption`).textContent = c.title;
		reloadAllTabsIni(); // for toast
	},
};
const toggleEditor = () => {
	const t = $customGestureType.value;
	toggleClass(!t.includes('url'), 'hide', $customGestureUrl);
	toggleClass(t !== 'message', 'hide', byId('customGestureMsgDiv'));
	toggleClass(t !== 'script', 'hide', byId('customGestureScriptDiv'));
	toggleClass(t === 'script', 'dlg-fill', $customGestureDlgContainer);
	if (t !== 'script') return;
	const s = byId('addCommandToScript');
	const f = document.createDocumentFragment();
	f.appendChild(s.firstChild.cloneNode(true));
	for (const i of allByClass('gesture-item')) {
		const name = i.id.replace(/_item/, '');
		if (name === dlgs.editDlg.targetId) continue;
		if (!name) continue;
		const o = document.createElement('OPTION');
		o.value = name;
		o.textContent = byClass(i, 'gesture-caption').textContent;
		f.appendChild(o);
	}
	while (s.firstChild) { s.remove(s.firstChild); }
	s.appendChild(f);
};
const autoTitleByUrl = () => {
	if ($customGestureTitle.value && $customGestureTitle.value !== INSTEAD_OF_EMPTY.defaultTitle) {
		return;
	}
	if ($customGestureUrl.value.startsWith('javascript:')) {
		$customGestureTitle.value = 'Bookmarklet';
		return;
	}
	const m = /https?:\/\/([^\/]+)/.exec($customGestureUrl.value);
	if (m) {
		$customGestureTitle.value = m[1];
	}
};
const autoTitleByScript = () => {
	const m = /\*\s+@name\s+(.+?)(\s*\n|\s+\*)/.exec($customGestureScript.value);
	if (m) {
		$customGestureTitle.value = m[1];
	}
};
const addCommand = e => {
	const name = e.target.value;
	if (!name) return;
	let script = `\nSimpleGesture.doCommand('${name}');\n`;
	if (name[0] === CUSTOM_GESTURE_PREFIX) {
		const title = findCustomGesture(name).title.replace(/\/\*\s+|\s+\*\//g, '');
		script = `\n// ${title}${script}`;
	}
	$customGestureScript.value += script;
	$customGestureScript.selectStart = $customGestureScript.value.length;
	$customGestureScript.scrollTop = $customGestureScript.scrollHeight;
	requestAnimationFrame(() => { e.target.selectedIndex = 0; });
};
const setupEditDlg = () => {
	byId('addCustomGesture').addEventListener('click', addCustomGesture);
	$customGestureType.addEventListener('change', toggleEditor);
	$customGestureUrl.addEventListener('input', () => { resetTimer('autoTitle', autoTitleByUrl, 1000); });
	$customGestureScript.addEventListener('input', () => { resetTimer('autoTitle', autoTitleByScript, 1000); });
	byId('addCommandToScript').addEventListener('change', addCommand);
};

// confirm delete dlg ----
const setupConfirmDeleteDlg = e => {
	dlgs.confirmDeleteDlg.targetId = dataTargetId(e);
};
dlgs.confirmDeleteDlg = {
	targetId: '',
	onShow: NOP,
	onHide: NOP,
	onSubmit() {
		deleteCustomGesture(dlgs.confirmDeleteDlg.targetId);
	},
};

// adjustment dlg ----
const setupAdjustmentDlg = () => {
	const dlg = byId('adjustmentDlg');
	SimpleGesture.addTouchEventListener(dlg, {
		start(e) {
			[minX, minY] = SimpleGesture.getXY(e);
			[maxX, maxY] = [minX, minY];
			startTime = Date.now();
			safePreventDefault(e);
			e.stopPropagation();
			timeout.disable();
		},
		move(e) {
			if (!startTime) return;
			const [x, y] = SimpleGesture.getXY(e);
			minX = Math.min(x, minX);
			minY = Math.min(y, minY);
			maxX = Math.max(x, maxX);
			maxY = Math.max(y, maxY);
			safePreventDefault(e);
			e.stopPropagation();
		},
		end() {
			let size = Math.max(maxX - minX, maxY - minY);
			size *= 320 / Math.min(window.innerWidth, window.innerHeight); // based on screen size is 320x480
			size *= 0.8; // margin
			size ^= 0; // to integer;
			if (10 < size) {
				SimpleGesture.ini.timeout = Date.now() - startTime + 300; // margin 300ms. It seems better not to dvide this by 4.
				SimpleGesture.ini.strokeSize = size;
				saveIni();
				$timeout.value = SimpleGesture.ini.timeout;
				$strokeSize.value = SimpleGesture.ini.strokeSize;
			} else {
				timeout.restore();
			}
			history.back();
		},
		cancel: NOP,
	});
	byId('timeoutAndStrokeSize').addEventListener('click', e => {
		if (e.target.tagName === 'INPUT') return;
		changeState({dlg: 'adjustmentDlg'});
	});
};

dlgs.adjustmentDlg = {
	onShow() {
		fadein('adjustmentDlg');
		clearTimeout(TIMERS.strokeSizeChanged);
		editStart($timeout, $strokeSize);
	},
	onHide() {
		startTime = null;
		editEnd($timeout, $strokeSize);
	}
};

// User-Agent switcher ----
const refreshUserAgentStatus = async () => {
	const state = await browser.runtime.sendMessage('isUserAgentSwitched');
	$userAgentStatus.checked = state;
};
const setupToggleUserAgent = async () => {
	await refreshUserAgentStatus();
	$userAgentStatus.addEventListener('input', async () => {
		await browser.runtime.sendMessage({
			command: 'toggleUserAgent',
			force: true,
			userAgent: $userAgentStatus.checked ? '' : null,
		});
		refreshUserAgentStatus();
	});
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) {
			refreshUserAgentStatus();
		}
	});
	browser.runtime.onMessage.addListener((request) => {
		if (request.cmd === 'refreshUserAgentStatus') {
			refreshUserAgentStatus();
		}
	});
};

// for Orion browser.
const getMsgCompatible = key => {
	const msg = browser.i18n.getMessage(key);
	return key === msg ? '' : msg;
}

const getMsg = (s, isGesture) => {
	if (!s) return s;
	if (s[0] === CUSTOM_GESTURE_PREFIX) {
		const c = findCustomGesture(s);
		return c?.title || '';
	} else {
		try {
			const key = s.replace(/[^0-9a-zA-Z_]/g, '_');
			return isGesture &&
				getMsgCompatible(key + '__label') ||
				getMsgCompatible(key) ||
				s;
		} catch {
			return s;
		}
	}
};
const onChecked = e => {
	for (const elm of allByClass(`js-linked-${e.target.id}`)) {
		toggleClass(!e.target.checked, 'disabled', elm);
	}
};
const toggleExperimental = () => {
	for (const elm of allByClass('experimental')) {
		toggleClass(!exData.experimental, 'hide', elm);
	}
};

// Import / Export ----------
comp.importExport.import = async json  {
	try {
		const obj = JSON.parse(json);
		Object.assign(SimpleGesture.ini, obj.ini);
		exData = obj.exData;
		saveIni();
		if (obj.customGestureDetails) {
			for (const c of obj.customGestureDetails) {
				const d = {};
				d[c.id] = c.detail;
				await browser.storage.local.set(d);
			}
		}
		location.reload();
	} catch (e) {
		alert(e.message);
	}
};
comp.inportExport.export = async () => {
	const data = {
		ini: SimpleGesture.ini,
		exData: exData,
		customGestureDetails: []
	};
	for (const c of exData.customGestureList) {
		const id = `simple_gesture_${c.id}`;
		const detail = await storageValue(id);
		data.customGestureDetails.push({ id: id, detail:detail });
	}
	const href = 'data:application/octet-stream,' + encodeURIComponent(JSON.stringify(data));
	const link = byId('exportSettingLink');
	link.setAttribute('href', href);
	link.click();
};
const setupOtherOptions = async () => {
	document.documentElement.lang = await browser.i18n.getUILanguage();
	for (const caption of allByClass('i18n')) {
		caption.textContent = getMsg(caption.textContent);
	}
	for (const caption of allByClass('i18n-gesture')) {
		caption.textContent = getMsg(caption.textContent, true);
	}
	for (const elm of document.getElementsByTagName('INPUT')) {
		if (elm.type === 'checkbox') {
			elm.addEventListener('change', onChecked);
		}
	}
	for (const sub of allByClass('sub-item')) {
		const parentId = sub.getAttribute('data-parent');
		const p = parentId && byId(parentId);
		if (p) p.appendChild(sub);
	}
	byId('defaultUserAgent').value = INSTEAD_OF_EMPTY.userAgent;
	for (const elm of $bidingForms) {
		const ini = elm.classList.contains('js-binding-exData') ? exData : SimpleGesture.ini;
		if (elm.type === 'checkbox') {
			elm.checked = !!ini[elm.id];
		} else {
			elm.value = ini[elm.id] || INSTEAD_OF_EMPTY[elm.id] || (
				elm.type === 'number' ? 0 : ''
			);
		}
		elm.addEventListener('change', saveBindingValues);
		elm.addEventListener('input', saveBindingValuesDelay);
	}
	const $touchHold = byId('touchHold');
	$touchHold.checked = !!SimpleGesture.ini.touchHoldMsec;
	onChecked({ target: $touchHold });
	$touchHold.addEventListener('click', () => {
		$touchHoldMsec.value = $touchHold.checked
			? SimpleGesture.ini.timeout <= 100
			? TAP_HOLD_MSEC_DEFAULT
			: Math.min(TAP_HOLD_MSEC_DEFAULT, SimpleGesture.ini.timeout - 100)
			: 0;
		saveBindingValues();
	});
	toggleExperimental();
	// Firefox cant open link. bug?
	byId('exp_readme').addEventListener('click', e => {
		browser.tabs.create({ active: true, url: 'experimental.html' });
		safePreventDefault(e);
	});
};

// common events
addEventListener('click', e => {
	if (!e?.target.classList) return;
	if (e.target.classList.contains('js-history-back')) {
		history.back();
		return;
	}
	if (e.target.classList.contains('js-submit')) {
		const f = dlgs[openedDlg.id].onSubmit;
		f && f();
		history.back();
	}
});

// control Back button
const changeState = state => {
	if (!state.dlg) return;
	history.pushState(state, document.title);
	onPopState({ state: state });
};
let preventPopStateEvent = false;
const onPopState = e => {
	if (preventPopStateEvent) return;
	const state = e.state || history.state || { y: 0 };
	if (openedDlg && !state.dlg) {
		dlgs[openedDlg.id].onHide();
		fadeout(openedDlg);
		openedDlg = null;
		// enable touch scroll.
		document.body.style.overflow = null;
	} else if (state.dlg) {
		const d = dlgs[state.dlg];
		const i = d.init;
		if (i) {
			i();
			d.init = null;
		}
		d.onShow(state.targetId);
		openedDlg = byId(state.dlg);
		fadein(openedDlg);
		// prevent touch scroll.
		if (window.innerWidth === document.body.clientWidth) { // prevent blink scroll bar.
			document.body.style.overflow = 'hidden';
		}
	} else {
		setTimeout(() => { window.scrollTo(0, state.y); });
	}
};
const scrollIntoView = target => {
	onScrollEnd({ force: true }); // Save current position.
	try {
		target.scrollIntoView({ behavior: 'smooth' });
	} catch (e) {
		target.scrollIntoView(); // For Firefox 54-58
	}
};
const onScrollEnd = e => {
	if (openedDlg) return;
	const hasOldY = history.state && 'y' in history.state;
	const newY = window.scrollY;
	if (newY || e?.force) {
		if (hasOldY) {
			history.replaceState({ y: newY }, document.title);
		} else {
			history.pushState({ y: newY }, document.title);
		}
	} else if (hasOldY) {
		// Prevent to stack histories.
		try {
			preventPopStateEvent = true;
			history.back();
			requestAnimationFrame(() => {
				window.scrollTo({ top: 0, behavior: 'instant' });
			});
		} finally {
			preventPopStateEvent = false;
		}
	}
};
window.addEventListener('scroll', () => { resetTimer('onScrollEnd', onScrollEnd, 200); });
window.addEventListener('popstate', onPopState);

// setup options page
const highligtItem = e => {
	const item = parentByClass(e.target, 'link-item');
	item?.classList?.add('active');
};
const unhighligtItem = () => {
	for (const item of allByClass('active')) {
		item.classList.remove('active');
	}
};
const setupIndexPage = () => {
	const v = manifest.version_name ?? manifest.version;
	byId('splashVersion').textContent = `version ${v}`
	if (v.includes('beta')) {
		document.body.classList.add('beta');
	}
	const indexPage = byId('index');
	indexPage.addEventListener('click', e => {
		const item = parentByClass(e.target, 'link-item');
		const page = item?.getAttribute('data-targetPage');
		if (page) {
			scrollIntoView(byId(page));
		}
	});
	// Highlight when touched with JS. (css ':active' does not work.)
	indexPage.addEventListener('touchstart', highligtItem);
	indexPage.addEventListener('mousedown', highligtItem);
	addEventListener('touchend', unhighligtItem, true);
	addEventListener('mouseup', unhighligtItem, true);
	// Fix page heights with JS. (css 'min-height: 100vh' has probrem of scroll position.)
	setTimeout(() => {
		document.styleSheets.item(0).insertRule(`.page { min-height: ${innerHeight}px; }`, 0);
	});
};
const removeCover = () => {
	const cover = byId('cover');
	if (!cover) return;
	setTimeout(() => { fadeout(cover); });
	setTimeout(() => { cover.remove(); }, 500);
	setTimeout(() => {
		document.body.classList.add('initialized');
		initialized = true;
	}, 500);
};
const setupSettingItems = async () => {
	document.body.classList.add(`mv${manifest.manifest_version}`);
	setupGestureList();
	setupEditDlg();
	setupAdjustmentDlg();
	setupIndexPage();
	await setupOtherOptions();
	// no wait for Orion browser.
	// await setupToggleUserAgent();
	setupToggleUserAgent();
	onPopState(history);
	removeCover();
};

// error handling
const MAX_LOG_COUNT = 10;
const addLog = div => {
	const debuglogDiv = byId('debuglog');
	const count = debuglogDiv.childNodes.length;
	for (let i = 0; i < count - MAX_LOG_COUNT; i ++) {
		debuglogDiv.removeChild(debuglogDiv.firstChild);
	}
	debuglogDiv.appendChild(div);
	debuglogDiv.classList.remove('hide');
	removeCover();
};
const addErrorLog = (e, cause) => {
	const err = e.error || e;
	const div = document.createElement('DIV');
	const msg = document.createElement('DIV');
	msg.classList.add('errorlog');
	msg.textContent = `${err.message || err}`;
	div.appendChild(msg);
	const stack = [];
	if (cause) stack.push(cause.message || `${cause}`);
	if (cause?.stack) stack.push(cause.stack.split('\n').slice(0, 2).join('\n'));
	if (err.stack) stack.push(err.stack);
	if (stack.length) {
		const s = document.createElement('DIV');
		s.classList.add('stacktrace');
		s.textContent = stack.join('\n');
		div.appendChild(s);
	}
	addLog(div);
};
addEventListener('error',	addErrorLog);

// START HERE ! ------
const mySettings = {
	storageKey: 'simple_gesture',
	getIni: () => SimpleGesture.ini,
	insteadOfEmpty: INSTEAD_OF_EMPTY,
	async onInitialize() {
		await SimpleGesture.loadIni();
		exData = (await storageValue('simple_gesture_exdata')) || exData;
		await setupSettingItems();
	},
	onSavePre() {
		toggleExperimental();
		toggleDoubleTapNote();
	},
	onSaveComplete() {
		browser.storage.local.set({ simple_gesture_exdata: exData });
		resetTimer('reloadAllTabsIni', reloadAllTabsIni, 1000);
	},
};

initialize(mySettings);
