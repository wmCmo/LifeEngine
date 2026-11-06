# Sweep 2 — how food, the plant/animal barrier and food rain interact

Every combination of food production (`foodProdProb` 5, 7, 10, 14),
`moversCanProduce` (off/on) and auto food drop (`foodDropProb` 0/5): 16
combinations × 5 seeds (11–55), 40,000 ticks on 300×220, metrics over the late
half. 80 worlds, 31.7 minutes, none failed or timed out. Full table and pivots:
[sweep-2-table.md](sweep-2-table.md). Reproduce:
`node tools/sweep.js --plan energy --seeds 5`.

Columns below: **mcp** = movers can produce food, **drop** = auto food drop.

## The noise, measured

The baseline's five seeds gave effective species of 4.5, 2.6, 8.3, 9.4 and
9.8. Sweep 1 used only the first three, which is why its baseline looked like
5.1; with all five it's 6.9. Same setting, different sample. A difference in
effective species needs to be large relative to a standard deviation of 2–4
before it means anything here.

## Findings, most robust first

**1. More food, smaller bodies — in every combination.**

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 4.84 | 5.18 | 6.30 | 5.26 |
| 7 | 3.77 | 3.98 | 4.69 | 5.53 |
| 10 | 3.54 | 4.18 | 3.50 | 3.44 |
| 14 | 3.01 | 2.81 | 2.84 | 3.07 |

At food 14 every combination converges on ~3-cell bodies, whatever the other
two controls say. The largest bodies come from scarcity with the plant/animal
barrier removed.

**2. Food 5 is at the edge of viability.** 3 of the 20 worlds at food 5 went
extinct at some point (three different seeds and settings, all of which
regrew after the reset); 0 of the 60 worlds at food 7 or more did. Note that
food 5 is the default.

**3. Predators and eyes need scarcity.** Movers-can-produce or food rain turn
a food-5 world predator-heavy (16% → 48–57%) and eye-heavy (31% → 56–69%).
At food 14 the same settings give 2–13% predators and 1–16% eyes. Food level
gates the effect of the other two controls — the interaction this sweep was
looking for.

**4. Two different kinds of variety, peaking in different places.**

- **Variety at a moment** (effective species) peaks around food 10 with the
  other controls at default: 9.8 ± 1.8, vs 6.3 ± 1.7 at food 14 (about three
  standard errors apart) and 6.9 ± 3.2 at the baseline (suggestive, not
  conclusive). Sweep 1 independently found the same, 10.1 at food 10.
- **Variety of history** — how many different body plans rule an era, and how
  much separate worlds disagree — peaks at *scarcity with a control switched
  on*: up to 5.6 ruling plans and disagreement 0.34–0.40 at food 5–7, against
  ~2 plans and 0.03–0.17 at food 14.

Abundance makes every world converge on the same small-bodied, plant-heavy
outcome. Scarcity with the barrier down is where worlds take different paths.

**5. Food rain lowers variety at a moment — with the barrier in place.** With
movers-can-produce off, `drop=5` is lower at every food level (at food 10,
9.8 → 5.1). With it on, the effect is mixed and reverses at food 14 (6.7 →
7.6), within noise.

## A candidate setting

If the goal is "less evolving in circles": **food 7, movers can produce,
food drop 5.** All 5 worlds survived, the seeds disagreed with each other the
most of any combination (0.40), bodies were large (5.53), and it's the most
predator- and eye-rich world that never died (60% predators, 68% eyes).
Variety at any one moment is low and very uneven there (4.0 ± 4.1) — the
variety is across time and across worlds, not within a snapshot.

Caveats: five seeds; three of them shared with sweep 1; worlds that went
extinct are measured on the epoch after their reset.
