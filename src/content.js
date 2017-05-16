(() => {
	'use strict';

	// default options
	let ini = {
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
		timeoutId = setTimeout(resetGesture, ini.timeout);
		lx = getX(e);
		ly = getY(e);
		lg = null;
	};

	let onTouchMove = function(e) {
		if (gesture === null) return;
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

	let updateGesture = function() {
		if (!gesture) return;
		let newGestures = {};
		for (let key in ini.gestures) {
			let value = ini.gestures[key];
			let newKey = value == editTarget ? gesture : key;
			newGestures[newKey] = value;
		}
		ini.gestures = newGestures;
		document.getElementById('gesture_label_' + editTarget).textContent = gesture;
		document.getElementById('gesture_radio_' + editTarget).checked = false;
		editTarget = null;
		saveIni();
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
		for (let key in ini.gestures) {
			let g = ini.gestures[key];
			let container = template.cloneNode(true);
			container.className = "gesture-container";
			let toggleRadio = container.getElementsByClassName('toggle-radio')[0];
			toggleRadio.id = 'gesture_radio_' + g;
			toggleRadio.addEventListener('click', setEditTarget);
			let label = container.getElementsByClassName('gesture-label')[0];
			label.id = 'gesture_label_' + g;
			label.textContent = key;
			let caption = container.getElementsByClassName('gesture-caption')[0];
			caption.textContent = chrome.i18n.getMessage('caption_' + g);
			caption.parentNode.setAttribute('for', toggleRadio.id);
			template.parentNode.insertBefore(container, template);
		}
		let timeout = document.getElementById('timeout');
		timeout.value = ini.timeout;
		timeout.addEventListener('change', e => {
			ini.timeout = timeout.value | 1500;
			saveIni();
		});
		let strokeSize = document.getElementById('stroke_size');
		strokeSize.value = ini.strokeSize;
		timeout.addEventListener('change', e => {
			ini.strokeSize.timeout = strokeSize.value | 32;
			saveIni();
		});
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

