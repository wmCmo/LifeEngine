# Sweep 3 — does metabolic upkeep break the equilibrium?

**No — not in the range where life survives, at default food.**

Upkeep strength (`upkeepScale` 0, 0.0005, 0.001, 0.002, 0.005) × lifespan
exponent (`lifespanExponent` 1 = original, 0.25 = Kleiber), 5 seeds (11–55),
40,000 ticks on 300×220, food production at its default of 5. 50 worlds, 10.8
minutes, none failed. Full table and pivots: [sweep-3-table.md](sweep-3-table.md).
Reproduce: `node tools/sweep.js --plan metabolism --seeds 5`.

The range comes from a calibration pass (`--plan upkeep-cal`, 2 seeds, 20k
ticks): survival was fine up to 0.005, half the worlds died at 0.01, all at 0.02.

## Findings

**Upkeep: no measurable effect.** Across 0–0.005, every outcome stays inside
the seed-to-seed noise — effective species (sd 1–4), body size, guild mix, eyes,
distinct ruling body plans, how much worlds disagree. The calibration pass had
suggested diversity peaking at 0.002 (8.8 from 2 seeds); with 5 seeds that did
not hold up.

**Why:** starvation causes at most 1% of deaths at every strength. Upkeep acts
only by taxing the birth rate — an organism has to pay down its debt before it
can breed — and the window between "too weak to matter" (≤0.005) and "kills the
world" (≥0.01) is too narrow for that tax to become a selective force on body
plans.

**Kleiber lifespan: bodies shrink, robustly.** With `lifespanExponent` 0.25,
body size is 2.73–3.73 cells in every cell of the table, against 4.15–5.47 with
the original linear lifespan — no overlap. At upkeep 0 it also doubles the
population (2,805 vs 1,292). That follows from how it's anchored: a 5-cell body
lives as long as before, smaller bodies relatively longer, bigger ones shorter,
so small wins. It doesn't make worlds more varied.

**Useless organs stay rare either way:** 1–5% of movers carry a producer cell
they can't use, with or without upkeep. They were never common (see the
correction in the metabolism commit, 90f6a48).

## What this rules out, and what it doesn't

Ruled out: metabolic upkeep, alone, as the fix for "evolving in circles" at
default food. The controls that do change what evolves are still the ones from
sweeps 1–2: food production, movers-can-produce, and food drop.

Not ruled out: upkeep at **high food**. Sweep 2 found that abundance (food
10–14) is where every world converges on ~3-cell bodies; a cost of existing is
the natural counterweight there, and the window before extinction should be
wider when food is plentiful. That's the next experiment if this line is
pursued.
