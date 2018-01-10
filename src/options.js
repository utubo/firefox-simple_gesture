(() => {
	'use strict';

	// const -------------
	const GESTURE_NAMES = [
		'forward',
		'back',
		'reload',
		'top',
		'bottom',
		'nextTab',
		'prevTab',
		'close',
		'closeAll',
		'newTab',
		'toggleUserAgent',
		'disableGesture'
	];
	const CUSTOM_GESTURE_PREFIX = '$';
	const TEXT_FORMS = ['newTabUrl', 'userAgent', 'timeout', 'strokeSize'];
	const INSTEAD_OF_EMPTY = {
		userAgent: navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux'),
		noGesture: '-',
		defaultTitle: 'Custom Gesture'
	};
	const MAX_INPUT_LENGTH = SimpleGesture.MAX_LENGTH - 2;
	const TIMERS = {};

	// fields ------------
	let editTarget = null;
	let minX;
	let maxX;
	let minY;
	let maxY;
	let startTime = null;
	let exData = {
		customGestureList: []
	};

	// utils -------------
	const byId = id => document.getElementById(id);

	const byClass = (elm, clazz) => elm.getElementsByClassName(clazz)[0];

	const toggleClass = (elm, clazz, b) => {
		if (b) {
			elm.classList.add(clazz);
		} else {
			elm.classList.remove(clazz);
		}
	};

	const swapKeyValue = m => {
		const s = {};
		for (let key in m) {
			const value = m[key];
			if (value) s[value] = key;
		}
		return s;
	};

	const resetTimer = (name, f, msec) => {
		clearTimeout(TIMERS[name]);
		TIMERS[name] = setTimeout(f, msec);
	};

	// utils for Simple gesture
	const saveIni = () => {
		browser.storage.local.set({ 'simple_gesture': SimpleGesture.ini });
	};

	const findCustomGesture = id => {
		for (let c of exData.customGestureList) {
			if (c.id === id) return c;
		}
		return null;
	};

	const toggleEditing = (ids, b) => {
		for (let id of ids) {
			toggleClass(byId(id), 'editing', b);
		}
	};

	// node --------------
	const gestureList = byId('gestureList');
	const templates = byId('templates');
	const gestureTemplate = byClass(templates, 'gesture-container');
	const buttonsTamplate = byClass(templates, 'custom-gesture-buttons');
	const customGestureTitle = byId('customGestureTitle');
	const customGestureType = byId('customGestureType');
	const customGestureURl = byId('customGestureUrl');
	const customGestureScript = byId('customGestureScript');

	// edit UDLR ---------
	const refreshUDLRLabel = (label, udlr) => {
		if (udlr) {
			label.textContent = udlr;
			label.classList.remove('udlr-na');
		} else {
			label.textContent = INSTEAD_OF_EMPTY.noGesture;
			label.classList.add('udlr-na');
		}
	};

	const DELETE_GESTURE = 'n/a';
	const updateGesture = gesture => {
		if (gesture) {
			if (gesture === DELETE_GESTURE) {
				gesture = null;
			} else {
				SimpleGesture.ini.gestures[gesture] = null;
			}
			const gestureValues = swapKeyValue(SimpleGesture.ini.gestures);
			gestureValues[editTarget] = gesture;
			SimpleGesture.ini.gestures = swapKeyValue(gestureValues);
			saveIni();
			for (let name of GESTURE_NAMES) {
				 refreshUDLRLabel(byId('udlr_' + name), gestureValues[name]);
			}
		}
		toggleEditing(['caption_' + editTarget, 'udlr_' + editTarget], false);
		byId('gestureDlg').classList.add('transparent');
		editTarget = null;
	};

	const refreshTimeoutAndStrokeSize = () => {
		byId('timeout').value = SimpleGesture.ini.timeout;
		byId('strokeSize').value = SimpleGesture.ini.strokeSize;
	};

	const setupAdjustBox = () => {
		const box = byId('adjustDlg');
		SimpleGesture.addTouchEventListener(box, {
			start: e => {
				[minX, minY] = SimpleGesture.getXY(e);
				[maxX, maxY] = [minX, minY];
				startTime = new Date();
				e.preventDefault();
				e.stopPropagation();
			},
			move: e => {
				if (!startTime) return;
				const [x, y] = SimpleGesture.getXY(e);
				minX = Math.min(x, minX);
				minY = Math.min(y, minY);
				maxX = Math.max(x, maxX);
				maxY = Math.max(y, maxY);
				e.preventDefault();
				e.stopPropagation();
			},
			end: e => {
				let size = Math.max(maxX - minX, maxY - minY);
				size *= 320 / Math.min(window.innerWidth, window.innerHeight); // based on screen size is 320x480
				size *= 0.8; // margin
				size ^= 0; // to integer;
				if (10 < size) {
					SimpleGesture.ini.timeout = new Date() - startTime + 300; // margin 300ms
					SimpleGesture.ini.strokeSize = size;
					saveIni();
					refreshTimeoutAndStrokeSize();
				}
				startTime = null;
				box.classList.add('transparent');
				TIMERS.strokeSizeEditing = setTimeout(() => { toggleEditing(['timeout', 'strokeSize'], false); }, 2000);
			}
		});
		byId('timeoutAndStrokeSize').addEventListener('click', e => {
			if (e.target.tagName === 'INPUT') return;
			clearTimeout(TIMERS.strokeSizeEditing);
			box.classList.remove('transparent');
			toggleEditing(['timeout', 'strokeSize'], true);
			e.preventDefault();
		});
	};

	const setupGestureNames = () => {
		for (let i = GESTURE_NAMES.length - 1; 0 <= i; i --) {
			if (GESTURE_NAMES[i][0] === CUSTOM_GESTURE_PREFIX) {
				GESTURE_NAMES.splice(i, 1);
			}
		}
		for (let c of exData.customGestureList) {
			GESTURE_NAMES.push(c.id);
		}
	};

	const setEditTarget = e => {
		editTarget = e.target.id.replace(/^.+_/, '');
		toggleEditing(['caption_' + editTarget, 'udlr_' + editTarget], true);
		byId('editTarget').textContent = byId('caption_' + editTarget).textContent;
		byId('inputedGesture').textContent = byId('udlr_' + editTarget).textContent;
		byId('gestureDlg').classList.remove('transparent');
	};

	const getUDLR = name => {
		for (let g in SimpleGesture.ini.gestures) {
			if (SimpleGesture.ini.gestures[g] === name) return g;
		}
	};
	const createGestureContainer = name => {
		const container = gestureTemplate.cloneNode(true);
		container.id = name + "_container";
		const label = byClass(container, 'udlr');
		label.id = 'udlr_' + name;
		refreshUDLRLabel(label, getUDLR(name));
		const caption = byClass(container, 'gesture-caption');
		caption.id = 'caption_' + name;
		caption.textContent = name;
		if (name[0] === CUSTOM_GESTURE_PREFIX) {
			const b = buttonsTamplate.cloneNode(true);
			b.classList.remove('hide');
			byClass(b, 'custom-gesture-edit').setAttribute('data-targetId', name);
			byClass(b, 'custom-gesture-delete').setAttribute('data-targetId', name);
			container.insertBefore(b, container.firstChild);
		}
		gestureList.appendChild(container);
	};

	const setupGestureInputBox = () => {
		for (let name of GESTURE_NAMES) {
			createGestureContainer(name);
		}
		gestureList.addEventListener('click', e => {
			if (e.target.parentNode && e.target.parentNode.classList.contains('gesture-label')) {
				setEditTarget(e);
			} else if (e.target.classList.contains('custom-gesture-edit')) {
				showCustomGestureEditBox(e);
			} else if (e.target.classList.contains('custom-gesture-delete')) {
				if (confirm(chrome.i18n.getMessage('message_delete_confirm'))) {
					deleteCustomGesture(e);
				}
			}
		});
		SimpleGesture.addTouchEventListener(byId('deleteGesture'), { start: e => {
			updateGesture(DELETE_GESTURE);
			e.preventDefault();
		}, move: e => {}, end: e => {} });
	};

	// inject settings-page behavior
	SimpleGesture.onGestureStart = e => {
		if (editTarget) {
			SimpleGesture.clearGestureTimeoutTimer(); // Don't timeout, when editing gesture.
			e.preventDefault();
		}
	};
	SimpleGesture.onInputGesture = (e, gesture) => {
		if (!editTarget) return;
		byId('inputedGesture').textContent = gesture.substring(0, MAX_INPUT_LENGTH);
		e.preventDefault();
		return false;
	};
	SimpleGesture.onGestured = (e, gesture) => {
		if (!editTarget) return;
		updateGesture(gesture.substring(0, MAX_INPUT_LENGTH));
		e.preventDefault();
		return false;
	};

	// custom gesture ----
	let customGestureId = null;
	const addCustomGesture = e => {
		// ini
		do {
			customGestureId = CUSTOM_GESTURE_PREFIX + Math.random().toString(36).slice(-8);
		} while (findCustomGesture(customGestureId));
		const c = { id: customGestureId, title: INSTEAD_OF_EMPTY.defaultTitle, };
		GESTURE_NAMES.push(customGestureId);
		exData.customGestureList.push(c);
		// dom
		createGestureContainer(c.id);
		customGestureTitle.value = c.title;
		customGestureType.value = 'url';
		customGestureUrl.value = '';
		customGestureScript.value = '';
		// save
		saveCustomGesture();
	};
	const dataTargetId = e => e.target.getAttribute('data-targetId');
	const deleteCustomGesture = e => {
		const id = dataTargetId(e);
		browser.storage.local.remove('simple_gesture_' + id);
		const c = findCustomGesture(id);
		exData.customGestureList = exData.customGestureList.filter((v,i,a) => v.id !== id);
		browser.storage.local.set({ simple_gesture_exdata: exData });
		const container = byId(id + '_container');
		container.parentNode.removeChild(container);
		setupGestureNames();
	};
	const showCustomGestureEditBox = e => {
		customGestureId = dataTargetId(e);
		const c = findCustomGesture(customGestureId);
		customGestureTitle.value = c.title;
		const key = 'simple_gesture_' + customGestureId;
		browser.storage.local.get(key).then(res => {
			const c1 = res[key];
			customGestureType.value = c1.type;
			customGestureUrl.value = c1.type === 'url' ? c1.url : '';
			customGestureScript.value = c1.type === 'script' ? c1.script : '';
			toggleEditor();
		}).then(() => {
			byId('editDlg').classList.remove('transparent');
		});
	};
	const saveCustomGesture = e => {
		// save list
		const c = findCustomGesture(customGestureId);
		c.title = customGestureTitle.value;
		byClass(byId(customGestureId + '_container'), 'gesture-caption').textContent = c.title;
		browser.storage.local.set({ simple_gesture_exdata: exData });
		// save value
		const c1 = { type: customGestureType.value };
		switch(c1.type) {
			case 'url': c1.url = customGestureUrl.value; break;
			case 'script': c1.script = customGestureScript.value; break;
		}
		const res = {};
		res['simple_gesture_' + customGestureId] = c1;
		browser.storage.local.set(res);
		hideCustomGestureEditBox();
	};
	const hideCustomGestureEditBox = e => {
		byId('editDlg').classList.add('transparent');
	};
	const toggleEditor = e => {
		toggleClass(customGestureUrl, 'hide', customGestureType.value !== 'url');
		toggleClass(customGestureScript, 'hide', customGestureType.value !== 'script');
		toggleClass(byId('customGestureScriptNote'), 'hide', customGestureType.value !== 'script');
	};
	const autoTitle = () => {
		if (customGestureTitle.value && customGestureTitle.value !== INSTEAD_OF_EMPTY.defaultTitle) return;
		if (customGestureUrl.value.match(/https?:\/\/([^\/]+)/)) {
			customGestureTitle.value = RegExp.$1;
		}
	};
	const autoTitleByScript = () => {
		if (customGestureScript.value.match(/\*\s+@name\s+(.+?)(\s*\n|\s+\*)/)) {
			customGestureTitle.value = RegExp.$1;
		}
	};
	const setupCustomGestureEditBox = () => {
		byId('addCustomGesture').addEventListener('click', addCustomGesture);
		byId('saveCustomGesture').addEventListener('click', saveCustomGesture);
		byId('cancelCustomGesture').addEventListener('click', hideCustomGestureEditBox);
		customGestureType.addEventListener('change', toggleEditor);
		customGestureUrl.addEventListener('input', e => { resetTimer('autoTitle', autoTitle, 1000); });
		customGestureScript.addEventListener('input', e => { resetTimer('autoTitle', autoTitleByScript, 1000); });
	};

	// edit text values --
	const saveTextValues = e => {
		clearTimeout(TIMERS.saveTextValues);
		for (let id of TEXT_FORMS) {
			const target = byId(id);
			const value = target.value;
			if (value === INSTEAD_OF_EMPTY[id]) {
				SimpleGesture.ini[id] = null;
			} else if (target.type === "number" && value.match(/[^\d]/)) {
				continue; // ignore invalid number.
			} else {
				SimpleGesture.ini[id] = value;
			}
		}
		saveIni();
	};

	const saveTextValuesDelay = e => {
		resetTimer('saveTextValues', saveTextValues, 3000);
	};

	const setupOtherOptions = () => {
		for (let caption of document.getElementsByClassName('caption')) {
			if (!caption.textContent) continue;
			if (caption.textContent[0] === CUSTOM_GESTURE_PREFIX) {
				caption.textContent = findCustomGesture(caption.textContent).title;
			} else {
				caption.textContent = chrome.i18n.getMessage(caption.textContent) || caption.textContent;
			}
		}
		byId('newTab_container').appendChild(byId('newTabUrl_container'));
		byId('toggleUserAgent_container').appendChild(byId('userAgent_container'));
		byId('defaultUserAgent').value = INSTEAD_OF_EMPTY.userAgent;
		for (let id of TEXT_FORMS) {
			const inputElm = byId(id);
			inputElm.value = SimpleGesture.ini[id] || INSTEAD_OF_EMPTY[id] || '';
			inputElm.addEventListener('change', saveTextValues);
			inputElm.addEventListener('input', saveTextValuesDelay);
		}
	};

	// setup options page
	const removeCover = () => {
		const cover = byId('cover');
		setTimeout(() => { cover.classList.add('transparent'); });
		setTimeout(() => { cover.parentNode.removeChild(cover); }, 500);
	};

	const setupSettingItems = res => {
		if (res && res.simple_gesture) {
			SimpleGesture.ini = res.simple_gesture;
		}
		setupGestureNames();
		setupGestureInputBox();
		setupCustomGestureEditBox();
		setupOtherOptions();
		setupAdjustBox();
		removeCover();
	};

	// START HERE ! ------
	Promise.all([
		browser.storage.local.get('simple_gesture').then(res => {
			if (res && res.simple_gesture) {
				SimpleGesture.ini = res.simple_gesture;
			}
		}),
		browser.storage.local.get('simple_gesture_exdata').then(res => {
			if (res && res.simple_gesture_exdata) {
				exData = res.simple_gesture_exdata;
			}
		}),
	]).then(setupSettingItems, setupSettingItems); // promise.finally is supported on FF 58 or later.
})();

