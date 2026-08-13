(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.161.0/+esm';
  const version = (() => {
    try { return new URL(document.currentScript?.src || location.href).searchParams.get('v') || Date.now(); }
    catch { return Date.now(); }
  })();
  const CATALOG_URL = `./data/nasa-total-eclipses.json?v=${version}`;
  const SPECIAL_OLD_COLORS = {
    '20260812': '#9b6cff',
    '20270802': '#ff8a3d'
  };
  const SPECIAL_VIVID_COLORS = {
    '20260812': '#b45cff',
    '20270802': '#ff7a1a'
  };

  const state = {
    THREE: null,
    catalog: [],
    byId: new Map(),
    ready: false,
    globe: null,
    lastItems: []
  };

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || 'eclipse');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function oldBandStyle(meta) {
    if (SPECIAL_OLD_COLORS[meta.nasaId]) return SPECIAL_OLD_COLORS[meta.nasaId];
    const n = Number(meta.catalogNumber) || hashString(meta.id);
    const hue = (n * 137.50776405) % 360;
    const saturation = 72 + (n % 13);
    const lightness = 48 + (n % 9);
    return `hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`;
  }

  function vividColor(meta) {
    const color = new state.THREE.Color();
    if (SPECIAL_VIVID_COLORS[meta.nasaId]) return color.set(SPECIAL_VIVID_COLORS[meta.nasaId]);
    const n = Number(meta.catalogNumber) || hashString(meta.id);
    const hue = ((n * 137.50776405) % 360) / 360;
    const lightness = [0.56, 0.62, 0.68][Math.abs(n) % 3];
    return color.setHSL(hue, 0.96, lightness);
  }

  function selectedMetas() {
    const ids = new Set(
      [...document.querySelectorAll('#visibleEclipsesList .visible-eclipse-btn[data-eclipse-id]')]
        .map(node => node.dataset.eclipseId)
        .filter(Boolean)
    );

    if (!ids.size) {
      document.querySelectorAll('#catalogList input[data-eclipse-id]:checked').forEach(input => ids.add(input.value));
    }

    return state.catalog.filter(meta => ids.has(meta.id));
  }

  function detectSegments(alpha, vertexCount) {
    if (!alpha || vertexCount < 4) return [{ start:0, end:vertexCount }];
    const starts = [0];
    const pairCount = Math.floor(vertexCount / 2);
    for (let pair = 1; pair < pairCount; pair += 1) {
      const previous = alpha.getX((pair - 1) * 2);
      const current = alpha.getX(pair * 2);
      if (Math.abs(previous) <= 1e-5 && Math.abs(current) <= 1e-5) starts.push(pair * 2);
    }
    return starts.map((start, index) => ({
      start,
      end:index + 1 < starts.length ? starts[index + 1] : vertexCount
    })).filter(segment => segment.end - segment.start >= 4);
  }

  function captureOriginal(items) {
    (items || []).forEach(item => {
      if (item?.kind !== 'ribbons') return;
      const geometry = item.mesh?.geometry;
      const color = geometry?.getAttribute?.('aColor');
      if (!geometry || !color) return;
      geometry.userData = geometry.userData || {};
      if (!geometry.userData.stableOriginalColors) {
        const existing = geometry.userData.eclipseOriginalColors;
        geometry.userData.stableOriginalColors = existing
          ? new Float32Array(existing)
          : new Float32Array(color.array);
      }
    });
  }

  function colorDistance(original, vertex, meta) {
    const target = meta._oldBandColor;
    const offset = vertex * 3;
    const dr = original[offset] - target.r;
    const dg = original[offset + 1] - target.g;
    const db = original[offset + 2] - target.b;
    return dr * dr + dg * dg + db * db;
  }

  function patchRibbon(mesh) {
    if (!state.ready || !state.THREE) return;
    const geometry = mesh?.geometry;
    const color = geometry?.getAttribute?.('aColor');
    const alpha = geometry?.getAttribute?.('aAlpha');
    const original = geometry?.userData?.stableOriginalColors || geometry?.userData?.eclipseOriginalColors;
    if (!geometry || !color || !original) return;

    const selected = selectedMetas();
    if (!selected.length) return;

    const segments = detectSegments(alpha, color.count);
    if (!segments.length) return;

    const keys = new Float32Array(color.count);
    const used = new Set();

    segments.forEach((segment, segmentIndex) => {
      let meta = null;

      // Quand toutes les trajectoires sont chargées, l'ordre est exactement celui du catalogue.
      if (segments.length === selected.length) {
        meta = selected[segmentIndex] || null;
      }

      // Pendant le chargement progressif ou si une trajectoire NASA manque,
      // on retrouve l'éclipse par la couleur d'origine en pleine précision.
      if (!meta) {
        let bestDistance = Infinity;
        selected.forEach(candidate => {
          if (used.has(candidate.id)) return;
          const distance = colorDistance(original, segment.start, candidate);
          if (distance < bestDistance) {
            bestDistance = distance;
            meta = candidate;
          }
        });
      }

      if (!meta) return;
      used.add(meta.id);
      const vivid = vividColor(meta);
      for (let vertex = segment.start; vertex < segment.end; vertex += 1) {
        keys[vertex] = meta._hoverKey;
        color.setXYZ(vertex, vivid.r, vivid.g, vivid.b);
      }
    });

    geometry.setAttribute('aEclipseKey', new state.THREE.Float32BufferAttribute(keys, 1));
    color.needsUpdate = true;
    geometry.getAttribute('aEclipseKey').needsUpdate = true;
  }

  function patchItems(items = state.lastItems) {
    captureOriginal(items);
    (items || []).forEach(item => {
      if (item?.kind === 'ribbons') patchRibbon(item.mesh);
    });
  }

  function schedulePatch(items) {
    state.lastItems = Array.isArray(items) ? items : [];
    captureOriginal(state.lastItems);
    queueMicrotask(() => patchItems(state.lastItems));
    setTimeout(() => patchItems(state.lastItems), 0);
    setTimeout(() => patchItems(state.lastItems), 30);
    setTimeout(() => patchItems(state.lastItems), 120);
  }

  function attach(instance) {
    if (!instance || instance.__stableEclipseIdentityInstalled) return;
    instance.__stableEclipseIdentityInstalled = true;
    state.globe = instance;

    const previous = instance.customLayerData.bind(instance);
    instance.customLayerData = function stableCustomLayerData(value) {
      if (arguments.length === 0) return previous();
      const items = Array.isArray(value) ? value : [];
      captureOriginal(items);
      const result = previous(value);
      schedulePatch(items);
      return result;
    };

    try {
      const current = instance.customLayerData();
      if (Array.isArray(current)) schedulePatch(current);
    } catch {}
  }

  function waitForGlobe() {
    const existing = window.eclipseGlobeInstance;
    if (existing) {
      attach(existing);
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.eclipseGlobeInstance) {
        clearInterval(timer);
        attach(window.eclipseGlobeInstance);
      } else if (attempts > 100) {
        clearInterval(timer);
      }
    }, 50);
  }

  async function initialize() {
    try {
      const [THREE, response] = await Promise.all([
        import(THREE_URL),
        fetch(CATALOG_URL, { cache:'no-store' })
      ]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.eclipses)) throw new Error('Catalogue invalide');

      state.THREE = THREE;
      state.catalog = data.eclipses.map((meta, index) => ({ ...meta, _hoverKey:index + 1 }));
      state.catalog.forEach(meta => { meta._oldBandColor = new THREE.Color(oldBandStyle(meta)); });
      state.byId = new Map(state.catalog.map(meta => [meta.id, meta]));
      state.ready = true;

      waitForGlobe();
      if (state.globe) patchItems(state.lastItems);
    } catch (error) {
      console.warn('Identité stable des éclipses indisponible :', error);
    }
  }

  initialize();
})();
