(() => {
  function installCatalogWheelScroll() {
    const panel = document.getElementById('selectionPanel');
    const list = document.getElementById('catalogList');
    if (!panel || !list || panel.__catalogWheelScrollInstalled) return;

    panel.__catalogWheelScrollInstalled = true;
    list.tabIndex = list.tabIndex >= 0 ? list.tabIndex : 0;
    list.style.touchAction = 'pan-y';
    list.style.overscrollBehavior = 'contain';

    panel.addEventListener('wheel', event => {
      if (event.ctrlKey || event.metaKey) return;

      const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
      if (maxScroll <= 0) {
        event.stopPropagation();
        return;
      }

      let delta = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 32;
      else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= Math.max(1, list.clientHeight * 0.9);

      if (!Number.isFinite(delta) || delta === 0) {
        event.stopPropagation();
        return;
      }

      const previous = list.scrollTop;
      const next = Math.max(0, Math.min(maxScroll, previous + delta));
      list.scrollTop = next;

      // La molette appartient au catalogue tant que le pointeur est sur le panneau.
      // On empêche OrbitControls de zoomer le globe derrière le menu.
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false, capture: true });

    // Évite aussi que des listeners de molette ajoutés ensuite sur le document
    // interprètent le geste comme un zoom du globe.
    list.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installCatalogWheelScroll, { once: true });
  } else {
    installCatalogWheelScroll();
  }
})();
