(() => {
  function visibleIds() {
    return [...document.querySelectorAll('#catalogListVisible input[data-shop-eclipse-id]')]
      .filter(input => input.closest('.eclipse-option')?.dataset.before1800 !== '1')
      .map(input => input.dataset.shopEclipseId)
      .filter(Boolean);
  }

  function currentIds() {
    return [...document.querySelectorAll('#visibleEclipsesList .visible-eclipse-btn[data-eclipse-id]')]
      .map(button => button.dataset.eclipseId)
      .filter(Boolean);
  }

  function updateSelectorState(previousIds, nextIds, legacyList) {
    legacyList.id = 'catalogListPaused';
    try {
      const send = (id, checked) => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.hidden = true;
        input.dataset.shopEclipseId = id;
        input.checked = checked;
        document.body.appendChild(input);
        input.dispatchEvent(new Event('change', { bubbles:true }));
        input.remove();
      };
      previousIds.forEach(id => send(id, false));
      nextIds.forEach(id => send(id, true));
    } finally {
      legacyList.id = 'catalogList';
    }
  }

  function sendToGlobe(id, legacyList) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = id;
    input.dataset.eclipseId = id;
    input.hidden = true;
    input.checked = true;
    legacyList.appendChild(input);
    input.dispatchEvent(new Event('change', { bubbles:true }));
    input.remove();
  }

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

      const ids = visibleIds();
      if (!ids.length) return;

      const previous = currentIds();
      const legacyList = document.getElementById('catalogList');
      if (!legacyList) return;

      button.disabled = true;
      button.textContent = 'Affichage…';

      updateSelectorState(previous, ids, legacyList);
      document.getElementById('clearAllBtn')?.click();
      ids.forEach(id => sendToGlobe(id, legacyList));

      requestAnimationFrame(() => {
        button.disabled = false;
        label();
      });
    }, { capture:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
