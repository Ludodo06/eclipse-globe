/**
 * Importeur minimal pour les tables de trajectoire NASA/GSFC de Fred Espenak.
 * Usage futur : node scripts/import-nasa.mjs <url>
 *
 * Le script est volontairement séparé du front afin que la base puisse ensuite
 * être régénérée côté build / backend sans modifier l'application 3D.
 */

const url = process.argv[2];
if (!url) {
  console.log('Usage: node scripts/import-nasa.mjs <NASA path table URL>');
  process.exit(0);
}

const response = await fetch(url);
if (!response.ok) throw new Error(`NASA HTTP ${response.status}`);
const html = await response.text();

const text = html
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

const rowRe = /(\d{2}:\d{2})\s+(\d{1,2})\s+(\d{2}\.\d)([NS])\s+(\d{3})\s+(\d{2}\.\d)([EW])\s+(\d{1,2})\s+(\d{2}\.\d)([NS])\s+(\d{3})\s+(\d{2}\.\d)([EW])\s+(\d{1,2})\s+(\d{2}\.\d)([NS])\s+(\d{3})\s+(\d{2}\.\d)([EW])/g;
const rows = [];
for (const m of text.matchAll(rowRe)) {
  rows.push({
    time: m[1],
    north: { lat: [m[2], m[3], m[4]], lon: [m[5], m[6], m[7]] },
    south: { lat: [m[8], m[9], m[10]], lon: [m[11], m[12], m[13]] },
    center: { lat: [m[14], m[15], m[16]], lon: [m[17], m[18], m[19]] }
  });
}

console.log(JSON.stringify({ source: url, path: rows }, null, 2));
