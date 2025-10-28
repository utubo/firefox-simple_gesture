let container = null;
let toast = null;
let mainText = null;
let link = null;
let tabId = null;
let hideTimer = null;
const VV = window.visualViewport || {
	isDummy: true, offsetLeft: 0, offsetTop: 0, scale: 1
};
const vvWidth = () => VV.isDummy ? window.innerWidth : VV.width;
const vvHeight = () => VV.isDummy ? window.innerHeight: VV.height;

const create = () => {
	if (toast) {
		return;
	}
	toast = document.createElement('DIV');
	toast.style.cssText = `
		all: initial;
		bottom: 0;
		display: inline-block;
		left: 0;
		opacity: 0;
		position: absolute;
		transition-duration: .2s;
		transform-origin: center;
		transition-property: opacity, transform;
	`;
	const content = document.createElement('DIV');
	const isDark = !!matchMedia('(prefers-color-scheme: dark)').matches;
	content.style.cssText = `
		background: ${isDark ? '#cfcfd8' : '#52525e'};
		border-radius: 7px;
		box-shadow: 0 8px 8px #0002;
		color: ${isDark ? '#15141a' : '#fbfbfe'};
		display: flex;
		font-size: 14px;
		font-weight: 450;
		justify-content: space-between;
		line-height: 19px;
		overflow: hidden;
		padding: 15px 24px;
		text-align: left;
	`;
	content.addEventListener('click', () => {
		toast.style.display = 'none';
		browser.runtime.sendMessage(JSON.stringify({ command: 'showTab', tabId: tabId}));
	});
	mainText = document.createElement('SPAN');
	content.appendChild(mainText);
	link = document.createElement('SPAN');
	link.style.cssText = `
		color: ${isDark ? '#592acb' : '#cb9eff'};
		font-weight: 500;
		text-align: right;
	`;
	content.appendChild(link);
	toast.attachShadow({ mode: 'open' }).appendChild(content);
	container = document.createElement('DIV');
	container.style.cssText = `
		all: initial;
		box-sizing: border-box;
		felx-flow: column;
		justify-content: left;
		left: 0;
		position: fixed;
		top: 0;
		width: 100%;
		z-index: 2147483647;
	`;
	container.appendChild(toast)
	document.body.appendChild(container);
}

export const show = (
	_tabId,
	pos,
	msgId = 'New_tab_opened',
	linkMsgId = 'Switch'
) => {
	tabId = _tabId;
	const text = browser.i18n.getMessage(msgId);
	if (pos === 'top') {
		SimpleGesture.showTextToast(text);
		return;
	}
	create();
	mainText.textContent = text;
	link.textContent = browser.i18n.getMessage(linkMsgId);
	hide();
	toast.style.display = 'block'; // re flow layout
	setTimeout(() => {
		fixPosition();
		toast.style.opacity = '1';
		toast.style.pointerEvents = 'auto';
		toast.style.transform = calcScale(1);
		container.style.pointerEvents = 'auto';
	}, 200);
	clearTimeout(hideTimer);
	hideTimer = setTimeout(hide, 2500);
}

const fixPosition = () => {
	container.style.top = `${VV.offsetTop}px`;
	container.style.left = `${VV.offsetLeft}px`
	container.style.height = `${vvHeight() - 50 / VV.scale}px`;
	const w = vvWidth() * VV.scale - 48;
	toast.style.left = `${(vvWidth() - w) / 2}px`;
	toast.style.width = `${w}px`;
}

const hide = () => {
	container.style.pointerEvents = 'none';
	toast.style.opacity = '0';
	toast.style.pointerEvents = 'none';
	toast.style.transform = calcScale(0.8);
}

const calcScale = (s) => {
	return `scale(${s / VV.scale})`;
}

