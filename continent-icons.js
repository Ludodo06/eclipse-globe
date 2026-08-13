(() => {
  const version = (() => {
    try { return new URL(document.currentScript?.src || location.href).searchParams.get('v') || '1'; }
    catch { return '1'; }
  })();

  const ICONS = {
    Monde: 'world.svg',
    Europe: 'europe.svg',
    Afrique: 'africa.svg',
    Asie: 'asia.svg',
    'Amérique du Nord': 'north-america.svg',
    'Amérique du Sud': 'south-america.svg',
    Océanie: 'oceania.svg',
    Antarctique: 'antarctica.svg'
  };

  function installStyles() {
    if (document.getElementById('continentIconStyles')) return;
    const style = document.createElement('style');
    style.id = 'continentIconStyles';
    style.textContent = `
      .region-card .region-icon {
        width:100%;
        height:94px;
        display:block;
        object-fit:contain;
        object-position:center;
        opacity:.94;
        transition:transform .16s ease, opacity .16s ease;
        filter:drop-shadow(0 2px 8px rgba(255,255,255,.07));
      }
      .region-card:hover .region-icon { transform:scale(1.025); opacity:1; }
    `;
    document.head.appendChild(style);
  }

  function upgradeCard(card) {
    const file = ICONS[card.dataset.region];
    if (!file || card.querySelector('.region-icon')) return;

    const oldSvg = card.querySelector('svg');
    const fallback = oldSvg?.cloneNode(true) || null;
    const image = document.createElement('img');
    image.className = 'region-icon';
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';
    image.src = `./assets/continents/${file}?v=${encodeURIComponent(version)}`;
    image.addEventListener('error', () => {
      if (fallback && image.isConnected) image.replaceWith(fallback);
    }, { once:true });

    if (oldSvg) oldSvg.replaceWith(image);
    else card.prepend(image);
  }

  function upgrade() {
    document.querySelectorAll('.region-card[data-region]').forEach(upgradeCard);
  }

  installStyles();
  upgrade();

  const grid = document.getElementById('regionGrid');
  if (grid) new MutationObserver(upgrade).observe(grid, { childList:true, subtree:true });
  else new MutationObserver(upgrade).observe(document.body, { childList:true, subtree:true });
})();
