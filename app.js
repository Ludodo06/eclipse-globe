const EARTH_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const COUNTRIES_GEOJSON = 'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl@master/example/datasets/ne_110m_admin_0_countries.geojson';

const dms = (deg, min, hemi) => {
  const value = Number(deg) + Number(min) / 60;
  return (hemi === 'S' || hemi === 'W') ? -value : value;
};

const toLatLng = (entry) => [
  dms(entry.lat[0], entry.lat[1], entry.lat[2]),
  dms(entry.lon[0], entry.lon[1], entry.lon[2])
];

function buildEclipseGeometry(eclipse) {
  const rows = eclipse.path.filter(r => r.north && r.south && r.center);
  const north = rows.map(r => toLatLng(r.north));
  const south = rows.map(r => toLatLng(r.south));
  const center = rows.map(r => toLatLng(r.center));

  // Split the long band into small quadrilaterals. This avoids fragile
  // triangulation of one very long, curved polygon around the globe.
  const polygons = [];
  for (let i = 0; i < rows.length - 1; i += 1) {
    const [nLat1, nLng1] = north[i];
    const [nLat2, nLng2] = north[i + 1];
    const [sLat1, sLng1] = south[i];
    const [sLat2, sLng2] = south[i + 1];

    polygons.push({
      kind: 'eclipse',
      name: `${eclipse.date} — ${eclipse.name}`,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [nLng1, nLat1],
          [nLng2, nLat2],
          [sLng2, sLat2],
          [sLng1, sLat1],
          [nLng1, nLat1]
        ]]
      }
    });
  }

  return {
    polygons,
    paths: [
      {
        id: 'north-edge',
        color: '#050505',
        stroke: 0.34,
        points: north.map(([lat, lng]) => ({ lat, lng, alt: 0.014 }))
      },
      {
        id: 'south-edge',
        color: '#050505',
        stroke: 0.34,
        points: south.map(([lat, lng]) => ({ lat, lng, alt: 0.014 }))
      },
      {
        id: 'centerline',
        color: '#ff4d4d',
        stroke: 0.62,
        points: center.map(([lat, lng]) => ({ lat, lng, alt: 0.017 }))
      }
    ]
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
  .polygonCapColor(d => d.kind === 'eclipse' ? 'rgba(0,0,0,0.90)' : 'rgba(0,0,0,0)')
  .polygonSideColor(d => d.kind === 'eclipse' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0)')
  .polygonStrokeColor(d => {
    if (d.kind === 'eclipse') return 'rgba(0,0,0,0.98)';
    return bordersVisible ? 'rgba(255,255,255,0.95)' : null;
  })
  .polygonAltitude(d => d.kind === 'eclipse' ? 0.012 : 0.004)
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

const select = document.getElementById('eclipseSelect');
const maxWidth = document.getElementById('maxWidth');
const maxDuration = document.getElementById('maxDuration');
const focusBtn = document.getElementById('focusBtn');
const bordersToggle = document.getElementById('bordersToggle');
const subtitle = document.querySelector('.subtitle');
const layerStatus = document.getElementById('layerStatus');

let eclipses = [];
let active = null;
let countryPolygons = [];
let activeEclipsePolygons = [];
let eclipseLoaded = false;
let bordersLoaded = false;

function updateStatus() {
  if (!layerStatus) return;
  const eclipseText = eclipseLoaded ? 'éclipse ✓' : 'éclipse …';
  const borderText = bordersLoaded ? 'frontières ✓' : 'frontières …';
  layerStatus.textContent = `${eclipseText} · ${borderText} · build 7`;
}

function refreshPolygons() {
  globe.polygonsData([...countryPolygons, ...activeEclipsePolygons]);
}

function renderEclipse(eclipse) {
  if (!eclipse) return;

  active = eclipse;
  const geometry = buildEclipseGeometry(eclipse);
  activeEclipsePolygons = geometry.polygons;
  refreshPolygons();
  globe.pathsData(geometry.paths);

  eclipseLoaded = true;
  updateStatus();
  maxWidth.textContent = `${String(eclipse.stats.maxPathWidthKm).replace('.', ',')} km`;
  maxDuration.textContent = eclipse.stats.maxDuration;
  subtitle.textContent = `Bande de totalité du ${eclipse.date}. Noir = totalité, rouge = ligne centrale.`;
  focusOnEclipse();
}

function focusOnEclipse() {
  if (!active) return;
  const [lat, lng] = active.focus;
  globe.pointOfView({ lat, lng, altitude: 1.35 }, 900);
}

async function loadCountries() {
  try {
    const response = await fetch(COUNTRIES_GEOJSON, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    countryPolygons = geojson.features
      .filter(feature => feature.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))
      .map(feature => ({
        kind: 'country',
        geometry: feature.geometry,
        properties: feature.properties
      }));

    bordersLoaded = true;
    refreshPolygons();
    updateStatus();
  } catch (err) {
    console.warn('Impossible de charger les frontières :', err);
    bordersToggle.checked = false;
    bordersToggle.disabled = true;
    const label = document.querySelector('label[for="bordersToggle"]');
    if (label) label.textContent = 'Frontières indisponibles';
    if (layerStatus) layerStatus.textContent = 'éclipse ✓ · frontières ✕ · build 7';
  }
}

async function loadEclipses() {
  try {
    const response = await fetch('./data/eclipses.json?v=7', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (!Array.isArray(data.eclipses) || data.eclipses.length === 0) {
      throw new Error('Aucune éclipse dans le fichier de données');
    }

    eclipses = data.eclipses;
    select.innerHTML = '';
    for (const eclipse of eclipses) {
      const option = document.createElement('option');
      option.value = eclipse.id;
      option.textContent = `${eclipse.date} — ${eclipse.name}`;
      select.appendChild(option);
    }

    select.value = eclipses[0].id;
    renderEclipse(eclipses[0]);
  } catch (err) {
    console.error('Impossible de charger les éclipses :', err);
    subtitle.textContent = 'La Terre est chargée, mais les données de l’éclipse n’ont pas pu être récupérées.';
    if (layerStatus) layerStatus.textContent = 'éclipse ✕ · frontières … · build 7';
  }
}

select.addEventListener('change', () => {
  const eclipse = eclipses.find(e => e.id === select.value);
  if (eclipse) renderEclipse(eclipse);
});

focusBtn.addEventListener('click', focusOnEclipse);

bordersToggle.addEventListener('change', () => {
  bordersVisible = bordersToggle.checked;
  globe.polygonStrokeColor(d => {
    if (d.kind === 'eclipse') return 'rgba(0,0,0,0.98)';
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
