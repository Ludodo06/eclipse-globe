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
    Monde: '<circle cx="50" cy="46" r="30"/><path d="M20 46h60M50 16c-12 10-18 20-18 30s6 20 18 30M50 16c12 10 18 20 18 30s-6 20-18 30M27 29c7 5 15 7 23 7s16-2 23-7M27 63c7-5 15-7 23-7s16 2 23 7"/>',
    Europe: '<path d="M26 29l10-9 12 4 7-5 10 7 10 1 5 9-8 6 2 8-10 3-5 10-11-4-7 7-9-5 2-9-8-5 7-7-1-8z"/>',
    Afrique: '<path d="M31 20l17-7 20 8 9 15-7 12-6 20-13 16-9-8-5-17-11-12-7-14 12-13z"/>',
    Asie: '<path d="M17 27l15-14 18 5 13-8 19 9-4 11 12 8-9 8 3 10-15 3-11 11-11-8-13 7-8-10-14-5 6-12-9-7z"/>',
    'Amérique du Nord': '<path d="M17 24l13-12 19 4 8 9 13-2 12 11-8 8 3 10-12 2-8 12-10-8-8 4-7-10-10-4 3-10-8-14z"/>',
    'Amérique du Sud': '<path d="M35 13l20 4 11 12-5 11 3 10-8 8-4 16-10 13-6-14 2-12-8-9 4-10-8-8 9-8z"/>',
    Océanie: '<path d="M20 38l12-9 13 5 4 10-9 7-13-2-7-11zM58 47l11-7 11 5-2 9-12 4-8-11zM72 65l5-3 5 4-4 6-6-7z"/>',
    Antarctique: '<path d="M14 57l12-8 12 4 11-7 10 5 13-6 14 9-9 11-14-2-11 7-14-5-13 7-12-8-9 2 10-9z"/>'
  };

  const state = {
    catalog: [],
    region: null,
    century: null,
    query: '',
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

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  }

  function chronological(a, b) {
    return (a.year - b.year) || (a.month - b.month) || (a.day - b.day) || String(a.id).localeCompare(String(b.id));
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
      #selectionPanel .panel-pad { position:sticky; top:0; z-index:4; background:rgba(7,12,20,.97); border-bottom:1px solid rgba(255,255,255,.07); }
      #catalogPanel.shop-selector { display:block !important; overflow:visible !important; min-height:0 !important; padding:12px; border-top:0; }
      #legacyCatalogBridge { display:none !important; }
      .shop-step { margin-bottom:16px; }
      .shop-step-head { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; margin-bottom:8px; }
      .shop-step-title { margin:0; color:#eef3fa; font-size:12px; font-weight:800; }
      .shop-step-title b { display:inline-grid; place-items:center; width:20px; height:20px; margin-right:7px; border-radius:50%; background:rgba(255,255,255,.1); font-size:10px; }
      .shop-step-meta { color:#8193a8; font-size:9px; white-space:nowrap; }
      .region-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
      .region-card { position:relative; aspect-ratio:1/1; padding:8px; display:flex; flex-direction:column; align-items:stretch; justify-content:space-between; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.1); border-radius:12px; color:#eaf0f8; text-align:left; }
      .region-card:hover { background:rgba(255,255,255,.07); }
      .region-card.is-active { background:rgba(255,255,255,.11); border-color:rgba(255,255,255,.45); }
      .region-card svg { width:100%; height:auto; max-height:76px; color:#fff; fill:none; stroke:currentColor; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; vector-effect:non-scaling-stroke; }
      .region-name { display:block; font-size:10px; font-weight:800; line-height:1.15; }
      .region-count { display:block; margin-top:2px; color:#8294a9; font-size:8.5px; }
      .century-grid { display:flex; flex-wrap:wrap; gap:6px; }
      .century-chip { padding:7px 9px; border-radius:999px; background:rgba(255,255,255,.04); color:#cdd7e4; font-size:9px; }
      .century-chip.is-active { background:#e8eef7; color:#09111d; border-color:#fff; }
      .century-chip small { margin-left:4px; opacity:.62; }
      .shop-current { display:flex; flex-wrap:wrap; align-items:center; gap:5px; margin:2px 0 10px; color:#8fa0b4; font-size:9px; }
      .shop-current strong { color:#eaf0f8; }
      .shop-search { margin-bottom:8px; }
      .shop-search input { width:100%; }
      .shop-results { display:grid; gap:6px; }
      .shop-empty { padding:14px 10px; border:1px dashed rgba(255,255,255,.12); border-radius:10px; color:#8294a9; font-size:10px; text-align:center; }
      .shop-lock { padding:12px; border:1px solid rgba(255,255,255,.08); border-radius:10px; color:#8193a8; font-size:10px; background:rgba(255,255,255,.025); }
      .shop-selector .eclipse-option { background:rgba(255,255,255,.04); }
      .shop-selector .eclipse-option:has(input:checked) { background:rgba(255,255,255,.105); border-color:rgba(255,255,255,.2); }
      .shop-selector .eclipse-option-text small { white-space:normal; line-height:1.35; }
      .shop-summary { margin-top:10px; padding:9px 10px; border-radius:9px; background:rgba(255,255,255,.035); color:#8294a9; font-size:9px; line-height:1.4; }
      @media (max-width:520px) { .region-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .region-card svg { max-height:92px; } }
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
        <section class="shop-step">
          <div class="shop-step-head"><h3 class="shop-step-title"><b>1</b>Choisir une zone</h3><span id="shopCatalogCount" class="shop-step-meta">Chargement…</span></div>
          <div id="regionGrid" class="region-grid"></div>
        </section>
        <section id="centuryStep" class="shop-step" hidden>
          <div class="shop-step-head"><h3 class="shop-step-title"><b>2</b>Choisir un siècle</h3><span id="centuryMeta" class="shop-step-meta"></span></div>
          <div id="centuryGrid" class="century-grid"></div>
        </section>
        <section id="eclipseStep" class="shop-step" hidden>
          <div class="shop-step-head"><h3 class="shop-step-title"><b>3</b>Choisir les éclipses</h3><span id="resultMeta" class="shop-step-meta"></span></div>
          <div id="shopCurrent" class="shop-current"></div>
          <div class="shop-search"><input id="shopSearch" type="search" placeholder="Filtrer cette liste : année, Saros…" /></div>
          <div id="catalogListVisible" class="shop-results"></div>
          <div id="shopSummary" class="shop-summary"></div>
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
      button.className = `region-card${state.region === region.key ? ' is-active' : ''}`;
      button.dataset.region = region.key;
      button.setAttribute('aria-pressed', state.region === region.key ? 'true' : 'false');
      button.innerHTML = `
        <svg viewBox="0 0 100 92" aria-hidden="true">${REGION_ICONS[region.key]}</svg>
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

  function renderCenturies() {
    const step = document.getElementById('centuryStep');
    const grid = document.getElementById('centuryGrid');
    const meta = document.getElementById('centuryMeta');
    if (!step || !grid || !meta) return;
    step.hidden = !state.region;
    if (!state.region) return;

    const centuries = availableCenturies();
    meta.textContent = `${centuries.length} siècle${centuries.length > 1 ? 's' : ''}`;
    const fragment = document.createDocumentFragment();

    const all = document.createElement('button');
    all.type = 'button';
    all.className = `century-chip${state.century === 'all' ? ' is-active' : ''}`;
    all.dataset.century = 'all';
    all.innerHTML = `Tout <small>${regionCatalog().length.toLocaleString('fr-FR')}</small>`;
    fragment.appendChild(all);

    centuries.forEach(century => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `century-chip${state.century === century.key ? ' is-active' : ''}`;
      button.dataset.century = century.key;
      button.innerHTML = `${century.label} <small>${century.count.toLocaleString('fr-FR')}</small>`;
      fragment.appendChild(button);
    });
    grid.replaceChildren(fragment);
  }

  function scopedCatalog() {
    let result = regionCatalog();
    if (state.century && state.century !== 'all') result = result.filter(e => e.centuryKey === state.century);
    const query = normalize(state.query);
    if (query) {
      result = result.filter(e => normalize(`${e.displayDate} ${e.year} ${e.saros} ${e.catalogNumber}`).includes(query));
    }
    return result.slice().sort(chronological);
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

  function renderEclipses() {
    const step = document.getElementById('eclipseStep');
    const list = document.getElementById('catalogListVisible');
    const meta = document.getElementById('resultMeta');
    const current = document.getElementById('shopCurrent');
    const summary = document.getElementById('shopSummary');
    const waiting = document.getElementById('shopWaiting');
    if (!step || !list || !meta || !current || !summary || !waiting) return;

    waiting.hidden = state.ready && state.appReady;
    step.hidden = !state.region || !state.century;
    if (step.hidden) return;

    const result = scopedCatalog();
    const centuryLabel = state.century === 'all'
      ? 'Tous les siècles'
      : (result[0]?.centuryLabel || availableCenturies().find(c => c.key === state.century)?.label || 'Siècle');
    current.innerHTML = `<strong>${state.region}</strong><span>›</span><strong>${centuryLabel}</strong>`;
    meta.textContent = `${result.length.toLocaleString('fr-FR')} résultat${result.length > 1 ? 's' : ''}`;

    if (!result.length) {
      list.innerHTML = '<div class="shop-empty">Aucune éclipse ne correspond à ce filtre.</div>';
    } else {
      const fragment = document.createDocumentFragment();
      result.forEach(e => fragment.appendChild(makeRow(e)));
      list.replaceChildren(fragment);
    }
    summary.textContent = `${state.selectedIds.size.toLocaleString('fr-FR')} éclipse${state.selectedIds.size > 1 ? 's' : ''} actuellement affichée${state.selectedIds.size > 1 ? 's' : ''} sur le globe. Ta sélection reste conservée quand tu changes de zone ou de siècle.`;
  }

  function renderAll() {
    if (!state.ready) return;
    const count = document.getElementById('shopCatalogCount');
    if (count) count.textContent = `${state.catalog.length.toLocaleString('fr-FR')} totales`;
    renderRegions();
    renderCenturies();
    renderEclipses();
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

  function installInteractions() {
    document.addEventListener('click', event => {
      const region = event.target.closest?.('.region-card[data-region]');
      if (region && document.getElementById('shopSelector')?.contains(region)) {
        state.region = region.dataset.region;
        state.century = null;
        state.query = '';
        const search = document.getElementById('shopSearch');
        if (search) search.value = '';
        renderAll();
        document.getElementById('centuryStep')?.scrollIntoView?.({ block:'nearest', behavior:'smooth' });
        return;
      }

      const century = event.target.closest?.('.century-chip[data-century]');
      if (century && document.getElementById('shopSelector')?.contains(century)) {
        state.century = century.dataset.century;
        state.query = '';
        const search = document.getElementById('shopSearch');
        if (search) search.value = '';
        renderAll();
        document.getElementById('eclipseStep')?.scrollIntoView?.({ block:'nearest', behavior:'smooth' });
      }
    });

    document.addEventListener('input', event => {
      if (event.target?.id !== 'shopSearch') return;
      state.query = event.target.value;
      renderEclipses();
    });

    document.addEventListener('change', event => {
      const input = event.target.closest?.('input[data-shop-eclipse-id]');
      if (!input) return;
      const id = input.dataset.shopEclipseId;
      if (input.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      bridgeSelection(id, input.checked);
      renderEclipses();
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
