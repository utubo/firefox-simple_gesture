(async () => {
	'use strict';

	// const -------------
	const CUSTOM_GESTURE_PREFIX = '$';
	const TEXT_FORMS = ['newTabUrl', 'userAgent', 'timeout', 'strokeSize'];
	const INSTEAD_OF_EMPTY = {
		userAgent: navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux'),
		noGesture: '-',
		defaultTitle: 'Custom Gesture'
	};
	const TIMERS = {};

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
	const byId = id => document.getElementById(id);

	const byClass = (elm, clazz) => elm.getElementsByClassName(clazz)[0];

	const parentByClass = (elm, clazz) => {
		for (let e = elm; e && e.classList; e = e.parentNode) {
			if (e.classList.contains(clazz)) return e;
		}
	};

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
		resetTimer('reloadAllTabsIni', reloadAllTabsIni, 1000);

	};

	const reloadAllTabsIni = () => {
		browser.runtime.sendMessage('reloadAllTabsIni');
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
	const templates = byId('templates');
	const gestureTemplate = byClass(templates, 'gesture-container');
	const buttonsTamplate = byClass(templates, 'custom-gesture-buttons');
	const inputedGesture = byId('inputedGesture');
	const customGestureList = byId('customGestureList');
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
			for (let name of gestureNames) {
				 refreshUDLRLabel(byId(`${name}_udlr`), udlrs[name]);
			}
		}
		toggleEditing(false, target.caption, target.udlr);
		target = null;
		history.back();
	};

	const showGestureDlg = targetId => {
		target = { name: targetId.replace(/_[^_]+$/, '') };
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
		return container;
	};

	const setupGestureList = () => {
		gestureNames = [];
		for (let page of document.getElementsByClassName('page')) {
			const gestures = page.getAttribute('data-gestures');
			if (!gestures) continue;
			for (let name of gestures.split(/\s+/)) {
				page.appendChild(createGestureContainer(name));
				gestureNames.push(name);
			}
		}
		for (let c of exData.customGestureList) {
			customGestureList.appendChild(createGestureContainer(c.id));
			gestureNames.push(c.id);
		}
		window.addEventListener('click', e => {
			if (e.target.tagName === 'INPUT') return;
			if (e.target.tagName === 'LABEL') return;
			if (e.target.classList.contains('custom-gesture-edit')) {
				changeState({dlg: 'editDlg', targetId: dataTargetId(e)});
				return;
			}
			if (e.target.classList.contains('custom-gesture-delete')) {
				if (confirm(chrome.i18n.getMessage('message_delete_confirm'))) {
					deleteCustomGesture(e);
				}
				return;
			}
			const container = parentByClass(e.target, 'gesture-container');
			if (container) {
				changeState({dlg: 'gestureDlg', targetId: container.id});
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
		gestureNames.push(customGestureId);
		exData.customGestureList.push(c);
		// dom
		customGestureList.appendChild(createGestureContainer(c.id));
		customGestureTitle.value = c.title;
		customGestureType.value = 'url';
		customGestureUrl.value = '';
		customGestureScript.value = '';
		// after
		saveCustomGesture();
		setTimeout(() => {
			window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
		});
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
		gestureNames.some((v,i) => {
			if (v === id) gestureNames.splice(i, 1);
		});
	};
	const showEditDlg = async id => {
		customGestureId = id;
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
		if (e && e.target.id === 'saveCustomGesture') {
			history.back();
		}
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
	const setupEditDlg = () => {
		byId('addCustomGesture').addEventListener('click', addCustomGesture);
		byId('saveCustomGesture').addEventListener('click', saveCustomGesture);
		byId('cancelCustomGesture').addEventListener('click', e => { history.back(); });
		customGestureType.addEventListener('change', toggleEditor);
		customGestureUrl.addEventListener('input', e => { resetTimer('autoTitle', autoTitleByUrl, 1000); });
		customGestureScript.addEventListener('input', e => { resetTimer('autoTitle', autoTitleByScript, 1000); });
	};

	// adjustment dlg ----
	const setupAdjustmentDlg = () => {
		const dlg = byId('adjustmentDlg');
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
				resetTimer('strokeSizeChanged', () => { toggleEditing(false, timeout, strokeSize); }, 2000);
				history.back();
			}
		});
		byId('timeoutAndStrokeSize').addEventListener('click', e => {
			if (e.target.tagName === 'INPUT') return;
			changeState({dlg: 'adjustmentDlg'});
		});
	};
	const showAdjustmentDlg = e => {
		e && e.preventDefault();
		fadein('adjustmentDlg');
		clearTimeout(TIMERS.strokeSizeChanged);
		toggleEditing(true, timeout, strokeSize);
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

	// paging ------------
	const changeState = state => {
		if (!state.page) {
			state.page = history.state && history.state.page;
		}
		history.pushState(state, document.title);
		onPopState({ state: state });
	};
	const onPopState = e => {
		const s = e && e.state || history.state;
		for (let page of document.getElementsByClassName('page')) {
			if (page.id === 'index') {
				toggleClass(s && s.page, page, 'hide');
			} else {
				toggleClass(!s || s.page !== page.id, page, 'hide');
			}
		}
		for (let dlg of document.getElementsByClassName('dlg')) {
			if (s && s.dlg === dlg.id) {
				switch (dlg.id) {
					case 'gestureDlg': showGestureDlg(s.targetId); break;
					case 'editDlg': showEditDlg(s.targetId); break;
					case 'adjustmentDlg': showAdjustmentDlg(); break;
				}
			} else {
				fadeout(dlg);
			}
		}
	};

	// setup options page
	const getTargetPage = e => {
		const container = parentByClass(e.target, 'container');
		const page = container.getAttribute('data-targetPage');
		return [page, container];
	};
	const setupIndex = () => {
		byId('index').addEventListener('touchstart', e => {
			const [page, container] = getTargetPage(e);
			if (!page) return;
			container.classList.add('active');
		});
		byId('index').addEventListener('click', e => {
			const [page, container] = getTargetPage(e);
			if (!page) return;
			container.classList.remove('active');
			changeState({ page: page});
		});
		byClass(document, 'title').addEventListener('click', e => { history.back(); });
	};
	const removeCover = () => {
		const cover = byId('cover');
		setTimeout(() => { fadeout(cover); });
		setTimeout(() => { cover.parentNode.removeChild(cover); }, 500);
	};
	const setupSettingItems = () => {
		setupGestureList();
		setupEditDlg();
		setupOtherOptions();
		setupAdjustmentDlg();
		setupIndex();
		onPopState();
		removeCover();
	};

	// START HERE ! ------
	SimpleGesture.ini = (await storageValue('simple_gesture')) || SimpleGesture.ini;
	exData = (await storageValue('simple_gesture_exdata')) || exData;
	setupSettingItems();
	window.addEventListener('popstate', onPopState);
})();

