import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, routeTemplate, RouteRegistry, deriveStatus, moduleOf } from '../../skills/webapp-research/scripts/lib/routes.mjs';
import { makeScope } from '../../skills/webapp-research/scripts/lib/scope.mjs';
import { classifyAction, isOpener } from '../../skills/webapp-research/scripts/lib/safety.mjs';

const B = 'https://app.test';

test('normalizeUrl drops anchors, tracking params and trailing slashes but keeps hash routes', () => {
  assert.equal(normalizeUrl('/a/?utm_source=x&b=2&a=1#section', B), 'https://app.test/a?a=1&b=2');
  assert.equal(normalizeUrl('/#/sales/12', B), 'https://app.test/#/sales/12');
  assert.equal(normalizeUrl('mailto:a@b.c', B), null);
  assert.equal(normalizeUrl('javascript:void(0)', B), null);
});

test('routeTemplate templates ids and ignores paging/search params', () => {
  assert.equal(routeTemplate(normalizeUrl('/customers/42?page=2', B)), '/customers/:id');
  assert.equal(routeTemplate(normalizeUrl('/orders/3f2b8c1e-1111-2222-3333-444455556666/lines', B)), '/orders/:id/lines');
  assert.equal(routeTemplate(normalizeUrl('/customers?q=bob&page=3', B)), '/customers');
  assert.equal(routeTemplate(normalizeUrl('/billing?tab=invoices', B)), '/billing?tab=invoices');
  assert.equal(routeTemplate(normalizeUrl('/#/orders/99', B)), '/#/orders/:id');
});

test('moduleOf derives module/submodule', () => {
  assert.deepEqual(moduleOf('https://app.test/inventory/products/5'), { module: 'inventory', submodule: 'products' });
  assert.deepEqual(moduleOf('https://app.test/'), { module: 'root', submodule: null });
});

test('registry deduplicates, samples dynamic routes and derives status', () => {
  const reg = new RouteRegistry([], { maxPerTemplate: 2 });
  const a = reg.add(`${B}/customers/1`);
  assert.equal(a.visit, true);
  assert.equal(reg.add(`${B}/customers/1/`).reason, 'duplicate');
  assert.equal(reg.add(`${B}/customers/2`).visit, true);
  const third = reg.add(`${B}/customers/3`);
  assert.equal(third.visit, false);
  assert.equal(third.reason, 'sampled');
  assert.equal(reg.routes.length, 1);
  assert.equal(reg.routes[0].skipped_variants, 1);
  const r = reg.routes[0];
  reg.setResult(r, r.examples[0], 'explored');
  reg.setResult(r, r.examples[1], 'failed');
  assert.equal(r.status, 'partial');
  assert.equal(deriveStatus({ results: { a: 'blocked' } }), 'blocked');
});

test('scope enforces origin, exclusions, downloads, depth and schemes', () => {
  const s = makeScope({ baseUrl: B, maxDepth: 2, exclude: ['/internal-tools'] });
  assert.equal(s.check(`${B}/x`, 1).ok, true);
  assert.equal(s.check('https://evil.test/x').reason, 'external');
  assert.equal(s.check('https://app.test.evil.com/x').reason, 'external');
  assert.equal(s.check(`${B}/logout`).reason, 'excluded');
  assert.equal(s.check(`${B}/users/5/delete`).reason, 'excluded');
  assert.equal(s.check(`${B}/internal-tools/a`).reason, 'excluded');
  assert.equal(s.check(`${B}/report.pdf`).reason, 'download');
  assert.equal(s.check(`${B}/x`, 3).reason, 'depth');
  assert.equal(s.check('ftp://app.test/x').reason, 'non-http');
  const sub = makeScope({ baseUrl: B, includeSubdomains: true });
  assert.equal(sub.check('https://api.app.test/x').ok, true);
  const multi = makeScope({ baseUrl: B, allowedOrigins: ['https://auth.test'] });
  assert.equal(multi.check('https://auth.test/x').ok, true);
});

test('classifyAction: A/B/C categories', () => {
  assert.equal(classifyAction('Next', { role: 'button' }).category, 'A');
  assert.equal(classifyAction('Details', { role: 'link' }).category, 'A');
  assert.equal(classifyAction('Save').category, 'B');
  assert.equal(classifyAction('Add Customer').category, 'B');
  assert.equal(classifyAction('Delete').category, 'C');
  assert.equal(classifyAction('Send invoice').category, 'C');
  assert.equal(classifyAction('Approve payment').category, 'C');
  assert.equal(classifyAction('Frobnicate').category, 'B', 'unknown labels are not assumed safe');
  assert.equal(classifyAction('Overview', { toggle: true }).category, 'A');
  assert.equal(classifyAction('Filter', { type: 'submit' }).category, 'B', 'submit controls are at least B');
  assert.equal(classifyAction('Go', { method: 'POST' }).category, 'B');
  assert.equal(classifyAction('Home', { role: 'link', href: 'https://app.test/users/9/delete' }).category, 'C');
  assert.equal(isOpener('Add Customer', {}), true);
  assert.equal(isOpener('Add Customer', { type: 'submit' }), false);
  assert.equal(isOpener('Delete customer', {}), false);
});
