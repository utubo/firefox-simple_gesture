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

	// fields ------------
	let editTarget = null;

	// functions ---------
	let byId = id => document.getElementById(id);
	let swapKeyValue = m => {
		let s = {};
		for (let key in m) {
			let value = m[key];
			s[value] = key;
		}
		return s;
	};

	let saveIni = () => {
		browser.storage.local.set({ 'simple_gesture': SimpleGesture.ini });
	};

	let updateGesture = (gesture) => {
		if (gesture) {
			SimpleGesture.ini.gestures[gesture] = null;
			let gestureValues = swapKeyValue(SimpleGesture.ini.gestures);
			gestureValues[editTarget] = gesture;
			SimpleGesture.ini.gestures = swapKeyValue(gestureValues);
			saveIni();
			for (let gestureName of GESTURE_NAMES) {
				byId('udlr_' + gestureName).textContent = gestureValues[gestureName] || '-';
			}
		}
		setTimeout(() => {
			byId('gesture_radio_' + editTarget).checked = false;
			byId('gestureArea').classList.add('transparent');
			editTarget = null;
		}, 1);
	};

	let setupGestureInputBox = () => {
		let gestureValues = swapKeyValue(SimpleGesture.ini.gestures);
		// gestures
		let template = document.getElementsByClassName('gesture_template')[0];
		let setEditTarget = e => {
			editTarget = e.target.id.replace(/^.+_/, '');
			byId('editTarget').textContent = byId('caption_' + editTarget).textContent;
			byId('inputedGesture').textContent = '';
			byId('gestureArea').classList.remove('transparent');
		};
		for (let gestureName of GESTURE_NAMES) {
			let container = template.cloneNode(true);
			container.id = gestureName + "_container";
			container.className = "gesture-container";
			let toggleRadio = container.getElementsByClassName('toggle-radio')[0];
			toggleRadio.id = 'gesture_radio_' + gestureName;
			toggleRadio.addEventListener('click', setEditTarget);
			let label = container.getElementsByClassName('udlr')[0];
			label.id = 'udlr_' + gestureName;
			label.textContent = gestureValues[gestureName] || '-';
			let caption = container.getElementsByClassName('gesture-caption')[0];
			caption.id = 'caption_' + gestureName;
			caption.textContent = gestureName;
			caption.parentNode.setAttribute('for', toggleRadio.id);
			template.parentNode.insertBefore(container, template);
		}
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
			} else {
				SimpleGesture.ini[e.target.id] = e.target.value;
			}
			saveIni();
		};
		let onRangeInput = e => {
			byId(e.target.id + 'Value').textContent = e.target.value;
		};
		for (let id of ['newTabUrl', 'timeout', 'strokeSize', 'userAgent']) {
			let rangeElm = byId(id);
			rangeElm.value = SimpleGesture.ini[id] || INSTEAD_OF_EMPTY[id] || '';
			rangeElm.addEventListener('change', onValueChange);
			if (rangeElm.getAttribute('type') === 'range') {
				rangeElm.addEventListener('input', onRangeInput);
				onRangeInput({ target: rangeElm });
			}
		}
	};

	SimpleGesture.onGestureStart = (e, gesture) => {
		if (editTarget) {
			SimpleGesture.clearGestureTimeoutTimer(); // Don't timeout, when editing gesture.
			e.preventDefault();
		}
	};
	SimpleGesture.onInputGesture = (e, gesture) => {
		if (!editTarget) return;
		byId('inputedGesture').textContent = gesture;
		e.preventDefault();
		return false;
	};
	SimpleGesture.onGestured = (e, gesture) => {
		if (!editTarget) return;
		updateGesture(gesture);
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
	});

})();

