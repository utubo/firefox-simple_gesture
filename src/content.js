var SimpleGesture = {};
(async () => {
	'use strict';

	// const -------------
	// Default settings
	SimpleGesture.ini = {
		gestures: {
			'D-L': 'forward',
			'D-R': 'back',
			'R-D': 'top',
			'R-U': 'bottom',
			'D-R-U': 'reload',
			'L-D-R': 'close',
			'R-D-L': 'newTab',
			'L-D-R-U-L': 'openAddonSettings',
		},
		strokeSize: 50,
		timeout: 1500,
		doubleTapMsec: 200,
		toast: true,
		blacklist: []
	};
	SimpleGesture.MAX_LENGTH = 17; // 9 moves + 8 hyphens = 17 chars.
	const SHOW_TOAST_DELAY = 200; // Prevent the double-tap toast from blinking.
	const VV = window.visualViewport || { isDummy: 1, offsetLeft: 0, offsetTop: 0, scale: 1, addEventListener: () => {} };

	// fields ------------
	// gesture
	let gesture = null; // e.g. 'L-R-U-D'
	let startPoint = null; // e.g. 'L:', 'R:', 'T:' or 'B:'
	let lx = 0; // last X
	let ly = 0; // last Y
	let lg = null; // last gesture (e.g. 'L','R','U' or 'D')
	let target = null;
	let timer = null;
	let isGestureEnabled = true;
	let touchEndTime = 0;
	// screen size
	let lastInnerWidth = 0;
	let lastInnerHeight = 0;
	let size = SimpleGesture.ini.strokeSize;
	let edgeWidth = 0;
	// toast
	let showToastTimer = null;
	let hideToastTimer = null;
	let toast;
	let toastMain;
	let toastText;
	let toastUdlr;
	let toastSub;
	let isToastVisible;
	// others
	let exData;

	// utils -------------
	SimpleGesture.getXY = e => {
		const p = e.touches ? e.touches[0] : e;
		return p.clientX !== undefined ? [p.clientX - VV.offsetLeft, p.clientY - VV.offsetTop] : [lx, ly];
	};

	const restartTimer = () => {
		window.clearTimeout(timer);
		timer = SimpleGesture.ini.timeout ? window.setTimeout(timeoutGesture, SimpleGesture.ini.timeout) : null;
	};

	const resetGesture = e => {
		gesture = null;
		timer = null;
		if (e && e.withTimeout && toast) {
			toastText.textContent = `( ${browser.i18n.getMessage('timeout')} )`;
			toastUdlr.textContent = '';
			hideToast(1000);
		} else {
			hideToast();
		}
	};

	const timeoutGesture = e => {
		resetGesture({ withTimeout: true });
	};

	const fixSize = () => {
		const w = window.innerWidth;
		const h = window.innerHeight;
		if (w === lastInnerWidth && h === lastInnerHeight) return;
		lastInnerWidth = w;
		lastInnerHeight = h;
		edgeWidth = (Math.min(w, h) / 10)^0;
		const z = Math.min(w, h) / 320;
		size = (SimpleGesture.ini.strokeSize * z)^0;
	};

	const executeEvent = (f, e) => {
		if (!f) return;
		e.gesture = gesture;
		e.startPoint = startPoint;
		return f(e);
	};

	// touch-events ------
	const onTouchStart = e => {
		fixSize();
		if (!size) return;
		if (Date.now() - touchEndTime <= SimpleGesture.ini.doubleTapMsec) {
			gesture = 'W';
		} else {
			gesture = '';
		}
		[lx, ly] = SimpleGesture.getXY(e);
		lg = null;
		setupStartPoint(lx, ly);
		target = e.target;
		if (executeEvent(SimpleGesture.onGestureStart, e) === false) return;
		restartTimer();
		if (gesture === 'W' && SimpleGesture.ini.toast) showGestureDelay();
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
		lx = x;
		ly = y;
		const g = absX < absY ? (dy < 0 ? 'U' : 'D') : (dx < 0 ? 'L' : 'R');
		if (g === lg) return;
		lg = g;
		if (gesture) gesture += '-';
		gesture += g;
		if (executeEvent(SimpleGesture.onInputGesture, e) === false) return;
		if (SimpleGesture.ini.toast) showGesture();
		restartTimer();
	};

	const onTouchEnd = e => {
		try {
			touchEndTime = Date.now();
			window.clearTimeout(timer);
			window.clearTimeout(showToastTimer);
			hideToast();
			if (executeEvent(SimpleGesture.onGestured, e) === false) return;
			const g = SimpleGesture.ini.gestures[startPoint + gesture] || SimpleGesture.ini.gestures[gesture];
			if (!g) return;
			if (!isGestureEnabled && g !== 'disableGesture') return;
			SimpleGesture.doCommand(g);
			e.stopPropagation();
			e.preventDefault();
		} finally {
			gesture = null;
		}
	};

	const setupStartPoint = async (x, y) => {
		if (x < edgeWidth) {
			startPoint = 'L:';
		} else if (x > lastInnerWidth - edgeWidth) {
			startPoint = 'R:';
		} else if (y < edgeWidth) {
			startPoint = 'T:';
		} else if (y > lastInnerHeight - edgeWidth) {
			startPoint = 'B:';
		} else {
			startPoint = '';
		}
	};

	SimpleGesture.doCommand = (g, options) => {
		switch (g) {
			case 'forward': history.forward(); break;
			case 'back': history.back(); break;
			case 'top': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
			case 'bottom': window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); break;
			case 'pageUp': window.scrollByPages(-1, { behavior: 'smooth' }); break;
			case 'pageDown': window.scrollByPages(1, { behavior: 'smooth' }); break;
			case 'reload': location.reload(); break;
			case 'disableGesture': toggleEnable(); break;
			default:
				if (g[0] === '$') { // '$' is custom-gesture prefix.
					setCustomGestureTarget();
				}
				if (options) {
					options.command = g;
					g = JSON.stringify(options);
				}
				browser.runtime.sendMessage(g);
		}
		target = null;
	};

	const setCustomGestureTarget = () => {
		const befores = document.getElementsByClassName('simple-gesture-target');
		[...befores].forEach(e => { e.classList.remove('simple-gesture-target'); });
		target && target.classList && target.classList.add('simple-gesture-target');
	};

	const toggleEnable = () => {
		isGestureEnabled = !isGestureEnabled;
		alert(chrome.i18n.getMessage('message_gesture_is_' + (isGestureEnabled ? 'enabled' : 'disabled')));
	};

	// toast --------------
	let arrowSvg = null;
	let arrowContainer = null;
	let doubleTapSvg = null;
	const getSvgNode = (name, attrs) => {
		const n = document.createElementNS('http://www.w3.org/2000/svg', name);
		for (let key in attrs) {
			n.setAttribute(key, attrs[key]);
		}
		return n;
	}
	const makeArrowSvg = () => {
		if (arrowSvg) return arrowSvg;
		arrowContainer = document.createElement('SPAN');
		arrowContainer.style.cssText = `
			display: inline-block;
			height: 1em;
			margin: 0 .1em;
			vertical-align: bottom;
		`;
		const svg = getSvgNode('svg', { width: 12, height: 12, viewBox: '0 0 12 12' });
		svg.style.cssText = `
			display: none;
			height: 1em;
			width: 1em;
			stroke: currentColor;
			stroke-linecap: round;
			stroke-linejoin: round;
			fill: none;
		`;
		arrowSvg = svg.cloneNode(true);
		arrowSvg.appendChild(getSvgNode('path', { d: 'M 6 10v-8m-4 4l4-4 4 4' }));
		doubleTapSvg = svg.cloneNode(true);
		doubleTapSvg.appendChild(getSvgNode('path', { d: 'M1 6a4 4 0 1 1 10 0' }));
		doubleTapSvg.appendChild(getSvgNode('path', { d: 'M3 6a3 3 0 1 1 6 0' }));
		doubleTapSvg.appendChild(getSvgNode('path', { d: 'M4 11q-3-2 1-1v-3.5q1-2 2 0v2.5l3 1v1' }));
	};
	SimpleGesture.drawArrows = (udlr, label) => {
		makeArrowSvg();
		const arrows = [];
		for (const g of udlr.split('-')) {
			let svg;
			if (g === 'W') {
				svg = doubleTapSvg.cloneNode(true);
			} else {
				svg = arrowSvg.cloneNode(true);
				switch (g) {
					case 'R': svg.style.transform = 'rotate(90deg)'; break;
					case 'D': svg.style.transform = 'rotate(180deg)'; break;
					case 'L': svg.style.transform = 'rotate(270deg)'; break;
				}
			}
			svg.style.display = 'inline-block';
			const c = arrowContainer.cloneNode();
			c.appendChild(svg);
			arrows.push(c);
		}
		label.replaceChildren(...arrows);
	};

	const showToast = () => {
		if (!toast) return;
		if (isToastVisible) return;
		isToastVisible = true;
		toast.style.color = SimpleGesture.ini.toastForeground || '#ffffff';
		toastMain.style.background = SimpleGesture.ini.toastBackground || '#21a1de';
		toastSub.style.background = SimpleGesture.ini.toastBackground || '#21a1de';
		toast.style.transition = 'opacity .3s';
		fixToastSize();
		fixToastPosition();
		window.requestAnimationFrame(() => { toast.style.opacity = '1'; });
		setTimeout(() => {
			toast.style.transition += ',left .2s .1s, top .2s .1s';
		}, 300);
	};
	const fixToastSize = () => {
		const w = VV.isDummy ? window.innerWidth : VV.width;
		const h = VV.isDummy ? window.innerHeight : VV.height;
		const z = Math.min(w, h) / 100;
		toast.style.fontSize = ((5 * z)^0) + 'px'; // "vmin" of CSS has a problem when the page is zoomed.
		toast.style.width = w + 'px';
	};
	const fixToastPosition = () => {
		if (VV.isDummy) return;
		if (!toast) return;
		if (!isToastVisible) return;
		toast.style.top = VV.offsetTop + 'px';
		toast.style.left = VV.offsetLeft + 'px';
	};
	const hideToast = delay => {
		if (!toast) return;
		if (!isToastVisible) return;
		if (delay) {
			hideToastTimer = setTimeout(hideToast, delay);
			return;
		}
		window.clearTimeout(hideToastTimer);
		isToastVisible = false;
		window.requestAnimationFrame(() => { toast.style.opacity = '0'; });
	};
	const setupToast = () => {
		if (toast) return;
		toast = document.createElement('DIV');
		toast.style.cssText = `
			all: initial;
			box-sizing: border-box;
			left: 0;
			line-height: 1.5;
			opacity: 0;
			overflow: hidden;
			pointer-events: none;
			position: fixed;
			text-align: center;
			top: 0;
			transition: opacity .3s;
			width: 100%;
			z-index: 2147483647;
		`; // TODO: I don't like this z-index. :(
		toastMain = document.createElement('DIV');
		toastMain.style.cssText = 'padding: .2em 0; line-height: 1;';
		toastText = document.createElement('SPAN');
		toastUdlr = document.createElement('SPAN');
		toastSub = document.createElement('DIV');
		toastSub.style.cssText = `
			font-size: 60%;
			opacity: .7;
			padding-right: .5em;
			text-align: right;
		`;
		toastMain.appendChild(toastText);
		toastMain.appendChild(toastUdlr);
		toast.appendChild(toastMain);
		toast.appendChild(toastSub);
		document.body.appendChild(toast);
	};
	const showGesture = async () => {
		window.clearTimeout(showToastTimer);
		const g = SimpleGesture.ini.gestures[startPoint + gesture] || SimpleGesture.ini.gestures[gesture];
		if (!g && !gesture[1] && !startPoint) return;
		if (!isGestureEnabled && g !== 'disableGesture') {
			hideToast();
			return;
		}
		let name;
		if (!g) {
			name = '';
		} else if (g[0] === '$') {
			await loadExData(!exData);
			name = exData.customGestureList.find((e, i, a) => e.id === g).title;
		} else {
			name = browser.i18n.getMessage(g);
		}
		setupToast();
		toastText.textContent = name;
		SimpleGesture.drawArrows(gesture, toastUdlr);
		if (toast.getAttribute('x-startPoint') !== startPoint) {
			toast.setAttribute('x-startPoint', startPoint);
			toastSub.textContent = `${chrome.i18n.getMessage(`fromEdge-${startPoint[0]}`)}`;
		}
		showToast();
	};
	const showGestureDelay = () => {
		window.clearTimeout(showToastTimer);
		showToastTimer = setTimeout(showGesture, SHOW_TOAST_DELAY);
	}

	// utils for setup ----
	SimpleGesture.addTouchEventListener = (target, events) => {
		if ('ontouchstart' in window) {
			target.addEventListener('touchstart', events.start, true);
			target.addEventListener('touchmove', events.move, true);
			target.addEventListener('touchend', events.end, true);
			target.addEventListener('touchcancel', events.end, true);
		} else {
			// for test on Desktop
			target.addEventListener('mousedown', events.start, true);
			target.addEventListener('mousemove', events.move, true);
			target.addEventListener('mouseup', events.end, true);
		}
	};

	const loadExData = async b => {
		if (!b) return;
		exData = (await browser.storage.local.get('simple_gesture_exdata')).simple_gesture_exdata || { customGestureList: []};
	};

	SimpleGesture.loadIni = async () => {
		const res = await browser.storage.local.get('simple_gesture');
		if (res && res.simple_gesture) {
			Object.assign(SimpleGesture.ini, res.simple_gesture);
		}
		loadExData(exData);
		lastInnerWidth = 0; // for recalucrate stroke size on touchstart.
	};

	// START HERE ! ------
	//VV.addEventListener('resize', fixSize); this is called too many times, so use 'touchdown' instead of 'resize'.
	await SimpleGesture.loadIni();
	if (SimpleGesture.ini.blacklist) {
		for (const urlPattern of SimpleGesture.ini.blacklist) {
			if (urlPattern.url && location.href.startsWith(urlPattern.url)) {
				return;
			}
		}
	}
	SimpleGesture.addTouchEventListener(window, { start: onTouchStart, move: onTouchMove, end: onTouchEnd });
	VV.addEventListener('scroll', e => {
		fixToastPosition();
		onTouchMove(e);
	});
})();

