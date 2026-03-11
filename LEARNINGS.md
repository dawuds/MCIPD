# LEARNINGS — MCIPD Compliance Database

## Build History

### Phase 1: Repository Initialization (March 2026)

**Source document:** BNM/RH/PD 028-65, issued 31 October 2025, 35 pages, SULIT classification.

**Initial download attempt:** BNM's CloudFront CDN blocked direct PDF downloads (403). The exposure draft (BNM/RH/ED 028-4, June 2017, 26 pages) was downloaded from an alternative source but was immediately identified as outdated. User provided the correct 2025 PDF directly.

**Key differences 2017 ED vs 2025 Final:**
- Reference changed from BNM/RH/ED 028-4 → BNM/RH/PD 028-65
- Pages: 26 → 35
- Section 8 expanded: 3 clauses → 4 clauses (8.4 added: annual written assurance)
- Section 9 expanded: 5 clauses → 10 clauses (9.5-9.10 added)
- Section 10 expanded significantly: more clauses on social media restrictions, detection mechanisms
- Section 11 significantly expanded: 4 subsections (A-D), detailed breach notification timelines
- Section 12 expanded: 10 clauses with detailed SLA requirements
- Item 8 consent conditions (effective 1 Jan 2024) fully integrated
- PDPA A1727 cross-reference in footnote 14 (s12B breach notification)
- eFSA portal procedures for PDRM requests added
- IRBM/LHDN disclosure conditions expanded (s132, 132A, 106A ITA)

**Extraction methodology:**
- All verbatim text extracted by reading PDF pages directly (not from memory/generation)
- S/G markers verified against PDF visual markers
- Paragraph numbers verified against table of contents
- Footnotes captured and linked to relevant clauses

## Architecture Decisions

1. **GRC Portfolio v2.0 Schema**: Same 6-layer architecture as RMIT, PDPA-MY, and dataprotection repos for cross-repo consistency.

2. **Cross-reference first**: Built MCIPD→RMIT, MCIPD→PDPA, MCIPD→Dataprotection mappings as core deliverables since this repo bridges information protection across the GRC portfolio.

3. **Verbatim accuracy priority**: Following RMIT lessons learned, all verbatim text extracted directly from the source PDF. AI-generated content (translations, rationales) explicitly labelled.

4. **Dual notification obligation**: MCIPD footnote 14 confirms FSPs must notify BOTH BNM (under MCIPD 11.8) AND the Personal Data Protection Commissioner (under PDPA s12B). This is a critical cross-reference.

## Data Quality Checklist

- [x] Verbatim text extracted from source PDF (not generated)
- [x] S/G markers verified against PDF
- [x] Paragraph numbers verified against table of contents
- [x] AI-generated content explicitly labelled
- [x] Cross-references built with clear rationale
- [x] Footnotes captured and linked
- [ ] Full clause index consolidated (clauses/index.json)
- [ ] Requirements layer built
- [ ] Evidence layer built
- [ ] Controls library built
- [ ] Artifacts inventory built
- [ ] Risk management module built
- [ ] SPA frontend built
- [ ] Validation passes clean (node validate.js)

## Known Limitations

1. **Part A clauses not yet extracted**: Sections 1-7 (Overview) are definitional/administrative. Policy substance is in Parts B-C which are fully extracted.
2. **Section 13 table**: The 8-item permitted disclosure table is summarised in clause 13.1 metadata rather than fully decomposed into sub-clauses.
3. **Appendix forms**: Appendices II-IV (PDRM, Kastam, law enforcement forms) are in Bahasa Malaysia and not decomposed into JSON.
4. **RMiT clause numbers**: Cross-reference mappings use indicative RMiT clause ranges. Some may need adjustment after verification against the specific November 2025 RMiT version.
