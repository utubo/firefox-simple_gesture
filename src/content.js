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
			'D-R-U': 'reload',
			'L-D-R': 'close',
			'R-D-L': 'newTab',
		},
		'strokeSize': 50,
		'timeout': 1500,
		'doubleTapMsec': 300,
		'toast': false,
		'blacklist': []
	};
	SimpleGesture.MAX_LENGTH = 17; // 9 moves + 8 hyphens = 17 chars.
	const VV = window.visualViewport || { isDummy: 1, offsetLeft: 0, offsetTop: 0, scale: 1, addEventListener: () => {} };

	// fields ------------
	let gesture = null; // e.g. 'L-R-U-D'
	let startPoint = null; // e.g. 'L:', 'R:', 'T:' or 'B:'
	let lx = 0; // last X
	let ly = 0; // last Y
	let lg = null; // last gesture (e.g. 'L','R','U' or 'D')
	let target = null;
	let timer = null;
	let hideToastTimer = null;
	let isGestureEnabled = true;
	let touchEndTime = 0;
	// for screen size
	let lastInnerWidth = 0;
	let lastInnerHeight = 0;
	let size = SimpleGesture.ini.strokeSize;
	// others
	let toast;
	let toastMain;
	let toastText;
	let toastUdlr;
	let toastSub;
	let isToastVisible;
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
		const z = Math.min(w, h) / 320;
		size = (SimpleGesture.ini.strokeSize * z)^0;
	};

	// touch-events ------
	const onTouchStart = e => {
		fixSize();
		if (!size) return;
		gesture = '';
		if (new Date().getTime - touchEndTime <= SimpleGesture.doubleTapMsec) {
			gesture += 'W';
		}
		[lx, ly] = SimpleGesture.getXY(e);
		lg = null;
		setupStartPoint(lx, ly);
		target = e.target;
		if (SimpleGesture.onGestureStart && SimpleGesture.onGestureStart(e) === false) return;
		restartTimer();
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
		if (SimpleGesture.onInputGesture && SimpleGesture.onInputGesture(e, gesture, startPoint) === false) return;
		if (SimpleGesture.ini.toast) showGesture();
		restartTimer();
	};

	const onTouchEnd = e => {
		try {
			touchEndTime = new Date().getTime();
			window.clearTimeout(timer);
			hideToast();
			if (SimpleGesture.onGestured && SimpleGesture.onGestured(e, gesture, startPoint) === false) return;
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
		const a = (Math.min(lastInnerWidth, lastInnerHeight) / 10)^0;
		if (x < a) {
			startPoint = 'L:';
		} else if (x > lastInnerWidth - a) {
			startPoint = 'R:';
		} else if (y < a) {
			startPoint = 'T:';
		} else if (y > lastInnerHeight - a) {
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
			n.setAttribute(k, attrs[key]);
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
		const svg = getSvgNode('svg', { width: 12, height: 12, viewBox '0 0 12 12' });
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
		dobuleTapSvg.appendChild(getSvgNode('path', { d: 'M3 10a5 5 0 1 1 6 0' }));
		dobuleTapSvg.appendChild(getSvgNode('path', { d: 'M4 8a3 3 0 1 1 4 0' }));
	};
	SimpleGesture.drawArrows = (udlr, label) => {
		makeArrowSvg();
		const f = document.createDocumentFragment();
		for (const g of udlr.split('-')) {
			let s;
			if (g === 'W') {
				s = dobuleTapSvg.cloneNode(true);
			} else {
				s = arrowSvg.cloneNode(true);
				const r = g === 'U' ? 0 : g === 'D' ? 180 : g === 'L' ? 270 : 90;
				s.style.transform = `rotate(${r}deg)`;
				s.style.display = 'inline-block';
			}
			const c = arrowContainer.cloneNode();
			c.appendChild(s);
			f.appendChild(c);
		}
		label.textContent = '';
		label.appendChild(f);
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
		clearTimeout(hideToastTimer);
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
			SimpleGesture.ini = res.simple_gesture;
		}
		loadExData(exData);
		lastInnerWidth = 0; // for recalucrate stroke size on touchstart.
	};

	// START HERE ! ------
	//VV.addEventListener('resize', fixSize); this is called too many times, so instead of touchdown.
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

