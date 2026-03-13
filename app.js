/* ===== MCIPD Explorer — Single-Page Application ===== */

const state = {
  sections: null,    // from sections.json (document structure with parts)
  clauses: null,     // keyed by id from index.json
  requirements: null,
  evidence: null,
  controls: null,     // { domains, library, clauseMap }
  artifacts: null,    // { inventory, clauseMap }
  crossRefs: null,
  route: { view: 'overview' },
};

const cache = new Map();

function renderFetchError(el, url, error) {
  el.innerHTML = '<div class="fetch-error">' +
    '<h2>Failed to load data</h2>' +
    '<p>Could not fetch <strong>' + esc(url) + '</strong></p>' +
    (error ? '<p class="error-detail">' + esc(String(error)) + '</p>' : '') +
    '<button onclick="location.reload()">Retry</button>' +
    '</div>';
}

async function fetchJSON(path) {
  if (cache.has(path)) return cache.get(path);
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    cache.set(path, data);
    return data;
  } catch (e) {
    console.error('Failed to load ' + path + ':', e);
    return null;
  }
}

/* ===== ROUTING ===== */
function navigate(hash) {
  location.hash = '#' + hash;
}

function parseRoute() {
  const hash = location.hash.slice(1) || '';
  if (!hash || hash === 'overview') return { view: 'overview' };
  if (hash.startsWith('search/')) return { view: 'search', query: decodeURIComponent(hash.slice(7)) };
  if (hash === 'framework') return { view: 'framework' };
  if (hash.startsWith('framework/')) return { view: 'framework-detail', id: hash.slice(10) };
  if (hash.startsWith('section/')) return { view: 'section-detail', id: hash.slice(8) };
  if (hash.startsWith('clause/')) return { view: 'clause', id: hash.slice(7) };
  if (hash === 'controls') return { view: 'controls' };
  if (hash.startsWith('control/')) return { view: 'control-detail', slug: hash.slice(8) };
  if (hash === 'risk') return { view: 'risk' };
  if (hash.startsWith('risk/')) return { view: 'risk', sub: hash.slice(5) };
  if (hash === 'reference') return { view: 'reference' };
  if (hash.startsWith('reference/')) return { view: 'reference', sub: hash.slice(10) };
  return { view: 'overview' };
}

/* ===== INIT ===== */
async function init() {
  const [sectionsData, clausesArr] = await Promise.all([
    fetchJSON('clauses/sections.json'),
    fetchJSON('clauses/index.json'),
  ]);
  state.sections = sectionsData || {};
  state.clauses = {};
  if (clausesArr) {
    for (const c of clausesArr) state.clauses[c.id] = c;
  }
  window.addEventListener('hashchange', render);
  document.addEventListener('click', handleClick);
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.addEventListener('input', debounce(handleSearch, 300));
  render();
}

function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

/* ===== RENDER DISPATCHER ===== */
function render() {
  state.route = parseRoute();
  const app = document.getElementById('app');
  updateNav();
  switch (state.route.view) {
    case 'overview': renderOverview(app); break;
    case 'framework': renderFramework(app); break;
    case 'framework-detail': renderPart(app, state.route.id); break;
    case 'section-detail': renderSectionDetail(app, state.route.id); break;
    case 'clause': renderClause(app, state.route.id); break;
    case 'controls': renderControls(app); break;
    case 'control-detail': renderControlDetail(app, state.route.slug); break;
    case 'risk': renderRiskManagement(app); break;
    case 'reference': renderReference(app); break;
    case 'search': renderSearch(app, state.route.query); break;
    default: renderOverview(app);
  }
  window.scrollTo(0, 0);
}

function updateNav() {
  const rv = state.route.view;
  document.querySelectorAll('.nav-link').forEach(function(el) {
    const view = el.dataset.view;
    let active = false;
    switch (view) {
      case 'overview': active = rv === 'overview'; break;
      case 'framework': active = rv === 'framework' || rv === 'framework-detail' || rv === 'section-detail' || rv === 'clause'; break;
      case 'controls': active = rv === 'controls' || rv === 'control-detail'; break;
      case 'risk': active = rv === 'risk'; break;
      case 'reference': active = rv === 'reference'; break;
    }
    el.classList.toggle('active', active);
  });
}

/* ===== OVERVIEW ===== */
function renderOverview(el) {
  const totalClauses = Object.keys(state.clauses).length;
  const parts = (state.sections && state.sections.parts) || [];
  const sections = (state.sections && state.sections.sections) || [];
  const standardClauses = Object.values(state.clauses).filter(function(c) { return c.marker === 'S'; }).length;
  const guidanceClauses = Object.values(state.clauses).filter(function(c) { return c.marker === 'G'; }).length;

  el.innerHTML =
    '<div class="disclaimer">' +
      'This database is for educational and indicative purposes only. It does not constitute legal or regulatory advice. The content represents a structured interpretation of BNM\'s Management of Customer Information and Permitted Disclosures policy document (BNM/RH/PD 028-65). Always consult the official BNM policy document and qualified compliance counsel for regulatory decisions.' +
    '</div>' +
    '<div class="stats-banner">' +
      '<div class="stat-card"><div class="stat-number">' + totalClauses + '</div><div class="stat-label">Clauses</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + sections.length + '</div><div class="stat-label">Sections</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + parts.length + '</div><div class="stat-label">Parts</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + standardClauses + '</div><div class="stat-label">Standard (S)</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + guidanceClauses + '</div><div class="stat-label">Guidance (G)</div></div>' +
      '<div class="stat-card"><div class="stat-number">12</div><div class="stat-label">Control Domains</div></div>' +
    '</div>' +
    '<h2 style="font-size:1.125rem;font-weight:600;margin-bottom:1rem;">Browse by Part</h2>' +
    '<div class="control-grid">' +
      parts.map(function(p) {
        var partSections = sections.filter(function(s) { return s.part === p.id; });
        var partClauses = 0;
        partSections.forEach(function(s) { partClauses += (s.clauseCount || 0); });
        return '<a href="#framework/' + p.id + '" class="control-card" data-part="' + p.id + '" style="text-decoration:none;color:inherit;display:block;border-left:4px solid var(--accent);">' +
          '<div class="control-id">Part ' + esc(p.id) + '</div>' +
          '<h3 class="control-card-title">' + esc(p.title) + '</h3>' +
          '<p class="control-card-desc">' + esc(p.applicability || '') + '</p>' +
          '<div class="control-card-meta">' +
            '<span class="badge badge-category">' + partSections.length + ' sections</span>' +
            '<span class="badge badge-evidence">' + partClauses + ' clauses</span>' +
          '</div>' +
        '</a>';
      }).join('') +
    '</div>';
}

/* ===== FRAMEWORK VIEW ===== */
function renderFramework(el) {
  var parts = (state.sections && state.sections.parts) || [];
  var sections = (state.sections && state.sections.sections) || [];
  var totalClauses = Object.keys(state.clauses).length;

  el.innerHTML =
    '<div class="page-title">MCIPD Framework</div>' +
    '<div class="page-subtitle">Management of Customer Information and Permitted Disclosures — ' + parts.length + ' Parts, ' + sections.length + ' Sections, ' + totalClauses + ' Clauses</div>' +
    '<div class="control-grid">' +
      parts.map(function(p) {
        var partSections = sections.filter(function(s) { return s.part === p.id; });
        return '<a href="#framework/' + p.id + '" class="control-card" data-part="' + p.id + '" style="text-decoration:none;color:inherit;display:block;border-left:4px solid var(--accent);">' +
          '<div class="control-id">Part ' + esc(p.id) + '</div>' +
          '<h3 class="control-card-title">' + esc(p.title) + '</h3>' +
          '<p class="control-card-desc">' + esc(p.applicability || p.pageRange || '') + '</p>' +
          '<div class="control-card-meta"><span class="badge badge-category">' + partSections.length + ' sections</span></div>' +
        '</a>';
      }).join('') +
    '</div>';
}

/* ===== PART VIEW ===== */
function renderPart(el, partId) {
  var parts = (state.sections && state.sections.parts) || [];
  var part = parts.find(function(p) { return p.id === partId; });
  if (!part) return renderNotFound(el);

  var sections = (state.sections && state.sections.sections) || [];
  var partSections = sections.filter(function(s) { return s.part === partId; });

  el.innerHTML =
    '<div class="breadcrumbs"><a href="#framework">Framework</a><span class="sep">/</span><span class="current">Part ' + esc(partId) + '</span></div>' +
    '<div class="page-title">Part ' + esc(partId) + ': ' + esc(part.title) + '</div>' +
    '<div class="page-subtitle">' + esc(part.applicability || '') + ' &middot; ' + partSections.length + ' sections</div>' +
    '<div class="accordion">' +
      partSections.map(function(sec) {
        var sectionClauses = Object.values(state.clauses).filter(function(c) { return c.section === sec.id; });
        var subsectionsHTML = '';
        if (sec.subsections && sec.subsections.length) {
          subsectionsHTML = '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;padding-left:0.5rem;">' +
            sec.subsections.map(function(sub) { return '<span class="badge badge-category" style="margin:0.125rem;">' + esc(sub) + '</span>'; }).join('') +
          '</div>';
        }
        return '<div class="accordion-item open">' +
          '<button class="accordion-trigger" data-accordion>' +
            '<span>S' + esc(sec.id) + ': ' + esc(sec.title) + ' (' + sectionClauses.length + ' clauses)</span>' +
            '<span class="chevron">&#9654;</span>' +
          '</button>' +
          '<div class="accordion-content">' +
            subsectionsHTML +
            sectionClauses.sort(function(a, b) { return parseFloat(a.id) - parseFloat(b.id); }).map(function(c) {
              return '<a href="#clause/' + c.id + '" class="section-link">' +
                '<span class="section-link-id">' + esc(c.id) + '</span>' +
                '<span class="section-link-title">' + esc((c.verbatim || '').slice(0, 120)) + (c.verbatim && c.verbatim.length > 120 ? '…' : '') + '</span>' +
                '<span class="section-link-badges">' +
                  markerBadge(c.marker) +
                '</span>' +
              '</a>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
}

/* ===== SECTION DETAIL (shows all clauses in a section) ===== */
function renderSectionDetail(el, sectionId) {
  var sections = (state.sections && state.sections.sections) || [];
  var sec = sections.find(function(s) { return s.id === sectionId; });
  if (!sec) return renderNotFound(el);

  var sectionClauses = Object.values(state.clauses).filter(function(c) { return c.section === sectionId; })
    .sort(function(a, b) { return parseFloat(a.id) - parseFloat(b.id); });

  el.innerHTML =
    '<div class="breadcrumbs">' +
      '<a href="#framework">Framework</a><span class="sep">/</span>' +
      '<a href="#framework/' + esc(sec.part) + '">Part ' + esc(sec.part) + '</a><span class="sep">/</span>' +
      '<span class="current">S' + esc(sectionId) + '</span>' +
    '</div>' +
    '<div class="page-title">Section ' + esc(sectionId) + ': ' + esc(sec.title) + '</div>' +
    '<div class="page-subtitle">Part ' + esc(sec.part) + ' &middot; ' + sectionClauses.length + ' clauses</div>' +
    sectionClauses.map(function(c) {
      return '<div class="card">' +
        '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">' +
          '<a href="#clause/' + c.id + '" style="font-family:var(--font-mono);font-size:0.875rem;color:var(--accent);font-weight:600;text-decoration:none;">' + esc(c.id) + '</a>' +
          markerBadge(c.marker) +
        '</div>' +
        '<div class="verbatim-block">' + esc(c.verbatim) + '</div>' +
        '<div class="block-label">Plain-Language Translation <span class="badge badge-ai" title="AI-generated interpretation — not authoritative regulatory text">AI Generated</span></div>' +
        '<div class="translation-block">' + esc(c.translation) + '</div>' +
        (c.keywords && c.keywords.length ? '<div style="display:flex;gap:0.375rem;flex-wrap:wrap;">' + c.keywords.map(function(k) { return '<span class="badge badge-category">' + esc(k) + '</span>'; }).join('') + '</div>' : '') +
      '</div>';
    }).join('');
}

/* ===== CLAUSE DETAIL ===== */
function renderClause(el, clauseId) {
  var c = state.clauses[clauseId];
  if (!c) return renderNotFound(el);

  var sections = (state.sections && state.sections.sections) || [];
  var sec = sections.find(function(s) { return s.id === c.section; });

  el.innerHTML =
    '<div class="breadcrumbs">' +
      '<a href="#framework">Framework</a><span class="sep">/</span>' +
      '<a href="#framework/' + esc(c.part) + '">Part ' + esc(c.part) + '</a><span class="sep">/</span>' +
      '<a href="#section/' + esc(c.section) + '">S' + esc(c.section) + (sec ? ': ' + esc(sec.title) : '') + '</a><span class="sep">/</span>' +
      '<span class="current">' + esc(c.id) + '</span>' +
    '</div>' +
    '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.25rem;">' +
      '<span style="font-family:var(--font-mono);font-size:1rem;color:var(--accent);font-weight:600;">' + esc(c.id) + '</span>' +
      markerBadge(c.marker) +
    '</div>' +
    '<div class="page-title">' + esc(c.sectionTitle || (sec ? sec.title : '')) + '</div>' +
    '<div class="page-subtitle">Part ' + esc(c.part) + ', Section ' + esc(c.section) + (c.subsection ? ' — ' + esc(c.subsection) : '') + '</div>' +

    '<div class="tabs">' +
      '<button class="tab-btn active" data-tab="overview">Overview</button>' +
      '<button class="tab-btn" data-tab="requirements">Requirements</button>' +
      '<button class="tab-btn" data-tab="evidence">Evidence</button>' +
      '<button class="tab-btn" data-tab="controls">Controls</button>' +
      '<button class="tab-btn" data-tab="artifacts">Artifacts</button>' +
    '</div>' +

    '<div class="tab-panel active" id="tab-overview">' +
      '<div class="block-label">Verbatim Text</div>' +
      '<div class="verbatim-block">' + esc(c.verbatim) + '</div>' +
      '<div class="block-label">Plain-Language Translation <span class="badge badge-ai" title="AI-generated interpretation — not authoritative regulatory text">AI Generated</span></div>' +
      '<div class="translation-block">' + esc(c.translation) + '</div>' +
      (c.keywords && c.keywords.length ?
        '<div style="margin-top:1rem;">' +
          '<div class="block-label">Keywords</div>' +
          '<div style="display:flex;gap:0.375rem;flex-wrap:wrap;">' +
            c.keywords.map(function(k) { return '<span class="badge badge-category">' + esc(k) + '</span>'; }).join('') +
          '</div>' +
        '</div>' : '') +
    '</div>' +
    '<div class="tab-panel" id="tab-requirements"><div class="loading"><div class="spinner"></div><span>Loading requirements…</span></div></div>' +
    '<div class="tab-panel" id="tab-evidence"><div class="loading"><div class="spinner"></div><span>Loading evidence…</span></div></div>' +
    '<div class="tab-panel" id="tab-controls"><div class="loading"><div class="spinner"></div><span>Loading controls…</span></div></div>' +
    '<div class="tab-panel" id="tab-artifacts"><div class="loading"><div class="spinner"></div><span>Loading artifacts…</span></div></div>';
}

/* ===== TAB ACTIVATION ===== */
async function activateTab(tabName, clauseId) {
  var panel = document.getElementById('tab-' + tabName);
  if (!panel) return;
  if (panel.dataset.loaded) return;

  if (tabName === 'requirements') {
    if (!state.requirements) {
      state.requirements = await fetchJSON('requirements/index.json') || {};
    }
    var req = state.requirements[clauseId];
    if (!req) {
      panel.innerHTML = '<div class="empty-state"><div class="empty-state-text">No requirements data for this clause.</div></div>';
    } else {
      panel.innerHTML = renderRequirementsPanel(req);
    }
  } else if (tabName === 'evidence') {
    if (!state.evidence) {
      state.evidence = await fetchJSON('evidence/index.json') || {};
    }
    var ev = state.evidence[clauseId];
    if (!ev) {
      panel.innerHTML = '<div class="empty-state"><div class="empty-state-text">No evidence data for this clause.</div></div>';
    } else {
      panel.innerHTML = renderEvidencePanel(ev);
    }
  } else if (tabName === 'controls') {
    await ensureControls();
    var slugs = (state.controls.clauseMap.clauseToControls && state.controls.clauseMap.clauseToControls[clauseId]) || [];
    if (!slugs.length) {
      panel.innerHTML = '<div class="empty-state"><div class="empty-state-text">No controls mapped to this clause.</div></div>';
    } else {
      var controls = findControlsBySlugs(slugs);
      panel.innerHTML = controls.map(function(c) { return renderControlCard(c); }).join('');
    }
  } else if (tabName === 'artifacts') {
    await ensureArtifacts();
    var artSlugs = (state.artifacts.clauseMap.clauseToArtifacts && state.artifacts.clauseMap.clauseToArtifacts[clauseId]) || [];
    if (!artSlugs.length) {
      panel.innerHTML = '<div class="empty-state"><div class="empty-state-text">No artifacts mapped to this clause.</div></div>';
    } else {
      var arts = findArtifactsBySlugs(artSlugs);
      panel.innerHTML = arts.map(function(a) { return renderArtifactCard(a); }).join('');
    }
  }
  panel.dataset.loaded = 'true';
}

/* ===== DATA HELPERS ===== */
async function ensureControls() {
  if (!state.controls) {
    var results = await Promise.all([
      fetchJSON('controls/domains.json'),
      fetchJSON('controls/library.json'),
      fetchJSON('controls/clause-map.json'),
    ]);
    var domains = results[0] || {};
    var library = results[1];
    var clauseMap = results[2] || {};
    // Remove _meta from domains
    var cleanDomains = {};
    Object.keys(domains).forEach(function(k) { if (k !== '_meta') cleanDomains[k] = domains[k]; });
    state.controls = { domains: cleanDomains, library: normalizeControlsLibrary(library), clauseMap: clauseMap };
  }
}

async function ensureArtifacts() {
  if (!state.artifacts) {
    var results = await Promise.all([
      fetchJSON('artifacts/inventory.json'),
      fetchJSON('artifacts/clause-map.json'),
    ]);
    state.artifacts = { inventory: results[0] || {}, clauseMap: results[1] || {} };
  }
}

function normalizeControlsLibrary(library) {
  if (library && library.controls && Array.isArray(library.controls)) {
    var grouped = {};
    for (var i = 0; i < library.controls.length; i++) {
      var c = library.controls[i];
      var d = c.domain || 'uncategorized';
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(c);
    }
    return grouped;
  }
  return library || {};
}

function findControlsBySlugs(slugs) {
  var controls = [];
  if (!state.controls || !state.controls.library) return controls;
  Object.values(state.controls.library).forEach(function(ctrls) {
    ctrls.forEach(function(c) {
      if (slugs.indexOf(c.slug) !== -1) controls.push(c);
    });
  });
  return controls;
}

function findArtifactsBySlugs(slugs) {
  var arts = [];
  if (!state.artifacts || !state.artifacts.inventory) return arts;
  Object.values(state.artifacts.inventory).forEach(function(items) {
    if (Array.isArray(items)) {
      items.forEach(function(a) {
        if (slugs.indexOf(a.slug) !== -1) arts.push(a);
      });
    }
  });
  return arts;
}

/* ===== REQUIREMENTS PANEL ===== */
function renderRequirementsPanel(req) {
  var cols = ['business', 'technology', 'governance'];
  var colLabels = { business: 'Business / Compliance', technology: 'Technology / Operational', governance: 'Governance' };

  return '<div class="req-columns">' +
    cols.map(function(col) {
      var data = req[col];
      if (!data) return '<div class="req-column"><div class="req-column-header ' + col + '">' + colLabels[col] + '</div><div class="req-column-body"><em style="color:var(--text-muted);font-size:0.8125rem;">No data</em></div></div>';
      return '<div class="req-column">' +
        '<div class="req-column-header ' + col + '">' + colLabels[col] + '</div>' +
        '<div class="req-column-body">' +
          '<p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem;">' + esc(data.summary) + ' <span class="badge badge-ai" title="AI-generated interpretive summary">AI Generated</span></p>' +
          (data.requirements || []).map(function(r) {
            return '<div class="req-item">' +
              '<div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:wrap;">' +
                '<span class="req-item-id">' + esc(r.id) + '</span>' +
              '</div>' +
              '<div class="req-item-text">' + esc(r.requirement) + '</div>' +
              '<div class="req-item-meta">' +
                '<span class="req-item-priority priority-' + (r.priority || '').toLowerCase() + '">' + esc(r.priority || '') + '</span>' +
                '<span>' + esc(r.owner || '') + '</span>' +
                '<span>' + esc(r.frequency || '') + '</span>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

/* ===== EVIDENCE PANEL ===== */
function renderEvidencePanel(ev) {
  return (ev.auditorFocus ?
    '<div class="auditor-focus">' +
      '<div class="block-label">BNM Examiner Focus <span class="badge badge-ai" title="AI-generated interpretation — verify against official BNM guidance">AI Generated</span></div>' +
      esc(ev.auditorFocus) +
    '</div>' : '') +
    (ev.evidenceItems || []).map(function(item) {
      return '<div class="card evidence-card">' +
        '<div class="card-title">' + esc(item.name) + '</div>' +
        '<div class="card-meta">' +
          '<span>' + esc(item.format || '') + '</span>' +
          '<span>Retain: ' + esc(item.retentionPeriod || 'N/A') + '</span>' +
        '</div>' +
        '<div class="card-body">' + esc(item.description || '') + '</div>' +
        (item.whatGoodLooksLike && item.whatGoodLooksLike.length ?
          '<div class="block-label" style="margin-top:0.75rem;">What Good Looks Like <span class="badge badge-example" title="AI-generated illustrative examples">Example</span></div>' +
          '<ul class="good-list">' + item.whatGoodLooksLike.map(function(g) { return '<li><span>' + esc(g) + '</span></li>'; }).join('') + '</ul>' : '') +
        (item.commonGaps && item.commonGaps.length ?
          '<div class="block-label" style="margin-top:0.5rem;">Common Gaps <span class="badge badge-example" title="AI-generated illustrative examples">Example</span></div>' +
          '<ul class="gap-list">' + item.commonGaps.map(function(g) { return '<li><span>' + esc(g) + '</span></li>'; }).join('') + '</ul>' : '') +
        (item.suggestedSources && item.suggestedSources.length ?
          '<div class="block-label" style="margin-top:0.5rem;">Suggested Sources</div>' +
          '<div style="font-size:0.8125rem;color:var(--text-secondary);">' + item.suggestedSources.map(function(s) { return esc(s); }).join(' &middot; ') + '</div>' : '') +
      '</div>';
    }).join('') +
    (ev.auditTips && ev.auditTips.length ?
      '<div class="card">' +
        '<div class="card-title">Audit Preparation Tips <span class="badge badge-ai" title="AI-generated guidance">AI Generated</span></div>' +
        '<ul style="padding-left:1.25rem;font-size:0.8125rem;color:var(--text-secondary);">' +
          ev.auditTips.map(function(t) { return '<li style="margin-bottom:0.25rem;">' + esc(t) + '</li>'; }).join('') +
        '</ul>' +
      '</div>' : '');
}

/* ===== CONTROL CARD ===== */
function renderControlCard(c) {
  return '<div class="control-card">' +
    '<div class="control-card-header">' +
      '<div><div class="control-card-name"><a href="#control/' + c.slug + '" style="color:inherit;text-decoration:none;">' + esc(c.name) + '</a></div></div>' +
      '<div style="display:flex;gap:0.375rem;">' +
        '<span class="badge badge-type">' + esc(c.type || '') + '</span>' +
        '<span class="badge badge-layer">' + esc(c.layer || '') + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="control-card-desc">' + esc(c.description) + '</div>' +
    (c.keyActivities && c.keyActivities.length ?
      '<ul class="control-activities">' + c.keyActivities.map(function(a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
    (c.maturity ?
      '<div class="maturity-grid">' +
        '<div class="maturity-card maturity-basic"><div class="maturity-label">Basic</div><p>' + esc(c.maturity.basic || '') + '</p></div>' +
        '<div class="maturity-card maturity-mature"><div class="maturity-label">Mature</div><p>' + esc(c.maturity.mature || '') + '</p></div>' +
        '<div class="maturity-card maturity-advanced"><div class="maturity-label">Advanced</div><p>' + esc(c.maturity.advanced || '') + '</p></div>' +
      '</div>' : '') +
    '<div class="control-frameworks">' +
      (c.nist || []).map(function(r) { return '<span class="badge badge-domain">NIST ' + esc(r) + '</span>'; }).join('') +
      (c.iso27001 || []).map(function(r) { return '<span class="badge badge-type">ISO ' + esc(r) + '</span>'; }).join('') +
    '</div>' +
  '</div>';
}

/* ===== ARTIFACT CARD ===== */
function renderArtifactCard(a) {
  return '<div class="artifact-card">' +
    '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">' +
      '<span class="artifact-card-name">' + esc(a.name) + '</span>' +
      (a.mandatory ? '<span class="badge badge-mandatory">Mandatory</span>' : '') +
      '<span class="badge badge-category">' + esc(a.category) + '</span>' +
    '</div>' +
    '<div class="artifact-card-desc">' + esc(a.description) + '</div>' +
    '<div class="card-meta">' +
      '<span>Owner: ' + esc(a.owner || 'N/A') + '</span>' +
      '<span>Review: ' + esc(a.reviewFrequency || 'N/A') + '</span>' +
      '<span>Format: ' + esc(a.format || 'N/A') + '</span>' +
    '</div>' +
    (a.keyContents && a.keyContents.length ?
      '<ul class="artifact-contents">' + a.keyContents.map(function(k) { return '<li>' + esc(k) + '</li>'; }).join('') + '</ul>' : '') +
  '</div>';
}

/* ===== CONTROLS BROWSER ===== */
async function renderControls(el) {
  await ensureControls();
  var totalControls = 0;
  Object.values(state.controls.library).forEach(function(arr) { totalControls += arr.length; });
  var domainEntries = Object.entries(state.controls.domains);

  el.innerHTML =
    '<div class="page-title">Controls Library</div>' +
    '<div class="page-subtitle">' + totalControls + ' controls across ' + domainEntries.length + ' domains</div>' +
    '<div class="accordion" id="controls-accordion">' +
      domainEntries.map(function(entry) {
        var key = entry[0];
        var domain = entry[1];
        var controls = state.controls.library[key] || [];
        return '<div class="accordion-item">' +
          '<button class="accordion-trigger" data-accordion>' +
            '<span>' + esc(domain.name) + ' (' + controls.length + ')</span>' +
            '<span class="chevron">&#9654;</span>' +
          '</button>' +
          '<div class="accordion-content">' +
            '<p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem;">' + esc(domain.description) + '</p>' +
            controls.map(function(c) {
              return '<a href="#control/' + c.slug + '" class="section-link">' +
                '<span class="section-link-title">' + esc(c.name) + '</span>' +
                '<span class="section-link-badges">' +
                  '<span class="badge badge-type">' + esc(c.type) + '</span>' +
                  '<span class="badge badge-layer">' + esc(c.layer || '') + '</span>' +
                '</span>' +
              '</a>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
}

/* ===== CONTROL DETAIL ===== */
async function renderControlDetail(el, slug) {
  await ensureControls();
  await ensureArtifacts();
  if (!state.evidence) {
    state.evidence = await fetchJSON('evidence/index.json') || {};
  }
  if (!state.requirements) {
    state.requirements = await fetchJSON('requirements/index.json') || {};
  }

  var control = null;
  Object.values(state.controls.library).forEach(function(ctrls) {
    if (!control) {
      var found = ctrls.find(function(c) { return c.slug === slug; });
      if (found) control = found;
    }
  });
  if (!control) return renderNotFound(el);

  var domain = state.controls.domains[control.domain] || {};
  var controlClauses = control.clauses || [];

  // Resolve linked artifacts via clauseMap
  var artifactIndex = {};
  Object.values(state.artifacts.inventory).forEach(function(arr) {
    if (Array.isArray(arr)) arr.forEach(function(a) { artifactIndex[a.slug] = a; });
  });
  var linkedArtifactSlugs = new Set();
  controlClauses.forEach(function(cid) {
    var arts = (state.artifacts.clauseMap.clauseToArtifacts && state.artifacts.clauseMap.clauseToArtifacts[cid]) || [];
    arts.forEach(function(s) { linkedArtifactSlugs.add(s); });
  });
  var linkedArtifacts = [];
  linkedArtifactSlugs.forEach(function(s) { if (artifactIndex[s]) linkedArtifacts.push(artifactIndex[s]); });
  linkedArtifacts.sort(function(a, b) { return (b.mandatory ? 1 : 0) - (a.mandatory ? 1 : 0); });

  // Resolve evidence
  var linkedEvidence = [];
  controlClauses.forEach(function(cid) {
    var ev = state.evidence[cid];
    if (ev && ev.evidenceItems) {
      ev.evidenceItems.forEach(function(item) {
        if (!linkedEvidence.find(function(e) { return e.id === item.id; })) {
          linkedEvidence.push(item);
        }
      });
    }
  });

  // Build Requirements
  var businessReqs = [], technologyReqs = [], governanceReqs = [];
  controlClauses.forEach(function(cid) {
    var req = state.requirements[cid];
    if (!req) return;
    if (req.business && req.business.requirements) businessReqs = businessReqs.concat(req.business.requirements);
    if (req.technology && req.technology.requirements) technologyReqs = technologyReqs.concat(req.technology.requirements);
    if (req.governance && req.governance.requirements) governanceReqs = governanceReqs.concat(req.governance.requirements);
  });
  var hasRequirements = businessReqs.length || technologyReqs.length || governanceReqs.length;

  // Framework mappings
  var fwMappings = [];
  if (controlClauses.length) fwMappings.push({ label: 'MCIPD Clauses', codes: controlClauses.join(', ') });
  if (control.nist && control.nist.length) fwMappings.push({ label: 'NIST CSF', codes: control.nist.join(', ') });
  if (control.iso27001 && control.iso27001.length) fwMappings.push({ label: 'ISO 27001', codes: control.iso27001.join(', ') });

  // Audit Package
  var auditPackageHTML = '';
  if (linkedArtifacts.length || linkedEvidence.length) {
    auditPackageHTML =
      '<section class="audit-package">' +
        '<h2 class="audit-package-title">Audit Package ' +
          '<span class="audit-package-counts">' +
            '<span class="badge badge-evidence">' + linkedEvidence.length + ' evidence item' + (linkedEvidence.length !== 1 ? 's' : '') + '</span>' +
            '<span class="badge badge-artifacts">' + linkedArtifacts.length + ' artifact' + (linkedArtifacts.length !== 1 ? 's' : '') + '</span>' +
          '</span>' +
        '</h2>' +
        (linkedEvidence.length ?
          '<div class="accordion"><div class="accordion-item">' +
            '<button class="accordion-trigger" aria-expanded="true"><span>Evidence Checklist (' + linkedEvidence.length + ')</span><span class="accordion-icon">&#9660;</span></button>' +
            '<div class="accordion-content" role="region">' +
              linkedEvidence.map(function(item) {
                return '<div class="evidence-item">' +
                  '<div class="evidence-item-header">' +
                    (item.id ? '<span class="evidence-id">' + esc(item.id) + '</span>' : '') +
                    '<span class="evidence-item-name">' + esc(item.name) + '</span>' +
                  '</div>' +
                  '<p class="evidence-item-desc">' + esc(item.description) + '</p>' +
                  ((item.whatGoodLooksLike && item.whatGoodLooksLike.length) || (item.commonGaps && item.commonGaps.length) ?
                    '<div class="evidence-detail-grid">' +
                      (item.whatGoodLooksLike && item.whatGoodLooksLike.length ?
                        '<div class="evidence-block evidence-good"><div class="evidence-block-label">What Good Looks Like</div><ul>' + item.whatGoodLooksLike.map(function(g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>' : '') +
                      (item.commonGaps && item.commonGaps.length ?
                        '<div class="evidence-block evidence-gap"><div class="evidence-block-label">Common Gaps</div><ul>' + item.commonGaps.map(function(g) { return '<li>' + esc(g) + '</li>'; }).join('') + '</ul></div>' : '') +
                    '</div>' : '') +
                '</div>';
              }).join('') +
            '</div>' +
          '</div></div>' : '') +
        (linkedArtifacts.length ?
          '<div class="accordion"><div class="accordion-item">' +
            '<button class="accordion-trigger" aria-expanded="true"><span>Required Artifacts (' + linkedArtifacts.length + ')</span><span class="accordion-icon">&#9660;</span></button>' +
            '<div class="accordion-content" role="region">' +
              linkedArtifacts.map(function(a) {
                return '<div class="artifact-card">' +
                  '<div class="artifact-card-header">' +
                    '<span class="artifact-card-name">' + esc(a.name) + '</span>' +
                    '<div class="artifact-card-badges">' +
                      (a.mandatory ? '<span class="badge badge-mandatory">Mandatory</span>' : '<span class="badge badge-optional">Optional</span>') +
                      '<span class="badge badge-category">' + esc(a.category) + '</span>' +
                    '</div>' +
                  '</div>' +
                  '<p class="artifact-card-desc">' + esc(a.description || '') + '</p>' +
                  '<div class="artifact-card-meta">' +
                    '<span class="meta-item"><strong>Owner:</strong> ' + esc(a.owner || 'N/A') + '</span>' +
                    '<span class="meta-item"><strong>Review:</strong> ' + esc(a.reviewFrequency || 'N/A') + '</span>' +
                  '</div>' +
                '</div>';
              }).join('') +
            '</div>' +
          '</div></div>' : '') +
      '</section>';
  }

  // Render
  el.innerHTML =
    '<article class="control-detail">' +
      '<nav class="breadcrumbs"><a href="#controls">Controls</a><span class="sep">/</span><span class="current">' + esc(control.name) + '</span></nav>' +
      '<header class="control-detail-header">' +
        '<div class="control-detail-id-row">' +
          '<span class="badge badge-domain">' + esc(domain.name || control.domain) + '</span>' +
          '<span class="badge badge-type">' + esc(control.type || '') + '</span>' +
          (control.layer ? '<span class="badge badge-category">' + esc(control.layer) + '</span>' : '') +
        '</div>' +
        '<h1 class="control-detail-title">' + esc(control.name) + '</h1>' +
        '<p class="control-detail-desc">' + esc(control.description) + '</p>' +
      '</header>' +
      renderComplianceToggle(slug) +
      (hasRequirements ?
        '<section class="detail-section"><h2 class="detail-section-title">Requirements</h2>' +
          '<div class="requirements-grid">' +
            '<div class="requirement-block requirement-legal"><div class="requirement-block-label">Business / Compliance</div>' +
              (businessReqs.length ? '<ul>' + businessReqs.map(function(r) { return '<li>' + esc(r.requirement) + '</li>'; }).join('') + '</ul>' : '<p style="color:var(--text-muted);font-size:var(--font-size-sm);">No requirements mapped.</p>') +
            '</div>' +
            '<div class="requirement-block requirement-technical"><div class="requirement-block-label">Technology</div>' +
              (technologyReqs.length ? '<ul>' + technologyReqs.map(function(r) { return '<li>' + esc(r.requirement) + '</li>'; }).join('') + '</ul>' : '<p style="color:var(--text-muted);font-size:var(--font-size-sm);">No requirements mapped.</p>') +
            '</div>' +
            '<div class="requirement-block requirement-governance"><div class="requirement-block-label">Governance</div>' +
              (governanceReqs.length ? '<ul>' + governanceReqs.map(function(r) { return '<li>' + esc(r.requirement) + '</li>'; }).join('') + '</ul>' : '<p style="color:var(--text-muted);font-size:var(--font-size-sm);">No requirements mapped.</p>') +
            '</div>' +
          '</div>' +
        '</section>' : '') +
      (control.keyActivities && control.keyActivities.length ?
        '<section class="detail-section"><h2 class="detail-section-title">Key Activities</h2>' +
          '<ul class="activity-list">' + control.keyActivities.map(function(a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' +
        '</section>' : '') +
      (control.maturity ?
        '<section class="detail-section"><h2 class="detail-section-title">Maturity Levels</h2>' +
          '<div class="maturity-grid">' +
            '<div class="maturity-card maturity-basic"><div class="maturity-label">Basic</div><p>' + esc(control.maturity.basic || '') + '</p></div>' +
            '<div class="maturity-card maturity-mature"><div class="maturity-label">Mature</div><p>' + esc(control.maturity.mature || '') + '</p></div>' +
            '<div class="maturity-card maturity-advanced"><div class="maturity-label">Advanced</div><p>' + esc(control.maturity.advanced || '') + '</p></div>' +
          '</div>' +
        '</section>' : '') +
      auditPackageHTML +
      (fwMappings.length ?
        '<section class="detail-section"><h2 class="detail-section-title">Framework Mappings</h2>' +
          '<div class="fw-mappings">' +
            fwMappings.map(function(m) {
              return '<div class="fw-mapping-row"><span class="fw-label">' + esc(m.label) + '</span><span class="fw-codes">' + esc(m.codes) + '</span></div>';
            }).join('') +
          '</div>' +
        '</section>' : '') +
      (controlClauses.length ?
        '<section class="detail-section"><h2 class="detail-section-title">Source Clauses</h2>' +
          '<div class="provision-links">' +
            controlClauses.map(function(cid) {
              var cl = state.clauses[cid];
              return '<a href="#clause/' + cid + '" class="provision-link">' +
                '<span class="provision-id">' + esc(cid) + '</span>' +
                '<span class="provision-title">' + (cl ? esc((cl.verbatim || '').slice(0, 100)) : '') + '</span>' +
              '</a>';
            }).join('') +
          '</div>' +
        '</section>' : '') +
    '</article>';
}

/* ===== RISK MANAGEMENT ===== */
async function renderRiskManagement(app) {
  var results = await Promise.all([
    fetchJSON('risk-management/methodology.json'),
    fetchJSON('risk-management/risk-matrix.json'),
    fetchJSON('risk-management/risk-register.json'),
    fetchJSON('risk-management/checklist.json'),
    fetchJSON('risk-management/treatment-options.json'),
  ]);
  var methodology = results[0], matrix = results[1], register = results[2], checklist = results[3], treatment = results[4];

  if (!methodology && !matrix && !register && !checklist) {
    app.innerHTML = '<div class="empty-state"><div class="empty-state-text">Risk management data not available.</div></div>';
    return;
  }

  var risks = (register && register.risks) || [];
  var categories = {};
  var bandCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  risks.forEach(function(r) {
    var cat = r.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
    var band = riskBand(r.residualRisk, matrix);
    bandCounts[band] = (bandCounts[band] || 0) + 1;
  });

  app.innerHTML =
    '<div class="page-title">Risk Management</div>' +
    '<div class="page-subtitle">MCIPD-aligned customer information risk assessment methodology, risk register, and treatment options <span class="badge badge-ai" title="Constructed indicative content">AI Generated</span></div>' +
    '<div class="stats-banner">' +
      '<div class="stat-card"><div class="stat-number">' + risks.length + '</div><div class="stat-label">Risks Identified</div></div>' +
      '<div class="stat-card"><div class="stat-number">' + Object.keys(categories).length + '</div><div class="stat-label">Categories</div></div>' +
      '<div class="stat-card"><div class="stat-number" style="color:#EF4444;">' + bandCounts.Critical + '</div><div class="stat-label">Critical (Residual)</div></div>' +
      '<div class="stat-card"><div class="stat-number" style="color:#F97316;">' + bandCounts.High + '</div><div class="stat-label">High (Residual)</div></div>' +
    '</div>' +
    '<div class="sub-tabs">' +
      '<button class="sub-tab active" data-sub="rm-methodology">Methodology</button>' +
      '<button class="sub-tab" data-sub="rm-register">Risk Register (' + risks.length + ')</button>' +
      '<button class="sub-tab" data-sub="rm-checklist">Checklist</button>' +
      '<button class="sub-tab" data-sub="rm-treatment">Treatment Options</button>' +
    '</div>' +
    '<div class="sub-panel active" data-subpanel="rm-methodology">' + renderRMMethodology(methodology, matrix) + '</div>' +
    '<div class="sub-panel" data-subpanel="rm-register">' + renderRMRegister(register, matrix) + '</div>' +
    '<div class="sub-panel" data-subpanel="rm-checklist">' + renderRMChecklist(checklist) + '</div>' +
    '<div class="sub-panel" data-subpanel="rm-treatment">' + renderRMTreatment(treatment) + '</div>';
}

function riskBand(score, matrix) {
  if (!matrix || !matrix.scoreToBand) {
    if (score >= 20) return 'Critical';
    if (score >= 10) return 'High';
    if (score >= 5) return 'Medium';
    return 'Low';
  }
  return matrix.scoreToBand[String(score)] || (score >= 20 ? 'Critical' : score >= 10 ? 'High' : score >= 5 ? 'Medium' : 'Low');
}

function riskBandColor(band) {
  var map = { Critical: '#EF4444', High: '#F97316', Medium: '#EAB308', Low: '#22C55E' };
  return map[band] || '#6B7280';
}

function riskBandClass(band) {
  var map = { Critical: 'risk-critical', High: 'risk-high', Medium: 'risk-medium', Low: 'risk-low' };
  return map[band] || '';
}

function renderRMMethodology(meth, matrix) {
  if (!meth) return '<div class="empty-state"><div class="empty-state-text">Methodology data not available.</div></div>';

  var steps = (meth.riskAssessmentProcess && meth.riskAssessmentProcess.steps) || [];
  var stepsHTML = steps.map(function(s) {
    return '<div class="accordion-item">' +
      '<button class="accordion-trigger" data-accordion>' +
        '<span><strong>Step ' + s.step + ':</strong> ' + esc(s.name) + '</span>' +
        '<span class="chevron">&#9654;</span>' +
      '</button>' +
      '<div class="accordion-content">' +
        '<p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.5rem;">' + esc(s.description) + '</p>' +
        '<ul style="padding-left:1.25rem;font-size:0.8125rem;color:var(--text-secondary);">' +
          (s.activities || []).map(function(a) { return '<li style="margin-bottom:0.25rem;">' + esc(a) + '</li>'; }).join('') +
        '</ul>' +
      '</div>' +
    '</div>';
  }).join('');

  var matrixHTML = matrix ? renderRiskMatrix(matrix) : '';

  return '<div class="card">' +
    '<div class="card-title">' + esc(meth.title) + '</div>' +
    '<div class="card-body">' + esc(meth.description) + '</div>' +
    (meth.alignment && meth.alignment.length ?
      '<div style="display:flex;gap:0.375rem;flex-wrap:wrap;margin-top:0.75rem;">' +
        meth.alignment.map(function(a) { return '<span class="badge badge-domain">' + esc(a) + '</span>'; }).join('') +
      '</div>' : '') +
  '</div>' +
  '<h3 style="font-size:1rem;font-weight:600;margin:1.5rem 0 0.75rem;">Risk Assessment Process</h3>' +
  '<div class="accordion">' + stepsHTML + '</div>' +
  matrixHTML +
  (meth.impactScale && meth.impactScale.length ?
    '<h3 style="font-size:1rem;font-weight:600;margin:1.5rem 0 0.75rem;">Impact Scale</h3>' +
    '<div style="overflow-x:auto;"><table class="data-table">' +
      '<thead><tr><th>Level</th><th>Label</th><th>Description</th></tr></thead>' +
      '<tbody>' +
        meth.impactScale.map(function(i) {
          return '<tr><td><strong>' + i.level + '</strong></td><td><strong>' + esc(i.label) + '</strong></td><td style="font-size:0.75rem;">' + esc(i.description || i.dataSensitivity || '') + '</td></tr>';
        }).join('') +
      '</tbody>' +
    '</table></div>' : '') +
  (meth.likelihoodScale && meth.likelihoodScale.length ?
    '<h3 style="font-size:1rem;font-weight:600;margin:1.5rem 0 0.75rem;">Likelihood Scale</h3>' +
    '<div style="overflow-x:auto;"><table class="data-table">' +
      '<thead><tr><th>Level</th><th>Label</th><th>Description</th><th>Indicative Frequency</th></tr></thead>' +
      '<tbody>' +
        meth.likelihoodScale.map(function(l) {
          return '<tr><td><strong>' + l.level + '</strong></td><td><strong>' + esc(l.label) + '</strong></td><td style="font-size:0.75rem;">' + esc(l.description) + '</td><td style="font-size:0.75rem;">' + esc(l.indicativeFrequency) + '</td></tr>';
        }).join('') +
      '</tbody>' +
    '</table></div>' : '') +
  (meth.reviewSchedule ?
    '<div class="card" style="margin-top:1.5rem;">' +
      '<div class="card-title">Review Schedule</div>' +
      '<div class="card-meta">' +
        '<span>Full Assessment: ' + esc(meth.reviewSchedule.fullAssessment) + '</span>' +
        '<span>Register Review: ' + esc(meth.reviewSchedule.registerReview) + '</span>' +
      '</div>' +
      (meth.reviewSchedule.triggerEvents && meth.reviewSchedule.triggerEvents.length ?
        '<div class="block-label" style="margin-top:0.75rem;">Trigger Events</div>' +
        '<ul style="padding-left:1.25rem;font-size:0.8125rem;color:var(--text-secondary);">' +
          meth.reviewSchedule.triggerEvents.map(function(t) { return '<li style="margin-bottom:0.25rem;">' + esc(t) + '</li>'; }).join('') +
        '</ul>' : '') +
    '</div>' : '');
}

function renderRiskMatrix(matrix) {
  if (!matrix || !matrix.axes) return '';
  var impactLabels = matrix.axes.x.scale;
  var likelihoodLabels = matrix.axes.y.scale;
  var grid = matrix.matrix;
  var stb = matrix.scoreToBand || {};

  return '<h3 style="font-size:1rem;font-weight:600;margin:1.5rem 0 0.75rem;">Risk Matrix (5x5)</h3>' +
    '<div style="overflow-x:auto;"><table class="data-table risk-matrix-table">' +
      '<thead><tr><th style="min-width:100px;">Likelihood \\ Impact</th>' +
        impactLabels.map(function(i) { return '<th style="text-align:center;">' + esc(i.label) + '<br><span style="font-size:0.625rem;color:var(--text-muted);">(' + i.level + ')</span></th>'; }).join('') +
      '</tr></thead>' +
      '<tbody>' +
        likelihoodLabels.slice().reverse().map(function(l, rowIdx) {
          var gridRow = grid[likelihoodLabels.length - 1 - rowIdx];
          return '<tr><td><strong>' + esc(l.label) + '</strong> <span style="font-size:0.625rem;color:var(--text-muted);">(' + l.level + ')</span></td>' +
            gridRow.map(function(score) {
              var band = stb[String(score)] || 'Low';
              var cls = riskBandClass(band);
              return '<td class="' + cls + '" style="text-align:center;"><span style="font-weight:600;">' + score + '</span></td>';
            }).join('') +
          '</tr>';
        }).join('') +
      '</tbody>' +
    '</table></div>' +
    '<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.75rem;">' +
      (matrix.bands || []).map(function(b) {
        return '<div style="display:flex;align-items:center;gap:0.375rem;">' +
          '<span style="width:12px;height:12px;border-radius:2px;background:' + b.color + ';display:inline-block;"></span>' +
          '<span style="font-size:0.75rem;font-weight:500;">' + esc(b.band) + ' (' + esc(b.range) + ')</span>' +
          '<span style="font-size:0.6875rem;color:var(--text-muted);">&mdash; ' + esc(b.action) + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
}

function renderRMRegister(register, matrix) {
  if (!register || !register.risks || !register.risks.length) {
    return '<div class="empty-state"><div class="empty-state-text">No risks in the register.</div></div>';
  }
  var risks = register.risks;
  var categories = {};
  risks.forEach(function(r) {
    var cat = r.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  });

  return '<div class="card-meta" style="margin-bottom:1rem;"><span>Last Review: ' + esc(register.lastReviewDate || 'N/A') + '</span><span>Next Review: ' + esc(register.nextReviewDate || 'N/A') + '</span></div>' +
    '<div class="filter-bar">' +
      '<span class="filter-chip active" data-filter="all">All (' + risks.length + ')</span>' +
      Object.keys(categories).map(function(cat) { return '<span class="filter-chip" data-filter="' + esc(cat) + '">' + esc(cat) + ' (' + categories[cat].length + ')</span>'; }).join('') +
    '</div>' +
    '<div id="risk-register-list">' +
      risks.map(function(r) {
        var inherentBand = riskBand(r.inherentRisk, matrix);
        var residualBand = riskBand(r.residualRisk, matrix);
        return '<div class="card risk-register-card" data-category="' + esc(r.category || 'Other') + '" style="margin-bottom:0.75rem;">' +
          '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.375rem;">' +
            '<span style="font-family:var(--font-mono);font-size:0.8125rem;font-weight:600;color:var(--accent);">' + esc(r.id) + '</span>' +
            '<span class="badge badge-category">' + esc(r.category) + '</span>' +
          '</div>' +
          '<div class="card-title" style="margin-bottom:0.375rem;">' + esc(r.title) + '</div>' +
          '<div class="card-body" style="margin-bottom:0.75rem;">' + esc(r.description) + '</div>' +
          '<div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.75rem;">' +
            '<div><div style="font-size:0.6875rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.25rem;">Inherent Risk</div>' +
              '<div style="display:flex;align-items:center;gap:0.375rem;"><span style="font-size:0.75rem;color:var(--text-secondary);">L:' + r.likelihood + ' x I:' + r.impact + '</span>' +
              '<span style="font-weight:700;color:' + riskBandColor(inherentBand) + ';">' + r.inherentRisk + '</span>' +
              '<span style="font-size:0.6875rem;font-weight:600;color:' + riskBandColor(inherentBand) + ';">' + inherentBand + '</span></div></div>' +
            '<div><div style="font-size:0.6875rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.25rem;">Residual Risk</div>' +
              '<div style="display:flex;align-items:center;gap:0.375rem;"><span style="font-size:0.75rem;color:var(--text-secondary);">L:' + r.residualLikelihood + ' x I:' + r.residualImpact + '</span>' +
              '<span style="font-weight:700;color:' + riskBandColor(residualBand) + ';">' + r.residualRisk + '</span>' +
              '<span style="font-size:0.6875rem;font-weight:600;color:' + riskBandColor(residualBand) + ';">' + residualBand + '</span></div></div>' +
            '<div><div style="font-size:0.6875rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.25rem;">Treatment</div><span class="badge badge-type">' + esc(r.treatment) + '</span></div>' +
            '<div><div style="font-size:0.6875rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.25rem;">Owner</div><span style="font-size:0.75rem;color:var(--text-secondary);">' + esc(r.owner) + '</span></div>' +
          '</div>' +
          (r.existingControls && r.existingControls.length ?
            '<div class="block-label">Existing Controls</div><ul style="padding-left:1.25rem;font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.5rem;">' +
              r.existingControls.map(function(c) { return '<li style="margin-bottom:0.125rem;">' + esc(c) + '</li>'; }).join('') + '</ul>' : '') +
          '<div class="block-label">Treatment Plan</div>' +
          '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.25rem;">' + esc(r.treatmentPlan) + '</div>' +
          '<div style="font-size:0.6875rem;color:var(--text-muted);margin-top:0.5rem;">Review Date: ' + esc(r.reviewDate) + '</div>' +
        '</div>';
      }).join('') +
    '</div>';
}

function renderRMChecklist(checklist) {
  if (!checklist || !checklist.items || !checklist.items.length) {
    return '<div class="empty-state"><div class="empty-state-text">No checklist items available.</div></div>';
  }
  var items = checklist.items;
  var areas = {};
  items.forEach(function(item) {
    var area = item.area || 'General';
    if (!areas[area]) areas[area] = [];
    areas[area].push(item);
  });

  return '<div class="card" style="margin-bottom:1rem;"><div class="card-title">' + esc(checklist.title) + '</div><div class="card-body">' + esc(checklist.description) + '</div></div>' +
    '<div class="accordion">' +
      Object.entries(areas).map(function(entry) {
        var area = entry[0], areaItems = entry[1];
        return '<div class="accordion-item open">' +
          '<button class="accordion-trigger" data-accordion><span>' + esc(area) + ' (' + areaItems.length + ')</span><span class="chevron">&#9654;</span></button>' +
          '<div class="accordion-content">' +
            areaItems.map(function(item) {
              return '<div class="card" style="margin-bottom:0.5rem;">' +
                '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.375rem;">' +
                  '<span style="font-family:var(--font-mono);font-size:0.75rem;font-weight:600;color:var(--accent);">' + esc(item.id) + '</span>' +
                  '<span class="req-item-priority priority-' + (item.priority || '').toLowerCase() + '">' + esc(item.priority) + '</span>' +
                '</div>' +
                '<div class="card-title" style="font-size:0.875rem;margin-bottom:0.25rem;">' + esc(item.checkItem) + '</div>' +
                '<div class="card-body" style="margin-bottom:0.5rem;">' + esc(item.description) + '</div>' +
                (item.evidenceRequired && item.evidenceRequired.length ?
                  '<div class="block-label">Evidence Required</div><ul style="padding-left:1.25rem;font-size:0.8125rem;color:var(--text-secondary);">' +
                    item.evidenceRequired.map(function(e) { return '<li style="margin-bottom:0.125rem;">' + esc(e) + '</li>'; }).join('') + '</ul>' : '') +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
}

function renderRMTreatment(treatment) {
  if (!treatment || !treatment.strategies || !treatment.strategies.length) {
    return '<div class="empty-state"><div class="empty-state-text">No treatment options available.</div></div>';
  }

  return (treatment.mandatoryComplianceNote ?
    '<div class="card" style="margin-bottom:1rem;border-left:3px solid #EF4444;"><div class="card-title" style="color:#EF4444;">Mandatory Compliance Notice</div><div class="card-body" style="font-size:0.8125rem;">' + esc(treatment.mandatoryComplianceNote) + '</div></div>' : '') +
    treatment.strategies.map(function(s) {
      return '<div class="card" style="margin-bottom:1rem;">' +
        '<div class="card-title">' + esc(s.strategy) + '</div>' +
        '<div class="card-body" style="margin-bottom:0.75rem;">' + esc(s.description) + '</div>' +
        '<div class="block-label">When to Use</div>' +
        '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem;">' + esc(s.whenToUse) + '</div>' +
        (s.considerations && s.considerations.length ?
          '<div class="block-label" style="margin-top:0.75rem;">Considerations</div>' +
          '<ul style="padding-left:1.25rem;font-size:0.8125rem;color:var(--text-secondary);">' +
            s.considerations.map(function(c) { return '<li style="margin-bottom:0.125rem;">' + esc(c) + '</li>'; }).join('') + '</ul>' : '') +
      '</div>';
    }).join('');
}

/* ===== REFERENCE (Cross-References) ===== */
async function renderReference(el) {
  if (!state.crossRefs) {
    var results = await Promise.all([
      fetchJSON('cross-references/mcipd-to-rmit.json'),
      fetchJSON('cross-references/mcipd-to-pdpa.json'),
      fetchJSON('cross-references/mcipd-to-dataprotection.json'),
    ]);
    state.crossRefs = {
      rmit: results[0],
      pdpa: results[1],
      dataprotection: results[2],
    };
  }

  el.innerHTML =
    '<div class="page-title">Reference</div>' +
    '<div class="page-subtitle">Cross-reference mappings between MCIPD and related frameworks</div>' +
    '<div class="sub-tabs">' +
      '<button class="sub-tab active" data-sub="xref-rmit">RMiT</button>' +
      '<button class="sub-tab" data-sub="xref-pdpa">PDPA</button>' +
      '<button class="sub-tab" data-sub="xref-dataprotection">Data Protection</button>' +
    '</div>' +
    '<div class="sub-panel active" data-subpanel="xref-rmit">' + renderCrossRefPanel(state.crossRefs.rmit) + '</div>' +
    '<div class="sub-panel" data-subpanel="xref-pdpa">' + renderCrossRefPanel(state.crossRefs.pdpa) + '</div>' +
    '<div class="sub-panel" data-subpanel="xref-dataprotection">' + renderCrossRefPanel(state.crossRefs.dataprotection) + '</div>';
}

function renderCrossRefPanel(data) {
  if (!data) return '<div class="empty-state"><div class="empty-state-text">No cross-reference data available.</div></div>';

  var mappings = data.mappings || [];
  if (!mappings.length) return '<div class="empty-state"><div class="empty-state-text">No mappings available.</div></div>';

  return '<div class="card" style="margin-bottom:1rem;">' +
    '<div class="card-title">' + esc(data.source || '') + ' &rarr; ' + esc(data.target || '') + '</div>' +
    '<div class="card-body">' + esc(data.relationship || '') + '</div>' +
  '</div>' +
  mappings.map(function(m) {
    var targetRefs = m.rmit || m.pdpa || m.dataprotection || [];
    return '<div class="xref-row">' +
      '<span class="xref-section">' + esc(m.mcipd || '') + '</span>' +
      '<div class="xref-targets">' +
        '<div style="font-size:0.8125rem;font-weight:500;margin-bottom:0.25rem;">' + esc(m.domain || '') + '</div>' +
        '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.375rem;">' + esc(m.rationale || '') + '</div>' +
        '<div style="display:flex;gap:0.25rem;flex-wrap:wrap;">' +
          (Array.isArray(targetRefs) ? targetRefs.map(function(r) { return '<span class="xref-tag">' + esc(r) + '</span>'; }).join('') : '<span class="xref-tag">' + esc(String(targetRefs)) + '</span>') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* ===== SEARCH ===== */
async function renderSearch(el, query) {
  if (!query || query.length < 2) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Enter at least 2 characters to search.</div></div>';
    return;
  }

  var q = query.toLowerCase();
  var results = [];

  // Search clauses
  Object.values(state.clauses).forEach(function(c) {
    var fields = [c.id, c.sectionTitle || '', c.verbatim, c.translation].concat(c.keywords || []).join(' ').toLowerCase();
    if (fields.indexOf(q) !== -1) {
      results.push({ type: 'clause', id: c.id, title: c.sectionTitle || 'Clause ' + c.id, snippet: getSnippet(c.verbatim || c.translation, q), href: '#clause/' + c.id });
    }
  });

  // Search controls
  await ensureControls();
  Object.entries(state.controls.library).forEach(function(entry) {
    var domain = entry[0];
    entry[1].forEach(function(c) {
      var fields = [c.name, c.description, c.slug, domain].join(' ').toLowerCase();
      if (fields.indexOf(q) !== -1) {
        results.push({ type: 'control', id: '[Control] ' + domain, title: c.name, snippet: getSnippet(c.description, q), href: '#control/' + c.slug });
      }
    });
  });

  // Search requirements
  if (!state.requirements) {
    state.requirements = await fetchJSON('requirements/index.json') || {};
  }
  Object.entries(state.requirements).forEach(function(entry) {
    var clauseId = entry[0], section = entry[1];
    ['business', 'technology', 'governance'].forEach(function(perspective) {
      var reqs = (section[perspective] && section[perspective].requirements) || [];
      reqs.forEach(function(r) {
        var fields = [r.id, r.requirement, r.rationale || ''].join(' ').toLowerCase();
        if (fields.indexOf(q) !== -1) {
          results.push({ type: 'requirement', id: '[Req] ' + r.id, title: r.requirement.slice(0, 100), snippet: getSnippet(r.requirement, q), href: '#clause/' + clauseId });
        }
      });
    });
  });

  // Search evidence
  if (!state.evidence) {
    state.evidence = await fetchJSON('evidence/index.json') || {};
  }
  Object.entries(state.evidence).forEach(function(entry) {
    var clauseId = entry[0], section = entry[1];
    (section.evidenceItems || []).forEach(function(item) {
      var fields = [item.id || '', item.name, item.description].join(' ').toLowerCase();
      if (fields.indexOf(q) !== -1) {
        results.push({ type: 'evidence', id: '[Evidence] ' + (item.id || clauseId), title: item.name, snippet: getSnippet(item.description, q), href: '#clause/' + clauseId });
      }
    });
  });

  // Search artifacts
  await ensureArtifacts();
  Object.entries(state.artifacts.inventory).forEach(function(entry) {
    var cat = entry[0];
    if (Array.isArray(entry[1])) {
      entry[1].forEach(function(a) {
        var fields = [a.name, a.description, a.slug, cat].join(' ').toLowerCase();
        if (fields.indexOf(q) !== -1) {
          results.push({ type: 'artifact', id: '[Artifact] ' + cat, title: a.name, snippet: getSnippet(a.description, q), href: '#controls' });
        }
      });
    }
  });

  var input = document.getElementById('search-input');
  if (input && input.value !== query) input.value = query;

  el.innerHTML =
    '<div class="page-title">Search Results</div>' +
    '<div class="page-subtitle">' + results.length + ' result' + (results.length !== 1 ? 's' : '') + ' for "' + esc(query) + '"</div>' +
    (results.length === 0 ? '<div class="empty-state"><div class="empty-state-text">No results found.</div></div>' : '') +
    results.map(function(r) {
      return '<div class="search-result" onclick="location.hash=\'' + r.href + '\'">' +
        '<div class="search-result-section">' + esc(r.id) + '</div>' +
        '<div class="search-result-title">' + esc(r.title) + '</div>' +
        '<div class="search-result-snippet">' + r.snippet + '</div>' +
        '<div class="search-result-type">' + esc(r.type) + '</div>' +
      '</div>';
    }).join('');
}

function getSnippet(text, query) {
  if (!text) return '';
  var lower = text.toLowerCase();
  var idx = lower.indexOf(query);
  if (idx === -1) return esc(text.slice(0, 150)) + '…';
  var start = Math.max(0, idx - 60);
  var end = Math.min(text.length, idx + query.length + 60);
  var snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
  var re = new RegExp('(' + escRegex(query) + ')', 'gi');
  return esc(snippet).replace(re, '<mark>$1</mark>');
}

function escRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ===== NOT FOUND ===== */
function renderNotFound(el) {
  el.innerHTML = '<div class="empty-state"><div class="empty-state-text">Page not found. <a href="#">Return to overview</a></div></div>';
}

/* ===== EVENT HANDLERS ===== */
function handleClick(e) {
  // Accordion toggle
  var accHeader = e.target.closest('[data-accordion]');
  if (accHeader) {
    var item = accHeader.closest('.accordion-item');
    if (item) item.classList.toggle('open');
    return;
  }

  // Sub-tab switching
  var subTab = e.target.closest('.sub-tab');
  if (subTab) {
    var subName = subTab.dataset.sub;
    var container = subTab.closest('.sub-tabs');
    if (!container) return;
    var parent = container.parentElement;
    if (!parent) return;
    container.querySelectorAll('.sub-tab').forEach(function(b) { b.classList.toggle('active', b === subTab); });
    parent.querySelectorAll('.sub-panel').forEach(function(p) { p.classList.toggle('active', p.dataset.subpanel === subName); });
    return;
  }

  // Tab switching (clause detail tabs)
  var tabBtn = e.target.closest('.tab-btn');
  if (tabBtn) {
    var tabName = tabBtn.dataset.tab;
    var tabContainer = tabBtn.closest('.tabs');
    if (!tabContainer) return;
    var tabParent = tabContainer.parentElement;
    if (!tabParent) return;
    tabContainer.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.toggle('active', b === tabBtn); });
    tabParent.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.toggle('active', p.id === 'tab-' + tabName); });

    var clauseId = state.route.view === 'clause' ? state.route.id : null;
    if (clauseId && ['requirements', 'evidence', 'controls', 'artifacts'].indexOf(tabName) !== -1) {
      activateTab(tabName, clauseId);
    }
    return;
  }

  // Accordion toggle (aria-expanded)
  var accTrigger = e.target.closest('.accordion-trigger[aria-expanded]');
  if (accTrigger) {
    var expanded = accTrigger.getAttribute('aria-expanded') === 'true';
    accTrigger.setAttribute('aria-expanded', !expanded);
    var content = accTrigger.nextElementSibling;
    if (content) content.hidden = expanded;
    return;
  }

  // Filter chips
  var chip = e.target.closest('.filter-chip');
  if (chip) {
    var filter = chip.dataset.filter;
    var bar = chip.closest('.filter-bar');
    if (bar) {
      bar.querySelectorAll('.filter-chip').forEach(function(c) { c.classList.toggle('active', c === chip); });
    }
    var listEl = bar ? bar.parentElement : null;
    if (listEl) {
      var items = listEl.querySelectorAll('[data-category]');
      items.forEach(function(item) {
        item.style.display = (filter === 'all' || item.dataset.category === filter) ? '' : 'none';
      });
    }
    return;
  }
}

function handleSearch() {
  var query = document.getElementById('search-input').value.trim();
  if (query.length >= 2) {
    location.hash = '#search/' + encodeURIComponent(query);
  } else if (location.hash.startsWith('#search/')) {
    location.hash = '#';
  }
}

/* ===== HELPERS ===== */
function esc(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function markerBadge(marker) {
  if (marker === 'S') return '<span class="badge badge-standard">Standard</span>';
  if (marker === 'G') return '<span class="badge badge-guidance">Guidance</span>';
  return '<span class="badge badge-category">' + esc(marker || 'N/A') + '</span>';
}

/* ===== COMPLIANCE GAP TRACKER ===== */
function getComplianceStatus(slug) {
  var data = JSON.parse(localStorage.getItem('mcipd_compliance_status') || '{}');
  return data[slug] || 'pending';
}

function setComplianceStatus(slug, status) {
  var data = JSON.parse(localStorage.getItem('mcipd_compliance_status') || '{}');
  data[slug] = status;
  localStorage.setItem('mcipd_compliance_status', JSON.stringify(data));
  render();
}

function renderComplianceToggle(slug) {
  var status = getComplianceStatus(slug);
  var options = [
    { id: 'pending', label: 'Pending', color: '#64748b' },
    { id: 'compliant', label: 'Compliant', color: '#22c55e' },
    { id: 'gap', label: 'Gap (Non-Compliant)', color: '#ef4444' },
    { id: 'na', label: 'Not Applicable', color: '#94a3b8' }
  ];
  var current = options.find(function(o) { return o.id === status; });

  return '<div class="compliance-tracker-box">' +
    '<div>' +
      '<div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.35rem">Compliance Status</div>' +
      '<div style="font-size:1.1rem;font-weight:700;color:' + current.color + '">' + current.label + '</div>' +
    '</div>' +
    '<div style="margin-left:auto;display:flex;gap:0.5rem;flex-wrap:wrap">' +
      options.map(function(o) {
        return '<button onclick="setComplianceStatus(\'' + slug + '\', \'' + o.id + '\')" ' +
          'style="cursor:pointer;border:1px solid ' + (status === o.id ? o.color : 'var(--border)') + ';background:' + (status === o.id ? o.color + '15' : 'var(--surface)') + ';color:' + (status === o.id ? o.color : 'var(--text-secondary)') + ';padding:0.4rem 0.75rem;border-radius:6px;font-size:0.75rem;font-weight:600;transition:all 0.2s">' +
          o.label + '</button>';
      }).join('') +
    '</div>' +
  '</div>';
}

/* ===== EXPORT FUNCTIONS ===== */
function exportToPDF() {
  document.body.classList.add('printing');
  window.print();
  document.body.classList.remove('printing');
}

function exportToCSV() {
  var view = state.route.view;
  var data = [];
  var filename = 'mcipd-export-' + view + '-' + new Date().toISOString().slice(0, 10) + '.csv';

  if (view === 'controls' && state.controls) {
    var list = [];
    Object.entries(state.controls.library).forEach(function(entry) {
      if (Array.isArray(entry[1])) entry[1].forEach(function(c) { list.push(c); });
    });
    data = list.map(function(c) {
      return { ID: c.slug || '', Name: c.name, Domain: c.domain, Description: (c.description || '').replace(/\n/g, ' ') };
    });
  } else {
    alert('CSV export only supported for Controls view.');
    return;
  }

  if (data.length === 0) { alert('No data found to export.'); return; }

  var headers = Object.keys(data[0]);
  var csvContent = [
    headers.join(','),
  ].concat(data.map(function(row) {
    return headers.map(function(h) { return '"' + (row[h] || '').toString().replace(/"/g, '""') + '"'; }).join(',');
  })).join('\n');

  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ===== BOOTSTRAP ===== */
init().catch(function(err) {
  console.error('Failed to initialize:', err);
  document.getElementById('app').innerHTML = '<div class="error-state"><h2>Failed to load data</h2><p class="error-message">Could not initialize MCIPD application</p><button onclick="location.reload()">Retry</button></div>';
});
