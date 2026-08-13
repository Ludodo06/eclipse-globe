(() => {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.161.0/+esm';
  const version = (() => {
    try { return new URL(document.currentScript?.src || location.href).searchParams.get('v') || Date.now(); }
    catch { return Date.now(); }
  })();
  const CATALOG_URL = `./data/nasa-total-eclipses.json?v=${version}`;
  const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const SPECIAL_COLORS = {
    '20260812': '#b45cff',
    '20270802': '#ff7a1a'
  };

  const state = {
    THREE: null,
    globe: null,
    canvas: null,
    raycaster: null,
    mouse: null,
    metaByHoverKey: new Map(),
    tooltip: null,
    activeId: null,
    lastRaycastAt: 0,
    visible: false
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatYear(year) {
    return Number(year) > 0 ? String(year) : `${1 - Number(year)} av. J.-C.`;
  }

  function formatDate(meta) {
    return `${meta.day} ${MONTHS[Number(meta.month) - 1]} ${formatYear(meta.year)}`;
  }

  function formatNumber(value, digits = 4) {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString('fr-FR', { maximumFractionDigits: digits })
      : 'n/d';
  }

  function formatWidth(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${formatNumber(number, 1)} km` : 'n/d';
  }

  function formatDuration(value) {
    if (!value) return 'n/d';
    const raw = String(value);
    const compact = raw.match(/^(\d+)m(\d+)s$/i);
    if (compact) return `${Number(compact[1])} min ${Number(compact[2])} s`;
    return raw;
  }

  function formatCoords(focus) {
    if (!Array.isArray(focus) || focus.length < 2) return 'n/d';
    const lat = Number(focus[0]);
    const lng = Number(focus[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'n/d';
    const latText = `${Math.abs(lat).toLocaleString('fr-FR', { maximumFractionDigits:1 })}° ${lat >= 0 ? 'N' : 'S'}`;
    const lngText = `${Math.abs(lng).toLocaleString('fr-FR', { maximumFractionDigits:1 })}° ${lng >= 0 ? 'E' : 'O'}`;
    return `${latText}, ${lngText}`;
  }

  function colorCss(meta) {
    if (SPECIAL_COLORS[meta.nasaId]) return SPECIAL_COLORS[meta.nasaId];
    const n = Number(meta.catalogNumber) || 1;
    const hue = (n * 137.50776405) % 360;
    const lightness = [56, 62, 68][Math.abs(n) % 3];
    return `hsl(${hue.toFixed(1)} 96% ${lightness}%)`;
  }

  function installTooltip() {
    if (state.tooltip) return state.tooltip;

    const style = document.createElement('style');
    style.id = 'eclipseHoverTooltipStyles';
    style.textContent = `
      #eclipseInfoCard { display:none !important; }
      #eclipseHoverTooltip {
        position:fixed;
        z-index:40;
        left:0;
        top:0;
        width:min(286px,calc(100vw - 20px));
        padding:10px 11px;
        border:1px solid rgba(255,255,255,.16);
        border-radius:11px;
        background:rgba(5,10,17,.96);
        box-shadow:0 14px 40px rgba(0,0,0,.46);
        backdrop-filter:blur(14px);
        color:#eef3fa;
        pointer-events:none;
        opacity:0;
        visibility:hidden;
        transition:opacity .08s ease,visibility .08s ease;
      }
      #eclipseHoverTooltip.is-visible { opacity:1; visibility:visible; }
      .hover-eclipse-head { display:grid; grid-template-columns:10px minmax(0,1fr); align-items:center; gap:8px; }
      .hover-eclipse-dot { width:9px; height:9px; border-radius:50%; box-shadow:0 0 0 1px rgba(255,255,255,.35); }
      .hover-eclipse-title { font-size:12px; font-weight:820; line-height:1.2; }
      .hover-eclipse-sub { margin:4px 0 8px 18px; color:#8798ad; font-size:8.5px; }
      .hover-eclipse-grid { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 10px; }
      .hover-eclipse-grid span:nth-child(odd) { color:#7f91a7; font-size:9px; }
      .hover-eclipse-grid span:nth-child(even) { color:#f1f5fa; font-size:9px; font-weight:680; text-align:right; }
      @media (max-width:980px) {
        #eclipseHoverTooltip { width:min(270px,calc(100vw - 20px)); }
      }
    `;
    document.head.appendChild(style);

    const tooltip = document.createElement('div');
    tooltip.id = 'eclipseHoverTooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);
    state.tooltip = tooltip;
    return tooltip;
  }

  function moveTooltip(clientX, clientY) {
    const tooltip = state.tooltip;
    if (!tooltip) return;
    const gap = 16;
    const margin = 8;
    const rect = tooltip.getBoundingClientRect();
    let left = clientX + gap;
    let top = clientY + gap;

    if (left + rect.width > window.innerWidth - margin) left = clientX - rect.width - gap;
    if (top + rect.height > window.innerHeight - margin) top = clientY - rect.height - gap;

    left = clamp(left, margin, Math.max(margin, window.innerWidth - rect.width - margin));
    top = clamp(top, margin, Math.max(margin, window.innerHeight - rect.height - margin));
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function renderTooltip(meta, clientX, clientY) {
    const tooltip = installTooltip();
    if (state.activeId !== meta.id) {
      state.activeId = meta.id;
      tooltip.innerHTML = `
        <div class="hover-eclipse-head">
          <span class="hover-eclipse-dot" style="background:${colorCss(meta)}"></span>
          <div class="hover-eclipse-title">${escapeHtml(formatDate(meta))}</div>
        </div>
        <div class="hover-eclipse-sub">Éclipse solaire totale · NASA ${escapeHtml(meta.typeCode || 'T')}</div>
        <div class="hover-eclipse-grid">
          <span>Saros</span><span>${escapeHtml(meta.saros ?? 'n/d')}</span>
          <span>Magnitude</span><span>${escapeHtml(formatNumber(meta.magnitude, 4))}</span>
          <span>Largeur max.</span><span>${escapeHtml(formatWidth(meta.maxPathWidthKm))}</span>
          <span>Durée max.</span><span>${escapeHtml(formatDuration(meta.maxDuration))}</span>
          <span>Continent</span><span>${escapeHtml(meta.continent || 'n/d')}</span>
          <span>Maximum</span><span>${escapeHtml(formatCoords(meta.focus))}</span>
          <span>Gamma</span><span>${escapeHtml(formatNumber(meta.gamma, 4))}</span>
          <span>Catalogue NASA</span><span>#${escapeHtml(meta.catalogNumber ?? 'n/d')}</span>
        </div>
      `;
    }
    tooltip.classList.add('is-visible');
    tooltip.setAttribute('aria-hidden', 'false');
    state.visible = true;
    moveTooltip(clientX, clientY);
  }

  function hideTooltip() {
    if (!state.tooltip) return;
    state.tooltip.classList.remove('is-visible');
    state.tooltip.setAttribute('aria-hidden', 'true');
    state.activeId = null;
    state.visible = false;
  }

  function ribbonMeshes() {
    const items = state.globe?.customLayerData?.() || [];
    return items
      .filter(item => item?.kind === 'ribbons' && item.mesh?.visible !== false)
      .map(item => item.mesh);
  }

  function frontFacing(hit) {
    if (!hit?.point || !state.globe) return false;
    const normal = hit.point.clone().normalize();
    const toCamera = state.globe.camera().position.clone().sub(hit.point).normalize();
    return normal.dot(toCamera) > 0;
  }

  function metaFromHit(hit) {
    const geometry = hit?.object?.geometry;
    const keys = geometry?.getAttribute?.('aEclipseKey');
    if (!keys) return null;

    let vertexIndex = hit.face?.a;
    if (!Number.isInteger(vertexIndex) && Number.isInteger(hit.faceIndex) && geometry.index) {
      vertexIndex = geometry.index.getX(hit.faceIndex * 3);
    }
    if (!Number.isInteger(vertexIndex)) return null;
    const hoverKey = Math.round(keys.getX(vertexIndex));
    return state.metaByHoverKey.get(hoverKey) || null;
  }

  function raycast(clientX, clientY) {
    if (!state.globe || !state.canvas || !state.raycaster || !state.mouse) return null;
    const rect = state.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    state.mouse.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    state.raycaster.setFromCamera(state.mouse, state.globe.camera());

    for (const hit of state.raycaster.intersectObjects(ribbonMeshes(), false)) {
      if (!frontFacing(hit)) continue;
      const meta = metaFromHit(hit);
      if (meta) return meta;
    }
    return null;
  }

  function hoverInterval() {
    const ribbon = (state.globe?.customLayerData?.() || []).find(item => item?.kind === 'ribbons');
    const count = ribbon?.mesh?.geometry?.index?.count || 0;
    const triangles = count / 3;
    if (triangles > 400000) return 180;
    if (triangles > 150000) return 110;
    return 45;
  }

  function attach() {
    const globe = window.eclipseGlobeInstance;
    if (!globe || globe.__pointerTooltipInstalled) return false;
    const canvas = globe.renderer?.().domElement;
    if (!canvas) return false;

    globe.__pointerTooltipInstalled = true;
    state.globe = globe;
    state.canvas = canvas;
    state.raycaster = new state.THREE.Raycaster();
    state.mouse = new state.THREE.Vector2();
    installTooltip();

    canvas.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse') return;
      if (event.buttons) {
        hideTooltip();
        return;
      }

      if (state.visible) moveTooltip(event.clientX, event.clientY);
      const now = performance.now();
      if (now - state.lastRaycastAt < hoverInterval()) return;
      state.lastRaycastAt = now;

      const meta = raycast(event.clientX, event.clientY);
      if (meta) {
        renderTooltip(meta, event.clientX, event.clientY);
        canvas.style.cursor = 'pointer';
      } else {
        hideTooltip();
        canvas.style.cursor = '';
      }
    }, { passive:true });

    canvas.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse') {
        hideTooltip();
        canvas.style.cursor = '';
      }
    }, { passive:true });

    return true;
  }

  Promise.all([
    import(THREE_URL),
    fetch(CATALOG_URL, { cache:'no-store' }).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
  ]).then(([THREE, catalog]) => {
    state.THREE = THREE;
    (catalog.eclipses || []).forEach((meta, index) => state.metaByHoverKey.set(index + 1, meta));

    if (attach()) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attach() || attempts > 160) clearInterval(timer);
    }, 50);
  }).catch(error => console.warn('Tooltip des éclipses indisponible :', error));
})();
