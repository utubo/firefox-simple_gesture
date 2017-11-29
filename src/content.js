var SimpleGesture = {};
SimpleGesture.defaultIni = {
	'gestures': {
		'D-L': 'forward',
		'D-R': 'back',
		'R-D': 'top',
		'R-U': 'bottom',
		'U-L': 'nextTab',
		'U-R': 'prevTab',
		'D-R-U': 'reload',
		'L-D-R': 'close',
		'R-D-L': 'newTab',
	},
	'strokeSize': 32,
	'timeout': 1500
};
SimpleGesture.ini = SimpleGesture.defaultIni;

(() => {
	'use strict';

	// const -------------
	let MAX_LENGTH = 16;

	// fields ------------
	let gesture = null;
	let lx = 0; // last X
	let ly = 0; // last Y
	let lg = null; // lastGesture
	let timeoutId = null;
	let isGestureEnabled = true;

	// utils -------------
	let getX = e => e.touches ? e.touches[0].clientX: e.pageX;
	let getY = e => e.touches ? e.touches[0].clientY: e.pageY;

	let resetGesture = e => {
		gesture = null;
		timeoutId = null;
	};

	SimpleGesture.clearGestureTimeoutTimer = () => { // options.js uses this function. TODO: Fix this dirty code.
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	// touch-events ------
	let onTouchStart = e => {
		gesture = '';
		SimpleGesture.clearGestureTimeoutTimer();
		timeoutId = setTimeout(resetGesture, SimpleGesture.ini.timeout);
		SimpleGesture.onGestureStart && SimpleGesture.onGestureStart(e, gesture);
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
			if (dy <= - SimpleGesture.ini.strokeSize) g = 'U';
			else if (dy >= SimpleGesture.ini.strokeSize) g = 'D';
		} else {
			if (dx <= - SimpleGesture.ini.strokeSize) g = 'L';
			else if (dx >= SimpleGesture.ini.strokeSize) g = 'R';
		}
		if (g && g != lg) {
			if (gesture) gesture += '-';
			gesture += g;
			lx = x;
			ly = y;
			lg = g;
			SimpleGesture.onInputGesture && SimpleGesture.onInputGesture(e, gesture);
		}
	};

	let onTouchEnd = e => {
		try {
			SimpleGesture.clearGestureTimeoutTimer();
			if (executeGesture(e)) return true;
			// cancel event when gesture executed
			e.stopPropagation();
			e.preventDefault();
			return false;
		} finally {
			gesture = null;
		}
	};

	// execute gesture ---
	let executeGesture = e => {
		if (SimpleGesture.onGestured && SimpleGesture.onGestured(e, gesture) === false) return false; // for options.html
		let g = SimpleGesture.ini.gestures[gesture];
		if (g === 'disableGesture') return toggleIsGestureEnabled();
		if (!isGestureEnabled) return true;
		if (!g) return true;
		switch (g) {
			case 'forward': history.forward(); break;
			case 'back': history.back(); break;
			case 'top': smoothScroll(0); break;
			case 'bottom': smoothScroll(document.body.scrollHeight); break;
			case 'reload': location.reload(); break;
			default: browser.runtime.sendMessage(g, (res) => {});
		}
		return false;
	};

	let scrollBehaviorBackup = null;
	let smoothScroll = y  => {
		scrollBehaviorBackup = scrollBehaviorBackup || document.body.style.scrollBehavior;
		document.body.style.scrollBehavior = 'smooth';
		window.scrollTo(0, y);
		setTimeout(() => {
			document.body.style.scrollBehavior = scrollBehaviorBackup;
			scrollBehaviorBackup = null;
		}, 1000);
	};

	let toggleIsGestureEnabled = () => {
		isGestureEnabled = !isGestureEnabled;
		alert(chrome.i18n.getMessage('message_gesture_is_' + (isGestureEnabled ? 'enabled' : 'disabled')));
		return false;
	};

	// START HERE ! ------
	// mouse event is for Test on Desktop
	window.addEventListener('ontouchstart' in window ? 'touchstart' : 'mousedown', onTouchStart);
	window.addEventListener('ontouchmove' in window ? 'touchmove' : 'mousemove', onTouchMove);
	window.addEventListener('ontouchend' in window ? 'touchend' : 'mouseup', onTouchEnd);

	browser.storage.local.get('simple_gesture').then(res => {
		if (res && res.simple_gesture) {
			SimpleGesture.ini = res.simple_gesture;
		}
	});

})();

