'use strict';

// const -------------
const TIMERS = {};
const NOP = () => {};
const ASYNC_NOP = async () => {};
const dlgs = {};
const comp = {};

// fields ------------
const settings = {
  storageKey: '',
  getIni: () => ({}),
  insteadOfEmpty: {},
  onInitialize: ASYNC_NOP,
  onSavePre: ASYNC_NOP,
  onSaveComplete: ASYNC_NOP,
}
let initialized = false;
let openedDlg;

// utils -------------
const byId = id => document.getElementById(id);

const byClass = (elm, clazz) => elm.getElementsByClassName(clazz)[0];

const allByClass = (elm, clazz) => !clazz ? document.getElementsByClassName(elm) : elm.getElementsByClassName(clazz);

const parentByClass = (elm, clazz) => {
  for (let e = elm; e?.classList; e = e.parentNode) {
    if (e.classList.contains(clazz)) return e;
  }
};

const toggleClass = (b, clazz, ...elms) => {
  for (const elm of elms) {
    b ? elm.classList.add(clazz) : elm.classList.remove(clazz);
  }
};

const editStart = (...elms) => {
  for (const elm of elms) {
    elm.classList.add('editing');
    elm.removeAttribute('data-editEnd');
  }
};

const editEnd = (...elms) => {
  for (const elm of elms) {
    elm.setAttribute('data-editEnd', 1);
  }
  setTimeout(() => {
    for (const elm of elms) {
      if (elm.getAttribute('data-editEnd')) {
        elm.classList.remove('editing');
        elm.removeAttribute('data-editEnd');
      }
    }
  }, 1000);
};

const resetTimer = (name, f, msec) => {
  clearTimeout(TIMERS[name]);
  TIMERS[name] = setTimeout(f, msec);
};

const storageValue = async name => {
  try {
    const v = await browser.storage.local.get(name);
    return v ? v[name] : null;
  } catch (e) {
    console.log(e);
    return null;
  }
};

const getMessage = (s) => {
  if (!s) return s;
  const key = s.replace(/[^0-9a-zA-Z_]/g, '_');
  return browser.i18n.getMessage(key) || s;
};

const dataTargetId = e => e.target.getAttribute('data-targetId');

const ifById = id => (typeof id === 'string') ? byId(id): id;
const fadeout = elm => { ifById(elm).classList.add('transparent'); };
const fadein = elm => { ifById(elm).classList.remove('transparent'); };

// DOM objects --------------
const $templates = byId('templates');
const $bidingForms = allByClass('js-binding');

// Dialog -------------
// control Back button
const changeState = state => {
  if (!state.dlg) return;
  history.pushState(state, document.title);
  onPopState({ state: state });
};
const onPopState = e => {
  const state = e.state || history.state || { y: 0 };
  if (openedDlg && !state.dlg) {
    dlgs[openedDlg.id].onHide();
    fadeout(openedDlg);
    openedDlg = null;
    // enable touch scroll.
    document.body.style.overflow = null;
  } else if (state.dlg) {
    dlgs[state.dlg].onShow(state.targetId);
    openedDlg = byId(state.dlg);
    fadein(openedDlg);
    // prevent touch scroll.
    if (window.innerWidth === document.body.clientWidth) { // prevent blink scroll bar.
      document.body.style.overflow = 'hidden';
    }
  }
};
window.addEventListener('popstate', onPopState);

// Color dialog -------------
dlgs.colorDlg = {
  targetId: null,
  rgb: null,
  hex(d) {
    return Number(d).toString(16).padStart(2, '0');
  },
  setRGB(rgb) {
    dlgs.colorDlg.rgb = rgb;
    byId('sliderA').style.background =
      `linear-gradient(to right, transparent, ${rgb})`;
    for (const c of allByClass(byId('colorDlg'), 'color-tile')) {
      toggleClass(
        c.getAttribute('data-c') === rgb,
        'color-tile-selected',
        c
      );
    }
  },
  getPreview(i) {
    return byClass(i.parentNode, 'color-preview');
  },
  onShow(id) {
    dlgs.colorDlg.targetId = id;
    const elm = byId(id);
    const a = byId('sliderA');
    a.style.color = elm.value;
    requestAnimationFrame(() => {
      const rgba = getComputedStyle(a).color.match(/[0-9.]+/g);
      a.value = rgba.length === 4 ? Math.round(Number(rgba[3]) * 255) : 255;
      const hex = dlgs.colorDlg.hex;
      const hexRGB = `#${hex(rgba[0])}${hex(rgba[1])}${hex(rgba[2])}`;
      dlgs.colorDlg.setRGB(hexRGB);
    });
  },
  onHide: NOP,
  onSubmit() {
    const a = Number(byId('sliderA').value) || 0;
    const t = byId(dlgs.colorDlg.targetId);
    t.value = dlgs.colorDlg.rgb + (a !== 255 ? dlgs.colorDlg.hex(a) : '');
    dlgs.colorDlg.onInputText({ target: t });
  },
  onInputText(e) {
    const id = e.target.id;
    resetTimer(`onchangecolortext_${id}`, () => {
      const value = e.target.value || settings.insteadOfEmpty[id];
      dlgs.colorDlg.getPreview(e.target).style.backgroundColor = value;
      saveBindingValues();
    }, initialized ? 250 : 0);
  },
  onClickPreview(e) {
    changeState({dlg: 'colorDlg', targetId: dataTargetId(e)});
  },
  init() {
    // pallet
    const f = document.createDocumentFragment();
    for (const c of [
      '#a4c639', // android green
      '#3fe1b0', // green
      '#00b3f4', // blue
      '#9059ff', // violet
      '#ff6bba', // pink
      '#e22850', // red
      '#ff8a50', // orange
      '#ffd567', // yellow
      '#f9f9fa', // white
      '#52525e', // dark theme face
      '#23222b', // black
    ]) {
      const t = document.createElement('div');
      t.className = 'color-tile';
      t.style.background = c;
      t.setAttribute('data-c', c);
      // only white, gray and black have border.
      if (c === '#f9f9fa' || c === '#52525e' || c === '#23222b') {
        t.className += ' color-tile-with-border'
      }
      f.appendChild(t);
    }
    const p = byId('pallet');
    p.appendChild(f);
    p.addEventListener('click', e => {
      if (!e.target.classList.contains('color-tile')) return;
      const v = e.target.getAttribute('data-c');
      dlgs.colorDlg.setRGB(v);
    });
    // preview and text
    for (const elm of allByClass('color-text-input')) {
      elm.setAttribute('placeholder', settings.insteadOfEmpty[elm.id]);
      dlgs.colorDlg.onInputText({ target: elm });
      elm.addEventListener('input', dlgs.colorDlg.onInputText);
      dlgs.colorDlg.getPreview(elm).addEventListener('click', dlgs.colorDlg.onClickPreview);
    }
  },
};

// Deny list ----------------
dlgs.denylistDlg = {
  template: byClass(document, 'denylist-item'),
  newItem() {
    return dlgs.denylistDlg.template.cloneNode(true);
  },
  onShow() {
    const denylist = byId('denylist');
    const newList = denylist.cloneNode(false);
    for (const urlPattern of settings.getIni().denylist ?? []) {
      const item = dlgs.denylistDlg.newItem();
      byClass(item, 'denylist-input').value = urlPattern.url;
      newList.appendChild(item);
    }
    const newItem = dlgs.denylistDlg.newItem();
    newList.appendChild(newItem);
    denylist.parentNode.replaceChild(newList, denylist);
  },
  onHide: NOP,
  onSubmit() {
    const list = [];
    for (const input of allByClass('denylist-input')) {
      if (!input.value) continue;
      list.push({url: input.value});
    }
    settings.getIni().denylist = list;
    saveIni();
    dlgs.denylistDlg.updateSummary();
  },
  updateSummary() {
    const sum = byId('denylistSummary');
    if (!sum) return;
    let count = 0;
    const urls = [];
    for (const item of (settings.getIni().denylist || [])) {
      urls.push(item.url);
      if (5 < ++count) {
        urls.push('...');
        break;
      }
    }
    sum.textContent = count ? urls.join(', ') : getMessage('None');
  },
  init() {
    addEventListener('input', e => {
      if (!e.target.classList.contains('denylist-input')) return;
      if (e.target.parentNode.nextSibling) return;
      byId('denylist').appendChild(dlgs.denylistDlg.newItem());
    });
    addEventListener('click', e => {
      if (!e.target.classList.contains('delete-denylist')) return;
      const denylistItem = parentByClass(e.target, 'denylist-item');
      byClass(denylistItem, 'denylist-input').value = '';
      if (!denylistItem.nextSibling) return;
      denylistItem.remove();
    });
    byId('denylistEdit')?.addEventListener('click', () => { changeState({dlg: 'denylistDlg'}); });
    dlgs.denylistDlg.updateSummary();
  },
};

// Import / Export ----------
comp.importExport = {
  init() {
    byId('importSetting')?.addEventListener('change', comp.importExport.onFileSelect);
    byId('exportSetting')?.addEventListener('click', comp.importExport.export);
  },
  async import(json) {
    try {
      const obj = JSON.parse(json);
      Object.assign(settings.getIni(), obj.ini);
      await saveIni();
      location.reload();
    } catch (e) {
      alert(e.message);
    }
  },
  async export() {
    const data = { ini: settings.getIni() };
    const href = 'data:application/octet-stream,' + encodeURIComponent(JSON.stringify(data));
    const link = byId('exportSettingLink');
    link.setAttribute('href', href);
    link.click();
  },
  onFileSelect(e) {
    try {
      if (!e.target.files[0]) return;
      const reader = new FileReader();
      reader.onload = () => { comp.importExport.import(reader.result); };
      reader.readAsText(e.target.files[0]);
    } catch (error) {
      alert(error.message);
    }
  },
};

// Others ------------------
comp.common = {
  init() {
    comp.common.setupContents();
    comp.common.setupEventListeners();
  },
  setupContents() {
    for (const caption of allByClass('i18n')) {
      caption.textContent = getMessage(caption.textContent);
    }
    const ini = settings.getIni();
    for (const elm of $bidingForms) {
      if (elm.type === 'checkbox') {
        elm.checked = !!ini[elm.id];
        elm.addEventListener('change', comp.common.onChecked);
      } else if (elm.type === 'radio') {
        elm.checked = ini[elm.name] === elm.value;
      } else {
        elm.value = ini[elm.id] || settings.insteadOfEmpty[elm.id] || (
          elm.type === 'number' ? 0 : ''
        );
      }
    }
  },
  setupEventListeners() {
    for (const elm of $bidingForms) {
      elm.addEventListener('change', saveBindingValues);
      elm.addEventListener('input', saveBindingValuesDelay);
    }

    // common events
    addEventListener('click', e => {
      if (!e?.target.classList) return;
      if (
        e.target.classList.contains('js-history-back') ||
        e.target.classList.contains('dlg')
      ) {
        history.back();
        return;
      }
      if (e.target.classList.contains('js-submit')) {
        const f = dlgs[openedDlg.id].onSubmit;
        f && f();
        history.back();
      }
    });
  },
  removeCover() {
    const cover = byId('cover');
    if (!cover) return;
    setTimeout(() => { fadeout(cover); });
    setTimeout(() => { cover.remove(); }, 500);
    setTimeout(() => {
      document.body.classList.add('initialized');
      initialized = true;
    }, 500);
  },
  onChecked() {
    for (const elm of allByClass(`js-linked-${e.target.id}`)) {
      toggleClass(!e.target.checked, 'disabled', elm);
    }
  },
};

// Save ---------------------
const saveBindingValues = async () => {
  clearTimeout(TIMERS.saveBindingValues);
  for (const elm of $bidingForms) {
    const ini = settings.getIni()
    const t = elm.getAttribute('data-type') || elm.type;
    if (t === 'checkbox') {
      ini[elm.id] = elm.checked;
    } else if (t === 'radio') {
      if (elm.checked) {
        ini[elm.name] = elm.value;
      }
    } else if (elm.value === settings.insteadOfEmpty[elm.id]) {
      ini[elm.id] = null;
    } else if (t === 'number') {
      if (elm.value.match(/^\d+$/)) {
        ini[elm.id] = Number(elm.value);
      }
    } else {
      ini[elm.id] = elm.value;
    }
  }
  await saveIni();
};
const saveIni = async () => {
  await settings.onSavePre();
  const data = {};
  data[settings.storageKey] = settings.getIni();
  await browser.storage.local.set(data);
  await settings.onSaveComplete();
};
const saveBindingValuesDelay = () => {
  resetTimer('saveBindingValues', saveBindingValues, 3000);
};

const initialize = async (mySettings) => {
  Object.assign(settings, mySettings);
  const savedData = await storageValue(settings.storageKey);
  if (savedData) {
    Object.assign(settings.getIni(), savedData)
  }
  document.documentElement.lang = await browser.i18n.getUILanguage();
  for (const d of Object.values(dlgs)) {
    d.init && d.init();
  }
  for (const c of Object.values(comp)) {
    c.init && c.init();
  }
  await settings.onInitialize();
  onPopState(history);
  comp.common.removeCover();
};

