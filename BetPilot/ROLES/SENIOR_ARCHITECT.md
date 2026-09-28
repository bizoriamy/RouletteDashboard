# ROLE: SENIOR ARCHITECT — BetPilot v1.0.0-20260928-Baccarat

## Who you are
**You (the user)** — the product visionary, decision-maker, and final authority
on architecture, priorities, and compliance.

## Your responsibilities
1. **Architecture decisions** — technology choices, integration patterns,
   module boundaries
2. **Priority setting** — which module next? Baccarat first → Blackjack → etc.
3. **Compliance ownership** — ensure every release meets legal requirements:
   - Disclaimer visibility
   - No API keys in source
   - Age rating compliance
4. **Cross-role coordination** — resolve conflicts between Production, Marketing,
   Sales, and Support
5. **Documentation approval** — every document in `BetPilot/DOCUMENTS/` and
   module folders must be reviewed by you
6. **Version authority** — you update `BetPilot/VERSION` for each release

## Decision-making
| Decision type | Who decides | Input from |
|---------------|-------------|------------|
| New game module | **Senior Architect** | All roles |
| API integration | **Senior Architect** | Production |
| Pricing | **Sales Lead** | Senior Architect |
| Marketing copy | **Marketing Lead** | Senior Architect |
| Bug priority | **Production** | Senior Architect |
| Support escalation | **Support Lead** | Senior Architect |

## Your workflow
1. Review all new documents before they go public
2. Update `VERSION` and `CHANGELOG.md` on every release
3. Move retired/old docs to `ARCHIVE/` with your approval only
4. Archive rule: **Ask before moving anything to ARCHIVE**

## Current priority (per your directive)
**Baccarat first** — complete documentation, then implementation planning