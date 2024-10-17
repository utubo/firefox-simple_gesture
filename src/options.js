(async () => {
	'use strict';

	// const -------------
	const CUSTOM_GESTURE_PREFIX = '$';
	const INSTEAD_OF_EMPTY = {
		userAgent: navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux'),
		noGesture: ' ',
		defaultTitle: 'Custom Gesture',
		toastForeground: '#ffffff',
		toastBackground: '#21a1de',
	};
	const TIMERS = {};
	const MAX_LENGTH = SimpleGesture.MAX_LENGTH;
	SimpleGesture.MAX_LENGTH += 9; // margin of cancel to input. 5 moves + 4 hyphens = 9 chars.

	// fields ------------
	let gestureNames = [];
	let target = null;
	let minX;
	let maxX;
	let minY;
	let maxY;
	let startTime = null;
	let exData = { customGestureList: [] };
	let openedDlg;
	const dlgs = {};

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
		for (const elm of elms) {
			b ? elm.classList.add(clazz) : elm.classList.remove(clazz);
		}
	};

	const hilightEditStart = (...elms) => {
		for (const elm of elms) {
			elm.classList.add('editing');
			elm.removeAttribute('data-unhilightEditEnd');
		}
	};

	const unhilightEditEnd = (...elms) => {
		for (const elm of elms) {
			elm.setAttribute('data-unhilightEditEnd', 1);
		}
		setTimeout(() => {
			for (const elm of elms) {
				if (elm.getAttribute('data-unhilightEditEnd')) {
					elm.classList.remove('editing');
					elm.removeAttribute('data-unhilightEditEnd');
				}
			}
		}, 1000);
	};

	const swapKeyValue = m => {
		const s = {};
		for (const key in m) {
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
			addErrorLog(new Error(`failed to load setting. key=${name}.`), e);
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

	const findCustomGesture = id => exData.customGestureList.find(c => c.id === id);

	/**
	 * e.g.
	 * 'T:L-R' to ['T', 'L-R']
	 * 'U-D' to ['', 'U-D']
	 * '' to ['', '']
	 */
	const toStartPointAndArrows = s => (s ? s[1] === ':' ? s.split(':') : ['', s] : ['', '']);

	const ifById = id => (typeof id === 'string') ? byId(id): id;
	const fadeout = elm => { ifById(elm).classList.add('transparent'); };
	const fadein = elm => { ifById(elm).classList.remove('transparent'); };

	// node --------------
	const $templates = byId('templates');
	const $gestureTemplate = byClass($templates, 'gesture-item');
	const $buttonsTamplate = byClass($templates, 'custom-gesture-buttons');
	const $blacklistTemplate = byClass($templates, 'blacklist-item');
	const $inputedGesture = byId('inputedGesture');
	const $inputedStartPoint = byId('inputedStartPoint');
	const $dupName = byId('dupName');
	const $cancelInputGesture = byId('cancelInputGesture');
	const $customGestureList = byId('customGestureList');
	const $customGestureDlgContainer = byId('customGestureDlgContainer');
	const $customGestureTitle = byId('customGestureTitle');
	const $customGestureType = byId('customGestureType');
	const $customGestureUrl = byId('customGestureUrl');
	const $customGestureScript = byId('customGestureScript');
	const $timeout = byId('timeout');
	const $strokeSize = byId('strokeSize');
	const $bidingForms = allByClass('js-binding');

	// edit U-D-L-R ------
	const updateArrowsLabel = (arrowsLabel, startPointLabel, gesture) => {
		const [startPoint, arrows] = toStartPointAndArrows(gesture);
		if (arrows) {
			SimpleGesture.drawArrows(arrows, arrowsLabel);
		} else {
			arrowsLabel.textContent = INSTEAD_OF_EMPTY.noGesture;
		}
		startPointLabel.textContent = startPoint ? `(${browser.i18n.getMessage(`fromEdge-${startPoint[0]}`)})` : '';
		return [startPoint, arrows];
	};
	const updateGestureItem = (label, gesture) => {
		const note = byClass(label.parentNode, 'arrows-note');
		const [startPoint, arrows] = updateArrowsLabel(label, note, gesture);
		toggleClass(!startPoint, 'hide', note);
		toggleClass(!arrows, 'arrows-na', label);
		label.setAttribute('data-gesture', gesture || '');
	};

	const CLEAR_GESTURE = 'n/a'; // magic number
	const updateGesture = (arrows, startPoint) => {
		if (arrows) {
			let gesture = (startPoint || '') + arrows;
			if (gesture === CLEAR_GESTURE) {
				gesture = null;
			} else {
				SimpleGesture.ini.gestures[gesture] = null;
			}
			const arrowss = swapKeyValue(SimpleGesture.ini.gestures);
			arrowss[target.name] = gesture;
			SimpleGesture.ini.gestures = swapKeyValue(arrowss);
			saveIni();
			for (const name of gestureNames) {
				 updateGestureItem(byId(`${name}_arrows`), arrowss[name]);
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
		onShow: id => {
			target = { name: id.replace(/_[^_]+$/, '') };
			target.caption = byId(`${target.name}_caption`);
			target.arrows = byId(`${target.name}_arrows`);
			hilightEditStart(target.arrows);
			byId('editTarget').textContent = target.caption.textContent;
			const [startPoint, _] = updateArrowsLabel(
				$inputedGesture,
				$inputedStartPoint,
				target.arrows.getAttribute('data-gesture')
			);
			toggleClass(!startPoint, 'hide', $inputedStartPoint);
			toggleClass(false, 'dup', $inputedGesture, $inputedStartPoint);
			toggleClass(false, 'canceled', $inputedGesture);
			toggleClass(false, 'hover', $cancelInputGesture);
			$dupName.textContent = '';
			byId('preventPullToRefresh').scrollTop = 1000;
			byId('preventPullToRefresh').scrollLeft = 1000;
		},
		onHide: () => {
			if (!target) return;
			unhilightEditEnd(target.arrows);
			target = null;
		}
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
			item.insertBefore(b, item.firstChild);
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
		if (browser.runtime.getManifest().manifest_version === 3) {
			byId('doesNotSupportCustomGesture').classList.remove('hide')
			byId('customGestureList').classList.add('disabled')
			byId('addCustomGesture').classList.add('disabled')
		} else {
			for (const c of exData.customGestureList) {
				$customGestureList.appendChild(createGestureItem(c.id));
				gestureNames.push(c.id);
			}
		}
		toggleDoubleTapNote();
		window.addEventListener('click', e => {
			if (!e.target.classList) return;
			if (e.target.tagName === 'INPUT') return;
			if (e.target.tagName === 'LABEL') return;
			if (e.target.tagName === 'SELECT') return;
			if (e.target.classList.contains('with-checkbox')) return;
			if (e.target.classList.contains('custom-gesture-edit')) {
				changeState({dlg: 'editDlg', targetId: dataTargetId(e)});
				return;
			}
			if (e.target.classList.contains('custom-gesture-delete')) {
				if (confirm(browser.i18n.getMessage('message_delete_confirm'))) {
					deleteCustomGesture(e);
				}
				return;
			}
			if (e.target.classList.contains('delete-blacklist')) {
				const blacklistItem = parentByClass(e.target, 'blacklist-item');
				byClass(blacklistItem, 'blacklist-input').value = '';
				if (blacklistItem.nextSibling) {
					blacklistItem.remove();
				}
				return;
			}
			const item = parentByClass(e.target, 'gesture-item');
			if (item) {
				changeState({dlg: 'gestureDlg', targetId: item.id});
				return;
			}
		});
		SimpleGesture.addTouchEventListener(byId('clearGesture'), { start: e => {
			updateGesture(CLEAR_GESTURE);
			history.back();
			e.preventDefault();
		}, move: () => {}, end: () => {} });
	};

	// inject settings-page behavior
	SimpleGesture.onStart = e => {
		if (!target) return;
		e.preventDefault();
		return false;
	};
	SimpleGesture.onInput = e => {
		if (!target) return;
		if (e.gesture.length > SimpleGesture.MAX_LENGTH) {
			$inputedGesture.classList.add('canceled');
			$cancelInputGesture.classList.add('hover');
		}
		toggleClass(!e.startPoint, 'hide', $inputedStartPoint);
		const gesture = e.startPoint + e.gesture.substring(0, MAX_LENGTH);
		updateArrowsLabel($inputedGesture, $inputedStartPoint, gesture);
		let dup = SimpleGesture.ini.gestures[gesture];
		dup = (dup && dup !== target.name) ? getMessage(dup) : '';
		$dupName.textContent = dup ? `\u00a0(${dup})` : '';
		toggleClass(dup, 'dup', $inputedGesture, $inputedStartPoint);
		e.preventDefault();
		return false;
	};
	let touchEndTimer = null;
	SimpleGesture.onEnd = e => {
		clearTimeout(touchEndTimer);
		if (!target) return;
		if ($inputedGesture.classList.contains('canceled')) {
			history.back();
		} else {
			const g = (e.gesture || '').substring(0, MAX_LENGTH);
			if (g) {
				updateGesture(g, e.startPoint);
				history.back();
			}
		}
		e.preventDefault();
		return false;
	};

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
	const dataTargetId = e => e.target.getAttribute('data-targetId');
	const deleteCustomGesture = e => {
		const id = dataTargetId(e);
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
		onShow: async id => {
			dlgs.editDlg.targetId = id;
			$customGestureTitle.value = findCustomGesture(id).title;
			const details = await storageValue(`simple_gesture_${id}`);
			$customGestureType.value = details.type;
			$customGestureUrl.value = details.type === 'url' ? details.url : '';
			$customGestureScript.value = details.type === 'script' ? details.script : '';
			document.forms.customGestureMsg.customGestureMsgId.value = details.extensionId || '';
			document.forms.customGestureMsg.customGestureMsgValue.value = details.message || '';
			document.forms.customGestureMsg.messageType.value = details.messageType || 'string';
			const c = findCustomGesture(dlgs.editDlg.targetId);
			hilightEditStart(byId(`${c.id}_caption`));
			toggleEditor();
		},
		onHide: () => {
			const c = findCustomGesture(dlgs.editDlg.targetId);
			unhilightEditEnd(byId(`${c.id}_caption`));
			dlgs.editDlg.targetId = null;
		}
	};
	const saveCustomGesture = () => {
		// save list
		const c = findCustomGesture(dlgs.editDlg.targetId);
		c.title = $customGestureTitle.value;
		browser.storage.local.set({ simple_gesture_exdata: exData });
		// save detail
		const d = { type: $customGestureType.value };
		switch(d.type) {
			case 'url': d.url = $customGestureUrl.value; break;
			case 'script': d.script = $customGestureScript.value; break;
			case 'message':
				d.extensionId = document.forms.customGestureMsg.customGestureMsgId.value;
				d.message = document.forms.customGestureMsg.customGestureMsgValue.value;
				d.messageType = document.forms.customGestureMsg.messageType.value;
				break;
		}
		const details = {};
		details[`simple_gesture_${c.id}`] = d;
		browser.storage.local.set(details);
		// update list
		byId(`${c.id}_caption`).textContent = c.title;
		reloadAllTabsIni(); // for toast
		history.back();
	};
	const toggleEditor = () => {
		toggleClass(customGestureType.value === 'script', 'dlg-fill', $customGestureDlgContainer);
		toggleClass(customGestureType.value !== 'url', 'hide', $customGestureUrl);
		toggleClass(customGestureType.value !== 'script', 'hide', byId('customGestureScriptDiv'));
		toggleClass(customGestureType.value !== 'message', 'hide', byId('customGestureMsgDiv'));
		if ($customGestureType.value !== 'script') return;
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
		if ($customGestureTitle.value && $customGestureTitle.value !== INSTEAD_OF_EMPTY.defaultTitle) return;
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
			script = `\n/* ${title} */${script}`;
		}
		$customGestureScript.value += script;
		$customGestureScript.selectStart = $customGestureScript.value.length;
		$customGestureScript.scrollTop = $customGestureScript.scrollHeight;
		requestAnimationFrame(() => { e.target.selectedIndex = 0; });
	};
	const setupEditDlg = () => {
		byId('addCustomGesture').addEventListener('click', addCustomGesture);
		byId('saveCustomGesture').addEventListener('click', saveCustomGesture);
		$customGestureType.addEventListener('change', toggleEditor);
		$customGestureUrl.addEventListener('input', () => { resetTimer('autoTitle', autoTitleByUrl, 1000); });
		$customGestureScript.addEventListener('input', () => { resetTimer('autoTitle', autoTitleByScript, 1000); });
		byId('addCommandToScript').addEventListener('change', addCommand);
	};

	// adjustment dlg ----
	const setupAdjustmentDlg = () => {
		const dlg = byId('adjustmentDlg');
		SimpleGesture.addTouchEventListener(dlg, {
			start: e => {
				[minX, minY] = SimpleGesture.getXY(e);
				[maxX, maxY] = [minX, minY];
				startTime = Date.now();
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
			end: () => {
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
			hilightEditStart($timeout, $strokeSize);
		},
		onHide: () => {
			startTime = null;
			unhilightEditEnd($timeout, $strokeSize);
		}
	};

	// blacklist dlg ----
	const setupBlacklistSummary = () => {
		let count = 0;
		const urls = [];
		for (const item of (SimpleGesture.ini.blacklist || [])) {
			urls.push(item.url);
			if (5 < ++count) {
				urls.push('...');
				break;
			}
		}
		byId('blacklistSummary').textContent = count ? urls.join(', ') : browser.i18n.getMessage('None');
	};
	dlgs.blacklistDlg = {
		onShow: () => {
			const blacklist = byId('blacklist');
			const newList = blacklist.cloneNode(false);
			if (SimpleGesture.ini.blacklist) {
				for (const urlPattern of SimpleGesture.ini.blacklist) {
					const item = $blacklistTemplate.cloneNode(true);
					byClass(item, 'blacklist-input').value = urlPattern.url;
					newList.appendChild(item);
				}
			}
			const newItem = $blacklistTemplate.cloneNode(true);
			newList.appendChild(newItem);
			blacklist.parentNode.replaceChild(newList, blacklist);
		},
		onHide: () => {
		}
	};
	byId('saveBlacklist').addEventListener('click', () => {
		const list = [];
		for (const input of allByClass('blacklist-input')) {
			if (input.value) {
				list.push({url: input.value});
			}
		}
		SimpleGesture.ini.blacklist = list;
		saveIni();
		setupBlacklistSummary();
		history.back();
	});
	window.addEventListener('input', e => {
		if (e.target.classList.contains('blacklist-input')) {
			if (!e.target.parentNode.nextSibling) {
				const newItem = $blacklistTemplate.cloneNode(true);
				byId('blacklist').appendChild(newItem);
			}
			return;
		}

	});

	// edit text values --
	const saveBindingValues = () => {
		clearTimeout(TIMERS.saveBindingValues);
		for (const elm of $bidingForms) {
			const ini = elm.classList.contains('js-binding-exData') ? exData : SimpleGesture.ini;
			if (elm.type === 'checkbox') {
				ini[elm.id] = elm.checked;
			} else if (elm.value === INSTEAD_OF_EMPTY[elm.id]) {
				ini[elm.id] = null;
			} else if (elm.type === 'number') {
				if (elm.value.match(/^\d+$/)) {
					ini[elm.id] = Number(elm.value);
				}
			} else {
				ini[elm.id] = elm.value;
			}
		}
		saveIni();
		toggleExperimental();
		toggleDoubleTapNote();
	};

	const saveBindingValuesDelay = () => {
		resetTimer('saveBindingValues', saveBindingValues, 3000);
	};

	const getMessage = s => {
		if (!s) return s;
		if (s[0] === CUSTOM_GESTURE_PREFIX) {
			const c = findCustomGesture(s);
			return c && c.title || '';
		} else {
			return browser.i18n.getMessage(s) || s;
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
				saveBindingValues();
			}
		}, 500);
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
	const importSetting = async text => {
		try {
			const obj = JSON.parse(text);
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
	const exportSetting = async () => {
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
		byId('splashVersion').textContent = 'version ' + browser.runtime.getManifest().version;
		for (const caption of allByClass('i18n')) {
			caption.textContent = getMessage(caption.textContent);
		}
		document.documentElement.lang = await browser.i18n.getUILanguage();
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
				elm.addEventListener('change', onChecked);
			} else {
				elm.value = ini[elm.id] || INSTEAD_OF_EMPTY[elm.id] || '';
			}
			elm.addEventListener('change', saveBindingValues);
			elm.addEventListener('input', saveBindingValuesDelay);
		}
		for (const elm of allByClass('color-text-input')) {
			elm.setAttribute('placeholder', INSTEAD_OF_EMPTY[elm.id]);
			onChangeColorText({ target: elm });
			elm.addEventListener('input', onChangeColorText);
			byId(`color_${elm.id}`).addEventListener('change', onChangeColor);
		}
		toggleExperimental();
		byId('importSetting').addEventListener('change', e => {
			try {
				if (!e.target.files[0]) return;
				const reader = new FileReader();
				reader.onload = () => { importSetting(reader.result); };
				reader.readAsText(e.target.files[0]);
			} catch (error) {
				alert(error.message);
			}
		});
		byId('exportSetting').addEventListener('click', exportSetting);
		byId('blacklistEdit').addEventListener('click', () => {
			changeState({dlg: 'blacklistDlg'});
		});
		setupBlacklistSummary();
		// Firefox cant open link. bug?
		byId('exp_readme').addEventListener('click', e => {
			browser.tabs.create({ active: true, url: 'experimental.html' });
			e.preventDefault();
		});
	};

	// common events
	addEventListener('click', e => {
		if (!e?.target.classList) return;
		if (e.target.classList.contains('js-history-back')) {
			history.back();
		}
	});
	// Touchstart event prevents click event in Input gesture Dialog.
	SimpleGesture.addTouchEventListener($cancelInputGesture, { start: e => {
		history.back();
		e.preventDefault();
	}, move: () => {}, end: () => {} });

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
			dlgs[state.dlg].onShow(state.targetId);
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
		if (newY || e && e.force) {
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
				window.scrollTo({ top: 0, behavior: 'smooth' });
			} finally {
				preventPopStateEvent = false;
			}
		}
	};
	window.addEventListener('scroll', () => { resetTimer('onScrollEnd', onScrollEnd, 200); });
	window.addEventListener('popstate', onPopState);

	// setup options page
	const setupIndexPage = () => {
		const indexPage = byId('index');
		indexPage.addEventListener('click', e => {
			const item = parentByClass(e.target, 'item');
			const page = item?.getAttribute('data-targetPage');
			if (page) {
				scrollIntoView(byId(page));
			}
		});
		// Highlight when touched with JS. (css ':active' does not work.)
		indexPage.addEventListener('touchstart', e => {
			const item = parentByClass(e.target, 'item');
			item?.classList?.add('active');
		});
		addEventListener('touchend', () => {
			for (const item of indexPage.getElementsByClassName('active')) {
				item.classList.remove('active');
			}
		});
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
	};
	const setupSettingItems = async () => {
		setupGestureList();
		setupEditDlg();
		await setupOtherOptions();
		setupAdjustmentDlg();
		setupIndexPage();
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
		if (cause && cause.stack) stack.push(cause.stack.split('\n').slice(0, 2).join('\n'));
		if (err.stack) stack.push(err.stack);
		if (stack.length) {
			const s = document.createElement('DIV');
			s.classList.add('stacktrace');
			s.textContent = stack.join('\n');
			div.appendChild(s);
		}
		addLog(div);
	};
	addEventListener('error',  addErrorLog);

	// START HERE ! ------
	try {
		SimpleGesture.ini = (await storageValue('simple_gesture')) || SimpleGesture.ini;
		exData = (await storageValue('simple_gesture_exdata')) || exData;
		await setupSettingItems();
	} catch (e) {
		addErrorLog(e);
	}
})();

