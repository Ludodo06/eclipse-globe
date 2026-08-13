(() => {
  function install() {
    const button = document.getElementById('selectVisibleBtn');
    if (!button) return;

    const label = () => {
      if (button.textContent !== 'Afficher sélection') {
        button.textContent = 'Afficher sélection';
      }
    };
    label();
    new MutationObserver(label).observe(button, { childList:true, subtree:true });

    document.addEventListener('click', event => {
      if (!event.target.closest?.('#selectVisibleBtn')) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const ids = [...document.querySelectorAll('#catalogListVisible input[data-shop-eclipse-id]')]
        .filter(input => {
          const row = input.closest('.eclipse-option');
          return row && row.dataset.inPeriod !== '0' && row.dataset.before1800 !== '1';
        })
        .map(input => input.dataset.shopEclipseId)
        .filter(Boolean);

      if (!ids.length) return;

      document.dispatchEvent(new CustomEvent('eclipse-replace-selection', {
        detail: { ids }
      }));
      label();
    }, { capture:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();
