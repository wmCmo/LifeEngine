# Sweep 20261107-034121

9 configs x 5 seeds (11, 22, 33, 44, 55), 40,000 ticks, 300x220.
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
| baseline | 4/5 | 6.9 (2.6-9.8) | 4.84 | 13/57/14/16 | 31% | 3.2 | 3.0 | 1.4 | 0.16 | 0.00 | 1292 | 532 |  |
| swallow=0 gape=1 | 5/5 | 3.8 (3.1-4.7) | 5.16 | 58/3/21/17 | 25% | 3.6 | 2.8 | 1.2 | 0.29 | 0.33 | 1780 | 321 | diversity -45%, plan shift 0.33, worlds disagree more |
| swallow=0 gape=2 | 5/5 | 6.6 (4.1-9.1) | 4.79 | 16/50/20/13 | 32% | 3.6 | 3.4 | 1.4 | 0.13 | 0.12 | 1335 | 412 | plan shift 0.12 |
| swallow=0.5 gape=0 | 5/5 | 6.3 (3.8-9.0) | 4.40 | 6/66/16/11 | 25% | 2.6 | 2.6 | 0.8 | 0.13 | 0.16 | 1389 | 607 | plan shift 0.16 |
| swallow=0.5 gape=1 | 5/5 | 8.7 (4.9-13.0) | 7.26 | 52/12/12/24 | 27% | 2.4 | 2.4 | 1.4 | 0.19 | 0.23 | 1140 | 395 | diversity +26%, bodies +50%, plan shift 0.23 |
| swallow=0.5 gape=2 | 5/5 | 5.9 (2.7-8.1) | 4.73 | 8/65/13/13 | 33% | 2.8 | 2.8 | 1.0 | 0.13 | 0.17 | 1433 | 580 | plan shift 0.17 |
| swallow=1 gape=0 | 5/5 | 5.9 (5.1-7.7) | 4.24 | 9/71/15/5 | 16% | 2.6 | 2.2 | 0.8 | 0.13 | 0.22 | 1398 | 642 | plan shift 0.22 |
| swallow=1 gape=1 | 5/5 | 7.1 (3.5-13.7) | 6.78 | 41/20/10/28 | 27% | 2.6 | 2.4 | 1.8 | 0.16 | 0.18 | 868 | 468 | bodies +40%, plan shift 0.18 |
| swallow=1 gape=2 | 5/5 | 5.9 (2.4-12.3) | 4.66 | 5/74/13/9 | 24% | 2.8 | 2.8 | 1.6 | 0.15 | 0.17 | 1239 | 1151 | plan shift 0.17 |

## Pivots

### survived (of seeds)

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 4/5 | 5/5 | 5/5 |
| 0.5 | 5/5 | 5/5 | 5/5 |
| 1 | 5/5 | 5/5 | 5/5 |

### effective species, mean ± sd

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 6.9 ± 3.2 | 3.8 ± 0.7 | 6.6 ± 2.1 |
| 0.5 | 6.3 ± 2.4 | 8.7 ± 3.2 | 5.9 ± 2.2 |
| 1 | 5.9 ± 1.0 | 7.1 ± 4.2 | 5.9 ± 3.8 |

### body size (cells/org)

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 4.84 | 5.16 | 4.79 |
| 0.5 | 4.40 | 7.26 | 4.73 |
| 1 | 4.24 | 6.78 | 4.66 |

### predators %

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 16 | 17 | 13 |
| 0.5 | 11 | 24 | 13 |
| 1 | 5 | 28 | 9 |

### plants (incl. armed) %

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 70 | 61 | 67 |
| 0.5 | 73 | 64 | 73 |
| 1 | 81 | 61 | 79 |

### eyes %

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 31 | 25 | 32 |
| 0.5 | 25 | 27 | 33 |
| 1 | 16 | 27 | 24 |

### hunters (movers with a killer) %

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 16 | 17 | 12 |
| 0.5 | 10 | 23 | 13 |
| 1 | 5 | 25 | 8 |

### hunter body size (cells)

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 4.2 | 11.4 | 4.5 |
| 0.5 | 4.1 | 11.9 | 4.3 |
| 1 | 3.9 | 13.6 | 5.4 |

### largest body (cells)

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 10.8 | 17.8 | 11.4 |
| 0.5 | 9.8 | 22.4 | 10.8 |
| 1 | 9.2 | 26.6 | 11.6 |

### distinct ruling body plans

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 3.0 | 2.8 | 3.4 |
| 0.5 | 2.6 | 2.4 | 2.8 |
| 1 | 2.2 | 2.4 | 2.8 |

### seeds disagree

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 0.16 | 0.29 | 0.13 |
| 0.5 | 0.13 | 0.19 | 0.13 |
| 1 | 0.13 | 0.16 | 0.15 |

### movers carrying a useless producer cell %

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 2 | 40 | 2 |
| 0.5 | 2 | 48 | 3 |
| 1 | 3 | 36 | 9 |

### deaths by starvation %

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 0 | 0 | 0 |
| 0.5 | 0 | 0 | 0 |
| 1 | 0 | 0 | 0 |

### population

| swallow | gape=0 | gape=1 | gape=2 |
|---|---|---|---|
| 0 | 1292 | 1780 | 1335 |
| 0.5 | 1389 | 1140 | 1433 |
| 1 | 1398 | 868 | 1239 |
