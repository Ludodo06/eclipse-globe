(() => {
  const CATALOG_URL = './data/nasa-total-eclipses.json';
  let catalogPromise = null;

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(CATALOG_URL, { cache:'no-store' })
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(data => Array.isArray(data.eclipses) ? data.eclipses : []);
    }
    return catalogPromise;
  }

  function eclipseDateKey(eclipse) {
    return (Number(eclipse.year) * 10000) + (Number(eclipse.month) * 100) + Number(eclipse.day);
  }

  function todayKey() {
    const now = new Date();
    return (now.getFullYear() * 10000) + ((now.getMonth() + 1) * 100) + now.getDate();
  }

  function currentRegion() {
    return document.getElementById('detailRegionName')?.textContent?.trim() || 'Monde';
  }

  function nextTenForRegion(catalog, region) {
    const today = todayKey();
    return catalog
      .filter(eclipse => eclipseDateKey(eclipse) >= today)
      .filter(eclipse => region === 'Monde' || eclipse.continent === region)
      .sort((a, b) => eclipseDateKey(a) - eclipseDateKey(b) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 10);
  }

  function replaceSelection(ids) {
    document.dispatchEvent(new CustomEvent('eclipse-replace-selection', {
      detail: { ids }
    }));
  }

  function installStyles() {
    if (document.getElementById('selectionActionStyles')) return;
    const style = document.createElement('style');
    style.id = 'selectionActionStyles';
    style.textContent = `
      #catalogPanel .result-toolbar { flex-wrap:wrap; }
      #catalogPanel .selection-actions {
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:6px;
        width:100%;
      }
      #catalogPanel .selection-actions > button {
        min-width:0;
        width:100%;
        white-space:normal;
        line-height:1.15;
      }
    `;
    document.head.appendChild(style);
  }

  function install() {
    const button = document.getElementById('selectVisibleBtn');
    if (!button) return;

    installStyles();

    let actions = button.closest('.selection-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'selection-actions';
      button.parentNode.insertBefore(actions, button);
      actions.appendChild(button);
    }

    let nextButton = document.getElementById('showNextEclipsesBtn');
    if (!nextButton) {
      nextButton = document.createElement('button');
      nextButton.id = 'showNextEclipsesBtn';
      nextButton.className = 'select-visible';
      nextButton.type = 'button';
      nextButton.textContent = 'Afficher les prochaines';
      nextButton.title = 'Afficher uniquement les 10 prochaines éclipses de la zone actuelle';
      actions.appendChild(nextButton);
    }

    const label = () => {
      if (button.textContent !== 'Afficher sélection') {
        button.textContent = 'Afficher sélection';
      }
    };
    label();
    new MutationObserver(label).observe(button, { childList:true, subtree:true });

    document.addEventListener('click', event => {
      if (event.target.closest?.('#selectVisibleBtn')) {
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
        replaceSelection(ids);
        label();
        return;
      }

      if (!event.target.closest?.('#showNextEclipsesBtn')) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const region = currentRegion();
      const originalText = nextButton.textContent;
      nextButton.disabled = true;
      nextButton.textContent = 'Chargement…';

      loadCatalog()
        .then(catalog => {
          const next = nextTenForRegion(catalog, region);
          if (!next.length) return;
          replaceSelection(next.map(eclipse => eclipse.id));
        })
        .catch(error => console.warn('Prochaines éclipses indisponibles :', error))
        .finally(() => {
          nextButton.disabled = false;
          nextButton.textContent = originalText;
        });
    }, { capture:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();
