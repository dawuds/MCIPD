# BNM MCIPD — Management of Customer Information and Permitted Disclosures

> **Disclaimer:** This repository is an educational and indicative resource. It does not constitute legal, regulatory, or technical advice. Content marked `sourceType: "constructed-indicative"` has not been verified against official sources. Always refer to authoritative standards bodies and seek professional counsel for compliance decisions.

> Machine-readable GRC compliance database for Bank Negara Malaysia's Policy Document on Management of Customer Information and Permitted Disclosures.

**Live site:** https://dawuds.github.io/MCIPD/

## Document Versions

| Version | Reference | Date | Status |
|---------|-----------|------|--------|
| Exposure Draft | BNM/RH/ED 028-4 | 1 June 2017 | Superseded |
| Final (v1) | BNM/RH/PD 028-4 | 2021-10-12 | Superseded |
| Final (v2) | BNM/RH/PD 028-4 | 2023-04-03 | Superseded |
| **Final (v3)** | **BNM/RH/PD 028-65** | **31 October 2025** | **Current** |

> **Source document:** `source/MCIPD_PD_2025.pdf` — Official BNM Policy Document (35 pages, SULIT classification). All verbatim text extracted directly from this PDF. This version supersedes the 3 April 2023 MCIPD and BNM's letter on disclosure to LHDN (18 Feb 2022).

**Additional source files:**
- `source/2025_MCIPD_Appendix_I_Template_for_Reporting_Customer_Information_Breach.xlsx`
- `source/2025_MCIPD_Appendix_V_Template_for_Application_for_Disclosure_of_Customer_Information.xlsx`

## Applicability

**Part B** (Policy Requirements) applies to all **Financial Service Providers (FSPs)**:
1. Licensed banks
2. Licensed investment banks
3. Licensed Islamic banks and international Islamic banks
4. Licensed insurers
5. Licensed takaful operators and international takaful operators
6. Prescribed development financial institutions
7. Approved issuers of designated payment instruments
8. Approved operators of payment systems
9. Approved insurance brokers and takaful brokers
10. Approved financial advisers and Islamic financial advisers
11. Approved money brokers
12. Registered operators of payment systems
13. Registered adjusters

**Part C** (Specific Requirements on Permitted Disclosure) applies only to **Financial Institutions (FIs)** as defined under s131 FSA, s143 IFSA, and s3(1) DFIA.

## Document Structure

| Part | Title | Sections | Scope |
|------|-------|----------|-------|
| **A** | Overview | 1-7 | Introduction, applicability, legal provisions, definitions |
| **B** | Policy Requirements | 8-12 | Board oversight, senior management, controls, breaches, outsourcing |
| **C** | Specific Requirements on Permitted Disclosure | 13 | Conditions for permitted disclosures under Schedule 11 FSA/IFSA |

**Appendices:**
- I: Template for reporting customer information breaches
- II: Standard application form for PDRM
- III: Standard application form for Jabatan Kastam Diraja Malaysia
- IV: Standard application form for other law enforcement agencies
- V: Application for Disclosure of Customer Information

## Data Architecture (GRC Portfolio v2.0)

```
Layer 1: Clauses (Sections 1-13 + sub-paragraphs)     → /clauses/
Layer 2: Requirements (business/tech/governance)        → /requirements/
Layer 3: Evidence (audit evidence per clause)            → /evidence/
Layer 4: Artifacts (policies, procedures, templates)     → /artifacts/
Layer 5: Controls (control domains & library)            → /controls/
Layer 6: Cross-References (RMIT, PDPA, DataProtection)   → /cross-references/
Layer 7: Risk Management (risk register & methodology)   → /risk-management/
```

## Cross-References

This repository cross-references three sibling GRC databases:

| Repository | Relationship | Key Mappings |
|------------|-------------|--------------|
| [RMIT](https://github.com/dawuds/RMIT) | MCIPD implements RMiT S10 data security + S11 cybersecurity clauses | Section 10 → RMiT 10.44-10.57, Section 11 → RMiT 11.1-11.5 |
| [PDPA-MY](https://github.com/dawuds/pdpa-my) | MCIPD operationalises PDPA principles for financial sector | Section 10 → PDPA s6 (consent), s7 (notice), s9 (security), s129 (cross-border) |
| [Dataprotection](https://github.com/dawuds/dataprotection) | MCIPD maps to data protection control domains | Section 10 → DCLS, EART, EITR, DLPS, KMGT domains |

## S/G Markers

- **"S"** — Standard/obligation that **must** be complied with. Non-compliance may result in enforcement action.
- **"G"** — Guidance/recommendation that is **encouraged** to be adopted.

## Legal Basis

| Act | Sections |
|-----|----------|
| Financial Services Act 2013 (FSA) | s18(2), s47(1), s123(1), s134(2), s143(1) |
| Islamic Financial Services Act 2013 (IFSA) | s57(1), s135(1), s146(2), s155(1) |
| Development Financial Institutions Act 2002 (DFIA) | s41(1), s42C(1), s116(1), s120(2) |
| Personal Data Protection Act 2010 (PDPA) | Referenced in s6.1(a) |

## Related BNM Policy Documents

- Personal Data Protection Act 2010
- Personal Data Protection Standards 2015
- Management of IT Environment / Risk Management in Technology (RMiT)
- Data Management and MIS Framework
- Operational Risk
- Managing Cyber Risks
- Outsourcing of Banking/Islamic Banking/Insurance/Takaful Operations
- Product Transparency and Disclosure

## Disclaimer

This repository is an **educational and practitioner resource**. It is NOT a substitute for the official BNM policy document.

- **Authoritative content:** verbatim text extracted from the source PDF, section numbers, S/G markers
- **AI-generated content:** translations, requirement breakdowns, evidence guides, control mappings — explicitly labelled as `AI Generated`
- **Exposure Draft caveat:** Base layer currently uses the 2017 Exposure Draft. The final 2023 version structure is identical for Parts A-C, Sections 1-13, but includes amendments. All amendments are flagged with `[2023 AMENDMENT]` tags and sourced from authoritative law firm analyses.

## Running Locally

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Validation

```bash
node validate.js [--verbose]
```

## License

CC-BY-4.0 — see [LICENSE](LICENSE).
