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
			'L-D-R-U-L': 'openAddonSettings',
		},
		strokeSize: 50,
		timeout: 1500,
		doubleTapMsec: 200,
		delaySingleTap: false,
		toast: true,
		blacklist: [],
		disableWhileZoomedIn: false
	};
	SimpleGesture.MAX_LENGTH = 17; // 9 moves + 8 hyphens = 17 chars.
	const SHOW_TOAST_DELAY = 200; // Prevent the double-tap toast from blinking.
	const VV = window.visualViewport || { isDummy: 1, offsetLeft: 0, offsetTop: 0, scale: 1, addEventListener: () => {} };
	const vvWidth = () => VV.isDummy ? window.innerWidth : VV.width;
	const vvHeight = () => VV.isDummy ? window.innerHeight : VV.height;

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
	let toastArrows;
	let toastSub;
	let isToastVisible;
	// others
	let iniTimestamp = 0;
	let exData;
	const ACCEPT_SINGLE_TAP = -1;
	const doubleTap = { timer: null, count: ACCEPT_SINGLE_TAP };

	// utils -------------
	SimpleGesture.getXY = e => {
		const p = e.touches ? e.touches[0] : e;
		return p.clientX !== undefined ? [p.clientX - VV.offsetLeft, p.clientY - VV.offsetTop] : [lx, ly];
	};

	const restartTimer = () => {
		clearTimeout(timer);
		timer = SimpleGesture.ini.timeout ? setTimeout(timeoutGesture, SimpleGesture.ini.timeout) : null;
	};

	const resetGesture = e => {
		gesture = null;
		timer = null;
		if (e && e.withTimeout && toast) {
			SimpleGesture.showTextToast(`( ${browser.i18n.getMessage('timeout')} )`);
		} else {
			hideToast();
		}
	};

	const timeoutGesture = () => {
		resetGesture({ withTimeout: true });
	};

	const fixSize = () => {
		const w = vvWidth();
		const h = vvHeight();
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

	const getLinkTag = target => {
		let a = target;
		while (a && !a.href) a = a.parentNode;
		return a;
	}

	// dom control --------
	const scroll = (d, cb) => {
		let t = target;
		while (t) {
			try {
				let scrollable = false;
				if (d <= 0) {
					scrollable = 0 < t.scrollTop;
				} else if (t.clientHeight) {
					scrollable = 1 <= Math.abs(t.scrollHeight - t.clientHeight - t.scrollTop);
				}
				if (scrollable) {
					if (t.tagName === 'TEXTAREA') break;
					const o = window.getComputedStyle(t).overflowY;
					if (o === 'auto' || o === 'scroll') break;
				}
			} catch {}
			t = t.parentNode;
		}
		t = t && t.tagName !== 'BODY' ? t : document.documentElement;
		const [fn, top] = cb(t);
		fn.call(t, { top: top, behavior: 'smooth' });
	};

	// note: `click()` is not bubbling on FF for Android.
	var isLabelTargetClicked = false;

	const onLabelTargetClick = () => { isLabelTargetClicked = true; };

	const clickTarget = (tg, ev) => {
		var ctg = tg;
		if ('<INPUT><SELECT><TEXTAREA>'.indexOf(ctg.tagName) === -1) {
			while (ctg && '<LABEL><BUTTON>'.indexOf(ctg.tagName) === -1) {
				ctg = ctg.parentNode;
			}
			ctg = ctg || tg;
		}
		var labelTarget = null;
		if (ctg.htmlFor) {
			labelTarget = document.getElementById(ctg.htmlFor);
		}
		if (ctg.tagName === 'LABEL' && !labelTarget) {
			labelTarget = ctg.querySelector('INPUT,SELECT,TEXTAREA,BUTTON');
		}
		if (labelTarget) {
			isLabelTargetClicked = false;
			labelTarget.addEventListener('click', onLabelTargetClick);
			ctg.dispatchEvent(ev);
			labelTarget.removeEventListener('click', onLabelTargetClick);
			if (!isLabelTargetClicked) {
				labelTarget.click();
			}
		} else {
			ctg.dispatchEvent(ev);
		}
	};

	// touch-events ------
	const onTouchStart = e => {
		fixSize();
		if (!size) return;
		if (Date.now() - touchEndTime <= SimpleGesture.ini.doubleTapMsec) {
			gesture = doubleTap.count === 2 ? '': 'W';
			doubleTap.count = doubleTap.count === 2 ? ACCEPT_SINGLE_TAP : 2;
			clearTimeout(doubleTap.timer);
		} else {
			gesture = '';
			doubleTap.count = 1;
		}
		[lx, ly] = SimpleGesture.getXY(e);
		lg = null;
		setupStartPoint(lx, ly);
		target = 'composed' in e ? e.composedPath()[0] : e.target;
		if (executeEvent(!gesture ? SimpleGesture.onStart : SimpleGesture.onInput, e) === false) return;
		restartTimer();
		if (gesture === 'W' && SimpleGesture.ini.toast) showGestureDelay();
	};

	const onTouchMove = e => {
		if (gesture === null) return;
		if (gesture.length > SimpleGesture.MAX_LENGTH) return;
		if (!gesture && SimpleGesture.ini.disableWhileZoomedIn && 1.1 < VV.scale) return;
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
		if (executeEvent(SimpleGesture.onInput, e) === false) return;
		if (SimpleGesture.ini.toast) showGesture();
		restartTimer();
	};

	const onTouchEnd = e => {
		try {
			touchEndTime = Date.now();
			clearTimeout(timer);
			clearTimeout(showToastTimer);
			hideToast();
			if (executeEvent(SimpleGesture.onEnd, e) === false) return;
			const g = SimpleGesture.ini.gestures[startPoint + gesture] || SimpleGesture.ini.gestures[gesture];
			if (!g) return;
			if (!isGestureEnabled && g !== 'disableGesture') return;
			SimpleGesture.doCommand(g);
			e.stopPropagation();
			e.preventDefault();
		} finally {
			gesture = null;
			//target = null; Keep target for Custom gesture
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
			case 'top': scroll(-1, s => [s.scrollTo, 0]); break;
			case 'bottom': scroll(1, s => [s.scrollTo, s.scrollHeight]); break;
			case 'pageUp': scroll(-1, s => [s.scrollBy, -s.clientHeight]); break;
			case 'pageDown': scroll(1, s => [s.scrollBy, s.clientHeight]); break;
			case 'reload': location.reload(); break;
			case 'disableGesture': toggleEnable(); break;
			case 'openLinkInNewTab':
			case 'openLinkInBackground':
				options = options || {}
				options.url = getLinkTag(target)?.href;
				if (!options.url) return;
				// not break
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
	};

	const setCustomGestureTarget = () => {
		const befores = document.getElementsByClassName('simple-gesture-target');
		[...befores].forEach(e => { e.classList.remove('simple-gesture-target'); });
		target && target.classList && target.classList.add('simple-gesture-target');
	};

	const toggleEnable = () => {
		isGestureEnabled = !isGestureEnabled;
		SimpleGesture.showTextToast(browser.i18n.getMessage('message_gesture_is_' + (isGestureEnabled ? 'enabled' : 'disabled')));
	};

	const waitForDoubleTap = e => {
		if (!isGestureEnabled) return;
		if (doubleTap.count === ACCEPT_SINGLE_TAP) return;
		var tg = 'composed' in e ? e.composedPath()[0] : e.target;
		if (!tg) return;
		const onlyLinkTag = !SimpleGesture.ini.delaySingleTap
		if (onlyLinkTag) {
			tg = getLinkTag(tg);
			if (!tg) return;
		}
		e.stopPropagation();
		e.preventDefault();
		if (doubleTap.count !== 1) return;
		const ev = new MouseEvent('click', {
			bubbles: true,
			cancelable: true,
			clientX: e.clientX,
			clientY: e.clientY,
		});
		doubleTap.timer = setTimeout(() => {
			doubleTap.timer = null;
			doubleTap.count = ACCEPT_SINGLE_TAP;
			if (onlyLinkTag ) {
				tg.dispatchEvent(ev);
			} else {
				clickTarget(tg, ev);
			}
		}, SimpleGesture.ini.doubleTapMsec + 1);
	};

	// toast --------------
	const arrowsSvg = {};

	const getSvgNode = (name, attrs) => {
		const n = document.createElementNS('http://www.w3.org/2000/svg', name);
		for (let key in attrs) {
			n.setAttribute(key, attrs[key]);
		}
		return n;
	};

	const makeArrowSvg = () => {
		if (arrowsSvg.U) return;
		const base = document.createElement('SPAN');
		base.style.cssText = `
			display: inline-block;
			height: 1em;
			margin: 0 .1em;
			vertical-align: bottom;
		`;
		base.appendChild(getSvgNode('svg', { width: 12, height: 12, viewBox: '0 0 12 12' }));
		base.firstChild.style.cssText = `
			display: inline-block;
			height: 1em;
			width: 1em;
			stroke: currentColor;
			stroke-linecap: round;
			stroke-linejoin: round;
			fill: none;
		`;
		const rotate = { U: 0, R: 90, D: 180, L: 270 };
		const arrowBase = base.cloneNode(true);
		arrowBase.firstChild.appendChild(getSvgNode('path', { d: 'M 6 10v-8m-4 4l4-4 4 4' }));
		for (const [key, r] of Object.entries(rotate)) {
			arrowsSvg[key] = arrowBase.cloneNode(true);
			arrowsSvg[key].firstChild.style.transform = `rotate(${r}deg)`;
		}
		arrowsSvg.W = base.cloneNode(true);
		arrowsSvg.W.firstChild.appendChild(getSvgNode('path', {
			d:'M1 6a4 4 0 1 1 10 0 M3 6a3 3 0 1 1 6 0 M4 11q-3-2 1-1v-3.5q1-2 2 0v2.5l3 1v1'
		}));
	};

	SimpleGesture.drawArrows = (gesture, label) => {
		makeArrowSvg();
		const a = [];
		for (const g of gesture.split('-')) {
			a.push(arrowsSvg[g].cloneNode(true));
		}
		label.replaceChildren(...a);
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
		const w = vvWidth();
		const h = vvHeight();
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
		toastArrows = document.createElement('SPAN');
		toastSub = document.createElement('DIV');
		toastSub.style.cssText = `
			font-size: 60%;
			opacity: .7;
			padding-right: .5em;
			text-align: right;
		`;
		toastMain.appendChild(toastText);
		toastMain.appendChild(toastArrows);
		const shadow = toast.attachShadow({ mode: 'open' });
		shadow.appendChild(toastMain);
		shadow.appendChild(toastSub);
		document.body.appendChild(toast);
	};

	const showGesture = async () => {
		clearTimeout(showToastTimer);
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
			name = exData.customGestureList.find(c => c.id === g).title;
		} else {
			name = browser.i18n.getMessage(g);
		}
		setupToast();
		toastText.textContent = name;
		SimpleGesture.drawArrows(gesture, toastArrows);
		if (toast.getAttribute('x-startPoint') !== startPoint) {
			toast.setAttribute('x-startPoint', startPoint);
			toastSub.textContent = startPoint ? `${browser.i18n.getMessage(`fromEdge-${startPoint[0]}`)}` : '';
		}
		showToast();
	};

	const showGestureDelay = () => {
		clearTimeout(showToastTimer);
		showToastTimer = setTimeout(showGesture, SHOW_TOAST_DELAY);
	}

	SimpleGesture.showTextToast = text => {
		setupToast();
		toastText.textContent = text;
		toastArrows.textContent = '';
		toastSub.textContent = '';
		showToast();
		hideToast(1000);
	}

	// uncommon modules ---
	SimpleGesture.mod = (name, fn) => {
		import(browser.runtime.getURL(`/modules/${name}.js`)).then(fn);
	}

	// utils for setup ----
	SimpleGesture.addTouchEventListener = (target, events) => {
		if ('ontouchstart' in window || navigator.maxTouchPoints) {
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

	SimpleGesture.loadIni = async timestamp => {
		if (timestamp && timestamp === iniTimestamp) return;
		iniTimestamp = timestamp;
		const res = await browser.storage.local.get('simple_gesture');
		if (res && res.simple_gesture) {
			Object.assign(SimpleGesture.ini, res.simple_gesture);
		}
		loadExData(exData);
		lastInnerWidth = 0; // for recalucrate stroke size on touchstart.
		if (SimpleGesture.isDelaySingleTap()) {
			addEventListener('click', waitForDoubleTap, true);
		} else{
			removeEventListener('click', waitForDoubleTap);
		}
	};

	SimpleGesture.isDelaySingleTap = () => {
		for (const [k, v] of Object.entries(SimpleGesture.ini.gestures)) {
			if (k.indexOf('W') === -1) continue;
			if (SimpleGesture.ini.delaySingleTap) return true;
			if (v === 'openLinkInNewTab') return true;
			if (v === 'openLinkInBackground') return true;
		}
		return false;
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

