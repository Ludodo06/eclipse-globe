const EARTH_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BUMP_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-topology.png';

const dms = (deg, min, hemi) => {
  const value = Number(deg) + Number(min) / 60;
  return (hemi === 'S' || hemi === 'W') ? -value : value;
};

const toLatLng = (entry) => [dms(entry.lat[0], entry.lat[1], entry.lat[2]), dms(entry.lon[0], entry.lon[1], entry.lon[2])];

function buildLayers(eclipse) {
  const rows = eclipse.path.filter(r => r.north && r.south && r.center);
  const north = rows.map(r => toLatLng(r.north));
  const south = rows.map(r => toLatLng(r.south));
  const center = rows.map(r => toLatLng(r.center));

  const bandCoords = [
    ...north.map(([lat, lng]) => ({ lat, lng })),
    ...south.slice().reverse().map(([lat, lng]) => ({ lat, lng }))
  ];

  return {
    polygons: [{ id: 'totality', coordinates: bandCoords }],
    paths: [{ id: 'centerline', points: center.map(([lat, lng]) => ({ lat, lng })) }]
  };
}

const globe = Globe()(document.getElementById('globe'))
  .backgroundColor('#02050a')
  .globeImageUrl(EARTH_TEXTURE)
  .bumpImageUrl(BUMP_TEXTURE)
  .showAtmosphere(true)
  .atmosphereColor('#6ea9ff')
  .atmosphereAltitude(0.16)
  .polygonCapColor(() => 'rgba(0,0,0,0.88)')
  .polygonSideColor(() => 'rgba(0,0,0,0.42)')
  .polygonStrokeColor(() => 'rgba(255,255,255,0.30)')
  .polygonAltitude(0.006)
  .pathPointLat('lat')
  .pathPointLng('lng')
  .pathColor(() => '#e04a4a')
  .pathStroke(0.65)
  .pathAltitude(0.010)
  .pathResolution(1);

globe.controls().enableDamping = true;
globe.controls().dampingFactor = 0.08;
globe.controls().autoRotate = false;

const select = document.getElementById('eclipseSelect');
const maxWidth = document.getElementById('maxWidth');
const maxDuration = document.getElementById('maxDuration');
const focusBtn = document.getElementById('focusBtn');

let eclipses = [];
let active = null;

function renderEclipse(eclipse) {
  active = eclipse;
  const layers = buildLayers(eclipse);
  globe.polygonsData(layers.polygons).polygonGeoJsonGeometry(d => ({
    type: 'Polygon',
    coordinates: [[...d.coordinates.map(p => [p.lng, p.lat]), [d.coordinates[0].lng, d.coordinates[0].lat]]]
  }));
  globe.pathsData(layers.paths).pathPoints('points');

  maxWidth.textContent = `${eclipse.stats.maxPathWidthKm} km`;
  maxDuration.textContent = eclipse.stats.maxDuration;
  focusOnEclipse();
}

function focusOnEclipse() {
  if (!active) return;
  const [lat, lng] = active.focus;
  globe.pointOfView({ lat, lng, altitude: 1.75 }, 900);
}

fetch('./data/eclipses.json')
  .then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then(data => {
    eclipses = data.eclipses;
    select.innerHTML = eclipses.map(e => `<option value="${e.id}">${e.date} — ${e.name}</option>`).join('');
    renderEclipse(eclipses[0]);
  })
  .catch(err => {
    console.error(err);
    document.querySelector('.subtitle').textContent = 'Impossible de charger les données locales de l’éclipse.';
  });

select.addEventListener('change', () => renderEclipse(eclipses.find(e => e.id === select.value)));
focusBtn.addEventListener('click', focusOnEclipse);

function resize() {
  globe.width(window.innerWidth).height(window.innerHeight);
}
window.addEventListener('resize', resize);
resize();
