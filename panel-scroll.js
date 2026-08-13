(() => {
  function applySimpleNativeScroll() {
    const panel = document.getElementById('selectionPanel');
    const catalog = document.getElementById('catalogPanel');
    const body = panel?.querySelector('.catalog-body');
    const list = document.getElementById('catalogList');
    if (!panel || !catalog || !body || !list) return;

    // Simple et natif : tout le panneau gauche défile comme une page normale.
    panel.style.setProperty('display', 'block', 'important');
    panel.style.setProperty('overflow-y', 'auto', 'important');
    panel.style.setProperty('overflow-x', 'hidden', 'important');
    panel.style.setProperty('overscroll-behavior', 'contain', 'important');
    panel.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');

    catalog.style.setProperty('display', 'block', 'important');
    catalog.style.setProperty('overflow', 'visible', 'important');
    catalog.style.setProperty('min-height', '0', 'important');

    body.style.setProperty('display', 'block', 'important');
    body.style.setProperty('overflow', 'visible', 'important');
    body.style.setProperty('min-height', '0', 'important');

    list.style.setProperty('display', 'grid', 'important');
    list.style.setProperty('height', 'auto', 'important');
    list.style.setProperty('max-height', 'none', 'important');
    list.style.setProperty('overflow', 'visible', 'important');
    list.style.removeProperty('tab-index');
  }

  // Ce fichier est chargé avant selection-list.js et le script de layout.
  // On applique donc le style après leur exécution pour rester le dernier mot.
  requestAnimationFrame(() => {
    applySimpleNativeScroll();
    requestAnimationFrame(applySimpleNativeScroll);
  });

  window.addEventListener('resize', applySimpleNativeScroll, { passive: true });
})();
