import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/+esm';

const EARTH_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const COUNTRIES_GEOJSON = 'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl@master/example/datasets/ne_110m_admin_0_countries.geojson';
const ECLIPSE_FILES = ['./data/eclipses.json?v=10', './data/eclipse-2026.json?v=10'];
const FADE_FRACTION = 0.10;
const RIBBON_OPACITY = 0.72;
const RIBBON_STEP_DEGREES = 1.8;

const ECLIPSE_COLORS = {
  '2026-08-12-total': { band: '#9b6cff', line: '#e3d8ff' },
  '2027-08-02-total': { band: '#ff8a3d', line: '#ffe0c7' }
};
const FALLBACK_COLORS = [
  { band: '#2dd4bf', line: '#ccfbf1' },
  { band: '#f472b6', line: '#fce7f3' },
  { band: '#60a5fa', line: '#dbeafe' },
  { band: '#facc15', line: '#fef9c3' }
];

const dms = (deg, min, hemi) => {
  const value = Number(deg) + Number(min) / 60;
  return (hemi === 'S' || hemi === 'W') ? -value : value;
};

const toLatLng = entry => [
  dms(entry.lat[0], entry.lat[1], entry.lat[2]),
  dms(entry.lon[0], entry.lon[1], entry.lon[2])
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function eclipseColors(eclipse, index) {
  return ECLIPSE_COLORS[eclipse.id] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function latLngToUnit([lat, lng]) {
  const phi = lat * Math.PI / 180;
  const theta = lng * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  return new THREE.Vector3(
    cosPhi * Math.cos(theta),
    Math.sin(phi),
    cosPhi * Math.sin(theta)
  );
}

function unitToLatLng(vector) {
  const v = vector.clone().normalize();
  const lat = Math.asin(clamp(v.y, -1, 1)) * 180 / Math.PI;
  const lng = Math.atan2(v.z, v.x) * 180 / Math.PI;
  return [lat, lng];
}

function angularDistanceDeg(a, b) {
  const va = latLngToUnit(a);
  const vb = latLngToUnit(b);
  return Math.acos(clamp(va.dot(vb), -1, 1)) * 180 / Math.PI;
}

function slerpLatLng(a, b, t) {
  const va = latLngToUnit(a);
  const vb = latLngToUnit(b);
  const dot = clamp(va.dot(vb), -1, 1);

  if (dot > 0.999999) {
    return unitToLatLng(va.lerp(vb, t));
  }

  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);
  if (Math.abs(sinOmega) < 1e-7) {
    return unitToLatLng(va.lerp(vb, t));
  }

  const result = va.multiplyScalar(Math.sin((1 - t) * omega) / sinOmega)
    .add(vb.multiplyScalar(Math.sin(t * omega) / sinOmega));
  return unitToLatLng(result);
}

function midpointLatLng(a, b) {
  const sum = latLngToUnit(a).add(latLngToUnit(b));
  if (sum.lengthSq() < 1e-10) return a;
  return unitToLatLng(sum);
}

function edgeAlpha(progress) {
  if (progress <= FADE_FRACTION) return clamp(progress / FADE_FRACTION, 0, 1);
  if (progress >= 1 - FADE_FRACTION) return clamp((1 - progress) / FADE_FRACTION, 0, 1);
  return 1;
}

function buildRibbonSamples(eclipse) {
  const rows = eclipse.path.filter(row => row.north && row.south && row.center);
  const north = rows.map(row => toLatLng(row.north));
  const south = rows.map(row => toLatLng(row.south));
  const samples = [];

  for (let i = 0; i < rows.length - 1; i += 1) {
    const maxAngle = Math.max(
      angularDistanceDeg(north[i], north[i + 1]),
      angularDistanceDeg(south[i], south[i + 1])
    );
    const steps = Math.max(1, Math.ceil(maxAngle / RIBBON_STEP_DEGREES));

    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      samples.push({
        north: slerpLatLng(north[i], north[i + 1], t),
        south: slerpLatLng(south[i], south[i + 1], t)
      });
    }
  }

  samples.push({
    north: north[north.length - 1],
    south: south[south.length - 1]
  });

  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const previous = midpointLatLng(samples[i - 1].north, samples[i - 1].south);
    const current = midpointLatLng(samples[i].north, samples[i].south);
    total += angularDistanceDeg(previous, current);
    cumulative.push(total);
  }

  samples.forEach((sample, index) => {
    sample.progress = total > 0 ? cumulative[index] / total : index / Math.max(1, samples.length - 1);
  });

  return samples;
}

function makeRibbonMesh(eclipse, eclipseIndex) {
  const colors = eclipseColors(eclipse, eclipseIndex);
  const samples = buildRibbonSamples(eclipse);
  const altitude = 0.006 + eclipseIndex * 0.0009;
  const positions = [];
  const alphas = [];
  const indices = [];

  samples.forEach(sample => {
    const north = globe.getCoords(sample.north[0], sample.north[1], altitude);
    const south = globe.getCoords(sample.south[0], sample.south[1], altitude);
    positions.push(north.x, north.y, north.z, south.x, south.y, south.z);
    const alpha = edgeAlpha(sample.progress);
    alphas.push(alpha, alpha);
  });

  for (let i = 0; i < samples.length - 1; i += 1) {
    const n0 = i * 2;
    const s0 = n0 + 1;
    const n1 = n0 + 2;
    const s1 = n0 + 3;
    indices.push(n0, n1, s0, n1, s1, s0);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(alphas, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colors.band) },
      uOpacity: { value: RIBBON_OPACITY }
    },
    vertexShader: `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float alpha = uOpacity * vAlpha;
        if (alpha < 0.006) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2 + eclipseIndex;
  mesh.name = `${eclipse.id}-ribbon`;

  return {
    id: eclipse.id,
    name: `${eclipse.date} — ${eclipse.name}`,
    mesh
  };
}

function centerLinePath(eclipse, eclipseIndex) {
  const colors = eclipseColors(eclipse, eclipseIndex);
  const revision = lineAnimationRevision.get(eclipse.id) || 0;
  return {
    kind: 'centerline',
    id: `${eclipse.id}-centerline-${revision}`,
    color: colors.line,
    stroke: 0.58,
    points: eclipse.path
      .filter(row => row.center)
      .map(row => {
        const [lat, lng] = toLatLng(row.center);
        return { lat, lng, alt: 0.011 + eclipseIndex * 0.0009 };
      })
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
        color: 'rgba(255,255,255,0.84)',
        stroke: 0.13,
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
  .customThreeObject(item => item.mesh)
  .pathPoints('points')
  .pathPointLat('lat')
  .pathPointLng('lng')
  .pathPointAlt('alt')
  .pathColor(path => path.color)
  .pathStroke(path => path.stroke)
  .pathResolution(0.5)
  .pathTransitionDuration(1250);

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
let activeRibbonItems = [];
let activeEclipsePaths = [];
let eclipseLoaded = false;
let bordersLoaded = false;
const lineAnimationRevision = new Map();

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
  layerStatus.textContent = `${eclipseText} · ${borderText} · build 10`;
}

function disposeRibbonItems(items) {
  items.forEach(item => {
    if (!item.mesh) return;
    item.mesh.geometry?.dispose?.();
    item.mesh.material?.dispose?.();
  });
}

function refreshPaths() {
  const visibleBorders = bordersVisible ? borderPaths : [];
  globe.pathsData([...visibleBorders, ...activeEclipsePaths]);
}

function renderSelection({ focus = false } = {}) {
  const visibleEclipses = eclipses.filter(eclipse => selectedIds.has(eclipse.id));
  const previousRibbonItems = activeRibbonItems;
  activeRibbonItems = [];
  activeEclipsePaths = [];

  visibleEclipses.forEach((eclipse, index) => {
    activeRibbonItems.push(makeRibbonMesh(eclipse, index));
    activeEclipsePaths.push(centerLinePath(eclipse, index));
  });

  globe.customLayerData(activeRibbonItems);
  refreshPaths();
  requestAnimationFrame(() => disposeRibbonItems(previousRibbonItems));

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

  if (visible.length === 1) {
    const [lat, lng] = visible[0].focus;
    globe.pointOfView({ lat, lng, altitude: 1.35 }, 900);
    return;
  }

  const unitCenter = visible.reduce((sum, eclipse) => {
    return sum.add(latLngToUnit(eclipse.focus));
  }, new THREE.Vector3());
  const [lat, lng] = unitToLatLng(unitCenter);
  globe.pointOfView({ lat, lng, altitude: 2.15 }, 900);
}

function renderEclipseControls() {
  eclipseList.innerHTML = '';

  eclipses.forEach((eclipse, index) => {
    const colors = eclipseColors(eclipse, index);
    const row = document.createElement('label');
    row.className = 'eclipse-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = eclipse.id;
    input.checked = selectedIds.has(eclipse.id);
    input.setAttribute('aria-label', `Afficher l’éclipse du ${eclipse.date}`);

    const swatch = document.createElement('span');
    swatch.className = 'eclipse-swatch';
    swatch.style.background = colors.band;
    swatch.style.boxShadow = `0 0 0 1px ${colors.line}`;

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

    const defaultId = eclipses.some(eclipse => eclipse.id === '2027-08-02-total')
      ? '2027-08-02-total'
      : eclipses[0].id;
    selectedIds = new Set([defaultId]);
    eclipses.forEach(eclipse => lineAnimationRevision.set(eclipse.id, 0));

    renderEclipseControls();
    renderSelection({ focus: true });
  } catch (err) {
    console.error('Impossible de charger les éclipses :', err);
    subtitle.textContent = 'La Terre est chargée, mais les données des éclipses n’ont pas pu être récupérées.';
    if (layerStatus) layerStatus.textContent = 'éclipses ✕ · frontières … · build 10';
  }
}

eclipseList.addEventListener('change', event => {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input) return;

  if (input.checked) {
    selectedIds.add(input.value);
    lineAnimationRevision.set(input.value, (lineAnimationRevision.get(input.value) || 0) + 1);
  } else {
    selectedIds.delete(input.value);
  }

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
