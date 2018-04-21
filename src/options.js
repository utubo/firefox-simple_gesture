(async () => {
	'use strict';

	// const -------------
	const CUSTOM_GESTURE_PREFIX = '$';
	const INSTEAD_OF_EMPTY = {
		userAgent: navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux'),
		noGesture: '-',
		defaultTitle: 'Custom Gesture',
		toastForeground: '#ffffff',
		toastBackground: '#21a1de',
	};
	const TIMERS = {};
	const HAS_HISTORY = 1 < history.length;
	const MAX_LENGTH = SimpleGesture.MAX_LENGTH;
	SimpleGesture.MAX_LENGTH += 9; // margin of cancel to input. 5 moves + 4 hyphens = 9 chars.

	// fields ------------
	let gestureNames = [];
	let dlgs = {};
	let target = null;
	let minX;
	let maxX;
	let minY;
	let maxY;
	let startTime = null;
	let exData = { customGestureList: [] };
	let openedDlg;

	// utils -------------
	const byId = id => document.getElementById(id);

	const byClass = (elm, clazz) => elm.getElementsByClassName(clazz)[0];

	const allByClass = clazz => document.getElementsByClassName(clazz);

	const parentByClass = (elm, clazz) => {
		for (let e = elm; e && e.classList; e = e.parentNode) {
			if (e.classList.contains(clazz)) return e;
		}
	};

	const toggleClass = (b, clazz, ...elms) => {
		for (let elm of elms) {
			b ? elm.classList.add(clazz) : elm.classList.remove(clazz);
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
		browser.storage.local.set({ simple_gesture_exdata: exData });
		resetTimer('reloadAllTabsIni', reloadAllTabsIni, 1000);
	};

	const reloadAllTabsIni = () => {
		browser.runtime.sendMessage('reloadAllTabsIni');
		SimpleGesture.loadIni();
	};

	const findCustomGesture = id => {
		return exData.customGestureList.find((e, i, a) => e.id === id);
	};

	const ifById = id => (typeof id === 'string') ? byId(id): id;
	const fadeout = elm => { ifById(elm).classList.add('transparent'); };
	const fadein = elm => { ifById(elm).classList.remove('transparent'); };

	// node --------------
	const templates = byId('templates');
	const gestureTemplate = byClass(templates, 'gesture-item');
	const buttonsTamplate = byClass(templates, 'custom-gesture-buttons');
	const inputedGesture = byId('inputedGesture');
	const dupName = byId('dupName');
	const customGestureList = byId('customGestureList');
	const customGestureTitle = byId('customGestureTitle');
	const customGestureType = byId('customGestureType');
	const customGestureURl = byId('customGestureUrl');
	const customGestureScript = byId('customGestureScript');
	const timeout = byId('timeout');
	const strokeSize = byId('strokeSize');
	const bidingForms = allByClass('js-binding');

	// edit UDLR ---------
	const refreshUDLRLabel = (label, udlr) => {
		label.textContent = udlr || INSTEAD_OF_EMPTY.noGesture;
		toggleClass(!udlr, 'udlr-na', label);
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
		history.back();
	};

	dlgs.gestureDlg = {
		onShow: id => {
			target = { name: id.replace(/_[^_]+$/, '') };
			target.caption = byId(`${target.name}_caption`);
			target.udlr = byId(`${target.name}_udlr`);
			toggleClass(true, 'editing', target.caption, target.udlr);
			byId('editTarget').textContent = target.caption.textContent;
			inputedGesture.textContent = target.udlr.textContent;
			inputedGesture.classList.remove('dup', 'canceled');
			dupName.textContent = '';
		},
		onHide: () => {
			if (!target) return;
			toggleClass(false, 'editing', target.caption, target.udlr);
			target = null;
		}
	};

	const getUDLR = name => {
		for (let g in SimpleGesture.ini.gestures) {
			if (SimpleGesture.ini.gestures[g] === name) return g;
		}
	};

	const createGestureItem = name => {
		const item = gestureTemplate.cloneNode(true);
		item.id = `${name}_item`;
		const label = byClass(item, 'udlr');
		label.id = `${name}_udlr`;
		refreshUDLRLabel(label, getUDLR(name));
		const caption = byClass(item, 'gesture-caption');
		caption.id = `${name}_caption`;
		caption.textContent = name;
		if (name[0] === CUSTOM_GESTURE_PREFIX) {
			const b = buttonsTamplate.cloneNode(true);
			byClass(b, 'custom-gesture-edit').setAttribute('data-targetId', name);
			byClass(b, 'custom-gesture-delete').setAttribute('data-targetId', name);
			item.insertBefore(b, item.firstChild);
		}
		return item;
	};

	const setupGestureList = () => {
		gestureNames = [];
		for (let list of allByClass('gesture-list')) {
			const gestures = list.getAttribute('data-gestures');
			if (!gestures) continue;
			for (let name of gestures.split(/\s+/)) {
				list.appendChild(createGestureItem(name));
				gestureNames.push(name);
			}
		}
		for (let c of exData.customGestureList) {
			customGestureList.appendChild(createGestureItem(c.id));
			gestureNames.push(c.id);
		}
		window.addEventListener('click', e => {
			if (!e.target.classList) return;
			if (e.target.tagName === 'INPUT') return;
			if (e.target.tagName === 'LABEL') return;
			if (e.target.tagName === 'SELECT') return;
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
			const item = parentByClass(e.target, 'gesture-item');
			if (item) {
				changeState({dlg: 'gestureDlg', targetId: item.id});
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
		if (gesture.length > SimpleGesture.MAX_LENGTH) {
			inputedGesture.classList.add('canceled');
		}
		inputedGesture.textContent = gesture.substring(0, MAX_LENGTH);
		let d = SimpleGesture.ini.gestures[inputedGesture.textContent];
		d = (d && d !== target.name) ? `\u00a0(${getMessage(d)})` : '';
		dupName.textContent = d;
		toggleClass(d, 'dup', inputedGesture);
		e.preventDefault();
		return false;
	};
	SimpleGesture.onGestured = (e, gesture) => {
		if (!target) return;
		if (inputedGesture.classList.contains('canceled')) {
			history.back();
		} else {
			updateGesture(gesture.substring(0, MAX_LENGTH));
		}
		e.preventDefault();
		return false;
	};

	// custom gesture ----
	const addCustomGesture = e => {
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
		customGestureList.appendChild(createGestureItem(c.id));
		byId(`${newId}_caption`).textContent = c.title;
	};
	const dataTargetId = e => e.target.getAttribute('data-targetId');
	const deleteCustomGesture = e => {
		const id = dataTargetId(e);
		browser.storage.local.remove(`simple_gesture_${id}`);
		exData.customGestureList = exData.customGestureList.filter((v, i, a) => v.id !== id);
		browser.storage.local.set({ simple_gesture_exdata: exData });
		byId(`${id}_item`).remove();
		gestureNames.some((v,i) => {
			if (v === id) gestureNames.splice(i, 1);
		});
		reloadAllTabsIni();
	};
	dlgs.editDlg = {
		targetId: null,
		onShow: async id => {
			dlgs.editDlg.targetId = id;
			customGestureTitle.value = findCustomGesture(id).title;
			const details = await storageValue(`simple_gesture_${id}`);
			customGestureType.value = details.type;
			customGestureUrl.value = details.type === 'url' ? details.url : '';
			customGestureScript.value = details.type === 'script' ? details.script : '';
			toggleEditor();
		},
		onHide: () => {
			dlgs.editDlg.targetId = null;
		}
	};
	const saveCustomGesture = e => {
		// save list
		const c = findCustomGesture(dlgs.editDlg.targetId);
		c.title = customGestureTitle.value;
		browser.storage.local.set({ simple_gesture_exdata: exData });
		// save detail
		const d = { type: customGestureType.value };
		switch(d.type) {
			case 'url': d.url = customGestureUrl.value; break;
			case 'script': d.script = customGestureScript.value; break;
		}
		const details = {};
		details[`simple_gesture_${c.id}`] = d;
		browser.storage.local.set(details);
		// update list
		byId(`${c.id}_caption`).textContent = c.title;
		reloadAllTabsIni(); // for toast
		history.back();
	};
	const toggleEditor = e => {
		toggleClass(customGestureType.value !== 'url', 'hide', customGestureUrl);
		toggleClass(customGestureType.value !== 'script', 'hide', customGestureScript, byId('customGestureScriptNote'));
		if (customGestureType.value !== 'script') return;
		const s = byId('addCommandToScript');
		const f = document.createDocumentFragment();
		f.appendChild(s.firstChild.cloneNode(true));
		for (let i of allByClass('gesture-item')) {
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
	const addCommand = e => {
		const name = e.target.value;
		if (!name) return;
		let script = `\nSimpleGesture.doCommand('${name}');\n`;
		if (name[0] === CUSTOM_GESTURE_PREFIX) {
			const title = findCustomGesture(name).title.replace(/\*/, ' ');
			script = `/* ${title} */${script}\n`;
		}
		customGestureScript.value += script;
		window.requestAnimationFrame(() => { e.target.selectedIndex = 0; });
	};
	const setupEditDlg = () => {
		byId('addCustomGesture').addEventListener('click', addCustomGesture);
		byId('saveCustomGesture').addEventListener('click', saveCustomGesture);
		byId('cancelCustomGesture').addEventListener('click', e => { history.back(); });
		customGestureType.addEventListener('change', toggleEditor);
		customGestureUrl.addEventListener('input', e => { resetTimer('autoTitle', autoTitleByUrl, 1000); });
		customGestureScript.addEventListener('input', e => { resetTimer('autoTitle', autoTitleByScript, 1000); });
		byId('addCommandToScript').addEventListener('change', addCommand);
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
				history.back();
			}
		});
		byId('timeoutAndStrokeSize').addEventListener('click', e => {
			if (e.target.tagName === 'INPUT') return;
			changeState({dlg: 'adjustmentDlg'});
		});
	};

	dlgs.adjustmentDlg = {
		onShow: () => {
			fadein('adjustmentDlg');
			clearTimeout(TIMERS.strokeSizeChanged);
			toggleClass(true, 'editing', timeout, strokeSize);
		},
		onHide: () => {
			startTime = null;
			resetTimer('strokeSizeChanged', () => { toggleClass(false, 'editing', timeout, strokeSize); }, 2000);
		}
	};

	// edit text values --
	const saveBindingValues = e => {
		clearTimeout(TIMERS.saveBindingValues);
		for (let elm of bidingForms) {
			const ini = elm.classList.contains('js-binding-exData') ? exData : SimpleGesture.ini;
			if (elm.type === 'checkbox') {
				ini[elm.id] = elm.checked;
			} else if (elm.value === INSTEAD_OF_EMPTY[elm.id]) {
				ini[elm.id] = null;
			} else if (elm.type === 'number' && elm.value.match(/[^\d]/)) {
				continue; // ignore invalid number.
			} else {
				ini[elm.id] = elm.value;
			}
		}
		saveIni();
		toggleExperimental();
	};

	const saveBindingValuesDelay = e => {
		resetTimer('saveBindingValues', saveBindingValues, 3000);
	};

	const getMessage = s => {
		if (!s) return s;
		if (s[0] === CUSTOM_GESTURE_PREFIX) {
			return findCustomGesture(s).title;
		} else {
			return chrome.i18n.getMessage(s) || s;
		}
	};
	const onChangeColor = e => {
		e.target.parentNode.style.backgroundColor = e.target.value;
		byId(e.target.id.replace(/^color_/, '')).value = e.target.value;
		saveBindingValues();
	};
	const onChangeColorText = e => {
		const id = e.target.id;
		resetTimer(`onchangecolortext_${id}`, () => {
			const colorInput = byId(`color_${id}`);
			const value = byId(id).value || INSTEAD_OF_EMPTY[id];
			if (value !== colorInput.parentNode.style.backgroundColor) {
				colorInput.value = value;
				colorInput.parentNode.style.backgroundColor = value;
			}
		}, 500);
	};
	const onChecked = e => {
		for (let elm of allByClass(`js-linked-${e.target.id}`)) {
			toggleClass(!e.target.checked, 'disabled', elm);
		}
	};
	const toggleExperimental = () => {
		for (let elm of allByClass('experimental')) {
			toggleClass(!exData.experimental, 'hide', elm);
		}
	};
	const setupOtherOptions = () => {
		for (let caption of allByClass('caption')) {
			caption.textContent = getMessage(caption.textContent);
		}
		byId('close_item').appendChild(byId('afterClose_item'));
		byId('newTab_item').appendChild(byId('newTabUrl_item'));
		byId('toggleUserAgent_item').appendChild(byId('userAgent_item'));
		byId('defaultUserAgent').value = INSTEAD_OF_EMPTY.userAgent;
		for (let elm of bidingForms) {
			const ini = elm.classList.contains('js-binding-exData') ? exData : SimpleGesture.ini;
			if (elm.type === 'checkbox') {
				elm.checked = !!ini[elm.id];
				elm.addEventListener('change', onChecked);
			} else {
				elm.value = ini[elm.id] || INSTEAD_OF_EMPTY[elm.id] || '';
			}
			elm.addEventListener('change', saveBindingValues);
			elm.addEventListener('input', saveBindingValuesDelay);
		}
		for (let elm of allByClass('color-text-input')) {
			elm.setAttribute('placeholder', INSTEAD_OF_EMPTY[elm.id]);
			onChangeColorText({ target: elm });
			elm.addEventListener('input', onChangeColorText);
			byId(`color_${elm.id}`).addEventListener('change', onChangeColor);
		}
		toggleExperimental();
	};

	// control Back button
	const changeState = state => {
		if (!state.dlg) return;
		history.pushState(state, document.title);
		onPopState({ state: state });
	};
	const onPopState = e => {
		const state = e.state || history.state || { y: 0 };
		if (openedDlg && !state.dlg) {
			dlgs[openedDlg.id].onHide();
			fadeout(openedDlg);
			openedDlg = null;
		} else if (state.dlg) {
			dlgs[state.dlg].onShow(state.targetId);
			openedDlg = byId(state.dlg);
			fadein(openedDlg);
		} else {
			setTimeout(() => { window.scrollTo(0, state.y); });
		}
	};
	const scrollIntoView = target => {
		onScrollEnd({ fource: true }); // For returning during scrolling.
		target.scrollIntoView(true);
	};
	const onScrollEnd = e => {
		if (openedDlg) return;
		const hasOldY = history.state && 'y' in history.state;
		const newY = window.pageYOffset;
		if (newY || e && e.fource) {
			if (hasOldY) {
				history.replaceState({ y: newY }, document.title);
			} else {
				history.pushState({ y: newY }, document.title);
			}
		} else if (hasOldY) {
			// Prevent to stack histories.
			history.back();
			// Cancel scroll by `history.back();`.
			setTimeout(() => { window.scrollTo({ top: 0, behavior: 'instant' }); });
		}
	};
	window.addEventListener('scroll', e => { resetTimer('onScrollEnd', onScrollEnd, 500); });
	window.addEventListener('popstate', onPopState);

	// setup options page
	const doTargetPage = (e, f) => {
		const item = parentByClass(e.target, 'item');
		const page = item && item.getAttribute('data-targetPage');
		page && f(item, page);
	};
	const setupIndex = () => {
		const index = byId('index');
		index.addEventListener('click', e => { doTargetPage(e, (item, page) => { scrollIntoView(byId(page)); }); });
		// Highlight when touched with JS. (css ':active' does not work.)
		index.addEventListener('touchstart', e => { doTargetPage(e, (item, page) => { item.classList.add('active'); }); });
		index.addEventListener('touchend', e => { doTargetPage(e, (item, page) => { item.classList.remove('active'); }); });
		// Fix page heights with JS. (css 'min-height: 100vh' has probrem of scroll position.)
		setTimeout(() => { document.styleSheets.item(0).insertRule(`.page { min-height: ${innerHeight}px; }`, 0); });
	};
	const removeCover = () => {
		const cover = byId('cover');
		setTimeout(() => { fadeout(cover); });
		setTimeout(() => { cover.remove(); }, 500);
	};
	const setupSettingItems = () => {
		setupGestureList();
		setupEditDlg();
		setupOtherOptions();
		setupAdjustmentDlg();
		setupIndex();
		onPopState(history);
		removeCover();
	};

	// START HERE ! ------
	SimpleGesture.ini = (await storageValue('simple_gesture')) || SimpleGesture.ini;
	exData = (await storageValue('simple_gesture_exdata')) || exData;
	setupSettingItems();
})();

