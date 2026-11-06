# Sweep 20261106-164029

16 configs x 5 seeds (11, 22, 33, 44, 55), 40,000 ticks, 300x220.
Metrics are the late half of each run (from tick 20000). One control moved at a time; everything else default.

- **survived**: seeds with no extinction-reset
- **eff species**: effective number of species (inverse Simpson), mean (min-max over seeds)
- **cells/org**: average body size
- **guilds**: % plant / armed plant / grazer / predator
- **ruler plans**: distinct body plans that ruled an era
- **disagree**: how much the seeds differ from each other in body-plan composition
- **shift**: how far the average body plan moved from baseline

| config | survived | eff species | cells/org | guilds | eyes | eras | ruler plans | mass ext | disagree | shift | pop | tps | notable |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 4/5 | 6.9 (2.6-9.8) | 4.84 | 13/57/14/16 | 31% | 3.2 | 3.0 | 1.4 | 0.16 | 0.00 | 1292 | 297 |  |
| food=5 mcp=0 drop=5 | 4/5 | 4.3 (2.7-6.2) | 5.18 | 5/26/13/57 | 69% | 5.2 | 4.4 | 1.4 | 0.35 | 0.35 | 615 | 366 | 1 died, diversity -37%, plan shift 0.35, worlds disagree more |
| food=5 mcp=1 drop=0 | 5/5 | 5.0 (1.9-8.8) | 6.30 | 5/34/13/48 | 56% | 4.8 | 4.6 | 1.2 | 0.35 | 0.18 | 1058 | 220 | diversity -27%, bodies +30%, plan shift 0.18, worlds disagree more |
| food=5 mcp=1 drop=5 | 4/5 | 5.0 (1.8-9.0) | 5.26 | 6/15/31/48 | 62% | 5.6 | 5.6 | 1.0 | 0.37 | 0.37 | 1309 | 240 | 1 died, diversity -28%, plan shift 0.37, worlds disagree more |
| food=7 mcp=0 drop=0 | 5/5 | 7.2 (4.0-11.8) | 3.77 | 17/43/35/5 | 34% | 3.8 | 2.8 | 1.6 | 0.10 | 0.27 | 2468 | 146 | bodies -22%, plan shift 0.27 |
| food=7 mcp=0 drop=5 | 5/5 | 5.5 (2.6-10.3) | 3.98 | 22/27/30/21 | 30% | 4.0 | 3.4 | 0.6 | 0.37 | 0.25 | 2672 | 176 | plan shift 0.25, worlds disagree more |
| food=7 mcp=1 drop=0 | 5/5 | 6.3 (1.8-10.4) | 4.69 | 18/36/18/28 | 29% | 4.4 | 3.6 | 1.0 | 0.34 | 0.13 | 1960 | 186 | plan shift 0.13, worlds disagree more |
| food=7 mcp=1 drop=5 | 5/5 | 4.0 (1.3-10.9) | 5.53 | 12/15/13/60 | 68% | 4.2 | 3.6 | 1.0 | 0.40 | 0.25 | 1473 | 207 | diversity -42%, plan shift 0.25, worlds disagree more |
| food=10 mcp=0 drop=0 | 5/5 | 9.8 (7.8-11.8) | 3.54 | 29/35/32/5 | 15% | 3.8 | 3.6 | 1.2 | 0.16 | 0.33 | 3496 | 105 | diversity +42%, bodies -27%, plan shift 0.33 |
| food=10 mcp=0 drop=5 | 5/5 | 5.1 (2.9-9.1) | 4.18 | 16/37/18/29 | 41% | 3.0 | 2.8 | 1.0 | 0.39 | 0.26 | 2119 | 153 | diversity -26%, plan shift 0.26, worlds disagree more |
| food=10 mcp=1 drop=0 | 5/5 | 8.1 (6.8-11.9) | 3.50 | 32/33/31/4 | 18% | 3.8 | 3.0 | 1.4 | 0.16 | 0.28 | 3374 | 106 | bodies -28%, plan shift 0.28 |
| food=10 mcp=1 drop=5 | 5/5 | 7.3 (4.6-10.2) | 3.44 | 28/32/32/8 | 22% | 3.2 | 3.2 | 0.6 | 0.17 | 0.27 | 3330 | 103 | bodies -29%, plan shift 0.27 |
| food=14 mcp=0 drop=0 | 5/5 | 6.3 (4.7-8.6) | 3.01 | 48/20/29/4 | 3% | 2.4 | 2.0 | 0.2 | 0.17 | 0.41 | 4699 | 82 | bodies -38%, plan shift 0.41 |
| food=14 mcp=0 drop=5 | 5/5 | 5.1 (4.5-5.6) | 2.81 | 44/16/38/2 | 1% | 1.8 | 1.8 | 0.0 | 0.03 | 0.46 | 5248 | 74 | diversity -26%, bodies -42%, plan shift 0.46 |
| food=14 mcp=1 drop=0 | 5/5 | 6.7 (4.3-10.0) | 2.84 | 45/18/35/2 | 2% | 2.0 | 2.0 | 0.0 | 0.04 | 0.44 | 5246 | 79 | bodies -41%, plan shift 0.44 |
| food=14 mcp=1 drop=5 | 5/5 | 7.6 (4.9-11.1) | 3.07 | 37/23/27/13 | 16% | 3.6 | 2.8 | 0.8 | 0.15 | 0.30 | 3923 | 111 | bodies -37%, plan shift 0.30 |

## Pivots

### survived (of seeds)

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 4/5 | 4/5 | 5/5 | 4/5 |
| 7 | 5/5 | 5/5 | 5/5 | 5/5 |
| 10 | 5/5 | 5/5 | 5/5 | 5/5 |
| 14 | 5/5 | 5/5 | 5/5 | 5/5 |

### effective species, mean ± sd

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 6.9 ± 3.2 | 4.3 ± 1.5 | 5.0 ± 3.0 | 5.0 ± 2.7 |
| 7 | 7.2 ± 2.8 | 5.5 ± 3.0 | 6.3 ± 3.6 | 4.0 ± 4.1 |
| 10 | 9.8 ± 1.8 | 5.1 ± 2.5 | 8.1 ± 2.1 | 7.3 ± 2.2 |
| 14 | 6.3 ± 1.7 | 5.1 ± 0.4 | 6.7 ± 2.3 | 7.6 ± 2.5 |

### body size (cells/org)

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 4.84 | 5.18 | 6.30 | 5.26 |
| 7 | 3.77 | 3.98 | 4.69 | 5.53 |
| 10 | 3.54 | 4.18 | 3.50 | 3.44 |
| 14 | 3.01 | 2.81 | 2.84 | 3.07 |

### predators %

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 16 | 57 | 48 | 48 |
| 7 | 5 | 21 | 28 | 60 |
| 10 | 5 | 29 | 4 | 8 |
| 14 | 4 | 2 | 2 | 13 |

### plants (incl. armed) %

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 70 | 31 | 39 | 21 |
| 7 | 60 | 49 | 54 | 27 |
| 10 | 63 | 53 | 65 | 60 |
| 14 | 68 | 60 | 63 | 60 |

### eyes %

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 31 | 69 | 56 | 62 |
| 7 | 34 | 30 | 29 | 68 |
| 10 | 15 | 41 | 18 | 22 |
| 14 | 3 | 1 | 2 | 16 |

### distinct ruling body plans

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 3.0 | 4.4 | 4.6 | 5.6 |
| 7 | 2.8 | 3.4 | 3.6 | 3.6 |
| 10 | 3.6 | 2.8 | 3.0 | 3.2 |
| 14 | 2.0 | 1.8 | 2.0 | 2.8 |

### seeds disagree

| food | mcp=0 drop=0 | mcp=0 drop=5 | mcp=1 drop=0 | mcp=1 drop=5 |
|---|---|---|---|---|
| 5 | 0.16 | 0.35 | 0.35 | 0.37 |
| 7 | 0.10 | 0.37 | 0.34 | 0.40 |
| 10 | 0.16 | 0.39 | 0.16 | 0.17 |
| 14 | 0.17 | 0.03 | 0.04 | 0.15 |
