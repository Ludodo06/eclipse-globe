(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.161.0/+esm';
  const version = (() => {
    try { return new URL(document.currentScript?.src || location.href).searchParams.get('v') || Date.now(); }
    catch { return Date.now(); }
  })();
  const CATALOG_URL = `./data/nasa-total-eclipses.json?v=${version}`;
  const SPECIAL = {
    '20260812': '#9b6cff',
    '20270802': '#ff8a3d'
  };

  const state = {
    THREE: null,
    catalog: [],
    byColor: new Map(),
    ready: false
  };

  function hashString(value) {
    let hash = 2166136261;
    for (const char of String(value || 'eclipse')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function originalStyle(meta) {
    if (SPECIAL[meta.nasaId]) return SPECIAL[meta.nasaId];
    const n = meta.catalogNumber || hashString(meta.id);
    const hue = (n * 137.50776405) % 360;
    const saturation = 72 + (n % 13);
    const lightness = 48 + (n % 9);
    return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
  }

  function colorKey(r, g, b) {
    return `${Math.round(r * 1000000)},${Math.round(g * 1000000)},${Math.round(b * 1000000)}`;
  }

  function vertexColorKey(array, vertex) {
    const offset = vertex * 3;
    return colorKey(array[offset], array[offset + 1], array[offset + 2]);
  }

  function segmentRanges(alpha, vertexCount) {
    if (!alpha || vertexCount < 4) return [{ start: 0, end: vertexCount }];
    const starts = [0];
    const pairs = Math.floor(vertexCount / 2);
    for (let pair = 1; pair < pairs; pair += 1) {
      const previous = alpha.getX((pair - 1) * 2);
      const current = alpha.getX(pair * 2);
      if (Math.abs(previous) <= 1e-5 && Math.abs(current) <= 1e-5) {
        starts.push(pair * 2);
      }
    }
    return starts.map((start, index) => ({
      start,
      end: index + 1 < starts.length ? starts[index + 1] : vertexCount
    })).filter(segment => segment.end - segment.start >= 4);
  }

  function snapshot(items) {
    const snapshots = new Map();
    for (const item of items || []) {
      if (item?.kind !== 'ribbons') continue;
      const geometry = item.mesh?.geometry;
      const color = geometry?.getAttribute?.('aColor');
      if (!geometry || !color) continue;
      snapshots.set(geometry.uuid, new Float32Array(color.array));
    }
    return snapshots;
  }

  function identifyFromRawColor(raw, vertex) {
    return state.byColor.get(vertexColorKey(raw, vertex)) || null;
  }

  function writeIdentity(items, snapshots) {
    if (!state.ready || !state.THREE) return;

    for (const item of items || []) {
      if (item?.kind !== 'ribbons') continue;
      const geometry = item.mesh?.geometry;
      const color = geometry?.getAttribute?.('aColor');
      const alpha = geometry?.getAttribute?.('aAlpha');
      const raw = geometry ? snapshots.get(geometry.uuid) : null;
      if (!geometry || !color || !raw) continue;

      const keys = new Float32Array(color.count);
      for (const segment of segmentRanges(alpha, color.count)) {
        const meta = identifyFromRawColor(raw, segment.start);
        if (!meta) continue;
        for (let vertex = segment.start; vertex < segment.end; vertex += 1) {
          keys[vertex] = meta._hoverKey;
        }
      }

      geometry.setAttribute('aEclipseKey', new state.THREE.Float32BufferAttribute(keys, 1));
      geometry.getAttribute('aEclipseKey').needsUpdate = true;
    }
  }

  function attach(globe) {
    if (!globe || globe.__atomicEclipseIdentity) return;
    globe.__atomicEclipseIdentity = true;

    const previous = globe.customLayerData.bind(globe);
    globe.customLayerData = function atomicCustomLayerData(value) {
      if (!arguments.length) return previous();
      const items = Array.isArray(value) ? value : [];
      const raw = snapshot(items);
      const result = previous(value);
      writeIdentity(items, raw);
      return result;
    };
  }

  function waitForGlobe() {
    if (window.eclipseGlobeInstance) {
      attach(window.eclipseGlobeInstance);
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.eclipseGlobeInstance) {
        clearInterval(timer);
        attach(window.eclipseGlobeInstance);
      } else if (attempts > 120) {
        clearInterval(timer);
      }
    }, 50);
  }

  Promise.all([
    import(THREE_URL),
    fetch(CATALOG_URL, { cache: 'no-store' })
  ]).then(async ([THREE, response]) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.THREE = THREE;
    state.catalog = (data.eclipses || []).map((meta, index) => ({ ...meta, _hoverKey: index + 1 }));

    for (const meta of state.catalog) {
      const color = new THREE.Color(originalStyle(meta));
      state.byColor.set(colorKey(color.r, color.g, color.b), meta);
    }

    state.ready = true;
    waitForGlobe();
  }).catch(error => console.warn('Identité des éclipses indisponible :', error));
})();
