/* ============================================
   BNM MCIPD Explorer — Application
   ============================================ */

const state = {
  sectionsData: null,  // raw sections.json metadata
  sections: null,      // built section array with subsections/clauses
  clauses: null,       // keyed by id
  requirements: null,
  evidence: null,
  controls: null,      // { domains, library, clauseMap }
  artifacts: null,     // { inventory, clauseMap }
  riskMgmt: null,      // { methodology, matrix, register, checklist, treatment }
  xrefs: null,         // { rmit, pdpa, dataprotection }
  route: { view: 'overview' },
};

const cache = new Map();

function renderError(path, error) {
  return '<div class="error-state">' +
    '<h2>Failed to load data</h2>' +
    '<p class="error-message">Could not fetch ' + escHtml(path) + '</p>' +
    (error ? '<p class="error-detail">' + escHtml(String(error)) + '</p>' : '') +
    '<button onclick="location.reload()">Retry</button>' +
    '</div>';
}

async function fetchJSON(path) {
  if (cache.has(path)) return cache.get(path);
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache.set(path, data);
    return data;
  } catch (e) {
    console.error(`Failed to load ${path}:`, e);
    const app = document.getElementById('app');
    if (app) app.innerHTML = renderError(path, e);
    return null;
  }
}

// ---- Router ----
function parseHash() {
  const hash = location.hash.slice(1);
  if (!hash) return { view: 'overview' };
  if (hash.startsWith('search/')) return { view: 'search', query: decodeURIComponent(hash.slice(7)) };
  if (hash === 'framework') return { view: 'framework' };
  if (hash.startsWith('framework/')) return { view: 'framework-detail', id: hash.slice(10) };
  if (hash === 'controls') return { view: 'controls' };
  if (hash.startsWith('control/')) return { view: 'control-detail', slug: hash.slice(8) };
  if (hash === 'risk-management') return { view: 'risk-management' };
  if (hash === 'risk') return { view: 'risk-management' };
  if (hash.startsWith('risk/')) return { view: 'risk-management', sub: hash.slice(5) };
  if (hash === 'reference') return { view: 'reference' };
  if (hash.startsWith('reference/')) return { view: 'reference', sub: hash.slice(10) };
  if (hash.includes('.')) return { view: 'clause', id: hash };
  return { view: 'section', id: hash };
}

function navigate(hash) { location.hash = hash; }

function escHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderBreadcrumbs(items) {
  return `<nav class="breadcrumbs">${items.map((item, i) => {
    if (i === items.length - 1) return `<span class="current">${escHtml(item.label)}</span>`;
    return `<a href="#${item.hash || ''}">${escHtml(item.label)}</a><span class="sep">\u203A</span>`;
  }).join('')}</nav>`;
}

function renderLoading() {
  return '<div class="loading"><div class="spinner"></div><span>Loading data\u2026</span></div>';
}

// Build sections from clauses/sections.json and clauses/index.json
// MCIPD sections.json is metadata with sections[].id/title/clauseCount
// We build a RMIT-compatible structure: [{ id, name, subsections: [{ name, clauses: [ids] }] }]
function buildSections(sectionsData, clausesArr) {
  const policySecIds = new Set();
  sectionsData.parts.forEach(p => {
    if (p.id === 'B' || p.id === 'C') {
      p.sections.forEach(s => policySecIds.add(s));
    }
  });

  // Group clauses by section
  const clausesBySection = {};
  for (const cl of clausesArr) {
    const secId = cl.section || cl.id.split('.')[0];
    if (!policySecIds.has(secId)) continue;
    if (!clausesBySection[secId]) clausesBySection[secId] = [];
    clausesBySection[secId].push(cl);
  }

  // Build sections array
  const sections = [];
  for (const secMeta of sectionsData.sections) {
    if (!policySecIds.has(secMeta.id)) continue;
    const clauses = clausesBySection[secMeta.id] || [];
    clauses.sort((a, b) => {
      const pa = a.id.split('.').map(Number);
      const pb = b.id.split('.').map(Number);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
      }
      return 0;
    });

    // Group by subsection if available
    const subsections = [];
    if (secMeta.subsections && secMeta.subsections.length > 0) {
      // Group clauses by their subsection field value
      // Clause subsection looks like "A: Risk assessment" or "C: Control measures - ICT controls"
      // Metadata subsection looks like "A. Risk assessment"
      // Match by first letter (A, B, C, D, E)
      for (const subName of secMeta.subsections) {
        const subLetter = subName.charAt(0);
        const matched = clauses.filter(cl => {
          if (!cl.subsection) return false;
          return cl.subsection.charAt(0) === subLetter;
        }).map(cl => cl.id);
        if (matched.length > 0) {
          subsections.push({ name: subName, clauses: matched });
        }
      }
      // If any clauses not matched, add them as "General"
      const allMatched = new Set(subsections.flatMap(s => s.clauses));
      const remaining = clauses.filter(cl => !allMatched.has(cl.id)).map(cl => cl.id);
      if (remaining.length > 0) {
        subsections.unshift({ name: 'General', clauses: remaining });
      }
    } else {
      // No subsections — all clauses in one group
      subsections.push({ name: secMeta.title, clauses: clauses.map(cl => cl.id) });
    }

    sections.push({
      id: secMeta.id,
      name: secMeta.title,
      part: secMeta.part,
      subsections,
    });
  }
  return sections;
}

// Transform raw library.json into { domains, library, clauseMap }
function buildControlsState(rawDomains, rawLibrary, rawClauseMap) {
  const library = {};
  const controls = rawLibrary.controls || rawLibrary;
  if (Array.isArray(controls)) {
    for (const ctrl of controls) {
      const domainId = ctrl.domain || ctrl.domainId || 'uncategorised';
      if (!library[domainId]) library[domainId] = [];
      library[domainId].push(ctrl);
    }
  } else if (typeof controls === 'object') {
    Object.assign(library, controls);
  }

  return {
    domains: rawDomains,
    library,
    clauseMap: rawClauseMap ? (rawClauseMap.clauseToControls || rawClauseMap) : {},
  };
}

// ---- View: Overview ----
function renderOverview() {
  const sections = state.sections;
  const totalClauses = Object.keys(state.clauses).length;
  const totalSubsections = sections.reduce((s, sec) => s + sec.subsections.length, 0);
  const controlCount = state.controls ? Object.values(state.controls.library).reduce((s, arr) => s + arr.length, 0) : '\u2014';
  const artifactCount = state.artifacts ? Object.values(state.artifacts.inventory).reduce((s, arr) => s + arr.length, 0) : '\u2014';
  const domainCount = state.controls ? Object.keys(state.controls.domains).length : '\u2014';

  return `
    <div class="disclaimer">
      This database is for educational and indicative purposes only. It does not constitute legal advice. The content represents a structured interpretation of BNM's Management of Customer Information and Permitted Disclosures policy document (BNM/RH/PD 028-65, October 2025). Always consult the source PDF and qualified legal or regulatory counsel for compliance decisions.
    </div>
    <div class="stats-banner">
      <div class="stat"><div class="stat-value">${sections.length}</div><div class="stat-label">Sections</div></div>
      <div class="stat"><div class="stat-value">${totalSubsections}</div><div class="stat-label">Subsections</div></div>
      <div class="stat"><div class="stat-value">${totalClauses}</div><div class="stat-label">Clauses</div></div>
      <div class="stat"><div class="stat-value">${controlCount}</div><div class="stat-label">Controls</div></div>
      <div class="stat"><div class="stat-value">${domainCount}</div><div class="stat-label">Domains</div></div>
    </div>
    <div class="control-grid">
      ${sections.map(sec => {
        const clauseCount = sec.subsections.reduce((s, ss) => s + ss.clauses.length, 0);
        return `
          <div class="control-card sec-${sec.id}" onclick="navigate('framework/${sec.id}')">
            <div class="control-card-header">
              <span class="control-id">\u00A7${sec.id}</span>
              <span class="badge badge-category">Part ${sec.part}</span>
            </div>
            <h3 class="control-card-title">${escHtml(sec.name)}</h3>
            <div class="control-card-meta">
              <span class="badge badge-artifacts">${sec.subsections.length} subsection${sec.subsections.length !== 1 ? 's' : ''}</span>
              <span class="badge badge-evidence">${clauseCount} clause${clauseCount !== 1 ? 's' : ''}</span>
            </div>
          </div>`;
      }).join('')}
    </div>
    <div style="margin-top:1.5rem;display:flex;gap:1.5rem;flex-wrap:wrap">
      <a href="#framework" style="font-size:0.875rem">Browse all ${sections.length} MCIPD sections \u2192</a>
      <a href="#controls" style="font-size:0.875rem">Browse Controls Library (${controlCount} controls across ${domainCount} domains) \u2192</a>
    </div>`;
}

// ---- View: Framework (section browsing) ----
function renderFramework() {
  const sections = state.sections;

  return `
    ${renderBreadcrumbs([{ label: 'Home', hash: '' }, { label: 'Framework' }])}
    <h2 style="font-size:1.25rem;margin-bottom:0.5rem">MCIPD Framework</h2>
    <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1.5rem">
      Browse all ${sections.length} policy sections of BNM's Management of Customer Information and Permitted Disclosures (BNM/RH/PD 028-65).
    </p>
    <div class="control-grid">
      ${sections.map(sec => {
        const clauseCount = sec.subsections.reduce((s, ss) => s + ss.clauses.length, 0);
        return `
          <div class="control-card sec-${sec.id}" onclick="navigate('framework/${sec.id}')">
            <div class="control-card-header">
              <span class="control-id">\u00A7${sec.id}</span>
              <span class="badge badge-category">Part ${sec.part}</span>
            </div>
            <h3 class="control-card-title">${escHtml(sec.name)}</h3>
            <div class="control-card-meta">
              <span class="badge badge-artifacts">${sec.subsections.length} subsection${sec.subsections.length !== 1 ? 's' : ''}</span>
              <span class="badge badge-evidence">${clauseCount} clause${clauseCount !== 1 ? 's' : ''}</span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ---- View: Section Drilldown ----
function renderSection(secId) {
  const sec = state.sections.find(s => s.id === secId);
  if (!sec) return '<div class="error-state">Section not found.</div>';

  return `
    ${renderBreadcrumbs([{ label: 'Home', hash: '' }, { label: 'Framework', hash: 'framework' }, { label: `\u00A7${sec.id} ${sec.name}` }])}
    <div class="sec-header">
      <div class="sec-header-title">
        <span class="badge sec-badge-${sec.id}" style="font-family:var(--mono);font-weight:700;font-size:1.25rem;padding:0.25rem 0.75rem;color:white">\u00A7${sec.id}</span>
        <h2>${escHtml(sec.name)}</h2>
      </div>
    </div>
    <div class="accordion">
      ${sec.subsections.map(ss => `
        <div class="accordion-item open">
          <button class="accordion-trigger" data-accordion>
            <span class="accordion-trigger-left">
              <span>${escHtml(ss.name)}</span>
              <span style="color:var(--text-muted);font-weight:400;font-size:0.8125rem">(${ss.clauses.length} clause${ss.clauses.length !== 1 ? 's' : ''})</span>
            </span>
            <span class="chevron">\u25B6</span>
          </button>
          <div class="accordion-content">
            <ul class="clause-list">
              ${ss.clauses.map(cid => {
                const cl = state.clauses[cid];
                if (!cl) return '';
                return `
                  <li>
                    <a class="clause-link" href="#${cid}">
                      <span class="clause-id">${cid}</span>
                      <span class="clause-title">${escHtml(cl.sectionTitle || cl.title || cl.verbatim?.slice(0, 80) + '\u2026')}</span>
                      <span class="clause-marker marker-${cl.marker}">${cl.marker === 'S' ? 'Shall' : 'Should'}</span>
                    </a>
                  </li>`;
              }).join('')}
            </ul>
          </div>
        </div>`).join('')}
    </div>`;
}

// ---- View: Clause Detail ----
function renderClause(clauseId) {
  const cl = state.clauses[clauseId];
  if (!cl) return '<div class="error-state">Clause not found.</div>';

  const secId = clauseId.split('.')[0];
  const sec = state.sections.find(s => s.id === secId);
  const tabs = ['Overview', 'Requirements', 'Evidence', 'Controls', 'Artifacts'];
  const title = cl.sectionTitle || cl.title || 'Clause ' + clauseId;

  return `
    ${renderBreadcrumbs([
      { label: 'Home', hash: '' },
      { label: 'Framework', hash: 'framework' },
      { label: `\u00A7${secId} ${sec ? sec.name : ''}`, hash: 'framework/' + secId },
      { label: `Clause ${clauseId}` }
    ])}
    <div class="clause-detail-header">
      <h2>
        <span class="clause-id-badge" style="background:var(--sec-${secId}-bg);color:var(--sec-${secId})">${clauseId}</span>
        ${escHtml(title)}
      </h2>
      <div class="clause-meta">
        <span class="badge badge-domain">\u00A7${escHtml(cl.section)} ${escHtml(cl.sectionTitle || '')}</span>
        ${cl.subsection ? `<span class="badge badge-type">${escHtml(cl.subsection)}</span>` : ''}
        <span class="clause-marker marker-${cl.marker}">${cl.marker === 'S' ? 'Shall' : 'Should'}</span>
        <span class="badge badge-layer">Part ${escHtml(cl.part || '')}</span>
      </div>
      ${cl.verbatim ? `
        <div class="verbatim-block">
          <strong>Verbatim (BNM MCIPD PD)</strong>
          ${escHtml(cl.verbatim)}
        </div>` : ''}
      ${cl.translation ? `
        <div class="translation-block">
          <strong>Plain English</strong> <span class="badge badge-ai" title="AI-generated interpretation — verify against verbatim BNM text and source PDF before relying on this">AI Generated</span>
          ${escHtml(cl.translation)}
        </div>` : ''}
    </div>
    <div class="tabs">
      <div class="tab-list" role="tablist">
        ${tabs.map((t, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-tab="${t.toLowerCase()}" role="tab">${t}</button>`).join('')}
      </div>
      <div class="tab-panel active" data-panel="overview">${renderOverviewTab(cl)}</div>
      <div class="tab-panel" data-panel="requirements">${renderLoading()}</div>
      <div class="tab-panel" data-panel="evidence">${renderLoading()}</div>
      <div class="tab-panel" data-panel="controls">${renderLoading()}</div>
      <div class="tab-panel" data-panel="artifacts">${renderLoading()}</div>
    </div>`;
}

function renderOverviewTab(cl) {
  let html = '';
  if (cl.keywords && cl.keywords.length > 0) {
    html += `<h3 style="font-size:1rem;margin-bottom:0.75rem">Keywords</h3>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem">
        ${cl.keywords.map(k => `<span class="badge badge-category">${escHtml(k)}</span>`).join('')}
      </div>`;
  }
  return html || '<p class="empty-state">No overview data available.</p>';
}

// ---- Requirements Tab ----
function renderRequirementsTab(clauseId) {
  const req = state.requirements?.[clauseId];
  if (!req) return '<p class="empty-state">No requirements data available for this clause.</p>';

  const dims = [
    { key: 'business', label: 'Business', color: 'var(--sec-8)' },
    { key: 'technology', label: 'Technology', color: 'var(--sec-10)' },
    { key: 'governance', label: 'Governance', color: 'var(--sec-9)' },
  ];

  return dims.map(({ key, label, color }) => {
    const d = req[key];
    if (!d) return '';
    return `
      <div class="req-dimension">
        <h4 style="color:${color}">${label} Requirements</h4>
        <p class="req-summary">${escHtml(d.summary)} <span class="badge badge-ai" title="AI-generated interpretive summary">AI Generated</span></p>
        ${d.requirements && d.requirements.length > 0 ? `
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>ID</th><th>Requirement</th><th>Owner</th><th>Frequency</th><th>Priority</th></tr></thead>
              <tbody>
                ${d.requirements.map(r => `
                  <tr>
                    <td class="mono" style="white-space:nowrap">${escHtml(r.id)}</td>
                    <td>
                      ${escHtml(r.requirement)}
                      ${r.rationale ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem"><span class="badge badge-ai" title="AI-generated rationale">AI Generated</span> ${escHtml(r.rationale)}</div>` : ''}
                    </td>
                    <td style="white-space:nowrap">${escHtml(r.owner)}</td>
                    <td style="white-space:nowrap;font-size:0.8125rem">${escHtml(r.frequency)}</td>
                    <td><span class="badge ${r.priority === 'critical' || r.priority === 'Critical' ? 'badge-mandatory' : 'badge-domain'}">${escHtml(r.priority)}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
      </div>`;
  }).join('');
}

// ---- Evidence Tab ----
function renderEvidenceTab(clauseId) {
  const ev = state.evidence?.[clauseId];
  if (!ev) return '<p class="empty-state">No evidence guidance available for this clause.</p>';

  return `
    ${ev.auditorFocus ? `<div class="auditor-focus"><strong>Auditor Focus</strong> <span class="badge badge-ai" title="AI-generated — verify against official BNM examination guidance">AI Generated</span>${escHtml(ev.auditorFocus)}</div>` : ''}
    ${(ev.evidenceItems || []).map(item => `
      <div class="evidence-card">
        <h4>${escHtml(item.name)}</h4>
        <div class="ev-id">${escHtml(item.id)}</div>
        ${item.description ? `<div class="ev-desc">${escHtml(item.description)}</div>` : ''}
        ${(item.whatGoodLooksLike && item.whatGoodLooksLike.length > 0) || (item.commonGaps && item.commonGaps.length > 0) ? `
          <div class="evidence-detail-grid">
            ${item.whatGoodLooksLike && item.whatGoodLooksLike.length > 0 ? `
            <div class="evidence-block evidence-good">
              <div class="evidence-block-label">What Good Looks Like</div>
              <ul>${item.whatGoodLooksLike.map(w => `<li>${escHtml(w)}</li>`).join('')}</ul>
            </div>` : ''}
            ${item.commonGaps && item.commonGaps.length > 0 ? `
            <div class="evidence-block evidence-gap">
              <div class="evidence-block-label">Common Gaps</div>
              <ul>${item.commonGaps.map(g => `<li>${escHtml(g)}</li>`).join('')}</ul>
            </div>` : ''}
          </div>` : ''}
        <div class="ev-meta">
          ${item.suggestedSources ? `<div>Sources: <span>${escHtml(item.suggestedSources.join(', '))}</span></div>` : ''}
          ${item.format ? `<div>Format: <span>${escHtml(item.format)}</span></div>` : ''}
          ${item.retentionPeriod ? `<div>Retention: <span>${escHtml(item.retentionPeriod)}</span></div>` : ''}
        </div>
      </div>`).join('')}
    ${ev.auditTips && ev.auditTips.length > 0 ? `
      <div class="audit-tips"><h4>Audit Tips <span class="badge badge-ai" title="AI-generated guidance — verify against official BNM examination criteria">AI Generated</span></h4>
        <ul>${ev.auditTips.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>
      </div>` : ''}`;
}

// ---- Controls Tab ----
function renderControlsTab(clauseId) {
  if (!state.controls) return '<p class="empty-state">No controls data available.</p>';
  const slugs = state.controls.clauseMap[clauseId];
  if (!slugs || slugs.length === 0) return '<p class="empty-state">No controls mapped to this clause.</p>';

  const lookup = {};
  for (const [domain, controls] of Object.entries(state.controls.library)) {
    for (const ctrl of controls) lookup[ctrl.slug] = { ...ctrl, domainId: domain };
  }

  const matched = slugs.map(s => lookup[s]).filter(Boolean);
  if (matched.length === 0) return '<p class="empty-state">No control details found.</p>';

  return matched.map(ctrl => {
    const domainInfo = state.controls.domains[ctrl.domainId];
    return `
      <div class="control-card" onclick="navigate('control/${ctrl.slug}')" style="cursor:pointer">
        <h4>${escHtml(ctrl.name)}</h4>
        <div class="control-meta">
          <span class="badge badge-domain">${escHtml(domainInfo?.name || ctrl.domainId)}</span>
          <span class="badge badge-type">${escHtml(ctrl.type)}</span>
          <span class="badge badge-layer">${escHtml(ctrl.layer)}</span>
        </div>
        <p class="control-desc">${escHtml(ctrl.description)}</p>
        ${ctrl.keyActivities && ctrl.keyActivities.length > 0 ? `
          <div class="key-activities"><h5>Key Activities</h5>
            <ul>${ctrl.keyActivities.map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>
          </div>` : ''}
        ${ctrl.maturity ? `
          <div class="maturity-grid">
            <div class="maturity-card maturity-basic"><h5 class="maturity-label">Basic</h5><p>${escHtml(ctrl.maturity.basic)}</p></div>
            <div class="maturity-card maturity-mature"><h5 class="maturity-label">Mature</h5><p>${escHtml(ctrl.maturity.mature)}</p></div>
            <div class="maturity-card maturity-advanced"><h5 class="maturity-label">Advanced</h5><p>${escHtml(ctrl.maturity.advanced)}</p></div>
          </div>` : ''}
        ${(ctrl.nist || ctrl.iso27001) ? `
          <div class="fw-mappings">
            ${ctrl.nist && ctrl.nist.length > 0 ? `<div>NIST CSF: <span>${ctrl.nist.map(n => escHtml(n)).join(', ')}</span></div>` : ''}
            ${ctrl.iso27001 && ctrl.iso27001.length > 0 ? `<div>ISO 27001: <span>${ctrl.iso27001.map(n => escHtml(n)).join(', ')}</span></div>` : ''}
          </div>` : ''}
        ${ctrl.toolExamples && ctrl.toolExamples.length > 0 ? `
          <div style="margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted)">
            Tools: <span style="font-weight:600;color:var(--text-secondary)">${ctrl.toolExamples.map(t => escHtml(t)).join(', ')}</span>
          </div>` : ''}
      </div>`;
  }).join('');
}

// ---- Artifacts Tab ----
function renderArtifactsTab(clauseId) {
  if (!state.artifacts) return '<p class="empty-state">No artifacts data available.</p>';
  const slugs = state.artifacts.clauseMap[clauseId];
  if (!slugs || slugs.length === 0) return '<p class="empty-state">No artifacts mapped to this clause.</p>';

  const lookup = {};
  for (const [category, items] of Object.entries(state.artifacts.inventory)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) lookup[item.slug] = { ...item, categoryLabel: category };
  }

  const matched = slugs.map(s => lookup[s]).filter(Boolean);
  if (matched.length === 0) return '<p class="empty-state">No artifact details found.</p>';

  return matched.map(a => `
    <div class="artifact-card">
      <h4>${escHtml(a.name)}</h4>
      <div class="artifact-meta">
        <span class="badge badge-category">${escHtml(a.categoryLabel || a.category)}</span>
        ${a.owner ? `<span class="badge badge-owner">${escHtml(a.owner)}</span>` : ''}
        ${a.reviewFrequency ? `<span class="badge badge-frequency">${escHtml(a.reviewFrequency)}</span>` : ''}
        ${a.mandatory ? '<span class="badge badge-mandatory">Mandatory</span>' : ''}
      </div>
      ${a.description ? `<p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem">${escHtml(a.description)}</p>` : ''}
      ${a.keyContents && a.keyContents.length > 0 ? `
        <div class="artifact-contents"><h5>Key Contents</h5>
          <ul>${a.keyContents.map(k => `<li>${escHtml(k)}</li>`).join('')}</ul>
        </div>` : ''}
    </div>`).join('');
}

// ---- View: Search ----
function renderSearch(query) {
  if (!query) return '<p class="empty-state">Enter a search term to find clauses, controls, and evidence.</p>';
  const q = query.toLowerCase();
  const results = [];

  // Search clauses
  for (const [id, cl] of Object.entries(state.clauses)) {
    if (id.toLowerCase().includes(q) ||
        (cl.sectionTitle && cl.sectionTitle.toLowerCase().includes(q)) ||
        (cl.verbatim && cl.verbatim.toLowerCase().includes(q)) ||
        (cl.translation && cl.translation.toLowerCase().includes(q)) ||
        (cl.keywords && cl.keywords.some(k => k.toLowerCase().includes(q)))) {
      results.push({ type: 'clause', id, data: cl });
    }
  }

  // Search controls
  if (state.controls) {
    for (const [domainId, controls] of Object.entries(state.controls.library)) {
      for (const ctrl of controls) {
        if (ctrl.name.toLowerCase().includes(q) ||
            ctrl.description.toLowerCase().includes(q) ||
            ctrl.slug.toLowerCase().includes(q)) {
          results.push({ type: 'control', id: ctrl.slug, data: ctrl, domainId });
        }
      }
    }
  }

  if (results.length === 0) return `<p class="empty-state">No results match "${escHtml(query)}".</p>`;

  // Group clause results by section
  const clauseResults = results.filter(r => r.type === 'clause');
  const controlResults = results.filter(r => r.type === 'control');

  clauseResults.sort((a, b) => {
    const pa = a.id.split('.').map(Number), pb = b.id.split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  });

  const grouped = {};
  for (const r of clauseResults) {
    const secId = r.id.split('.')[0];
    if (!grouped[secId]) grouped[secId] = { sec: state.sections.find(s => s.id === secId), items: [] };
    grouped[secId].items.push(r);
  }

  let html = `<div class="search-results-header">${results.length} result${results.length !== 1 ? 's' : ''} for "${escHtml(query)}"</div>`;

  // Clause results grouped by section
  for (const g of Object.values(grouped)) {
    if (!g.sec) continue;
    html += `
      <div class="search-group">
        <div class="search-group-title">
          <span class="sec-pill sec-pill-${g.sec.id}">\u00A7${g.sec.id}</span>
          <span style="font-weight:600">${escHtml(g.sec.name)}</span>
        </div>
        <ul class="clause-list">
          ${g.items.map(r => `
            <li><a class="clause-link" href="#${r.id}">
              <span class="clause-id">${r.id}</span>
              <span class="clause-title">${escHtml(r.data.sectionTitle || r.data.verbatim?.slice(0, 80) + '\u2026')}</span>
              <span class="clause-marker marker-${r.data.marker}">${r.data.marker === 'S' ? 'Shall' : 'Should'}</span>
            </a></li>`).join('')}
        </ul>
      </div>`;
  }

  // Control results
  if (controlResults.length > 0) {
    html += `
      <div class="search-group">
        <div class="search-group-title">
          <span class="badge badge-domain">Controls</span>
          <span style="font-weight:600">${controlResults.length} control${controlResults.length !== 1 ? 's' : ''}</span>
        </div>
        <ul class="clause-list">
          ${controlResults.map(r => `
            <li><a class="clause-link" href="#control/${r.id}">
              <span class="clause-title">${escHtml(r.data.name)}</span>
              <span class="badge badge-type">${escHtml(r.data.type)}</span>
            </a></li>`).join('')}
        </ul>
      </div>`;
  }

  return html;
}

// ---- View: Controls Browser ----
function renderControlsBrowser() {
  if (!state.controls) return renderLoading();
  const { domains, library } = state.controls;

  return `
    ${renderBreadcrumbs([{ label: 'Home', hash: '' }, { label: 'Controls Library' }])}
    <h2 style="font-size:1.25rem;margin-bottom:0.5rem">Common Controls Library</h2>
    <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1.5rem">
      ${Object.values(library).reduce((s, arr) => s + arr.length, 0)} controls across ${Object.keys(domains).length} domains. Each control maps to one or more MCIPD clauses.
    </p>
    <div class="accordion">
      ${Object.entries(domains).map(([domainId, domain]) => {
        if (domainId === '_meta') return '';
        const controls = library[domainId] || [];
        return `
          <div class="accordion-item">
            <button class="accordion-trigger" data-accordion>
              <span class="accordion-trigger-left">
                <span>${escHtml(domain.name)}</span>
                <span style="color:var(--text-muted);font-weight:400;font-size:0.8125rem">(${controls.length})</span>
              </span>
              <span class="chevron">\u25B6</span>
            </button>
            <div class="accordion-content">
              <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border)">${escHtml(domain.description)}</p>
              <ul class="clause-list">
                ${controls.map(ctrl => `
                  <li><a class="clause-link" href="#control/${ctrl.slug}">
                    <span class="clause-title">${escHtml(ctrl.name)}</span>
                    <span class="badge badge-type">${escHtml(ctrl.type)}</span>
                    <span style="font-size:0.75rem;color:var(--text-muted)">${ctrl.clauses.length} clause${ctrl.clauses.length !== 1 ? 's' : ''}</span>
                  </a></li>`).join('')}
              </ul>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

// ---- View: Control Detail ----
function renderControlDetail(slug) {
  if (!state.controls) return renderLoading();
  let ctrl = null, domainId = null;
  for (const [did, controls] of Object.entries(state.controls.library)) {
    const found = controls.find(c => c.slug === slug);
    if (found) { ctrl = found; domainId = did; break; }
  }
  if (!ctrl) return '<div class="error-state">Control not found.</div>';
  const domain = state.controls.domains[domainId];

  // ---- Audit Package: linked artifacts ----
  const controlSlug = ctrl.slug;
  const clauses = ctrl.clauses || [];
  const artifactIndex = {};
  if (state.artifacts && state.artifacts.inventory) {
    Object.values(state.artifacts.inventory).forEach(arr => {
      if (Array.isArray(arr)) arr.forEach(a => { artifactIndex[a.slug] = a; });
    });
  }

  // Find artifacts linked via clause map
  const linkedArtifactSlugs = new Set();
  if (state.artifacts && state.artifacts.clauseMap) {
    clauses.forEach(cid => {
      const artSlugs = state.artifacts.clauseMap[cid];
      if (artSlugs) artSlugs.forEach(s => linkedArtifactSlugs.add(s));
    });
  }
  const linkedArtifacts = [...linkedArtifactSlugs].map(s => artifactIndex[s]).filter(Boolean)
    .sort((a, b) => (b.mandatory ? 1 : 0) - (a.mandatory ? 1 : 0));

  // ---- Audit Package: linked evidence ----
  const linkedEvidence = [];
  clauses.forEach(c => {
    const ev = state.evidence?.[c];
    if (ev && ev.evidenceItems) {
      ev.evidenceItems.forEach(item => {
        if (!linkedEvidence.find(e => e.id === item.id)) {
          linkedEvidence.push(item);
        }
      });
    }
  });

  // ---- Build requirements from clause data ----
  const reqLegal = [];
  const reqTechnical = [];
  const reqGovernance = [];
  if (state.requirements) {
    clauses.forEach(cid => {
      const req = state.requirements[cid];
      if (!req) return;
      if (req.business && req.business.requirements) req.business.requirements.forEach(r => reqLegal.push(r.requirement));
      if (req.technology && req.technology.requirements) req.technology.requirements.forEach(r => reqTechnical.push(r.requirement));
      if (req.governance && req.governance.requirements) req.governance.requirements.forEach(r => reqGovernance.push(r.requirement));
    });
  }
  const hasRequirements = reqLegal.length || reqTechnical.length || reqGovernance.length;

  // ---- Build audit package HTML ----
  const auditPackageHTML = (linkedArtifacts.length || linkedEvidence.length) ? `
    <section class="audit-package">
      <h2 class="audit-package-title">
        Audit Package
        <span class="audit-package-counts">
          <span class="badge badge-evidence">${linkedEvidence.length} evidence item${linkedEvidence.length !== 1 ? 's' : ''}</span>
          <span class="badge badge-artifacts">${linkedArtifacts.length} artifact${linkedArtifacts.length !== 1 ? 's' : ''}</span>
        </span>
      </h2>
      ${linkedEvidence.length ? `
      <div class="accordion">
        <div class="accordion-item">
          <button class="accordion-trigger" data-accordion>
            <span>Evidence Checklist (${linkedEvidence.length})</span>
            <span class="accordion-icon">&#9660;</span>
          </button>
          <div class="accordion-content">
            ${linkedEvidence.map(item => `
              <div class="evidence-item">
                <div class="evidence-item-header">
                  <span class="evidence-id">${escHtml(item.id)}</span>
                  <span class="evidence-item-name">${escHtml(item.name)}</span>
                </div>
                ${item.description ? `<p class="evidence-item-desc">${escHtml(item.description)}</p>` : ''}
                ${(item.whatGoodLooksLike && item.whatGoodLooksLike.length) || (item.commonGaps && item.commonGaps.length) ? `
                <div class="evidence-detail-grid">
                  ${item.whatGoodLooksLike && item.whatGoodLooksLike.length ? `
                  <div class="evidence-block evidence-good">
                    <div class="evidence-block-label">What Good Looks Like</div>
                    <ul>${item.whatGoodLooksLike.map(w => `<li>${escHtml(w)}</li>`).join('')}</ul>
                  </div>` : ''}
                  ${item.commonGaps && item.commonGaps.length ? `
                  <div class="evidence-block evidence-gap">
                    <div class="evidence-block-label">Common Gaps</div>
                    <ul>${item.commonGaps.map(g => `<li>${escHtml(g)}</li>`).join('')}</ul>
                  </div>` : ''}
                </div>` : ''}
                <div class="evidence-item-meta">
                  ${item.format ? `<span class="meta-item"><strong>Format:</strong> ${escHtml(item.format)}</span>` : ''}
                  ${item.retentionPeriod ? `<span class="meta-item"><strong>Retention:</strong> ${escHtml(item.retentionPeriod)}</span>` : ''}
                  ${item.suggestedSources && item.suggestedSources.length ? `<span class="meta-item"><strong>Source:</strong> ${item.suggestedSources.map(s => escHtml(s)).join(', ')}</span>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>` : ''}
      ${linkedArtifacts.length ? `
      <div class="accordion">
        <div class="accordion-item">
          <button class="accordion-trigger" data-accordion>
            <span>Required Artifacts (${linkedArtifacts.length})</span>
            <span class="accordion-icon">&#9660;</span>
          </button>
          <div class="accordion-content">
            ${linkedArtifacts.map(a => `
              <div class="artifact-card">
                <div class="artifact-card-header">
                  <span class="artifact-card-name">${escHtml(a.name)}</span>
                  <div class="artifact-card-badges">
                    ${a.mandatory ? '<span class="badge badge-mandatory">Mandatory</span>' : '<span class="badge badge-optional">Optional</span>'}
                    ${a.category ? `<span class="badge badge-category">${escHtml(a.category)}</span>` : ''}
                  </div>
                </div>
                ${a.description ? `<p class="artifact-card-desc">${escHtml(a.description)}</p>` : ''}
                <div class="artifact-card-meta">
                  ${a.owner ? `<span class="meta-item"><strong>Owner:</strong> ${escHtml(a.owner)}</span>` : ''}
                  ${a.reviewFrequency ? `<span class="meta-item"><strong>Review:</strong> ${escHtml(a.reviewFrequency)}</span>` : ''}
                </div>
                ${a.keyContents && a.keyContents.length ? `
                  <div class="artifact-card-contents">
                    <strong>Key Contents:</strong>
                    <ul>${a.keyContents.map(k => `<li>${escHtml(k)}</li>`).join('')}</ul>
                  </div>` : ''}
              </div>`).join('')}
          </div>
        </div>
      </div>` : ''}
    </section>` : '';

  return `
    <article class="control-detail">
    ${renderBreadcrumbs([{ label: 'Home', hash: '' }, { label: 'Controls', hash: 'controls' }, { label: ctrl.name }])}
    ${renderComplianceToggle(slug)}

    <!-- Header -->
    <header class="control-detail-header">
      <div class="control-detail-id-row">
        <span class="badge badge-domain">${escHtml(domain?.name || domainId)}</span>
        <span class="badge badge-type-${ctrl.type === 'preventive' ? 'preventive' : ctrl.type === 'detective' ? 'detective' : 'corrective'}">${escHtml(ctrl.type)}</span>
        ${ctrl.layer ? `<span class="badge badge-category">${escHtml(ctrl.layer)}</span>` : ''}
      </div>
      <h1 class="control-detail-title">${escHtml(ctrl.name)}</h1>
      <p class="control-detail-desc">${escHtml(ctrl.description)}</p>
    </header>

    <!-- Section 1: Requirements -->
    ${hasRequirements ? `
    <section class="detail-section">
      <h2 class="detail-section-title">Requirements</h2>
      <div class="requirements-grid">
        ${reqLegal.length ? `
        <div class="requirement-block requirement-legal">
          <div class="requirement-block-label">Business / Regulatory</div>
          <ul>${reqLegal.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
        </div>` : ''}
        ${reqTechnical.length ? `
        <div class="requirement-block requirement-technical">
          <div class="requirement-block-label">Technical</div>
          <ul>${reqTechnical.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
        </div>` : ''}
        ${reqGovernance.length ? `
        <div class="requirement-block requirement-governance">
          <div class="requirement-block-label">Governance</div>
          <ul>${reqGovernance.map(r => `<li>${escHtml(r)}</li>`).join('')}</ul>
        </div>` : ''}
      </div>
    </section>` : ''}

    <!-- Section 2: Key Activities -->
    ${ctrl.keyActivities && ctrl.keyActivities.length > 0 ? `
    <section class="detail-section">
      <h2 class="detail-section-title">Key Activities</h2>
      <ul class="activity-list">${ctrl.keyActivities.map(a => `<li>${escHtml(a)}</li>`).join('')}</ul>
    </section>` : ''}

    <!-- Section 3: Maturity Levels -->
    ${ctrl.maturity ? `
    <section class="detail-section">
      <h2 class="detail-section-title">Maturity Levels</h2>
      <div class="maturity-grid">
        <div class="maturity-card maturity-basic"><div class="maturity-label">Basic</div><p>${escHtml(ctrl.maturity.basic)}</p></div>
        <div class="maturity-card maturity-mature"><div class="maturity-label">Mature</div><p>${escHtml(ctrl.maturity.mature)}</p></div>
        <div class="maturity-card maturity-advanced"><div class="maturity-label">Advanced</div><p>${escHtml(ctrl.maturity.advanced)}</p></div>
      </div>
    </section>` : ''}

    <!-- Section 4: Audit Package -->
    ${auditPackageHTML}

    <!-- Section 5: Framework Mappings -->
    ${(ctrl.nist || ctrl.iso27001) ? `
    <section class="detail-section">
      <h2 class="detail-section-title">Framework Mappings</h2>
      <div class="fw-mappings">
        ${ctrl.nist && ctrl.nist.length > 0 ? `<div class="fw-mapping-row"><span class="fw-label">NIST CSF 2.0</span><span class="fw-codes">${ctrl.nist.map(n => escHtml(n)).join(', ')}</span></div>` : ''}
        ${ctrl.iso27001 && ctrl.iso27001.length > 0 ? `<div class="fw-mapping-row"><span class="fw-label">ISO 27001</span><span class="fw-codes">${ctrl.iso27001.map(n => escHtml(n)).join(', ')}</span></div>` : ''}
      </div>
    </section>` : ''}

    <!-- Section 6: Source Provisions -->
    ${ctrl.clauses && ctrl.clauses.length > 0 ? `
    <section class="detail-section">
      <h2 class="detail-section-title">Source Provisions</h2>
      <div class="provision-links">
        ${ctrl.clauses.map(cid => {
          const cl = state.clauses[cid];
          return `<a href="#${cid}" class="provision-link">
            <span class="provision-id">${escHtml(cid)}</span>
            <span class="provision-title">${cl ? escHtml(cl.sectionTitle || cl.verbatim?.slice(0, 80)) : ''}</span>
          </a>`;
        }).join('')}
      </div>
    </section>` : ''}

    ${ctrl.toolExamples && ctrl.toolExamples.length > 0 ? `
      <div style="margin-top:0.75rem;font-size:0.8125rem;color:var(--text-muted)">
        Tools: <span style="font-weight:600;color:var(--text-secondary)">${ctrl.toolExamples.map(t => escHtml(t)).join(', ')}</span>
      </div>` : ''}
    </article>`;
}

// ---- View: Risk Management ----
function getRiskBand(score) {
  if (score >= 16) return { label: 'Critical', color: '#ef4444', bg: '#FEF2F2' };
  if (score >= 10) return { label: 'High', color: '#f97316', bg: '#FFF7ED' };
  if (score >= 5)  return { label: 'Medium', color: '#f59e0b', bg: '#FFFBEB' };
  return { label: 'Low', color: '#22c55e', bg: '#F0FDF4' };
}

function renderRiskManagement() {
  const { methodology, matrix, register, checklist, treatment } = state.riskMgmt;
  const tabs = ['Methodology', 'Risk Register', 'Checklist', 'Treatment Options'];

  // Count risks by band
  const riskCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const r of register.risks) {
    riskCounts[getRiskBand(r.inherentRisk.score).label]++;
  }

  return `
    ${renderBreadcrumbs([{ label: 'Home', hash: '' }, { label: 'Risk Management' }])}
    <h2 style="font-size:1.25rem;margin-bottom:0.5rem">Customer Information Risk Management</h2>
    <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.5rem">
      Risk assessment framework and register for Malaysian financial institutions under BNM MCIPD.
    </p>
    <div class="disclaimer">
      This section contains AI-generated indicative content aligned to BNM MCIPD requirements. Risk scores, controls, and treatment plans are illustrative and must be adapted to each organization's specific risk appetite, threat landscape, and board-approved frameworks. Always consult qualified risk and regulatory professionals.
    </div>
    <div class="stats-banner">
      <div class="stat"><div class="stat-value">${register.risks.length}</div><div class="stat-label">Risks</div></div>
      <div class="stat"><div class="stat-value" style="color:#ef4444">${riskCounts.Critical}</div><div class="stat-label">Critical (Inherent)</div></div>
      <div class="stat"><div class="stat-value" style="color:#f97316">${riskCounts.High}</div><div class="stat-label">High (Inherent)</div></div>
      <div class="stat"><div class="stat-value" style="color:#f59e0b">${riskCounts.Medium}</div><div class="stat-label">Medium (Inherent)</div></div>
      <div class="stat"><div class="stat-value" style="color:#22c55e">${riskCounts.Low}</div><div class="stat-label">Low (Inherent)</div></div>
    </div>
    <div class="tabs">
      <div class="tab-list" role="tablist">
        ${tabs.map((t, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-rmtab="${t.toLowerCase().replace(/ /g, '-')}" role="tab">${t}</button>`).join('')}
      </div>
      <div class="tab-panel active" data-rmpanel="methodology">${renderMethodologyTab(methodology, matrix)}</div>
      <div class="tab-panel" data-rmpanel="risk-register">${renderRiskRegisterTab(register)}</div>
      <div class="tab-panel" data-rmpanel="checklist">${renderChecklistTab(checklist)}</div>
      <div class="tab-panel" data-rmpanel="treatment-options">${renderTreatmentOptionsTab(treatment)}</div>
    </div>`;
}

function renderMethodologyTab(methodology, matrix) {
  const { scales, riskRating } = methodology;

  // Build 5x5 matrix — matrix.matrix is array of { likelihood, cells: [{score, rating}] }
  const matrixData = matrix.matrix;
  const xLabels = matrix.axes.x.labels;
  const yLabels = matrix.axes.y.labels;

  let matrixHtml = `
    <h3 style="font-size:1rem;margin-bottom:0.75rem">Risk Assessment Methodology</h3>
    <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:0.5rem">${escHtml(methodology.description)}</p>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
      <span class="badge badge-domain">Framework: ${escHtml(methodology.framework)}</span>
      <span class="badge badge-type">Approach: ${escHtml(methodology.approach)}</span>
    </div>

    <h4 style="font-size:0.9375rem;margin-bottom:0.75rem">5 x 5 Risk Matrix</h4>
    <div style="overflow-x:auto;margin-bottom:1.5rem">
      <table class="risk-matrix-table">
        <thead>
          <tr>
            <th class="risk-matrix-corner">${escHtml(matrix.axes.y.label)} \\ ${escHtml(matrix.axes.x.label)}</th>
            ${xLabels.map(l => `<th class="risk-matrix-header">${escHtml(l)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${matrixData.slice().reverse().map(row => {
            const yLabel = row.likelihoodLabel;
            return `
            <tr>
              <td class="risk-matrix-row-label">${escHtml(yLabel)}</td>
              ${row.cells.map(cell => {
                const band = getRiskBand(cell.score);
                return `<td class="risk-matrix-cell" style="background:${band.bg};color:${band.color};font-weight:700;border:2px solid ${band.color}22">${cell.score}<div class="risk-matrix-cell-label">${band.label}</div></td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:2rem">
      ${riskRating.bands.map(b => `
        <div style="display:flex;align-items:center;gap:0.375rem;font-size:0.8125rem">
          <span style="width:12px;height:12px;border-radius:3px;background:${b.color};display:inline-block"></span>
          <strong>${escHtml(b.label)}</strong> (${b.range[0]}-${b.range[1]}):
          <span style="color:var(--text-secondary)">${escHtml(b.action)}</span>
        </div>`).join('')}
    </div>`;

  // Likelihood scale
  matrixHtml += `
    <div class="accordion">
      <div class="accordion-item">
        <button class="accordion-trigger" data-accordion>
          <span class="accordion-trigger-left"><span>Likelihood Scale</span></span>
          <span class="chevron">\u25B6</span>
        </button>
        <div class="accordion-content">
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>Score</th><th>Label</th><th>Description</th><th>Frequency</th></tr></thead>
              <tbody>
                ${scales.likelihood.levels.map(l => `
                  <tr>
                    <td style="font-weight:700;text-align:center">${l.score}</td>
                    <td style="font-weight:600">${escHtml(l.label)}</td>
                    <td>${escHtml(l.description)}</td>
                    <td style="white-space:nowrap;font-size:0.8125rem">${escHtml(l.frequency)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="accordion-item">
        <button class="accordion-trigger" data-accordion>
          <span class="accordion-trigger-left"><span>Impact Scale</span></span>
          <span class="chevron">\u25B6</span>
        </button>
        <div class="accordion-content">
          <div style="overflow-x:auto">
            <table class="data-table">
              <thead><tr><th>Score</th><th>Label</th><th>Description</th><th>Examples</th></tr></thead>
              <tbody>
                ${scales.impact.levels.map(l => `
                  <tr>
                    <td style="font-weight:700;text-align:center">${l.score}</td>
                    <td style="font-weight:600">${escHtml(l.label)}</td>
                    <td>${escHtml(l.description)}</td>
                    <td style="font-size:0.8125rem">${l.examples.map(e => escHtml(e)).join(', ')}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  return matrixHtml;
}

function renderRiskRegisterTab(register) {
  const risks = register.risks;
  const categories = [...new Set(risks.map(r => r.category))];

  return `
    <h3 style="font-size:1rem;margin-bottom:0.5rem">Customer Information Risk Register <span class="badge badge-ai" title="AI-generated indicative risk register">AI Generated</span></h3>
    <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:1rem">${escHtml(register.description)}. ${risks.length} risks across ${categories.length} categories.</p>
    <div class="risk-register-filters" style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">
      <button class="risk-filter-btn active" data-risk-filter="all">All (${risks.length})</button>
      ${categories.map(cat => {
        const count = risks.filter(r => r.category === cat).length;
        return `<button class="risk-filter-btn" data-risk-filter="${escHtml(cat)}">${escHtml(cat)} (${count})</button>`;
      }).join('')}
    </div>
    <div style="overflow-x:auto">
      <table class="data-table risk-register-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Risk</th>
            <th>Category</th>
            <th>Clauses</th>
            <th>Inherent</th>
            <th>Residual</th>
          </tr>
        </thead>
        <tbody>
          ${risks.map(r => {
            const iBand = getRiskBand(r.inherentRisk.score);
            const rBand = getRiskBand(r.residualRisk.score);
            return `
              <tr class="risk-row" data-category="${escHtml(r.category)}" data-risk-id="${escHtml(r.id)}">
                <td class="mono" style="white-space:nowrap;font-weight:600">${escHtml(r.id)}</td>
                <td>
                  <div style="font-weight:500">${escHtml(r.name)}</div>
                  <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.125rem">${escHtml(r.description?.slice(0, 120) + (r.description?.length > 120 ? '\u2026' : ''))}</div>
                </td>
                <td><span class="badge badge-domain">${escHtml(r.category)}</span></td>
                <td style="font-size:0.75rem;white-space:nowrap">${(r.applicableClauses || []).slice(0, 3).join(', ')}${(r.applicableClauses || []).length > 3 ? '\u2026' : ''}</td>
                <td>
                  <span class="risk-score-badge" style="background:${iBand.bg};color:${iBand.color};border:1px solid ${iBand.color}33">
                    ${r.inherentRisk.score} ${iBand.label}
                  </span>
                </td>
                <td>
                  <span class="risk-score-badge" style="background:${rBand.bg};color:${rBand.color};border:1px solid ${rBand.color}33">
                    ${r.residualRisk.score} ${rBand.label}
                  </span>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div id="risk-detail-panel" class="risk-detail-panel" style="display:none"></div>`;
}

function renderRiskDetailPanel(riskId) {
  const r = state.riskMgmt.register.risks.find(r => r.id === riskId);
  if (!r) return '';
  const iBand = getRiskBand(r.inherentRisk.score);
  const rBand = getRiskBand(r.residualRisk.score);

  return `
    <div class="risk-detail-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem">
        <h4 style="font-size:1rem">
          <span class="mono" style="color:var(--purple)">${escHtml(r.id)}</span>
          ${escHtml(r.name)}
        </h4>
        <button class="risk-detail-close" data-close-risk style="background:none;border:1px solid var(--border);border-radius:4px;padding:0.25rem 0.5rem;cursor:pointer;font-size:0.75rem;color:var(--text-muted)">Close</button>
      </div>
      <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:1rem">${escHtml(r.description)}</p>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1rem">
        <span class="badge badge-domain">${escHtml(r.category)}</span>
        <span class="badge badge-layer">${escHtml(r.domain)}</span>
        <span class="badge badge-owner">Owner: ${escHtml(r.riskOwner)}</span>
        <span class="badge badge-frequency">Review: ${escHtml(r.reviewDate)}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
        <div style="background:${iBand.bg};border:1px solid ${iBand.color}33;border-radius:var(--radius);padding:1rem">
          <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${iBand.color};margin-bottom:0.375rem">Inherent Risk</div>
          <div style="font-size:1.5rem;font-weight:700;color:${iBand.color}">${r.inherentRisk.score} <span style="font-size:0.875rem">${iBand.label}</span></div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">L${r.inherentRisk.likelihood} x I${r.inherentRisk.impact}</div>
        </div>
        <div style="background:${rBand.bg};border:1px solid ${rBand.color}33;border-radius:var(--radius);padding:1rem">
          <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${rBand.color};margin-bottom:0.375rem">Residual Risk</div>
          <div style="font-size:1.5rem;font-weight:700;color:${rBand.color}">${r.residualRisk.score} <span style="font-size:0.875rem">${rBand.label}</span></div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">L${r.residualRisk.likelihood} x I${r.residualRisk.impact}</div>
        </div>
      </div>
      <div style="margin-bottom:1rem">
        <h5 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:0.375rem">Existing Controls</h5>
        <ul style="list-style:disc;padding-left:1.25rem">
          ${(r.existingControls || []).map(c => `<li style="font-size:0.8125rem;color:var(--text-secondary);padding:0.125rem 0">${escHtml(c)}</li>`).join('')}
        </ul>
      </div>
      <div style="background:var(--bg);border-radius:var(--radius);padding:1rem">
        <h5 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:0.375rem">Treatment Plan</h5>
        <p style="font-size:0.8125rem;color:var(--text-secondary)">${escHtml(r.treatmentPlan)}</p>
      </div>
      ${r.applicableClauses && r.applicableClauses.length ? `
      <div style="margin-top:1rem;font-size:0.8125rem;color:var(--text-muted)">
        Applicable Clauses: ${r.applicableClauses.map(c => `<a href="#${c}" style="font-family:var(--font-mono)">${escHtml(c)}</a>`).join(', ')}
      </div>` : ''}
    </div>`;
}

function renderChecklistTab(checklist) {
  const totalItems = checklist.sections.reduce((s, sec) => s + sec.items.length, 0);

  return `
    <h3 style="font-size:1rem;margin-bottom:0.5rem">${escHtml(checklist.title)} <span class="badge badge-ai" title="AI-generated indicative checklist">AI Generated</span></h3>
    <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:1rem">${escHtml(checklist.description)}</p>
    <div class="checklist-progress">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.375rem">
        <span style="font-size:0.8125rem;font-weight:600;color:var(--text-secondary)">Progress</span>
        <span class="checklist-progress-text" style="font-size:0.8125rem;color:var(--text-muted)">0 / ${totalItems} completed</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
        <div class="checklist-progress-bar"></div>
      </div>
    </div>
    <div class="accordion">
      ${checklist.sections.map(section => `
        <div class="accordion-item open">
          <button class="accordion-trigger" data-accordion>
            <span class="accordion-trigger-left">
              <span>${escHtml(section.section)}</span>
              <span style="color:var(--text-muted);font-weight:400;font-size:0.8125rem">(${section.items.length} items)</span>
            </span>
            <span class="chevron">\u25B6</span>
          </button>
          <div class="accordion-content">
            ${section.items.map(item => `
              <label class="checklist-item" style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.625rem 0;border-bottom:1px solid var(--border);cursor:pointer">
                <input type="checkbox" class="checklist-checkbox" data-checklist-id="${escHtml(item.id)}">
                <div style="flex:1">
                  <div style="display:flex;align-items:baseline;gap:0.5rem;flex-wrap:wrap">
                    <span class="mono" style="font-size:0.75rem;color:var(--purple);font-weight:600">${escHtml(item.id)}</span>
                    <span style="font-size:0.875rem;color:var(--text-primary)">${escHtml(item.question)}</span>
                  </div>
                  <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.125rem">Evidence: ${escHtml(item.evidenceExpected)}</div>
                </div>
              </label>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

function renderTreatmentOptionsTab(treatment) {
  const strategyColors = {
    'avoid': { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B' },
    'mitigate': { bg: '#EFF6FF', border: '#2563EB', text: '#1E40AF' },
    'transfer': { bg: '#F5F3FF', border: '#7C3AED', text: '#5B21B6' },
    'accept': { bg: '#FFFBEB', border: '#D97706', text: '#92400E' },
  };

  return `
    <h3 style="font-size:1rem;margin-bottom:0.5rem">${escHtml(treatment.title)}</h3>
    <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:1.5rem">${escHtml(treatment.description)}</p>
    <div class="treatment-grid">
      ${treatment.treatmentStrategies.map(opt => {
        const colors = strategyColors[opt.strategy] || { bg: 'var(--bg)', border: 'var(--border)', text: 'var(--text-primary)' };
        return `
          <div class="treatment-card" style="background:${colors.bg};border:1px solid ${colors.border}33;border-left:4px solid ${colors.border}">
            <h4 style="color:${colors.text};font-size:1rem;margin-bottom:0.375rem">${escHtml(opt.label)}</h4>
            <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem">${escHtml(opt.description)}</p>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.75rem;padding:0.5rem;background:rgba(255,255,255,0.5);border-radius:4px">
              <strong>When to use:</strong> ${escHtml(opt.applicability)}
            </div>
            <div style="margin-bottom:0.75rem">
              <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);margin-bottom:0.25rem">Examples</div>
              <ul style="list-style:disc;padding-left:1.25rem">
                ${(opt.examples || []).map(e => `<li style="font-size:0.8125rem;color:var(--text-secondary);padding:0.125rem 0">${escHtml(e)}</li>`).join('')}
              </ul>
            </div>
            ${opt.considerations && opt.considerations.length ? `
            <div style="font-size:0.75rem;color:var(--text-muted);padding-top:0.5rem;border-top:1px solid ${colors.border}22">
              <strong>Considerations:</strong> ${opt.considerations.map(c => escHtml(c)).join('; ')}
            </div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
}

// ---- View: Reference ----
function renderReference() {
  return `
    ${renderBreadcrumbs([{ label: 'Home', hash: '' }, { label: 'Reference' }])}
    <h2 style="font-size:1.25rem;margin-bottom:0.5rem">Reference</h2>
    <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1rem">
      Cross-framework mappings and supplementary references for BNM MCIPD compliance.
    </p>
    <div class="sub-tabs">
      <button class="sub-tab active" data-sub="cross-references">Cross-References</button>
      <button class="sub-tab" data-sub="framework-mappings">Framework Mappings</button>
    </div>
    <div class="sub-panel active" data-subpanel="cross-references">${renderCrossReferencesPanel()}</div>
    <div class="sub-panel" data-subpanel="framework-mappings">${renderFrameworkMappingsPanel()}</div>`;
}

function renderCrossReferencesPanel() {
  if (!state.xrefs) return '<p class="empty-state">Loading cross-reference data...</p>';

  const { rmit, pdpa, dataprotection } = state.xrefs;
  let html = '';

  // RMIT mappings
  if (rmit && rmit.mappings) {
    html += `
      <h3 style="font-size:1rem;margin-bottom:0.5rem;margin-top:1rem">MCIPD \u2194 RMiT Mappings</h3>
      <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem">${escHtml(rmit.relationship)}</p>
      ${rmit.mappings.map(m => `
        <div class="xref-card">
          <span class="xref-source">MCIPD ${escHtml(m.mcipd)}</span>
          <span class="xref-target">RMiT: ${(m.rmit || []).join(', ')}</span>
          <span class="badge badge-domain">${escHtml(m.domain)}</span>
        </div>`).join('')}`;
  }

  // PDPA mappings
  if (pdpa && pdpa.mappings) {
    html += `
      <h3 style="font-size:1rem;margin-bottom:0.5rem;margin-top:1.5rem">MCIPD \u2194 PDPA Mappings</h3>
      <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem">${escHtml(pdpa.relationship)}</p>
      ${pdpa.mappings.map(m => `
        <div class="xref-card">
          <span class="xref-source">MCIPD ${escHtml(m.mcipd)}</span>
          <span class="xref-target">PDPA: ${(m.pdpa || []).join(', ')}</span>
          <span class="badge badge-domain">${escHtml(m.domain)}</span>
        </div>`).join('')}`;
  }

  // Data Protection mappings
  if (dataprotection && dataprotection.mappings) {
    html += `
      <h3 style="font-size:1rem;margin-bottom:0.5rem;margin-top:1.5rem">MCIPD \u2194 Data Protection Domains</h3>
      <p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:0.75rem">${escHtml(dataprotection.relationship)}</p>
      ${dataprotection.mappings.map(m => `
        <div class="xref-card">
          <span class="xref-source">MCIPD ${escHtml(m.mcipd)}</span>
          <span class="xref-target">${escHtml(m.dpDomain)}: ${escHtml(m.dpDomainName)}</span>
          <span class="badge badge-domain">${escHtml(m.dpDomainName)}</span>
        </div>`).join('')}`;
  }

  return html || '<p class="empty-state">No cross-reference data available.</p>';
}

function renderFrameworkMappingsPanel() {
  if (!state.controls) return '<p class="empty-state">No controls data loaded.</p>';
  const mappings = [];
  for (const [domainId, controls] of Object.entries(state.controls.library)) {
    for (const ctrl of controls) {
      if (ctrl.nist && ctrl.nist.length) {
        ctrl.nist.forEach(n => mappings.push({ source: ctrl.name, target: n, framework: 'NIST CSF 2.0' }));
      }
      if (ctrl.iso27001 && ctrl.iso27001.length) {
        ctrl.iso27001.forEach(n => mappings.push({ source: ctrl.name, target: n, framework: 'ISO 27001' }));
      }
    }
  }

  if (!mappings.length) return '<p class="empty-state">No cross-framework mappings available.</p>';

  return `
    <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1rem">${mappings.length} cross-framework mappings found from MCIPD controls to NIST CSF 2.0 and ISO 27001.</p>
    ${mappings.map(m => `
      <div class="xref-card">
        <span class="xref-source">${escHtml(m.source)}</span>
        <span class="xref-target">${escHtml(m.framework)}: ${escHtml(m.target)}</span>
      </div>`).join('')}`;
}

// ---- Nav Update ----
function updateNav() {
  document.querySelectorAll('.nav-link').forEach(el => {
    const view = el.dataset.view;
    el.classList.toggle('active', view === state.route.view ||
      (view === 'framework' && state.route.view === 'framework') ||
      (view === 'framework' && state.route.view === 'framework-detail') ||
      (view === 'framework' && state.route.view === 'section') ||
      (view === 'framework' && state.route.view === 'clause') ||
      (view === 'controls' && state.route.view === 'control-detail') ||
      (view === 'risk-management' && state.route.view === 'risk-management') ||
      (view === 'reference' && state.route.view === 'reference')
    );
  });
}

// ---- Main Render ----
async function render() {
  const app = document.getElementById('app');
  const route = state.route;
  updateNav();

  if (!state.sections || !state.clauses) {
    app.innerHTML = renderLoading();
    try {
      const [sectionsData, clausesArr, controlDomains, controlLibrary, controlClauseMap, artifactInventory, artifactClauseMap] = await Promise.all([
        fetchJSON('clauses/sections.json'),
        fetchJSON('clauses/index.json'),
        fetchJSON('controls/domains.json'),
        fetchJSON('controls/library.json'),
        fetchJSON('controls/clause-map.json'),
        fetchJSON('artifacts/inventory.json'),
        fetchJSON('artifacts/clause-map.json'),
      ]);
      state.sectionsData = sectionsData;
      // Convert array to keyed object
      state.clauses = {};
      for (const cl of clausesArr) state.clauses[cl.id] = cl;
      // Build sections
      state.sections = buildSections(sectionsData, clausesArr);
      if (controlDomains && controlLibrary && controlClauseMap) {
        state.controls = buildControlsState(controlDomains, controlLibrary, controlClauseMap);
      }
      if (artifactInventory && artifactClauseMap) {
        state.artifacts = { inventory: artifactInventory, clauseMap: artifactClauseMap.clauseToArtifacts };
      }
    } catch (err) {
      app.innerHTML = `<div class="error-state">Failed to load data: ${escHtml(err.message)}</div>`;
      return;
    }
  }

  let content = '';
  switch (route.view) {
    case 'overview': content = renderOverview(); break;
    case 'framework': content = renderFramework(); break;
    case 'framework-detail': content = renderSection(route.id); break;
    case 'section': content = renderSection(route.id); break;
    case 'clause': content = renderClause(route.id); break;
    case 'search': content = renderSearch(route.query); break;
    case 'controls':
    case 'control-detail':
      if (!state.controls) {
        app.innerHTML = `<div class="main">${renderLoading()}</div>`;
        try {
          const [domains, library, clauseMap] = await Promise.all([
            fetchJSON('controls/domains.json'),
            fetchJSON('controls/library.json'),
            fetchJSON('controls/clause-map.json'),
          ]);
          state.controls = buildControlsState(domains, library, clauseMap);
        } catch (err) {
          app.innerHTML = `<div class="main"><div class="error-state">Failed to load controls: ${escHtml(err.message)}</div></div>`;
          return;
        }
      }
      if (route.view === 'control-detail') {
        if (!state.artifacts) {
          const [inventory, clauseMap] = await Promise.all([
            fetchJSON('artifacts/inventory.json'),
            fetchJSON('artifacts/clause-map.json'),
          ]);
          if (inventory && clauseMap) {
            state.artifacts = { inventory, clauseMap: clauseMap.clauseToArtifacts };
          }
        }
        if (!state.evidence) {
          state.evidence = await fetchJSON('evidence/index.json');
        }
        if (!state.requirements) {
          state.requirements = await fetchJSON('requirements/index.json');
        }
      }
      content = route.view === 'controls' ? renderControlsBrowser() : renderControlDetail(route.slug);
      break;
    case 'risk-management':
      if (!state.riskMgmt) {
        app.innerHTML = `<div class="main">${renderLoading()}</div>`;
        try {
          const [methodology, matrix, register, checklist, treatment] = await Promise.all([
            fetchJSON('risk-management/methodology.json'),
            fetchJSON('risk-management/risk-matrix.json'),
            fetchJSON('risk-management/risk-register.json'),
            fetchJSON('risk-management/checklist.json'),
            fetchJSON('risk-management/treatment-options.json'),
          ]);
          state.riskMgmt = { methodology, matrix, register, checklist, treatment };
        } catch (err) {
          app.innerHTML = `<div class="main"><div class="error-state">Failed to load risk management data: ${escHtml(err.message)}</div></div>`;
          return;
        }
      }
      content = renderRiskManagement();
      break;
    case 'reference':
      if (!state.xrefs) {
        app.innerHTML = `<div class="main">${renderLoading()}</div>`;
        try {
          const [rmit, pdpa, dataprotection] = await Promise.all([
            fetchJSON('cross-references/mcipd-to-rmit.json'),
            fetchJSON('cross-references/mcipd-to-pdpa.json'),
            fetchJSON('cross-references/mcipd-to-dataprotection.json'),
          ]);
          state.xrefs = { rmit, pdpa, dataprotection };
        } catch (err) {
          // Non-fatal — render what we have
          state.xrefs = { rmit: null, pdpa: null, dataprotection: null };
        }
      }
      content = renderReference();
      break;
    default: content = renderOverview();
  }

  app.innerHTML = `<div class="main">${content}</div>`;

  const searchInput = document.getElementById('search-input');
  if (searchInput && route.view === 'search') searchInput.value = route.query || '';
}

// ---- Tab Lazy Loading ----
async function activateTab(tabName, clauseId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tabName));

  const panel = document.querySelector(`[data-panel="${tabName}"]`);
  if (!panel || !panel.querySelector('.loading')) return;

  try {
    switch (tabName) {
      case 'requirements':
        if (!state.requirements) state.requirements = await fetchJSON('requirements/index.json');
        panel.innerHTML = renderRequirementsTab(clauseId);
        break;
      case 'evidence':
        if (!state.evidence) state.evidence = await fetchJSON('evidence/index.json');
        panel.innerHTML = renderEvidenceTab(clauseId);
        break;
      case 'controls':
        if (!state.controls) {
          const [domains, library, clauseMap] = await Promise.all([
            fetchJSON('controls/domains.json'),
            fetchJSON('controls/library.json'),
            fetchJSON('controls/clause-map.json'),
          ]);
          state.controls = buildControlsState(domains, library, clauseMap);
        }
        panel.innerHTML = renderControlsTab(clauseId);
        break;
      case 'artifacts':
        if (!state.artifacts) {
          const [inventory, clauseMap] = await Promise.all([
            fetchJSON('artifacts/inventory.json'),
            fetchJSON('artifacts/clause-map.json'),
          ]);
          state.artifacts = { inventory, clauseMap: clauseMap.clauseToArtifacts };
        }
        panel.innerHTML = renderArtifactsTab(clauseId);
        break;
    }
  } catch (err) {
    panel.innerHTML = `<div class="error-state">Failed to load: ${escHtml(err.message)}</div>`;
  }
}

// ---- Events ----
function setupEvents() {
  window.addEventListener('hashchange', () => { state.route = parseHash(); render(); });

  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-nav]');
    if (card) { e.preventDefault(); navigate(card.dataset.nav); return; }
    const acc = e.target.closest('[data-accordion]');
    if (acc) { const item = acc.closest('.accordion-item'); if (item) item.classList.toggle('open'); return; }
    const tab = e.target.closest('.tab-btn');
    if (tab) {
      if (tab.dataset.rmtab) {
        // Risk management tabs
        document.querySelectorAll('[data-rmtab]').forEach(b => b.classList.toggle('active', b.dataset.rmtab === tab.dataset.rmtab));
        document.querySelectorAll('[data-rmpanel]').forEach(p => p.classList.toggle('active', p.dataset.rmpanel === tab.dataset.rmtab));
        return;
      }
      activateTab(tab.dataset.tab, state.route.id);
      return;
    }

    // Risk register row click
    const riskRow = e.target.closest('.risk-row');
    if (riskRow) {
      const riskId = riskRow.dataset.riskId;
      const panel = document.getElementById('risk-detail-panel');
      if (panel) {
        if (panel.style.display === 'block' && panel.dataset.currentRisk === riskId) {
          panel.style.display = 'none';
          panel.dataset.currentRisk = '';
        } else {
          panel.innerHTML = renderRiskDetailPanel(riskId);
          panel.style.display = 'block';
          panel.dataset.currentRisk = riskId;
          panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
      return;
    }

    // Risk detail close button
    if (e.target.closest('[data-close-risk]')) {
      const panel = document.getElementById('risk-detail-panel');
      if (panel) { panel.style.display = 'none'; panel.dataset.currentRisk = ''; }
      return;
    }

    // Sub-tab clicks
    const subTab = e.target.closest('.sub-tab');
    if (subTab) {
      const subName = subTab.dataset.sub;
      subTab.closest('.sub-tabs').querySelectorAll('.sub-tab').forEach(b => b.classList.toggle('active', b === subTab));
      document.querySelectorAll('.sub-panel').forEach(p => p.classList.toggle('active', p.dataset.subpanel === subName));
      return;
    }

    // Risk filter buttons
    const filterBtn = e.target.closest('.risk-filter-btn');
    if (filterBtn) {
      const filter = filterBtn.dataset.riskFilter;
      document.querySelectorAll('.risk-filter-btn').forEach(b => b.classList.toggle('active', b === filterBtn));
      document.querySelectorAll('.risk-row').forEach(row => {
        row.style.display = (filter === 'all' || row.dataset.category === filter) ? '' : 'none';
      });
      const panel = document.getElementById('risk-detail-panel');
      if (panel) { panel.style.display = 'none'; panel.dataset.currentRisk = ''; }
      return;
    }
  });

  // Checklist checkbox change
  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('checklist-checkbox')) {
      const total = document.querySelectorAll('.checklist-checkbox').length;
      const checked = document.querySelectorAll('.checklist-checkbox:checked').length;
      const progressText = document.querySelector('.checklist-progress-text');
      const progressBar = document.querySelector('.checklist-progress-bar');
      if (progressText) progressText.textContent = `${checked} / ${total} completed`;
      if (progressBar) progressBar.style.width = `${total > 0 ? (checked / total) * 100 : 0}%`;
      const label = e.target.closest('.checklist-item');
      if (label) label.style.opacity = e.target.checked ? '0.6' : '1';
    }
  });

  let searchTimeout;
  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-input') {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const val = e.target.value.trim();
        navigate(val ? `search/${encodeURIComponent(val)}` : '');
      }, 300);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'search-input' && e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimeout);
      const val = e.target.value.trim();
      if (val) navigate(`search/${encodeURIComponent(val)}`);
    }
  });
}

function init() {
  state.route = parseHash();
  setupEvents();
  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// === Export Functions ===

function exportToPDF() {
  document.body.classList.add('printing');
  window.print();
  document.body.classList.remove('printing');
}

function exportToCSV() {
  const view = state.route.view;
  let data = [];
  let filename = `mcipd-export-${view}-${new Date().toISOString().slice(0,10)}.csv`;

  if (view === 'controls') {
    const lib = state.controls ? state.controls.library : {};
    for (const [domainId, controls] of Object.entries(lib)) {
      for (const c of controls) {
        data.push({
          Slug: c.slug || '',
          Name: c.name,
          Domain: domainId,
          Type: c.type || '',
          Layer: c.layer || '',
          Description: (c.description || '').replace(/\n/g, ' '),
          Clauses: (c.clauses || []).join('; ')
        });
      }
    }
  } else if (view === 'risk-management') {
    const risks = state.riskMgmt?.register?.risks || [];
    data = risks.map(r => ({
      ID: r.id,
      Name: r.name,
      Category: r.category,
      Domain: r.domain,
      InherentScore: r.inherentRisk.score,
      InherentRating: r.inherentRisk.rating,
      ResidualScore: r.residualRisk.score,
      ResidualRating: r.residualRisk.rating,
      RiskOwner: r.riskOwner
    }));
  } else {
    alert('CSV export is available for Controls and Risk Register views.');
    return;
  }

  if (data.length === 0) {
    alert('No data found to export.');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// === Compliance Gap Tracker Logic ===

function getComplianceStatus(slug) {
  const data = JSON.parse(localStorage.getItem('mcipd_compliance_status') || '{}');
  return data[slug] || 'pending';
}

function setComplianceStatus(slug, status) {
  const data = JSON.parse(localStorage.getItem('mcipd_compliance_status') || '{}');
  data[slug] = status;
  localStorage.setItem('mcipd_compliance_status', JSON.stringify(data));
  render();
}

function renderComplianceToggle(slug) {
  const status = getComplianceStatus(slug);
  const options = [
    { id: 'pending', label: 'Pending', color: '#64748b' },
    { id: 'compliant', label: 'Compliant', color: '#22c55e' },
    { id: 'gap', label: 'Gap (Non-Compliant)', color: '#ef4444' },
    { id: 'na', label: 'Not Applicable', color: '#94a3b8' }
  ];

  const current = options.find(o => o.id === status);

  return `
    <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:1.25rem; margin-bottom:1.5rem; display:flex; align-items:center; gap:1.5rem; flex-wrap:wrap">
      <div>
        <div style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.35rem">Compliance Status</div>
        <div style="font-size:1.1rem; font-weight:700; color:${current.color}">
          ${current.label}
        </div>
      </div>
      <div style="margin-left:auto; display:flex; gap:0.5rem; flex-wrap:wrap">
        ${options.map(o => `
          <button
            onclick="setComplianceStatus('${slug}', '${o.id}')"
            style="cursor:pointer; border:1px solid ${status === o.id ? o.color : 'var(--border)'}; background:${status === o.id ? o.color + '15' : 'var(--surface)'}; color:${status === o.id ? o.color : 'var(--text-secondary)'}; padding:0.4rem 0.75rem; border-radius:6px; font-size:0.75rem; font-weight:600; font-family:var(--font-sans); transition:all 0.2s"
          >${o.label}</button>
        `).join('')}
      </div>
    </div>
  `;
}
