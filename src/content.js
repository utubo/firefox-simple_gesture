var SimpleGesture = {};
(() => {
	'use strict';

	// const -------------
	// Default settings
	SimpleGesture.ini = {
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
		'strokeSize': 50,
		'timeout': 1500
	};
	// Up to 17 chars (= 9 moves) are valid. Ignore if gesture is over 19 characters.
	SimpleGesture.MAX_LENGTH = 19;

	// fields ------------
	let gesture = null;
	let lx = 0; // last X
	let ly = 0; // last Y
	let lg = null; // last gesture ('L','R','U' or 'D')
	let timeoutId = null;
	let isGestureEnabled = true;
	let size = SimpleGesture.ini.strokeSize;

	// utils -------------
	SimpleGesture.getXY = e => e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.pageX, e.pageY];

	SimpleGesture.clearGestureTimeoutTimer = () => { // options.js uses this function. TODO: Fix this dirty code.
		if (timeoutId) {
			window.clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	let resetGesture = e => {
		gesture = null;
		timeoutId = null;
	};

	let lastInnerWidth = 0;
	let fixSize = () => {
		let w = window.innerWidth;
		if (w === lastInnerWidth) return;
		let z = Math.min(w, window.innerHeight) / 320;
		size = (SimpleGesture.ini.strokeSize * z)^0;
	};

	// touch-events ------
	let onTouchStart = e => {
		fixSize();
		if (!size) return;
		gesture = '';
		SimpleGesture.clearGestureTimeoutTimer();
		timeoutId = window.setTimeout(resetGesture, SimpleGesture.ini.timeout);
		SimpleGesture.onGestureStart && SimpleGesture.onGestureStart(e);
		[lx, ly] = SimpleGesture.getXY(e);
		lg = null;
	};

	let onTouchMove = e => {
		if (gesture === null) return;
		if (gesture.length >= SimpleGesture.MAX_LENGTH) return;
		if (e.touches && e.touches[1]) { // not support two fingers
			resetGesture();
			return;
		}
		let [x, y] = SimpleGesture.getXY(e);
		let dx = x - lx;
		let dy = y - ly;
		let absX = dx < 0 ? -dx : dx;
		let absY = dy < 0 ? -dy : dy;
		if (absX < size && absY < size) return;
		let g = absX < absY ? (dy < 0 ? 'U' : 'D') : (dx < 0 ? 'L' : 'R');
		if (g === lg) return;
		if (gesture) gesture += '-';
		gesture += g;
		lx = x;
		ly = y;
		lg = g;
		SimpleGesture.onInputGesture && SimpleGesture.onInputGesture(e, gesture);
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
			default: browser.runtime.sendMessage(g);
		}
		return false;
	};

	let scrollBehaviorBackup = null;
	let smoothScroll = y => {
		scrollBehaviorBackup = scrollBehaviorBackup || document.body.style.scrollBehavior;
		document.body.style.scrollBehavior = 'smooth';
		window.scrollTo(0, y);
		window.setTimeout(() => {
			document.body.style.scrollBehavior = scrollBehaviorBackup;
			scrollBehaviorBackup = null;
		}, 1000);
	};

	let toggleIsGestureEnabled = () => {
		isGestureEnabled = !isGestureEnabled;
		alert(chrome.i18n.getMessage('message_gesture_is_' + (isGestureEnabled ? 'enabled' : 'disabled')));
		return false;
	};

	SimpleGesture.addTouchEventListener = (target, events) => {
		// mouse event is for Test on Desktop
		target.addEventListener('ontouchstart' in window ? 'touchstart' : 'mousedown', events.start);
		target.addEventListener('ontouchmove' in window ? 'touchmove' : 'mousemove', events.move);
		target.addEventListener('ontouchend' in window ? 'touchend' : 'mouseup', events.end);
		//window.visualViewport.addEventListener('resize', fixSize); VisualViewport is draft. :(
	};

	// START HERE ! ------
	SimpleGesture.addTouchEventListener(window, { start: onTouchStart, move: onTouchMove, end: onTouchEnd });
	browser.storage.local.get('simple_gesture').then(res => {
		if (res && res.simple_gesture) {
			SimpleGesture.ini = res.simple_gesture;
		}
	});

})();

