let ptrIcon = null;

export const show = () => {
	if (!ptrIcon) {
		ptrIcon = document.createElement('DIV');
		ptrIcon.style.cssText = `
			background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%2352525e" d="M0 0 24 0 24 24 0 24z"/><path stroke="%23fbfbfe" fill="none" stroke-linecap="round" d="M15 14.5a4 4 0 1 1 1-2m-1.5-1l1.5 1.5 1.5-1.5"/></svg>');
			background-size: 3rem 3rem;
			border-radius: 50%;
			box-shadow: 0 0 .3rem #0003;
			color: #fbfbfe;
			display: inline-block;
			height: 3rem;
			left: 50%;
			line-height: 2.6rem;
			font-size: 2rem;
			margin-left: -1.5rem;
			position: fixed;
			text-align: center;
			top: -3.5rem;
			transition: .3s;
			transform: rotateZ(-90deg);
			overflow: hidden;
			width: 3rem;
			z-index: 2147483647;
		`;
		document.body.appendChild(ptrIcon);
		setTimeout(show, 1);
	} else {
		requestAnimationFrame(() => {
			ptrIcon.style.top = '2rem';
			ptrIcon.style.transform = 'rotateZ(0)';
		}, 1);
	}
}

export const hide = () => {
	if (ptrIcon) {
		ptrIcon.style.top = '-3.5em';
		ptrIcon.style.transform = 'rotateZ(-90deg)';
	}
}

