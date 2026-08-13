(() => {
  const mobile = window.matchMedia('(max-width: 980px)');
  const version = (() => {
    try { return new URL(document.currentScript?.src || location.href).searchParams.get('v') || '1'; }
    catch { return '1'; }
  })();

  const style = document.createElement('style');
  style.textContent = '#rightPanelClose{display:grid!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}';
  document.head.appendChild(style);

  function install() {
    const left = document.getElementById('selectionPanel');
    const right = document.getElementById('displayPanel');
    const leftBtn = document.getElementById('openSelectionPanel');
    const rightBtn = document.getElementById('openInfoPanel');
    if (!left || !right || !leftBtn || !rightBtn) return;

    const isOpen = panel => panel.classList.contains('panel-open');
    const close = panel => {
      panel.classList.remove('panel-open','mobile-open');
      if (panel === left) panel.classList.remove('right-open');
      if (panel === right) panel.classList.remove('is-open');
    };
    const sync = () => {
      leftBtn.setAttribute('aria-pressed', isOpen(left) ? 'true' : 'false');
      rightBtn.setAttribute('aria-pressed', isOpen(right) ? 'true' : 'false');
      left.setAttribute('aria-hidden', isOpen(left) ? 'false' : 'true');
      right.setAttribute('aria-hidden', isOpen(right) ? 'false' : 'true');
      document.body.classList.toggle('mobile-panel-active', mobile.matches && (isOpen(left) || isOpen(right)));
    };
    const toggle = panel => {
      if (isOpen(panel)) close(panel);
      else {
        if (mobile.matches) close(panel === left ? right : left);
        panel.classList.add('panel-open');
      }
      sync();
    };

    document.addEventListener('click', event => {
      if (event.target.closest('#openSelectionPanel')) {
        event.preventDefault(); event.stopPropagation(); toggle(left);
      } else if (event.target.closest('#openInfoPanel')) {
        event.preventDefault(); event.stopPropagation(); toggle(right);
      }
    }, { capture:true });

    new MutationObserver(sync).observe(left, { attributes:true, attributeFilter:['class'] });
    new MutationObserver(sync).observe(right, { attributes:true, attributeFilter:['class'] });
    sync();
  }

  import(`./period-slider.js?v=${encodeURIComponent(version)}`).catch(error => console.warn('Slider période indisponible :', error));
  import(`./stable-identity.js?v=${encodeURIComponent(version)}`).catch(error => console.warn('Identité stable indisponible :', error));
  import(`./century-labels.js?v=${encodeURIComponent(version)}`).catch(error => console.warn('Libellés de siècles indisponibles :', error));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
