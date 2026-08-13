(() => {
  const BUILD = 16;
  const CATALOG_URL = `./data/nasa-total-eclipses.json?v=${BUILD}`;
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.161.0/+esm';
  const MONTH_NAMES = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  const SPECIAL_OLD_COLORS = {
    '20260812': '#9b6cff',
    '20270802': '#ff8a3d'
  };
  const SPECIAL_VIVID_COLORS = {
    '20260812': '#b45cff',
    '20270802': '#ff7a1a'
  };

  const state = {
    globe: null,
    THREE: null,
    catalog: [],
    byId: new Map(),
    selectedIds: new Set(),
    oldColorCandidates: new Map(),
    ready: false,
    colorsReady: false,
    focusedId: null,
    lastCustomItems: []
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    if (!state.THREE) return null;
    const color = new state.THREE.Color();
    if (SPECIAL_VIVID_COLORS[meta.nasaId]) {
      color.set(SPECIAL_VIVID_COLORS[meta.nasaId]);
      return color;
    }
    const n = Number(meta.catalogNumber) || hashString(meta.id);
    const hue = ((n * 137.50776405) % 360) / 360;
    const lightness = [0.56, 0.62, 0.68][Math.abs(n) % 3];
    color.setHSL(hue, 0.96, lightness);
    return color;
  }

  function bandColorCss(meta) {
    if (SPECIAL_VIVID_COLORS[meta.nasaId]) return SPECIAL_VIVID_COLORS[meta.nasaId];
    const n = Number(meta.catalogNumber) || hashString(meta.id);
    const hue = (n * 137.50776405) % 360;
    const lightness = [56, 62, 68][Math.abs(n) % 3];
    return `hsl(${hue.toFixed(1)} 96% ${lightness}%)`;
  }

  function formatYear(year) {
    return year > 0 ? String(year) : `${1 - year} av. J.-C.`;
  }

  function formatDate(meta) {
    return `${meta.day} ${MONTH_NAMES[meta.month - 1]} ${formatYear(meta.year)}`;
  }

  function chronologicalCompare(a, b) {
    return (Number(a.year) - Number(b.year))
      || (Number(a.month) - Number(b.month))
      || (Number(a.day) - Number(b.day))
      || String(a.id).localeCompare(String(b.id));
  }

  function centuryKey(year) {
    if (year > 0) return `ce-${Math.floor((year - 1) / 100) + 1}`;
    const historicalBceYear = 1 - year;
    return `bce-${Math.floor((historicalBceYear - 1) / 100) + 1}`;
  }

  function installScrollFix() {
    if (document.getElementById('selectionScrollFix')) return;
    const style = document.createElement('style');
    style.id = 'selectionScrollFix';
    style.textContent = `
      .panel-left {
        height: calc(100% - 28px) !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }
      .panel-left details.catalog[open] {
        display: flex !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
        flex-direction: column !important;
      }
      .panel-left details.catalog > summary { flex: 0 0 auto !important; }
      .panel-left .catalog-body {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }
      .panel-left .catalog-toolbar { flex: 0 0 auto !important; }
      .panel-left .catalog-list {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain;
        scrollbar-gutter: stable;
        -webkit-overflow-scrolling: touch;
      }
      .panel-left #loadMoreBtn,
      .panel-left .catalog-hint { flex: 0 0 auto !important; }
      @media (max-width: 980px) {
        .panel-left { height: calc(100% - 24px) !important; }
      }
      @media (max-width: 520px) {
        .panel-left { height: calc(100% - 20px) !important; }
      }
    `;
    document.head.appendChild(style);
  }

  function colorKeyFromColor(color) {
    return `${Math.round(clamp(color.r, 0, 1) * 255)},${Math.round(clamp(color.g, 0, 1) * 255)},${Math.round(clamp(color.b, 0, 1) * 255)}`;
  }

  function colorKeyFromArray(array, index) {
    return `${Math.round(clamp(array[index * 3], 0, 1) * 255)},${Math.round(clamp(array[index * 3 + 1], 0, 1) * 255)},${Math.round(clamp(array[index * 3 + 2], 0, 1) * 255)}`;
  }

  function focusVector(meta) {
    if (!state.THREE || !Array.isArray(meta.focus)) return null;
    const lat = Number(meta.focus[0]);
    const lng = Number(meta.focus[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const phi = lat * Math.PI / 180;
    const theta = lng * Math.PI / 180;
    const cosPhi = Math.cos(phi);
    return new state.THREE.Vector3(
      cosPhi * Math.cos(theta),
      Math.sin(phi),
      cosPhi * Math.sin(theta)
    );
  }

  function segmentDirection(positionAttribute, startVertex, endVertex) {
    if (!state.THREE || !positionAttribute || endVertex <= startVertex) return null;
    const middle = Math.floor((startVertex + endVertex - 1) / 2);
    const a = new state.THREE.Vector3(
      positionAttribute.getX(middle),
      positionAttribute.getY(middle),
      positionAttribute.getZ(middle)
    );
    const bIndex = middle + 1 < endVertex ? middle + 1 : middle;
    const b = new state.THREE.Vector3(
      positionAttribute.getX(bIndex),
      positionAttribute.getY(bIndex),
      positionAttribute.getZ(bIndex)
    );
    a.add(b).multiplyScalar(0.5);
    return a.lengthSq() > 0 ? a.normalize() : null;
  }

  function nearestCandidate(candidates, direction, alreadyUsed) {
    const pool = candidates.filter(meta => state.selectedIds.has(meta.id) && !alreadyUsed.has(meta.id));
    const usable = pool.length ? pool : candidates.filter(meta => state.selectedIds.has(meta.id));
    if (!usable.length) return null;
    if (usable.length === 1 || !direction) return usable[0];

    let best = usable[0];
    let bestDot = -Infinity;
    usable.forEach(meta => {
      const vector = focusVector(meta);
      const dot = vector ? vector.dot(direction) : -Infinity;
      if (dot > bestDot) {
        bestDot = dot;
        best = meta;
      }
    });
    return best;
  }

  function fallbackNearestSelected(direction, alreadyUsed) {
    const pool = state.catalog.filter(meta => state.selectedIds.has(meta.id) && !alreadyUsed.has(meta.id));
    if (!pool.length) return null;
    if (!direction) return pool[0];
    let best = pool[0];
    let bestDot = -Infinity;
    pool.forEach(meta => {
      const vector = focusVector(meta);
      const dot = vector ? vector.dot(direction) : -Infinity;
      if (dot > bestDot) {
        bestDot = dot;
        best = meta;
      }
    });
    return best;
  }

  function detectRibbonSegments(alphaAttribute, vertexCount) {
    if (!alphaAttribute || vertexCount < 4) return [{ start: 0, end: vertexCount }];
    const pairCount = Math.floor(vertexCount / 2);
    const starts = [0];
    const epsilon = 1e-5;

    for (let pair = 1; pair < pairCount; pair += 1) {
      const previous = alphaAttribute.getX((pair - 1) * 2);
      const current = alphaAttribute.getX(pair * 2);
      if (Math.abs(previous) <= epsilon && Math.abs(current) <= epsilon) {
        starts.push(pair * 2);
      }
    }

    const segments = [];
    for (let i = 0; i < starts.length; i += 1) {
      const start = starts[i];
      const end = i + 1 < starts.length ? starts[i + 1] : vertexCount;
      if (end - start >= 4) segments.push({ start, end });
    }
    return segments.length ? segments : [{ start: 0, end: vertexCount }];
  }

  function captureOriginalRibbonColors(items) {
    (items || []).forEach(item => {
      if (item?.kind !== 'ribbons') return;
      const geometry = item.mesh?.geometry;
      const colorAttribute = geometry?.getAttribute?.('aColor');
      if (!geometry || !colorAttribute) return;
      geometry.userData = geometry.userData || {};
      if (!geometry.userData.eclipseOriginalColors) {
        geometry.userData.eclipseOriginalColors = new Float32Array(colorAttribute.array);
      }
    });
  }

  function repairRibbonMesh(mesh) {
    if (!state.colorsReady || !state.THREE) return;
    const geometry = mesh?.geometry;
    const colorAttribute = geometry?.getAttribute?.('aColor');
    const alphaAttribute = geometry?.getAttribute?.('aAlpha');
    const positionAttribute = geometry?.getAttribute?.('position');
    const original = geometry?.userData?.eclipseOriginalColors;
    if (!geometry || !colorAttribute || !positionAttribute || !original) return;

    const segments = detectRibbonSegments(alphaAttribute, colorAttribute.count);
    const keys = new Float32Array(colorAttribute.count);
    const alreadyUsed = new Set();

    segments.forEach(segment => {
      const oldKey = colorKeyFromArray(original, segment.start);
      const candidates = state.oldColorCandidates.get(oldKey) || [];
      const direction = segmentDirection(positionAttribute, segment.start, segment.end);
      const meta = nearestCandidate(candidates, direction, alreadyUsed)
        || fallbackNearestSelected(direction, alreadyUsed);
      if (!meta) return;

      alreadyUsed.add(meta.id);
      const vivid = vividColor(meta);
      for (let vertex = segment.start; vertex < segment.end; vertex += 1) {
        keys[vertex] = meta._hoverKey;
        if (vivid) colorAttribute.setXYZ(vertex, vivid.r, vivid.g, vivid.b);
      }
    });

    geometry.setAttribute('aEclipseKey', new state.THREE.Float32BufferAttribute(keys, 1));
    colorAttribute.needsUpdate = true;
    geometry.getAttribute('aEclipseKey').needsUpdate = true;
  }

  function repairCustomItems(items = state.lastCustomItems) {
    if (!state.colorsReady) return;
    (items || []).forEach(item => {
      if (item?.kind === 'ribbons') repairRibbonMesh(item.mesh);
    });
  }

  function buildColorCandidateMap() {
    if (!state.ready || !state.THREE) return;
    state.oldColorCandidates.clear();
    state.catalog.forEach((meta, index) => {
      meta._hoverKey = index + 1;
      const color = new state.THREE.Color(oldBandStyle(meta));
      const key = colorKeyFromColor(color);
      if (!state.oldColorCandidates.has(key)) state.oldColorCandidates.set(key, []);
      state.oldColorCandidates.get(key).push(meta);
    });
    state.colorsReady = true;
    repairCustomItems();
  }

  function wrapGlobeFactory() {
    const previousGlobe = window.Globe;
    if (typeof previousGlobe !== 'function' || previousGlobe.__selectionListWrapped) return;

    function wrappedGlobe(...factoryArgs) {
      const mount = previousGlobe(...factoryArgs);
      return function wrappedMount(...mountArgs) {
        const instance = mount(...mountArgs);
        state.globe = instance;
        window.eclipseGlobeInstance = instance;

        if (!instance.__eclipseIdentityRepairWrapped) {
          instance.__eclipseIdentityRepairWrapped = true;
          const previousCustomLayerData = instance.customLayerData.bind(instance);
          instance.customLayerData = function repairedCustomLayerData(value) {
            if (arguments.length === 0) return previousCustomLayerData();
            const items = Array.isArray(value) ? value : [];
            state.lastCustomItems = items;
            captureOriginalRibbonColors(items);
            const result = previousCustomLayerData(value);
            queueMicrotask(() => repairCustomItems(items));
            setTimeout(() => repairCustomItems(items), 0);
            return result;
          };
        }

        return instance;
      };
    }

    try { Object.assign(wrappedGlobe, previousGlobe); } catch {}
    wrappedGlobe.__selectionListWrapped = true;
    window.Globe = wrappedGlobe;
  }

  function renderSelection() {
    const list = document.getElementById('visibleEclipsesList');
    const count = document.getElementById('visibleEclipsesCount');
    if (!list || !count || !state.ready) return;

    const selected = state.catalog
      .filter(meta => state.selectedIds.has(meta.id))
      .slice()
      .sort(chronologicalCompare);

    count.textContent = selected.length.toLocaleString('fr-FR');

    if (!selected.length) {
      list.innerHTML = '<div class="visible-empty">Aucune éclipse affichée.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    selected.forEach(meta => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `visible-eclipse-btn${state.focusedId === meta.id ? ' is-focused' : ''}`;
      button.dataset.eclipseId = meta.id;
      button.title = `Centrer la vue sur l’éclipse du ${formatDate(meta)}`;

      const dot = document.createElement('span');
      dot.className = 'visible-dot';
      dot.style.background = bandColorCss(meta);

      const date = document.createElement('span');
      date.className = 'visible-date';
      date.textContent = formatDate(meta);

      const metaText = document.createElement('span');
      metaText.className = 'visible-meta';
      metaText.textContent = `Saros ${meta.saros ?? '—'}`;

      button.append(dot, date, metaText);
      fragment.appendChild(button);
    });

    list.replaceChildren(fragment);
  }

  function focusMeta(meta) {
    if (!meta || !Array.isArray(meta.focus) || meta.focus.length < 2) return;
    const lat = Number(meta.focus[0]);
    const lng = Number(meta.focus[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const globe = state.globe || window.eclipseGlobeInstance;
    if (!globe?.pointOfView) return;

    state.focusedId = meta.id;
    globe.pointOfView({ lat, lng, altitude: 1.28 }, 900);
    renderSelection();
  }

  function selectAll() {
    if (!state.ready) return;
    state.selectedIds = new Set(state.catalog.map(meta => meta.id));
    renderSelection();
  }

  function selectNone() {
    state.selectedIds.clear();
    state.focusedId = null;
    renderSelection();
  }

  function selectContinent(continent) {
    if (!state.ready || !continent) return;
    state.selectedIds = new Set(
      state.catalog.filter(meta => meta.continent === continent).map(meta => meta.id)
    );
    state.focusedId = null;
    renderSelection();
  }

  function selectCentury(key) {
    if (!state.ready || !key) return;
    state.selectedIds = new Set(
      state.catalog.filter(meta => centuryKey(Number(meta.year)) === key).map(meta => meta.id)
    );
    state.focusedId = null;
    renderSelection();
  }

  function selectionChanged() {
    renderSelection();
    setTimeout(() => repairCustomItems(), 0);
  }

  function installSelectionMirrors() {
    const catalogList = document.getElementById('catalogList');
    const showAll = document.getElementById('showAllBtn');
    const clearAll = document.getElementById('clearAllBtn');
    const showContinent = document.getElementById('showContinentBtn');
    const continentSelect = document.getElementById('continentSelect');
    const visibleList = document.getElementById('visibleEclipsesList');

    catalogList?.addEventListener('change', event => {
      const input = event.target.closest('input[data-eclipse-id]');
      if (!input) return;
      if (input.checked) state.selectedIds.add(input.value);
      else state.selectedIds.delete(input.value);
      if (!state.selectedIds.has(state.focusedId)) state.focusedId = null;
      selectionChanged();
    });

    showAll?.addEventListener('click', () => {
      selectAll();
      selectionChanged();
    });
    clearAll?.addEventListener('click', () => {
      selectNone();
      selectionChanged();
    });
    showContinent?.addEventListener('click', () => {
      selectContinent(continentSelect?.value);
      selectionChanged();
    });

    catalogList?.addEventListener('click', event => {
      const continentButton = event.target.closest('.continent-show-btn');
      if (continentButton) {
        selectContinent(continentButton.dataset.continent);
        selectionChanged();
        return;
      }
      const centuryButton = event.target.closest('.century-show-btn');
      if (centuryButton) {
        selectCentury(centuryButton.dataset.century);
        selectionChanged();
      }
    });

    visibleList?.addEventListener('click', event => {
      const button = event.target.closest('.visible-eclipse-btn');
      if (!button) return;
      focusMeta(state.byId.get(button.dataset.eclipseId));
    });
  }

  async function initializeData() {
    try {
      const [catalogResponse, THREE] = await Promise.all([
        fetch(CATALOG_URL, { cache: 'no-store' }),
        import(THREE_URL)
      ]);
      if (!catalogResponse.ok) throw new Error(`HTTP ${catalogResponse.status}`);
      const data = await catalogResponse.json();
      if (!Array.isArray(data.eclipses)) throw new Error('Catalogue invalide');

      state.THREE = THREE;
      state.catalog = data.eclipses;
      state.catalog.forEach((meta, index) => { meta._hoverKey = index + 1; });
      state.byId = new Map(state.catalog.map(meta => [meta.id, meta]));
      state.ready = true;

      const defaultMeta = state.catalog.find(meta => meta.nasaId === '20270802')
        || state.catalog.find(meta => meta.nasaId === '20260812')
        || state.catalog[state.catalog.length - 1];
      if (defaultMeta && !state.selectedIds.size) state.selectedIds.add(defaultMeta.id);

      buildColorCandidateMap();
      renderSelection();
    } catch (error) {
      console.warn('Liste/réparation des éclipses indisponible :', error);
      const list = document.getElementById('visibleEclipsesList');
      if (list) list.innerHTML = '<div class="visible-empty">Impossible de charger la liste.</div>';
    }
  }

  installScrollFix();
  wrapGlobeFactory();
  installSelectionMirrors();
  initializeData();
})();