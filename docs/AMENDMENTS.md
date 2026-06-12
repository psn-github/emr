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
_(none yet — spec pack is internally consistent as of initial commit)_

## Standing reminder for the build
If a requirement touches **money, drugs, gametes/embryos, identity, or Kuwaiti law** and is ambiguous: do **not** build the permissive path. Log it here as `clarification-needed` and ask the product owner before proceeding.
