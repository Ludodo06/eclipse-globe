(() => {
  const BUILD = 14;
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
    pinned: false,
    activeMetaId: null,
    raycaster: null,
    mouse: null,
    pointerDown: null,
    lastHoverRaycastAt: 0,
    mutationObserver: null,
    centerLinesVisible: true,
    bandOpacity: 0.74
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
      const lightness = [0.56, 0.62, 0.68][n % 3];
      band.setHSL(hue / 360, 0.96, lightness);
      line.setHSL(hue / 360, 0.98, 0.84);
    }

    return {
      band,
      line,
      bandCss: `#${band.getHexString()}`,
      lineCss: `#${line.getHexString()}`
    };
  }

  function installSmallStyles() {
    if (document.getElementById('eclipseEnhancementsStyle')) return;
    const style = document.createElement('style');
    style.id = 'eclipseEnhancementsStyle';
    style.textContent = `
      @media (min-width: 981px) { #rightPanelClose { display:none !important; } }
      #displayPanel .info-unpin { width:28px; height:28px; padding:0; display:grid; place-items:center; }
      #displayPanel .info-card.is-pinned { border-color:rgba(255,255,255,.18); background:rgba(255,255,255,.06); }
      #displayPanel .info-card.has-info { box-shadow:inset 3px 0 0 var(--eclipse-info-color, #fff); }
    `;
    document.head.appendChild(style);
  }

  function infoContent() {
    return document.getElementById('eclipseInfoContent');
  }

  function infoCard() {
    return document.getElementById('eclipseInfoCard');
  }

  function renderInfo(meta, pinned = false) {
    const content = infoContent();
    const card = infoCard();
    if (!content || !card || !meta || !state.THREE) return;
    if (!pinned && state.activeMetaId === meta.id && !state.pinned) return;

    const colors = vividColors(meta);
    const date = formatDate(meta);
    state.activeMetaId = meta.id;
    state.pinned = pinned;

    card.classList.add('has-info');
    card.classList.toggle('is-pinned', pinned);
    card.style.setProperty('--eclipse-info-color', colors.bandCss);
    content.className = '';
    content.innerHTML = `
      <div class="info-head">
        <span class="info-dot" style="background:${colors.bandCss}"></span>
        <div class="info-title">${escapeHtml(date)}</div>
        ${pinned
          ? '<button class="info-unpin icon-btn" type="button" aria-label="Désépingler">×</button>'
          : '<span class="info-mode">Survol</span>'}
      </div>
      <div class="info-sub">Éclipse solaire totale · type NASA ${escapeHtml(meta.typeCode || 'T')}${pinned ? ' · épinglée' : ''}</div>
      <dl class="info-table">
        <dt>Saros</dt><dd>${escapeHtml(meta.saros ?? 'n/d')}</dd>
        <dt>Magnitude</dt><dd>${escapeHtml(formatNumber(meta.magnitude, 4))}</dd>
        <dt>Largeur max.</dt><dd>${escapeHtml(formatWidth(meta.maxPathWidthKm))}</dd>
        <dt>Durée max.</dt><dd>${escapeHtml(formatDuration(meta.maxDuration))}</dd>
        <dt>Continent principal</dt><dd>${escapeHtml(meta.continent || 'n/d')}</dd>
        <dt>Maximum</dt><dd>${escapeHtml(formatCoords(meta.focus))}</dd>
        <dt>Gamma</dt><dd>${escapeHtml(formatNumber(meta.gamma, 4))}</dd>
        <dt>Catalogue NASA</dt><dd>#${escapeHtml(meta.catalogNumber ?? 'n/d')}</dd>
      </dl>
      <div class="info-foot">Passe sur une autre bande pour changer d’éclipse${pinned ? ', ou ferme l’épingle pour reprendre le survol' : ''}.</div>
    `;
  }

  function clearInfo(force = false) {
    if (state.pinned && !force) return;
    const content = infoContent();
    const card = infoCard();
    if (!content || !card) return;
    state.activeMetaId = null;
    if (force) state.pinned = false;
    card.classList.remove('has-info', 'is-pinned');
    card.style.removeProperty('--eclipse-info-color');
    content.className = 'info-empty';
    content.innerHTML = '<strong>Aucune éclipse pointée</strong>Survole une bande sur le globe pour afficher ses informations. Sur mobile, touche une bande pour l’épingler ici.';
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

    if (mesh.material?.uniforms?.uOpacity) {
      mesh.material.uniforms.uOpacity.value = state.bandOpacity;
    }
  }

  function patchLineMesh(mesh) {
    const attribute = mesh?.geometry?.getAttribute?.('color');
    if (!attribute) return;
    const color = new state.THREE.Color();
    const hsl = { h: 0, s: 0, l: 0 };
    for (let i = 0; i < attribute.count; i += 1) {
      color.setRGB(attribute.getX(i), attribute.getY(i), attribute.getZ(i));
      color.getHSL(hsl);
      color.setHSL(hsl.h, 0.98, 0.84);
      attribute.setXYZ(i, color.r, color.g, color.b);
    }
    attribute.needsUpdate = true;
    mesh.visible = state.centerLinesVisible;
  }

  function applyDisplaySettings(items = state.lastItems) {
    (items || []).forEach(item => {
      if (!item?.mesh) return;
      if (item.kind === 'ribbons' && item.mesh.material?.uniforms?.uOpacity) {
        item.mesh.material.uniforms.uOpacity.value = state.bandOpacity;
      }
      if (item.kind === 'centerlines') item.mesh.visible = state.centerLinesVisible;
    });
  }

  function patchCustomItems(items) {
    if (!state.catalogReady || !state.THREE) return;
    const list = Array.isArray(items) ? items : [];
    list.forEach(item => {
      if (item?.kind === 'ribbons') patchRibbonMesh(item.mesh);
      else if (item?.kind === 'centerlines') patchLineMesh(item.mesh);
    });
    applyDisplaySettings(list);
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
    const triangleCount = ribbon?.mesh?.geometry?.index?.count ? ribbon.mesh.geometry.index.count / 3 : 0;
    if (triangleCount > 400000) return 180;
    if (triangleCount > 150000) return 110;
    return 50;
  }

  function setRightPanelOpen(open) {
    const panel = document.getElementById('displayPanel');
    const selection = document.getElementById('selectionPanel');
    const toggle = document.getElementById('rightPanelToggle');
    if (!panel || !selection || !toggle) return;
    panel.classList.toggle('is-open', open);
    selection.classList.toggle('right-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
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
        renderInfo(result.meta, false);
        canvas.style.cursor = 'pointer';
      } else {
        clearInfo();
        canvas.style.cursor = '';
      }
    }, { passive: true });

    canvas.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse' && !state.pinned) {
        clearInfo();
        canvas.style.cursor = '';
      }
    }, { passive: true });

    canvas.addEventListener('pointerdown', event => {
      state.pointerDown = { x:event.clientX, y:event.clientY, time:performance.now(), pointerType:event.pointerType };
    }, { passive: true });

    canvas.addEventListener('pointerup', event => {
      const start = state.pointerDown;
      state.pointerDown = null;
      if (!start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > 8 || performance.now() - start.time > 700) return;

      const result = raycastPointer(event.clientX, event.clientY);
      if (result) {
        renderInfo(result.meta, true);
        if (window.matchMedia('(max-width: 980px)').matches) setRightPanelOpen(true);
      } else if (state.pinned) {
        clearInfo(true);
      }
    }, { passive: true });
  }

  function installPanelControls() {
    const toggle = document.getElementById('rightPanelToggle');
    const close = document.getElementById('rightPanelClose');
    const reset = document.getElementById('resetViewBtn');
    const atmosphere = document.getElementById('atmosphereToggle');
    const lines = document.getElementById('centerLinesToggle');
    const opacity = document.getElementById('bandOpacity');
    const opacityValue = document.getElementById('bandOpacityValue');
    const info = document.getElementById('eclipseInfoCard');

    toggle?.addEventListener('click', () => {
      const panel = document.getElementById('displayPanel');
      setRightPanelOpen(!panel?.classList.contains('is-open'));
    });
    close?.addEventListener('click', () => setRightPanelOpen(false));

    reset?.addEventListener('click', () => {
      state.globe?.pointOfView?.({ lat:18, lng:8, altitude:2.35 }, 800);
    });

    atmosphere?.addEventListener('change', () => {
      state.globe?.showAtmosphere?.(atmosphere.checked);
    });

    lines?.addEventListener('change', () => {
      state.centerLinesVisible = lines.checked;
      applyDisplaySettings();
    });

    opacity?.addEventListener('input', () => {
      const value = clamp(Number(opacity.value) / 100, 0.15, 1);
      state.bandOpacity = value;
      if (opacityValue) opacityValue.textContent = `${Math.round(value * 100)} %`;
      applyDisplaySettings();
    });

    info?.addEventListener('click', event => {
      if (!event.target.closest('.info-unpin')) return;
      clearInfo(true);
    });
  }

  function patchBuildBadge() {
    const node = document.getElementById('layerStatus');
    if (!node || node.__build14Observer) return;
    const fix = () => {
      const current = node.textContent;
      const next = current.replace(/build\s+\d+/g, `build ${BUILD}`);
      if (next !== current) node.textContent = next;
    };
    fix();
    const observer = new MutationObserver(fix);
    observer.observe(node, { childList:true, subtree:true, characterData:true });
    node.__build14Observer = observer;
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

    const atmosphere = document.getElementById('atmosphereToggle');
    if (atmosphere) instance.showAtmosphere(atmosphere.checked);
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
        fetch(CATALOG_URL, { cache:'no-store' })
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
      console.warn('Améliorations couleur/survol indisponibles :', error);
    }
  }

  installSmallStyles();
  installPanelControls();
  wrapGlobeFactory();
  patchBuildBadge();
  initializeDataAndThree();
})();