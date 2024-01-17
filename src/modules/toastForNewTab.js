let toastForNewTab = null;
let toastForNewTabTabId = null;
let position = '';
const VV = window.visualViewport || { offsetLeft: 0, offsetTop: 0, scale: 1 };
const vvWidth = () => VV.isDummy ? window.innerWidth : VV.width;
const vvHeight = () => VV.isDummy ? window.innerHeight : VV.height;

export const show = (tabId, pos) => {
	toastForNewTabTabId = tabId;
	position = pos;
	if (!toastForNewTab) {
		toastForNewTab = document.createElement('DIV');
		toastForNewTab.style.cssText = `
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
			toastForNewTab.style.display = 'none';
			browser.runtime.sendMessage(JSON.stringify({ command: 'showTab', tabId: toastForNewTabTabId }));
		});
		toastForNewTab.attachShadow({ mode: 'open' }).appendChild(content);
		document.body.appendChild(toastForNewTab);
	}
	hideToastForNewTab();
	toastForNewTab.style.display = 'block';
	setTimeout(() => {
		toastForNewTab.style.left = `${VV.offsetLeft}px`;
		toastForNewTab.style.opacity = '1';
		toastForNewTab.style.pointerEvents = 'auto';
		toastForNewTab.style.top = `${calcTop(116)}px`;
		toastForNewTab.style.transform = `scale(${1 / VV.scale}) translateZ(0)`;
		toastForNewTab.style.width = `${vvWidth() * VV.scale }px`;
	}, 200);
	setTimeout(hideToastForNewTab, 2500);
}

const hideToastForNewTab = () => {
	toastForNewTab.style.opacity = '0';
	toastForNewTab.style.pointerEvents = 'none';
	toastForNewTab.style.top = `${calcTop(50)}px`;
}

const calcTop = (margin) => {
	const m = margin / VV.scale;
	return position === 'top' ? m : vvHeight() + VV.offsetTop - m;
}

