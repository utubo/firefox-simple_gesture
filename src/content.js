var SimpleGesture = {};
(async () => {
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
		'timeout': 1500,
		'toast': false
	};
	SimpleGesture.MAX_LENGTH = 17; // 9 moves + 8 hyphens = 17 chars.

	// fields ------------
	let gesture = null;
	let lx = 0; // last X
	let ly = 0; // last Y
	let lg = null; // last gesture (e.g. 'L','R','U' or 'D')
	let target = null;
	let timeoutId = null;
	let isGestureEnabled = true;
	let size = SimpleGesture.ini.strokeSize;
	let toast;
	let exData;

	// utils -------------
	SimpleGesture.getXY = e => e.touches ? [e.touches[0].clientX, e.touches[0].clientY] : [e.pageX, e.pageY];

	SimpleGesture.clearGestureTimeoutTimer = () => { // options.js uses this function. TODO: Fix this dirty code.
		if (timeoutId) {
			window.clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	const resetGesture = e => {
		gesture = null;
		timeoutId = null;
		if (e.withTimeout && toast) {
			toast.textContent = `( ${browser.i18n.getMessage('timeout')} )`;
			setTimeout(hideToast, 1000);
		} else {
			hideToast();
		}
	};

	const timeoutGesture = e => {
		resetGesture({ withTimeout: true });
	};

	let lastInnerWidth = 0;
	const fixSize = () => {
		const w = window.innerWidth;
		if (w === lastInnerWidth) return;
		const z = Math.min(w, window.innerHeight) / 320;
		size = (SimpleGesture.ini.strokeSize * z)^0;
	};

	// touch-events ------
	const onTouchStart = e => {
		fixSize();
		if (!size) return;
		gesture = '';
		SimpleGesture.clearGestureTimeoutTimer();
		timeoutId = window.setTimeout(timeoutGesture, SimpleGesture.ini.timeout);
		SimpleGesture.onGestureStart && SimpleGesture.onGestureStart(e);
		[lx, ly] = SimpleGesture.getXY(e);
		lg = null;
		target = e.target;
	};

	const onTouchMove = e => {
		if (gesture === null) return;
		if (gesture.length > SimpleGesture.MAX_LENGTH) return;
		if (e.touches && e.touches[1]) { // not support two fingers
			resetGesture();
			return;
		}
		const [x, y] = SimpleGesture.getXY(e);
		const dx = x - lx;
		const dy = y - ly;
		const absX = dx < 0 ? -dx : dx;
		const absY = dy < 0 ? -dy : dy;
		if (absX < size && absY < size) return;
		const g = absX < absY ? (dy < 0 ? 'U' : 'D') : (dx < 0 ? 'L' : 'R');
		if (g === lg) return;
		if (gesture) gesture += '-';
		gesture += g;
		lx = x;
		ly = y;
		lg = g;
		if (SimpleGesture.onInputGesture && SimpleGesture.onInputGesture(e, gesture) === false) return;
		showGesture();
	};

	const onTouchEnd = e => {
		try {
			SimpleGesture.clearGestureTimeoutTimer();
			hideToast();
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
	const executeGesture = e => {
		if (SimpleGesture.onGestured && SimpleGesture.onGestured(e, gesture) === false) return false; // for options.html
		const g = SimpleGesture.ini.gestures[gesture];
		if (g === 'disableGesture') return toggleIsGestureEnabled();
		if (!isGestureEnabled) return true;
		if (!g) return true;
		switch (g) {
			case 'forward': history.forward(); break;
			case 'back': history.back(); break;
			case 'top': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
			case 'bottom': window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); break;
			case 'pageUp': window.scrollByPages(-1, { behavior: 'smooth' }); break;
			case 'pageDown': window.scrollByPages(1, { behavior: 'smooth' }); break;
			case 'reload': location.reload(); break;
			default:
				if (g[0] === '$') { // '$' is custom-gesture prefix.
					setCustomGestureTarget();
				}
				browser.runtime.sendMessage(g);
		}
		target = null;
		return false;
	};

	const setCustomGestureTarget = () => {
		const befores = document.getElementsByClassName('simple-gesture-target');
		[...befores].forEach(e => { e.classList.remove('simple-gesture-target'); });
		target && target.classList && target.classList.add('simple-gesture-target');
	};

	// This has a some issue.
	// const isBacked = old => old.state !== history.state || old.href !== location.href;
	// const backOrClose = () => {
	// 	const old = { state: history.state, href: location.href };
	// 	history.back();
	// 	if (isBacked(old)) return;
	// 	// wait for show 'about:home'
	// 	const timer = window.setTimeout(() => {
	// 		if (isBacked(old)) return;
	// 		browser.runtime.sendMessage('close');
	// 	}, 500);
	// 	// cancel when history forward.
	// 	window.addEventListener('pageshow', () => { window.clearTimeout(timer); }, { once: true });
	// };

	const toggleIsGestureEnabled = () => {
		isGestureEnabled = !isGestureEnabled;
		alert(chrome.i18n.getMessage('message_gesture_is_' + (isGestureEnabled ? 'enabled' : 'disabled')));
		return false;
	};

	// others -------------
	const showToast = () => {
		if (!toast) return;
		if (toast.style.opacity === '1') return;
		const z = Math.min(window.innerWidth, window.innerHeight) / 100;
		toast.style.fontSize = ((5 * z)^0) + 'px';
		toast.style.padding = ((1 * z)^0) + 'px';
		toast.style.color = SimpleGesture.ini.toastForeground || '#f9f9fa';
		toast.style.background = SimpleGesture.ini.toastBackground || '#00bfff';
		toast.style.opacity = '1';
	};
	const hideToast = () => {
		if (!toast) return;
		if (toast.style.opacity === '0') return;
		toast.style.opacity = '0';
	};
	const showGesture = async () => {
		if (!SimpleGesture.ini.toast) return;
		const g = SimpleGesture.ini.gestures[gesture];
		if (!g) {
			hideToast();
			return;
		}
		let name;
		if (g[0] === '$') {
			await loadExData(!exData);
			name = exData.customGestureList.find((e, i, a) => e.id === g).title;
		} else {
			name = browser.i18n.getMessage(g);
		}
		if (!toast) {
			toast = document.createElement('DIV');
			toast.style.cssText = `
				box-sizing: border-box;
				left: 0;
				opacity: 0;
				overflow: hidden;
				pointer-events: none;
				position: fixed;
				text-align: center;
				top: 0;
				transition: opacity .5s;
				width: 100%;
				z-index: 999;
			`;
			document.body.appendChild(toast);
		}
		toast.textContent = `${name}(${gesture})`;
		showToast();
	};

	// utils for setup ----
	SimpleGesture.addTouchEventListener = (target, events) => {
		// mouse event is for Test on Desktop
		target.addEventListener('ontouchstart' in window ? 'touchstart' : 'mousedown', events.start);
		target.addEventListener('ontouchmove' in window ? 'touchmove' : 'mousemove', events.move);
		target.addEventListener('ontouchend' in window ? 'touchend' : 'mouseup', events.end);
		//window.visualViewport.addEventListener('resize', fixSize); VisualViewport is draft. :(
	};

	const loadExData = async b => {
		if (!b) return;
		exData = (await browser.storage.local.get('simple_gesture_exdata')).simple_gesture_exdata || { customGestureList: []};
	};

	SimpleGesture.loadIni = async () => {
		const res = await browser.storage.local.get('simple_gesture');
		if (res && res.simple_gesture) {
			SimpleGesture.ini = res.simple_gesture;
		}
		loadExData(exData);
		lastInnerWidth = 0; // for recalucrate stroke size on touchstart.
	};

	// START HERE ! ------
	SimpleGesture.addTouchEventListener(window, { start: onTouchStart, move: onTouchMove, end: onTouchEnd });
	SimpleGesture.loadIni();
})();

