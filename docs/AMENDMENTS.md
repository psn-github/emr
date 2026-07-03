# AMENDMENTS — proposed requirement changes & logged conflicts

> Living file. When Claude Code believes a requirement is wrong, ambiguous, or conflicts with a higher-precedence document, it logs it here and asks the product owner — it does **not** silently deviate. Clinical-safety and legal requirements may never be relaxed without explicit sign-off.

## How to use
```
## AMD-NNNN — <short title>
- **Date:** YYYY-MM-DD
- **Raised by:** <session/agent>
- **Type:** conflict | proposed-change | clarification-needed
- **Documents involved:** <e.g. docs/01 §E7 vs docs/03 §x>
- **Issue:** what's wrong/ambiguous/conflicting
- **Proposed resolution:** the recommendation
- **Status:** open | approved | rejected | deferred
- **Product-owner decision:** <filled in after sign-off>
```

## Open items

## AMD-0001 — Design-system fonts/palette: docs/02 §2 vs the canonical om-software palette
- **Date:** 2026-06-12
- **Raised by:** Phase 0 session (claude)
- **Type:** conflict
- **Documents involved:** docs/02 §2 vs the product-owner-supplied `PALETTE.md` (canonical om-software EMR design system)
- **Issue:** docs/02 §2 specifies **Cormorant Garamond + DM Sans/Inter Tight** and an unspecified "Oxford palette". The product owner provided the canonical om-software design system, which instead uses **Satoshi (display) / Plus Jakarta Sans (body+UI) / Geist (data) / Noto Sans Arabic**, a warm-neutral canvas (`#F5F5F0`) with a single teal-green accent (`#2A7C6F`), and fixed semantic/clinical/drug-class colours — explicitly so the EMR and the existing clinical tools are one visual family.
- **Proposed resolution:** adopt the canonical `PALETTE.md` (done — `@oxford/ui` tokens now carry these exact values) and **update docs/02 §2** to reference the canonical palette rather than Cormorant/DM Sans, so the architecture doc stops contradicting the design system. Token *names* in `@oxford/ui` stay stable regardless.
- **Status:** **approved** (product owner: the `PALETTE.md` is canonical, from the live om-software design system; docs/02 §2 + the design ADR updated to match; Cormorant/DM Sans reference superseded).
- **Product-owner decision:** Approved 2026-06-12. Use Satoshi / Plus Jakarta Sans / Geist, teal accent, and the palette file's token values; keep token names stable. Recorded as ADR-0016.

## AMD-0002 — Single-person fertility preservation (the marriage gate over-restricts)
- **Date:** 2026-06-12
- **Raised by:** product owner
- **Type:** proposed-change (**approved**)
- **Documents involved:** docs/03 §1, docs/01 §E3/§E6, docs/04 (data model), `@oxford/registry` gating
- **Issue:** the spec gates **any** fertility workflow on a verified marriage. That over-restricts: fertility **preservation** for an unmarried individual is permitted.
- **Resolution (approved):**
  - The **marriage gate stays unchanged for treatment and embryo creation** — insemination, IUI, IVF/ICSI, embryo culture, embryo transfer, FET, and **embryo** storage all require a verified `Couple`.
  - **Fertility preservation is permitted for unmarried individuals** — oocyte (and ovarian tissue) freezing for a single woman; sperm (and testicular tissue) freezing for a single man. **Person-scoped, not couple-scoped.**
  - Data model: add a **fertility-preservation cycle type linked to a `Person`** (the only cycle type that may be person-scoped). `CryoSpecimen` ownership becomes **`person_id` OR `couple_id`**. Witnessing, chain-of-custody, consent-to-store, and storage-expiry tracking apply **identically** to person-owned specimens.
  - **HARD INVARIANT (adversarially tested like the others):** person-owned stored gametes may **never** be used in treatment directly. Any **thaw-for-treatment** of a person-owned specimen requires, *at time of use*: (1) a verified `Couple` including that person, (2) marriage verification **current**, and (3) own-gametes-only resolution (her oocytes / his sperm within that marriage). Bypass attempts via the API must be rejected by the server (Phase 2 adversarial test).
  - **No posthumous-use pathway exists. Do not build one.**
  - **Indications confirmed (Medical Director, 2026-06-13):** single-person fertility preservation (oocyte/ovarian-tissue for single women; sperm/testicular-tissue for single men) is **legal in Kuwait and standard practice at the clinic** — this is a **closed decision**, no longer pending legal counsel. The coded indication field (medical vs elective) is **retained as clinical-governance data captured on every preservation cycle — NOT a legal gate**; it remains configurable so the clinic can analyse/segment without code change.
- **Status:** **approved & closed** — recorded as ADR-0015. Spec edits: docs/03 §1 updated; docs/01 §E3/§E6 + docs/04 detailed edits land with the Phase 2 cryostore/cycle build (the rule is authoritative via ADR-0015 + docs/03 §1 in the meantime).
- **Product-owner decision:** Approved 2026-06-12; **indications confirmed legal + standard practice by the Medical Director 2026-06-13** (no legal-counsel gate remains).

## AMD-0003 — Annual cryostorage billing + non-engagement/non-payment pathway
- **Date:** 2026-06-13
- **Raised by:** product owner
- **Type:** proposed-change (**approved**)
- **Documents involved:** docs/01 §E6 (cryostore), docs/03 §1/§2 (storage + disposition)
- **Issue:** the clinic bills **annually** for cryostorage, and there must be a defined pathway when patients **fail to engage and pay** (storage cannot continue indefinitely unpaid, but specimens are gametes/embryos — disposition is legally/ethically sensitive).
- **Resolution (approved):** elevate docs/01 §E6's annual-storage-billing + consent/payment-lapse workflow to **Phase 2 scope** (PR 2.7 cryostore). Build: a recurring **annual storage charge** (reuses `@oxford/billing`), and a **graduated non-engagement pathway** — reminders → overdue flag → escalation to a **clinical/legal review step** (never an automated destruction). Actual lapse/disposition outcomes remain bounded by the **[CONFIRM WITH CLINIC LEGAL COUNSEL]** items (storage max period, marital-status disposition). The pathway is built; the terminal disposition decision is a reviewed human step gated on legal confirmation.
- **Status:** **approved** — build in PR 2.7; terminal disposition gated on the pending legal confirms (does not auto-destroy).
- **Product-owner decision:** Approved 2026-06-13 (Medical Director).

## AMD-0004 — Vital-status source, cryo storage period, and RI Witness status (Medical Director answers)
- **Date:** 2026-06-13
- **Raised by:** Medical Director (answers to the Phase 2 exit-gate open items)
- **Type:** clarification (**resolved**)
- **Documents involved:** docs/01 §E6, docs/03 §1/§2, docs/02 §Witnessing
- **Answers:**
  1. **Vital status → "Clinician attested death record."** → Recorded as **ADR-0021**: a clinician-attested `registry.death_record` is the authoritative source for the cryostore no-posthumous-use gate. **Built + wired** (PR 2.10): `registry.recordDeath` (restricted `clinical:vital_status.write`, audited), `isPersonLiving`, and the cryostore `UseGate`; adversarial e2e proves an attested death blocks thaw on real Postgres. **This closes the deferred cryostore API-wiring open item.**
  2. **Cryo storage period → "per annum, as long as fees paid; as per MOH regulations otherwise."** → Recorded as **ADR-0022**. Already implemented: annual storage billing + configurable consent expiry; lapses route through the never-auto-destroy non-engagement pathway (MOH-governed disposition is a reviewed human step). Only the specific MOH numeric ceiling remains, captured as config when confirmed. **"Cryo storage max period" legal-confirm item: resolved in principle.**
  3. **RI Witness → "Will sort — email to be sent to them."** → CooperSurgical scoping is being initiated by the MD (email). No build action; the `RiWitnessStubProvider` stays behind the seam (ADR-0018) until the real adapter is scoped + residency-reviewed.
- **Still open with clinic legal counsel:** specimen disposition on **marital-status change**; permitted **PGT indications**. (Built configurable; cutover blocked on these.)
- **Status:** **resolved** — items 1 & 2 actioned in PR 2.10 (ADR-0021/0022); item 3 tracked as a PO/MD action.
- **Product-owner decision:** confirmed by the Medical Director, 2026-06-13.

## AMD-0005 — Kuwaiti controlled-drugs schedule + MOH reporting format (register built; specifics are config)
- **Date:** 2026-06-13
- **Raised by:** Phase 4 session (claude), building PR 4.5 (controlled-drugs register)
- **Type:** clarification-needed (Kuwaiti law / drugs — do not build the permissive path)
- **Documents involved:** docs/01 §E8 P0 (controlled drugs register: legal-grade, witnessed, reconcilable)
- **Built (unambiguous mechanism, PR 4.5):** an append-only, **two-person-witnessed**, **reconcilable** controlled-drugs register in `@oxford/inventory` — every movement (receipt/issue/wastage/destruction/return) of a catalogue item flagged `controlled` carries the running **book balance** (never negative); a **physical count** reconciles against the book and any discrepancy posts a **witnessed adjustment** (audited, never silently absorbed); a **period report** gives opening/closing balance + movements (the MOH-reporting hook). The safety gate is the **explicit per-item `controlled` flag** (not a derived schedule), so nothing slips through on an empty schedule.
- **Open (needs clinic/MD + Kuwaiti regulatory confirmation), kept as config — NOT hardcoded:**
  1. The **Kuwaiti MOH controlled-substances schedule/classes** (which drugs are scheduled, and at what class). Captured today only by the per-item `controlled` flag; the schedule-class metadata + which classes carry extra controls is config to be confirmed.
  2. The **MOH controlled-drugs reporting FORMAT / submission channel** (periodicity, fields, file/portal). `periodReport` produces the structured data; the regulatory output format/transmission is deferred until confirmed.
- **Conservative stance:** the register works fully and safely now; only the regulatory *classification contents* and *report format* are pending. No permissive default introduced.
- **Status:** **open** — mechanism shipped; the two specifics tracked here for MD/regulatory confirmation (cutover-gating, like the other Kuwaiti-law items).

## AMD-0006 — No cash + no tax (Kuwait): supersede docs/01 §E11 payment/tax text
- **Date:** 2026-06-13
- **Raised by:** Medical Director / product owner (Phase 5 sign-off)
- **Type:** proposed-change (**approved & closed**)
- **Documents involved:** docs/01 §E11 (billing: "KNET and card"; "tax/regulatory fields per Kuwait"), `@oxford/billing`
- **Decision:**
  1. **No cash.** Under the new Kuwait rules the clinic takes no cash; payments are **KNET or credit card only**. Cash is **structurally absent** — `PaymentMethod = "knet" | "card"`, no cash member/code/UI anywhere (ADR-0034).
  2. **No tax.** There is **no sales/VAT tax in Kuwait**; the billing money model carries **no tax field, line, or calculation** — invoice total = subtotal (ADR-0035). Supersedes the §E11 "tax/regulatory fields per Kuwait" line.
- **Status:** **approved & closed** — recorded as ADR-0034/0035; implemented in PR 5.1 (remove cash + tax from `@oxford/billing`, adversarially tested).
- **Product-owner decision:** confirmed by the Medical Director, 2026-06-13.

## AMD-0007 — Add "Phase 7 — Run it: staging deployment + whole-EMR simulation" to the roadmap
- **Date:** 2026-07-03
- **Raised by:** product owner (session direction: assess the build, verify zero errors, then "deploy this model to test the whole EMR", "simulate this with patients, creating loops to ensure all errors are corrected", then deploy to a VPS as done for om-software — without changing om-software).
- **Type:** proposed-change (roadmap addition; docs/05 ends at Phase 6 + cutover)
- **Documents involved:** docs/05_DELIVERY_ROADMAP.md, new docs/PHASE7_PLAN.md, ADR-0062/0063/0064
- **Proposal:** adopt docs/PHASE7_PLAN.md as Phase 7. Scope: HTTP host (7.0 ✅), whole-EMR synthetic-patient simulation harness with an error-correction loop (7.1 ✅), staging VPS deploy wiring on the existing gated pipeline (7.2 ✅ first cut), simulation at scale + chaos drills + k6 baseline (7.3), staff web shell (7.4), patient portal PWA (7.5), documented exit gate (7.6). Staging holds synthetic data only (ADR-0007); om-software is untouched.
- **Status:** **open** — proposed for product-owner ratification; build proceeding under it per session direction (the direction itself is the mandate; ratification formalises the roadmap text).

## Standing reminder for the build
If a requirement touches **money, drugs, gametes/embryos, identity, or Kuwaiti law** and is ambiguous: do **not** build the permissive path. Log it here as `clarification-needed` and ask the product owner before proceeding.
