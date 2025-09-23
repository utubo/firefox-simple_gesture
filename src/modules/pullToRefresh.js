let icon = null;

const fixSize = (t, r) => {
	const vv = visualViewport;
	icon.style.transform = `
		translate(
			${vv.width / 2 + vv.offsetLeft}px,
			${t / vv.scale}em
		)
		rotateZ(${r}deg)
		scale(${1 / vv.scale})
	`;
}

export const show = () => {
	if (!icon) {
		icon = document.createElement('DIV');
		icon.style.cssText = `
			background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%2352525e" d="M0 0 24 0 24 24 0 24z"/><path stroke="%23fbfbfe" fill="none" stroke-linecap="round" d="M15 14.5a4 4 0 1 1 1-2m-1.5-1l1.5 1.5 1.5-1.5"/></svg>');
			background-size: 3rem 3rem;
			border-radius: 50%;
			box-shadow: 0 0 .3rem #0003;
			color: #fbfbfe;
			display: inline-block;
			height: 3rem;
			left: 0;
			line-height: 2.6rem;
			font-size: 2rem;
			margin-left: -1.5rem;
			position: fixed;
			text-align: center;
			top: 0;
			transition: .3s;
			overflow: hidden;
			width: 3rem;
			z-index: 2147483647;
		`;
		hide();
		document.body.appendChild(icon);
		icon.offsetHeight; // reflow for transition.
	}
	fixSize(1, 0);
}

export const hide = () => {
	if (icon) {
		fixSize(-3.5, -90);
	}
}

