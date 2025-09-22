var SimpleGesture = {};
if (typeof browser === 'undefined') {
	storageOrg = chrome.storage; // global scope for options.js
	browser = chrome;
	browser.storage = {
		local: {
			get: key => new Promise(resolve => { chromeOrg.storage.local.get(key, resolve); }),
		}
	};
}
(async () => {
	'use strict';

	// constraints -------
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
		maxFingers: 1,
		strokeSize: 50,
		timeout: 1500,
		doubleTapMsec: 200,
		delaySingleTap: false,
		toast: true,
		toastMinStroke: 2,
		blacklist: [],
		disableWhileZoomedIn: false,
		suggestNext: true,
		confirmCloseTabs: true,
		interval: 0,
		pullToRefresh: false,
	};
	SimpleGesture.MAX_LENGTH = 9;
	const SINGLETAP_MSEC = 200;
	const SHOW_TOAST_DELAY = 200; // Prevent the double-tap toast from blinking.
	const SUGGEST_OPACITY = 0.5;
	const VV = window.visualViewport || { isDummy: 1, offsetLeft: 0, offsetTop: 0, scale: 1, addEventListener: () => {} };
	const vvWidth = () => VV.isDummy ? window.innerWidth : VV.width;
	const vvHeight = () => VV.isDummy ? window.innerHeight : VV.height;

	// fields ------------
	// gesture
	let arrows = null;
	let startPoint = ''; // e.g. 'L:', 'R:', 'T:' or 'B:'
	let lx = 0; // last X
	let ly = 0; // last Y
	let la = null; // last arrow (e.g. 'L','R','U' or 'D')
	let target = null;
	let touches = [];
	let timer = null;
	let isGestureEnabled = true;
	let touchStartTime = 0;
	let touchEndTime = 0;
	let fingersNum = 0;
	let fingers = '';
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
	let toastSub;
	let isToastVisible;
	// fast scroll
	let fastScroll = null;
	// pull to refresh
	let enablePullToRefresh = false;
	// others
	let iniTimestamp = 0;
	let exData;
	let intervalSleep = false;
	const ACCEPT_SINGLE_TAP = -1;
	const doubleTap = { timer: null, count: ACCEPT_SINGLE_TAP };
	const singleTap = { timer: null };

	// utilities ---------
	SimpleGesture.getXY = e => {
		const p = e.touches ? e.touches[0] : e;
		return p.clientX !== undefined ? [p.clientX - VV.offsetLeft, p.clientY - VV.offsetTop] : [lx, ly];
	};

	const getMessage = s => {
		try {
			return browser.i18n.getMessage(s.replace(/[^0-9a-zA-Z_]/g, '_'));
		} catch (e) {
			return s;
		}
	};

	const restartTimer = () => {
		clearTimeout(timer);
		timer = SimpleGesture.ini.timeout ? setTimeout(timeoutGesture, SimpleGesture.ini.timeout) : null;
	};

	const resetGesture = e => {
		arrows = null;
		timer = null;
		if (e?.withTimeout && toast && SimpleGesture.ini.toast) {
			SimpleGesture.showTextToast(`( ${getMessage('timeout')} )`);
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
		e.arrows = arrows;
		e.startPoint = startPoint;
		e.fingers = fingers;
		return f(e);
	};

	const getLinkTag = _touches => {
		for (const t of _touches) {
			let a = t.target;
			while (a && !a.href) a = a.parentNode;
			if (a?.href) return a;
		}
	};

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
		requestAnimationFrame(() => {
			fn.call(t, { top: top, behavior: 'smooth' });
		});
	};

	// note: `click()` is not bubbling on FF for Android.
	let isLabelTargetClicked = false;

	const onLabelTargetClick = () => { isLabelTargetClicked = true; };

	const clickTarget = (tg, ev) => {
		let ctg = tg;
		if ('<INPUT><SELECT><TEXTAREA>'.indexOf(ctg.tagName) === -1) {
			while (ctg && '<LABEL><BUTTON>'.indexOf(ctg.tagName) === -1) {
				ctg = ctg.parentNode;
			}
			ctg = ctg || tg;
		}
		let labelTarget = null;
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
		if (intervalSleep) return;
		fixSize();
		if (!size) return;
		touchStartTime = Date.now();
		if (touchStartTime - touchEndTime <= SimpleGesture.ini.doubleTapMsec) {
			arrows = doubleTap.count === 2 ? [] : ['W'];
			doubleTap.count = doubleTap.count === 2 ? ACCEPT_SINGLE_TAP : 2;
			clearTimeout(doubleTap.timer);
			clearTimeout(singleTap.timer);
		} else {
			arrows = [];
			doubleTap.count = 1;
			startPoint = '';
		}
		[lx, ly] = SimpleGesture.getXY(e);
		la = null;
		setupStartPoint(lx, ly);
		if (setupFastScroll()) return;
		fingersNum = 1;
		fingers = '';
		if (!setupFingers(e)) return;
		target = 'composed' in e ? e.composedPath()[0] : e.target;
		touches = e?.touches || [e];
		if (executeEvent(!arrows[0] ? SimpleGesture.onStart : SimpleGesture.onInput, e)) return;
		restartTimer();
		if (arrows[0] === 'W' && SimpleGesture.ini.toast) showGestureDelay();
		if (SimpleGesture.ini.pullToRefresh) {
			enablePullToRefresh = pullToRefreshStart()
		}
	};

	const onTouchMove = e => {
		if (fastScroll) {
			doFastScroll(e);
			return;
		}
		if (arrows === null) return;
		if (arrows.length > SimpleGesture.MAX_LENGTH) return;
		if (!arrows && SimpleGesture.ini.disableWhileZoomedIn && 1.1 < VV.scale) return;
		if (!setupFingers(e)) return;
		const [x, y] = SimpleGesture.getXY(e);
		const dx = x - lx;
		const dy = y - ly;
		const absX = dx < 0 ? -dx : dx;
		const absY = dy < 0 ? -dy : dy;
		if (absX < size && absY < size) return;
		lx = x;
		ly = y;
		const a = absX < absY ? (dy < 0 ? 'U' : 'D') : (dx < 0 ? 'L' : 'R');
		if (a === la) return;
		la = a;
		arrows.push(a);
		if (executeEvent(SimpleGesture.onInput, e)) return;
		if (enablePullToRefresh) {
			enablePullToRefresh = pullToRefreshMove()
		}
		if (SimpleGesture.ini.toast) showGesture();
		restartTimer();
	};

	const getCommandByState = (s, f, a) => {
		if (!a) return;
		const fa = f + a.join('-');
		return SimpleGesture.ini.gestures[s + fa] ||
			SimpleGesture.ini.gestures[fa];
	}

	const onTouchEnd = e => {
		try {
			touchEndTime = Date.now();
			clearTimeout(timer);
			clearTimeout(showToastTimer);
			hideToast();
			if (enablePullToRefresh && pullToRefreshEnd()) {
				location.reload();
				return;
			}
			if (setupSingleTap(e)) return;
			if (executeEvent(SimpleGesture.onEnd, e)) return;
			const g = getCommandByState(startPoint, fingers, arrows);
			if (!g) return;
			if (!isGestureEnabled && g !== 'disableGesture') return;
			SimpleGesture.doCommand(g);
			e.stopPropagation();
			e.cancelable && e.preventDefault();
			if (SimpleGesture.ini.interval) {
				intervalSleep = true;
				setTimeout(() => {
					intervalSleep = false;
				}, SimpleGesture.ini.interval);
			}
		} finally {
			arrows = null;
			fastScroll = null;
			enablePullToRefresh = false;
			//target = null; Keep target for Custom gesture
		}
	};

	const onCancel = () => {
		clearTimeout(timer);
		clearTimeout(showToastTimer);
		hideToast();
		arrows = null;
		touchEndTime = 0;
	};

	const setupStartPoint = async (x, y) => {
		if (startPoint) {
			// nop
		} else if (x < edgeWidth) {
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
			case 'disableGesture': toggleEnable(options); break;
			case 'openLinkInNewTab':
			case 'openLinkInBackground':
				options = options || {}
				options.url = getLinkTag(touches)?.href;
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
		target?.classList?.add('simple-gesture-target');
	};

	const toggleEnable = (force = null) => {
		isGestureEnabled = force === null ? !isGestureEnabled : force;
		SimpleGesture.showTextToast(getMessage('message_gesture_is_' + (isGestureEnabled ? 'enabled' : 'disabled')));
	};

	const waitForDoubleTap = e => {
		if (!isGestureEnabled) return;
		if (doubleTap.count === ACCEPT_SINGLE_TAP) return;
		const paths =  e.composedPath();
		let tg = paths[0];
		const onlyLinkTag = !SimpleGesture.ini.delaySingleTap // not allways
		if (onlyLinkTag) {
			tg = getLinkTag([{ target: tg }]);
			if (!tg) return;
		} else if (!paths.some(p => (
			p.tagName === 'A' ||
			p.tagName === 'LABEL' ||
			p.tagName === 'BUTTON' ||
			p.tagName === 'INPUT' && p.type.match(/button|submit|cancel|clear|checkbox|radio/i)
		))) {
			return;
		}
		e.stopPropagation();
		e.cancelable && e.preventDefault();
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
			if (onlyLinkTag) {
				tg.dispatchEvent(ev);
			} else {
				clickTarget(tg, ev);
			}
		}, SimpleGesture.ini.doubleTapMsec + 1);
	};

	SimpleGesture.isNowaitSingleTap = () => {
		return !getCommandByState(startPoint, fingers, ['W']);
	};

	const setupSingleTap = e => {
		if (fingersNum < 2) return;
		if (arrows?.length !== 0) return;
		if (SINGLETAP_MSEC < touchEndTime - touchStartTime) return;
		// check double tap
		if (SimpleGesture.isNowaitSingleTap()) {
			arrows = ['S'];
			return;
		}
		// single tap with delay
		singleTap.timer = setTimeout(() => {
			if (!arrows?.length) {
				arrows = ['S'];
				onTouchEnd(e);
			}
		}, SimpleGesture.ini.doubleTapMsec);
		return true
	};

	const setupFingers = e => {
		const f = e.touches?.length || 1;
		if (SimpleGesture.ini.maxFingers < f) {
			resetGesture();
			return false;
		}
		if (fingersNum < f) {
			fingersNum = f;
			fingers = `${f}:`;
		}
		return true;
	};

	// fast scroll --------------
	const setupFastScroll = () => {
		if (!startPoint[0]) return;
		if (SimpleGesture.ini.fastScroll !== startPoint[0]) return;
		const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
		let z = h / lastInnerHeight;
		if (z <= 1) return;
		if (SimpleGesture.ini.fastScrollRv) {
			z = -z;
		}
		fastScroll = {
			y: ly, top: window.scrollY, left: window.scrollX, z: z,
		};
		return true;
	};

	const doFastScroll = e => {
		const [_, y] = SimpleGesture.getXY(e);
		window.scrollTo(
			fastScroll.left,
			fastScroll.top + (y - fastScroll.y) * fastScroll.z
		);
	};

	// pull to refresh --------------
	const pullToRefreshStart = () => {
		return fingersNum === 1 &&
			!VV.offsetTop &&
			!scrollY &&
			!document.documentElement.scrollTop &&
			!document.body.scrollTop;
	};

	const pullToRefreshMove = () => {
		return !arrows ||
			arrows.lenght === 0 ||
			arrows.length === 1 && arrows[0] === 'D'
	};

	const pullToRefreshEnd = () => {
		return arrows && arrows[0] === 'D' && !arrows[1]
	};

	const pullToRefrshToast = () => {
		const label = document.createElement('DIV');
		label.style.cssText = `
			border-top: 1px;
			line-height: 1;
		`;
		label.textContent = getMessage('pullToRefresh');
		return label;
	};

	// toast --------------
	const arrowsSvg = {};

	const getSvgNode = (name, attrs) => {
		const n = document.createElementNS('http://www.w3.org/2000/svg', name);
		for (const [k, v] of Object.entries(attrs)) {
			n.setAttribute(k, v);
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
		arrowsSvg.S = base.cloneNode(true);
		arrowsSvg.S.firstChild.appendChild(getSvgNode('path', {
			d:'M6 1v2M2 3l1.4 1.4M10 3l-1.4 1.4M4 11q-3-2 1-1v-3q1-2 2 0v2l3 1v1'
		}));
	};

	SimpleGesture.drawArrows = (arrows_, label) => {
		makeArrowSvg();
		const svgs = [];
		for (const a of arrows_) {
			svgs.push(arrowsSvg[a]?.cloneNode(true));
		}
		label.replaceChildren(...svgs);
	};

	const showToast = () => {
		if (!toast) return;
		if (isToastVisible) return;
		isToastVisible = true;
		toast.style.color = SimpleGesture.ini.toastForeground || '#ffffff';
		toastMain.style.background = SimpleGesture.ini.toastBackground || '#21a1de99';
		toastSub.style.background = SimpleGesture.ini.toastBackground || '#21a1de99';
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
			all: initial;
			backdrop-filter: blur(.1rem);
			box-sizing: border-box;
			font-feature-settings: palt;
			left: 0;
			line-height: 1.5;
			max-height: 100vh;
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
		toastSub = document.createElement('DIV');
		toastSub.style.cssText = `
			font-size: 60%;
			opacity: .7;
			padding-right: .5em;
		`;
		const shadow = toast.attachShadow({ mode: 'open' });
		shadow.appendChild(toastSub);
		shadow.appendChild(toastMain);
		document.body.appendChild(toast);
	};

	const gestureName = async g => {
		if (!g) {
			return '';
		} else if (g[0] === '$') {
			await loadExData(!exData);
			const custom = exData.customGestureList.find(c => c.id === g)
			return custom ? custom.title : ''; // for old ini-data.
		} else {
			return getMessage(g);
		}
	};

	const setTextSafe = (e, t) => {
		e.replaceChildren(document.createTextNode(t));
	};

	const showGesture = async () => {
		clearTimeout(showToastTimer);
		if (await showGestureImpl()) {
			showToast();
		} else {
			hideToast();
		}
	};

	let joinedArrows = '';

	const showGestureImpl = async () => {
		let list = SimpleGesture.ini.gestures;
		const g = getCommandByState(startPoint, fingers, arrows);
		if (!isGestureEnabled && g !== 'disableGesture') return false;
		joinedArrows = arrows.join('-');
		if (!SimpleGesture.ini.suggestNext) {
			if (!g) return false;
			list = {};
			list[joinedArrows] = g;
		} else if (g) {
			// nop
		} else if (enablePullToRefresh) {
			// nop
		} else if (arrows[SimpleGesture.ini.toastMinStroke - 1]) {
			// nop
		} else {
			return false;
		}
		setupToast();
		setTextSafe(toastSub, SimpleGesture.getAddnlText(startPoint, fingers));
		return await suggestGestures(list, g);
	};

	const showGestureDelay = () => {
		clearTimeout(showToastTimer);
		showToastTimer = setTimeout(showGesture, SHOW_TOAST_DELAY);
	};

	SimpleGesture.getAddnlText = (s, f) => {
		let addnl = [];
		if (f) {
			addnl.push(f.replace(/:?$/, getMessage('fingers')));
		}
		if (s) {
			addnl.push(`${getMessage(`fromEdge-${s[0]}`)}`);
		}
		return addnl.join(' ');
	}

	SimpleGesture.showTextToast = text => {
		setupToast();
		setTextSafe(toastMain, text);
		toastSub.replaceChildren();
		showToast();
		hideToast(1000);
	};

	const isMatch = (k, fg, sg) => {
		if (k.match(/^[LRTB]:/)) {
			return k.startsWith(sg);
		} else {
			return k.startsWith(fg);
		}
	};

	const suggestGestures = async (list, match) => {
		const fGesture = fingers + joinedArrows;
		const sGesture = startPoint + fGesture;
		const f = document.createDocumentFragment();
		let done = false;
		if (enablePullToRefresh) {
			f.appendChild(pullToRefrshToast());
			done = true
		}
		for (const [k, v] of Object.entries(list)) {
			if (!isMatch(k, fGesture, sGesture)) continue;
			if (startPoint && list[startPoint + k]) continue;
			const name = await gestureName(v);
			if (!name) continue; // for old ini-data.
			// create element
			const label = document.createElement('DIV');
			label.style.cssText = `
				border-top: 1px;
				line-height: 1;
				${done ? 'margin-top: .5rem;' : ''}
			`;
			SimpleGesture.drawArrows(k.replace(/^.:/, '').split('-'), label);
			let i = arrows.length + 1;
			for (const a of label.childNodes) {
				if (0 < --i) {
					continue;
				}
				a.style.opacity = SUGGEST_OPACITY;
			}
			const text = document.createElement('SPAN');
			text.style.opacity = v === match ? 1 : SUGGEST_OPACITY;
			text.textContent = name
			label.appendChild(text);
			f.appendChild(label);
			done = true;
		}
		toastMain.replaceChildren(f);
		return done;
	};

	// uncommon modules ---
	SimpleGesture.mod = (name, fn) => {
		import(browser.runtime.getURL(`/modules/${name}.js`)).then(fn);
	};

	// utils for setup ----
	SimpleGesture.addTouchEventListener = (target, events) => {
		if ('ontouchstart' in window /* || navigator.maxTouchPoints -> FF desktop returns 256. */) {
			target.addEventListener('touchstart', events.start, true);
			target.addEventListener('touchmove', events.move, true);
			target.addEventListener('touchend', events.end, true);
			target.addEventListener('touchcancel', events.cancel, true);
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
		if (res?.simple_gesture) {
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
	await SimpleGesture.loadIni();
	if (SimpleGesture.ini.blacklist) {
		for (const urlPattern of SimpleGesture.ini.blacklist) {
			if (urlPattern.url && location.href.startsWith(urlPattern.url)) {
				return;
			}
		}
	};

	SimpleGesture.addTouchEventListener(window, { start: onTouchStart, move: onTouchMove, end: onTouchEnd, cancel: onCancel });
	VV.addEventListener('scroll', e => {
		fixToastPosition();
		onTouchMove(e);
	});
	// 'resize' is called too many times, so use 'touchstart' instead of 'resize'.
	// VV.addEventListener('resize', fixSize);
})();

