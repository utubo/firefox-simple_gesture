'use strict';

if (!browser.storage.local.set) {
	browser.storage.local = {
		...browser.storage.local,
		set: obj => new Promise(resolve => { storageOrg.local.set(obj, resolve); }),
		remove: key => new Promise(resolve => { storageOrg.local.remove(key, resolve); }),
	};
}

try {

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
	};
	const TIMERS = {};
	const MAX_LENGTH = SimpleGesture.MAX_LENGTH;
	SimpleGesture.MAX_LENGTH += 3; // margin of cancel to input.
	const NOP = () => {};

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
		for (let e = elm; e?.classList; e = e.parentNode) {
			if (e.classList.contains(clazz)) return e;
		}
	};

	const toggleClass = (b, clazz, ...elms) => {
		for (const elm of elms) {
			b ? elm.classList.add(clazz) : elm.classList.remove(clazz);
		}
	};

	const editStart = (...elms) => {
		for (const elm of elms) {
			elm.classList.add('editing');
			elm.removeAttribute('data-editEnd');
		}
	};

	const editEnd = (...elms) => {
		for (const elm of elms) {
			elm.setAttribute('data-editEnd', 1);
		}
		setTimeout(() => {
			for (const elm of elms) {
				if (elm.getAttribute('data-editEnd')) {
					elm.classList.remove('editing');
					elm.removeAttribute('data-editEnd');
				}
			}
		}, 1000);
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

	const toGestureObj = s => {
		let g = {
			startPoint: '',
			fingers: '',
			arrows: [],
		}
		if (!s) return g;
		const a = s.split(':');
		if (a[2]) {
			g.startPoint = a[0];
			g.fingers = a[1];
			g.arrows = a[2];
		} else if (!a[1]) {
			g.arrows = s;
		} else if (a[0].match(/[LRTB]/)) {
			g.startPoint = a[0];
			g.arrows = a[1];
		} else {
			g.fingers = a[0];
			g.arrows = a[1];
		}
		g.arrows = g.arrows.split('-');
		return g;
	};

	const fromGestureObj = g => `${g.startPoint || ''}${g.fingers || ''}${(g.arrows || []).slice(0, MAX_LENGTH).join('-')}`;

	const ifById = id => (typeof id === 'string') ? byId(id): id;
	const fadeout = elm => { ifById(elm).classList.add('transparent'); };
	const fadein = elm => { ifById(elm).classList.remove('transparent'); };

	// DOM objects --------------
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
	const $userAgentStatus = byId('userAgentStatus');
	const $timeout = byId('timeout');
	const $strokeSize = byId('strokeSize');
	const $bidingForms = allByClass('js-binding');
	const $preventPullToRefresh = byId('preventPullToRefresh');

	// edit U-D-L-R ------
	const updateGestureLabel = (arrowsLabel, addnlLabel, gesture) => {
		const g = toGestureObj(gesture);
		if (g.arrows.length) {
			SimpleGesture.drawArrows(g.arrows, arrowsLabel);
		} else {
			arrowsLabel.textContent = INSTEAD_OF_EMPTY.noGesture;
		}
		const addnl = SimpleGesture.getAddnlText(g.startPoint, g.fingers);
		addnlLabel.textContent = addnl;
		toggleClass(!addnl, 'hide', addnlLabel);
		return g.arrows;
	};
	const updateGestureItem = (label, gesture) => {
		const note = byClass(label.parentNode, 'arrows-note');
		const arrows = updateGestureLabel(label, note, gesture);
		toggleClass(!arrows.length, 'arrows-na', label);
		label.setAttribute('data-gesture', gesture || '');
	};

	const CLEAR_GESTURE = 'n/a'; // magic number
	const updateGesture = (gestureObj) => {
		if (gestureObj.arrows.length) {
			// make key. e.g.) `T-2-U-D`
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
		onShow: id => {
			target = { name: id.replace(/_[^_]+$/, '') };
			target.caption = byId(`${target.name}_caption`);
			target.arrows = byId(`${target.name}_arrows`);
			editStart(target.arrows);
			byId('editTarget').textContent = target.caption.textContent;
			updateGestureLabel(
				$inputedGesture,
				$inputedStartPoint,
				target.arrows.getAttribute('data-gesture')
			);
			toggleClass(false, 'dup', $inputedGesture, $inputedStartPoint);
			toggleClass(false, 'canceled', $inputedGesture);
			toggleClass(false, 'hover', $cancelInputGesture);
			$dupName.textContent = '';
			$preventPullToRefresh.scrollTop = 1000;
			$preventPullToRefresh.scrollLeft = 1000;
			dlgs.gestureDlg.backup = SimpleGesture.ini.maxFingers;
			SimpleGesture.ini.maxFingers = dlgs.gestureDlg.FREE_FOR_EDIT;
		},
		onHide: () => {
			if (SimpleGesture.ini.maxFingers === dlgs.gestureDlg.FREE_FOR_EDIT) {
				SimpleGesture.ini.maxFingers = dlgs.gestureDlg.backup;
			}
			if (!target) return;
			editEnd(target.arrows);
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
			if (e.target.tagName === 'INPUT') return;
			if (e.target.tagName === 'LABEL') return;
			if (e.target.tagName === 'SELECT') return;
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
			updateGesture({ arrows: [CLEAR_GESTURE] });
			history.back();
			safePreventDefault(e);
		}, move: NOP, end: NOP, cancel: NOP, });
	};

	// inject settings-page behavior
	SimpleGesture.onStart = e => {
		if (!target) return;
		safePreventDefault(e);
		return true;
	};
	SimpleGesture.onInput = e => {
		if (!target) return;
		if (e.arrows.length > SimpleGesture.MAX_LENGTH) {
			$inputedGesture.classList.add('canceled');
			$cancelInputGesture.classList.add('hover');
		}
		toggleClass(!e.startPoint && !e.fingers, 'hide', $inputedStartPoint);
		const gesture = fromGestureObj(e);
		updateGestureLabel($inputedGesture, $inputedStartPoint, gesture);
		let dup = SimpleGesture.ini.gestures[gesture];
		dup = (dup && dup !== target.name) ? getMessage(dup) : '';
		$dupName.textContent = dup ? `\u00a0(${dup})` : '';
		toggleClass(dup, 'dup', $inputedGesture, $inputedStartPoint);
		safePreventDefault(e);
		return true;
	};
	let touchEndTimer = null;
	SimpleGesture.onEnd = e => {
		clearTimeout(touchEndTimer);
		if (!target) return;
		if ($inputedGesture.classList.contains('canceled')) {
			history.back();
		} else {
			if (e.arrows?.length) {
				updateGesture(e);
				history.back();
			}
		}
		safePreventDefault(e);
		return true;
	};
	SimpleGesture.isNowaitSingleTap = () => false;

	// custom gesture ----
	const dataTargetId = e => e.target.getAttribute('data-targetId');
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
		onShow: async id => {
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
		onHide: () => {
			const c = findCustomGesture(dlgs.editDlg.targetId);
			editEnd(byId(`${c.id}_caption`));
			dlgs.editDlg.targetId = null;
		},
		onSubmit: () => {
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
		onSubmit: () => {
			deleteCustomGesture(dlgs.confirmDeleteDlg.targetId);
		},
	};

	// adjustment dlg ----
	const setupAdjustmentDlg = () => {
		const dlg = byId('adjustmentDlg');
		SimpleGesture.addTouchEventListener(dlg, {
			start: e => {
				[minX, minY] = SimpleGesture.getXY(e);
				[maxX, maxY] = [minX, minY];
				startTime = Date.now();
				safePreventDefault(e);
				e.stopPropagation();
			},
			move: e => {
				if (!startTime) return;
				const [x, y] = SimpleGesture.getXY(e);
				minX = Math.min(x, minX);
				minY = Math.min(y, minY);
				maxX = Math.max(x, maxX);
				maxY = Math.max(y, maxY);
				safePreventDefault(e);
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
			},
			cancel: NOP,
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
			editStart($timeout, $strokeSize);
		},
		onHide: () => {
			startTime = null;
			editEnd($timeout, $strokeSize);
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
		byId('blacklistSummary').textContent = count ? urls.join(', ') : getMessage('None');
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
		onHide: NOP,
		onSubmit: () => {
			const list = [];
			for (const input of allByClass('blacklist-input')) {
				if (input.value) {
					list.push({url: input.value});
				}
			}
			SimpleGesture.ini.blacklist = list;
			saveIni();
			setupBlacklistSummary();
		},
		init: () => {
			window.addEventListener('input', e => {
				if (e.target.classList.contains('blacklist-input')) {
					if (!e.target.parentNode.nextSibling) {
						const newItem = $blacklistTemplate.cloneNode(true);
						byId('blacklist').appendChild(newItem);
					}
					return;
				}
			});
		},
	};

	// color dlg ----
	const hex = d => Number(d).toString(16).padStart(2, '0');
	dlgs.colorDlg = {
		targetId: null,
		rgb: null,
		setRGB: rgb => {
			byId('sliderA').style.background =
				`linear-gradient(to right, transparent, ${rgb})`;
			dlgs.colorDlg.rgb = rgb;
		},
		onShow: id => {
			dlgs.colorDlg.targetId = id;
			const elm = byId(id);
			const a = byId('sliderA');
			a.style.color = elm.value;
			requestAnimationFrame(() => {
				const rgba = getComputedStyle(a).color.match(/[0-9.]+/g);
				a.value = rgba.length === 4 ? Math.round(Number(rgba[3]) * 255) : 255;
				const hexRGB = `#${hex(rgba[0])}${hex(rgba[1])}${hex(rgba[2])}`;
				dlgs.colorDlg.setRGB(hexRGB);
			});
		},
		onHide: NOP,
		onSubmit: () => {
			const a = Number(byId('sliderA').value) || 0;
			const t = byId(dlgs.colorDlg.targetId);
			t.value = dlgs.colorDlg.rgb + (a !== 255 ? hex(a) : '');
			onChangeColorText({ target: t });
		},
		init: () => {
			const f = document.createDocumentFragment();
			for (const c of [
				'#a4c639', // android green
				'#3fe1b0', // green
				'#00b3f4', // blue
				'#9059ff', // violet
				'#ff6bba', // pink
				'#e22850', // red
				'#ff8a50', // orange
				'#ffd567', // yellow
				'#f9f9fa', // white
				'#afafba', // gray
				'#23222b', // black
			]) {
				const t = document.createElement('div');
				t.className = 'color-tile';
				t.style.background = c;
				t.setAttribute('data-c', c);
				// only white and black have border.
				if (c === '#f9f9fa' || c === '#23222b') {
					t.style.borderColor = 'var(--secondery)';
				}
				f.appendChild(t);
			}
			const p = byId('pallet');
			p.appendChild(f);
			p.addEventListener('click', e => {
				if (e.target.className !== 'color-tile') return;
				dlgs.colorDlg.setRGB(e.target.getAttribute('data-c'));
			});
		},
	};

	// User-Agent switcher ----
	SimpleGesture.refreshUserAgentStatus = async () => {
		const state = await browser.runtime.sendMessage('isUserAgentSwitched');
		$userAgentStatus.checked = state;
	};
	const setupToggleUserAgent = async () => {
		await SimpleGesture.refreshUserAgentStatus();
		$userAgentStatus.addEventListener('input', async () => {
			await browser.runtime.sendMessage({
				command: 'toggleUserAgent',
				force: true,
				userAgent: $userAgentStatus.checked ? '' : null,
			});
			SimpleGesture.refreshUserAgentStatus();
		});
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) {
				SimpleGesture.refreshUserAgentStatus();
			}
		});
	};

	// edit text values --
	const saveBindingValues = () => {
		clearTimeout(TIMERS.saveBindingValues);
		for (const elm of $bidingForms) {
			const ini = elm.classList.contains('js-binding-exData') ? exData : SimpleGesture.ini;
			const t = elm.getAttribute('data-type') || elm.type;
			if (t === 'checkbox') {
				ini[elm.id] = elm.checked;
			} else if (elm.value === INSTEAD_OF_EMPTY[elm.id]) {
				ini[elm.id] = null;
			} else if (t === 'number') {
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

	// for Orion browser.
	const getMessageCompatible = key => {
		const msg = browser.i18n.getMessage(key);
		return key === msg ? '' : msg;
	}

	const getMessage = (s, isGesture) => {
		if (!s) return s;
		if (s[0] === CUSTOM_GESTURE_PREFIX) {
			const c = findCustomGesture(s);
			return c?.title || '';
		} else {
			try {
				const key = s.replace(/[^0-9a-zA-Z_]/g, '_');
				return isGesture &&
					getMessageCompatible(key + '__label') ||
					getMessageCompatible(key) ||
					s;
			} catch {
				return s;
			}
		}
	};
	const colorPreview = i => byClass(i.parentNode, 'color-preview');
	const onChangeColorText = e => {
		const id = e.target.id;
		resetTimer(`onchangecolortext_${id}`, () => {
			const value = e.target.value || INSTEAD_OF_EMPTY[id];
			colorPreview(e.target).style.backgroundColor = value;
			saveBindingValues();
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
		for (const caption of allByClass('i18n')) {
			caption.textContent = getMessage(caption.textContent);
		}
		for (const caption of allByClass('i18n-gesture')) {
			caption.textContent = getMessage(caption.textContent, true);
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
				elm.value = ini[elm.id] || INSTEAD_OF_EMPTY[elm.id] || (
					elm.type === 'number' ? 0 : ''
				);
			}
			elm.addEventListener('change', saveBindingValues);
			elm.addEventListener('input', saveBindingValuesDelay);
		}
		for (const elm of allByClass('color-text-input')) {
			elm.setAttribute('placeholder', INSTEAD_OF_EMPTY[elm.id]);
			onChangeColorText({ target: elm });
			elm.addEventListener('input', onChangeColorText);
			colorPreview(elm).addEventListener('click', e => {
				changeState({dlg: 'colorDlg', targetId: dataTargetId(e)});
			});
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
	// Touchstart event prevents click event in Input gesture Dialog.
	SimpleGesture.addTouchEventListener($cancelInputGesture, {
		start: NOP,
		move: NOP,
		end: e => {
			history.back();
			safePreventDefault(e);
		},
		cancel: NOP,
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
	addEventListener('error',  addErrorLog);

	// START HERE ! ------
	(async() => {
		try {
			SimpleGesture.ini = (await storageValue('simple_gesture')) || SimpleGesture.ini;
			exData = (await storageValue('simple_gesture_exdata')) || exData;
			await setupSettingItems();
		} catch (e) {
			addErrorLog(e);
		}
	})();

} catch (globalException) {
	alert(globalException);
}

