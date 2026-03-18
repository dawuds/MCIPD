# MCIPD — BNM Management of Customer Information and Permitted Disclosures

## What This Is
Structured knowledge base for BNM's MCIPD policy — customer information handling, confidentiality obligations, and permitted disclosure rules for Malaysian financial institutions. SPA explorer with JSON data layers.

## Architecture
- **SPA**: `index.html` + `app.js` + `style.css` (vanilla JS, no build step)
- **Data**: JSON files across clauses, controls, requirements, cross-references, risk-management, evidence, templates, source
- **Schema**: GRC Portfolio v2.0 Standardized Schema

## Key Data Files
- `clauses/index.json` — 123 clauses across 6 sections
- `clauses/by-section/` — S08 (Board Oversight), S09 (Senior Management), S10 (Control Environment), S11 (Breaches), S12 (Outsourced Service Provider), S13 (Permitted Disclosure)
- `controls/library.json` — 59 controls
- `requirements/by-section/` — Requirement breakdowns per section
- `artifacts/clause-map.json` — Clause-to-control mapping

## Conventions
- Kebab-case slugs for all IDs
- Section numbering: S08-S13 (policy document structure)
- Clauses are verbatim from BNM policy — do not paraphrase

## Important
- Customer information confidentiality has legal force under IFSA 2013 / FSA 2013
- Permitted disclosures (S13) have strict conditions — do not broaden interpretation
- Breach notification requirements (S11) have specific timelines and escalation paths

## Validation
```bash
node validate.js
```

## Related Repos
- `RMIT/` — RMiT technology risk requirements for same institutions
- `pdpa-my/` — PDPA personal data protection (overlapping but distinct legal regime)
- `nacsa/` — Banking sector NCII requirements
- `outsourcing/` — BNM outsourcing policy (S12 outsourced provider controls overlap)
