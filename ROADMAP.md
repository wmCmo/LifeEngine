# LifeEngine — working notes and plan

Fork of `MaxRobinsonTheGreat/LifeEngine`, branched from `develop` (not `master` —
`develop` has the 8-decision state-machine brain with per-eye decision tables,
which is what the exported organisms use).

The question driving all of this: when the simulation settles into minimal
movers and checkerboard plants, is that the rules, or one history out of many?
And can the world be made rich enough that evolution stops going in circles?

---

## Done

**The simulation runs in a Web Worker.** The old engine paced ticks with a
fixed-timestep accumulator on `setInterval`, so it could never exceed the
target fps, and browsers clamp nested timers to ~4ms underneath that.
Throughput was capped near 170 ticks/sec on any hardware. Now ~2,900.

**Profile-driven fixes, +17% with a bit-identical population trace.** What the
profiler actually showed, after two wrong guesses:

| | |
|---|---|
| `MouthCell.performFunction` | 19% — neighbour scans |
| `Organism.update` | 13% |
| `attemptMove` / `changeCell` | 9% each |
| `KillerCell.performFunction` | 8% |
| `Brain.deepCopy` | 7% — `Object.entries` on every birth, now gone |
| `EyeCell.look` | **1%** |

**Parallel worlds** (`dist/multiworld.html`). N independent worlds, one worker
per core, each seeded. Reports a divergence figure: mean absolute deviation of
each world's body-plan composition from the across-world average.

### First real result

12 worlds, 1.2M total ticks:

```
                mean     range across worlds
mouth          29.1%     24.6 – 39.3%
producer       40.6%     27.9 – 50.9%
mover          11.1%      5.8 – 18.4%
killer         10.8%      2.7 – 17.1%
armor           1.8%      0.0 – 15.7%
eye             6.5%      0.0 – 12.2%
```

**The metabolic core is forced; the arms race is not.** Mouth and producer land
in the same place every time. Killer varies 6×, armor runs 0–16%, and several
worlds evolved no eyes at all. The plant/animal split is inevitable — but
"small movers with killers" vs "blind grazers" vs "armoured plants" is
contingent. Invisible from a single world.

---

## Plan

### 1. Real species clustering — done

A mutated child stays its parent's species while its body differs from the
species *founder* by at most `Hyperparams.speciesThreshold` (default 0.25, a
quarter of the cells); otherwise it founds a new species descended from the
old one. Negative threshold = upstream behaviour. `fossilize()` now keeps a
small record of extinct species, so lineages survive — it used to drop every
ancestor link at extinction, which made a tree impossible.

Species naming moved off `Math.random` onto its own stream, so bookkeeping no
longer consumes simulation randomness. Verified: same seed, thresholds -1 /
0.15 / 0.25 / 0.4 all produce the identical population trace.

Same seed, 400×300, 42k ticks:

| threshold | extant | effective (inverse Simpson) | ≥1% of pop |
|---|---|---|---|
| legacy | 173 | 12.7 | 12 |
| 0.25 | 117 | **7.4** | 8 |
| 0.4 | 61 | 4.7 | 6 |

The raw count stays high because each real species carries a cloud of fresh
single-organism mutants. Use the effective number.

The lineage of the dominant species now reaches the origin of life — tick 0,
`m1 p2`, which is exactly `OriginOfLife()` — through seven ancestors. Under
legacy the same species traced back two steps.

Note: the dominant species there (`m2 p1 v1 k1`) carries a producer cell on a
mover. With `moversCanProduce` off that cell makes no food; it survives only
as cheap body mass (+lifespan, +health). Exactly what item 3 predicts.

Run it: `SPECIES_THRESHOLD=0.25 node tools/bench.js 400 300 40000 2000`

Original reasoning:

Right now "species" means *any organism whose mutation succeeded* —
`FossilRecord.addSpecies()` fires on every successful mutation and the name is
`Math.random().toString(36)`. That is a mutation log, not a phylogeny. It's why
a run shows 1,756 "species".

Needs clustering by genetic distance: anatomy edit distance plus brain-table
distance, with a threshold below which two organisms are the same species.
Then a lineage is a real branch and a tree has structure.

**This is the instrument.** Without it there's no way to tell whether any later
change actually increased diversity — only eyeballing shapes, which is what
started this.

### 2. Era and extinction detection, then narration — detection done

`src/Stats/EraRecord.js`, sampled every 100 ticks alongside the fossil record.

- **Era** = one species' reign: it becomes the most populous and holds that
  for 2,000 ticks. Labelled by the ruler's guild — plant, armed plant, grazer,
  predator (can it move, does it have a killer cell).
- **Extinction event** = population falls 40%+ from its recent peak, measured
  to the trough. **Mass extinction** if half or more of the established
  lineages (50+ ever lived) alive at the peak died during the fall; otherwise
  a population crash.

Two corrections the data forced:
- Diversity (inverse Simpson) can't classify die-offs: it rewards evenness,
  and when the dominant species collapses hardest it *rises*. The first run
  showed 67 lineages lost while "diversity" went 4.9 → 6.
- A change of guild now always founds a new species. Otherwise a predator
  that drops its one mover cell stays the same species, and an era labelled
  "predator" was 72% plants.

First result, seeded 42k ticks: the origin plant's age ends in a mass
extinction at 5.2k–12k — population 3,964 → 690, 29 of 33 established
lineages lost, mostly grazers and predators — and armed plants (`m2 p1 k1`)
take over, reaching 72% of all organisms. The world in the original
complaint didn't drift into being; it came out of an extinction.

Narration (ollama) still to do.

Original reasoning:

Detect numerically, not with a model. A mass extinction is a threshold on a
time series — a sharp drop in population or in extant-lineage count. "Era of
killers" is `argmax` over cell-type proportions. All of it comes from
`FossilRecord` data already being collected.

The predator-prey oscillation is already visible in a single run's population
trace: `3031 → 2540 → 2466 → 1936 → 2201 → 2958 → 3773 → 3695 → 3327`. Nobody
programmed that. Those cycles *are* the eras.

Use ollama only for the layer where it adds something: naming an era and
writing the one-paragraph story, given the numeric event list. Never in the
detection path.

### 2b. Evolution map — v1 done

`dist/evomap.html` (run `node tools/serve.js dist 8124`, open
`http://localhost:8124/evomap.html?seed=123`). A time-scaled phylogeny on an
infinite canvas, growing to the right as the world runs in a worker.

- x = time, each species a line, thickness = its population at that moment
- lanes allocated like `git log --graph`: a species keeps its lane forever, so
  nothing on screen moves when new branches appear
- visible by default: every era's ruler, today's top species, and the full
  ancestry of each back to the origin; the rest folds behind `+N` badges
- each species drawn as its founder's actual body; era bands and extinction
  events in the background; hover for history, click `+N` to expand

Data comes from `src/Stats/PhyloRecord.js` (off unless the page asks for it).
Species that die young with no living descendants are folded into a
`died_young` count on their parent: over a seeded 42k ticks, 12,399 species
were founded and only 301 are held (2.4%), with 0 broken lineages.

Gaps: the map is its own page, not yet part of the main app; its history isn't
saved with a world; the founder portrait ignores eye direction.

### 2c. Parameter sweep — first pass done

`tools/sweep.js`, results in [docs/sweeps/sweep-1.md](docs/sweeps/sweep-1.md).
Energy (`foodProdProb`) is the master knob: life dies at 2, diversity peaks
around 10 and falls again at 20, and abundance halves body size.
`moversCanProduce` and `foodDropProb` change what *kind* of world evolves
(predator- and eye-dominated, more disagreement between seeds). Taxing movers
just hands the world to plants. Three seeds is a high noise floor — the next
pass needs more seeds and the interactions between those three controls.

### 3. Metabolic upkeep per cell type

Current economics (`Organism.js`):

```
foodNeeded()  = cells.length        // one-time price to reproduce
lifespan()    = cells.length * 100  // bigger lives proportionally LONGER
maxHealth()   = cells.length        // bigger tanks proportionally MORE
```

There is **no per-tick cost for existing**. A killer cell, an armor cell, an
eye — free forever once built. The only real cost of a cell is time to first
reproduction, which is why bodies collapse to "minimum viable kit" or "pack
maximum function into a blob".

Fix: charge rent, scaled the way real biology does it.

Bigger animals *do* live longer — Kleiber's law, lifespan ∝ mass^0.25. The bug
isn't the direction, it's the **exponent**: LifeEngine uses mass^1.0, linear, no
diminishing returns. An elephant is 500,000× a mouse and lives 25× longer, not
500,000×. And real animals pay for size with mass^0.75 *more food per unit
time*. LifeEngine grants the longevity and charges nothing for the metabolism.

So: upkeep ∝ `cells^0.75`, lifespan ∝ `cells^0.25`.

Also worth a free experiment: `moversCanProduce` is a hyperparameter set to
`false`, which *enforces* the plant/animal split by fiat. Flip it and see
whether the split re-emerges on its own.

### 4. Terrain and climate

`src/Utils/Perlin.js` is sitting there unused, which is a strong hint about
where this was headed.

A uniform, stationary world has exactly one correct answer per niche, so
evolution finds it and stops — that *is* the equilibrium being observed. Add
light gradient by row, temperature bands, food-decay varying by region,
periodic ice ages, barriers that form and break. Barriers give allopatric
speciation, the single most reliable diversity generator in real biology.

Worth testing first, for free: whether a **much larger world** alone produces
richer evolution. More space means more room for populations to separate.
Headless overnight run, no new code.

### 5. Neuron-as-a-cell brains

Organisms should have to *earn* a brain. Make it a cell: a `neuron` cell that
costs upkeep per tick and contributes capacity — more hidden units, longer
`lookRange`, a step of memory. Then brains evolve only where the environment
pays for them, and intelligence appearing becomes a visible cost-benefit
crossing in the fossil record.

**Last, deliberately.** The optimal policy in the current world is about three
rules long and the lookup table already finds it. Richer brains and richer
environments are complements — do 3 and 4 first or there's nothing to think
about.

---

## Decided against, for now

**Rust.** The worker split accidentally built exactly the boundary a WASM port
needs — the sim is isolated behind a message protocol with no DOM dependency,
so a port keeps the whole UI. But the 2–4× constant factor isn't worth weeks.
The real argument is parallelism: rayon plus spatial partitioning could give
8–12× on *one* big world, which JS can't do. Revisit if one huge world becomes
the bottleneck.

**GPU** (RTX 5060 Ti available). Three problems: write conflicts *are* the
simulation (two movers wanting one square currently resolve by update order —
on GPU that needs atomics or claim/resolve passes, which changes semantics);
divergent control flow across heterogeneous organisms wrecks warp occupancy;
and a 400×300 board is 120 KB, far too little to amortise kernel launches — it
would likely be *slower* than the CPU at this size. Only worth it for one
enormous world (2000×2000+), and only after a headless CPU run proves bigger
worlds actually produce richer evolution.

---

## Measurement notes

- **Seed the RNG before any A/B.** Same seed ⇒ bit-identical population trace,
  which doubles as a correctness check: an optimisation that preserves
  behaviour reproduces the trace exactly. The bench overrides `Math.random`
  without touching the engine.
- **Variance is enormous** without a seed. Same settings, same grid: one run
  settled at 74 organisms, another at 527.
- **Close every other simulation tab before benchmarking.** Browser tabs
  running at max speed moved results by 25% and caused one wrong revert.
- **Profile, don't theorise.** Two confident diagnoses this session were wrong:
  the eye raycast (1% of runtime) and the "cache miss" explanation for
  per-organism cost growth. The real cause of that growth is simply that a
  denser board means more interactions per organism.
- Don't rewrite `EyeCell.look` to use the flat `view` array. Measured — it's
  the same speed, because the `GridCell` objects are allocated in one sweep and
  are already contiguous.
