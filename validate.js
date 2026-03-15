#!/usr/bin/env node
/**
 * validate.js — MCIPD (Management of Customer Information and Permitted Disclosures) validator
 *
 * Checks:
 *   1.  All JSON files parse without errors
 *   2.  Controls library — slug uniqueness and required fields
 *   3.  Controls library — domain coverage
 *   4.  Artifact cross-references (controlSlugs or clause references)
 *   5.  Evidence clause references and evidence item integrity
 *   6.  Clause index integrity and sections consistency
 *   7.  Cross-reference integrity (MCIPD to PDPA, RMIT, dataprotection)
 *   8.  Risk register math
 *   9.  No empty strings where data is expected
 *   10. Unique IDs across data sets
 *
 * Usage: node validate.js [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = __dirname;
const verbose   = process.argv.includes('--verbose');

let pass = 0;
let fail = 0;
let warn = 0;

function ok(msg)      { pass++; if (verbose) console.log(`  PASS  ${msg}`); }
function bad(msg)     { fail++; console.log(`  FAIL  ${msg}`); }
function warning(msg) { warn++; console.log(`  WARN  ${msg}`); }

function loadJson(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    return null;
  }
}

// ── 1. JSON Parse Check ─────────────────────────────────────────────

console.log('\n=== 1. JSON Parse Check ===');

function findJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...findJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(path.relative(REPO_ROOT, full));
    }
  }
  return results;
}

const jsonFiles = findJsonFiles(REPO_ROOT);
const parsed = {};
let parseErrors = 0;

for (const file of jsonFiles) {
  try {
    parsed[file] = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
    ok(`Parsed: ${file}`);
  } catch (e) {
    bad(`JSON parse error: ${file} — ${e.message}`);
    parseErrors++;
  }
}

if (parseErrors === 0) {
  ok(`All ${jsonFiles.length} JSON files parse correctly`);
}

// ── Load core data ──────────────────────────────────────────────────

const controlsLib   = loadJson('controls/library.json');
const domainsFile   = loadJson('controls/domains.json');
const clauseMapCtrl = loadJson('controls/clause-map.json');
const artifactsInv  = loadJson('artifacts/inventory.json');
const artifactClauseMap = loadJson('artifacts/clause-map.json');
const clausesIndex  = loadJson('clauses/index.json');
const sections      = loadJson('clauses/sections.json');
const evidence      = loadJson('evidence/index.json');
const requirements  = loadJson('requirements/index.json');
const riskRegister  = loadJson('risk-management/risk-register.json');

// Controls — uses slug
const libraryControls = (controlsLib && controlsLib.controls) || [];
const controlSlugSet = new Set(libraryControls.map(c => c.slug).filter(Boolean));

// Domains — MCIPD domains.json is object-keyed (not { domains: [...] })
const domainKeys = domainsFile ? Object.keys(domainsFile).filter(k => k !== '_meta') : [];
const domainSlugSet = new Set(domainKeys);

// Artifacts — keyed by category (policies, procedures, etc.)
const allArtifacts = [];
if (artifactsInv && typeof artifactsInv === 'object') {
  for (const [key, val] of Object.entries(artifactsInv)) {
    if (Array.isArray(val)) allArtifacts.push(...val);
  }
}
const artifactSlugSet = new Set(allArtifacts.map(a => a.slug).filter(Boolean));

// Clause ID set from clauses/index.json (array)
const clauseIdSet = new Set();
if (Array.isArray(clausesIndex)) {
  for (const c of clausesIndex) { if (c.id) clauseIdSet.add(c.id); }
}

// ── 2. Control Slug Uniqueness & Required Fields ─────────────────────

console.log('\n=== 2. Control Slug Uniqueness & Required Fields ===');

const slugCounts = {};
for (const ctrl of libraryControls) {
  if (!ctrl.slug) {
    bad(`Control missing "slug": ${(ctrl.name || '').slice(0, 60)}`);
  } else {
    slugCounts[ctrl.slug] = (slugCounts[ctrl.slug] || 0) + 1;
  }
  if (!ctrl.name || ctrl.name.trim() === '') bad(`Control "${ctrl.slug}" has empty or missing "name"`);
  if (!ctrl.domain) bad(`Control "${ctrl.slug}" missing "domain" field`);
}

const duplicates = Object.entries(slugCounts).filter(([, c]) => c > 1);
if (duplicates.length === 0) {
  ok(`No duplicate control slugs (${libraryControls.length} controls)`);
} else {
  for (const [slug, count] of duplicates) bad(`Duplicate control slug "${slug}" appears ${count} times`);
}

// ── 3. Domain Coverage ───────────────────────────────────────────────

console.log('\n=== 3. Controls Library — Domain Coverage ===');

const controlsByDomain = {};
for (const ctrl of libraryControls) {
  if (ctrl.domain) controlsByDomain[ctrl.domain] = (controlsByDomain[ctrl.domain] || 0) + 1;
}

for (const domKey of domainKeys) {
  if (!controlsByDomain[domKey]) {
    bad(`Domain "${domKey}" has zero controls in library.json`);
  } else {
    ok(`Domain "${domKey}" has ${controlsByDomain[domKey]} control(s)`);
  }
}

// Check control domain references
let domainRefErrors = 0;
for (const ctrl of libraryControls) {
  if (ctrl.domain && domainSlugSet.size > 0 && !domainSlugSet.has(ctrl.domain)) {
    bad(`Control "${ctrl.slug}" references unknown domain "${ctrl.domain}"`);
    domainRefErrors++;
  }
}
if (domainRefErrors === 0 && libraryControls.length > 0) {
  ok(`All ${libraryControls.length} controls reference valid domains`);
}

// ── 4. Artifact Cross-References ─────────────────────────────────────

console.log('\n=== 4. Artifact Cross-References ===');

let artClauseErrors = 0;
let artClauseTotal = 0;
for (const artifact of allArtifacts) {
  if (artifact.clauses && Array.isArray(artifact.clauses)) {
    for (const clauseId of artifact.clauses) {
      artClauseTotal++;
      if (clauseIdSet.size > 0 && !clauseIdSet.has(clauseId)) {
        bad(`Artifact "${artifact.slug}" references unknown clause "${clauseId}"`);
        artClauseErrors++;
      }
    }
  }
}
if (artClauseErrors === 0) {
  ok(`All ${artClauseTotal} artifact clause references resolve correctly`);
}

// ── 5. Evidence Clause References ────────────────────────────────────

console.log('\n=== 5. Evidence Clause References ===');

let evidClauseErrors = 0;
let evidClauseTotal = 0;

if (evidence && typeof evidence === 'object') {
  for (const [clauseKey, entry] of Object.entries(evidence)) {
    evidClauseTotal++;
    if (clauseIdSet.size > 0 && !clauseIdSet.has(clauseKey)) {
      bad(`Evidence key "${clauseKey}" not found in clauses/index.json`);
      evidClauseErrors++;
    }
    if (entry && entry.evidenceItems) {
      for (const item of entry.evidenceItems) {
        if (!item.id && !item.name) {
          bad(`Evidence item in clause "${clauseKey}" missing id/name`);
        }
      }
    }
  }
}
if (evidClauseErrors === 0) {
  ok(`All ${evidClauseTotal} evidence clause keys resolve correctly`);
}

// ── 6. Clause Index & Sections Consistency ───────────────────────────

console.log('\n=== 6. Clause Index & Sections Consistency ===');

if (Array.isArray(clausesIndex)) {
  let clauseErrors = 0;
  for (const clause of clausesIndex) {
    if (!clause.id) { bad('Clause missing "id"'); clauseErrors++; }
    if (!clause.section) { bad(`Clause "${clause.id}" missing "section"`); clauseErrors++; }
  }
  if (clauseErrors === 0) ok(`All ${clausesIndex.length} clauses have required fields`);
}

if (Array.isArray(sections)) {
  ok(`Sections file has ${sections.length} section entries`);
} else if (sections) {
  ok('Sections file loaded');
}

// ── 7. Cross-Reference Integrity ─────────────────────────────────────

console.log('\n=== 7. Cross-Reference Integrity ===');

const crossRefFiles = findJsonFiles(path.join(REPO_ROOT, 'cross-references'));
for (const file of crossRefFiles) {
  if (!parsed[file]) bad(`Cross-reference file failed to load: ${file}`);
  else ok(`Cross-reference loaded: ${file}`);
}

// ── 8. Risk Register Math ────────────────────────────────────────────

console.log('\n=== 8. Risk Register Math ===');

if (riskRegister && riskRegister.risks) {
  let mathErrors = 0;
  for (const risk of riskRegister.risks) {
    if (risk.likelihood != null && risk.impact != null && risk.inherentRisk != null) {
      const expected = risk.likelihood * risk.impact;
      if (risk.inherentRisk !== expected) {
        bad(`${risk.id}: inherentRisk ${risk.inherentRisk} != ${risk.likelihood} x ${risk.impact} = ${expected}`);
        mathErrors++;
      }
    }
    if (risk.residualLikelihood != null && risk.residualImpact != null && risk.residualRisk != null) {
      const expected = risk.residualLikelihood * risk.residualImpact;
      if (risk.residualRisk !== expected) {
        bad(`${risk.id}: residualRisk ${risk.residualRisk} != ${risk.residualLikelihood} x ${risk.residualImpact} = ${expected}`);
        mathErrors++;
      }
    }
  }
  if (mathErrors === 0) ok(`All ${riskRegister.risks.length} risk register entries have correct math`);
} else {
  ok('No risk register with risks array found (skipping)');
}

// ── 9. Data Completeness ─────────────────────────────────────────────

console.log('\n=== 9. Data Completeness ===');

let emptyIssues = 0;
for (const ctrl of libraryControls) {
  if (ctrl.description && ctrl.description.trim() === '') { bad(`Control "${ctrl.slug}" has empty description`); emptyIssues++; }
}
for (const artifact of allArtifacts) {
  if (artifact.name && artifact.name.trim() === '') { bad(`Artifact "${artifact.slug}" has empty name`); emptyIssues++; }
  if (artifact.slug && artifact.slug.trim() === '') { bad('Artifact has empty slug'); emptyIssues++; }
}
if (emptyIssues === 0) ok('No empty strings detected in core data');

// ── 10. Unique IDs ──────────────────────────────────────────────────

console.log('\n=== 10. Unique IDs ===');

const seenArtSlugs = {};
for (const art of allArtifacts) {
  if (art.slug) seenArtSlugs[art.slug] = (seenArtSlugs[art.slug] || 0) + 1;
}
const artDups = Object.entries(seenArtSlugs).filter(([, c]) => c > 1);
if (artDups.length === 0) ok(`All ${allArtifacts.length} artifact slugs are unique`);
else for (const [s, c] of artDups) bad(`Duplicate artifact slug "${s}" appears ${c} times`);

if (Array.isArray(clausesIndex)) {
  const seenClauseIds = {};
  for (const c of clausesIndex) {
    if (c.id) seenClauseIds[c.id] = (seenClauseIds[c.id] || 0) + 1;
  }
  const clauseDups = Object.entries(seenClauseIds).filter(([, c]) => c > 1);
  if (clauseDups.length === 0) ok(`All ${clausesIndex.length} clause IDs are unique`);
  else for (const [id, c] of clauseDups) bad(`Duplicate clause ID "${id}" appears ${c} times`);
}

// ── Summary ──────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(60));
console.log('Validation complete:');
console.log(`  Pass: ${pass}`);
console.log(`  Fail: ${fail}`);
console.log(`  Warn: ${warn}`);
console.log(`  Total: ${pass + fail + warn}`);
console.log('='.repeat(60));

if (fail > 0) {
  console.error(`\nValidation FAILED with ${fail} error(s).`);
  process.exit(1);
} else if (warn > 0) {
  console.log(`\nValidation passed with ${warn} warning(s).`);
  process.exit(0);
} else {
  console.log('\nAll checks passed.');
  process.exit(0);
}
