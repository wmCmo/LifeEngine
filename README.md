# Life Engine Lab

**Is evolution going in circles?**

Run [The Life Engine](https://github.com/MaxRobinsonTheGreat/LifeEngine) long enough and the same two shapes take over: armed plants (producers packed in a checkerboard, killers on the rim) and tiny movers built to dodge them and breed fast. This fork asks whether that outcome is forced by the rules, or is just one history out of many. To find out, it makes the simulation fast enough to run hundreds of worlds, teaches it what a species is, and draws the family tree as it grows.

**[Open the lab ↗](https://wmcmo.github.io/LifeEngine/)** · [Evolution map](https://wmcmo.github.io/LifeEngine/evomap.html?seed=625341585) · [12 worlds at once](https://wmcmo.github.io/LifeEngine/multiworld.html?food=7&mcp=1&drop=5) · [The original game](https://wmcmo.github.io/LifeEngine/play.html)

Everything runs in the browser. Built on Max Robinson's engine. See [Credit](#credit-and-license).

## What we found

The short answer is: partly. Some of the outcome is forced, some of it is luck, and the amount of food decides which.

- **The plant/animal split is forced; the arms race on top of it isn't.** Across 12 worlds with different seeds, mouths (25–39%) and producers (28–51%) always made up most of every body. Killers varied six-fold, armour ran from 0% to 16%, and at least one world never evolved eyes.
- **The armed-plant world came out of an extinction.** In one seeded world, a population crash of 83% wiped out 29 of 33 established lineages, mostly grazers. Armed plants took over and made up 72% of all life.
- **Food decides almost everything.** More food means smaller bodies, in every combination of settings tried. Predators and eyes thrive only when food is scarce. The default setting sits at the edge of viability: 3 of 20 worlds went extinct there, and none of 60 did with a little more food.
- **Scarcity is where worlds go their own way.** Plenty of food makes every world converge. Scarce food, with plants and animals allowed to mix, is where separate worlds take different paths.
- **Charging rent for every cell didn't help.** A metabolic cost scaled like real animals' (Kleiber's law) made no measurable difference at default food. It's a null result, but still worth knowing.
- **Making size pay does work.** When killers can only hurt prey up to their own size, hunters roughly triple in size, from about 4 cells to 11–14. When kills also feed the killer, those big hunters become common.

Worlds are noisy: the same settings gave 2.6 to 9.8 effective species across five seeds. Each result above clears that noise. The full numbers are in the [sweep write-ups](docs/sweeps/), and the reasoning behind each step is in [ROADMAP.md](ROADMAP.md).

## What's new in this fork

| | |
|---|---|
| **10–20× faster** | The simulation runs in a Web Worker instead of on the browser's timer: from about 170 steps a second to 2,000–4,000, and 13,000–28,000 across a dozen worlds. ([`src/Sim/sim.worker.js`](src/Sim/sim.worker.js)) |
| **Real species** | A species is everything within a quarter of its founder's body, not every mutant. One seeded world went from 173 "species" to about 7 effective ones, and every lineage traces back to the first organism. |
| **Eras and extinctions** | An era is one species' reign. A mass extinction is a crash that kills at least half the established lineages. Both are detected from the numbers. ([`src/Stats/EraRecord.js`](src/Stats/EraRecord.js)) |
| **Evolution map** | A time-scaled family tree that keeps growing. Line thickness is population, and each species is drawn as its actual body. It also has a full-screen world window with the original tools. ([`src/Map/EvoMap.js`](src/Map/EvoMap.js)) |
| **Parallel worlds** | Same rules, different seeds, side by side: the only way to tell what's forced from what's luck. ([`src/multiworld.js`](src/multiworld.js)) |
| **Settings in the link** | All 27 evolution settings, with presets, travel in the URL, so everyone who opens a link watches the same world. ([`src/Sim/UrlSettings.js`](src/Sim/UrlSettings.js)) |
| **New rules, off by default** | Metabolic upkeep, Kleiber lifespan scaling, swallowing and a gape limit. With every one off, it's the original game. |
| **Save and load** | Worlds save in the original format plus the map's history, and saves open in either game. ([`src/Sim/WorldSave.js`](src/Sim/WorldSave.js)) |
| **Headless sweeps** | Over 200 worlds run from the command line, several seeds each. ([`tools/sweep.js`](tools/sweep.js), [`docs/sweeps/`](docs/sweeps/)) |

## Try a world

Every link carries a seed and its settings.

| World | What happens |
|---|---|
| [The default world](https://wmcmo.github.io/LifeEngine/evomap.html?seed=625341585) | The original rules. Watch the origin plant's age end and see what takes over. |
| [Most divergent histories](https://wmcmo.github.io/LifeEngine/evomap.html?seed=625341585&food=7&mcp=1&drop=5) | A little more food, plants and animals allowed to mix, food falling from the sky. |
| [Most species at once](https://wmcmo.github.io/LifeEngine/evomap.html?seed=625341585&food=10) | Food at 10: the richest diversity measured. |
| [Abundance](https://wmcmo.github.io/LifeEngine/evomap.html?seed=625341585&food=14) | Every world converges on tiny bodies. Evolution in circles, on purpose. |
| [Scarce, with hunters](https://wmcmo.github.io/LifeEngine/evomap.html?seed=625341585&food=5&drop=5) | Predators and eyes take over. One world in five died. |
| [Size pays](https://wmcmo.github.io/LifeEngine/evomap.html?swallow=1&gape=1) | Kills feed the killer, and killers can't hurt anything bigger than themselves. |
| [Twelve worlds, one setting](https://wmcmo.github.io/LifeEngine/multiworld.html?food=7&mcp=1&drop=5) | The divergent setting in parallel. |

## Run it locally

You need [Node.js](https://nodejs.org/).

```bash
npm install
npm run build          # or: npm run build-watch while editing
node tools/serve.js dist 8124
```

Then open `http://localhost:8124/`. The pages are:

| Page | |
|---|---|
| `index.html` | The lab's landing page |
| `evomap.html` | The evolution map and world window |
| `multiworld.html` | Parallel worlds |
| `play.html` | The original game, with its organism and brain editor |

To publish to GitHub Pages, run `npm run deploy`. It builds `dist/` and pushes it to the `gh-pages` branch. Run `npm run deploy -- --dry` to build locally without pushing.

### Experiments from the command line

```bash
node tools/bench.js 400 300 40000 2000     # headless benchmark: cols rows warmup timed
node tools/sweep.js --ticks 20000 --seeds 2   # parameter sweep (see docs/sweeps/)
node tools/run-world.js '{"seed":11,"ticks":40000}'    # one headless world, one JSON line out
node tools/eye-census.js '{"seed":11,"ticks":30000}'   # who carries eyes, and what their brains do
node tools/test-save.js                    # save/load round trip
node tools/test-url-settings.js            # every setting round-trips through a link
```

Seed the RNG before any A/B comparison: the same seed gives a bit-identical population trace. [ROADMAP.md](ROADMAP.md) has more measurement notes.

## Credit and license

Life Engine Lab is a fork of **[The Life Engine](https://github.com/MaxRobinsonTheGreat/LifeEngine) by Max Robinson**, branched from its `develop` branch. The engine, the cell types, the original game and its editor are his work, and all credit for them is his. Play his version at [thelifeengine.net](https://thelifeengine.net/).

Like the original, this project is licensed under the [GNU GPL v3](LICENSE).

<details>
<summary><b>How the simulation works</b> (from the original README)</summary>

The life engine is a cellular automaton designed to simulate the long term processes of biological evolution. It allows organisms to eat, reproduce, mutate, and adapt.
Unlike genetic algorithms, the life engine does not manually select the most "fit" organism for some given task, but rather allows true natural selection to
run its course. Organisms that survive, successfully produce offspring, and out-compete their neighbors naturally propogate througout the environment.

### The Environment
The environment is a simple grid system made up of cells, which at every tick have a certain type. The environment is populated by organisms, which are structures of multiple cells.

### Cells
A cell can be one of the following types.
#### Independent Cells
Independent cells are not part of organisms.
- Empty - Dark blue, inert.
- Food - Grayish-blue, provides nourishment for organisms.
- Wall - Gray, blocks organisms movement and reproduction.
#### Organism Cells
Organism Cells are only found in organisms, and cannot exist on their own in the grid.
- Mouth - Orange, eats food in directly adjacent cells.
- Producer - Green, randomly generates food in directly adjacent empty cells.
- Mover - Light blue, allows the organism to move and rotate randomly.
- Killer - Red, harms organisms in directly adjacent cells (besides itself).
- Armor - Purple, negates the effects of killer cells.
- Eye - Light purple with a slit, allows the organism to see and move intelligently. See further description below.

### Organisms
Organisms are structures of cells that eat food, reproduce, and die.
When an organism dies, every cell in the grid that was occupied by a cell in its body will be changed to food.
Their lifespan is calculated by multiplying the number of cells they have by the hyperparameter `Lifespan Multiplier`. They will survive for that many ticks unless killed by another organism.
When touched by a killer cell, an organism will take damage. Once it has taken as much damage as it has cells in its body, it will die. If the hyperparameter `One touch kill` is on, an organism will immediatly die when touched by a killer cell.

### Reproduction
Once an organism has eaten as much food as it has cells in its body, it will attempt to reproduce.
First, offspring is formed by cloning the current organism and possibly mutating it (see below).
The offspring birth location is then chosen a certain number of cells in a random direction (up, down, left, right). This number is calculated programmatically such that it is far enough away that it can't intersect with it's parent.
Additionally, a random value between 1 and 3 is added to the location to introduce a little variance.
Reproduction can fail if the offspring attempts to occupy non-empty cells, like other organisms and food. If reproduction fails, the food required to produce a child is wasted.

### Mutation
Offspring can mutate their anatomies in 3 different ways: change a cell, lose a cell, or add a cell. Changing a cell sets a random cell to a random type. Losing a cell removes a random cell. Note that this can result in organisms with "gaps" and cells disconnected from the rest of its body. I consider this a feature, not a bug.
To add a cell the organism first selects a cell it already has in its body, then grows a new cell with a random type in a location adjacent to the selected cell.

If an organism mutates, there is a 10% chance that mutation will alter the movement patterns of the organism (see below).

### Movement and Rotation
Organisms with mover cells (light blue) are permitted to move freely about the grid. Only a single mover cell is required and adding more doesn't do anything. By default, an organism selects a random direction and moves one cell per tick in that direction for a certain number of ticks. This number is called "Move range", and it can mutate over time.

Organims can also rotate around a central pivot cell. This cell can never be removed by mutation, though it can change type. Movers rotate randomly when they change direction, and their rotation is not necessarily the same as their movement direction, ie, they aren't always facing the direction they are moving. Offspring of all organisms (including static ones) rotate randomly during reproduction. This rotation can be toggled in the simulation controls.

### Eyes and Brains
Any organism can evolve eyes, but when an organism has both eyes and mover cells it is given a brain. The eye, unlike other cells, has a direction, which is denoted by the direction of the slit in the cell. It "looks" forward in this direction and "sees" the first non-empty cell within a certain range. It checks the type of the cell and informs the brain, which then decideds how to move. The brain can either ignore (keep moving in whatever direction), chase (move towards the observed cell), or retreat (move in the opposite direction of the observed cell). The brain maps different observed cell types to different actions. For instance, the brain will chase when it sees food and retreat when it sees a killer cell. These behaviors can mutate over time.

</details>
