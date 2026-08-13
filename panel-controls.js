(() => {
  const mobile = window.matchMedia('(max-width: 980px)');

  function installStyleOverride() {
    if (document.getElementById('panelControlsOverride')) return;
    const style = document.createElement('style');
    style.id = 'panelControlsOverride';
    style.textContent = `
      #rightPanelClose {
        display:grid !important;
        visibility:visible !important;
        opacity:1 !important;
        pointer-events:auto !important;
      }
    `;
    document.head.appendChild(style);
  }

  function installControls() {
    const selection = document.getElementById('selectionPanel');
    const info = document.getElementById('displayPanel');
    const selectionButton = document.getElementById('openSelectionPanel');
    const infoButton = document.getElementById('openInfoPanel');
    const legacyInfoToggle = document.getElementById('rightPanelToggle');
    if (!selection || !info || !selectionButton || !infoButton) return;

    const isOpen = panel => panel.classList.contains('panel-open');

    function sync() {
      const selectionOpen = isOpen(selection);
      const infoOpen = isOpen(info);
      selection.setAttribute('aria-hidden', selectionOpen ? 'false' : 'true');
      info.setAttribute('aria-hidden', infoOpen ? 'false' : 'true');
      selectionButton.setAttribute('aria-pressed', selectionOpen ? 'true' : 'false');
      infoButton.setAttribute('aria-pressed', infoOpen ? 'true' : 'false');
      document.body.classList.toggle('mobile-panel-active', mobile.matches && (selectionOpen || infoOpen));
      legacyInfoToggle?.setAttribute('aria-expanded', infoOpen ? 'true' : 'false');
    }

    function closePanel(panel) {
      panel.classList.remove('panel-open', 'mobile-open');
      if (panel === selection) panel.classList.remove('right-open');
      if (panel === info) panel.classList.remove('is-open');
    }

    function openPanel(panel) {
      if (mobile.matches) closePanel(panel === selection ? info : selection);
      panel.classList.add('panel-open');
    }

    function togglePanel(panel) {
      if (isOpen(panel)) closePanel(panel);
      else openPanel(panel);
      sync();
    }

    // Capture phase: this replaces the older "open only" click handlers in index.html.
    document.addEventListener('click', event => {
      if (event.target.closest('#openSelectionPanel')) {
        event.preventDefault();
        event.stopPropagation();
        togglePanel(selection);
        return;
      }
      if (event.target.closest('#openInfoPanel')) {
        event.preventDefault();
        event.stopPropagation();
        togglePanel(info);
      }
    }, { capture: true });

    // Keep the visible state coherent if another module opens the info panel after a globe tap.
    const observer = new MutationObserver(sync);
    observer.observe(selection, { attributes:true, attributeFilter:['class'] });
    observer.observe(info, { attributes:true, attributeFilter:['class'] });
    mobile.addEventListener?.('change', sync);
    sync();
  }

  installStyleOverride();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installControls, { once:true });
  } else {
    installControls();
  }
})();
