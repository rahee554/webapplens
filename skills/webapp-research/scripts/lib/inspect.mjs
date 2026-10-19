// In-page inspector: returns a JSON inventory of navigation, controls, forms, tables and tech hints.
// Runs inside the page via page.evaluate, so it must be self-contained.
export function inPageInspect() {
  const SECRETISH = /(pass|secret|token|api.?key|ssn|card|cvv|cvc|iban)/i;
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const nameOf = (el) => {
    const lb = el.getAttribute('aria-labelledby');
    return clean(
      el.getAttribute('aria-label') ||
        (lb && lb.split(' ').map((i) => document.getElementById(i)?.innerText || '').join(' ')) ||
        el.innerText || el.value || el.title || el.getAttribute('alt') || '',
    );
  };
  // Label text without the controls nested inside it (a <select> inside a <label> would add its options).
  const ownText = (label) => {
    const c = label.cloneNode(true);
    c.querySelectorAll('input,select,textarea,button,option,script,style').forEach((n) => n.remove());
    return c.textContent;
  };
  const labelOf = (el) => {
    let t = el.labels && el.labels.length ? ownText(el.labels[0]) : '';
    if (!t) t = el.getAttribute('aria-label') || '';
    if (!t && el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); t = l ? ownText(l) : ''; }
    if (!t) { const l = el.closest('label'); t = l ? ownText(l) : ''; }
    return clean(t || el.placeholder || el.name || el.id || '');
  };
  const inNav = (el) => !!el.closest('nav,aside,[role=navigation],[role=menu],[role=menubar]');
  const implicitRole = (el) => {
    const r = el.getAttribute('role');
    if (r) return r;
    const t = el.tagName.toLowerCase();
    if (t === 'summary') return 'button';
    if (t === 'input') return 'button';
    return t === 'a' ? 'link' : 'button';
  };

  const fieldEls = (root) =>
    Array.from(root.querySelectorAll('input,select,textarea')).filter(
      (f) => !(f.tagName === 'INPUT' && ['hidden', 'submit', 'button', 'reset', 'image'].includes(f.type)),
    );

  const fieldSpec = (f) => {
    const label = labelOf(f);
    const secretish = f.type === 'password' || SECRETISH.test(`${f.name} ${label}`);
    const type = f.tagName === 'SELECT' ? (f.multiple ? 'select-multiple' : 'select') : f.tagName === 'TEXTAREA' ? 'textarea' : f.type || 'text';
    let def = null;
    if (!secretish && type !== 'file') def = type === 'checkbox' || type === 'radio' ? f.checked : clean(f.value);
    const spec = {
      label,
      name: f.name || f.id || '',
      type,
      required: !!f.required || f.getAttribute('aria-required') === 'true',
      placeholder: f.placeholder || '',
      default: def === '' ? null : def,
      disabled: !!f.disabled,
      readonly: !!f.readOnly,
      visible: isVisible(f),
    };
    if (f.tagName === 'SELECT') spec.options = Array.from(f.options).slice(0, 40).map((o) => clean(o.text));
    for (const a of ['minlength', 'maxlength', 'min', 'max', 'pattern', 'step', 'accept', 'autocomplete']) {
      const v = f.getAttribute(a);
      if (v) spec[a] = v;
    }
    if (f.willValidate && !f.checkValidity()) spec.invalid_now = f.validationMessage;
    return spec;
  };

  // Group radios by name so a radio set is one field.
  const specs = (root) => {
    const out = [];
    const radios = new Map();
    for (const f of fieldEls(root)) {
      const s = fieldSpec(f);
      if (f.type === 'radio' && f.name) {
        const g = radios.get(f.name) || { ...s, label: clean(f.closest('fieldset')?.querySelector('legend')?.innerText) || s.name, type: 'radio', options: [], default: null };
        g.options.push(labelOf(f) || f.value);
        if (f.checked) g.default = labelOf(f) || f.value;
        if (!radios.has(f.name)) { radios.set(f.name, g); out.push(g); }
      } else out.push(s);
    }
    return out;
  };

  const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 1500).map((a) => ({
    href: a.href, text: nameOf(a), nav: inNav(a), visible: isVisible(a), download: a.hasAttribute('download'),
  }));

  const controls = Array.from(
    document.querySelectorAll('button,[role=button],input[type=button],input[type=submit],input[type=reset],[role=tab],[role=menuitem],summary,[aria-haspopup],[role=switch]'),
  ).slice(0, 400).map((el) => ({
    label: nameOf(el),
    role: implicitRole(el),
    // A <button> defaults to type=submit even outside a form; only a form-owned button can submit.
    type: el.tagName === 'BUTTON' || el.tagName === 'INPUT' ? (el.form ? el.type : el.getAttribute('type')) : null,
    disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
    in_form: !!el.closest('form'),
    form_method: el.form ? (el.form.getAttribute('method') || 'get').toUpperCase() : null,
    in_dialog: !!el.closest('[role=dialog],[role=alertdialog],dialog'),
    nav: inNav(el),
    expanded: el.getAttribute('aria-expanded'),
    selected: el.getAttribute('aria-selected') ?? el.getAttribute('aria-pressed'),
    haspopup: el.getAttribute('aria-haspopup'),
    visible: isVisible(el),
  }));

  const forms = Array.from(document.forms).slice(0, 40).map((f) => ({
    // getAttribute, not f.name / f.action: a field named "name" or "action" shadows those properties (DOM clobbering).
    label: clean(f.getAttribute('aria-label') || f.querySelector('legend,h1,h2,h3,h4')?.innerText || f.closest('[role=dialog],dialog')?.getAttribute('aria-label') || f.getAttribute('name') || f.getAttribute('id')),
    action: new URL(f.getAttribute('action') || '', location.href).href,
    method: (f.getAttribute('method') || 'get').toUpperCase(),
    in_dialog: !!f.closest('[role=dialog],[role=alertdialog],dialog'),
    visible: isVisible(f),
    fields: specs(f),
    submit: Array.from(f.querySelectorAll('button,input[type=submit]')).filter((b) => !b.type || b.type === 'submit').map(nameOf),
  }));

  const loose = specs(document.body).filter((s) => !forms.some((f) => f.fields.some((x) => x.name === s.name && x.label === s.label)));

  const tables = Array.from(document.querySelectorAll('table')).slice(0, 15).map((t) => {
    const first = t.querySelector('tbody tr');
    return {
      caption: clean(t.querySelector('caption')?.innerText),
      headers: Array.from(t.querySelectorAll('th')).map((h) => clean(h.innerText)).filter(Boolean),
      rows: t.querySelectorAll('tbody tr').length || Math.max(0, t.querySelectorAll('tr').length - 1),
      sortable: !!t.querySelector('th[aria-sort], th button, th a'),
      row_actions: first ? Array.from(first.querySelectorAll('button,a')).map(nameOf).filter(Boolean) : [],
    };
  });

  const nextLinks = links.filter((l) => /^(next|›|»|>)$/i.test(l.text) || /next/i.test(l.text));
  const pagination = {
    present: !!document.querySelector('[aria-label*=pagination i],.pagination,[rel=next]') || nextLinks.length > 0,
    next: nextLinks.map((l) => l.href).slice(0, 3),
  };

  const dialogs = Array.from(document.querySelectorAll('[role=dialog],[role=alertdialog],dialog[open]'))
    .filter(isVisible)
    .map((d) => ({ label: clean(d.getAttribute('aria-label') || d.querySelector('h1,h2,h3,h4')?.innerText), fields: fieldEls(d).length }));

  const lists = Array.from(document.querySelectorAll('main ul, main ol, [role=main] ul, [role=main] ol, body > ul, body > ol'))
    .filter((l) => !l.closest('nav,aside,[role=navigation],[role=tablist]') && isVisible(l)).slice(0, 10)
    .map((l) => ({ items: l.querySelectorAll(':scope > li').length, sample: Array.from(l.querySelectorAll(':scope > li')).slice(0, 5).map((li) => clean(li.innerText)) }))
    .filter((l) => l.items > 0);

  const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
  const hosts = [...new Set(scripts.map((s) => { try { return new URL(s).host; } catch { return null; } }).filter(Boolean))].slice(0, 15);
  const tech = {
    meta_generator: document.querySelector('meta[name=generator]')?.content || null,
    ng_version: document.querySelector('[ng-version]')?.getAttribute('ng-version') || null,
    next_data: !!document.getElementById('__NEXT_DATA__'),
    nuxt: !!window.__NUXT__,
    react_root: !!document.querySelector('[data-reactroot]') || !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers?.size,
    vue: !!window.__VUE__ || !!document.querySelector('[data-v-app]'),
    script_hosts: hosts,
  };

  // quick accessibility counts (heuristics for the improvement suggester)
  const labelled = (f) => (f.labels && f.labels.length) || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title');
  const ids = {}; document.querySelectorAll('[id]').forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
  const a11y = {
    images_no_alt: document.querySelectorAll('img:not([alt])').length,
    inputs_no_label: fieldEls(document.body).filter((f) => isVisible(f) && !labelled(f)).length,
    buttons_no_name: controls.filter((c) => c.role === 'button' && c.visible && !c.label).length,
    links_no_name: links.filter((l) => l.visible && !l.text).length,
    h1_count: document.querySelectorAll('h1').length,
    has_lang: !!document.documentElement.lang,
    has_viewport: !!document.querySelector('meta[name=viewport]'),
    has_main: !!document.querySelector('main,[role=main]'),
    title_empty: !document.title.trim(),
    tables_no_headers: Array.from(document.querySelectorAll('table')).filter((t) => !t.querySelector('th')).length,
    duplicate_ids: Object.values(ids).filter((n) => n > 1).length,
    positive_tabindex: document.querySelectorAll('[tabindex]:not([tabindex="0"]):not([tabindex^="-"])').length,
  };

  return {
    url: location.href,
    title: document.title,
    headings: Array.from(document.querySelectorAll('h1,h2')).slice(0, 10).map((h) => clean(h.innerText)).filter(Boolean),
    breadcrumbs: Array.from(document.querySelectorAll('[aria-label*=breadcrumb i] li,.breadcrumb li')).map((x) => clean(x.innerText)).filter(Boolean),
    links, controls, forms, loose_fields: loose, tables, lists, pagination, dialogs, tech, a11y,
    has_search: !!document.querySelector('input[type=search],[role=search] input,input[name=q],input[placeholder*=search i]'),
  };
}
