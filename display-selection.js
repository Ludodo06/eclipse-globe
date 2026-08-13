(() => {
  function install() {
    const button = document.getElementById('selectVisibleBtn');
    if (!button) return;

    const label = () => { button.textContent = 'Afficher sélection'; };
    label();
    new MutationObserver(label).observe(button, { childList:true, subtree:true });

    document.addEventListener('click', event => {
      if (!event.target.closest?.('#selectVisibleBtn')) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const ids = [...document.querySelectorAll('#catalogListVisible input[data-shop-eclipse-id]')]
        .filter(input => input.closest('.eclipse-option')?.dataset.before1800 !== '1')
        .map(input => input.dataset.shopEclipseId)
        .filter(Boolean);
      if (!ids.length) return;

      document.getElementById('clearAllBtn')?.click();

      const legacyList = document.getElementById('catalogList');
      if (!legacyList) return;

      ids.forEach(id => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = id;
        input.dataset.eclipseId = id;
        input.hidden = true;
        input.checked = true;
        legacyList.appendChild(input);
        input.dispatchEvent(new Event('change', { bubbles:true }));
        input.remove();
      });

      label();
    }, { capture:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
