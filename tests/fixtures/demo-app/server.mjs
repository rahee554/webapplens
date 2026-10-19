// Self-contained demo application used to test the crawler without any external SaaS.
// Features: login (cookie), nested nav with collapsible group, pagination, search, dynamic routes,
// tabs, a dialog form, validation attributes, 403/404 pages, hash/SPA links, an external link,
// a logout link, and destructive buttons that must never be triggered.
import http from 'node:http';

export const DEMO_USER = 'demo@example.com';
export const DEMO_PASS = 'Demo-Pass-123!';

const customers = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `Customer ${i + 1}`, email: `c${i + 1}@example.com` }));
const PAGE_SIZE = 5;

const layout = (title, body, { nav = true } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="generator" content="DemoShop 1.0"><title>${title}</title>
<style>
:root{--p:#4f46e5}*{box-sizing:border-box}
body{font-family:Inter,'Segoe UI',system-ui,sans-serif;margin:0;background:#f4f5fb;color:#1b1d36;font-size:15px}
aside{position:fixed;inset:0 auto 0 0;width:236px;background:#171a33;padding:20px 14px;color:#cfd3f5;overflow:auto}
aside:before{content:'DemoShop';display:block;color:#fff;font-weight:800;font-size:21px;padding:4px 12px 18px;letter-spacing:-.02em}
aside nav{display:flex;flex-direction:column;gap:2px}aside br{display:none}
aside nav a,aside nav button{display:block;width:100%;color:#cfd3f5;text-decoration:none;padding:9px 12px;border-radius:9px;background:none;border:0;font:inherit;text-align:left;cursor:pointer}
aside nav a:hover,aside nav button:hover{background:#252a52;color:#fff}
.sub{display:none;padding-left:14px}.sub.open{display:block}
main{margin-left:236px;padding:30px 38px;max-width:1100px}
h1{font-size:27px;margin:0 0 18px;letter-spacing:-.02em}h2{margin:0 0 12px;font-size:19px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px #1b1d3614;margin:16px 0}
th,td{padding:12px 16px;text-align:left;border-bottom:1px solid #eceef8}th{background:#f0f1fb;font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6a6f92}tr:last-child td{border:0}
button{font:inherit;padding:8px 16px;border-radius:9px;border:1px solid #d9dcf0;background:#fff;cursor:pointer;color:#1b1d36}
button[type=submit]{background:var(--p);color:#fff;border-color:var(--p)}
input,select,textarea{font:inherit;padding:8px 11px;border:1px solid #d3d6ec;border-radius:9px;margin:4px 8px 4px 6px;background:#fff}
label{display:block;margin:10px 0}a{color:var(--p);text-decoration:none}a:hover{text-decoration:underline}
#add{background:var(--p);color:#fff;border-color:var(--p);margin:6px 0}
[role=dialog]{display:none;position:fixed;top:12%;left:calc(50% + 118px);transform:translateX(-50%);width:460px;background:#fff;border-radius:18px;padding:24px 28px;box-shadow:0 24px 70px #1b1d3655;z-index:5}
[role=dialog].open{display:block}
[role=tablist]{display:flex;gap:4px;border-bottom:1px solid #dcdff2;margin:20px 0 14px}
[role=tab]{border:0;border-bottom:3px solid transparent;border-radius:0;background:none;padding:10px 16px}[role=tab][aria-selected=true]{border-color:var(--p);color:var(--p);font-weight:700}
[role=tabpanel]{display:none;background:#fff;padding:20px;border-radius:14px;box-shadow:0 1px 3px #1b1d3614}[role=tabpanel].active{display:block}
nav[aria-label=Pagination]{margin-top:10px;color:#6a6f92}fieldset{border:1px solid #dcdff2;border-radius:14px;background:#fff;padding:14px 20px;margin-bottom:14px}legend{font-weight:700;padding:0 6px}
</style></head>
<body>${nav ? `<aside><nav aria-label="Main">
<a href="/">Dashboard</a><br><a href="/customers">Customers</a><br>
<button aria-expanded="false" aria-controls="inv" onclick="this.setAttribute('aria-expanded','true');document.getElementById('inv').classList.add('open')">Inventory</button>
<div id="inv" class="sub"><a href="/inventory/products">Products</a><br><a href="/inventory/categories">Categories</a></div>
<a href="/settings">Settings</a><br><a href="/spa">Reports (SPA)</a><br><a href="/admin">Admin</a><br><a href="/missing-page">Old page</a><br>
<a href="https://example.org/partner">Partner site</a><br><a href="mailto:help@example.com">Email us</a><br><a href="/logout">Log out</a>
</nav></aside>` : ''}<main>${body}</main></body></html>`;

const table = (rows, head) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

const pages = {
  '/': () => layout('Dashboard', '<h1>Dashboard</h1><p>Welcome back.</p><a href="/customers">View customers</a>'),
  '/customers': (u) => {
    const q = (u.searchParams.get('q') || '').toLowerCase();
    const list = customers.filter((c) => c.name.toLowerCase().includes(q));
    const page = Math.max(1, Number(u.searchParams.get('page') || 1));
    const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const rows = slice.map((c) => `<tr><td><a href="/customers/${c.id}">${c.name}</a></td><td>${c.email}</td><td><a href="/customers/${c.id}/edit">Edit</a>
      <form method="post" action="/customers/${c.id}/delete" style="display:inline"><button type="submit">Delete</button></form></td></tr>`);
    const pages_ = Math.ceil(list.length / PAGE_SIZE);
    return layout('Customers', `<h1>Customers</h1>
<form method="get" action="/customers"><label>Search <input type="search" name="q" value="${q}" placeholder="Name"></label><button type="submit">Search</button></form>
<button id="add" onclick="document.getElementById('dlg').classList.add('open')">Add Customer</button>
<div id="dlg" role="dialog" aria-label="Add customer"><h2>New customer</h2>
<form method="post" action="/customers"><label>Name <input name="name" required maxlength="40" placeholder="Full name"></label>
<label>Email <input name="email" type="email" required></label>
<label>Type <select name="type"><option>Individual</option><option>Company</option></select></label>
<label>Notes <textarea name="notes"></textarea></label>
<button type="submit">Save</button><button type="button" onclick="document.getElementById('dlg').classList.remove('open')">Cancel</button></form></div>
${table(rows, ['Name', 'Email', 'Actions'])}
<nav aria-label="Pagination">${page > 1 ? `<a href="/customers?page=${page - 1}">Previous</a> ` : ''}Page ${page} of ${pages_} ${page < pages_ ? `<a href="/customers?page=${page + 1}">Next</a>` : ''}</nav>`);
  },
  '/inventory/products': () => layout('Products', '<h1>Products</h1>' + table(['<tr><td>Widget</td><td>9.99</td></tr>', '<tr><td>Gadget</td><td>19.50</td></tr>'], ['Product', 'Price']) + '<a href="/inventory/categories">Categories</a>'),
  '/inventory/categories': () => layout('Categories', '<h1>Categories</h1><ul><li>Hardware</li><li>Software</li></ul>'),
  '/settings': () => layout('Settings', `<h1>Settings</h1><form method="post" action="/settings"><fieldset><legend>Profile</legend>
<label>Display name <input name="display" value="Demo User"></label>
<label>API key <input name="api_key" value="sk-live-SECRET-VALUE-999"></label>
<label>Password <input type="password" name="pw" value="hunter2hunter2"></label>
<label><input type="checkbox" name="news" checked> Newsletter</label>
<fieldset><legend>Theme</legend><label><input type="radio" name="theme" value="light" checked> Light</label><label><input type="radio" name="theme" value="dark"> Dark</label></fieldset>
<label>Avatar <input type="file" name="avatar"></label></fieldset><button type="submit">Save settings</button></form>`),
  '/spa': () => layout('Reports', `<h1>Reports</h1><div id="out">Loading…</div>
<script>setTimeout(()=>{document.getElementById('out').innerHTML='<a href="/#/sales">Sales (hash route)</a> <a href="/reports/2024">Annual 2024</a>'},100)</script>`),
  '/reports/2024': () => layout('Annual report 2024', '<h1>Annual report 2024</h1>'),
};

const customerDetail = (id, tab) => layout(`Customer ${id}`, `<h1>Customer ${id}</h1><a href="/customers/${id}/edit">Edit customer</a>
<button type="button">Send email</button>
<div role="tablist"><button role="tab" aria-selected="true" aria-controls="p1" id="t1" onclick="sel(1)">Overview</button><button role="tab" aria-selected="false" aria-controls="p2" id="t2" onclick="sel(2)">Invoices</button><button role="tab" aria-selected="false" aria-controls="p3" id="t3" onclick="sel(3)">Notes</button></div>
<div role="tabpanel" id="p1" class="active">Overview of customer ${id}</div>
<div role="tabpanel" id="p2">Invoices: none yet <a href="/inventory/products">Browse products</a></div>
<div role="tabpanel" id="p3"><form method="post" action="/customers/${id}/notes"><label>Note <textarea name="note" required></textarea></label><button type="submit">Add note</button></form></div>
<script>function sel(n){for(let i=1;i<=3;i++){document.getElementById('p'+i).classList.toggle('active',i===n);document.getElementById('t'+i).setAttribute('aria-selected',String(i===n))}}</script>`);

export function startServer(port = 0) {
  const stats = { mutations: [], logoutHits: 0, loginPosts: 0, graphql: [], hits: {} };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    stats.hits[u.pathname] = (stats.hits[u.pathname] || 0) + 1;
    const send = (code, html, headers = {}) => { res.writeHead(code, { 'content-type': 'text/html; charset=utf-8', ...headers }); res.end(html); };
    const authed = /sid=ok/.test(req.headers.cookie || '');

    if (u.pathname === '/demo-info') {
      return send(200, layout('Demo access', `<h1>Live demo</h1><p>Try the live preview. Demo login — Username: ${DEMO_USER} Password: ${DEMO_PASS}</p><p>Legacy admin: admin@admin.com / 123456</p><p>Your password: ********</p><a href="/login">Open the login page</a>`, { nav: false }));
    }
    if (u.pathname === '/graphql' && req.method === 'POST') {
      let b = '';
      req.on('data', (c) => (b += c));
      req.on('end', () => { stats.graphql.push(b); send(200, '{"data":{}}', { 'content-type': 'application/json' }); });
      return;
    }
    if (u.pathname === '/login') {
      if (req.method === 'POST') {
        stats.loginPosts++;
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const f = new URLSearchParams(body);
          if (f.get('username') === DEMO_USER && f.get('password') === DEMO_PASS) return send(302, '', { location: '/', 'set-cookie': 'sid=ok; Path=/; HttpOnly' });
          send(200, layout('Login', '<h1>Login</h1><p role="alert">Invalid credentials</p>' + loginForm(), { nav: false }));
        });
        return;
      }
      return send(200, layout('Login', '<h1>Login</h1>' + loginForm(), { nav: false }));
    }
    if (u.pathname === '/logout') { stats.logoutHits++; return send(302, '', { location: '/login', 'set-cookie': 'sid=; Max-Age=0; Path=/' }); }
    if (!authed) return send(302, '', { location: '/login' });

    if (req.method !== 'GET' && req.method !== 'HEAD') { stats.mutations.push(`${req.method} ${u.pathname}`); return send(200, layout('Done', '<h1>Done</h1>')); }

    if (u.pathname === '/admin') return send(403, layout('Forbidden', '<h1>403 Forbidden</h1><p>Administrators only.</p>'));
    if (pages[u.pathname]) return send(200, pages[u.pathname](u));
    let m = u.pathname.match(/^\/customers\/(\d+)$/);
    if (m && Number(m[1]) <= customers.length) return send(200, customerDetail(m[1]));
    m = u.pathname.match(/^\/customers\/(\d+)\/edit$/);
    if (m) return send(200, layout(`Edit customer ${m[1]}`, `<h1>Edit customer ${m[1]}</h1><form method="post" action="/customers/${m[1]}"><label>Name <input name="name" required value="Customer ${m[1]}"></label><label>Status <select name="status"><option>Active</option><option>Inactive</option></select></label><button type="submit">Update</button></form>`));
    send(404, layout('Not found', '<h1>404</h1><p>Page not found.</p>'));
  });
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, stats, close: () => new Promise((r) => server.close(r)) })),
  );
}

const loginForm = () => `<form method="post" action="/login"><label>Username <input name="username" type="text"></label><label>Password <input name="password" type="password"></label><button type="submit">Sign in</button></form>`;
