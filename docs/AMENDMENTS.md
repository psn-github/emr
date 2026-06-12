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
- **Status:** open (implemented per explicit product-owner instruction "this is the palette to use"; docs/02 §2 text still needs the corresponding edit)
- **Product-owner decision:** _pending — confirm docs/02 §2 should be updated to match._

## Standing reminder for the build
If a requirement touches **money, drugs, gametes/embryos, identity, or Kuwaiti law** and is ambiguous: do **not** build the permissive path. Log it here as `clarification-needed` and ask the product owner before proceeding.
