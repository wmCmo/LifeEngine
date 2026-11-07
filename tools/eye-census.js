// Who carries eyes, and do they use them? Prints one JSON line per world.
//
//   node tools/eye-census.js '{"seed":11,"ticks":30000,"params":{"swallowShare":1,"gapeRatio":1}}'
//
// Sampled every 1000 ticks over the second half of the run. An eye only does
// anything on a mover, through its brain: decisions[eye][state][seen cell] ->
// a movement. "Sensible" counts brains where seeing food means chase, or
// seeing a killer means retreat - the two reactions that obviously pay.

const { createWorld } = require('./harness');

const spec = JSON.parse(process.argv[2] || '{}');
const w = createWorld({ cols: spec.cols || 300, rows: spec.rows || 220, seed: spec.seed || 11, params: spec.params || {} });
const ticks = spec.ticks || 30000;
const EYE = w.CellStates.eye;
const CHASE = 2, RETREAT = 1;

const acc = { orgs: 0, plants: 0, plant_eye: 0, movers: 0, mover_eye: 0, reacting: 0, sensible: 0, eye_cells: 0, cells: 0 };

function brainStats(brain) {
    let reacting = false, sensible = false;
    for (const eye of brain.decisions) {
        for (const map of eye) {
            for (const seen in map) {
                const d = map[seen].decision;
                if (d !== 0) reacting = true;
                if ((seen === 'food' && d === CHASE) || (seen === 'killer' && d === RETREAT)) sensible = true;
            }
        }
    }
    return { reacting, sensible };
}

for (let t = 1; t <= ticks; t++) {
    w.env.update();
    if (t <= ticks / 2 || t % 1000 !== 0) continue;
    for (const o of w.env.organisms) {
        const a = o.anatomy;
        acc.orgs++;
        acc.cells += a.cells.length;
        let eyes = 0;
        for (const c of a.cells) if (c.state === EYE) eyes++;
        acc.eye_cells += eyes;
        if (a.is_mover) {
            acc.movers++;
            if (eyes) {
                acc.mover_eye++;
                const b = brainStats(o.brain);
                if (b.reacting) acc.reacting++;
                if (b.sensible) acc.sensible++;
            }
        } else {
            acc.plants++;
            if (eyes) acc.plant_eye++;
        }
    }
}

const pct = (a, b) => (b ? Math.round(100 * a / b) : 0);
console.log(JSON.stringify({
    params: spec.params || {}, seed: spec.seed || 11,
    organisms_with_eyes: pct(acc.plant_eye + acc.mover_eye, acc.orgs),
    movers: pct(acc.movers, acc.orgs),
    movers_with_eyes: pct(acc.mover_eye, acc.movers),
    eyed_movers_reacting: pct(acc.reacting, acc.mover_eye),
    eyed_movers_sensible: pct(acc.sensible, acc.mover_eye),
    plants_with_eyes: pct(acc.plant_eye, acc.plants),
    eyes_on_plants: pct(acc.plant_eye, acc.plant_eye + acc.mover_eye),
    eye_cells_of_all_cells: pct(acc.eye_cells, acc.cells),
}));
