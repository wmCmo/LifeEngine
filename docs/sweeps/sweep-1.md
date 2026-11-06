# Sweep 1 — which evolution controls matter

One control moved at a time from its default, 3 seeds each (11, 22, 33),
40,000 ticks on 300×220, metrics over the late half. 66 worlds, 13.5 minutes,
none failed or timed out. Full table: [sweep-1-table.md](sweep-1-table.md).
Reproduce: `node tools/sweep.js`.

## Read this first: the noise floor

The baseline's effective-species count ranged **2.6 to 8.3** across its three
seeds. A setting whose diversity lands inside that range hasn't shown anything
yet, however large its "±%" flag. What can be trusted from three seeds:

- **survival** — 0/3 vs 3/3 is decisive
- **trends** across several values of the same control
- **large composition shifts** — guild mix moving by tens of points

## Findings

**Energy is the master knob.** `foodProdProb` (default 5):

| value | survived | effective species | body size | |
|---|---|---|---|---|
| 2 | 0/3 | — | — | life dies out |
| 5 | 3/3 | 5.1 (2.6–8.3) | 5.24 | baseline |
| 10 | 3/3 | **10.1 (8.1–11.8)** | 3.60 | most diverse setting in the sweep |
| 20 | 3/3 | 5.6 | **2.63** | bodies halve, population ×5 |

Diversity peaks at intermediate richness and falls again with plenty — the
hump-shaped productivity–diversity curve ecologists see in real ecosystems.
And abundance shrinks bodies: with food everywhere, small fast reproducers win.
The 10 result is the one diversity claim that clears the noise floor (its
lowest seed is near the baseline's highest).

**The two settings that change what kind of world it is:**

- `moversCanProduce=true` — remove the plant/animal split the checkbox
  enforces, and **predators take 54%** of the world, eyes 55%, the largest
  bodies in the sweep (5.88), the most distinct ruling body plans (4.3), and
  the seeds disagree with each other the most (0.37 vs 0.15). The least
  "same two shapes" world here.
- `foodDropProb=5` — food falling from the sky: **predators 71%, eyes 79%**.
  Eyes are worth having when there's loose food to chase. The perception arms
  race appears only when the environment pays for it — relevant to the
  neuron-as-a-cell idea.

**Taxing movers doesn't break the equilibrium.** `extraMoverFoodCost` 1 → 8:
diversity 7.9 → 6.0 → 4.8 → 2.8 and plants 39% → 76%, monotonically. It just
hands the world to plants. Not a substitute for metabolic upkeep.

**Hard limits:** life dies out at `lifespanMultiplier=25` (and in 1 of 3 seeds
at 50), and at `foodProdProb=2`.

**Surprise:** `dontKillSameSpecies=true` killed all three worlds. Mechanism not
verified; the likely story is that a dominant species that can't thin its own
numbers overshoots and crashes. Only meaningful since clustering — before it,
every mutant was its own "species" and the checkbox did almost nothing.

**Other strong shifts:**
- `foodBlocksReproduction=false` → armed plants 91%, movers gone entirely
- `instaKill=true` → bodies −36%, fewest mass extinctions (0.3)
- `lifespanMultiplier=200` → bodies −40% — longer lives, *smaller* bodies.
  Unexplained.

**Inconclusive:** mutation rates and mutation symmetry. Both lower *and* higher
mutation rates raise diversity (7.3 and 6.9 vs 5.1), which points at the
baseline mean being low by chance rather than a real effect. `lookRange=10`
changed little.

## Next

More seeds and interactions on the controls that matter: `foodProdProb` at
finer steps (7, 10, 14), crossed with `moversCanProduce` and `foodDropProb`.
Five or more seeds, so the noise floor stops swallowing the answer.
