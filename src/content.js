(() => {
	'use strict';

	// const -------------
	let MAX_LENGTH = 16;
	let GESTURE_NAMES; // set up in 'setupOptionsPage()'

	// fields ------------
	let defaultIni = {
		'gestures': {
			'D-L': 'forward',
			'D-R': 'back',
			'R-D': 'top',
			'R-U': 'bottom',
			'U-L': 'nextTab',
			'U-R': 'prevTab',
			'D-R-U': 'reload',
			'L-D-R': 'close',
			'R-D-L': 'newTab'
		},
		'strokeSize': 32,
		'timeout': 1500
	};
	let ini = defaultIni;
	let gesture = null;
	let lx = 0; // last X
	let ly = 0; // last Y
	let lg = null; // lastGesture
	let editTarget = null;
	let timeoutId = null;

	// functions ---------
	let getX = e => e.touches ? e.touches[0].clientX: e.pageX;
	let getY = e => e.touches ? e.touches[0].clientY: e.pageY;

	let resetGesture = e => {
		gesture = null;
		timeoutId = null;
	};

	let clearGestureTimeoutTimer = () => {
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	let onTouchStart = e => {
		gesture = '';
		clearGestureTimeoutTimer();
		if (editTarget) {
			e.preventDefault();
		} else {
			timeoutId = setTimeout(resetGesture, ini.timeout);
		}
		lx = getX(e);
		ly = getY(e);
		lg = null;
	};

	let onTouchMove = e => {
		if (gesture === null) return;
		if (gesture.length > MAX_LENGTH) return;
		if (e.touches && e.touches[1]) { // not support two fingers
			resetGesture();
			return;
		}
		let x = getX(e);
		let y = getY(e);
		let dx = x - lx;
		let dy = y - ly;
		let g = '';
		if (Math.abs(dx) < Math.abs(dy)) {
			if (dy <= -ini.strokeSize) g = 'U';
			else if (dy >= ini.strokeSize) g = 'D';
		} else {
			if (dx <= -ini.strokeSize) g = 'L';
			else if (dx >= ini.strokeSize) g = 'R';
		}
		if (g && g != lg) {
			if (gesture) gesture += '-';
			gesture += g;
			lx = x;
			ly = y;
			lg = g;
			if (editTarget) {
				document.getElementById('inputedGesture').textContent = gesture;
				e.preventDefault();
			}
		}
	};

	let scrollBehaviorBackup = null;
	let smoothScroll = y  => {
		if (scrollBehaviorBackup === null) {
			scrollBehaviorBackup = document.body.style.scrollBehavior;
		}
		document.body.style.scrollBehavior = 'smooth';
		setTimeout(() => { window.scrollTo(0, y); }, 1);
		setTimeout(() => {
			document.body.style.scrollBehavior = scrollBehaviorBackup;
			scrollBehaviorBackup = null;
		}, 1000);
	};

	let saveIni = () => {
		browser.storage.local.set({ 'simple_gesture': ini });
	};

	let swapKeyValue = m => {
		let s = {};
		for (let key in m) {
			let value = m[key];
			s[value] = key;
		}
		return s;
	};

	let updateGesture = () => {
		if (gesture) {
			ini.gestures[gesture] = null;
			let s = swapKeyValue(ini.gestures);
			s[editTarget] = gesture;
			ini.gestures = swapKeyValue(s);
			saveIni();
			for (let gestureName of GESTURE_NAMES) {
				document.getElementById('udlr_' + gestureName).textContent = s[gestureName] || '-';
			}
		}
		setTimeout(() => {
			document.getElementById('gesture_radio_' + editTarget).checked = false;
			document.getElementById('gestureArea').classList.add('transparent');
			editTarget = null;
		}, 1);
	};

	let executeGesture = e => {
		let g = ini.gestures[gesture];
		if (!g) return true;
		switch (g) {
			case 'forward': history.forward(); break;
			case 'back': history.back(); break;
			case 'top': smoothScroll(0); break;
			case 'bottom': smoothScroll(document.body.scrollHeight); break;
			case 'reload': location.reload(); break;
			default: browser.runtime.sendMessage(g, (res) => {}); break;
		}
		e.stopPropagation();
		e.preventDefault();
		return false;
	};

	let onTouchEnd = e => {
		try {
			clearGestureTimeoutTimer();
			if (editTarget) {
				updateGesture();
			} else {
				return executeGesture(e);
			}
		} finally {
			gesture = null;
		}
	};

	let setupOptionsPage = () => {
		GESTURE_NAMES = [];
		for (let i in defaultIni.gestures) {
			GESTURE_NAMES.push(defaultIni.gestures[i]);
		}
		let s = swapKeyValue(ini.gestures);
		let template = document.getElementsByClassName('gesture_template')[0];
		let setEditTarget = e => {
			editTarget = e.target.id.replace(/^.+_/, '');
			document.getElementById('inputedGesture').textContent = '';
			document.getElementById('gestureArea').classList.remove('transparent');
		};
		for (let gestureName of GESTURE_NAMES) {
			let container = template.cloneNode(true);
			container.className = "gesture-container";
			let toggleRadio = container.getElementsByClassName('toggle-radio')[0];
			toggleRadio.id = 'gesture_radio_' + gestureName;
			toggleRadio.addEventListener('click', setEditTarget);
			let label = container.getElementsByClassName('udlr')[0];
			label.id = 'udlr_' + gestureName;
			label.textContent = s[gestureName] || '-';
			let caption = container.getElementsByClassName('gesture-caption')[0];
			caption.textContent = gestureName;
			caption.parentNode.setAttribute('for', toggleRadio.id);
			template.parentNode.insertBefore(container, template);
		}
		for (let caption of document.getElementsByClassName('caption')) {
			caption.textContent = chrome.i18n.getMessage('caption_' + caption.textContent) || caption.textContent;
		}
		let onValueChange = e => {
			ini[e.target.id] = e.target.value;
			saveIni();
		};
		let onRangeInput = e => {
			document.getElementById(e.target.id + 'Value').textContent = e.target.value;
		};
		for (let id of ['newTabUrl', 'timeout', 'strokeSize']) {
			let rangeElm = document.getElementById(id);
			rangeElm.value = ini[id] || '';
			rangeElm.addEventListener('change', onValueChange);
			if (rangeElm.getAttribute('type') === 'range') {
				rangeElm.addEventListener('input', onRangeInput);
				onRangeInput({ target: rangeElm });
			}
		}
	};

	// START HERE ! ------
	// mouse event is for Test on Desktop
	window.addEventListener('ontouchstart' in window ? 'touchstart' : 'mousedown', onTouchStart);
	window.addEventListener('ontouchmove' in window ? 'touchmove' : 'mousemove', onTouchMove);
	window.addEventListener('ontouchend' in window ? 'touchend' : 'mouseup', onTouchEnd);

	browser.storage.local.get('simple_gesture').then(res => {
		if (res && res.simple_gesture) {
			ini = res.simple_gesture;
		}
		if (location.href == browser.runtime.getURL('options.html')) {
			setupOptionsPage();
		}
	});

})();

