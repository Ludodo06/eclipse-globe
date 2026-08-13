(() => {
  const BUILD = 16;
  const CATALOG_URL = `./data/nasa-total-eclipses.json?v=${BUILD}`;
  const CONTINENTS = [
    'Europe', 'Afrique', 'Asie', 'Amérique du Nord',
    'Amérique du Sud', 'Océanie', 'Antarctique'
  ];
  const MONTHS = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
  ];

  const REGION_ICONS = {
    Monde: `
      <path d="M12 48l8-9 10-2 4-8 12-4 8 5 7-2 7 6-4 7-9 2-4 7-8-1-5 6-11-2-4-7-8-2z"/>
      <path d="M61 58l7-5 9 2 4 7-3 8-7 4-4 10-5-6 1-8-5-5 3-7z"/>
      <path d="M77 30l10-6 14 1 8 5 11-2 12 5 10-2 10 7-4 7-12 1-6 6-10-1-9 6-10-4-8 2-5-7-8-2 3-8-6-8z"/>
      <path d="M119 64l9-4 10 3 6 8-4 7-11 2-7-6-3-10zM145 82l5-3 4 4-3 5-6-6z"/>
      <path d="M18 90c24 5 100 5 126 0"/>
    `,
    Europe: `
      <path d="M29 55l5-10 10-3 1-8 9-5 7 2 6-7 9 3 7-4 9 5 12-1 6 6-4 7 7 5-6 5-8-3-5 5-7-2-5 6-6-4-4 7-8-3-5 5-6-6-8 1-3-7 5-6-7-4z"/>
      <path d="M51 67l5-3 3 6-4 6-5-3 1-6zM92 56l6 3-1 7-5 1-3-6 3-5z"/>
    `,
    Afrique: `
      <path d="M48 18l15-5 17 3 13 8 8 11-3 10-7 6-2 15-7 12-9 13-7-3-5-13-7-8-2-12-8-9-3-10 7-10 4-8z"/>
      <path d="M96 67l4 7-3 12-5 5-4-8 2-11 6-5z"/>
    `,
    Asie: `
      <path d="M13 43l9-11 14-5 7-8 14 2 9-7 11 4 10-7 16 5 11-2 10 7 13 2 11 10-4 8-9 2 3 8-10 4-3 8-12-1-7 8-9-4-7 7-10-2-7-8-9 2-5-9-9-2 2-8-10-4z"/>
      <path d="M102 66l5 4-2 9-6-3 3-10zM124 60l5 3-1 6-5-2 1-7z"/>
    `,
    'Amérique du Nord': `
      <path d="M20 25l11-9 14 2 7-6 13 5 12-2 10 7 13-1 14 10-4 9-9 3 3 9-10 5-8 12-8-2-5 8-8-5-6 5-7-8-8-1-4-10-10-4 4-8-7-7z"/>
      <path d="M84 76l5 6-3 7-5-2-2-7 5-4zM112 32l8-5 7 4-3 6-8 2-4-7z"/>
    `,
    'Amérique du Sud': `
      <path d="M49 12l15 3 11 9 7 11-3 10 5 8-4 10-7 6-3 13-8 11-7-7-1-11-6-8 2-11-7-6 3-10-7-7 6-7-2-7 6-6z"/>
    `,
    Océanie: `
      <path d="M20 49l9-9 12 2 8 8-3 10-10 4-10-5-6-10z"/>
      <path d="M65 44l11-6 13 2 9 8-3 12-11 8-14-2-7-9 2-13z"/>
      <path d="M110 68l7-5 7 4-2 8-8 3-4-10zM132 78l5-2 4 4-3 5-6-7z"/>
    `,
    Antarctique: `
      <path d="M15 60l10-7 13 3 10-7 11 4 12-8 12 6 11-5 12 7 13-3 10 8-5 9-12 2-8 7-13-4-9 6-12-4-11 5-11-6-10 3-8-7-10 1-5-8z"/>
      <path d="M27 69c18 10 69 12 101 0"/>
    `
  };

  const state = {
    catalog: [],
    region: null,
    centuries: [],
    minCenturyIndex: 0,
    maxCenturyIndex: 0,
    selectedIds: new Set(),
    ready: false,
    appReady: false
  };

  function toRoman(value) {
    const table = [[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let n = value;
    let out = '';
    table.forEach(([amount, symbol]) => {
      while (n >= amount) { out += symbol; n -= amount; }
    });
    return out;
  }

  function centuryInfo(year) {
    if (year > 0) {
      const number = Math.floor((year - 1) / 100) + 1;
      return { key:`ce-${number}`, label:number === 1 ? 'Ier siècle' : `${toRoman(number)}e siècle` };
    }
    const bceYear = 1 - year;
    const number = Math.floor((bceYear - 1) / 100) + 1;
    return { key:`bce-${number}`, label:number === 1 ? 'Ier siècle av. J.-C.' : `${toRoman(number)}e siècle av. J.-C.` };
  }

  function formatYear(year) {
    return year > 0 ? String(year) : `${1 - year} av. J.-C.`;
  }

  function formatDate(eclipse) {
    return `${eclipse.day} ${MONTHS[eclipse.month - 1]} ${formatYear(eclipse.year)}`;
  }

  function chronological(a, b) {
    return (Number(a.year) - Number(b.year))
      || (Number(a.month) - Number(b.month))
      || (Number(a.day) - Number(b.day))
      || String(a.id).localeCompare(String(b.id));
  }

  function installStyles() {
    if (document.getElementById('shoppingSelectorStyles')) return;
    const style = document.createElement('style');
    style.id = 'shoppingSelectorStyles';
    style.textContent = `
      #selectionPanel.panel-left {
        display:block !important;
        overflow-y:auto !important;
        overflow-x:hidden !important;
        min-height:0 !important;
        scrollbar-width:thin;
        overscroll-behavior:contain;
      }
      #selectionPanel .panel-pad {
        position:sticky; top:0; z-index:5;
        background:rgba(7,12,20,.97);
        border-bottom:1px solid rgba(255,255,255,.07);
      }
      #catalogPanel.shop-selector { display:block !important; overflow:visible !important; min-height:0 !important; padding:12px; border-top:0; }
      #legacyCatalogBridge { display:none !important; }
      .selector-home-head { display:flex; justify-content:space-between; align-items:end; gap:10px; margin-bottom:10px; }
      .selector-title { margin:0; color:#eef3fa; font-size:12px; font-weight:800; }
      .selector-meta { color:#8193a8; font-size:9px; white-space:nowrap; }
      .region-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
      .region-card {
        aspect-ratio:1/1; min-width:0; padding:10px;
        display:flex; flex-direction:column; justify-content:space-between;
        background:rgba(255,255,255,.032); border:1px solid rgba(255,255,255,.11);
        border-radius:12px; color:#eef4fb; text-align:left;
      }
      .region-card:hover { background:rgba(255,255,255,.065); border-color:rgba(255,255,255,.24); }
      .region-card svg {
        width:100%; height:auto; max-height:100px;
        fill:none; stroke:#fff; stroke-width:2.1; stroke-linecap:round; stroke-linejoin:round;
        vector-effect:non-scaling-stroke;
      }
      .region-name { display:block; font-size:11px; font-weight:800; line-height:1.15; }
      .region-count { display:block; margin-top:3px; color:#8495aa; font-size:8.7px; }
      .selector-detail { display:grid; gap:10px; }
      .detail-top { display:flex; align-items:center; gap:8px; }
      .back-regions { flex:0 0 auto; padding:7px 9px; font-size:10px; }
      .detail-region { min-width:0; }
      .detail-region strong { display:block; font-size:13px; color:#eef3fa; }
      .detail-region span { display:block; margin-top:2px; color:#8193a8; font-size:9px; }
      .century-range-card {
        padding:10px; border:1px solid rgba(255,255,255,.09); border-radius:11px;
        background:rgba(255,255,255,.035);
      }
      .century-range-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
      .century-range-head strong { font-size:10px; color:#dce5f0; }
      .century-reset { padding:5px 8px; font-size:9px; }
      .range-values { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:8px; }
      .range-value { padding:7px 8px; border-radius:8px; background:rgba(255,255,255,.045); }
      .range-value small { display:block; color:#7e91a7; font-size:8px; text-transform:uppercase; letter-spacing:.06em; }
      .range-value strong { display:block; margin-top:2px; color:#f0f4f9; font-size:10px; }
      .range-value:last-child { text-align:right; }
      .dual-range { position:relative; height:30px; }
      .dual-range-track { position:absolute; left:4px; right:4px; top:14px; height:3px; border-radius:999px; background:rgba(255,255,255,.13); }
      .dual-range-fill { position:absolute; top:14px; height:3px; border-radius:999px; background:#e8eef7; }
      .dual-range input[type="range"] {
        position:absolute; inset:0; width:100%; height:30px; margin:0;
        background:transparent; appearance:none; -webkit-appearance:none; pointer-events:none;
      }
      .dual-range input[type="range"]::-webkit-slider-runnable-track { height:3px; background:transparent; }
      .dual-range input[type="range"]::-webkit-slider-thumb {
        appearance:none; -webkit-appearance:none; width:16px; height:16px; margin-top:-6.5px;
        border-radius:50%; border:2px solid #09111d; background:#fff; pointer-events:auto; cursor:pointer;
      }
      .dual-range input[type="range"]::-moz-range-track { height:3px; background:transparent; }
      .dual-range input[type="range"]::-moz-range-thumb {
        width:14px; height:14px; border-radius:50%; border:2px solid #09111d; background:#fff; pointer-events:auto; cursor:pointer;
      }
      .result-toolbar {
        position:sticky; top:68px; z-index:4; display:flex; align-items:center; justify-content:space-between; gap:8px;
        padding:9px 0 7px; background:rgba(7,12,20,.97);
      }
      .result-toolbar strong { display:block; color:#dfe7f2; font-size:10px; }
      .result-toolbar span { display:block; margin-top:2px; color:#8294a9; font-size:8.7px; }
      .select-visible { flex:0 0 auto; padding:7px 9px; font-size:9px; }
      .shop-results { display:grid; gap:6px; }
      .shop-empty { padding:14px 10px; border:1px dashed rgba(255,255,255,.12); border-radius:10px; color:#8294a9; font-size:10px; text-align:center; }
      .shop-lock { padding:12px; border:1px solid rgba(255,255,255,.08); border-radius:10px; color:#8193a8; font-size:10px; background:rgba(255,255,255,.025); }
      .shop-selector .eclipse-option { background:rgba(255,255,255,.04); }
      .shop-selector .eclipse-option:has(input:checked) { background:rgba(255,255,255,.105); border-color:rgba(255,255,255,.2); }
      .shop-selector .eclipse-option-text small { white-space:normal; line-height:1.35; }
      .selection-summary { margin-top:10px; padding:9px 10px; border-radius:9px; background:rgba(255,255,255,.035); color:#8294a9; font-size:9px; line-height:1.4; }
      @media (max-width:520px) {
        .region-card { padding:9px; }
        .region-card svg { max-height:92px; }
        .result-toolbar { top:66px; }
      }
    `;
    document.head.appendChild(style);
  }

  function removeLegacyScrollStyles() {
    document.getElementById('selectionScrollFix')?.remove();
    document.getElementById('catalogGridScrollOverride')?.remove();
  }

  function guardAgainstLegacyScrollStyles() {
    removeLegacyScrollStyles();
    const observer = new MutationObserver(removeLegacyScrollStyles);
    observer.observe(document.head, { childList:true });
    setTimeout(removeLegacyScrollStyles, 0);
    setTimeout(removeLegacyScrollStyles, 100);
  }

  function buildShell() {
    const oldPanel = document.getElementById('catalogPanel');
    if (!oldPanel || document.getElementById('shopSelector')) return;

    const shop = document.createElement('section');
    shop.id = 'catalogPanel';
    shop.className = 'shop-selector';
    shop.innerHTML = `
      <div id="shopSelector">
        <section id="regionView">
          <div class="selector-home-head">
            <h3 class="selector-title">Choisir une zone</h3>
            <span id="shopCatalogCount" class="selector-meta">Chargement…</span>
          </div>
          <div id="regionGrid" class="region-grid"></div>
        </section>

        <section id="eclipseView" class="selector-detail" hidden>
          <div class="detail-top">
            <button id="backToRegions" class="back-regions" type="button">← Continents</button>
            <div class="detail-region"><strong id="detailRegionName"></strong><span id="detailRegionMeta"></span></div>
          </div>

          <div class="century-range-card">
            <div class="century-range-head"><strong>Période</strong><button id="resetCenturyRange" class="century-reset" type="button">Tout</button></div>
            <div class="range-values">
              <div class="range-value"><small>Siècle min.</small><strong id="minCenturyLabel">—</strong></div>
              <div class="range-value"><small>Siècle max.</small><strong id="maxCenturyLabel">—</strong></div>
            </div>
            <div class="dual-range">
              <div class="dual-range-track"></div>
              <div id="centuryRangeFill" class="dual-range-fill"></div>
              <input id="minCenturyRange" type="range" min="0" max="0" value="0" step="1" aria-label="Siècle minimum" />
              <input id="maxCenturyRange" type="range" min="0" max="0" value="0" step="1" aria-label="Siècle maximum" />
            </div>
          </div>

          <div class="result-toolbar">
            <div><strong>Éclipses</strong><span id="resultMeta">0 résultat</span></div>
            <button id="selectVisibleBtn" class="select-visible" type="button">Tout sélectionner</button>
          </div>
          <div id="catalogListVisible" class="shop-results"></div>
          <div id="selectionSummary" class="selection-summary"></div>
        </section>

        <div id="shopWaiting" class="shop-lock">Préparation du catalogue NASA…</div>
      </div>
    `;
    oldPanel.replaceWith(shop);

    const bridge = document.createElement('div');
    bridge.id = 'legacyCatalogBridge';
    bridge.setAttribute('aria-hidden', 'true');
    bridge.innerHTML = `
      <small id="catalogCount">Chargement du catalogue…</small>
      <select id="catalogMode"><option value="chrono">chrono</option><option value="century">century</option><option value="continent">continent</option></select>
      <input id="catalogSearch" type="search" />
      <button id="showAllBtn" type="button">all</button>
      <button id="clearAllBtn" type="button">clear</button>
      <select id="continentSelect"></select>
      <button id="showContinentBtn" type="button">continent</button>
      <div id="catalogList"></div>
      <button id="loadMoreBtn" type="button">more</button>
      <p id="catalogHint"></p>
    `;
    document.body.appendChild(bridge);
  }

  function regionItems() {
    return [{ key:'Monde', label:'Monde' }, ...CONTINENTS.map(name => ({ key:name, label:name }))];
  }

  function regionCatalog(region = state.region) {
    if (!region || region === 'Monde') return state.catalog;
    return state.catalog.filter(e => e.continent === region);
  }

  function regionCount(region) {
    return region === 'Monde' ? state.catalog.length : state.catalog.filter(e => e.continent === region).length;
  }

  function renderRegions() {
    const grid = document.getElementById('regionGrid');
    if (!grid || !state.ready) return;
    const fragment = document.createDocumentFragment();
    regionItems().forEach(region => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'region-card';
      button.dataset.region = region.key;
      button.innerHTML = `
        <svg viewBox="0 0 160 100" aria-hidden="true">${REGION_ICONS[region.key]}</svg>
        <span><span class="region-name">${region.label}</span><span class="region-count">${regionCount(region.key).toLocaleString('fr-FR')} éclipses</span></span>
      `;
      fragment.appendChild(button);
    });
    grid.replaceChildren(fragment);
  }

  function availableCenturies() {
    const groups = new Map();
    regionCatalog().forEach(e => {
      if (!groups.has(e.centuryKey)) groups.set(e.centuryKey, { key:e.centuryKey, label:e.centuryLabel, count:0, first:e });
      groups.get(e.centuryKey).count += 1;
    });
    return [...groups.values()].sort((a,b) => chronological(a.first,b.first));
  }

  function resetCenturyRange() {
    state.centuries = availableCenturies();
    state.minCenturyIndex = 0;
    state.maxCenturyIndex = Math.max(0, state.centuries.length - 1);
  }

  function currentCenturyKeys() {
    if (!state.centuries.length) return new Set();
    return new Set(
      state.centuries
        .slice(state.minCenturyIndex, state.maxCenturyIndex + 1)
        .map(century => century.key)
    );
  }

  function scopedCatalog() {
    const allowed = currentCenturyKeys();
    return regionCatalog()
      .filter(e => allowed.has(e.centuryKey))
      .slice()
      .sort(chronological);
  }

  function colorFor(eclipse) {
    const n = Number(eclipse.catalogNumber) || 1;
    const hue = (n * 137.50776405) % 360;
    return `hsl(${hue.toFixed(1)} 92% 62%)`;
  }

  function makeRow(eclipse) {
    const label = document.createElement('label');
    label.className = 'eclipse-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.shopEclipseId = eclipse.id;
    input.checked = state.selectedIds.has(eclipse.id);
    input.disabled = !state.appReady;

    const swatch = document.createElement('span');
    swatch.className = 'eclipse-swatch';
    swatch.style.background = colorFor(eclipse);

    const text = document.createElement('span');
    text.className = 'eclipse-option-text';
    text.innerHTML = `<strong>${eclipse.displayDate}</strong><small>Saros ${eclipse.saros} · ${eclipse.maxPathWidthKm ?? '—'} km · ${eclipse.maxDuration ?? 'durée n/d'}</small>`;
    label.append(input, swatch, text);
    return label;
  }

  function updateRangeUi() {
    const minInput = document.getElementById('minCenturyRange');
    const maxInput = document.getElementById('maxCenturyRange');
    const minLabel = document.getElementById('minCenturyLabel');
    const maxLabel = document.getElementById('maxCenturyLabel');
    const fill = document.getElementById('centuryRangeFill');
    const maxIndex = Math.max(0, state.centuries.length - 1);
    if (!minInput || !maxInput || !minLabel || !maxLabel || !fill) return;

    minInput.max = String(maxIndex);
    maxInput.max = String(maxIndex);
    minInput.value = String(state.minCenturyIndex);
    maxInput.value = String(state.maxCenturyIndex);
    minInput.disabled = maxIndex === 0;
    maxInput.disabled = maxIndex === 0;

    minLabel.textContent = state.centuries[state.minCenturyIndex]?.label || '—';
    maxLabel.textContent = state.centuries[state.maxCenturyIndex]?.label || '—';

    const left = maxIndex ? (state.minCenturyIndex / maxIndex) * 100 : 0;
    const right = maxIndex ? (state.maxCenturyIndex / maxIndex) * 100 : 100;
    fill.style.left = `${left}%`;
    fill.style.width = `${Math.max(0, right - left)}%`;
  }

  function renderDetail() {
    const regionView = document.getElementById('regionView');
    const eclipseView = document.getElementById('eclipseView');
    const waiting = document.getElementById('shopWaiting');
    const regionName = document.getElementById('detailRegionName');
    const regionMeta = document.getElementById('detailRegionMeta');
    const list = document.getElementById('catalogListVisible');
    const resultMeta = document.getElementById('resultMeta');
    const selectVisible = document.getElementById('selectVisibleBtn');
    const summary = document.getElementById('selectionSummary');
    if (!regionView || !eclipseView || !waiting || !regionName || !regionMeta || !list || !resultMeta || !selectVisible || !summary) return;

    waiting.hidden = state.ready && state.appReady;
    regionView.hidden = Boolean(state.region);
    eclipseView.hidden = !state.region;
    if (!state.region) return;

    regionName.textContent = state.region;
    regionMeta.textContent = `${regionCatalog().length.toLocaleString('fr-FR')} éclipses dans le catalogue`;
    updateRangeUi();

    const result = scopedCatalog();
    resultMeta.textContent = `${result.length.toLocaleString('fr-FR')} résultat${result.length > 1 ? 's' : ''}`;
    const allSelected = result.length > 0 && result.every(e => state.selectedIds.has(e.id));
    selectVisible.textContent = allSelected ? 'Tout désélectionner' : 'Tout sélectionner';
    selectVisible.disabled = !state.appReady || result.length === 0;

    if (!result.length) {
      list.innerHTML = '<div class="shop-empty">Aucune éclipse dans cette période.</div>';
    } else {
      const fragment = document.createDocumentFragment();
      result.forEach(eclipse => fragment.appendChild(makeRow(eclipse)));
      list.replaceChildren(fragment);
    }

    summary.textContent = `${state.selectedIds.size.toLocaleString('fr-FR')} éclipse${state.selectedIds.size > 1 ? 's' : ''} actuellement affichée${state.selectedIds.size > 1 ? 's' : ''} sur le globe.`;
  }

  function renderAll() {
    if (!state.ready) return;
    const count = document.getElementById('shopCatalogCount');
    if (count) count.textContent = `${state.catalog.length.toLocaleString('fr-FR')} totales`;
    renderRegions();
    renderDetail();
  }

  function bridgeSelection(id, checked) {
    const legacyList = document.getElementById('catalogList');
    if (!legacyList) return;
    let input = legacyList.querySelector(`input[data-eclipse-id="${CSS.escape(id)}"]`);
    let temporary = false;
    if (!input) {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.value = id;
      input.dataset.eclipseId = id;
      input.hidden = true;
      legacyList.appendChild(input);
      temporary = true;
    }
    input.checked = checked;
    input.dispatchEvent(new Event('change', { bubbles:true }));
    if (temporary) input.remove();
  }

  function setSelectedIds(ids, checked) {
    const result = ids.filter(Boolean);
    if (!result.length) return;

    if (checked && state.region === 'Monde' && state.minCenturyIndex === 0 && state.maxCenturyIndex === state.centuries.length - 1) {
      document.getElementById('showAllBtn')?.click();
      state.selectedIds = new Set(state.catalog.map(e => e.id));
      renderDetail();
      return;
    }

    if (checked && state.region !== 'Monde' && state.minCenturyIndex === 0 && state.maxCenturyIndex === state.centuries.length - 1) {
      const continentSelect = document.getElementById('continentSelect');
      if (continentSelect) continentSelect.value = state.region;
      document.getElementById('showContinentBtn')?.click();
      state.selectedIds = new Set(regionCatalog().map(e => e.id));
      renderDetail();
      return;
    }

    if (!checked && result.every(id => state.selectedIds.has(id)) && result.length === state.selectedIds.size) {
      document.getElementById('clearAllBtn')?.click();
      state.selectedIds.clear();
      renderDetail();
      return;
    }

    result.forEach(id => {
      if (checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      bridgeSelection(id, checked);
    });
    renderDetail();
  }

  function enterRegion(region) {
    state.region = region;
    resetCenturyRange();
    renderAll();
    document.getElementById('selectionPanel')?.scrollTo?.({ top:0, behavior:'auto' });
  }

  function leaveRegion() {
    state.region = null;
    state.centuries = [];
    renderAll();
    document.getElementById('selectionPanel')?.scrollTo?.({ top:0, behavior:'auto' });
  }

  function installInteractions() {
    document.addEventListener('click', event => {
      const shop = document.getElementById('shopSelector');
      if (!shop) return;

      const region = event.target.closest?.('.region-card[data-region]');
      if (region && shop.contains(region)) {
        enterRegion(region.dataset.region);
        return;
      }

      if (event.target.closest?.('#backToRegions')) {
        leaveRegion();
        return;
      }

      if (event.target.closest?.('#resetCenturyRange')) {
        resetCenturyRange();
        renderDetail();
        return;
      }

      if (event.target.closest?.('#selectVisibleBtn')) {
        const result = scopedCatalog();
        const allSelected = result.length > 0 && result.every(e => state.selectedIds.has(e.id));
        setSelectedIds(result.map(e => e.id), !allSelected);
      }
    });

    document.addEventListener('input', event => {
      if (event.target?.id === 'minCenturyRange') {
        const value = Number(event.target.value);
        state.minCenturyIndex = Math.min(value, state.maxCenturyIndex);
        renderDetail();
        return;
      }
      if (event.target?.id === 'maxCenturyRange') {
        const value = Number(event.target.value);
        state.maxCenturyIndex = Math.max(value, state.minCenturyIndex);
        renderDetail();
      }
    });

    document.addEventListener('change', event => {
      const input = event.target.closest?.('input[data-shop-eclipse-id]');
      if (!input) return;
      const id = input.dataset.shopEclipseId;
      if (input.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      bridgeSelection(id, input.checked);
      renderDetail();
    });
  }

  function detectAppReady() {
    const legacyCount = document.getElementById('catalogCount');
    if (!legacyCount) return;
    const check = () => {
      if (/3[\s\u202f]?173/.test(legacyCount.textContent || '')) {
        state.appReady = true;
        const defaultEclipse = state.catalog.find(e => e.nasaId === '20270802') || state.catalog.find(e => e.nasaId === '20260812');
        if (defaultEclipse && !state.selectedIds.size) state.selectedIds.add(defaultEclipse.id);
        renderAll();
        return true;
      }
      return false;
    };
    if (check()) return;
    const observer = new MutationObserver(() => { if (check()) observer.disconnect(); });
    observer.observe(legacyCount, { childList:true, subtree:true, characterData:true });
  }

  async function loadCatalog() {
    try {
      const response = await fetch(CATALOG_URL, { cache:'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      state.catalog = (data.eclipses || []).map(e => {
        const century = centuryInfo(Number(e.year));
        return { ...e, displayDate:formatDate(e), centuryKey:century.key, centuryLabel:century.label };
      }).sort(chronological);
      state.ready = true;
      renderAll();
      detectAppReady();
    } catch (error) {
      console.warn('Nouveau sélecteur indisponible :', error);
      const waiting = document.getElementById('shopWaiting');
      if (waiting) waiting.textContent = 'Impossible de charger le catalogue NASA.';
    }
  }

  installStyles();
  guardAgainstLegacyScrollStyles();
  buildShell();
  installInteractions();
  loadCatalog();
})();