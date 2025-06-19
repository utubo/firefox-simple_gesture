let dlg = null;
let msg = null;
let yesBtn = null;
let noBtn = null;

const createConfirmDlg = () => {
	dlg = document.createElement('DIV');
	dlg.className = 'simplegesture-dlg';
	const container = document.createElement('DIV');
	container.className = 'simplegesture-dlg-container';
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
	container.appendChild(msg);
	container.appendChild(buttons);
	dlg.appendChild(container);
	document.body.appendChild(dlg);
}

export const confirm = (text, yes = 'OK', no = 'Cancel') => {
	if (!dlg) createConfirmDlg();
	msg.textContent = text;
	yesBtn.textContent = yes;
	noBtn.textContent = no;
	dlg.style.opacity = 0;
	dlg.style.display = 'flex';
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
	});
}

const close = () => {
	dlg.style.opacity = 0;
	setTimeout(() => { dlg.style.display = 'none'; }, 500);
}

