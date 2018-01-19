(async () => {
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
	const TIMERS = {};

	// fields ------------
	let target = null;
	let minX;
	let maxX;
	let minY;
	let maxY;
	let startTime = null;
	let exData = { customGestureList: [] };

	// utils -------------
	const byId = id => document.getElementById(id);

	const byClass = (elm, clazz) => elm.getElementsByClassName(clazz)[0];

	const toggleClass = (b, elm, clazz) => {
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

	const storageValue = async name => {
		try {
			const v = await browser.storage.local.get(name);
			return v ? v[name] : null;
		} catch (e) {
			return null;
		}
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

	const toggleEditing = (b, ...elms) => {
		for (let elm of elms) {
			toggleClass(b, elm, 'editing');
		}
	};

	const ifById = id => (typeof id === 'string') ? byId(id): id;
	const fadeout = elm => { ifById(elm).classList.add('transparent'); };
	const fadein = elm => { ifById(elm).classList.remove('transparent'); };

	// node --------------
	const gestureList = byId('gestureList');
	const templates = byId('templates');
	const gestureTemplate = byClass(templates, 'gesture-container');
	const buttonsTamplate = byClass(templates, 'custom-gesture-buttons');
	const inputedGesture = byId('inputedGesture');
	const customGestureTitle = byId('customGestureTitle');
	const customGestureType = byId('customGestureType');
	const customGestureURl = byId('customGestureUrl');
	const customGestureScript = byId('customGestureScript');
	const timeout = byId('timeout');
	const strokeSize = byId('strokeSize');

	// edit UDLR ---------
	const refreshUDLRLabel = (label, udlr) => {
		label.textContent = udlr || INSTEAD_OF_EMPTY.noGesture;
		toggleClass(!udlr, label, 'udlr-na');
	};

	const CLEAR_GESTURE = 'n/a'; // magic number
	const updateGesture = udlr => {
		if (udlr) {
			if (udlr === CLEAR_GESTURE) {
				udlr = null;
			} else {
				SimpleGesture.ini.gestures[udlr] = null;
			}
			const udlrs = swapKeyValue(SimpleGesture.ini.gestures);
			udlrs[target.name] = udlr;
			SimpleGesture.ini.gestures = swapKeyValue(udlrs);
			saveIni();
			for (let name of GESTURE_NAMES) {
				 refreshUDLRLabel(byId(`${name}_udlr`), udlrs[name]);
			}
		}
		toggleEditing(false, target.caption, target.udlr);
		fadeout('gestureDlg');
		target = null;
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
		target = { name: e.target.id.replace(/_[^_]+$/, '') };
		target.caption = byId(`${target.name}_caption`);
		target.udlr = byId(`${target.name}_udlr`);
		toggleEditing(true, target.caption, target.udlr);
		byId('editTarget').textContent = target.caption.textContent;
		inputedGesture.textContent = target.udlr.textContent;
		fadein('gestureDlg');
	};

	const getUDLR = name => {
		for (let g in SimpleGesture.ini.gestures) {
			if (SimpleGesture.ini.gestures[g] === name) return g;
		}
	};

	const createGestureContainer = name => {
		const container = gestureTemplate.cloneNode(true);
		container.id = `${name}_container`;
		const label = byClass(container, 'udlr');
		label.id = `${name}_udlr`;
		refreshUDLRLabel(label, getUDLR(name));
		const caption = byClass(container, 'gesture-caption');
		caption.id = `${name}_caption`;
		caption.textContent = name;
		if (name[0] === CUSTOM_GESTURE_PREFIX) {
			const b = buttonsTamplate.cloneNode(true);
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
			if ((e.target.parentNode || e.target).classList.contains('gesture-container')) {
				setEditTarget(e);
			} else if (e.target.classList.contains('custom-gesture-edit')) {
				showCustomGestureEditBox(e);
			} else if (e.target.classList.contains('custom-gesture-delete')) {
				if (confirm(chrome.i18n.getMessage('message_delete_confirm'))) {
					deleteCustomGesture(e);
				}
			}
		});
		SimpleGesture.addTouchEventListener(byId('clearGesture'), { start: e => {
			updateGesture(CLEAR_GESTURE);
			e.preventDefault();
		}, move: e => {}, end: e => {} });
	};

	// inject settings-page behavior
	SimpleGesture.onGestureStart = e => {
		if (!target) return;
		SimpleGesture.clearGestureTimeoutTimer(); // Don't timeout, when editing gesture.
		e.preventDefault();
	};
	SimpleGesture.onInputGesture = (e, gesture) => {
		if (!target) return;
		inputedGesture.textContent = gesture.substring(0, SimpleGesture.MAX_LENGTH);
		e.preventDefault();
		return false;
	};
	SimpleGesture.onGestured = (e, gesture) => {
		if (!target) return;
		updateGesture(gesture.substring(0, SimpleGesture.MAX_LENGTH));
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
		browser.storage.local.remove(`simple_gesture_${id}`);
		const c = findCustomGesture(id);
		exData.customGestureList = exData.customGestureList.filter((v,i,a) => v.id !== id);
		browser.storage.local.set({ simple_gesture_exdata: exData });
		const container = byId(`${id}_container`);
		container.parentNode.removeChild(container);
		setupGestureNames();
	};
	const showCustomGestureEditBox = async e => {
		customGestureId = dataTargetId(e);
		const c = findCustomGesture(customGestureId);
		customGestureTitle.value = c.title;
		const c1 = await storageValue(`simple_gesture_${customGestureId}`);
		customGestureType.value = c1.type;
		customGestureUrl.value = c1.type === 'url' ? c1.url : '';
		customGestureScript.value = c1.type === 'script' ? c1.script : '';
		toggleEditor();
		fadein('editDlg');
	};
	const saveCustomGesture = e => {
		// save list
		const c = findCustomGesture(customGestureId);
		c.title = customGestureTitle.value;
		byClass(byId(`${customGestureId}_container`), 'gesture-caption').textContent = c.title;
		browser.storage.local.set({ simple_gesture_exdata: exData });
		// save value
		const c1 = { type: customGestureType.value };
		switch(c1.type) {
			case 'url': c1.url = customGestureUrl.value; break;
			case 'script': c1.script = customGestureScript.value; break;
		}
		const res = {};
		res[`simple_gesture_${customGestureId}`] = c1;
		browser.storage.local.set(res);
		hideCustomGestureEditBox();
	};
	const hideCustomGestureEditBox = e => {
		fadeout('editDlg');
	};
	const toggleEditor = e => {
		toggleClass(customGestureType.value !== 'url', customGestureUrl, 'hide');
		toggleClass(customGestureType.value !== 'script', customGestureScript, 'hide');
		toggleClass(customGestureType.value !== 'script', byId('customGestureScriptNote'), 'hide');
	};
	const autoTitleByUrl = () => {
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
		customGestureUrl.addEventListener('input', e => { resetTimer('autoTitle', autoTitleByUrl, 1000); });
		customGestureScript.addEventListener('input', e => { resetTimer('autoTitle', autoTitleByScript, 1000); });
	};

	// adjustment dlg ----
	const setupAdjustBox = () => {
		const dlg = byId('adjustDlg');
		SimpleGesture.addTouchEventListener(dlg, {
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
					timeout.value = SimpleGesture.ini.timeout;
					strokeSize.value = SimpleGesture.ini.strokeSize;
				}
				startTime = null;
				fadeout(dlg);
				resetTimer('strokeSizeChanged', () => { toggleEditing(false, timeout, strokeSize); }, 2000);
			}
		});
		byId('timeoutAndStrokeSize').addEventListener('click', e => {
			if (e.target.tagName === 'INPUT') return;
			fadein(dlg);
			clearTimeout(TIMERS.strokeSizeChanged);
			toggleEditing(true, timeout, strokeSize);
			e.preventDefault();
		});
	};

	// edit text values --
	const saveTextValues = e => {
		clearTimeout(TIMERS.saveTextValues);
		for (let id of TEXT_FORMS) {
			const t = byId(id);
			const value = t.value;
			if (value === INSTEAD_OF_EMPTY[id]) {
				SimpleGesture.ini[id] = null;
			} else if (t.type === 'number' && value.match(/[^\d]/)) {
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
			const textForm = byId(id);
			textForm.value = SimpleGesture.ini[id] || INSTEAD_OF_EMPTY[id] || '';
			textForm.addEventListener('change', saveTextValues);
			textForm.addEventListener('input', saveTextValuesDelay);
		}
	};

	// setup options page
	const removeCover = () => {
		const cover = byId('cover');
		setTimeout(() => { fadeout(cover); });
		setTimeout(() => { cover.parentNode.removeChild(cover); }, 500);
	};

	const setupSettingItems = () => {
		setupGestureNames();
		setupGestureInputBox();
		setupCustomGestureEditBox();
		setupOtherOptions();
		setupAdjustBox();
		removeCover();
	};

	// START HERE ! ------
	SimpleGesture.ini = (await storageValue('simple_gesture')) || SimpleGesture.ini;
	exData = (await storageValue('simple_gesture_exdata')) || exData;
	setupSettingItems();
})();

