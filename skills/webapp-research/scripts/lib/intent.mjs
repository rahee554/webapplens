// Precise-scope planning. Maps a request to the minimum set of research "facets" and the exact commands
// for them, so an agent does only what was asked (no screenshots unless asked, no architecture unless asked)
// and asks questions only about what is genuinely missing. Deterministic keyword rules; the agent may
// override them, but should state the override.

export const FACETS = {
  routes: 'Map pages and navigation (always needed when crawling)',
  screenshots: 'Capture screenshots of pages, tabs, dialogs and mobile views',
  ui: 'UI research: theme colours, typography, spacing, components, layout, responsive breakpoints',
  stack: 'Detect the technology stack (front end, back end, hosting, libraries) from passive signals',
  forms: 'Inventory forms, fields, validation hints and controls',
  workflows: 'Document business workflows and screen-to-screen relationships',
  'data-model': 'Infer the data model (entities, fields, relations) - proposed, never confirmed',
  api: 'Observe network/API calls made by the pages',
  architecture: 'Architecture proposal: modules, data model, API outline, deployment, roadmap',
  suggestions: 'Evidence-based improvement suggestions (accessibility, usability, performance, design, passive security)',
  docs: 'Client-facing documentation: overview, user guide, module pages',
  repo: 'Analyse a local repository/folder (stack, routes, schema, env names)',
  discover: 'Find products, marketplaces, demos and published demo credentials; compare',
  full: 'Everything above for the target (only when explicitly asked)',
};

const RULES = [
  ['screenshots', /screen\s?-?shots?|capture (the )?(pages|screens)|images? of (the )?(pages|screens|ui)|visual (record|capture)/],
  ['ui', /\bui\b|\bux\b|user interface|theme|colou?rs?|palette|typograph|fonts?\b|design system|style guide|layout|look and feel|front-?end design|components?\b|branding|dark mode/],
  ['stack', /tech(nology)?[- ]?stack|what (tech|framework|language|library|cms)|built (with|on|using)|which (framework|language|cms)|detect.*(stack|framework|technolog)|stack (used|detection)|\b(react|laravel|vue|angular|django|wordpress|rails|next\.?js)\b/],
  ['architecture', /architect|system design|c4\b|infrastructure|microservice|monolith|data ?flow|deployment diagram|solution design|blueprint/],
  ['data-model', /data ?model|schema|database|\btables?\b|entities|\berd\b|columns/],
  ['api', /\bapis?\b|endpoints?|\brest\b|graphql|network (calls|requests)/],
  ['workflows', /workflows?|business process|user journey|steps to|how (does|do) .{0,40} work|process flow/],
  ['forms', /\bforms?\b|\bfields?\b|validation|inputs?\b/],
  ['suggestions', /improv|suggest|recommend|weakness|audit|issues|optimi[sz]e|what (is|s) wrong|review (the )?(ui|ux|app)/],
  ['docs', /document|\bdocs?\b|user guide|manual|handover|hand-over|overview|write ?up|report for (the )?client/],
  ['repo', /\brepo(sitory)?\b|codebase|source code|local (folder|project)|\bfolder\b/],
  ['discover', /compare|top \d+|best \d+|alternatives?|competitors?|marketplace|codecanyon|themeforest|find (me )?(a |some )?(demo|product|system)|demo (account|credentials|login)/],
  ['full', /everything|entire (app|application|site)|complete research|full research|end[- ]to[- ]end research|research (it|the app) fully/],
];

// "no screenshots", "without the architecture or data model", "skip docs": whatever follows is excluded.
const NEG = /\b(?:no|without|skip|excluding|exclude|not|don'?t (?:need|want)|do not (?:need|want))\s+(?:the\s+)?(?:[\w-]+\s+){0,2}[\w-]+/g;

const matchFacets = (t) => RULES.filter(([, re]) => re.test(t)).map(([f]) => f);

/** Pure. @returns {{facets:string[], explicit:boolean, excluded:string[]}} */
export function detectFacets(text = '') {
  const lower = String(text).toLowerCase();
  const excluded = new Set(matchFacets((lower.match(NEG) || []).join(' ; ')));
  const found = matchFacets(lower.replace(NEG, ' ')).filter((f) => !excluded.has(f));
  const set = new Set(found);
  const pull = (...fs) => fs.forEach((f) => !excluded.has(f) && set.add(f));
  if (set.has('architecture')) pull('data-model', 'api', 'stack'); // an architecture needs its inputs
  if (set.has('suggestions')) pull('ui', 'stack'); // suggestions are computed from those measurements
  if (set.has('data-model') && !set.has('forms')) pull('forms');
  const crawling = ['screenshots', 'ui', 'stack', 'forms', 'workflows', 'data-model', 'api', 'architecture', 'suggestions', 'docs', 'full'].some((f) => set.has(f));
  if (crawling && !set.has('repo') && !set.has('discover')) set.add('routes');
  if (set.has('full')) return { facets: ['full'], explicit: true, excluded: [...excluded] };
  return { facets: [...set], explicit: found.length > 0, excluded: [...excluded] };
}

const PROFILE_FOR = (facets) => (facets.includes('full') ? 'standard' : facets.length <= 3 ? 'quick' : 'standard');

/**
 * Minimum plan for a set of facets. `skipped` documents what will NOT be done, so the user can add it.
 */
export function planFor(facets, { target = '<url>', app = '<AppName>', hasAuth = false, excluded = [] } = {}) {
  const want = (f) => facets.includes('full') || facets.includes(f);
  const commands = [];
  const crawl = ['routes', 'screenshots', 'ui', 'stack', 'forms', 'workflows', 'data-model', 'api', 'architecture', 'suggestions', 'docs', 'full'].some((f) => facets.includes(f));
  const roles = new Set();
  const outputs = [];
  if (crawl) {
    const focus = facets.filter((f) => f !== 'routes').join(',') || 'routes';
    commands.push(`init "${app}" --url ${target}${hasAuth ? ' --username-env APP_USER --password-env APP_PASS' : ''} --focus ${focus} --profile ${PROFILE_FOR(facets)}`);
    commands.push(`crawl "${app}"`);
    commands.push(`report "${app}"`);
    roles.add('browser-reconnaissance');
  }
  if (want('ui')) { outputs.push('docs/technicals/design-system-observed.md', 'docs/technicals/design-tokens.json', 'docs/ui-patterns.md'); roles.add('ui-researcher'); }
  if (want('stack')) { outputs.push('docs/technicals/tech-stack.md'); roles.add('tech-stack-analyst'); }
  if (want('screenshots')) outputs.push('screenshots/ (all, modules, interactions) + dashboard.html gallery');
  if (want('forms')) outputs.push('docs/forms-and-fields/*.md');
  if (want('workflows')) { outputs.push('docs/workflows/*.md'); roles.add('workflow-analyst'); }
  if (want('api')) outputs.push('docs/technicals/api-observed.md');
  if (want('data-model') || want('architecture')) { commands.push(`architect "${app}"`); outputs.push('docs/technicals/proposed-schema.md (PROPOSED)'); roles.add('solution-architect'); }
  if (want('architecture')) outputs.push('docs/technicals/architecture-proposal.md');
  if (want('suggestions')) { commands.push(`suggest "${app}"`); outputs.push('reports/suggestions.md'); roles.add('improvement-suggester'); }
  if (want('docs')) { outputs.push('docs/product-overview.md', 'docs/user-guide.md', 'docs/modules/*.md'); roles.add('documentation-engineer'); }
  if (facets.includes('repo')) { commands.push('repo-scan <path> --name "' + app + '"'); outputs.push('docs/repo/*.md'); roles.add('repo-analyst'); }
  if (facets.includes('discover')) { commands.push('discover-queries "<topic>"', 'demo-probe <url>', 'demo-login <probe.json> --save-to "' + app + '"'); roles.add('product-discovery'); roles.add('demo-access-researcher'); }
  if (crawl || facets.includes('repo')) commands.push(`deliver "${app}"   # only when the user wants client-ready docs in the project root`);
  const all = ['screenshots', 'ui', 'stack', 'architecture', 'suggestions', 'workflows', 'docs'];
  const skipped = facets.includes('full') ? [] : all.filter((f) => !facets.includes(f)).map((f) => `${f}: ${excluded.includes(f) ? 'excluded by the user' : 'not requested'}`);
  return { profile: PROFILE_FOR(facets), commands, outputs: [...new Set(outputs)], roles: [...roles], skipped };
}

/** Questions that are still worth asking, in priority order. Ask them together, once. */
export function missingQuestions(text, facets, { hasTarget }) {
  const q = [];
  const t = String(text).toLowerCase();
  if (!hasTarget && !facets.includes('discover')) q.push({ id: 'target', ask: 'Which app (URL) or local folder should I research?' });
  if (!facets.length) q.push({ id: 'goal', ask: 'What do you need from this research?', options: ['UI/theme (colours, fonts, components)', 'Technology stack', 'Screenshots', 'Architecture proposal / data model', 'Workflows and documentation', 'Improvement suggestions', 'Everything'] });
  if (/login|log in|credential|admin|dashboard|account|password/.test(t) || (hasTarget && /\/admin|app\./.test(t))) q.push({ id: 'access', ask: 'Does it need a login? If yes, I will use environment variables (never paste a password in chat). Is it a throwaway demo/sandbox or production? (production stays read-only)' });
  if (facets.includes('architecture') && !/(laravel|node|django|rails|spring|\.net|next|nest|go|rust)/.test(t)) q.push({ id: 'target-stack', ask: 'Which stack should the proposed architecture target (for example Laravel, Node/Nest, Django, Rails, .NET, or "recommend one")?' });
  if (facets.some((f) => ['docs', 'architecture', 'full'].includes(f))) q.push({ id: 'audience', ask: 'Who will read the documentation (client/business owner, designer, developers, AI coding agent)?' });
  return q;
}

export function analyzeRequest(text, { hasTarget = /https?:\/\/|\.[a-z]{2,}\b|[\\/][\w.-]+/i.test(text), app, target } = {}) {
  const { facets, explicit, excluded } = detectFacets(text);
  return { facets, explicit, excluded, plan: planFor(facets, { app, target, excluded }), questions: missingQuestions(text, facets, { hasTarget }) };
}
