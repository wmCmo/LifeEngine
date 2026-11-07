# Sweep 4 — does swallowing make size pay?

**Yes, through the gape limit.** When a killer can only hurt prey no bigger than
itself, hunters roughly triple in size and the biggest bodies double. Swallowing
on its own does nothing for size.

Swallow share (`swallowShare` 0, 0.5, 1) × gape ratio (`gapeRatio` 0 = no limit,
1, 2), 5 seeds (11–55), 40,000 ticks on 300×220, everything else default. 45
worlds, 8.9 minutes, none failed. Full table and pivots:
[sweep-4-table.md](sweep-4-table.md). Reproduce:
`node tools/sweep.js --plan swallow --seeds 5`.

## The question

In the original game nothing rewards size (see ROADMAP item 3): food to
reproduce, health and lifespan all scale linearly with cell count. A kill
doesn't feed the killer either: the prey turns into food on the floor
(`Organism.die`), and any passing grazer can take it. The two switches test the
two missing rules:

- **swallow**: the blow that kills feeds the killer that share of the prey's
  cells directly; the rest falls on the floor as before.
- **gape**: killer cells only hurt prey up to `gapeRatio` × the attacker's own
  size. Being big protects you from small predators and lets you eat big prey.

Both at 0 is the original game, checked bit for bit: `node tools/bench.js 400
300 40000 2000` still prints `trace: 2104 10927 443 377`.

## Findings

**Gape 1 makes hunters big, in every seed.** Hunters are movers with a killer
cell. Their mean body size:

| | gape 0 | gape 1 | gape 2 |
|---|---|---|---|
| swallow 0 | 4.2 (4.1–4.5) | **11.4** (7.9–14.1) | 4.5 (4.0–5.1) |
| swallow 0.5 | 4.1 (3.9–4.9) | **11.9** (9.9–14.8) | 4.3 (4.0–5.1) |
| swallow 1 | 3.9 (3.2–4.3) | **13.6** (10.7–15.5) | 5.4 (4.3–7.6) |

Mean (range over the 5 seeds). The gape 1 ranges don't overlap the others.
The largest body in the world goes from 9–16 cells to 14–33, and is biggest
with full swallowing (20–33).

**Swallowing is what makes big hunters common.** With gape 1, hunters are 17%
of organisms without swallowing and 23–25% with it. Predators as a guild go
from 16% to 24–28%.

**Swallowing alone shrinks the hunters' share.** Without a gape limit,
swallow 1 cuts hunters from 16% to 5% and pushes armed plants up (57% → 71%). A
plant with a killer cell now eats the grazers that bump into it, so swallowing
mostly feeds the sessile killers.

**Gape 2 does nothing.** Bodies average about 5 cells, so prey twice the
attacker's size is rare and the limit almost never applies.

**Gape 1 without swallowing breaks the armed plants** (57% → 3%) and lowers
diversity (6.9 → 3.8 effective species). A small armed plant can no longer
hurt anything bigger than itself, so its killer cells stop paying and plain
plants take over (13% → 58%). Swallowing brings part of that back.

**Bulk itself now pays.** With gape 1, 36–48% of movers carry a producer cell
they can't use, against 2–9% everywhere else. In the original game such a cell
was dead weight. Under a gape limit it is size, which is what decides who can
eat whom.

**Diversity moves within the noise.** Effective species ranges from 5.9 to 8.7
in every configuration except gape-only, against a seed-to-seed sd of 1–4.

## What it means

Size now pays when two things are true: you can only eat what is smaller than
you, and eating it feeds you. That is the "eat your prey whole" rule from the
conversation that led to this sweep. Predator size has a ceiling well above the
3–5 cell plateau, and the ruling body plans are no longer only tiny.

Next to look at: long runs with `swallow=1&gape=1`, to see whether bodies keep
growing past 40k ticks or settle; and whether the plant side answers with armor
(an arms race) or stays small and numerous.
