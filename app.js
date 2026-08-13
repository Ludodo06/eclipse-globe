import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/+esm';

const BUILD = 11;
const EARTH_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const COUNTRIES_GEOJSON = 'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl@master/example/datasets/ne_110m_admin_0_countries.geojson';
const CATALOG_URL = `./data/nasa-total-eclipses.json?v=${BUILD}`;
const LOCAL_ECLIPSE_FILES = [
  ['./data/eclipse-2026.json?v=10', '20260812'],
  ['./data/eclipses.json?v=10', '20270802']
];
const NASA_PATH_ENDPOINT = 'https://eclipse.gsfc.nasa.gov/SEsearch/eclipse-path-data.js.php';
const FADE_FRACTION = 0.10;
const RIBBON_OPACITY = 0.74;
const RIBBON_STEP_DEGREES = 1.4;
const DETAILED_SELECTION_LIMIT = 12;
const CHRONO_PAGE_SIZE = 250;
const CONTINENT_ORDER = [
  'Europe', 'Afrique', 'Asie', 'Amérique du Nord',
  'Amérique du Sud', 'Océanie', 'Antarctique'
];
const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
];

const SPECIAL_COLORS = {
  '20260812': { band: '#9b6cff', line: '#e3d8ff' },
  '20270802': { band: '#ff8a3d', line: '#ffe0c7' }
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function colorForEclipse(eclipse) {
  if (SPECIAL_COLORS[eclipse.nasaId]) return SPECIAL_COLORS[eclipse.nasaId];
  const n = eclipse.catalogNumber || hashString(eclipse.id);
  const hue = (n * 137.50776405) % 360;
  const saturation = 72 + (n % 13);
  const lightness = 48 + (n % 9);
  return {
    band: `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`,
    line: `hsl(${hue.toFixed(1)} 92% 84%)`
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function dms(deg, min, hemi) {
  const value = Number(deg) + Number(min) / 60;
  return (hemi === 'S' || hemi === 'W') ? -value : value;
}

function toLatLng(entry) {
  return [
    dms(entry.lat[0], entry.lat[1], entry.lat[2]),
    dms(entry.lon[0], entry.lon[1], entry.lon[2])
  ];
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

function lineCumulative(points) {
  const cumulative = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += angularDistanceDeg(points[i - 1], points[i]);
    cumulative.push(total);
  }
  return { cumulative, total };
}

function pointAlongLine(points, info, progress) {
  if (points.length === 1) return points[0];
  if (info.total <= 1e-9) return points[Math.round(progress * (points.length - 1))];
  const target = clamp(progress, 0, 1) * info.total;
  let index = 0;
  while (index < info.cumulative.length - 2 && info.cumulative[index + 1] < target) {
    index += 1;
  }
  const start = info.cumulative[index];
  const end = info.cumulative[index + 1];
  const local = end > start ? (target - start) / (end - start) : 0;
  return slerpLatLng(points[index], points[index + 1], local);
}

function alignEdges(north, south) {
  if (north.length < 2 || south.length < 2) return { north, south };
  const same = angularDistanceDeg(north[0], south[0])
    + angularDistanceDeg(north[north.length - 1], south[south.length - 1]);
  const reversed = angularDistanceDeg(north[0], south[south.length - 1])
    + angularDistanceDeg(north[north.length - 1], south[0]);
  return reversed < same ? { north, south: south.slice().reverse() } : { north, south };
}

function resampleEdges(northInput, southInput) {
  const aligned = alignEdges(northInput, southInput);
  const northInfo = lineCumulative(aligned.north);
  const southInfo = lineCumulative(aligned.south);
  const maxLength = Math.max(northInfo.total, southInfo.total);
  const count = clamp(Math.ceil(maxLength / RIBBON_STEP_DEGREES) + 1, 18, 420);
  const north = [];
  const south = [];
  for (let i = 0; i < count; i += 1) {
    const progress = i / (count - 1);
    north.push(pointAlongLine(aligned.north, northInfo, progress));
    south.push(pointAlongLine(aligned.south, southInfo, progress));
  }
  return { north, south };
}

function edgeAlpha(progress) {
  if (progress <= FADE_FRACTION) return clamp(progress / FADE_FRACTION, 0, 1);
  if (progress >= 1 - FADE_FRACTION) return clamp((1 - progress) / FADE_FRACTION, 0, 1);
  return 1;
}

function edgesFromLocalPath(path) {
  const rows = path.filter(row => row.north || row.south || row.center);
  return {
    north: rows.filter(row => row.north).map(row => toLatLng(row.north)),
    center: rows.filter(row => row.center).map(row => toLatLng(row.center)),
    south: rows.filter(row => row.south).map(row => toLatLng(row.south))
  };
}

function makeRibbonMesh(eclipse, eclipseIndex, edges) {
  if (!edges?.north || !edges?.south || edges.north.length < 2 || edges.south.length < 2) {
    return null;
  }

  const colors = colorForEclipse(eclipse);
  const { north, south } = resampleEdges(edges.north, edges.south);
  const altitude = 0.006 + Math.min(eclipseIndex, DETAILED_SELECTION_LIMIT) * 0.00045;
  const positions = [];
  const alphas = [];
  const indices = [];

  for (let i = 0; i < north.length; i += 1) {
    const n = globe.getCoords(north[i][0], north[i][1], altitude);
    const s = globe.getCoords(south[i][0], south[i][1], altitude);
    positions.push(n.x, n.y, n.z, s.x, s.y, s.z);
    const alpha = edgeAlpha(i / Math.max(1, north.length - 1));
    alphas.push(alpha, alpha);
  }

  for (let i = 0; i < north.length - 1; i += 1) {
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
  mesh.renderOrder = 3 + eclipseIndex;
  mesh.name = `${eclipse.id}-ribbon`;
  return { id: eclipse.id, mesh, kind: 'ribbon' };
}

function makeOverviewItem(selection) {
  if (!selection.length) return null;
  const geometry = new THREE.SphereGeometry(0.42, 7, 5);
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.88,
    depthTest: true,
    depthWrite: false
  });
  const mesh = new THREE.InstancedMesh(geometry, material, selection.length);
  const helper = new THREE.Object3D();

  selection.forEach((eclipse, index) => {
    const coords = globe.getCoords(eclipse.focus[0], eclipse.focus[1], 0.009);
    helper.position.set(coords.x, coords.y, coords.z);
    helper.updateMatrix();
    mesh.setMatrixAt(index, helper.matrix);
    mesh.setColorAt(index, new THREE.Color(colorForEclipse(eclipse).band));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  mesh.name = `overview-${selection.length}`;
  return { id: 'overview', mesh, kind: 'overview' };
}

function centerLinePath(eclipse, eclipseIndex, edges) {
  if (!edges?.center || edges.center.length < 2) return null;
  const colors = colorForEclipse(eclipse);
  const revision = lineAnimationRevision.get(eclipse.id) || 0;
  return {
    kind: 'centerline',
    id: `${eclipse.id}-centerline-${revision}`,
    color: colors.line,
    stroke: 0.58,
    points: edges.center.map(([lat, lng]) => ({
      lat, lng, alt: 0.011 + eclipseIndex * 0.00045
    }))
  };
}

function boundaryFallbackPaths(eclipse, eclipseIndex, edges) {
  const colors = colorForEclipse(eclipse);
  const revision = lineAnimationRevision.get(eclipse.id) || 0;
  const paths = [];
  const add = (name, points, stroke) => {
    if (!points || points.length < 2) return;
    paths.push({
      kind: 'eclipse-boundary',
      id: `${eclipse.id}-${name}-${revision}`,
      color: colors.band,
      stroke,
      points: points.map(([lat, lng]) => ({
        lat, lng, alt: 0.010 + eclipseIndex * 0.00045
      }))
    });
  };
  add('north', edges?.north, 0.42);
  add('south', edges?.south, 0.42);
  return paths;
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

const pathCache = new Map();
let nasaPathQueue = Promise.resolve();

function loadNasaGeometry(eclipse) {
  if (eclipse.geometry) return Promise.resolve(eclipse.geometry);
  if (pathCache.has(eclipse.id)) return Promise.resolve(pathCache.get(eclipse.id));

  const run = () => new Promise((resolve, reject) => {
    const token = `${eclipse.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.setAttribute('aria-hidden', 'true');

    const endpoint = `${NASA_PATH_ENDPOINT}?Ecl=${encodeURIComponent(eclipse.nasaId)}&Spc=1.0`;
    const endpointHtml = endpoint.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    const tokenJs = JSON.stringify(token);

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      iframe.remove();
    };

    const onMessage = event => {
      if (event.source !== iframe.contentWindow) return;
      if (!event.data || event.data.type !== 'eclipse-globe-nasa-path' || event.data.token !== token) return;
      cleanup();
      if (!event.data.ok) {
        reject(new Error(event.data.error || `NASA path load failed for ${eclipse.nasaId}`));
        return;
      }

      const toLatLngPairs = coords => (coords || [])
        .filter(pair => Array.isArray(pair) && pair.length >= 2)
        .map(([lng, lat]) => [Number(lat), Number(lng)])
        .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

      const geometry = {
        north: toLatLngPairs(event.data.north),
        center: toLatLngPairs(event.data.center),
        south: toLatLngPairs(event.data.south)
      };

      if (geometry.north.length < 2 && geometry.center.length < 2 && geometry.south.length < 2) {
        reject(new Error(`NASA returned no usable path for ${eclipse.nasaId}`));
        return;
      }

      pathCache.set(eclipse.id, geometry);
      eclipse.geometry = geometry;
      resolve(geometry);
    };

    window.addEventListener('message', onMessage);

    iframe.srcdoc = `<!doctype html><meta charset="utf-8">
      <script>
        const __token = ${tokenJs};
        const __sources = Object.create(null);
        window.map = {
          getSource() { return null; },
          getLayer() { return null; },
          addSource(id, source) { __sources[id] = source; },
          addLayer() {}
        };
        function __collect(value) {
          if (!value) return [];
          if (value.type === 'FeatureCollection') return (value.features || []).flatMap(__collect);
          if (value.type === 'Feature') return __collect(value.geometry);
          if (value.type === 'LineString') return value.coordinates || [];
          if (value.type === 'MultiLineString') return (value.coordinates || []).flat();
          if (value.geometry) return __collect(value.geometry);
          if (value.data) return __collect(value.data);
          return [];
        }
        function __finish(ok, error) {
          parent.postMessage({
            type: 'eclipse-globe-nasa-path',
            token: __token,
            ok,
            error: error || null,
            north: __collect(__sources['northern-limit']),
            center: __collect(__sources['central-limit']),
            south: __collect(__sources['southern-limit'])
          }, '*');
        }
      <\/script>
      <script src="${endpointHtml}" onload="__finish(true)" onerror="__finish(false, 'Impossible de charger le script NASA')"><\/script>`;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`NASA path timeout for ${eclipse.nasaId}`));
    }, 18000);

    document.body.appendChild(iframe);
  });

  const promise = nasaPathQueue.then(run, run);
  nasaPathQueue = promise.catch(() => {});
  return promise;
}

async function ensureGeometry(eclipse) {
  if (eclipse.geometry) return eclipse.geometry;
  if (eclipse.path) {
    eclipse.geometry = edgesFromLocalPath(eclipse.path);
    pathCache.set(eclipse.id, eclipse.geometry);
    return eclipse.geometry;
  }
  return loadNasaGeometry(eclipse);
}

function formatYear(year) {
  if (year > 0) return String(year);
  return `${1 - year} av. J.-C.`;
}

function formatDate(eclipse) {
  return `${eclipse.day} ${MONTH_NAMES[eclipse.month - 1]} ${formatYear(eclipse.year)}`;
}

function formatDuration(value) {
  if (!value) return 'durée n/d';
  const raw = String(value);
  const compact = raw.match(/^(\d+)m(\d+)s$/i);
  if (compact) return `${Number(compact[1])} min ${Number(compact[2])} s`;
  return raw;
}

function parseDurationSeconds(value) {
  if (!value) return 0;
  const raw = String(value);
  let match = raw.match(/^(\d+)m(\d+)s$/i);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  match = raw.match(/(\d+)\s*min\s*([\d,.]+)\s*s/i);
  if (match) return Number(match[1]) * 60 + Number(match[2].replace(',', '.'));
  return 0;
}

function formatWidth(value) {
  return Number.isFinite(Number(value)) ? `${String(value).replace('.', ',')} km` : 'largeur n/d';
}

function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

function matchesSearch(eclipse, query) {
  if (!query) return true;
  const haystack = normalizeSearch([
    eclipse.displayDate,
    eclipse.year,
    eclipse.saros,
    eclipse.catalogNumber,
    eclipse.continent,
    eclipse.typeCode
  ].join(' '));
  return haystack.includes(query);
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

const catalogCount = document.getElementById('catalogCount');
const catalogMode = document.getElementById('catalogMode');
const catalogSearch = document.getElementById('catalogSearch');
const catalogList = document.getElementById('catalogList');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const showAllBtn = document.getElementById('showAllBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const continentSelect = document.getElementById('continentSelect');
const showContinentBtn = document.getElementById('showContinentBtn');
const catalogHint = document.getElementById('catalogHint');
const selectedCount = document.getElementById('selectedCount');
const maxDuration = document.getElementById('maxDuration');
const focusBtn = document.getElementById('focusBtn');
const bordersToggle = document.getElementById('bordersToggle');
const subtitle = document.querySelector('.subtitle');
const layerStatus = document.getElementById('layerStatus');

let eclipses = [];
let selectedIds = new Set();
let borderPaths = [];
let activeCustomItems = [];
let activeEclipsePaths = [];
let bordersLoaded = false;
let catalogLoaded = false;
let chronoVisibleCount = CHRONO_PAGE_SIZE;
let renderRevision = 0;
let currentRenderMode = 'detail';
const lineAnimationRevision = new Map();

function updateStatus(extra = '') {
  if (!layerStatus) return;
  const selected = selectedIds.size;
  const catalogText = catalogLoaded ? `${selected}/${eclipses.length} sélectionnées` : 'catalogue …';
  const borderText = bordersLoaded ? (bordersVisible ? 'frontières ✓' : 'frontières masquées') : 'frontières …';
  const modeText = currentRenderMode === 'overview' ? 'aperçu maxima' : 'bandes détaillées';
  layerStatus.textContent = `${catalogText} · ${modeText} · ${borderText} · build ${BUILD}${extra ? ` · ${extra}` : ''}`;
}

function disposeCustomItems(items) {
  items.forEach(item => {
    const mesh = item?.mesh;
    if (!mesh) return;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(material => material?.dispose?.());
  });
}

function setCustomItems(items) {
  const previous = activeCustomItems;
  activeCustomItems = items.filter(Boolean);
  globe.customLayerData(activeCustomItems);
  requestAnimationFrame(() => disposeCustomItems(previous));
}

function refreshPaths() {
  const visibleBorders = bordersVisible ? borderPaths : [];
  globe.pathsData([...visibleBorders, ...activeEclipsePaths]);
}

function selectedEclipses() {
  return eclipses.filter(eclipse => selectedIds.has(eclipse.id));
}

function updateSelectionStats(selection) {
  selectedCount.textContent = String(selection.length);
  const longest = selection
    .slice()
    .sort((a, b) => parseDurationSeconds(b.maxDuration) - parseDurationSeconds(a.maxDuration))[0];
  maxDuration.textContent = longest ? formatDuration(longest.maxDuration) : '—';
  focusBtn.disabled = selection.length === 0;
}

async function applySelection({ focus = false } = {}) {
  const revision = ++renderRevision;
  const selection = selectedEclipses();
  updateSelectionStats(selection);

  if (selection.length === 0) {
    currentRenderMode = 'detail';
    activeEclipsePaths = [];
    setCustomItems([]);
    refreshPaths();
    subtitle.textContent = 'Coche une ou plusieurs éclipses pour les afficher.';
    catalogHint.textContent = `Les bandes NASA détaillées sont chargées à la demande jusqu’à ${DETAILED_SELECTION_LIMIT} sélections.`;
    updateStatus();
    if (focus) focusOnSelection();
    return;
  }

  if (selection.length > DETAILED_SELECTION_LIMIT) {
    currentRenderMode = 'overview';
    activeEclipsePaths = [];
    const overview = makeOverviewItem(selection);
    setCustomItems(overview ? [overview] : []);
    refreshPaths();
    subtitle.textContent = `${selection.length.toLocaleString('fr-FR')} éclipses : aperçu des points de maximum NASA.`;
    catalogHint.textContent = `Au-delà de ${DETAILED_SELECTION_LIMIT} sélections, les maxima sont affichés en aperçu pour garder le globe fluide.`;
    updateStatus();
    if (focus) focusOnSelection();
    return;
  }

  currentRenderMode = 'detail';
  subtitle.textContent = `Chargement des trajectoires NASA pour ${selection.length} éclipse${selection.length > 1 ? 's' : ''}…`;
  updateStatus('chargement');

  const results = await Promise.allSettled(selection.map(ensureGeometry));
  if (revision !== renderRevision) return;

  const customItems = [];
  const paths = [];
  const failures = [];

  results.forEach((result, index) => {
    const eclipse = selection[index];
    if (result.status !== 'fulfilled') {
      console.warn('Trajectoire indisponible', eclipse.nasaId, result.reason);
      failures.push(eclipse);
      return;
    }

    const edges = result.value;
    const ribbon = makeRibbonMesh(eclipse, index, edges);
    if (ribbon) {
      customItems.push(ribbon);
    } else {
      paths.push(...boundaryFallbackPaths(eclipse, index, edges));
    }
    const center = centerLinePath(eclipse, index, edges);
    if (center) paths.push(center);
  });

  if (failures.length) {
    const fallback = makeOverviewItem(failures);
    if (fallback) customItems.push(fallback);
  }

  activeEclipsePaths = paths;
  setCustomItems(customItems);
  refreshPaths();

  if (failures.length) {
    subtitle.textContent = `${selection.length - failures.length} bande${selection.length - failures.length > 1 ? 's' : ''} détaillée${selection.length - failures.length > 1 ? 's' : ''}, ${failures.length} maximum${failures.length > 1 ? 's' : ''} en secours.`;
  } else if (selection.length === 1) {
    subtitle.textContent = `Bande de totalité du ${selection[0].displayDate}.`;
  } else {
    subtitle.textContent = `${selection.length} bandes de totalité affichées simultanément.`;
  }

  catalogHint.textContent = `Trajectoires détaillées chargées à la demande depuis les données NASA. Limite d’affichage détaillé : ${DETAILED_SELECTION_LIMIT}.`;
  updateStatus();
  if (focus) focusOnSelection();
}

function focusOnSelection() {
  const selection = selectedEclipses();
  if (!selection.length) return;

  if (selection.length === 1) {
    const [lat, lng] = selection[0].focus;
    globe.pointOfView({ lat, lng, altitude: 1.35 }, 900);
    return;
  }

  const center = selection.reduce(
    (sum, eclipse) => sum.add(latLngToUnit(eclipse.focus)),
    new THREE.Vector3()
  );

  if (center.lengthSq() < 0.035) {
    globe.pointOfView({ lat: 15, lng: 15, altitude: 2.55 }, 900);
    return;
  }

  const [lat, lng] = unitToLatLng(center);
  const altitude = selection.length > 100 ? 2.55 : selection.length > 12 ? 2.3 : 2.05;
  globe.pointOfView({ lat, lng, altitude }, 900);
}

function makeEclipseRow(eclipse) {
  const colors = colorForEclipse(eclipse);
  const row = document.createElement('label');
  row.className = 'eclipse-option';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = eclipse.id;
  input.dataset.eclipseId = eclipse.id;
  input.checked = selectedIds.has(eclipse.id);
  input.setAttribute('aria-label', `Afficher l’éclipse du ${eclipse.displayDate}`);

  const swatch = document.createElement('span');
  swatch.className = 'eclipse-swatch';
  swatch.style.background = colors.band;
  swatch.style.boxShadow = `0 0 0 1px ${colors.line}`;

  const text = document.createElement('span');
  text.className = 'eclipse-option-text';
  text.innerHTML = `<strong>${eclipse.displayDate}</strong><small>${eclipse.continent} · Saros ${eclipse.saros} · ${formatWidth(eclipse.maxPathWidthKm)} · ${formatDuration(eclipse.maxDuration)}</small>`;

  row.append(input, swatch, text);
  return row;
}

function filteredEclipses() {
  const query = normalizeSearch(catalogSearch.value);
  return eclipses.filter(eclipse => matchesSearch(eclipse, query));
}

function renderChronologicalCatalog() {
  const filtered = filteredEclipses();
  const visible = filtered.slice(0, chronoVisibleCount);
  const fragment = document.createDocumentFragment();
  visible.forEach(eclipse => fragment.appendChild(makeEclipseRow(eclipse)));
  catalogList.replaceChildren(fragment);
  loadMoreBtn.hidden = visible.length >= filtered.length;
  loadMoreBtn.textContent = `Afficher ${Math.min(CHRONO_PAGE_SIZE, filtered.length - visible.length)} de plus`;
  catalogHint.textContent = `${visible.length.toLocaleString('fr-FR')} / ${filtered.length.toLocaleString('fr-FR')} entrées visibles · catalogue complet : ${eclipses.length.toLocaleString('fr-FR')}.`;
}

function renderContinentCatalog() {
  const filtered = filteredEclipses();
  const fragment = document.createDocumentFragment();

  CONTINENT_ORDER.forEach(continent => {
    const group = filtered.filter(eclipse => eclipse.continent === continent);
    if (!group.length) return;

    const details = document.createElement('details');
    details.className = 'continent-group';

    const summary = document.createElement('summary');
    summary.innerHTML = `<span>${continent}</span><small>${group.length.toLocaleString('fr-FR')} éclipses</small>`;
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'continent-body';
    body.dataset.continent = continent;
    body.innerHTML = `<button class="continent-show-btn" type="button" data-continent="${continent}">Afficher seulement ${continent}</button><div class="continent-rows"></div>`;
    details.appendChild(body);

    details.addEventListener('toggle', () => {
      if (!details.open) return;
      const rows = body.querySelector('.continent-rows');
      if (rows.dataset.rendered === '1') return;
      const rowsFragment = document.createDocumentFragment();
      group.forEach(eclipse => rowsFragment.appendChild(makeEclipseRow(eclipse)));
      rows.appendChild(rowsFragment);
      rows.dataset.rendered = '1';
    });

    fragment.appendChild(details);
  });

  catalogList.replaceChildren(fragment);
  loadMoreBtn.hidden = true;
  catalogHint.textContent = `${filtered.length.toLocaleString('fr-FR')} éclipses réparties par continent principal, selon le point de maximum.`;
}

function renderCatalog() {
  if (!catalogLoaded) return;
  if (catalogMode.value === 'continent') renderContinentCatalog();
  else renderChronologicalCatalog();
}

function selectOnlyContinent(continent, { focus = true } = {}) {
  selectedIds = new Set(
    eclipses.filter(eclipse => eclipse.continent === continent).map(eclipse => eclipse.id)
  );
  renderCatalog();
  applySelection({ focus });
}

function populateContinents() {
  continentSelect.innerHTML = '';
  CONTINENT_ORDER.forEach(continent => {
    const count = eclipses.filter(eclipse => eclipse.continent === continent).length;
    const option = document.createElement('option');
    option.value = continent;
    option.textContent = `${continent} (${count.toLocaleString('fr-FR')})`;
    continentSelect.appendChild(option);
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
  } catch (error) {
    console.warn('Impossible de charger les frontières :', error);
    bordersToggle.checked = false;
    bordersToggle.disabled = true;
    bordersVisible = false;
    const label = document.querySelector('label[for="bordersToggle"]');
    if (label) label.textContent = 'Frontières indisponibles';
    updateStatus();
  }
}

async function loadLocalDetailedData() {
  const entries = await Promise.all(LOCAL_ECLIPSE_FILES.map(async ([url, nasaId]) => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) return [nasaId, null];
      const data = await response.json();
      return [nasaId, data.eclipses?.[0] || null];
    } catch {
      return [nasaId, null];
    }
  }));
  return new Map(entries);
}

async function loadCatalog() {
  try {
    const [catalogResponse, localData] = await Promise.all([
      fetch(CATALOG_URL, { cache: 'no-store' }),
      loadLocalDetailedData()
    ]);

    if (!catalogResponse.ok) throw new Error(`Catalogue NASA: HTTP ${catalogResponse.status}`);
    const catalog = await catalogResponse.json();
    if (!Array.isArray(catalog.eclipses) || catalog.eclipses.length !== 3173) {
      throw new Error(`Catalogue NASA incomplet (${catalog.eclipses?.length ?? 0}/3173)`);
    }

    eclipses = catalog.eclipses.map(meta => {
      const local = localData.get(meta.nasaId);
      return {
        ...meta,
        displayDate: formatDate(meta),
        name: 'Éclipse solaire totale',
        path: local?.path || null,
        maxPathWidthKm: local?.stats?.maxPathWidthKm ?? meta.maxPathWidthKm,
        maxDuration: local?.stats?.maxDuration ?? meta.maxDuration
      };
    });

    catalogLoaded = true;
    catalogCount.textContent = `${eclipses.length.toLocaleString('fr-FR')} éclipses totales`;
    populateContinents();

    const defaultEclipse = eclipses.find(eclipse => eclipse.nasaId === '20270802')
      || eclipses.find(eclipse => eclipse.nasaId === '20260812')
      || eclipses[eclipses.length - 1];
    selectedIds = new Set([defaultEclipse.id]);
    lineAnimationRevision.set(defaultEclipse.id, 1);

    renderCatalog();
    await applySelection({ focus: true });
  } catch (error) {
    console.error('Impossible de charger le catalogue :', error);
    subtitle.textContent = 'La Terre est chargée, mais le catalogue NASA n’a pas pu être récupéré.';
    catalogCount.textContent = 'Catalogue indisponible';
    layerStatus.textContent = `catalogue ✕ · build ${BUILD}`;
  }
}

catalogList.addEventListener('change', event => {
  const input = event.target.closest('input[data-eclipse-id]');
  if (!input) return;

  if (input.checked) {
    selectedIds.add(input.value);
    lineAnimationRevision.set(input.value, (lineAnimationRevision.get(input.value) || 0) + 1);
  } else {
    selectedIds.delete(input.value);
  }
  applySelection();
});

catalogList.addEventListener('click', event => {
  const button = event.target.closest('.continent-show-btn');
  if (!button) return;
  event.preventDefault();
  selectOnlyContinent(button.dataset.continent);
});

catalogMode.addEventListener('change', () => {
  chronoVisibleCount = CHRONO_PAGE_SIZE;
  renderCatalog();
});

catalogSearch.addEventListener('input', () => {
  chronoVisibleCount = CHRONO_PAGE_SIZE;
  renderCatalog();
});

loadMoreBtn.addEventListener('click', () => {
  chronoVisibleCount += CHRONO_PAGE_SIZE;
  renderCatalog();
});

showAllBtn.addEventListener('click', () => {
  selectedIds = new Set(eclipses.map(eclipse => eclipse.id));
  renderCatalog();
  applySelection({ focus: true });
});

clearAllBtn.addEventListener('click', () => {
  selectedIds.clear();
  renderCatalog();
  applySelection();
});

showContinentBtn.addEventListener('click', () => {
  selectOnlyContinent(continentSelect.value);
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
loadCatalog();
loadCountries();
