// Aggregate self-time per function from a V8 .cpuprofile.
// usage: node analyze-prof.js <file.cpuprofile> [top]
const fs = require('fs');

const file = process.argv[2];
const TOP = parseInt(process.argv[3] || '25');
const prof = JSON.parse(fs.readFileSync(file, 'utf8'));

const byId = new Map();
for (const n of prof.nodes) byId.set(n.id, n);

// self time: each sample attributes its delta to the node it was taken in
const self = new Map();
let total = 0;
for (let i = 0; i < prof.samples.length; i++) {
    const id = prof.samples[i];
    const dt = prof.timeDeltas[i] || 0;
    if (dt < 0) continue;
    total += dt;
    self.set(id, (self.get(id) || 0) + dt);
}

function label(node) {
    const f = node.callFrame;
    let name = f.functionName || '(anonymous)';
    let url = f.url || '';
    url = url.replace(/^.*[\\/]/, '');
    if (!url) url = '(native)';
    return `${name} @ ${url}:${f.lineNumber + 1}`;
}

const rows = new Map();
for (const [id, t] of self) {
    const node = byId.get(id);
    if (!node) continue;
    const key = label(node);
    rows.set(key, (rows.get(key) || 0) + t);
}

const sorted = [...rows.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP);

console.log(`total sampled: ${(total / 1e6).toFixed(2)}s\n`);
console.log('  self%     self(s)   function');
console.log('  -----     -------   --------');
for (const [name, t] of sorted) {
    const pct = (t / total * 100);
    console.log(`  ${pct.toFixed(2).padStart(6)}%  ${(t / 1e6).toFixed(2).padStart(8)}   ${name}`);
}
