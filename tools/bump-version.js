// Stamps index.html's links to the game's own .js/.css files with ?v=<timestamp>,
// so phones and browsers fetch the new files after an update instead of a cached copy.
// Usage: node tools/bump-version.js
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'index.html');
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const html = fs.readFileSync(file, 'utf8');
const out = html.replace(/((?:src|href)=")((?:js|assets|vendor)\/[^"?]+\.js|style\.css)(?:\?v=\w+)?"/g,
  (m, a, p) => `${a}${p}?v=${v}"`);
fs.writeFileSync(file, out);
console.log(`index.html links stamped ?v=${v} (${(out.match(/\?v=/g) || []).length} files)`);
