const EARTH_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const COUNTRIES_GEOJSON = 'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl@master/example/datasets/ne_110m_admin_0_countries.geojson';
const ECLIPSE_FILES = ['./data/eclipses.json?v=8', './data/eclipse-2026.json?v=8'];
const SUBDIVISIONS_PER_SOURCE_SEGMENT = 5;

const dms = (deg, min, hemi) => {
  const value = Number(deg) + Number(min) / 60;
  return (hemi === 'S' || hemi === 'W') ? -value : value;
};

const toLatLng = (entry) => [
  dms(entry.lat[0], entry.lat[1], entry.lat[2]),
  dms(entry.lon[0], entry.lon[1], entry.lon[2])
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function lerpLng(a, b, t) {
  const delta = ((b - a + 540) % 360) - 180;
  let value = a + delta * t;
  if (value > 180) value -= 360;
  if (value < -180) value += 360;
  return value;
}

function interpolateLatLng(a, b, t) {
  return [lerp(a[0], b[0], t), lerpLng(a[1], b[1], t)];
}

function edgeAlpha(t) {
  const fade = 0.10;
  if (t <= fade) return clamp(t / fade, 0, 1);
  if (t >= 1 - fade) return clamp((1 - t) / fade, 0, 1);
  return 1;
}

function eclipseLineColor(eclipse, index) {
  if (eclipse.lineColor) return eclipse.lineColor;
  const palette = ['#ff4d4d', '#ffb347', '#7dd3fc', '#c084fc', '#4ade80'];
  return palette[index % palette.length];
}

function buildEclipseGeometry(eclipse, eclipseIndex) {
  const rows = eclipse.path.filter(r => r.north && r.south && r.center);
  const north = rows.map(r => toLatLng(r.north));
  const south = rows.map(r => toLatLng(r.south));
  const center = rows.map(r => toLatLng(r.center));
  const polygons = [];

  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let sub = 0; sub < SUBDIVISIONS_PER_SOURCE_SEGMENT; sub += 1) {
      const local0 = sub / SUBDIVISIONS_PER_SOURCE_SEGMENT;
      const local1 = (sub + 1) / SUBDIVISIONS_PER_SOURCE_SEGMENT;
      const progress0 = (i + local0) / (rows.length - 1);
      const progress1 = (i + local1) / (rows.length - 1);
      const progressMid = (progress0 + progress1) / 2;
      const alpha = edgeAlpha(progressMid);

      const n0 = interpolateLatLng(north[i], north[i + 1], local0);
      const n1 = interpolateLatLng(north[i], north[i + 1], local1);
      const s0 = interpolateLatLng(south[i], south[i + 1], local0);
      const s1 = interpolateLatLng(south[i], south[i + 1], local1);

      polygons.push({
        kind: 'eclipse',
        eclipseId: eclipse.id,
        alpha,
        altitude: 0.012 + eclipseIndex * 0.0012,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [n0[1], n0[0]],
            [n1[1], n1[0]],
            [s1[1], s1[0]],
            [s0[1], s0[0]],
            [n0[1], n0[0]]
          ]]
        }
      });
    }
  }

  return {
    polygons,
    paths: [{
      id: `${eclipse.id}-centerline`,
      color: eclipseLineColor(eclipse, eclipseIndex),
      stroke: 0.62,
      points: center.map(([lat, lng]) => ({ lat, lng, alt: 0.017 + eclipseIndex * 0.0012 }))
    }]
  };
}

let bordersVisible = true;

const globe = Globe()(document.getElementById('globe'))
  .backgroundColor('#02050a')
  .globeImageUrl(EARTH_TEXTURE)
  .bumpImageUrl(BUMP_TEXTURE)
  .showAtmosphere(true)
  .atmosphereColor('#6ea9ff')
  .atmosphereAltitude(0.16)
  .polygonCapColor(d => d.kind === 'eclipse' ? `rgba(0,0,0,${0.92 * d.alpha})` : 'rgba(0,0,0,0)')
  .polygonSideColor(d => d.kind === 'eclipse' ? `rgba(0,0,0,${0.34 * d.alpha})` : 'rgba(0,0,0,0)')
  .polygonStrokeColor(d => {
    if (d.kind === 'eclipse') return 'rgba(0,0,0,0)';
    return bordersVisible ? 'rgba(255,255,255,0.95)' : null;
  })
  .polygonAltitude(d => d.kind === 'eclipse' ? d.altitude : 0.004)
  .polygonCapCurvatureResolution(1)
  .polygonsTransitionDuration(0)
  .pathPoints('points')
  .pathPointLat('lat')
  .pathPointLng('lng')
  .pathPointAlt('alt')
  .pathColor(d => d.color)
  .pathStroke(d => d.stroke)
  .pathResolution(0.5);

globe.controls().enableDamping = true;
globe.controls().dampingFactor = 0.08;
globe.controls().autoRotate = false;

const eclipseList = document.getElementById('eclipseList');
const selectedCount = document.getElementById('selectedCount');
const maxDuration = document.getElementById('maxDuration');
const focusBtn = document.getElementById('focusBtn');
const bordersToggle = document.getElementById('bordersToggle');
const subtitle = document.querySelector('.subtitle');
const layerStatus = document.getElementById('layerStatus');

let eclipses = [];
let selectedIds = new Set();
let countryPolygons = [];
let activeEclipsePolygons = [];
let activePaths = [];
let eclipseLoaded = false;
let bordersLoaded = false;

function parseDurationSeconds(text) {
  const match = String(text).match(/(\d+)\s*min\s*([\d,.]+)\s*s/i);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2].replace(',', '.'));
}

function updateStatus() {
  if (!layerStatus) return;
  const visible = selectedIds.size;
  const eclipseText = eclipseLoaded ? `${visible}/${eclipses.length} éclipses` : 'éclipses …';
  const borderText = bordersLoaded ? 'frontières ✓' : 'frontières …';
  layerStatus.textContent = `${eclipseText} · ${borderText} · build 8`;
}

function refreshPolygons() {
  globe.polygonsData([...countryPolygons, ...activeEclipsePolygons]);
}

function renderSelection({ focus = false } = {}) {
  const visibleEclipses = eclipses.filter(e => selectedIds.has(e.id));
  activeEclipsePolygons = [];
  activePaths = [];

  visibleEclipses.forEach((eclipse, index) => {
    const geometry = buildEclipseGeometry(eclipse, index);
    activeEclipsePolygons.push(...geometry.polygons);
    activePaths.push(...geometry.paths);
  });

  refreshPolygons();
  globe.pathsData(activePaths);

  selectedCount.textContent = String(visibleEclipses.length);
  const longest = visibleEclipses
    .slice()
    .sort((a, b) => parseDurationSeconds(b.stats.maxDuration) - parseDurationSeconds(a.stats.maxDuration))[0];
  maxDuration.textContent = longest ? longest.stats.maxDuration : '—';
  focusBtn.disabled = visibleEclipses.length === 0;

  if (visibleEclipses.length === 0) {
    subtitle.textContent = 'Coche une ou plusieurs éclipses pour afficher leurs bandes de totalité.';
  } else if (visibleEclipses.length === 1) {
    subtitle.textContent = `Bande de totalité du ${visibleEclipses[0].date}.`;
  } else {
    subtitle.textContent = `${visibleEclipses.length} bandes de totalité affichées simultanément.`;
  }

  eclipseLoaded = eclipses.length > 0;
  updateStatus();
  if (focus) focusOnSelection();
}

function focusOnSelection() {
  const visible = eclipses.filter(e => selectedIds.has(e.id));
  if (visible.length === 0) return;

  const lat = visible.reduce((sum, e) => sum + e.focus[0], 0) / visible.length;
  const lng = visible.reduce((sum, e) => sum + e.focus[1], 0) / visible.length;
  const altitude = visible.length === 1 ? 1.35 : Math.min(2.35, 1.75 + visible.length * 0.18);
  globe.pointOfView({ lat, lng, altitude }, 900);
}

function renderEclipseControls() {
  eclipseList.innerHTML = '';

  eclipses.forEach((eclipse, index) => {
    const row = document.createElement('label');
    row.className = 'eclipse-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = eclipse.id;
    input.checked = selectedIds.has(eclipse.id);
    input.setAttribute('aria-label', `Afficher l’éclipse du ${eclipse.date}`);

    const swatch = document.createElement('span');
    swatch.className = 'eclipse-swatch';
    swatch.style.background = eclipseLineColor(eclipse, index);

    const text = document.createElement('span');
    text.className = 'eclipse-option-text';
    text.innerHTML = `<strong>${eclipse.date}</strong><small>${eclipse.name} · ${String(eclipse.stats.maxPathWidthKm).replace('.', ',')} km · ${eclipse.stats.maxDuration}</small>`;

    row.append(input, swatch, text);
    eclipseList.appendChild(row);
  });
}

async function loadCountries() {
  try {
    const response = await fetch(COUNTRIES_GEOJSON, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    countryPolygons = geojson.features
      .filter(feature => feature.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))
      .map(feature => ({ kind: 'country', geometry: feature.geometry, properties: feature.properties }));

    bordersLoaded = true;
    refreshPolygons();
    updateStatus();
  } catch (err) {
    console.warn('Impossible de charger les frontières :', err);
    bordersToggle.checked = false;
    bordersToggle.disabled = true;
    const label = document.querySelector('label[for="bordersToggle"]');
    if (label) label.textContent = 'Frontières indisponibles';
    updateStatus();
  }
}

async function loadEclipses() {
  try {
    const results = await Promise.all(ECLIPSE_FILES.map(async url => {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response.json();
    }));

    eclipses = results
      .flatMap(data => Array.isArray(data.eclipses) ? data.eclipses : [])
      .sort((a, b) => a.id.localeCompare(b.id));

    if (eclipses.length === 0) throw new Error('Aucune éclipse disponible');

    selectedIds = new Set(eclipses.map(e => e.id));
    renderEclipseControls();
    renderSelection({ focus: true });
  } catch (err) {
    console.error('Impossible de charger les éclipses :', err);
    subtitle.textContent = 'La Terre est chargée, mais les données des éclipses n’ont pas pu être récupérées.';
    if (layerStatus) layerStatus.textContent = 'éclipses ✕ · frontières … · build 8';
  }
}

eclipseList.addEventListener('change', event => {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input) return;
  if (input.checked) selectedIds.add(input.value);
  else selectedIds.delete(input.value);
  renderSelection();
});

focusBtn.addEventListener('click', focusOnSelection);

bordersToggle.addEventListener('change', () => {
  bordersVisible = bordersToggle.checked;
  globe.polygonStrokeColor(d => {
    if (d.kind === 'eclipse') return 'rgba(0,0,0,0)';
    return bordersVisible ? 'rgba(255,255,255,0.95)' : null;
  });
  refreshPolygons();
});

function resize() {
  globe.width(window.innerWidth).height(window.innerHeight);
}

window.addEventListener('resize', resize);
resize();
updateStatus();
loadEclipses();
loadCountries();
