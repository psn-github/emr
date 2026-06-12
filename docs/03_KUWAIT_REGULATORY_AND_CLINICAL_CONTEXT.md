# Oxford HIS — Kuwait Regulatory & Clinical Context

**Precedence:** HIGHEST. No requirement, schema, or feature elsewhere in this document set may contradict this file. Where this file constrains the data model, those constraints are not configuration flags to be toggled — they are structural.

> **Important caveat for the build team and product owner:** the statements below reflect the regulatory and clinical landscape as understood at the time of writing and are drawn from public regulatory summaries and the reproductive-medicine literature, not from a legal opinion. Several items are explicitly flagged **[CONFIRM WITH CLINIC LEGAL COUNSEL]**. The exact storage periods, consent cadences, MOH licensing forms, and CITRA cloud-hosting conditions must be confirmed in writing with Oxford Medical's Kuwaiti legal counsel and the licence holder (Karema Alrashid, CEO) **before** the corresponding modules are cut over to production. Build the system so these values are configuration where the law permits a range, and structural where the law is categorical.

---

## 1. Assisted reproduction — the categorical constraints

Kuwait follows Sunni Islamic jurisprudence on assisted reproduction. The following are **categorical** and shape the schema, not the settings:

1. **Married couples only — for treatment and embryo creation.** ART **treatment and embryo creation** are permitted only within a valid marriage between husband and wife: insemination, IUI, IVF/ICSI, embryo culture, embryo transfer, FET, and **embryo** storage all require a verified `Couple`. The clinical unit for treatment is the **couple**, and a **verified marriage certificate is a hard gate** before any such workflow can begin. This is why `Couple` and `MarriageVerification` are first-class and why treatment cycle creation is blocked without a verified marriage record.

   **Exception — fertility preservation (person-scoped, ADR-0015):** **fertility preservation is permitted for unmarried individuals** — oocyte / ovarian-tissue freezing for a single woman; sperm / testicular-tissue freezing for a single man. This is the **only** person-scoped fertility pathway: a fertility-preservation cycle links to a `Person`, and `CryoSpecimen` ownership may be `person_id` **or** `couple_id`. Witnessing, chain-of-custody, consent-to-store, and storage-expiry apply identically to person-owned specimens. **Hard invariant:** person-owned gametes may **never** be used in treatment directly — any **thaw-for-treatment** requires, at time of use, a verified `Couple` including that person, **current** marriage verification, and own-gametes-only resolution. **No posthumous-use pathway exists.** Permitted indications for single-woman oocyte freezing (medical vs elective/social) are a **configurable coded field**. **[CONFIRM permitted single-person preservation indications WITH CLINIC LEGAL COUNSEL]**

2. **Own gametes only.** Only the husband's sperm and the wife's oocytes may be used. **Donor sperm, donor oocytes, donor embryos, and surrogacy are prohibited.** These workflows must be **structurally absent** from the system — not present-but-disabled. There is no "sperm source = donor" option, no surrogate entity, no donor registry. A `sperm_source` always resolves to the husband within the couple; an `oocyte_source` always resolves to the wife. Building donor/surrogacy capability "for completeness" or "for a future market" is wrong here: it creates a system that can be misused against Kuwaiti law and Oxford's licence.

3. **No sex selection for non-medical reasons.** PGT for sex selection on social grounds is not permitted. PGT-A/PGT-M for medical indication is captured (orders, consent, results from the external genetics lab), but the system must not provide a social-sex-selection workflow. **[CONFIRM scope of permitted PGT indications WITH CLINIC LEGAL COUNSEL]**

4. **Dissolution of marriage ends the basis for stored gametes/embryos.** In the regional legal tradition, the end of the marital relationship (divorce, death) removes the legal basis for continued storage and use of that couple's gametes/embryos. The cryostore module must therefore track marital-status linkage to stored specimens and surface a **status-change workflow** (with legal/clinical review step) rather than silently continuing storage. **[CONFIRM exact handling and any mandatory disposition WITH CLINIC LEGAL COUNSEL]**

**Implication for the witnessing and chain-of-custody design:** because only one couple's own gametes are ever in play, the witnessing system's job is to guarantee that *this couple's* material is never confused with *another couple's* material. Oxford Medical's lab uses **CooperSurgical RI Witness (RFID)** for this — the deployed, validated electronic witnessing system and system of record. Oxford HIS **integrates** with RI Witness (demographic master in, witnessing/traceability out, reconciliation with blocking divergence flags) rather than reimplementing witnessing; see architecture §4. The RFID layer makes cross-contamination of identity physically detectable at every handling step — which is both the universal IVF safety standard and the specific Kuwaiti legal imperative. The RI Witness server deployment and any RI cloud component must be included in the document 03 residency review.

## 2. Embryo & gamete storage

- Regional ART laws commonly permit gamete/embryo storage for a **maximum of ~5 years, renewable**, with destruction on marriage dissolution or patient request. Kuwait's specific limit and renewal cadence must be **[CONFIRMED WITH CLINIC LEGAL COUNSEL]** and then encoded as the `CryoSpecimen.storage_expiry` default and renewal-alert cadence.
- Storage requires **consent-to-store** with a defined period; the system tracks consent expiry and storage expiry **independently** and alerts before either lapses.
- **Import/export of gametes/embryos** across borders is restricted or prohibited in several regional jurisdictions; **[CONFIRM Kuwait position WITH CLINIC LEGAL COUNSEL]** before building any cross-border specimen transfer feature. Default: no such feature in v1.
- The cryostore must produce, on demand, a complete chain-of-custody and consent/expiry status for any specimen — this is both a clinical-safety and an inspection requirement.

## 3. MOH licensing & clinical governance

- **Facility licensing:** Oxford Medical operates under Kuwait Ministry of Health (MOH) facility licensing; the IVF laboratory, theatres, and pharmacy each sit under specific licensing/inspection regimes. The system's audit and reporting outputs must be shaped to support MOH inspection — hence one-click audit-trail export per entity and the reporting outputs in PRD §E12. **[CONFIRM specific MOH reporting formats/returns WITH CLINIC]**
- **Practitioner licensing:** clinicians require valid MOH licences; the `Staff` entity tracks `moh_licence` and `licence_expiry` with alerting, and only appropriately licensed/competency-signed-off staff may perform restricted actions (e.g. only `embryo_witness`-competent embryologists may act as electronic witnesses).
- **Medical records obligation:** under Kuwait's Law No. 70 of 2020 on the Medical Profession (Article 60), healthcare facilities must maintain a register/database of patient information (written or electronic) and ensure its safety, and must be able to provide patient files on request if the facility ceases or changes activity. This underpins the append-only, exportable, durably-backed design of the record. **[CONFIRM retention period WITH CLINIC LEGAL COUNSEL]** and encode it in the retention job.

## 4. Data privacy & hosting (CITRA / Law No. 26 of 2024)

- Kuwait's first dedicated data-protection instrument is the **Data Privacy Protection Regulation (DPPR)** issued by **CITRA**, as amended by **Administrative Decision No. 26 of 2024**. Core obligations relevant to Oxford HIS: **explicit consent** before collecting/processing personal data, **purpose limitation and data minimisation**, **data-subject rights** (access, correct, erase, restrict), **breach notification** to CITRA, and **restrictions/notification on cross-border transfer** of personal data.
- **Health data, genetic data, and identity data are sensitive** under the regulation's definitions — they receive the strictest handling (field-level encryption for Civil ID, deny-by-default access, audited exports).
- **Data localisation:** Kuwait does **not** currently impose a blanket data-localisation mandate, but (a) cross-border transfers may require **CITRA approval / data-subject notification**, (b) CITRA operates a **Cloud Computing Regulatory Framework** governing cloud service providers, and (c) the medical-profession law imposes record-keeping/safety duties. **Therefore the architecture's default is in-region (GCC / Kuwait-permissible) hosting**, and any third-party processor that would move PHI outside the approved region (SMS/WhatsApp, payment, translation, AI, analytics) must be reviewed against these rules **before integration**. Convenient global SaaS may be disallowed. **[CONFIRM acceptable hosting region and CSP list WITH CLINIC + CITRA cloud framework]**
- **Consent architecture:** because consent is the legal basis for processing, the document/consent subsystem (PRD §E0/E3) is not just clinical-consent — it must also record **data-processing consent** with purpose and the ability to honour erasure/restriction requests (bounded by the medical-record retention obligation, which can lawfully override erasure for clinical records).

## 5. Cultural & clinical correctness (Gulf fertility practice)

These are not "nice to have" — they affect data capture, UI, and communication:

- **The couple is counselled and consented together** for most fertility decisions; the UI and consent model assume joint sessions, while still respecting each partner's individual data rights.
- **Modesty and chaperoning** norms affect scheduling and room/staff allocation (e.g. female sonographer/clinician preference); the scheduling resource model should allow capturing and honouring such preferences.
- **Bilingual, Khaleeji-appropriate communication** is essential: patient-facing language defaults sensibly, medical terminology in Arabic uses Gulf-appropriate forms, and Hijri dates are displayed alongside Gregorian where culturally expected.
- **Ramadan and prayer-time** considerations affect appointment scheduling and medication timing guidance (e.g. injection timing around fasting); the medication-instruction and scheduling layers should accommodate this (links to the clinic's prior work on Ramadan medication timing).
- **Privacy sensitivity around infertility** is high; notifications must be discreet (no clinically explicit content in SMS previews), and partner-shared portal access is **consent-gated**, not assumed.

## 6. The obstetric continuum (a distinctive requirement)

Oxford Medical uniquely carries fertility patients through pregnancy to delivery under one roof. The data model must treat **fertility → antenatal → delivery** as a continuum on the same patient/couple record (PRD §E2 antenatal record, §E3 outcome tracking), so that an IVF pregnancy's antenatal care and outcome link back to the originating cycle. This is both a clinical-quality feature and a research asset (outcome-by-protocol analysis — the Medical Director's domain).

## 7. Hard rules distilled (for quick reference by the build)

1. No cycle without a verified marriage record. (Structural gate.)
2. No donor gametes, donor embryos, or surrogacy anywhere in the system. (Structurally absent.)
3. No non-medical sex selection. (Absent workflow.)
4. Every gamete/embryo handling event is witnessed by RI Witness (RFID) and reconciled in Oxford HIS; divergence blocks cycle-step sign-off. (No competing witness UI; no override of RI Witness.)
5. PHI hosted in the approved region by default; every cross-border processor reviewed before use. (Residency-by-default.)
6. Explicit, purpose-bound consent recorded for both clinical acts and data processing; data-subject rights honoured within the medical-record retention obligation.
7. Immutable, exportable audit trail for every clinical, financial, drug, specimen, and asset event. (Inspection-ready.)
8. Storage expiry and consent expiry tracked and alerted; marital-status change triggers a reviewed disposition workflow. ([CONFIRM exact rules.])
9. Every clinical screen verifies identity (Arabic+English name, Civil ID, DOB, partner linkage).
10. Everything bilingual, RTL-correct, Khaleeji-appropriate.

**Any time the build is unsure whether something is permitted, the default is to NOT build the permissive path and to raise it in `docs/AMENDMENTS.md` for the product owner and legal counsel.**
