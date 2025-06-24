'use strict';

let dlg = null;
let msg = null;
let yesBtn = null;
let noBtn = null;
let overflow = '';

const createConfirmDlg = () => {
	dlg = document.createElement('DIALOG');
	dlg.className = 'simplegesture-dlg';
	msg = document.createElement('DIV');
	msg.className = 'simplegesture-dlg-msg';
	const buttons = document.createElement('DIV');
	buttons.className = 'simplegesture-dlg-buttons';
	yesBtn = document.createElement('DIV');
	yesBtn.className = 'simplegesture-dlg-button';
	noBtn = document.createElement('DIV');
	noBtn.className = 'simplegesture-dlg-button';
	buttons.appendChild(noBtn);
	buttons.appendChild(yesBtn);
	dlg.appendChild(msg);
	dlg.appendChild(buttons);
	document.body.appendChild(dlg);
}

const fixSize = () => {
	if (!visualViewport) return;
	const vv = visualViewport;
	dlg.style.transform = `translate(${vv.offsetLeft}px, ${vv.offsetTop}px) scale(1 / ${vv.scale}`;
	dlg.style.maxWidth = `${vv.width / vv.scale}px`;
}

export const confirm = (text, yes = 'OK', no = 'Cancel') => {
	if (!dlg) createConfirmDlg();
	msg.textContent = text;
	yesBtn.textContent = yes;
	noBtn.textContent = no;
	fixSize();
	overflow = document.documentElement.style.overflow;
	document.documentElement.style.overflow = 'hidden';
	setTimeout(() => { dlg.style.opacity = 1; }, 0);
	return new Promise(resolve => {
		yesBtn.onclick = () => {
			close();
			resolve(true);
		};
		noBtn.onclick = () => {
			close();
			resolve(false);
		};
		dlg.onclick = () => {
			close();
			resolve(false);
		}
		dlg.showModal();
	});
}

const close = () => {
	document.documentElement.style.overflow = overflow;
	dlg.close();
}

