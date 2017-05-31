(() => {
	'use strict';

	// const
	let MAX_LENGTH = 16;

	// default options
	let defaultIni = {
		'gestures': {
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
	let GESTURE_NAMES; // set up in 'setupOptionsPage()'
	let ini = defaultIni;
	let gesture = null;
	let lx = 0;
	let ly = 0;
	let lg = null;
	let editTarget = null;
	let timeoutId = null;

	let getX = e => e.touches ? e.touches[0].clientX: e.pageX;
	let getY = e => e.touches ? e.touches[0].clientY: e.pageY;

	let resetGesture = function(e) {
		gesture = null;
		timeoutId = null;
	};

	let onTouchStart = function(e) {
		gesture = '';
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		if (!eidtTarget) {
			timeoutId = setTimeout(resetGesture, ini.timeout);
		}
		lx = getX(e);
		ly = getY(e);
		lg = null;
	};

	let onTouchMove = function(e) {
		if (gesture === null) return;
		if (gesture.length > MAX_LENGTH) return;
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
		}
	};

	let scrollBehaviorBackup = null;
	let smoothScroll = function(y) {
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

	let saveIni = function() {
		browser.storage.local.set({ 'simple_gesture': ini });
	};

	let keyOf = (m, v) => { return Object.keys(m).filter(k => { return m[k] === v; })[0]; };

	let updateGesture = function() {
		if (gesture) {
			let newGestures = {};
			for (let gestureName of GESTURE_NAMES) {
				let newKey = gestureName === editTarget ? gesture : keyOf(ini.gestures, gestureName);
				if (newKey) {
					newGestures[newKey] = gestureName;
				}
			}
			ini.gestures = newGestures;
			document.getElementById('udlr_' + editTarget).textContent = gesture;
			saveIni();
		}
		setTimeout(() => {
			document.getElementById('gesture_radio_' + editTarget).checked = false;
			editTarget = null;
		}, 1);
	};

	let executeGesture = function(e) {
		let g = ini.gestures[gesture];
		if (!g) return true;
		switch (g) {
			case 'top': smoothScroll(0); break;
			case 'bottom': smoothScroll(document.body.scrollHeight); break;
			case 'reload': location.reload(); break;
			default: browser.runtime.sendMessage(g, (res) => {});
				break;
		}
		e.stopPropagation();
		e.preventDefault();
		return false;
	};

	let onTouchEnd = function(e) {
		try {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
			if (editTarget) {
				updateGesture();
			} else {
				return executeGesture(e);
			}
		} finally {
			gesture = null;
		}
	};

	let setupOptionsPage = function() {
		let setEditTarget = e => {
			editTarget = e.target.id.replace(/^.+_/, '');
		};
		let template = document.getElementsByClassName('gesture_template')[0];
		GESTURE_NAMES = [];
		for (let i in defaultIni.gestures) {
			GESTURE_NAMES.push(defaultIni.gestures[i]);
		}
		for (let gestureName of GESTURE_NAMES) {
			let container = template.cloneNode(true);
			container.className = "gesture-container";
			let toggleRadio = container.getElementsByClassName('toggle-radio')[0];
			toggleRadio.id = 'gesture_radio_' + gestureName;
			toggleRadio.addEventListener('click', setEditTarget);
			let label = container.getElementsByClassName('udlr')[0];
			label.id = 'udlr_' + gestureName;
			label.textContent = keyOf(ini.gestures, gestureName) || '-';
			let caption = container.getElementsByClassName('gesture-caption')[0];
			caption.textContent = chrome.i18n.getMessage('caption_' + gestureName);
			caption.parentNode.setAttribute('for', toggleRadio.id);
			template.parentNode.insertBefore(container, template);
		}
		// set up <input type="range" ... >
		let onRangeChange = e => {
			ini[e.target.id] = e.target.value;
			saveIni();
		};
		let onRangeInput = e => {
			document.getElementById(e.target.id + 'Value').textContent = e.target.value;
		};
		for (let id of ['timeout', 'strokeSize']) {
			let rangeElm = document.getElementById(id);
			rangeElm.value = ini[id];
			rangeElm.addEventListener('change', onRangeChange);
			rangeElm.addEventListener('input', onRangeInput);
			onRangeInput({ target: rangeElm });
		}
	};

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

