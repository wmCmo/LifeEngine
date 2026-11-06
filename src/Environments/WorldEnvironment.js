const Environment = require('./Environment');
const Renderer = require('../Rendering/Renderer');
const NullRenderer = require('../Rendering/NullRenderer');
const GridMap = require('../Grid/GridMap');
const Organism = require('../Organism/Organism');
const CellStates = require('../Organism/Cell/CellStates');
const EnvironmentController = require('../Controllers/EnvironmentController');
const Hyperparams = require('../Hyperparameters.js');
const FossilRecord = require('../Stats/FossilRecord');
const WorldConfig = require('../WorldConfig');
const SerializeHelper = require('../Utils/SerializeHelper');
const Species = require('../Stats/Species');

class WorldEnvironment extends Environment{
    // opts.headless: run with no canvas and no input controller, for a Web
    // Worker or a Node benchmark. opts.cols / opts.rows size the grid in that
    // case, since there is no canvas to measure.
    constructor(engine, cell_size, opts = {}) {
        super();
        this.engine = engine;
        this.headless = !!opts.headless;
        if (this.headless) {
            this.num_cols = opts.cols || 100;
            this.num_rows = opts.rows || 100;
            this.renderer = new NullRenderer(cell_size, this.num_cols, this.num_rows);
            this.controller = null;
        }
        else {
            this.renderer = new Renderer('env-canvas', 'env', cell_size);
            this.controller = new EnvironmentController(this, this.renderer.canvas);
            this.num_rows = Math.ceil(this.renderer.height / cell_size);
            this.num_cols = Math.ceil(this.renderer.width / cell_size);
        }
        this.grid_map = new GridMap(this.num_cols, this.num_rows, cell_size);
        this.organisms = [];
        this.walls = [];
        this.total_mutability = 0;
        this.largest_cell_count = 0;
        this.reset_count = 0;
        this.total_ticks = 0;
        this.data_update_rate = 100;
        FossilRecord.setEnv(this);
    }

    update() {
        // Indexed loop, not `for...in`: for...in enumerates string keys and
        // blocks V8's fast paths, and this is the outermost loop of the whole
        // simulation. Newborns are appended during the loop and, as before,
        // first update on the next tick.
        const orgs = this.organisms;
        // Snapshot the length: organisms born this tick are appended and first
        // update on the NEXT tick, which is what the old `for...in` did.
        const n = orgs.length;
        const dead = this._dead_idx || (this._dead_idx = []);
        dead.length = 0;
        for (let i = 0; i < n; i++) {
            const org = orgs[i];
            if (!org.living || !org.update()) {
                dead.push(i);
            }
        }
        if (dead.length > 0) {
            this.removeAtSortedIndices(dead);
        }
        if (Hyperparams.foodDropProb > 0) {
            this.generateFood();
        }
        this.total_ticks ++;
        if (this.total_ticks % this.data_update_rate == 0) {
            FossilRecord.updateData();
        }
    }

    render() {
        if (WorldConfig.headless) {
            this.renderer.cells_to_render.clear();
            return;
        }
        this.renderer.renderCells();
        this.renderer.renderHighlights();
    }

    renderFull() {
        this.renderer.renderFullGrid(this.grid_map.grid);
    }

    // Remove the organisms at the given ascending indices in one pass. The old
    // version spliced one index at a time, which shifts the whole tail per
    // removal - O(deaths * population). At 14k organisms with a normal death
    // rate that was millions of element moves every tick.
    //
    // It removes exactly the indices it is given, not "everything not living":
    // an organism killed by a later organism in the same tick stays in the
    // list until the next tick, which is the behaviour this replaces.
    removeAtSortedIndices(idx) {
        const orgs = this.organisms;
        const start_pop = orgs.length;
        let write = idx[0];
        let k = 0;
        for (let i = idx[0]; i < orgs.length; i++) {
            if (k < idx.length && i === idx[k]) {
                this.total_mutability -= orgs[i].mutability;
                k++;
                continue;
            }
            orgs[write++] = orgs[i];
        }
        orgs.length = write;
        this.afterRemoval(start_pop);
    }

    removeOrganisms(org_indeces) {
        let start_pop = this.organisms.length;
        for (var i of org_indeces.reverse()){
            this.total_mutability -= this.organisms[i].mutability;
            this.organisms.splice(i, 1);
        }
        this.afterRemoval(start_pop);
    }

    afterRemoval(start_pop) {
        if (this.organisms.length === 0 && start_pop > 0) {
            if (this.headless) {
                // no UI to drive; let whoever owns the loop decide
                if (this.onExtinction) this.onExtinction();
                else if (WorldConfig.auto_reset) { this.reset_count++; this.reset(false); }
                return;
            }
            if (WorldConfig.auto_pause)
                $('.pause-button')[0].click();
            else if(WorldConfig.auto_reset) {
                this.reset_count++;
                this.reset(false);
            }
        }
    }

    OriginOfLife() {
        var center = this.grid_map.getCenter();
        var org = new Organism(center[0], center[1], this);
        org.anatomy.addDefaultCell(CellStates.mouth, 0, 0);
        org.anatomy.addDefaultCell(CellStates.producer, 1, 1);
        org.anatomy.addDefaultCell(CellStates.producer, -1, -1);
        this.addOrganism(org);
        FossilRecord.addSpecies(org, null);
    }

    addOrganism(organism) {
        // Stable per-world id so the owner map can name an organism across the
        // worker boundary. Not serialized; ids only need to be valid for the
        // lifetime of this world.
        if (!organism.id) {
            this.next_org_id = (this.next_org_id || 0) + 1;
            organism.id = this.next_org_id;
        }
        organism.updateGrid();
        this.total_mutability += organism.mutability;
        this.organisms.push(organism);
        if (organism.anatomy.cells.length > this.largest_cell_count) 
            this.largest_cell_count = organism.anatomy.cells.length;
    }

    canAddOrganism() {
        return this.organisms.length < Hyperparams.maxOrganisms || Hyperparams.maxOrganisms < 0;
    }

    averageMutability() {
        if (this.organisms.length < 1)
            return 0;
        if (Hyperparams.useGlobalMutability) {
            return Hyperparams.globalMutability;
        }
        return this.total_mutability / this.organisms.length;
    }

    changeCell(c, r, state, owner) {
        super.changeCell(c, r, state, owner);
        // cellAt returns null off-grid - an organism straddling the edge can
        // ask to change a square that does not exist. setCellType already
        // ignores those, but queueing the null for rendering crashes the
        // renderer later, far from the cause.
        const cell = this.grid_map.cellAt(c, r);
        if (cell == null)
            return;
        this.renderer.addToRender(cell);
        if(state == CellStates.wall)
            this.walls.push(cell);
    }

    clearWalls() {
        for(var wall of this.walls){
            let wcell = this.grid_map.cellAt(wall.col, wall.row);
            if (wcell && wcell.state == CellStates.wall)
                this.changeCell(wall.col, wall.row, CellStates.empty, null);
        }
    }

    clearOrganisms() {
        for (var org of this.organisms)
            org.die();
        this.organisms = [];
    }
    
    clearDeadOrganisms() {
        let to_remove = [];
        for (let i in this.organisms) {
            let org = this.organisms[i];
            if (!org.living)
                to_remove.push(i);
        }
        this.removeOrganisms(to_remove);
    }

    generateFood() {
        var num_food = Math.max(Math.floor(this.grid_map.cols*this.grid_map.rows*Hyperparams.foodDropProb/50000), 1)
        var prob = Hyperparams.foodDropProb;
        for (var i=0; i<num_food; i++) {
            if (Math.random() <= prob){
                var c=Math.floor(Math.random() * this.grid_map.cols);
                var r=Math.floor(Math.random() * this.grid_map.rows);

                if (this.grid_map.cellAt(c, r).state == CellStates.empty){
                    this.changeCell(c, r, CellStates.food, null);
                }
            }
        }
    }

    reset(confirm_reset=true, reset_life=true) {
        if (confirm_reset && !confirm('The current environment will be lost. Proceed?'))
            return false;
        let restart = false;
        if (this.engine.running) {
            this.engine.last_fps = this.engine.fps;
            this.engine.stop();
            restart = true;
        }
        this.organisms = [];
        this.grid_map.fillGrid(CellStates.empty, !WorldConfig.clear_walls_on_reset);
        this.renderer.renderFullGrid(this.grid_map.grid);
        this.total_mutability = 0;
        this.total_ticks = 0;
        this.largest_cell_count = 0;
        FossilRecord.clear_record();
        if (reset_life)
            this.OriginOfLife();
        if (restart)
            this.engine.start(this.engine.last_fps);
        return true;
    }

    resizeGridColRow(cell_size, cols, rows) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillShape(rows*cell_size, cols*cell_size);
        this.grid_map.resize(cols, rows, cell_size);
    }

    resizeFillWindow(cell_size) {
        this.renderer.cell_size = cell_size;
        this.renderer.fillWindow('env');
        this.num_cols = Math.ceil(this.renderer.width / cell_size);
        this.num_rows = Math.ceil(this.renderer.height / cell_size);
        this.grid_map.resize(this.num_cols, this.num_rows, cell_size);
    }

    serialize() {
        this.clearDeadOrganisms();
        let env = SerializeHelper.copyNonObjects(this);
        env.grid = this.grid_map.serialize();
        env.organisms = [];
        for (let org of this.organisms){
            env.organisms.push(org.serialize());
        }
        env.fossil_record = FossilRecord.serialize();
        env.controls = Hyperparams;
        return env;
    }

    loadRaw(env) { // species name->stats map, evolution controls, 
        this.organisms = [];
        FossilRecord.clear_record();
        let cell_size = env.grid.cell_size ? env.grid.cell_size : this.grid_map.cell_size;
        this.resizeGridColRow(cell_size, env.grid.cols, env.grid.rows)
        this.grid_map.loadRaw(env.grid);
        for (let wall of env.grid.walls) {
            this.walls.push(this.grid_map.cellAt(wall.c, wall.r));
        }

        // create species map
        let species = {};
        for (let name in env.fossil_record.species) {
            let s = new Species(null, null, 0);
            SerializeHelper.overwriteNonObjects(env.fossil_record.species[name], s)
            species[name] = s; // the species needs an anatomy obj still
        }

        for (let orgRaw of env.organisms) {
            let org = new Organism(orgRaw.col, orgRaw.row, this);
            org.loadRaw(orgRaw);
            this.addOrganism(org);
            let s = species[orgRaw.species_name];
            if (!s){ // ideally, every organisms species should exists, but there is a bug that misses some species sometimes
                s = new Species(org.anatomy, null, env.total_ticks);
                species[orgRaw.species_name] = s;
            }
            if (!s.anatomy) {
                //if the species doesn't have anatomy we need to initialize it
                s.anatomy = org.anatomy;
                s.calcAnatomyDetails();
            }
            s.name = orgRaw.species_name;
            org.species = s;
        }
        for (let name in species)
            FossilRecord.addSpeciesObj(species[name]);
        FossilRecord.loadRaw(env.fossil_record);
        SerializeHelper.overwriteNonObjects(env, this);
        // In the worker there is no checkbox to read; the main thread decides
        // and sends the controls separately.
        if (!this.headless && $('#override-controls').is(':checked'))
            Hyperparams.loadJsonObj(env.controls)
        this.renderer.renderFullGrid(this.grid_map.grid);
    }
}

module.exports = WorldEnvironment;

