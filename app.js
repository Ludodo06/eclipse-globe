const EARTH_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-topology.png';
const COUNTRIES_GEOJSON = 'https://unpkg.com/three-globe/example/datasets/ne_110m_admin_0_countries.geojson';

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

  const ring = [
    ...north.map(([lat, lng]) => [lng, lat]),
    ...south.slice().reverse().map(([lat, lng]) => [lng, lat])
  ];
  ring.push([...ring[0]]);

  return {
    polygon: {
      kind: 'eclipse',
      name: `${eclipse.date} — ${eclipse.name}`,
      geometry: { type: 'Polygon', coordinates: [ring] }
    },
    path: {
      id: 'centerline',
      points: center.map(([lat, lng]) => ({ lat, lng }))
    }
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
  .polygonCapColor(d => d.kind === 'eclipse' ? 'rgba(0,0,0,0.94)' : 'rgba(0,0,0,0)')
  .polygonSideColor(d => d.kind === 'eclipse' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0)')
  .polygonStrokeColor(d => {
    if (d.kind === 'eclipse') return 'rgba(255,255,255,0.55)';
    return bordersVisible ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0)';
  })
  .polygonAltitude(d => d.kind === 'eclipse' ? 0.012 : 0.003)
  .polygonsTransitionDuration(0)
  .pathPointLat('lat')
  .pathPointLng('lng')
  .pathColor(() => '#ff4d4d')
  .pathStroke(0.85)
  .pathAltitude(0.018)
  .pathResolution(1);

globe.controls().enableDamping = true;
globe.controls().dampingFactor = 0.08;
globe.controls().autoRotate = false;

const select = document.getElementById('eclipseSelect');
const maxWidth = document.getElementById('maxWidth');
const maxDuration = document.getElementById('maxDuration');
const focusBtn = document.getElementById('focusBtn');
const bordersToggle = document.getElementById('bordersToggle');
const subtitle = document.querySelector('.subtitle');

let eclipses = [];
let active = null;
let countryPolygons = [];
let activeEclipsePolygon = null;

function refreshPolygons() {
  const polygons = [...countryPolygons];
  if (activeEclipsePolygon) polygons.push(activeEclipsePolygon);
  globe.polygonsData(polygons);
}

function renderEclipse(eclipse) {
  if (!eclipse) return;

  active = eclipse;
  const geometry = buildEclipseGeometry(eclipse);
  activeEclipsePolygon = geometry.polygon;
  refreshPolygons();
  globe.pathsData([geometry.path]).pathPoints('points');

  maxWidth.textContent = `${String(eclipse.stats.maxPathWidthKm).replace('.', ',')} km`;
  maxDuration.textContent = eclipse.stats.maxDuration;
  subtitle.textContent = `Bande de totalité du ${eclipse.date}. Noir = totalité, rouge = ligne centrale.`;
  focusOnEclipse();
}

function focusOnEclipse() {
  if (!active) return;
  const [lat, lng] = active.focus;
  globe.pointOfView({ lat, lng, altitude: 1.45 }, 900);
}

async function loadCountries() {
  try {
    const response = await fetch(COUNTRIES_GEOJSON, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const geojson = await response.json();
    countryPolygons = geojson.features
      .filter(feature => feature.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type))
      .map(feature => ({
        kind: 'country',
        geometry: feature.geometry,
        properties: feature.properties
      }));
    refreshPolygons();
  } catch (err) {
    console.warn('Impossible de charger les frontières :', err);
    bordersToggle.checked = false;
    bordersToggle.disabled = true;
    const label = document.querySelector('label[for="bordersToggle"]');
    if (label) label.textContent = 'Frontières indisponibles';
  }
}

async function loadEclipses() {
  try {
    const response = await fetch('./data/eclipses.json', { cache: 'no-store' });
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
  }
}

select.addEventListener('change', () => {
  const eclipse = eclipses.find(e => e.id === select.value);
  if (eclipse) renderEclipse(eclipse);
});

focusBtn.addEventListener('click', focusOnEclipse);

bordersToggle.addEventListener('change', () => {
  bordersVisible = bordersToggle.checked;
  // Force Globe.gl to re-evaluate the stroke accessor on every country polygon.
  globe.polygonStrokeColor(d => {
    if (d.kind === 'eclipse') return 'rgba(255,255,255,0.55)';
    return bordersVisible ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0)';
  });
  refreshPolygons();
});

function resize() {
  globe.width(window.innerWidth).height(window.innerHeight);
}

window.addEventListener('resize', resize);
resize();

loadEclipses();
loadCountries();
