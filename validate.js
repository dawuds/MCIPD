#!/usr/bin/env node
/**
 * MCIPD Data Integrity Validator
 * Validates JSON structure, cross-references, and data consistency
 * Run: node validate.js [--verbose]
 */

const fs = require('fs');
const path = require('path');

const VERBOSE = process.argv.includes('--verbose');
let errors = 0;
let warnings = 0;
let checks = 0;

function log(msg) { console.log(msg); }
function pass(msg) { checks++; if (VERBOSE) log(`  ✓ ${msg}`); }
function fail(msg) { errors++; checks++; log(`  ✗ FAIL: ${msg}`); }
function warn(msg) { warnings++; if (VERBOSE) log(`  ⚠ WARN: ${msg}`); }

function loadJSON(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    pass(`JSON parse: ${path.basename(filePath)}`);
    return data;
  } catch (e) {
    fail(`JSON parse: ${path.basename(filePath)} — ${e.message}`);
    return null;
  }
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

// ─── Suite 1: Core JSON files ───
log('\n1. Core JSON file validation');
const sectionsPath = path.join(__dirname, 'clauses', 'sections.json');
const sections = loadJSON(sectionsPath);

const bySection = [
  'S08-board-oversight.json',
  'S09-senior-management.json',
  'S10-control-environment.json',
  'S11-customer-information-breaches.json',
  'S12-outsourced-service-provider.json',
  'S13-permitted-disclosure.json'
];

const allClauses = [];
for (const file of bySection) {
  const fp = path.join(__dirname, 'clauses', 'by-section', file);
  if (!fileExists(fp)) {
    fail(`Missing clause file: ${file}`);
    continue;
  }
  const data = loadJSON(fp);
  if (data && Array.isArray(data)) {
    allClauses.push(...data);
    pass(`${file}: ${data.length} clauses`);
  }
}

// ─── Suite 2: Clause structure validation ───
log('\n2. Clause structure validation');
const requiredFields = ['id', 'section', 'sectionTitle', 'part', 'marker', 'verbatim', 'translation', 'keywords'];
let clauseIds = new Set();

for (const clause of allClauses) {
  for (const field of requiredFields) {
    if (!clause[field] && clause[field] !== null) {
      fail(`Clause ${clause.id}: missing field '${field}'`);
    }
  }
  if (clause.marker && !['S', 'G'].includes(clause.marker)) {
    fail(`Clause ${clause.id}: invalid marker '${clause.marker}' (must be S or G)`);
  }
  if (clauseIds.has(clause.id)) {
    fail(`Duplicate clause ID: ${clause.id}`);
  }
  clauseIds.add(clause.id);
}
pass(`${allClauses.length} clauses validated for required fields`);
pass(`${clauseIds.size} unique clause IDs`);

// Count S vs G markers
const sCount = allClauses.filter(c => c.marker === 'S').length;
const gCount = allClauses.filter(c => c.marker === 'G').length;
pass(`Markers: ${sCount} Standard (S), ${gCount} Guidance (G)`);

// ─── Suite 3: Cross-reference files ───
log('\n3. Cross-reference validation');
const xrefFiles = [
  'mcipd-to-rmit.json',
  'mcipd-to-pdpa.json',
  'mcipd-to-dataprotection.json'
];

for (const file of xrefFiles) {
  const fp = path.join(__dirname, 'cross-references', file);
  if (!fileExists(fp)) {
    fail(`Missing cross-reference: ${file}`);
    continue;
  }
  const data = loadJSON(fp);
  if (data && data.mappings) {
    pass(`${file}: ${data.mappings.length} mappings`);
  }
}

// ─── Suite 4: Section consistency ───
log('\n4. Section consistency');
if (sections) {
  const sectionIds = sections.sections.map(s => s.id);
  const clauseSections = [...new Set(allClauses.map(c => c.section))];

  for (const cs of clauseSections) {
    if (!sectionIds.includes(cs)) {
      fail(`Clause references unknown section: ${cs}`);
    }
  }

  // Check Part B/C sections have clauses
  const policyParts = ['8', '9', '10', '11', '12', '13'];
  for (const sid of policyParts) {
    const count = allClauses.filter(c => c.section === sid).length;
    if (count === 0) {
      fail(`Section ${sid} has no clauses`);
    } else {
      pass(`Section ${sid}: ${count} clauses`);
    }
  }
}

// ─── Suite 5: Source files ───
log('\n5. Source file validation');
const sourceFiles = [
  'source/MCIPD_PD_2025.pdf',
  'source/2025_MCIPD_Appendix_I_Template_for_Reporting_Customer_Information_Breach.xlsx',
  'source/2025_MCIPD_Appendix_V_Template_for_Application_for_Disclosure_of_Customer_Information.xlsx'
];

for (const file of sourceFiles) {
  const fp = path.join(__dirname, file);
  if (fileExists(fp)) {
    const stats = fs.statSync(fp);
    pass(`${file} (${(stats.size / 1024).toFixed(0)} KB)`);
  } else {
    fail(`Missing source: ${file}`);
  }
}

// ─── Suite 6: Translation labels ───
log('\n6. AI-generated content labeling');
let unlabeledTranslations = 0;
for (const clause of allClauses) {
  if (clause.translation && !clause.translation.startsWith('AI Generated:')) {
    unlabeledTranslations++;
    if (VERBOSE) warn(`Clause ${clause.id}: translation not prefixed with 'AI Generated:'`);
  }
}
if (unlabeledTranslations === 0) {
  pass(`All ${allClauses.length} translations properly labeled as AI Generated`);
} else {
  fail(`${unlabeledTranslations} translations missing 'AI Generated:' prefix`);
}

// ─── Suite 7: Verbatim non-empty ───
log('\n7. Verbatim text completeness');
let emptyVerbatim = 0;
for (const clause of allClauses) {
  if (!clause.verbatim || clause.verbatim.trim().length < 10) {
    emptyVerbatim++;
    fail(`Clause ${clause.id}: empty or too-short verbatim text`);
  }
}
if (emptyVerbatim === 0) {
  pass(`All ${allClauses.length} clauses have substantive verbatim text`);
}

// ─── Suite 8: Core SPA files ───
log('\n8. Application files');
const appFiles = ['index.html', 'app.js', 'style.css', 'base.css', 'README.md', 'LICENSE'];
for (const file of appFiles) {
  const fp = path.join(__dirname, file);
  if (fileExists(fp)) {
    pass(`${file} exists`);
  } else {
    warn(`${file} not yet created`);
  }
}

// ─── Summary ───
log('\n' + '═'.repeat(50));
log(`Validation complete: ${checks} checks, ${errors} errors, ${warnings} warnings`);
log(`Clauses: ${allClauses.length} total (${sCount} S + ${gCount} G)`);
log(`Cross-references: ${xrefFiles.length} files`);
log('═'.repeat(50));

process.exit(errors > 0 ? 1 : 0);
