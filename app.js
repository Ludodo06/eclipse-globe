const EARTH_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const COUNTRIES_GEOJSON = 'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl@master/example/datasets/ne_110m_admin_0_countries.geojson';
const ECLIPSE_FILES = ['./data/eclipses.json?v=9', './data/eclipse-2026.json?v=9'];
const FADE_FRACTION = 0.10;
const FADE_STEPS = 6;

const dms = (deg, min, hemi) => {
  const value = Number(deg) + Number(min) / 60;
  return (hemi === 'S' || hemi === 'W') ? -value : value;
};

const toLatLng = entry => [
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

function pointAtProgress(points, progress) {
  if (points.length === 1) return points[0];
  const scaled = clamp(progress, 0, 1) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  return interpolateLatLng(points[index], points[index + 1], scaled - index);
}

function sliceEdge(points, start, end) {
  const result = [pointAtProgress(points, start)];
  for (let i = 1; i < points.length - 1; i += 1) {
    const progress = i / (points.length - 1);
    if (progress > start && progress < end) result.push(points[i]);
  }
  result.push(pointAtProgress(points, end));
  return result;
}

function eclipseLineColor(eclipse, index) {
  if (eclipse.lineColor) return eclipse.lineColor;
  const palette = ['#ff4d4d', '#ffb347', '#7dd3fc', '#c084fc', '#4ade80'];
  return palette[index % palette.length];
}

function makeBandPolygon(eclipse, eclipseIndex, north, south, start, end, alpha, part) {
  const northSlice = sliceEdge(north, start, end);
  const southSlice = sliceEdge(south, start, end).reverse();
  const ring = [
    ...northSlice.map(([lat, lng]) => [lng, lat]),
    ...southSlice.map(([lat, lng]) => [lng, lat])
  ];
  ring.push([...ring[0]]);

  return {
    kind: 'eclipse',
    eclipseId: eclipse.id,
    part,
    alpha,
    altitude: 0.0045 + eclipseIndex * 0.0006,
    geometry: { type: 'Polygon', coordinates: [ring] }
  };
}

function buildEclipseGeometry(eclipse, eclipseIndex) {
  const rows = eclipse.path.filter(row => row.north && row.south && row.center);
  const north = rows.map(row => toLatLng(row.north));
  const south = rows.map(row => toLatLng(row.south));
  const center = rows.map(row => toLatLng(row.center));
  const polygons = [];

  // One continuous mesh for the opaque 80% of the path.
  polygons.push(makeBandPolygon(
    eclipse,
    eclipseIndex,
    north,
    south,
    FADE_FRACTION,
    1 - FADE_FRACTION,
    1,
    'core'
  ));

  // Only the first and last 10% are split into a few non-overlapping pieces.
  // This approximates the requested alpha gradient without hundreds of tiny meshes.
  for (let step = 0; step < FADE_STEPS; step += 1) {
    const t0 = step / FADE_STEPS;
    const t1 = (step + 1) / FADE_STEPS;
    const alphaIn = (step + 0.5) / FADE_STEPS;
    const alphaOut = 1 - alphaIn;

    polygons.push(makeBandPolygon(
      eclipse,
      eclipseIndex,
      north,
      south,
      FADE_FRACTION * t0,
      FADE_FRACTION * t1,
      alphaIn,
      'fade-in'
    ));

    polygons.push(makeBandPolygon(
      eclipse,
      eclipseIndex,
      north,
      south,
      1 - FADE_FRACTION + FADE_FRACTION * t0,
      1 - FADE_FRACTION + FADE_FRACTION * t1,
      alphaOut,
      'fade-out'
    ));
  }

  return {
    polygons,
    paths: [{
      kind: 'centerline',
      id: `${eclipse.id}-centerline`,
      color: eclipseLineColor(eclipse, eclipseIndex),
      stroke: 0.52,
      points: center.map(([lat, lng]) => ({ lat, lng, alt: 0.009 + eclipseIndex * 0.0006 }))
    }]
  };
}

function geometryToBorderPaths(geometry, featureIndex) {
  if (!geometry) return [];
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];

  const paths = [];
  polygons.forEach((polygon, polygonIndex) => {
    polygon.forEach((ring, ringIndex) => {
      if (!Array.isArray(ring) || ring.length < 2) return;
      paths.push({
        kind: 'border',
        id: `border-${featureIndex}-${polygonIndex}-${ringIndex}`,
        color: 'rgba(255,255,255,0.82)',
        stroke: 0.14,
        points: ring.map(([lng, lat]) => ({ lat, lng, alt: 0.006 }))
      });
    });
  });
  return paths;
}

let bordersVisible = true;

const globe = Globe()(document.getElementById('globe'))
  .backgroundColor('#02050a')
  .globeImageUrl(EARTH_TEXTURE)
  .bumpImageUrl(BUMP_TEXTURE)
  .showAtmosphere(true)
  .atmosphereColor('#6ea9ff')
  .atmosphereAltitude(0.16)
  .polygonCapColor(d => d.kind === 'eclipse' ? `rgba(0,0,0,${d.alpha})` : 'rgba(0,0,0,0)')
  .polygonSideColor(() => 'rgba(0,0,0,0)')
  .polygonStrokeColor(() => null)
  .polygonAltitude(d => d.altitude || 0.004)
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
let borderPaths = [];
let activeEclipsePolygons = [];
let activeEclipsePaths = [];
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
  const borderText = bordersLoaded ? (bordersVisible ? 'frontières ✓' : 'frontières masquées') : 'frontières …';
  layerStatus.textContent = `${eclipseText} · ${borderText} · build 9`;
}

function refreshPolygons() {
  // The polygon layer is now reserved exclusively for eclipse bands.
  globe.polygonsData(activeEclipsePolygons);
}

function refreshPaths() {
  const visibleBorders = bordersVisible ? borderPaths : [];
  globe.pathsData([...visibleBorders, ...activeEclipsePaths]);
}

function renderSelection({ focus = false } = {}) {
  const visibleEclipses = eclipses.filter(eclipse => selectedIds.has(eclipse.id));
  activeEclipsePolygons = [];
  activeEclipsePaths = [];

  visibleEclipses.forEach((eclipse, index) => {
    const geometry = buildEclipseGeometry(eclipse, index);
    activeEclipsePolygons.push(...geometry.polygons);
    activeEclipsePaths.push(...geometry.paths);
  });

  refreshPolygons();
  refreshPaths();

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
  const visible = eclipses.filter(eclipse => selectedIds.has(eclipse.id));
  if (visible.length === 0) return;

  const lat = visible.reduce((sum, eclipse) => sum + eclipse.focus[0], 0) / visible.length;
  const lng = visible.reduce((sum, eclipse) => sum + eclipse.focus[1], 0) / visible.length;
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

    borderPaths = geojson.features.flatMap((feature, featureIndex) =>
      geometryToBorderPaths(feature.geometry, featureIndex)
    );

    bordersLoaded = true;
    refreshPaths();
    updateStatus();
  } catch (err) {
    console.warn('Impossible de charger les frontières :', err);
    bordersToggle.checked = false;
    bordersToggle.disabled = true;
    bordersVisible = false;
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

    // Keep the original 2027 demo as the default view. The 2026 eclipse can
    // be enabled independently or shown simultaneously with 2027.
    const defaultId = eclipses.some(eclipse => eclipse.id === '2027-08-02-total')
      ? '2027-08-02-total'
      : eclipses[0].id;
    selectedIds = new Set([defaultId]);

    renderEclipseControls();
    renderSelection({ focus: true });
  } catch (err) {
    console.error('Impossible de charger les éclipses :', err);
    subtitle.textContent = 'La Terre est chargée, mais les données des éclipses n’ont pas pu être récupérées.';
    if (layerStatus) layerStatus.textContent = 'éclipses ✕ · frontières … · build 9';
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
  refreshPaths();
  updateStatus();
});

function resize() {
  globe.width(window.innerWidth).height(window.innerHeight);
}

window.addEventListener('resize', resize);
resize();
updateStatus();
loadEclipses();
loadCountries();
