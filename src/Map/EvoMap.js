// The evolution map: a time-scaled, ever-growing phylogeny on an infinite
// canvas.
//
//   x = time (ticks). The map grows to the right as the simulation runs.
//   y = lanes. Each visible species owns one lane for its whole life.
//
// Lanes are allocated the way `git log --graph` allocates columns: a species
// gets a lane when it first becomes visible, near its parent's lane, and
// keeps it forever; a lane is reused only once its previous occupant has been
// dead for a while. Nothing already drawn ever moves when new branches
// appear, which is what breaks most growing-tree layouts.
//
// What's visible: every species that ruled an era, today's top species, and
// the full ancestry of each back to the origin. Everything else is folded
// behind a +N badge on its parent; click to expand. Line thickness is
// population at that moment.

const GUILD_COLOR = {
    plant: '#3FE07A',
    armed_plant: '#F2B84B',
    grazer: '#5CC8FF',
    predator: '#FF4F8B',
    unknown: '#8899AA',
};
const GUILD_LABEL = {
    plant: 'plant', armed_plant: 'armed plant', grazer: 'grazer', predator: 'predator', unknown: '?',
};
// CellStates order: empty, food, wall, mouth, producer, mover, killer, armor, eye
const CELL_COLOR = ['#0E1318', '#2F7AB7', '#FFFFFF', '#DEB14D', '#15DE59', '#60D4FF', '#F82380', '#7230DB', '#B6C1EA'];
const PLAN_SHORT = { mouth: 'm', producer: 'p', mover: 'v', killer: 'k', armor: 'a', eye: 'e' };

const LANE_GAP_TICKS = 1500;   // keep a reused lane clear of its last occupant
const AXIS_H = 26;
const LEFT_MARGIN = 290;       // px - keep the start of history clear of the panels

function planText(plan) {
    if (!plan) return '';
    return Object.keys(PLAN_SHORT).filter(k => plan[k] > 0).map(k => PLAN_SHORT[k] + plan[k]).join(' ');
}
function fmtTick(t) {
    if (t >= 1e6) return (t / 1e6).toFixed(t % 1e6 ? 1 : 0) + 'M';
    if (t >= 1e3) return (t / 1e3).toFixed(t % 1e3 ? 1 : 0) + 'k';
    return String(t);
}
function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

class EvoMap {
    constructor(canvas, tooltip) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tooltip = tooltip;

        this.cam = { x: 0, y: 0, sx: 0.03, sy: 42 };   // tick at left, lane at top, px/tick, px/lane
        this.follow = true;
        this.showAll = false;
        this.onChange = null;
        this.mouse = null;

        this.clear();
        this.bindInput();
        this.resize();
        // Tick 0 just right of the panels, lane 0 a little above centre.
        this.cam.x = -LEFT_MARGIN / this.cam.sx;
        this.cam.y = -(this.H * 0.42) / this.cam.sy;
        window.addEventListener('resize', () => this.resize());
    }

    clear() {
        this.nodes = new Map();
        this.lanes = new Map();      // lane -> [node]
        this.eras = [];
        this.events = [];
        this.top = [];
        this.now = 0;
        this.maxPop = 1;
        this.hits = [];              // clickable rects from the last frame
        this.hover = null;
        this.sprites = new Map();
        this.requestDraw();
    }

    // ---- data from the worker -----------------------------------------

    applyUpdate(u) {
        if (u.reset) this.clear();

        for (const meta of u.nodes) {
            let n = this.nodes.get(meta.name);
            if (!n) {
                n = { series: [], children: new Set(), lane: null, visible: false, expanded: false, depth: null };
                this.nodes.set(meta.name, n);
            }
            Object.assign(n, meta);
            if (n.ancestor) {
                const p = this.nodes.get(n.ancestor);
                if (p) p.children.add(n.name);
            }
            if (n.peak_pop > this.maxPop) this.maxPop = n.peak_pop;
        }
        for (const name in u.series) {
            const n = this.nodes.get(name);
            if (!n) continue;
            const last = n.series.length ? n.series[n.series.length - 1][0] : -1;
            for (const pt of u.series[name]) {
                if (pt[0] > last || n.series.length === 0) n.series.push(pt);
            }
        }
        this.eras = u.eras || this.eras;
        this.events = u.events || this.events;
        this.top = u.top || this.top;
        this.now = u.now;

        this.recomputeVisible();
        if (this.follow) this.followNow();
        this.requestDraw();
        if (this.onChange) this.onChange();
    }

    depthOf(n) {
        if (n.depth !== null) return n.depth;
        let d = 0, cur = n;
        while (cur.ancestor && this.nodes.has(cur.ancestor) && d < 100000) {
            cur = this.nodes.get(cur.ancestor);
            d++;
        }
        n.depth = d;
        return d;
    }

    recomputeVisible() {
        const want = new Set();
        const addChain = (name) => {
            let n = this.nodes.get(name);
            while (n && !want.has(n.name)) {
                want.add(n.name);
                n = n.ancestor ? this.nodes.get(n.ancestor) : null;
            }
        };
        for (const e of this.eras) addChain(e.species);
        for (const t of this.top) addChain(t);
        for (const n of this.nodes.values()) {
            if (n.expanded) for (const c of n.children) addChain(c);
        }
        if (this.showAll) for (const n of this.nodes.values()) addChain(n.name);

        // Assign lanes to newcomers, parents before children.
        const newcomers = [];
        for (const name of want) {
            const n = this.nodes.get(name);
            if (n.lane === null) newcomers.push(n);
        }
        newcomers.sort((a, b) => a.start - b.start || this.depthOf(a) - this.depthOf(b));
        for (const n of newcomers) this.reserveLane(n);

        for (const n of this.nodes.values()) n.visible = want.has(n.name);

        this.rulers = new Map();
        for (const e of this.eras) {
            if (!this.rulers.has(e.species)) this.rulers.set(e.species, []);
            this.rulers.get(e.species).push(e.index);
        }
    }

    laneFree(lane, start, end) {
        const occ = this.lanes.get(lane);
        if (!occ) return true;
        for (const o of occ) {
            const oe = o.end === null ? Infinity : o.end;
            if (start <= oe + LANE_GAP_TICKS && end + LANE_GAP_TICKS >= o.start) return false;
        }
        return true;
    }

    reserveLane(n) {
        const parent = n.ancestor ? this.nodes.get(n.ancestor) : null;
        const pref = parent && parent.lane !== null ? parent.lane : 0;
        const end = n.end === null ? Infinity : n.end;
        let lane = null;
        if (!parent && this.laneFree(0, n.start, end)) lane = 0;
        for (let k = 1; lane === null && k < 100000; k++) {
            if (this.laneFree(pref + k, n.start, end)) lane = pref + k;
            else if (this.laneFree(pref - k, n.start, end)) lane = pref - k;
        }
        n.lane = lane;
        if (!this.lanes.has(lane)) this.lanes.set(lane, []);
        this.lanes.get(lane).push(n);
    }

    toggle(n) {
        n.expanded = !n.expanded;
        this.recomputeVisible();
        this.requestDraw();
        if (this.onChange) this.onChange();
        // Refresh the tooltip so "click to show N more" doesn't go stale.
        if (this.mouse) {
            this.hover = null;
            requestAnimationFrame(() => this.updateHover(...this.mouse));
        }
    }

    setShowAll(v) {
        this.showAll = v;
        this.recomputeVisible();
        this.requestDraw();
    }

    hiddenChildren(n) {
        let h = 0;
        for (const c of n.children) {
            const cn = this.nodes.get(c);
            if (cn && !cn.visible) h++;
        }
        return h;
    }

    // ---- camera ---------------------------------------------------------

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const r = this.canvas.getBoundingClientRect();
        this.W = r.width;
        this.H = r.height;
        this.canvas.width = Math.round(r.width * dpr);
        this.canvas.height = Math.round(r.height * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.requestDraw();
    }

    X(t) { return (t - this.cam.x) * this.cam.sx; }
    Y(lane) { return (lane - this.cam.y) * this.cam.sy; }
    tickAt(px) { return px / this.cam.sx + this.cam.x; }
    laneAt(py) { return py / this.cam.sy + this.cam.y; }

    followNow() {
        const right = this.now + (this.W * 0.12) / this.cam.sx;
        this.cam.x = Math.max(-LEFT_MARGIN / this.cam.sx, right - this.W / this.cam.sx);
    }

    fit() {
        let minL = Infinity, maxL = -Infinity, any = false;
        for (const n of this.nodes.values()) {
            if (!n.visible) continue;
            any = true;
            if (n.lane < minL) minL = n.lane;
            if (n.lane > maxL) maxL = n.lane;
        }
        if (!any) return;
        // The origin is always at the far left, which is where the controls
        // panel sits - so start the tree below it, not under it.
        const TOP = 230;
        const span = Math.max(this.now, 1000);
        this.cam.sx = (this.W - LEFT_MARGIN - 40) / span;
        this.cam.sy = Math.max(8, Math.min(60, (this.H - AXIS_H - TOP - 30) / Math.max(maxL - minL + 1, 1)));
        this.cam.x = -LEFT_MARGIN / this.cam.sx;
        this.cam.y = minL - TOP / this.cam.sy;
        this.follow = false;
        this.requestDraw();
        if (this.onChange) this.onChange();
    }

    setFollow(v) {
        this.follow = v;
        if (v) this.followNow();
        this.requestDraw();
        if (this.onChange) this.onChange();
    }

    bindInput() {
        const c = this.canvas;
        let drag = null;

        c.addEventListener('mousedown', (e) => {
            drag = { x: e.clientX, y: e.clientY, cx: this.cam.x, cy: this.cam.y, moved: false };
        });
        window.addEventListener('mousemove', (e) => {
            if (drag) {
                const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
                if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
                if (drag.moved) {
                    this.cam.x = drag.cx - dx / this.cam.sx;
                    this.cam.y = drag.cy - dy / this.cam.sy;
                    if (this.follow) this.setFollow(false);
                    this.requestDraw();
                }
            }
            const r = c.getBoundingClientRect();
            this.mouse = [e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY];
            this.updateHover(...this.mouse);
        });
        window.addEventListener('mouseup', (e) => {
            if (drag && !drag.moved) {
                const r = c.getBoundingClientRect();
                this.click(e.clientX - r.left, e.clientY - r.top);
            }
            drag = null;
        });
        c.addEventListener('mouseleave', () => { this.hover = null; this.tooltip.style.display = 'none'; this.requestDraw(); });

        // Wheel zooms around the cursor, Figma-style. Shift+wheel zooms time only.
        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const r = c.getBoundingClientRect();
            const px = e.clientX - r.left, py = e.clientY - r.top;
            const t = this.tickAt(px), l = this.laneAt(py);
            const f = Math.pow(1.0015, -e.deltaY);
            this.cam.sx = Math.min(50, Math.max(1e-5, this.cam.sx * f));
            if (!e.shiftKey) this.cam.sy = Math.min(140, Math.max(5, this.cam.sy * f));
            this.cam.x = t - px / this.cam.sx;
            this.cam.y = l - py / this.cam.sy;
            if (this.follow && Math.abs(this.X(this.now) - this.W * 0.88) > 40) this.setFollow(false);
            this.requestDraw();
        }, { passive: false });
    }

    // ---- hit testing ----------------------------------------------------

    nodeAt(px, py) {
        for (let i = this.hits.length - 1; i >= 0; i--) {
            const h = this.hits[i];
            if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h;
        }
        const t = this.tickAt(px);
        const lf = this.laneAt(py);
        for (const candidateLane of [Math.round(lf), Math.floor(lf), Math.ceil(lf)]) {
            const list = this.lanes.get(candidateLane);
            if (!list) continue;
            for (const n of list) {
                if (!n.visible) continue;
                const end = n.end === null ? this.now : n.end;
                const yc = this.Y(n.lane);
                if (t >= n.start && t <= end && Math.abs(py - yc) < Math.max(8, this.cam.sy * 0.45)) {
                    return { node: n, kind: 'line' };
                }
            }
        }
        return null;
    }

    updateHover(px, py, cx, cy) {
        const h = this.nodeAt(px, py);
        const n = h ? h.node : null;
        if (n !== (this.hover && this.hover.node)) {
            this.hover = h;
            this.requestDraw();
        }
        this.canvas.style.cursor = h && h.kind === 'badge' ? 'pointer'
            : h && h.kind === 'portrait' ? 'pointer' : 'grab';
        if (!n) { this.tooltip.style.display = 'none'; return; }
        const end = n.end === null ? null : n.end;
        const life = (end === null ? this.now : end) - n.start;
        const eras = this.rulers.get(n.name);
        const hidden = this.hiddenChildren(n);
        this.tooltip.innerHTML = `
            <div class="tt-name"><i style="background:${GUILD_COLOR[n.guild]}"></i>${esc(n.name)}
                <span>${GUILD_LABEL[n.guild]}</span></div>
            <div class="tt-plan">${esc(planText(n.plan))} &middot; ${n.cells.length} cells</div>
            <table>
              <tr><td>born</td><td>${fmtTick(n.start)}</td></tr>
              <tr><td>${end === null ? 'alive for' : 'died'}</td><td>${end === null ? fmtTick(life) : fmtTick(end) + ' (lived ' + fmtTick(life) + ')'}</td></tr>
              <tr><td>peak</td><td>${n.peak_pop} at ${fmtTick(n.peak_tick)}</td></tr>
              <tr><td>ever lived</td><td>${n.cumulative.toLocaleString()}</td></tr>
              <tr><td>child species</td><td>${n.kids}${n.died_young ? ` (${n.died_young} died young)` : ''}</td></tr>
              ${eras ? `<tr><td>ruled</td><td>era ${eras.join(', ')}</td></tr>` : ''}
            </table>
            ${hidden ? `<div class="tt-hint">${n.expanded ? 'click to collapse' : `click to show ${hidden} more descendant${hidden > 1 ? 's' : ''}`}</div>` : ''}`;
        this.tooltip.style.display = 'block';
        const tw = this.tooltip.offsetWidth, th = this.tooltip.offsetHeight;
        let tx = cx + 16, ty = cy + 14;
        if (tx + tw > window.innerWidth - 8) tx = cx - tw - 16;
        if (ty + th > window.innerHeight - 8) ty = cy - th - 14;
        this.tooltip.style.left = tx + 'px';
        this.tooltip.style.top = ty + 'px';
    }

    click(px, py) {
        const h = this.nodeAt(px, py);
        if (!h) return;
        if (h.kind === 'badge' || h.kind === 'portrait' || h.kind === 'line') {
            if (this.hiddenChildren(h.node) > 0 || h.node.expanded) this.toggle(h.node);
        }
        // Picking a species (to save it or drop copies) rides along with the
        // same click, so expanding works exactly as before.
        if (this.onSelect) this.onSelect(h.node);
    }

    // ---- drawing --------------------------------------------------------

    requestDraw() {
        if (this.pending || this.canvas.hidden) return;
        this.pending = true;
        requestAnimationFrame(() => { this.pending = false; this.draw(); });
    }

    sprite(n) {
        let s = this.sprites.get(n.name);
        if (s) return s;
        let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
        for (const [c, r] of n.cells) {
            if (c < minC) minC = c; if (c > maxC) maxC = c;
            if (r < minR) minR = r; if (r > maxR) maxR = r;
        }
        const w = maxC - minC + 1, h = maxR - minR + 1, px = 6;
        const cv = document.createElement('canvas');
        cv.width = w * px; cv.height = h * px;
        const g = cv.getContext('2d');
        for (const [c, r, st] of n.cells) {
            g.fillStyle = CELL_COLOR[st] || '#888';
            g.fillRect((c - minC) * px, (r - minR) * px, px, px);
        }
        s = { canvas: cv, w, h };
        this.sprites.set(n.name, s);
        return s;
    }

    draw() {
        const g = this.ctx, W = this.W, H = this.H;
        g.clearRect(0, 0, W, H);
        g.fillStyle = '#0d1820';
        g.fillRect(0, 0, W, H);
        this.hits = [];

        const t0 = this.tickAt(0), t1 = this.tickAt(W);

        // Era bands.
        g.font = '600 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        this.eras.forEach((e, i) => {
            const x0 = this.X(e.start_tick), x1 = this.X(e.end_tick == null ? this.now : e.end_tick);
            if (x1 < 0 || x0 > W) return;
            g.fillStyle = GUILD_COLOR[e.guild] || '#888';
            g.globalAlpha = i % 2 ? 0.045 : 0.075;
            g.fillRect(x0, 0, x1 - x0, H - AXIS_H);
            g.globalAlpha = 1;
            g.strokeStyle = 'rgba(255,255,255,0.07)';
            g.beginPath(); g.moveTo(x0 + 0.5, 0); g.lineTo(x0 + 0.5, H - AXIS_H); g.stroke();
            if (x1 - x0 > 90) {
                const lx = Math.max(x0, 0) + 8;
                g.fillStyle = GUILD_COLOR[e.guild];
                g.globalAlpha = 0.85;
                g.fillText(`ERA ${e.index} · ${GUILD_LABEL[e.guild].toUpperCase()}`, lx, 16);
                g.globalAlpha = 0.5;
                g.fillStyle = '#c9d4e6';
                if (x1 - x0 > 170) g.fillText(`${e.species} · ${planText(e.plan)}`, lx, 29);
                g.globalAlpha = 1;
            }
        });

        // Extinction events.
        for (const ev of this.events) {
            const x0 = this.X(ev.start_tick), x1 = this.X(ev.trough_tick);
            if (x1 < 0 || x0 > W) continue;
            const mass = ev.type === 'mass extinction';
            g.fillStyle = mass ? 'rgba(255,60,90,0.13)' : 'rgba(255,170,60,0.07)';
            g.fillRect(x0, 0, Math.max(x1 - x0, 2), H - AXIS_H);
            g.strokeStyle = mass ? 'rgba(255,80,110,0.7)' : 'rgba(255,170,60,0.4)';
            g.setLineDash([3, 4]);
            g.beginPath(); g.moveTo(x1 + 0.5, 36); g.lineTo(x1 + 0.5, H - AXIS_H); g.stroke();
            g.setLineDash([]);
            if (x1 - x0 > 50 || mass) {
                g.fillStyle = mass ? '#ff6b88' : '#f2b84b';
                g.fillText(mass ? `MASS EXTINCTION −${Math.round(ev.lineage_loss * 100)}% lineages`
                                : `crash −${Math.round(ev.drop * 100)}% pop`, x0 + 6, 46);
            }
        }

        // Lifelines, connectors, portraits.
        const vis = [];
        for (const n of this.nodes.values()) {
            if (!n.visible || n.lane === null) continue;
            const end = n.end === null ? this.now : n.end;
            if (end < t0 || n.start > t1) {
                // still need its connector if a visible child is on screen - cheap to skip
                continue;
            }
            const y = this.Y(n.lane);
            if (y < -60 || y > H + 60) continue;
            vis.push(n);
        }
        // Connectors first, under everything.
        for (const n of this.nodes.values()) {
            if (!n.visible || !n.ancestor) continue;
            const p = this.nodes.get(n.ancestor);
            if (!p || !p.visible || p.lane === null) continue;
            const x = this.X(n.start);
            if (x < -20 || x > W + 20) continue;
            const y0 = this.Y(p.lane), y1 = this.Y(n.lane);
            if (Math.max(y0, y1) < -20 || Math.min(y0, y1) > H + 20) continue;
            g.strokeStyle = GUILD_COLOR[n.guild];
            g.globalAlpha = 0.55;
            g.lineWidth = 1.25;
            const r = Math.min(8, Math.abs(y1 - y0) / 2);
            const dir = y1 > y0 ? 1 : -1;
            g.beginPath();
            g.moveTo(x - r, y0);
            g.quadraticCurveTo(x, y0, x, y0 + dir * r);
            g.lineTo(x, y1 - dir * r);
            g.quadraticCurveTo(x, y1, x + r, y1);
            g.stroke();
            g.globalAlpha = 1;
        }

        const k = (this.cam.sy * 0.42) / Math.sqrt(this.maxPop);
        for (const n of vis) this.drawLife(n, k, t0, t1);
        for (const n of vis) this.drawHead(n);

        // Now line.
        const xn = this.X(this.now);
        if (xn > 0 && xn < W) {
            g.strokeStyle = 'rgba(255,255,255,0.35)';
            g.beginPath(); g.moveTo(xn + 0.5, 0); g.lineTo(xn + 0.5, H - AXIS_H); g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.6)';
            g.fillText('now', xn + 5, H - AXIS_H - 6);
        }

        this.drawAxis(t0, t1);
    }

    drawLife(n, k, t0, t1) {
        const g = this.ctx;
        const y = this.Y(n.lane);
        const color = GUILD_COLOR[n.guild] || '#888';
        const end = n.end === null ? this.now : n.end;
        const maxH = this.cam.sy * 0.44;
        const hl = this.hover && this.hover.node === n;

        // Thin spine across the whole life, so short-lived or sparse species
        // still read as a line.
        g.strokeStyle = color;
        g.globalAlpha = hl ? 0.9 : 0.55;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(this.X(n.start), y);
        g.lineTo(this.X(end), y);
        g.stroke();

        // Population band.
        const s = n.series;
        if (s.length > 1) {
            const pts = [];
            let lastX = -Infinity;
            for (let i = 0; i < s.length; i++) {
                const [t, pop] = s[i];
                if (t < t0 - 2000 && i < s.length - 1 && s[i + 1][0] < t0) continue;
                if (t > t1 + 2000) { pts.push([this.X(t), Math.min(maxH, Math.sqrt(pop) * k)]); break; }
                const x = this.X(t);
                if (x - lastX < 1.5 && i !== s.length - 1) continue;
                lastX = x;
                pts.push([x, Math.min(maxH, Math.max(0.6, Math.sqrt(pop) * k))]);
            }
            if (pts.length > 1) {
                g.fillStyle = color;
                g.globalAlpha = hl ? 0.95 : 0.78;
                g.beginPath();
                g.moveTo(pts[0][0], y - pts[0][1]);
                for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], y - pts[i][1]);
                for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], y + pts[i][1]);
                g.closePath();
                g.fill();
            }
        }
        g.globalAlpha = 1;

        // Extinction cap.
        if (n.end !== null) {
            const xe = this.X(n.end);
            g.strokeStyle = color;
            g.globalAlpha = 0.7;
            g.beginPath(); g.moveTo(xe, y - 4); g.lineTo(xe, y + 4); g.stroke();
            g.globalAlpha = 1;
        }
    }

    drawHead(n) {
        const g = this.ctx;
        const x = this.X(n.start), y = this.Y(n.lane);
        if (x < -80 || x > this.W + 20) return;
        const sy = this.cam.sy;
        const isRuler = this.rulers && this.rulers.has(n.name);
        const isTop = this.top.includes(n.name);
        const hidden = this.hiddenChildren(n);

        if (sy >= 14) {
            // Portrait: the founder's actual body.
            const sp = this.sprite(n);
            const cell = Math.max(2, Math.min(7, Math.floor(sy * 0.16)));
            const w = sp.w * cell, h = sp.h * cell;
            const pad = 4;
            const bx = x - w / 2 - pad, by = y - h / 2 - pad;
            g.fillStyle = '#0d1820';
            g.strokeStyle = isRuler ? GUILD_COLOR[n.guild] : 'rgba(255,255,255,0.18)';
            g.lineWidth = isRuler ? 1.5 : 1;
            roundRect(g, bx, by, w + pad * 2, h + pad * 2, 4);
            g.fill(); g.stroke();
            g.imageSmoothingEnabled = false;
            g.drawImage(sp.canvas, x - w / 2, y - h / 2, w, h);
            this.hits.push({ x: bx, y: by, w: w + pad * 2, h: h + pad * 2, node: n, kind: 'portrait' });

            // Label.
            if (sy >= 22) {
                g.font = (isRuler ? '600 ' : '') + '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
                g.fillStyle = isRuler ? '#ffffff' : 'rgba(220,230,245,0.75)';
                const lx = bx + w + pad * 2 + 6, ly = by + 9;
                let label = n.name;
                if (isRuler) label += `  ★ era ${this.rulers.get(n.name).join(',')}`;
                else if (isTop) label += '  ▲ top now';
                g.fillText(label, lx, ly);
                g.fillStyle = 'rgba(200,212,230,0.5)';
                g.fillText(planText(n.plan) + (n.died_young ? `  · ${n.died_young} died young` : ''), lx, ly + 12);
            }
        } else {
            g.fillStyle = GUILD_COLOR[n.guild];
            g.beginPath(); g.arc(x, y, isRuler ? 3 : 2, 0, Math.PI * 2); g.fill();
            this.hits.push({ x: x - 5, y: y - 5, w: 10, h: 10, node: n, kind: 'portrait' });
        }

        // Expand badge.
        if (hidden > 0 || n.expanded) {
            const text = n.expanded ? '−' : `+${hidden}`;
            g.font = '600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
            const tw = g.measureText(text).width;
            const bw = tw + 10, bh = 14;
            const bx = x - bw / 2, by = y + Math.max(10, sy * 0.3);
            g.fillStyle = n.expanded ? '#2a3a4c' : '#e9eef7';
            roundRect(g, bx, by, bw, bh, 7);
            g.fill();
            g.fillStyle = n.expanded ? '#e9eef7' : '#0d1820';
            g.fillText(text, bx + 5, by + 10);
            this.hits.push({ x: bx, y: by, w: bw, h: bh, node: n, kind: 'badge' });
        }
    }

    drawAxis(t0, t1) {
        const g = this.ctx, W = this.W, H = this.H;
        g.fillStyle = '#0a131a';
        g.fillRect(0, H - AXIS_H, W, AXIS_H);
        g.strokeStyle = 'rgba(255,255,255,0.12)';
        g.beginPath(); g.moveTo(0, H - AXIS_H + 0.5); g.lineTo(W, H - AXIS_H + 0.5); g.stroke();
        const steps = [100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6];
        let step = steps[steps.length - 1];
        for (const s of steps) { if (s * this.cam.sx >= 80) { step = s; break; } }
        g.font = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        g.fillStyle = 'rgba(200,212,230,0.55)';
        for (let t = Math.ceil(Math.max(0, t0) / step) * step; t <= t1; t += step) {
            const x = this.X(t);
            g.fillRect(x, H - AXIS_H, 1, 5);
            g.fillText(fmtTick(t), x + 3, H - 8);
        }
    }
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

module.exports = { EvoMap, GUILD_COLOR, GUILD_LABEL };
