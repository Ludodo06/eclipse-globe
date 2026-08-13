(() => {
  const BUILD = 13;
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
  const SPECIAL_NEW_COLORS = {
    '20260812': '#b45cff',
    '20270802': '#ff7a1a'
  };

  const state = {
    globe: null,
    THREE: null,
    catalogReady: false,
    metaById: new Map(),
    metaByHoverKey: new Map(),
    oldBandKeyToMeta: new Map(),
    lastItems: [],
    tooltip: null,
    pinned: false,
    raycaster: null,
    mouse: null,
    pointerDown: null,
    lastHoverRaycastAt: 0,
    mutationObserver: null
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function formatYear(year) {
    if (year > 0) return String(year);
    return `${1 - year} av. J.-C.`;
  }

  function formatDate(eclipse) {
    return `${eclipse.day} ${MONTH_NAMES[eclipse.month - 1]} ${formatYear(eclipse.year)}`;
  }

  function formatDuration(value) {
    if (!value) return 'n/d';
    const raw = String(value);
    const compact = raw.match(/^(\d+)m(\d+)s$/i);
    if (compact) return `${Number(compact[1])} min ${Number(compact[2])} s`;
    const verbose = raw.match(/(\d+)\s*min\s*([\d,.]+)\s*s/i);
    if (verbose) return `${Number(verbose[1])} min ${String(verbose[2]).replace('.', ',')} s`;
    return raw;
  }

  function formatWidth(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${String(value).replace('.', ',')} km` : 'n/d';
  }

  function formatNumber(value, digits = 4) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 'n/d';
    return numeric.toLocaleString('fr-FR', { maximumFractionDigits: digits });
  }

  function formatCoords(focus) {
    if (!Array.isArray(focus) || focus.length < 2) return 'n/d';
    const lat = Number(focus[0]);
    const lng = Number(focus[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'n/d';
    const latText = `${Math.abs(lat).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}° ${lat >= 0 ? 'N' : 'S'}`;
    const lngText = `${Math.abs(lng).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}° ${lng >= 0 ? 'E' : 'O'}`;
    return `${latText}, ${lngText}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function colorKeyFromColor(color) {
    return `${Math.round(clamp(color.r, 0, 1) * 255)},${Math.round(clamp(color.g, 0, 1) * 255)},${Math.round(clamp(color.b, 0, 1) * 255)}`;
  }

  function colorKeyFromAttribute(attribute, index) {
    return `${Math.round(clamp(attribute.getX(index), 0, 1) * 255)},${Math.round(clamp(attribute.getY(index), 0, 1) * 255)},${Math.round(clamp(attribute.getZ(index), 0, 1) * 255)}`;
  }

  function oldBandColor(meta) {
    const THREE = state.THREE;
    if (SPECIAL_OLD_COLORS[meta.nasaId]) return new THREE.Color(SPECIAL_OLD_COLORS[meta.nasaId]);
    const n = meta.catalogNumber || hashString(meta.id);
    const hue = (n * 137.50776405) % 360;
    const saturation = 72 + (n % 13);
    const lightness = 48 + (n % 9);
    return new THREE.Color(`hsl(${hue.toFixed(1)} ${saturation}% ${lightness}%)`);
  }

  function vividColors(meta) {
    const THREE = state.THREE;
    const n = meta.catalogNumber || hashString(meta.id);
    const hue = (n * 137.50776405) % 360;
    const band = new THREE.Color();
    const line = new THREE.Color();

    if (SPECIAL_NEW_COLORS[meta.nasaId]) {
      band.set(SPECIAL_NEW_COLORS[meta.nasaId]);
      const hsl = {};
      band.getHSL(hsl);
      line.setHSL(hsl.h, 0.98, 0.84);
    } else {
      const lightness = [0.58, 0.63, 0.68][n % 3];
      band.setHSL(hue / 360, 0.94, lightness);
      line.setHSL(hue / 360, 0.98, 0.84);
    }

    return {
      band,
      line,
      bandCss: `#${band.getHexString()}`,
      lineCss: `#${line.getHexString()}`
    };
  }

  function installStylesAndTooltip() {
    if (!document.getElementById('eclipseEnhancementsStyle')) {
      const style = document.createElement('style');
      style.id = 'eclipseEnhancementsStyle';
      style.textContent = `
        #eclipseTooltip {
          position: absolute;
          z-index: 8;
          width: min(310px, calc(100vw - 24px));
          padding: 12px;
          border-radius: 13px;
          border: 1px solid rgba(255,255,255,.18);
          background: rgba(5, 10, 18, .96);
          box-shadow: 0 16px 48px rgba(0,0,0,.42);
          backdrop-filter: blur(14px);
          color: #edf3fb;
          font: 12px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity .12s ease, visibility .12s ease;
        }
        #eclipseTooltip.is-visible { opacity: 1; visibility: visible; }
        #eclipseTooltip.is-pinned {
          left: 50% !important;
          right: auto !important;
          top: auto !important;
          bottom: max(14px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          pointer-events: auto;
        }
        #eclipseTooltip .eclipse-tip-head {
          display: grid;
          grid-template-columns: 12px minmax(0,1fr) auto;
          gap: 9px;
          align-items: center;
        }
        #eclipseTooltip .eclipse-tip-dot {
          width: 11px;
          height: 11px;
          border-radius: 50%;
          box-shadow: 0 0 0 1px rgba(255,255,255,.5);
        }
        #eclipseTooltip .eclipse-tip-title { font-size: 13px; font-weight: 800; }
        #eclipseTooltip .eclipse-tip-close {
          display: none;
          width: 30px;
          height: 30px;
          padding: 0;
          margin: -5px -4px -5px 0;
          border: 0;
          border-radius: 8px;
          background: rgba(255,255,255,.07);
          color: #dce6f3;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }
        #eclipseTooltip.is-pinned .eclipse-tip-close { display: block; }
        #eclipseTooltip .eclipse-tip-sub {
          margin: 5px 0 10px 21px;
          color: #93a4b9;
          font-size: 10px;
        }
        #eclipseTooltip dl {
          display: grid;
          grid-template-columns: minmax(0,1fr) auto;
          gap: 5px 12px;
          margin: 0;
        }
        #eclipseTooltip dt { color: #8495aa; }
        #eclipseTooltip dd { margin: 0; color: #f4f7fb; text-align: right; font-weight: 650; }
        #eclipseTooltip .eclipse-tip-foot {
          margin-top: 9px;
          padding-top: 8px;
          border-top: 1px solid rgba(255,255,255,.09);
          color: #738399;
          font-size: 9px;
        }
        @media (max-width: 600px) {
          #eclipseTooltip { font-size: 11px; }
          #eclipseTooltip.is-pinned { bottom: max(10px, env(safe-area-inset-bottom)); }
        }
      `;
      document.head.appendChild(style);
    }

    if (!state.tooltip) {
      const tooltip = document.createElement('div');
      tooltip.id = 'eclipseTooltip';
      tooltip.setAttribute('role', 'dialog');
      tooltip.setAttribute('aria-live', 'polite');
      tooltip.addEventListener('click', event => {
        if (event.target.closest('.eclipse-tip-close')) {
          state.pinned = false;
          hideTooltip();
        }
      });
      (document.getElementById('app') || document.body).appendChild(tooltip);
      state.tooltip = tooltip;
    }
  }

  function renderTooltip(meta, clientX, clientY, pinned = false) {
    if (!state.tooltip || !meta || !state.THREE) return;
    const colors = vividColors(meta);
    const typeCode = meta.typeCode || 'T';
    const catalogNumber = meta.catalogNumber ?? 'n/d';
    const continent = meta.continent || 'n/d';
    const date = formatDate(meta);

    state.tooltip.innerHTML = `
      <div class="eclipse-tip-head">
        <span class="eclipse-tip-dot" style="background:${colors.bandCss}"></span>
        <div class="eclipse-tip-title">${escapeHtml(date)}</div>
        <button class="eclipse-tip-close" type="button" aria-label="Fermer">×</button>
      </div>
      <div class="eclipse-tip-sub">Éclipse solaire totale · type NASA ${escapeHtml(typeCode)}</div>
      <dl>
        <dt>Saros</dt><dd>${escapeHtml(meta.saros ?? 'n/d')}</dd>
        <dt>Magnitude</dt><dd>${escapeHtml(formatNumber(meta.magnitude, 4))}</dd>
        <dt>Largeur max.</dt><dd>${escapeHtml(formatWidth(meta.maxPathWidthKm))}</dd>
        <dt>Durée max.</dt><dd>${escapeHtml(formatDuration(meta.maxDuration))}</dd>
        <dt>Continent principal</dt><dd>${escapeHtml(continent)}</dd>
        <dt>Maximum</dt><dd>${escapeHtml(formatCoords(meta.focus))}</dd>
        <dt>Gamma</dt><dd>${escapeHtml(formatNumber(meta.gamma, 4))}</dd>
      </dl>
      <div class="eclipse-tip-foot">Catalogue NASA #${escapeHtml(catalogNumber)} · couleur de bande dédiée</div>
    `;

    state.tooltip.classList.toggle('is-pinned', pinned);
    state.tooltip.classList.add('is-visible');

    if (pinned) {
      state.tooltip.style.left = '';
      state.tooltip.style.top = '';
      state.tooltip.style.right = '';
      return;
    }

    const app = document.getElementById('app') || document.body;
    const appRect = app.getBoundingClientRect();
    const localX = clientX - appRect.left;
    const localY = clientY - appRect.top;
    state.tooltip.style.left = `${localX + 14}px`;
    state.tooltip.style.top = `${localY + 14}px`;
    state.tooltip.style.right = 'auto';

    const width = state.tooltip.offsetWidth;
    const height = state.tooltip.offsetHeight;
    let x = localX + 14;
    let y = localY + 14;
    if (x + width > appRect.width - 8) x = localX - width - 14;
    if (y + height > appRect.height - 8) y = localY - height - 14;
    state.tooltip.style.left = `${Math.max(8, x)}px`;
    state.tooltip.style.top = `${Math.max(8, y)}px`;
  }

  function hideTooltip() {
    if (!state.tooltip) return;
    state.tooltip.classList.remove('is-visible', 'is-pinned');
  }

  function buildCatalogMaps(catalog) {
    state.metaById.clear();
    state.metaByHoverKey.clear();
    state.oldBandKeyToMeta.clear();

    catalog.forEach((meta, index) => {
      const normalized = { ...meta, _hoverKey: index + 1 };
      state.metaById.set(normalized.id, normalized);
      state.metaByHoverKey.set(normalized._hoverKey, normalized);
      state.oldBandKeyToMeta.set(colorKeyFromColor(oldBandColor(normalized)), normalized);
    });
  }

  function patchRibbonMesh(mesh) {
    const geometry = mesh?.geometry;
    const colorAttribute = geometry?.getAttribute?.('aColor');
    if (!geometry || !colorAttribute) return;

    let eclipseKeyAttribute = geometry.getAttribute('aEclipseKey');
    if (!eclipseKeyAttribute) {
      const keys = new Float32Array(colorAttribute.count);
      for (let i = 0; i < colorAttribute.count; i += 1) {
        const meta = state.oldBandKeyToMeta.get(colorKeyFromAttribute(colorAttribute, i));
        keys[i] = meta?._hoverKey || 0;
      }
      eclipseKeyAttribute = new state.THREE.Float32BufferAttribute(keys, 1);
      geometry.setAttribute('aEclipseKey', eclipseKeyAttribute);
    }

    for (let i = 0; i < colorAttribute.count; i += 1) {
      const hoverKey = Math.round(eclipseKeyAttribute.getX(i));
      const meta = state.metaByHoverKey.get(hoverKey);
      if (!meta) continue;
      const color = vividColors(meta).band;
      colorAttribute.setXYZ(i, color.r, color.g, color.b);
    }
    colorAttribute.needsUpdate = true;
  }

  function patchLineMesh(mesh) {
    const attribute = mesh?.geometry?.getAttribute?.('color');
    if (!attribute) return;
    const color = new state.THREE.Color();
    const hsl = { h: 0, s: 0, l: 0 };
    for (let i = 0; i < attribute.count; i += 1) {
      color.setRGB(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
      color.getHSL(hsl);
      color.setHSL(hsl.h, 0.98, 0.82);
      attribute.setXYZ(i, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
  }

  function patchCustomItems(items) {
    if (!state.catalogReady || !state.THREE) return;
    const list = Array.isArray(items) ? items : [];
    list.forEach(item => {
      if (item?.kind === 'ribbons') patchRibbonMesh(item.mesh);
      else if (item?.kind === 'centerlines') patchLineMesh(item.mesh);
    });
  }

  function patchCatalogSwatches(root = document) {
    if (!state.catalogReady || !state.THREE) return;
    root.querySelectorAll?.('.eclipse-option').forEach(row => {
      const input = row.querySelector('input[data-eclipse-id]');
      const swatch = row.querySelector('.eclipse-swatch');
      if (!input || !swatch) return;
      const meta = state.metaById.get(input.value);
      if (!meta) return;
      const colors = vividColors(meta);
      swatch.style.background = colors.bandCss;
      swatch.style.boxShadow = `0 0 0 1px ${colors.lineCss}`;
    });

    const legend = document.querySelector('.gradient-chip');
    if (legend) {
      legend.style.background = 'linear-gradient(90deg,#b45cff,#ff7a1a,#00d9ff,#3ee58f,#ff4d9d,#ffd43b)';
    }
  }

  function installCatalogMutationObserver() {
    const catalogList = document.getElementById('catalogList');
    if (!catalogList || state.mutationObserver) return;
    state.mutationObserver = new MutationObserver(() => patchCatalogSwatches(catalogList));
    state.mutationObserver.observe(catalogList, { childList: true, subtree: true });
    patchCatalogSwatches(catalogList);
  }

  function frontFacingHit(hit) {
    if (!hit?.point || !state.globe) return false;
    const normal = hit.point.clone().normalize();
    const toCamera = state.globe.camera().position.clone().sub(hit.point).normalize();
    return normal.dot(toCamera) > 0;
  }

  function eclipseFromHit(hit) {
    const geometry = hit?.object?.geometry;
    const attribute = geometry?.getAttribute?.('aEclipseKey');
    if (!attribute) return null;
    let vertexIndex = hit.face?.a;
    if (!Number.isInteger(vertexIndex) && Number.isInteger(hit.faceIndex) && geometry.index) {
      vertexIndex = geometry.index.getX(hit.faceIndex * 3);
    }
    if (!Number.isInteger(vertexIndex)) return null;
    const hoverKey = Math.round(attribute.getX(vertexIndex));
    return state.metaByHoverKey.get(hoverKey) || null;
  }

  function raycastPointer(clientX, clientY) {
    if (!state.globe || !state.THREE || !state.catalogReady) return null;
    const canvas = state.globe.renderer().domElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const ribbonMeshes = (state.lastItems || [])
      .filter(item => item?.kind === 'ribbons' && item.mesh?.visible !== false)
      .map(item => item.mesh);
    if (!ribbonMeshes.length) return null;

    state.mouse.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    state.raycaster.setFromCamera(state.mouse, state.globe.camera());

    const hits = state.raycaster.intersectObjects(ribbonMeshes, false);
    for (const hit of hits) {
      if (!frontFacingHit(hit)) continue;
      const meta = eclipseFromHit(hit);
      if (meta) return { meta, hit };
    }
    return null;
  }

  function hoverIntervalMs() {
    const ribbon = (state.lastItems || []).find(item => item?.kind === 'ribbons');
    const triangleCount = ribbon?.mesh?.geometry?.index?.count
      ? ribbon.mesh.geometry.index.count / 3
      : 0;
    if (triangleCount > 400000) return 180;
    if (triangleCount > 150000) return 110;
    return 55;
  }

  function installPointerInteractions() {
    if (!state.globe || !state.THREE || state.globe.__eclipseHoverInstalled) return;
    state.globe.__eclipseHoverInstalled = true;
    state.raycaster = new state.THREE.Raycaster();
    state.mouse = new state.THREE.Vector2();
    const canvas = state.globe.renderer().domElement;

    canvas.addEventListener('pointermove', event => {
      if (event.pointerType !== 'mouse' || state.pinned) return;
      const now = performance.now();
      if (now - state.lastHoverRaycastAt < hoverIntervalMs()) return;
      state.lastHoverRaycastAt = now;
      const result = raycastPointer(event.clientX, event.clientY);
      if (result) {
        renderTooltip(result.meta, event.clientX, event.clientY, false);
        canvas.style.cursor = 'pointer';
      } else {
        hideTooltip();
        canvas.style.cursor = '';
      }
    }, { passive: true });

    canvas.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse' && !state.pinned) {
        hideTooltip();
        canvas.style.cursor = '';
      }
    }, { passive: true });

    canvas.addEventListener('pointerdown', event => {
      state.pointerDown = {
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        pointerType: event.pointerType
      };
    }, { passive: true });

    canvas.addEventListener('pointerup', event => {
      const start = state.pointerDown;
      state.pointerDown = null;
      if (!start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > 8 || performance.now() - start.time > 700) return;

      const result = raycastPointer(event.clientX, event.clientY);
      if (result) {
        state.pinned = true;
        renderTooltip(result.meta, event.clientX, event.clientY, true);
      } else if (state.pinned) {
        state.pinned = false;
        hideTooltip();
      }
    }, { passive: true });
  }

  function patchBuildBadge() {
    const node = document.getElementById('layerStatus');
    if (!node || node.__build13Observer) return;
    const fix = () => {
      if (node.textContent.includes('build 12')) {
        node.textContent = node.textContent.replaceAll('build 12', `build ${BUILD}`);
      }
    };
    fix();
    const observer = new MutationObserver(fix);
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    node.__build13Observer = observer;
  }

  function enhanceCurrentScene() {
    if (!state.globe || !state.catalogReady || !state.THREE) return;
    const items = state.lastItems?.length ? state.lastItems : (state.globe.customLayerData?.() || []);
    state.lastItems = items;
    patchCustomItems(items);
    patchCatalogSwatches(document);
  }

  function attachGlobe(instance) {
    if (!instance || instance.__eclipseEnhancementWrapped) return;
    instance.__eclipseEnhancementWrapped = true;
    state.globe = instance;

    const originalCustomLayerData = instance.customLayerData.bind(instance);
    instance.customLayerData = function customLayerDataEnhanced(value) {
      if (arguments.length === 0) return originalCustomLayerData();
      state.lastItems = Array.isArray(value) ? value : [];
      const result = originalCustomLayerData(value);
      queueMicrotask(enhanceCurrentScene);
      return result;
    };

    if (state.THREE) installPointerInteractions();
    queueMicrotask(enhanceCurrentScene);
  }

  function wrapGlobeFactory() {
    const originalGlobe = window.Globe;
    if (typeof originalGlobe !== 'function' || originalGlobe.__eclipseWrappedFactory) return;

    function wrappedGlobe(...factoryArgs) {
      const mount = originalGlobe(...factoryArgs);
      return function wrappedMount(...mountArgs) {
        const instance = mount(...mountArgs);
        attachGlobe(instance);
        return instance;
      };
    }

    try { Object.assign(wrappedGlobe, originalGlobe); } catch {}
    wrappedGlobe.__eclipseWrappedFactory = true;
    window.Globe = wrappedGlobe;
  }

  async function initializeDataAndThree() {
    try {
      const [THREE, catalogResponse] = await Promise.all([
        import(THREE_URL),
        fetch(CATALOG_URL, { cache: 'no-store' })
      ]);
      state.THREE = THREE;
      if (!catalogResponse.ok) throw new Error(`Catalogue NASA: HTTP ${catalogResponse.status}`);
      const catalog = await catalogResponse.json();
      if (!Array.isArray(catalog.eclipses)) throw new Error('Catalogue NASA invalide');
      buildCatalogMaps(catalog.eclipses);
      state.catalogReady = true;
      installCatalogMutationObserver();
      patchBuildBadge();
      if (state.globe) installPointerInteractions();
      enhanceCurrentScene();
    } catch (error) {
      console.warn('Améliorations de couleur/survol indisponibles :', error);
    }
  }

  installStylesAndTooltip();
  wrapGlobeFactory();
  patchBuildBadge();
  initializeDataAndThree();
})();
