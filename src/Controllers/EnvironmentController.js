const CanvasController = require("./CanvasController");
const Organism = require('../Organism/Organism');
const Modes = require("./ControlModes");
const CellStates = require("../Organism/Cell/CellStates");
const Neighbors = require("../Grid/Neighbors");
const FossilRecord = require("../Stats/FossilRecord");
const WorldConfig = require("../WorldConfig");
const Perlin = require("../Utils/Perlin");

class EnvironmentController extends CanvasController{
    constructor(env, canvas) {
        super(env, canvas);
        this.mode = Modes.FoodDrop;
        this.org_to_clone = null;
        this.defineZoomControls();
        this.scale = 1;

        // The owner map is only needed while the pointer is over the board, so
        // don't make the worker ship it the rest of the time.
        if (this.env.wantOwners) {
            canvas.addEventListener('mouseenter', () => this.env.wantOwners(true));
            canvas.addEventListener('mouseleave', () => this.env.wantOwners(false));
        }
    }

    setControlPanel(panel) {
        super.setControlPanel(panel);
        // Selecting an organism is a round trip; the worker replies with its
        // serialized form and we hand that to the editor.
        this.env.on_organism = (raw) => {
            if (raw) panel.setEditorOrganismRaw(raw);
        };
    }

    defineZoomControls() {
          var scale = 1;
          var zoom_speed = 0.7;
          const el = document.querySelector('#env-canvas');
          el.onwheel = function zoom(event) {
            event.preventDefault();

            var sign = Math.sign(event.deltaY);
          
            scale *= Math.pow(zoom_speed, sign);
          
            const MAX = 32;
            const MIN = Math.pow(2, -3);
            scale = Math.min(MAX, Math.max(MIN, scale));

            var cur_top = parseInt($('#env-canvas').css('top'));
            var cur_left = parseInt($('#env-canvas').css('left'));

            var diff_x = (this.canvas.width/2  - this.mouse_x) * (scale - this.scale);
            var diff_y = (this.canvas.height/2 - this.mouse_y) * (scale - this.scale);

            $('#env-canvas').css('top', (cur_top+diff_y)+'px');
            $('#env-canvas').css('left', (cur_left+diff_x)+'px');
          
            // Apply scale transform
            el.style.transform = `scale(${scale})`;
            this.scale = scale;

          }.bind(this);
    }

    resetView() {
        $('#env-canvas').css('transform', 'scale(1)');
        $('#env-canvas').css('top', '0px');
        $('#env-canvas').css('left', '0px');
        this.scale = 1;
    }

    /*
    Iterate over grid from 0,0 to env.num_cols,env.num_rows and create random walls using perlin noise to create a more organic shape.
    */
    // The world lives in the worker now, so wall generation happens there -
    // doing it here would mean a round trip per square.
    randomizeWalls(thickness=1) {
        this.env.randomizeWalls(thickness);
    }

    updateMouseLocation(offsetX, offsetY){
        super.updateMouseLocation(offsetX, offsetY);
    }

    mouseMove() {
        this.performModeAction();
    }

    mouseDown() {
        this.start_x = this.mouse_x;
        this.start_y = this.mouse_y;
        this.performModeAction();
    }

    mouseUp() {

    }

    performModeAction() {
        if (WorldConfig.headless && this.mode != Modes.Drag)
            return;
        var mode = this.mode;
        var right_click = this.right_click;
        var left_click = this.left_click;
        if (mode != Modes.None && (right_click || left_click)) {
            var cell = this.cur_cell;
            if (cell == null){
                return;
            }
            switch(mode) {
                case Modes.FoodDrop:
                    if (left_click){
                        this.dropCellType(cell.col, cell.row, CellStates.food, false, CellStates.wall);
                    }
                    else if (right_click){
                        this.dropCellType(cell.col, cell.row, CellStates.empty, false, CellStates.wall);
                    }
                    break;
                case Modes.WallDrop:
                        if (left_click){
                            this.dropCellType(cell.col, cell.row, CellStates.wall, true);
                        }
                        else if (right_click){
                            this.dropCellType(cell.col, cell.row, CellStates.empty, false, CellStates.food);
                        }
                        break;
                case Modes.ClickKill:
                    this.killNearOrganisms();
                    break;

                case Modes.Select:
                    // Answered asynchronously: only the worker holds the real
                    // organism. See this.env.on_organism, wired in setControlPanel.
                    this.env.selectAt(cell.col, cell.row, WorldConfig.brush_size);
                    break;

                case Modes.Clone:
                    if (this.org_to_clone != null){
                        this.dropOrganism(this.org_to_clone, this.mouse_c, this.mouse_r);
                    }
                    break;
                case Modes.Drag:
                    this.dragScreen();
                    break;
            }
        }
        else if (this.middle_click) {
            //drag on middle click
            this.dragScreen();
        }
    }

    dragScreen() {
        var cur_top = parseInt($('#env-canvas').css('top'));
        var cur_left = parseInt($('#env-canvas').css('left'));
        var new_top = cur_top + ((this.mouse_y - this.start_y)*this.scale);
        var new_left = cur_left + ((this.mouse_x - this.start_x)*this.scale);
        $('#env-canvas').css('top', new_top+'px');
        $('#env-canvas').css('left', new_left+'px');
    }

    // `organism` is a live main-thread Organism from the editor. Only its
    // serialized form crosses into the worker, which rebuilds and places it.
    dropOrganism(organism, col, row) {
        if (organism == null) return false;
        this.env.dropOrganism(organism.serialize(), col, row);
        return true;
    }

    dropCellType(col, row, state, killBlocking=false, ignoreState=null) {
        this.env.dropCells(col, row, state, WorldConfig.brush_size, killBlocking, ignoreState);
    }

    killNearOrganisms() {
        this.env.killAt(this.cur_cell.col, this.cur_cell.row, WorldConfig.brush_size);
    }


}

module.exports = EnvironmentController;
