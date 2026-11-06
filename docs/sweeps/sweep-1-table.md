# Sweep 20261106-1622

22 configs x 3 seeds (11, 22, 33), 40,000 ticks, 300x220.
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
| baseline | 3/3 | 5.1 (2.6-8.3) | 5.24 | 11/62/7/20 | 31% | 3.7 | 3.3 | 1.7 | 0.15 | 0.00 | 1195 | 328 |  |
| extraMoverFoodCost=1 | 3/3 | 7.9 (5.6-12.5) | 5.18 | 39/41/6/13 | 21% | 4.0 | 3.3 | 0.7 | 0.17 | 0.24 | 1519 | 232 | diversity +54%, plan shift 0.24 |
| extraMoverFoodCost=2 | 3/3 | 6.0 (3.9-9.1) | 5.29 | 37/48/6/9 | 17% | 2.7 | 2.7 | 1.0 | 0.19 | 0.29 | 1399 | 269 | plan shift 0.29 |
| extraMoverFoodCost=4 | 3/3 | 4.8 (3.0-8.1) | 4.28 | 56/23/9/12 | 15% | 2.0 | 2.0 | 0.7 | 0.12 | 0.28 | 1350 | 287 | plan shift 0.28 |
| extraMoverFoodCost=8 | 3/3 | 2.8 (1.6-4.5) | 3.97 | 76/9/5/10 | 6% | 1.3 | 1.3 | 0.0 | 0.07 | 0.51 | 1925 | 226 | diversity -45%, bodies -24%, plan shift 0.51 |
| lifespanMultiplier=25 | 0/3 | 0.0 (0.0-0.0) | 3.02 | 0/0/0/0 | 0% | 0.0 | 0.0 | 0.0 | 0.03 | 0.73 | 0 | 150047 | 3 died, diversity -100%, bodies -42%, plan shift 0.73 |
| lifespanMultiplier=50 | 2/3 | 3.1 (0.0-5.0) | 4.97 | 10/28/8/21 | 31% | 2.7 | 2.7 | 1.3 | 0.22 | 0.36 | 382 | 1613 | 1 died, diversity -40%, plan shift 0.36, worlds disagree more |
| lifespanMultiplier=200 | 3/3 | 6.3 (3.0-11.5) | 3.15 | 33/35/20/12 | 13% | 3.3 | 2.0 | 1.7 | 0.19 | 0.31 | 2879 | 166 | bodies -40%, plan shift 0.31 |
| moversCanProduce=true | 3/3 | 4.5 (1.9-7.4) | 5.88 | 4/30/12/54 | 55% | 4.7 | 4.3 | 1.3 | 0.37 | 0.30 | 1056 | 229 | plan shift 0.30, worlds disagree more |
| foodProdProb=2 | 0/3 | 0.0 (0.0-0.0) | 3.00 | 0/0/0/0 | 0% | 1.0 | 1.0 | 0.0 | 0.02 | 0.72 | 0 | 266643 | 3 died, diversity -100%, bodies -43%, plan shift 0.72 |
| foodProdProb=10 | 3/3 | 10.1 (8.1-11.8) | 3.60 | 29/36/31/4 | 10% | 4.3 | 4.0 | 1.0 | 0.16 | 0.39 | 3410 | 104 | diversity +98%, bodies -31%, plan shift 0.39 |
| foodProdProb=20 | 3/3 | 5.6 (4.1-6.6) | 2.63 | 52/10/35/3 | 1% | 1.7 | 1.7 | 0.0 | 0.02 | 0.52 | 6148 | 68 | bodies -50%, plan shift 0.52 |
| foodDropProb=1 | 3/3 | 4.0 (3.5-4.4) | 4.75 | 10/54/28/8 | 22% | 4.3 | 4.0 | 1.3 | 0.18 | 0.20 | 1923 | 219 | plan shift 0.20 |
| foodDropProb=5 | 3/3 | 3.3 (2.7-4.2) | 5.61 | 1/19/9/71 | 79% | 5.0 | 4.0 | 1.3 | 0.35 | 0.55 | 479 | 471 | diversity -35%, plan shift 0.55, worlds disagree more |
| dontKillSameSpecies=true | 0/3 | 1.6 (0.0-2.7) | 4.21 | 7/19/0/41 | 1% | 2.0 | 2.0 | 1.0 | 0.18 | 0.24 | 288 | 1250 | 3 died, diversity -68%, plan shift 0.24 |
| instaKill=true | 3/3 | 4.1 (3.8-4.5) | 3.36 | 34/27/31/9 | 8% | 3.0 | 2.3 | 0.3 | 0.18 | 0.39 | 2381 | 248 | bodies -36%, plan shift 0.39 |
| foodBlocksReproduction=false | 3/3 | 3.1 (2.1-5.0) | 4.53 | 8/91/0/0 | 1% | 2.7 | 2.3 | 0.7 | 0.08 | 0.53 | 2913 | 160 | diversity -40%, plan shift 0.53 |
| mutationRates=10 | 3/3 | 7.3 (7.3-7.4) | 4.11 | 24/43/13/21 | 21% | 4.0 | 3.3 | 0.7 | 0.11 | 0.18 | 1385 | 297 | diversity +43%, bodies -21%, plan shift 0.18 |
| mutationRates=50 | 3/3 | 6.9 (6.8-7.0) | 4.61 | 19/60/14/8 | 23% | 3.7 | 3.3 | 0.7 | 0.13 | 0.16 | 1422 | 369 | diversity +35%, plan shift 0.16 |
| mutationSymmetryChance=0 | 2/3 | 6.2 (2.4-9.6) | 4.26 | 9/54/8/29 | 37% | 3.7 | 3.3 | 2.0 | 0.14 | 0.17 | 983 | 752 | 1 died, plan shift 0.17 |
| mutationSymmetryChance=50 | 3/3 | 7.2 (5.0-8.9) | 4.06 | 21/41/34/4 | 15% | 4.7 | 3.7 | 1.0 | 0.14 | 0.31 | 2219 | 286 | diversity +41%, bodies -22%, plan shift 0.31 |
| lookRange=10 | 3/3 | 4.1 (3.4-5.2) | 4.39 | 9/62/11/18 | 15% | 3.0 | 2.7 | 1.0 | 0.18 | 0.23 | 1374 | 707 | plan shift 0.23 |
