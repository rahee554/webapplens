// UI research: extracts the visual language of the app from computed styles (colors, type, spacing, radii,
// shadows, components, layout, CSS variables, breakpoints, contrast). Values are `observed`; the role names
// we attach (primary, surface, ...) are `inferred` from frequency and are labelled that way in the docs.

/** Runs inside the page. Must stay self-contained. */
export function inPageDesign() {
  const parse = (c) => {
    const m = String(c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.slice(0, 3).some(Number.isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const hex = (o) => '#' + [o.r, o.g, o.b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  const lum = (o) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(o.r) + 0.7152 * f(o.g) + 0.0722 * f(o.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null; };
  const visible = (el, cs, r) => r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  const bump = (m, k, n = 1) => { if (k !== null && k !== undefined && k !== '') m[k] = (m[k] || 0) + n; };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a >= 0.95) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };

  const out = { pairs: {}, colors: {}, backgrounds: {}, borders: {}, fonts: {}, sizes: {}, weights: {}, radii: {}, shadows: {}, spacing: {}, components: { buttons: [], inputs: [], cards: [] }, layout: {}, cssVars: {}, breakpoints: {}, darkMode: false, themeColor: null, contrast: { checked: 0, failures: 0, examples: [] } };
  const all = Array.from(document.querySelectorAll('body, body *'));
  const step = Math.max(1, Math.floor(all.length / 1200));
  for (let i = 0; i < all.length; i += step) {
    const el = all[i];
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH'].includes(el.tagName.toUpperCase())) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!visible(el, cs, r)) continue;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (hasText) {
      const fg = parse(cs.color);
      if (fg) {
        bump(out.colors, hex(fg));
        // text colour on the background it actually sits on: lets us find the content text colour, not the sidebar's
        const pk = hex(fg) + '|' + hex(bgOf(el));
        const inChrome = !!el.closest('nav,aside,header,footer,[role=navigation],[role=banner]'); // content surface, not app chrome
        // weight by visible text mass (characters x font-size^2) so body copy outweighs a narrow sidebar
        const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').length;
        const w = Math.max(1, Math.round((own * px(cs.fontSize) ** 2) / 200));
        if (!inChrome && (pk in out.pairs || Object.keys(out.pairs).length < 120)) bump(out.pairs, pk, w);
      }
      bump(out.fonts, (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim());
      bump(out.sizes, px(cs.fontSize)); bump(out.weights, cs.fontWeight);
      if (fg && out.contrast.checked < 300) {
        const bg = bgOf(el), size = px(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
        const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5, rt = ratio(fg, bg);
        out.contrast.checked++;
        if (rt < need) { out.contrast.failures++; if (out.contrast.examples.length < 6) out.contrast.examples.push({ text: el.textContent.trim().slice(0, 40), fg: hex(fg), bg: hex(bg), ratio: Math.round(rt * 100) / 100, size }); }
      }
    }
    const bgc = parse(cs.backgroundColor);
    if (bgc && bgc.a > 0.05 && r.width * r.height >= 400) bump(out.backgrounds, hex(bgc));
    const bw = px(cs.borderTopWidth);
    if (bw > 0 && cs.borderTopStyle !== 'none') { const bc = parse(cs.borderTopColor); if (bc && bc.a > 0.05) bump(out.borders, hex(bc)); }
    const rad = px(cs.borderTopLeftRadius); if (rad > 0 && r.width * r.height >= 400) bump(out.radii, rad);
    if (cs.boxShadow && cs.boxShadow !== 'none') bump(out.shadows, cs.boxShadow.replace(/rgba?\([^)]*\)/g, (m) => { const o = parse(m); return o ? hex(o) : m; }).slice(0, 90));
    for (const p of ['paddingTop', 'paddingLeft', 'marginTop', 'marginLeft', 'rowGap', 'columnGap']) { const v = px(cs[p]); if (v > 0 && v <= 128) bump(out.spacing, v); }
  }

  const sig = (cs) => [hex(parse(cs.backgroundColor) || { r: 0, g: 0, b: 0 }), (parse(cs.color) ? hex(parse(cs.color)) : ''), px(cs.borderTopLeftRadius), px(cs.fontSize), cs.fontWeight, `${px(cs.paddingTop)}/${px(cs.paddingLeft)}`].join('|');
  const collect = (sel, list, cap, mk) => {
    const seen = {};
    for (const el of Array.from(document.querySelectorAll(sel)).slice(0, cap)) {
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (!visible(el, cs, r)) continue;
      const s = mk(el, cs, r);
      if (seen[s.sig]) seen[s.sig].count++; else seen[s.sig] = { ...s, count: 1 };
    }
    list.push(...Object.values(seen));
  };
  collect('button, [role=button], a.btn, input[type=submit], input[type=button]', out.components.buttons, 60, (el, cs) => ({ sig: sig(cs), bg: hex(parse(cs.backgroundColor) || { r: 0, g: 0, b: 0 }), transparent: !parse(cs.backgroundColor) || parse(cs.backgroundColor).a < 0.05, color: parse(cs.color) ? hex(parse(cs.color)) : null, radius: px(cs.borderTopLeftRadius), fontSize: px(cs.fontSize), weight: cs.fontWeight, padding: `${px(cs.paddingTop)}px ${px(cs.paddingLeft)}px`, border: px(cs.borderTopWidth) > 0 ? `${px(cs.borderTopWidth)}px ${parse(cs.borderTopColor) ? hex(parse(cs.borderTopColor)) : ''}` : 'none', sample: (el.innerText || el.value || '').trim().slice(0, 24) }));
  collect('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea', out.components.inputs, 40, (el, cs, r) => ({ sig: [parse(cs.borderTopColor) ? hex(parse(cs.borderTopColor)) : '', px(cs.borderTopLeftRadius), Math.round(r.height), px(cs.fontSize), parse(cs.backgroundColor) ? hex(parse(cs.backgroundColor)) : ''].join('|'), border: parse(cs.borderTopColor) ? hex(parse(cs.borderTopColor)) : null, radius: px(cs.borderTopLeftRadius), height: Math.round(r.height), fontSize: px(cs.fontSize), bg: parse(cs.backgroundColor) ? hex(parse(cs.backgroundColor)) : null, sample: el.tagName.toLowerCase() }));
  collect('div, section, article, li', out.components.cards, 500, (el, cs, r) => {
    const rad = px(cs.borderTopLeftRadius), bgc = parse(cs.backgroundColor), shadow = cs.boxShadow !== 'none', border = px(cs.borderTopWidth) > 0;
    if (!(rad >= 6 && bgc && bgc.a > 0.9 && (shadow || border) && r.width > 180 && r.height > 70)) return { sig: '' };
    return { sig: [hex(bgc), rad, shadow ? 'shadow' : '', border ? 'border' : ''].join('|'), bg: hex(bgc), radius: rad, shadow: shadow ? cs.boxShadow.slice(0, 70) : null, border, sample: (el.tagName || '').toLowerCase() };
  });
  out.components.cards = out.components.cards.filter((c) => c.sig);

  const th = document.querySelector('table th'), td = document.querySelector('table td');
  if (th) { const cs = getComputedStyle(th); out.components.table = { headerBg: parse(cs.backgroundColor) ? hex(parse(cs.backgroundColor)) : null, headerColor: parse(cs.color) ? hex(parse(cs.color)) : null, headerSize: px(cs.fontSize), headerWeight: cs.fontWeight, transform: cs.textTransform, cellPadding: td ? `${px(getComputedStyle(td).paddingTop)}px ${px(getComputedStyle(td).paddingLeft)}px` : null }; }
  out.components.headings = {};
  for (const t of ['h1', 'h2', 'h3', 'h4']) { const h = document.querySelector(t); if (h) { const cs = getComputedStyle(h); out.components.headings[t] = { size: px(cs.fontSize), weight: cs.fontWeight, color: parse(cs.color) ? hex(parse(cs.color)) : null, family: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim() }; } }
  const a = document.querySelector('a[href]'); if (a) { const cs = getComputedStyle(a); out.components.link = { color: parse(cs.color) ? hex(parse(cs.color)) : null, decoration: cs.textDecorationLine }; }
  const bcs = getComputedStyle(document.body);
  out.components.body = { bg: parse(bcs.backgroundColor) ? hex(parse(bcs.backgroundColor)) : null, color: parse(bcs.color) ? hex(parse(bcs.color)) : null, family: bcs.fontFamily, size: px(bcs.fontSize), lineHeight: bcs.lineHeight };

  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); if (!r.width) return null; return { x: Math.round(r.x), width: Math.round(r.width), height: Math.round(r.height), position: cs.position, display: cs.display, maxWidth: cs.maxWidth }; };
  out.layout = { header: rect('header, [role=banner]'), sidebar: rect('aside, nav[aria-label=Main], [role=navigation]'), main: rect('main, [role=main]'), footer: rect('footer, [role=contentinfo]'), viewport: { w: innerWidth, h: innerHeight } };

  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(rules || [])) {
        if (rule.type === 1 && /^(:root|html|body|\[data-theme|\.dark|\.light)/.test(rule.selectorText || '')) {
          for (let i = 0; i < rule.style.length; i++) { const n = rule.style[i]; if (n.startsWith('--') && Object.keys(out.cssVars).length < 200 && !(n in out.cssVars)) out.cssVars[n] = rule.style.getPropertyValue(n).trim().slice(0, 80); }
          if (rule.style.getPropertyValue('color-scheme')) out.darkMode = out.darkMode || /dark/.test(rule.style.getPropertyValue('color-scheme'));
        }
        if (rule.type === 4) {
          const t = rule.conditionText || rule.media.mediaText;
          if (/prefers-color-scheme:\s*dark/.test(t)) out.darkMode = true;
          for (const m of t.matchAll(/(min|max)-width:\s*(\d+(?:\.\d+)?)px/g)) bump(out.breakpoints, Math.round(Number(m[2])));
        }
      }
    }
  } catch { /* ignore inaccessible sheets */ }
  out.themeColor = document.querySelector('meta[name=theme-color]')?.content || null;
  return out;
}

export const newDesignAcc = () => ({ pages: 0, pairs: {}, colors: {}, backgrounds: {}, borders: {}, fonts: {}, sizes: {}, weights: {}, radii: {}, shadows: {}, spacing: {}, components: { buttons: [], inputs: [], cards: [], table: null, headings: {}, link: null, body: null }, layout: [], cssVars: {}, breakpoints: {}, darkMode: false, themeColor: null, contrast: { checked: 0, failures: 0, examples: [] } });

const addMap = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = (a[k] || 0) + v; };
const mergeVariants = (a, b, cap = 8) => { for (const v of b) { const f = a.find((x) => x.sig === v.sig); if (f) f.count += v.count; else if (a.length < cap) a.push({ ...v }); } a.sort((x, y) => y.count - x.count); };

export function mergeDesign(acc, d) {
  acc.pages++;
  for (const k of ['pairs', 'colors', 'backgrounds', 'borders', 'fonts', 'sizes', 'weights', 'radii', 'shadows', 'spacing', 'breakpoints']) addMap(acc[k], d[k] || {});
  for (const k of ['buttons', 'inputs', 'cards']) mergeVariants(acc.components[k], d.components[k] || []);
  acc.components.table ||= d.components.table || null;
  acc.components.link ||= d.components.link || null;
  acc.components.body ||= d.components.body || null;
  for (const [k, v] of Object.entries(d.components.headings || {})) acc.components.headings[k] ||= v;
  for (const [k, v] of Object.entries(d.cssVars || {})) if (!(k in acc.cssVars) && Object.keys(acc.cssVars).length < 200) acc.cssVars[k] = v;
  if (acc.layout.length < 8) acc.layout.push(d.layout);
  acc.darkMode ||= d.darkMode;
  acc.themeColor ||= d.themeColor;
  acc.contrast.checked += d.contrast.checked;
  acc.contrast.failures += d.contrast.failures;
  for (const e of d.contrast.examples) if (acc.contrast.examples.length < 10 && !acc.contrast.examples.some((x) => x.fg === e.fg && x.bg === e.bg)) acc.contrast.examples.push(e);
  return acc;
}

// ---- analysis helpers (pure) -----------------------------------------------------------------------------
const top = (m, n = 10) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
export function hexToHsl(h) {
  const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return { h: 0, s: 0, l };
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: Math.round(hh * 60), s, l };
}
const chromatic = (hex) => { const { s, l } = hexToHsl(hex); return s >= 0.3 && l > 0.2 && l < 0.85; };

/** Inferred roles from frequency. All are `inferred`, not facts about the design system source. */
export function inferRoles(acc) {
  const total = (m) => Object.values(m).reduce((a, b) => a + b, 0) || 1;
  // Surface = the background carrying the most text; text = the most common text colour ON that surface.
  const byBg = {};
  for (const [k, n] of Object.entries(acc.pairs || {})) { const bg = k.split('|')[1]; byBg[bg] = (byBg[bg] || 0) + n; }
  const surface = top(byBg, 1)[0]?.[0] || top(acc.backgrounds, 1)[0]?.[0] || acc.components.body?.bg || null;
  const onSurface = {};
  for (const [k, n] of Object.entries(acc.pairs || {})) { const [fg, bg] = k.split('|'); if (bg === surface) onSurface[fg] = (onSurface[fg] || 0) + n; }
  const text = top(onSurface, 1)[0]?.[0] || top(acc.colors, 1)[0]?.[0] || acc.components.body?.color || null;
  const btn = acc.components.buttons.find((b) => !b.transparent && chromatic(b.bg));
  const pool = { ...acc.colors };
  addMap(pool, acc.backgrounds);
  addMap(pool, acc.borders);
  const primary = btn?.bg || top(Object.fromEntries(Object.entries(pool).filter(([h]) => chromatic(h))), 1)[0]?.[0] || null;
  const accents = top(Object.fromEntries(Object.entries(pool).filter(([h]) => chromatic(h) && h !== primary)), 3).map(([h]) => h);
  const spacingVals = Object.entries(acc.spacing);
  const sp = spacingVals.reduce((a, [, n]) => a + n, 0) || 1;
  const grid4 = Math.round((spacingVals.filter(([v]) => Number(v) % 4 === 0).reduce((a, [, n]) => a + n, 0) / sp) * 100);
  const grid8 = Math.round((spacingVals.filter(([v]) => Number(v) % 8 === 0).reduce((a, [, n]) => a + n, 0) / sp) * 100);
  const base = Number(top(acc.sizes, 1)[0]?.[0]) || null;
  return { surface, text, primary, accents, grid4, grid8, base, distinct: { colors: Object.keys({ ...acc.colors, ...acc.backgrounds }).length, sizes: Object.keys(acc.sizes).length, radii: Object.keys(acc.radii).length, shadows: Object.keys(acc.shadows).length, fonts: Object.keys(acc.fonts).length }, total_text: total(acc.colors) };
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const tbl = (head, rows) => (rows.length ? `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.map(esc).join(' | ')} |`).join('\n')}` : '_None observed._');

export function renderDesignDoc(acc, appName) {
  const r = inferRoles(acc);
  const pctOf = (m, k) => `${Math.round((m[k] / (Object.values(m).reduce((a, b) => a + b, 0) || 1)) * 100)}%`;
  const sizes = Object.keys(acc.sizes).map(Number).sort((a, b) => a - b);
  const bp = Object.entries(acc.breakpoints).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
  const hv = Object.entries(acc.cssVars);
  const colorVars = hv.filter(([, v]) => /^(#|rgb|hsl)/i.test(v));
  return `# Design system (observed) — ${appName}

Evidence: computed styles of sampled elements across ${acc.pages} page(s). Values are **observed**; the role names (primary, surface…) are **inferred** from frequency and are not the vendor's official token names. Colours are as rendered, not as authored.

## Summary
- Surface / background (inferred): ${r.surface || 'n/a'} · Text (inferred): ${r.text || 'n/a'} · Primary (inferred): ${r.primary || 'n/a'}${r.accents.length ? ` · Accents: ${r.accents.join(', ')}` : ''}
- Base font size: ${r.base ? r.base + 'px' : 'n/a'} · Fonts: ${top(acc.fonts, 3).map(([f]) => f).join(', ') || 'n/a'}
- Spacing grid fit: ${r.grid4}% of values divisible by 4px, ${r.grid8}% by 8px
- Distinct colours ${r.distinct.colors}, font sizes ${r.distinct.sizes}, radii ${r.distinct.radii}, shadows ${r.distinct.shadows}
- Dark mode rules present: ${acc.darkMode ? 'yes' : 'not detected'}${acc.themeColor ? ` · theme-color ${acc.themeColor}` : ''}

## Colour palette (observed, by frequency)
### Text colours
${tbl(['Colour', 'Share', 'Count'], top(acc.colors, 8).map(([h, n]) => [h, pctOf(acc.colors, h), n]))}

### Backgrounds
${tbl(['Colour', 'Share', 'Count'], top(acc.backgrounds, 8).map(([h, n]) => [h, pctOf(acc.backgrounds, h), n]))}

### Borders
${tbl(['Colour', 'Share', 'Count'], top(acc.borders, 6).map(([h, n]) => [h, pctOf(acc.borders, h), n]))}

## Typography
${tbl(['Font family', 'Count'], top(acc.fonts, 5))}

Size scale (px): ${sizes.join(', ') || 'n/a'}

${tbl(['Weight', 'Count'], top(acc.weights, 5))}

Headings: ${Object.entries(acc.components.headings).map(([k, v]) => `${k} ${v.size}px/${v.weight}`).join(' · ') || 'n/a'}

## Spacing, radius, shadow
Most used spacing (px): ${top(acc.spacing, 10).map(([v, n]) => `${v}(${n})`).join(', ') || 'n/a'}

Radii (px): ${top(acc.radii, 6).map(([v, n]) => `${v}(${n})`).join(', ') || 'none'}

${tbl(['Shadow', 'Count'], top(acc.shadows, 5))}

## Components (observed variants)
### Buttons
${tbl(['Background', 'Text', 'Radius', 'Font', 'Padding', 'Border', 'Count', 'Example'], acc.components.buttons.slice(0, 8).map((b) => [b.transparent ? 'transparent' : b.bg, b.color, b.radius, `${b.fontSize}px/${b.weight}`, b.padding, b.border, b.count, b.sample]))}

### Form fields
${tbl(['Border', 'Radius', 'Height', 'Font', 'Background', 'Count'], acc.components.inputs.slice(0, 6).map((i) => [i.border, i.radius, `${i.height}px`, `${i.fontSize}px`, i.bg, i.count]))}

### Cards / panels
${tbl(['Background', 'Radius', 'Shadow', 'Border', 'Count'], acc.components.cards.slice(0, 6).map((c) => [c.bg, c.radius, c.shadow || '—', c.border ? 'yes' : 'no', c.count]))}

### Tables
${acc.components.table ? `Header: bg ${acc.components.table.headerBg}, text ${acc.components.table.headerColor}, ${acc.components.table.headerSize}px/${acc.components.table.headerWeight}${acc.components.table.transform && acc.components.table.transform !== 'none' ? `, ${acc.components.table.transform}` : ''}; cell padding ${acc.components.table.cellPadding}` : '_No table seen._'}

Links: ${acc.components.link ? `${acc.components.link.color}, ${acc.components.link.decoration || 'none'}` : 'n/a'}

## Layout (first pages)
${tbl(['Header', 'Sidebar / nav', 'Main', 'Footer'], acc.layout.slice(0, 4).map((l) => ['header', 'sidebar', 'main', 'footer'].map((k) => (l[k] ? `${l[k].width}×${l[k].height} @x${l[k].x} ${l[k].position}` : '—'))))}

## Responsive breakpoints found in accessible stylesheets
${bp.length ? bp.map(([w, n]) => `${w}px (${n})`).join(', ') : 'none readable (cross-origin or inline-only styles)'}

## CSS variables (design tokens as authored)
${hv.length ? `${hv.length} custom properties found on :root/html/body/theme selectors.\n\n${tbl(['Variable', 'Value'], hv.slice(0, 50))}` : '_No readable CSS custom properties (cross-origin stylesheets or none used)._'}
${colorVars.length ? `\nColour variables: ${colorVars.length}.` : ''}

## Contrast check (WCAG AA estimate)
${acc.contrast.checked} text samples checked, ${acc.contrast.failures} below AA (${acc.contrast.checked ? Math.round((acc.contrast.failures / acc.contrast.checked) * 100) : 0}%). Estimated from computed colours; images/gradients behind text are not resolved.
${tbl(['Text', 'Colour', 'Background', 'Ratio', 'Size'], acc.contrast.examples.map((e) => [e.text, e.fg, e.bg, e.ratio, `${e.size}px`]))}
`;
}

/** Machine-readable summary of the inferred tokens, for developers/design tools. */
export function designTokensJson(acc) {
  const r = inferRoles(acc);
  return {
    note: 'Observed from rendered pages; role names are inferred.',
    colors: { surface: r.surface, text: r.text, primary: r.primary, accents: r.accents, palette: top({ ...acc.colors, ...acc.backgrounds }, 16).map(([h]) => h) },
    typography: { families: top(acc.fonts, 4).map(([f]) => f), baseSize: r.base, scale: Object.keys(acc.sizes).map(Number).sort((a, b) => a - b), weights: top(acc.weights, 4).map(([w]) => Number(w)) },
    spacing: { values: top(acc.spacing, 12).map(([v]) => Number(v)).sort((a, b) => a - b), gridFit: { by4: r.grid4, by8: r.grid8 } },
    radii: top(acc.radii, 5).map(([v]) => Number(v)),
    shadows: top(acc.shadows, 4).map(([s]) => s),
    breakpoints: Object.keys(acc.breakpoints).map(Number).sort((a, b) => a - b),
    cssVariables: acc.cssVars,
  };
}
