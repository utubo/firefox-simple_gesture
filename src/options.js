(() => {
	'use strict';

	// const -------------
	let GESTURE_NAMES = [
		'forward',
		'back',
		'top',
		'bottom',
		'nextTab',
		'prevTab',
		'reload',
		'close',
		'newTab',
		'toggleUserAgent',
		'disableGesture'
	];
	let INSTEAD_OF_EMPTY = {
		'userAgent': navigator.userAgent.replace(/Android[^;\)]*/, 'X11').replace(/Mobile|Tablet/, 'Linux')
	};
	let MAX_INPUT_LENGTH = SimpleGesture.MAX_LENGTH - 2;

	// fields ------------
	let editTarget = null;
	let minX;
	let maxX;
	let minY;
	let maxY;
	let startTime = null;

	// utils -------------
	let byId = id => document.getElementById(id);

	let byClass = (elm, clazz) => elm.getElementsByClassName(clazz)[0];

	let swapKeyValue = m => {
		let s = {};
		for (let key in m) {
			let value = m[key];
			if (value) s[value] = key;
		}
		return s;
	};

	// functions ---------
	let saveIni = () => {
		browser.storage.local.set({ 'simple_gesture': SimpleGesture.ini });
	};

	let refreshUDLRLabel = (label, udlr) => {
		if (udlr) {
			label.textContent = udlr;
			label.classList.remove('udlr-na');
		} else {
			label.textContent = '-';
			label.classList.add('udlr-na');
		}
	};

	let DELETE_GESTURE = 'n/a';
	let updateGesture = gesture => {
		if (gesture) {
			if (gesture === DELETE_GESTURE) {
				gesture = null;
			} else {
				SimpleGesture.ini.gestures[gesture] = null;
			}
			let gestureValues = swapKeyValue(SimpleGesture.ini.gestures);
			gestureValues[editTarget] = gesture;
			SimpleGesture.ini.gestures = swapKeyValue(gestureValues);
			saveIni();
			for (let gestureName of GESTURE_NAMES) {
				 refreshUDLRLabel(byId('udlr_' + gestureName), gestureValues[gestureName]);
			}
		}
		byId('gesture_radio_' + editTarget).checked = false;
		byId('gestureArea').classList.add('transparent');
		editTarget = null;
	};

	let refreshTimeoutAndStrokeSize = () => {
		byId('timeout').value = SimpleGesture.ini.timeout;
		byId('strokeSize').value = SimpleGesture.ini.strokeSize;
	};

	let setupAdjustBox = () => {
		let box = byId('adjustBox');
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
				let [x, y] = SimpleGesture.getXY(e);
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
				window.setTimeout(() => {
					byId('timeout').classList.remove('editing');
					byId('strokeSize').classList.remove('editing');
				}, 2000);
			}
		});
		byId('timeoutAndStrokeSize').addEventListener('click', e => {
			if (e.target.tagName === 'INPUT') return;
			box.classList.remove('transparent');
			byId('timeout').classList.add('editing');
			byId('strokeSize').classList.add('editing');
			e.preventDefault();
		});
	};

	let setupGestureInputBox = () => {
		let gestureValues = swapKeyValue(SimpleGesture.ini.gestures);
		// gestures
		let template = byClass(document, 'gesture_template');
		let setEditTarget = e => {
			editTarget = e.target.id.replace(/^.+_/, '');
			byId('editTarget').textContent = byId('caption_' + editTarget).textContent;
			byId('inputedGesture').textContent = byId('udlr_' + editTarget).textContent;
			byId('gestureArea').classList.remove('transparent');
		};
		for (let gestureName of GESTURE_NAMES) {
			let container = template.cloneNode(true);
			container.id = gestureName + "_container";
			container.className = "gesture-container";
			let toggleRadio = byClass(container, 'toggle-radio');
			toggleRadio.id = 'gesture_radio_' + gestureName;
			toggleRadio.addEventListener('click', setEditTarget);
			let label = byClass(container, 'udlr');
			label.id = 'udlr_' + gestureName;
			refreshUDLRLabel(label, gestureValues[gestureName]);
			let caption = byClass(container, 'gesture-caption');
			caption.id = 'caption_' + gestureName;
			caption.textContent = gestureName;
			caption.parentNode.setAttribute('for', toggleRadio.id);
			template.parentNode.insertBefore(container, template);
		}
		SimpleGesture.addTouchEventListener(byId('deleteGesture'), { start: e => {
			updateGesture(DELETE_GESTURE);
			e.preventDefault();
		}, move: e => {}, end: e => {} });
	};

	let setupOtherOptions = () => {
		byId('newTab_container').appendChild(byId('newTabUrl_container'));
		for (let caption of document.getElementsByClassName('caption')) {
			if (!caption.textContent) continue;
			caption.textContent = chrome.i18n.getMessage('caption_' + caption.textContent) || caption.textContent;
		}
		byId('toggleUserAgent_container').appendChild(byId('userAgent_container'));
		byId('defaultUserAgent').value = INSTEAD_OF_EMPTY.userAgent;
		let onValueChange = e => {
			if (e.target.value === INSTEAD_OF_EMPTY[e.target.id]) {
				SimpleGesture.ini[e.target.id] = null;
			} else if (e.target.type === "number" && e.target.value.match(/[^\d]/)) {
				// invalid number.
				return;
			} else {
				SimpleGesture.ini[e.target.id] = e.target.value;
			}
			saveIni();
		};
		for (let id of ['newTabUrl', 'userAgent', 'timeout', 'strokeSize']) {
			let inputElm = byId(id);
			inputElm.value = SimpleGesture.ini[id] || INSTEAD_OF_EMPTY[id] || '';
			inputElm.addEventListener('change', onValueChange);
		}
	};

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

	// START HERE ! ------
	browser.storage.local.get('simple_gesture').then(res => {
		if (res && res.simple_gesture) {
			SimpleGesture.ini = res.simple_gesture;
		}
		setupGestureInputBox();
		setupOtherOptions();
		setupAdjustBox();
	});

})();

