# Sweep 20261106-182301

10 configs x 5 seeds (11, 22, 33, 44, 55), 40,000 ticks, 300x220.
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
| baseline | 4/5 | 6.9 (2.6-9.8) | 4.84 | 13/57/14/16 | 31% | 3.2 | 3.0 | 1.4 | 0.16 | 0.00 | 1292 | 293 |  |
| upkeep=0 lexp=0.25 | 5/5 | 10.2 (6.0-15.8) | 2.73 | 41/22/29/8 | 9% | 4.4 | 2.6 | 1.2 | 0.10 | 0.33 | 2805 | 140 | diversity +48%, bodies -44%, plan shift 0.33 |
| upkeep=0.0005 lexp=1 | 5/5 | 7.1 (3.7-10.8) | 4.15 | 16/53/23/8 | 17% | 3.0 | 2.6 | 1.2 | 0.16 | 0.20 | 1681 | 222 | plan shift 0.20 |
| upkeep=0.0005 lexp=0.25 | 5/5 | 6.3 (2.7-9.0) | 3.70 | 21/50/12/17 | 17% | 4.4 | 3.2 | 1.8 | 0.27 | 0.08 | 1468 | 256 | bodies -24%, worlds disagree more |
| upkeep=0.001 lexp=1 | 5/5 | 5.1 (2.9-9.4) | 5.01 | 14/60/6/19 | 22% | 3.6 | 3.4 | 1.6 | 0.16 | 0.05 | 807 | 375 | diversity -26% |
| upkeep=0.001 lexp=0.25 | 5/5 | 6.1 (4.4-7.5) | 3.04 | 29/32/22/17 | 23% | 4.4 | 3.2 | 1.8 | 0.14 | 0.21 | 1604 | 206 | bodies -37%, plan shift 0.21 |
| upkeep=0.002 lexp=1 | 5/5 | 9.7 (5.8-14.3) | 5.47 | 27/44/21/8 | 21% | 3.4 | 3.2 | 0.2 | 0.17 | 0.23 | 1489 | 229 | diversity +41%, plan shift 0.23 |
| upkeep=0.002 lexp=0.25 | 5/5 | 6.2 (2.7-7.6) | 3.31 | 29/37/22/12 | 9% | 4.0 | 2.8 | 1.6 | 0.16 | 0.23 | 1759 | 283 | bodies -32%, plan shift 0.23 |
| upkeep=0.005 lexp=1 | 5/5 | 4.6 (3.4-5.7) | 4.83 | 29/41/12/18 | 28% | 3.2 | 3.0 | 1.4 | 0.18 | 0.20 | 1035 | 418 | diversity -34%, plan shift 0.20 |
| upkeep=0.005 lexp=0.25 | 5/5 | 4.3 (2.9-5.3) | 3.73 | 28/35/17/20 | 17% | 3.8 | 2.6 | 2.2 | 0.19 | 0.21 | 1082 | 529 | diversity -38%, bodies -23%, plan shift 0.21 |

## Pivots

### survived (of seeds)

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 4/5 | 5/5 |
| 0.0005 | 5/5 | 5/5 |
| 0.001 | 5/5 | 5/5 |
| 0.002 | 5/5 | 5/5 |
| 0.005 | 5/5 | 5/5 |

### effective species, mean ± sd

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 6.9 ± 3.2 | 10.2 ± 3.7 |
| 0.0005 | 7.1 ± 2.5 | 6.3 ± 2.4 |
| 0.001 | 5.1 ± 2.7 | 6.1 ± 1.3 |
| 0.002 | 9.7 ± 3.9 | 6.2 ± 2.1 |
| 0.005 | 4.6 ± 0.9 | 4.3 ± 1.2 |

### body size (cells/org)

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 4.84 | 2.73 |
| 0.0005 | 4.15 | 3.70 |
| 0.001 | 5.01 | 3.04 |
| 0.002 | 5.47 | 3.31 |
| 0.005 | 4.83 | 3.73 |

### predators %

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 16 | 8 |
| 0.0005 | 8 | 17 |
| 0.001 | 19 | 17 |
| 0.002 | 8 | 12 |
| 0.005 | 18 | 20 |

### plants (incl. armed) %

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 70 | 63 |
| 0.0005 | 69 | 71 |
| 0.001 | 75 | 61 |
| 0.002 | 71 | 66 |
| 0.005 | 70 | 64 |

### eyes %

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 31 | 9 |
| 0.0005 | 17 | 17 |
| 0.001 | 22 | 23 |
| 0.002 | 21 | 9 |
| 0.005 | 28 | 17 |

### distinct ruling body plans

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 3.0 | 2.6 |
| 0.0005 | 2.6 | 3.2 |
| 0.001 | 3.4 | 3.2 |
| 0.002 | 3.2 | 2.8 |
| 0.005 | 3.0 | 2.6 |

### seeds disagree

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 0.16 | 0.10 |
| 0.0005 | 0.16 | 0.27 |
| 0.001 | 0.16 | 0.14 |
| 0.002 | 0.17 | 0.16 |
| 0.005 | 0.18 | 0.19 |

### movers carrying a useless producer cell %

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 2 | 1 |
| 0.0005 | 2 | 1 |
| 0.001 | 5 | 2 |
| 0.002 | 3 | 2 |
| 0.005 | 2 | 3 |

### deaths by starvation %

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 0 | 0 |
| 0.0005 | 0 | 1 |
| 0.001 | 1 | 1 |
| 0.002 | 1 | 1 |
| 0.005 | 0 | 1 |

### population

| upkeep | lexp=1 | lexp=0.25 |
|---|---|---|
| 0 | 1292 | 2805 |
| 0.0005 | 1681 | 1468 |
| 0.001 | 807 | 1604 |
| 0.002 | 1489 | 1759 |
| 0.005 | 1035 | 1082 |
