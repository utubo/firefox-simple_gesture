(() => {
	'use strict';

	// const -------------
	let GESTURE_NAMES; // set up in 'setupGestureNames()'

	// fields ------------
	let editTarget = null;

	// functions ---------
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
				document.getElementById('udlr_' + gestureName).textContent = gestureValues[gestureName] || '-';
			}
		}
		setTimeout(() => {
			document.getElementById('gesture_radio_' + editTarget).checked = false;
			document.getElementById('gestureArea').classList.add('transparent');
			editTarget = null;
		}, 1);
	};

	let setupGestureNames = () => {
		GESTURE_NAMES = [];
		for (let i in SimpleGesture.defaultIni.gestures) {
			GESTURE_NAMES.push(SimpleGesture.defaultIni.gestures[i]);
		}
	};

	let setupGestureInputBox = () => {
		let gestureValues = swapKeyValue(SimpleGesture.ini.gestures);
		// gestures
		let template = document.getElementsByClassName('gesture_template')[0];
		let setEditTarget = e => {
			editTarget = e.target.id.replace(/^.+_/, '');
			document.getElementById('inputedGesture').textContent = '';
			document.getElementById('gestureArea').classList.remove('transparent');
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
			caption.textContent = gestureName;
			caption.parentNode.setAttribute('for', toggleRadio.id);
			template.parentNode.insertBefore(container, template);
		}
	};

	let setupOtherOptions = () => {
		document.getElementById('newTab_container').appendChild(document.getElementById('newTabUrl_container'));
		for (let caption of document.getElementsByClassName('caption')) {
			if (!caption.textContent) continue;
			caption.textContent = chrome.i18n.getMessage('caption_' + caption.textContent) || caption.textContent;
		}
		let onValueChange = e => {
			SimpleGesture.ini[e.target.id] = e.target.value;
			saveIni();
		};
		let onRangeInput = e => {
			document.getElementById(e.target.id + 'Value').textContent = e.target.value;
		};
		for (let id of ['newTabUrl', 'timeout', 'strokeSize']) {
			let rangeElm = document.getElementById(id);
			rangeElm.value = SimpleGesture.ini[id] || '';
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
		document.getElementById('inputedGesture').textContent = gesture;
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
		setupGestureNames();
		setupGestureInputBox();
		setupOtherOptions();
	});

})();

