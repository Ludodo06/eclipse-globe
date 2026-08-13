(() => {
  const CATALOG_URL = './data/nasa-total-eclipses.json?v=15';
  const MONTH_NAMES = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  const state = {
    globe: null,
    catalog: [],
    byId: new Map(),
    selectedIds: new Set(),
    ready: false,
    focusedId: null
  };

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function bandColor(meta) {
    if (meta.nasaId === '20260812') return '#b45cff';
    if (meta.nasaId === '20270802') return '#ff7a1a';
    const n = meta.catalogNumber || hashString(meta.id || meta.nasaId || 'eclipse');
    const hue = (n * 137.50776405) % 360;
    const lightness = [56, 62, 68][n % 3];
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

  function wrapGlobeFactory() {
    const previousGlobe = window.Globe;
    if (typeof previousGlobe !== 'function' || previousGlobe.__selectionListWrapped) return;

    function wrappedGlobe(...factoryArgs) {
      const mount = previousGlobe(...factoryArgs);
      return function wrappedMount(...mountArgs) {
        const instance = mount(...mountArgs);
        state.globe = instance;
        window.eclipseGlobeInstance = instance;
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
      dot.style.background = bandColor(meta);

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
      renderSelection();
    });

    showAll?.addEventListener('click', selectAll);
    clearAll?.addEventListener('click', selectNone);
    showContinent?.addEventListener('click', () => selectContinent(continentSelect?.value));

    catalogList?.addEventListener('click', event => {
      const continentButton = event.target.closest('.continent-show-btn');
      if (continentButton) {
        selectContinent(continentButton.dataset.continent);
        return;
      }
      const centuryButton = event.target.closest('.century-show-btn');
      if (centuryButton) selectCentury(centuryButton.dataset.century);
    });

    visibleList?.addEventListener('click', event => {
      const button = event.target.closest('.visible-eclipse-btn');
      if (!button) return;
      focusMeta(state.byId.get(button.dataset.eclipseId));
    });
  }

  async function loadCatalog() {
    try {
      const response = await fetch(CATALOG_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.eclipses)) throw new Error('Catalogue invalide');

      state.catalog = data.eclipses;
      state.byId = new Map(state.catalog.map(meta => [meta.id, meta]));
      state.ready = true;

      const defaultMeta = state.catalog.find(meta => meta.nasaId === '20270802')
        || state.catalog.find(meta => meta.nasaId === '20260812')
        || state.catalog[state.catalog.length - 1];
      if (defaultMeta && !state.selectedIds.size) state.selectedIds.add(defaultMeta.id);
      renderSelection();
    } catch (error) {
      console.warn('Liste des éclipses affichées indisponible :', error);
      const list = document.getElementById('visibleEclipsesList');
      if (list) list.innerHTML = '<div class="visible-empty">Impossible de charger la liste.</div>';
    }
  }

  wrapGlobeFactory();
  installSelectionMirrors();
  loadCatalog();
})();