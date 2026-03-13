var SimpleGesture = {};
if (typeof browser === 'undefined') {
	browser = chrome;
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
		tapHoldMsec: 0,
		toast: true,
		toastMinStroke: 2,
		blacklist: [],
		disableWhileZoomedIn: false,
		suggestNext: true,
		confirmCloseTabs: true,
		interval: 0,
		pullToRefresh: '',
	};
	SimpleGesture.MAX_LENGTH = 9;
	const SINGLETAP_MSEC = 200;
	const SHOW_TOAST_DELAY = 200; // Prevent the double-tap toast from blinking.
	const SUGGEST_OPACITY = 0.5;
	const PULL_TO_REFRESH_DELAY = 300;
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
	// others
	let iniTimestamp = 0;
	let exData;
	let intervalSleep = false;
	const ACCEPT_SINGLE_TAP = -1;
	const doubleTap = { timer: null, count: ACCEPT_SINGLE_TAP };
	const singleTap = { timer: null };

	// utilities ---------
	let lcx = 0;
	let lcy = 0;
	SimpleGesture.getXY = e => {
		const a = e.touches ? e.touches[0] : e;
		if (a.clientX !== undefined) {
			lcx = a.clientX;
			lcy = a.clientY;
		}
		return [lcx - VV.offsetLeft, lcy - VV.offsetTop];
	};

	const getMessage = s => {
		try {
			return browser.i18n.getMessage(s.replace(/[^0-9a-zA-Z_]/g, '_'));
		} catch (e) {
			return s;
		}
	};

	const resetGesture = () => {
		arrows = null;
		timeout.cancel();
	};

	const fixSize = () => {
		const w = vvWidth();
		const h = vvHeight();
		if (w === lastInnerWidth && h === lastInnerHeight) return;
		lastInnerWidth = w;
		lastInnerHeight = h;
		const m = Math.min(w, h)
		size = (SimpleGesture.ini.strokeSize * m / 320)^0;
		edgeWidth = (m / 10)^0;
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

	const isScrolled = e => {
		return !e ? false : e.scrollTop || isScrolled(e.parentNode);
	}

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

	// timers ------------
	const restartTimers = () => {
		timeout.reset();
		tapHold.reset();
	};

	const restartTimer = (obj, msec) => {
		clearTimeout(obj.timer);
		obj.timer = msec ? setTimeout(obj.onTimer, msec) : null;
	};

	const timeout = {
		timer: null,
		reset: () => {
			restartTimer(timeout, SimpleGesture.ini.timeout);
		},
		cancel: () => {
			if (timeout.timer) {
				clearTimeout(timeout.timer);
				timeout.timer = null;
			}
		},
		onTimer: () => {
			resetGesture();
			if (toast.isVisible && SimpleGesture.ini.toast) {
				SimpleGesture.showTextToast(`( ${getMessage('timeout')} )`);
			}
		},
	};

	// tap hold ----------
	const tapHold = {
		timer: null,
		reset: () => {
			restartTimer(tapHold, SimpleGesture.ini.tapHoldMsec);
		},
		onTimer: async (e = {}) => {
			if (!arrows) return;
			arrows.push('H');
			executeEvent(SimpleGesture.onInput, e);
			if (SimpleGesture.ini.toast) await toast.showGesture(false);
			if (!getAndDoCommand(e)) return;
			resetGesture();
		},
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
		if (fastScroll.setup()) return;
		fingersNum = 1;
		fingers = '';
		if (!setupFingers(e)) return;
		target = 'composed' in e ? e.composedPath()[0] : e.target;
		touches = e?.touches || [e];
		restartTimers();
		if (executeEvent(!arrows[0] ? SimpleGesture.onStart : SimpleGesture.onInput, e)) return;
		if (arrows[0] === 'W' && SimpleGesture.ini.toast) toast.showGestureDelay();
		if (SimpleGesture.ini.pullToRefresh) {
			pullToRefresh.isEnabled = pullToRefresh.start()
		}
	};

	const onTouchMove = e => {
		if (fastScroll.state) return fastScroll.do(e);
		if (arrows === null) return;
		if (arrows.length > SimpleGesture.MAX_LENGTH) return;
		if (!arrows && SimpleGesture.ini.disableWhileZoomedIn && 1.1 < VV.scale) return;
		if (!setupFingers(e)) return;
		const [x, y] = SimpleGesture.getXY(e);
		const dx = x - lx;
		const dy = y - ly;
		const absX = dx < 0 ? -dx : dx;
		const absY = dy < 0 ? -dy : dy;
		if (dy < 0 && pullToRefresh.isEnabled) {
			pullToRefresh.cancel();
		}
		if (absX < size && absY < size) return;
		lx = x;
		ly = y;
		const a = absX < absY ? (dy < 0 ? 'U' : 'D') : (dx < 0 ? 'L' : 'R');
		if (a === la) return;
		la = a;
		arrows.push(a);
		restartTimers();
		if (executeEvent(SimpleGesture.onInput, e)) return;
		if (pullToRefresh.isEnabled) {
			pullToRefresh.move()
		}
		if (SimpleGesture.ini.toast) toast.showGesture();
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
			timeout.cancel();
			toast.hide();
			if (getAndDoCommand(e)) {
				e.stopPropagation();
				e.cancelable && e.preventDefault();
			}
		} finally {
			arrows = null;
			fastScroll.state = null;
			pullToRefresh.cancel();
			//target = null; Keep target for Custom gesture
		}
	};

	const getAndDoCommand = e => {
		if (pullToRefresh.isEnabled && pullToRefresh.end()) return;
		if (setupSingleTap(e)) return;
		if (executeEvent(SimpleGesture.onEnd, e)) return true;
		const g = getCommandByState(startPoint, fingers, arrows);
		if (!g) return;
		if (!isGestureEnabled && g !== 'disableGesture') return;
		SimpleGesture.doCommand(g);
		if (SimpleGesture.ini.interval) {
			intervalSleep = true;
			setTimeout(() => {
				intervalSleep = false;
			}, SimpleGesture.ini.interval);
		}
		return true;
	};

	const onCancel = () => {
		timeout.cancel();
		clearTimeout(toast.timer);
		toast.hide();
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
			toast.hide();
			return false;
		}
		if (fingersNum < f) {
			fingersNum = f;
			fingers = `${f}:`;
		}
		return true;
	};

	// fast scroll --------------
	const fastScroll = {
		state: null,
		setup: () => {
			if (!startPoint[0]) return;
			if (SimpleGesture.ini.fastScroll !== startPoint[0]) return;
			const h = document.documentElement.scrollHeight - document.documentElement.clientHeight;
			let z = h / lastInnerHeight;
			if (z <= 1) return;
			if (SimpleGesture.ini.fastScrollRv) {
				z = -z;
			}
			fastScroll.state = {
				y: ly, top: window.scrollY, left: window.scrollX, z: z,
			};
			return true;
		},
		do: e => {
			const [_, y] = SimpleGesture.getXY(e);
			window.scrollTo(
				fastScroll.state.left,
				fastScroll.state.top + (y - fastScroll.state.y) * fastScroll.state.z
			);
		},
	};


	// pull to refresh --------------
	const pullToRefresh = {
		isEnabled: false,
		start: () => {
			return fingersNum === 1 &&
				!VV.offsetTop &&
				!scrollY &&
				!document.documentElement.scrollTop &&
				!document.body.scrollTop &&
				!isScrolled(target)
		},
		cancel: () => {
			pullToRefresh.isEnabled = false
			pullToRefresh.hide();
		},
		move: () => {
			if (!arrows) {
				// NOP
			} else if (!pullToRefresh.continue()) {
				pullToRefresh.cancel();
			} else if (SimpleGesture.ini.pullToRefresh === 'icon') {
				SimpleGesture.mod('pullToRefresh', m => {
					m.show();
					pullToRefresh.hide = m.hide;
				});
			}
		},
		continue: () => {
			return arrows?.[0] === 'D' &&
				!arrows[1] &&
				!getCommandByState(startPoint, fingers, arrows);
		},
		end: () => {
			if (!pullToRefresh.continue()) return;
			if (PULL_TO_REFRESH_DELAY < touchEndTime - touchStartTime) {
				location.reload();
			} else {
				pullToRefresh.cancel();
			}
			return true;
		},
		toast: () => {
			const label = document.createElement('DIV');
			label.textContent = getMessage('pullToRefresh');
			return label;
		},
		hide: () => {},
	};

	// toast --------------
	SimpleGesture.drawArrows = (arrows_, label) => {
		toast.makeSvgs();
		const svgs = [];
		for (const a of arrows_) {
			svgs.push(toast.svg[a]?.cloneNode(true));
		}
		label.replaceChildren(...svgs);
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
		toast.setup();
		toast.setText(toast.main, text);
		toast.sub.replaceChildren();
		toast.show();
		toast.hide(1000);
	};

	const toast = {
		div: null, main: null, sub: null, svg: {},
		timer: null, hideTimer: null,
		isVisible: false,
		makeSvgs: () => {
			if (toast.svg.U) return;
			const getSvgNode = (name, attrs) => {
				const n = document.createElementNS('http://www.w3.org/2000/svg', name);
				for (const [k, v] of Object.entries(attrs)) {
					n.setAttribute(k, v);
				}
				return n;
			};
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
			const withPath = d => {
				const p = base.cloneNode(true);
				p.firstChild.appendChild(getSvgNode('path', { d }));
				return p;
			};
			const rotate = { U: 0, R: 90, D: 180, L: 270 };
			const arrowBase = withPath('M 6 10v-8m-4 4l4-4 4 4');
			for (const [key, r] of Object.entries(rotate)) {
				toast.svg[key] = arrowBase.cloneNode(true);
				toast.svg[key].firstChild.style.transform = `rotate(${r}deg)`;
			}
			toast.svg.W = withPath('M1 6a4 4 0 1 1 10 0 M3 6a3 3 0 1 1 6 0 M4 11q-3-2 1-1v-3.5q1-2 2 0v2.5l3 1v1');
			toast.svg.S = withPath('M6 1v2M2 3l1.4 1.4M10 3l-1.4 1.4M4 11q-3-2 1-1v-3q1-2 2 0v2l3 1v1');
			toast.svg.H = withPath('M8.2 4.1v-1.5zh1.5M8.2 6.5a2.7 2.7 0 1 1 0.5 0M4 11q-3-2 1-1v-3.5q1-2 2 0v2.5l3 1v1');
		},
		setup: () => {
			if (toast.div) return;
			toast.div = document.createElement('DIV');
			toast.div.style.cssText = `
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
			toast.main = document.createElement('DIV');
			toast.main.style.cssText = `
				display: flex;
				flex-direction: column;
				gap: .5em;
				line-height: 1;
				padding: .2em 0;
			`;
			toast.sub = document.createElement('DIV');
			toast.sub.style.cssText = `
				font-size: 60%;
				opacity: .7;
				padding-right: .5em;
			`;
			const shadow = toast.div.attachShadow({ mode: 'open' });
			shadow.appendChild(toast.sub);
			shadow.appendChild(toast.main);
			document.body.appendChild(toast.div);
		},
		fixSize: () => {
			const w = vvWidth();
			const h = vvHeight();
			const z = Math.min(w, h) / 100;
			toast.div.style.fontSize = ((5 * z)^0) + 'px'; // "vmin" of CSS has a problem when the page is zoomed.
			toast.div.style.width = w + 'px';
		},
		fixPos: () => {
			if (VV.isDummy) return;
			if (!toast.div) return;
			if (!toast.isVisible) return;
			toast.div.style.top = VV.offsetTop + 'px';
			toast.div.style.left = VV.offsetLeft + 'px';
		},
		show: () => {
			if (!toast.div) return;
			if (toast.isVisible) return;
			toast.isVisible = true;
			toast.div.style.color = SimpleGesture.ini.toastForeground || '#ffffff';
			toast.main.style.background = SimpleGesture.ini.toastBackground || '#21a1de99';
			toast.sub.style.background = SimpleGesture.ini.toastBackground || '#21a1de99';
			toast.div.style.transition = 'opacity .3s';
			toast.fixSize();
			toast.fixPos();
			requestAnimationFrame(() => { toast.div.style.opacity = '1'; });
			setTimeout(() => {
				toast.div.style.transition += ',left .2s .1s, top .2s .1s';
			}, 300);
		},
		hide: delay => {
			pullToRefresh.hide();
			if (!toast.div) return;
			if (!toast.isVisible) return;
			clearTimeout(toast.timer);
			clearTimeout(toast.hideTimer);
			if (delay) {
				toast.hideTimer = setTimeout(toast.hide, delay);
				return;
			}
			toast.isVisible = false;
			requestAnimationFrame(() => { toast.div.style.opacity = '0'; });
		},
		showGesture: async (isHide = true) => {
			clearTimeout(toast.timer);
			if (await toast.setCurrentGesture()) {
				toast.show();
			} else if (isHide){
				toast.hide();
			}
		},
		showGestureDelay: () => {
			restartTimer(toast, SHOW_TOAST_DELAY);
		},
		onTimer: () => { toast.showGesture(); },
		setCurrentGesture: async () => {
			const g = getCommandByState(startPoint, fingers, arrows);
			const gh = getCommandByState(startPoint, fingers, [...arrows, 'H']);
			if (!isGestureEnabled && g !== 'disableGesture' && gh !== 'disableGesture') return false;
			const joinedArrows = arrows.join('-');
			let elms = [];
			if (
				SimpleGesture.ini.suggestNext &&
				arrows[SimpleGesture.ini.toastMinStroke - 1]
			) {
				elms = await suggestGestures(SimpleGesture.ini.gestures, g, joinedArrows);
			} else if (g || gh) {
				const list = {};
				list[joinedArrows] = g;
				if (gh) {
					list[joinedArrows + '-H'] = gh;
				}
				elms = await suggestGestures(list, g, joinedArrows);
			}
			if (
				pullToRefresh.isEnabled &&
				SimpleGesture.ini.pullToRefresh === 'text'
			) {
				elms.unshift(pullToRefresh.toast());
			}
			if (!elms[0]) {
				return false;
			}
			toast.setup();
			toast.setText(toast.sub, SimpleGesture.getAddnlText(startPoint, fingers));
			const f = document.createDocumentFragment();
			for (const e of elms) {
				f.appendChild(e);
			}
			toast.main.replaceChildren(f);
			return true;
		},
		setText: (e, t) => {
			e.replaceChildren(document.createTextNode(t));
		},
	};

	const isMatch = (k, fg, sg) => {
		if (k.match(/^[LRTB]:/)) {
			return k.startsWith(sg);
		} else {
			return k.startsWith(fg);
		}
	};

	const suggestGestures = async (list, match, joinedArrows) => {
		const elms = [];
		const fGesture = fingers + joinedArrows;
		const sGesture = startPoint + fGesture;
		for (const [k, v] of Object.entries(list)) {
			if (!isMatch(k, fGesture, sGesture)) continue;
			if (startPoint && list[startPoint + k]) continue;
			const name = await gestureName(v);
			if (!name) continue; // for old ini-data.
			// create element
			const label = document.createElement('DIV');
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
			elms.push(label);
		}
		return elms;
	};

	// uncommon modules ---
	SimpleGesture.mod = (name, fn) => {
		import(browser.runtime.getURL(`/modules/${name}.js`)).then(fn);
	};

	// utils for setup ----
	SimpleGesture.addTouchEventListener = (target, events, opt = true) => {
		if ('ontouchstart' in window /* || navigator.maxTouchPoints -> FF desktop returns 256. */) {
			target.addEventListener('touchstart', events.start, opt);
			target.addEventListener('touchmove', events.move, opt);
			target.addEventListener('touchend', events.end, opt);
			target.addEventListener('touchcancel', events.cancel, opt);
		} else {
			// for test on Desktop
			target.addEventListener('mousedown', events.start, opt);
			target.addEventListener('mousemove', events.move, opt);
			target.addEventListener('mouseup', events.end, opt);
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
		toast.fixPos();
		onTouchMove(e);
	});
	// 'resize' is called too many times, so use 'touchstart' instead of 'resize'.
	// VV.addEventListener('resize', fixSize);
})();

