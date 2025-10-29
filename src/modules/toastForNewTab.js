let container = null;
let toast = null;
let mainText = null;
let link = null;
let tabId = null;
let hideTimer = null;
let showTimer = null;
const VV = window.visualViewport || {
	isDummy: true, offsetLeft: 0, offsetTop: 0, scale: 1
};
const vvWidth = () => VV.isDummy ? window.innerWidth : VV.width;
const vvHeight = () => VV.isDummy ? window.innerHeight: VV.height;

const create = () => {
	if (toast) {
		return;
	}
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
	const isDark = !!matchMedia('(prefers-color-scheme: dark)').matches;
	toast = document.createElement('DIV');
	toast.style.cssText = `
		background: ${isDark ? '#cfcfd8' : '#52525e'};
		border-radius: 7px;
		bottom: 0;
		box-shadow: 0 8px 8px #0002;
		box-sizing: border-box;
		color: ${isDark ? '#15141a' : '#fbfbfe'};
		display: inline-flex;
		font-size: 14px;
		font-weight: 450;
		justify-content: space-between;
		left: 0;
		line-height: 19px;
		opacity: 0;
		overflow: hidden;
		padding: 15px 24px;
		position: absolute;
		text-align: left;
		transform-origin: center;
		transition-duration: .2s;
		transition-property: opacity, transform;
	`;
	toast.addEventListener('click', () => {
		container.style.display = 'none';
		browser.runtime.sendMessage(JSON.stringify({ command: 'showTab', tabId: tabId}));
	});
	mainText = document.createElement('SPAN');
	mainText.style.cssText = `
		flex-glow: 1;
	`;
	link = document.createElement('SPAN');
	link.style.cssText = `
		color: ${isDark ? '#592acb' : '#cb9eff'};
		font-weight: 500;
		text-align: right;
	`;
	toast.appendChild(mainText);
	toast.appendChild(link);
	container.attachShadow({ mode: 'open' }).appendChild(toast)
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
	clearTimeout(hideTimer);
	clearTimeout(showTimer);
	hide();
	container.style.display = 'block';
	showTimer = setTimeout(() => {
		fixPosition();
		container.style.pointerEvents = 'auto';
		toast.style.opacity = '1';
		toast.style.transform = calcScale(1);
	}, 200);
	hideTimer = setTimeout(() => {
		hide();
		hideTimer = setTimeout(() => {
			container.style.display = 'none';
		}, 200)
	}, 2500);
}

const fixPosition = () => {
	container.style.top = `${VV.offsetTop}px`;
	container.style.left = `${VV.offsetLeft}px`
	container.style.height = `${vvHeight() - 50 / VV.scale}px`;
	const w = vvWidth() * VV.scale * 0.9;
	toast.style.left = `${(vvWidth() - w) / 2}px`;
	toast.style.width = `${w}px`;
}

const hide = () => {
	container.style.pointerEvents = 'none';
	toast.style.opacity = '0';
	toast.style.transform = calcScale(0.8);
}

const calcScale = (s) => {
	return `scale(${s / VV.scale})`;
}

