let toast = null;
let tabId = null;
const VV = window.visualViewport || { offsetLeft: 0, offsetTop: 0, scale: 1 };
const vvWidth = () => VV.isDummy ? window.innerWidth : VV.width;
const vvHeight = () => VV.isDummy ? window.innerHeight : VV.height;

export const show = (_tabId, pos) => {
	tabId = _tabId;
	if (pos === 'top') {
		SimpleGesture.showTextToast(browser.i18n.getMessage('New tab opened'));
		return;
	}
	if (!toast) {
		toast = document.createElement('DIV');
		toast.style.cssText = `
			position: fixed;
			transform: translateZ(0);
			transform-origin: top left;
			transition-duration: .2s;
			transition-property: opacity, top;
			z-index: 2147483647;
		`;
		const content = document.createElement('DIV');
		content.style.cssText = `
			background: ${matchMedia('(prefers-color-scheme: dark)').matches ? '#7542e5' : '#312a64'};
			border-radius: 9px;
			box-shadow: 0 4px 4px #0002;
			color: #fff;
			font-size: 19px;
			line-height: 1;
			margin: 0 24px;
			overflow: hidden;
			padding: 15px 24px;
			text-align: left;
		`;
		content.textContent = browser.i18n.getMessage('New tab opened');
		content.addEventListener('click', () => {
			toast.style.display = 'none';
			browser.runtime.sendMessage(JSON.stringify({ command: 'showTab', tabId: tabId}));
		});
		toast.attachShadow({ mode: 'open' }).appendChild(content);
		document.body.appendChild(toast);
	}
	hide();
	toast.style.display = 'block';
	setTimeout(() => {
		toast.style.left = `${VV.offsetLeft}px`;
		toast.style.opacity = '1';
		toast.style.pointerEvents = 'auto';
		toast.style.top = `${calcTop(116)}px`;
		toast.style.transform = `scale(${1 / VV.scale}) translateZ(0)`;
		toast.style.width = `${vvWidth() * VV.scale }px`;
	}, 200);
	setTimeout(hide, 2500);
}

const hide = () => {
	toast.style.opacity = '0';
	toast.style.pointerEvents = 'none';
	toast.style.top = `${calcTop(50)}px`;
}

const calcTop = (margin) => {
	const m = margin / VV.scale;
	return vvHeight() + VV.offsetTop - m;
}

