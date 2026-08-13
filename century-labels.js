(() => {
  function romanToInt(value) {
    const map = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
    let total = 0;
    let previous = 0;
    for (const char of String(value || '').toUpperCase()) {
      const current = map[char] || 0;
      total += current > previous ? current - 2 * previous : current;
      previous = current;
    }
    return total;
  }

  function numericLabel(text) {
    const raw = String(text || '').trim();
    const roman = raw.match(/^([IVXLCDM]+)e\s+siècle(.*)$/i);
    if (!roman) return raw;
    const number = romanToInt(roman[1]);
    return `${number}e siècle${roman[2] || ''}`;
  }

  function patchNode(node) {
    if (!node) return;
    const source = node.textContent || '';
    const numeric = numericLabel(source);
    node.dataset.numericCentury = numeric;
  }

  function install() {
    const style = document.createElement('style');
    style.id = 'numericCenturyLabelsStyle';
    style.textContent = `
      #minCenturyLabel[data-numeric-century],
      #maxCenturyLabel[data-numeric-century] { font-size:0 !important; }
      #minCenturyLabel[data-numeric-century]::after,
      #maxCenturyLabel[data-numeric-century]::after {
        content:attr(data-numeric-century);
        font-size:10px;
      }
    `;
    document.head.appendChild(style);

    const min = document.getElementById('minCenturyLabel');
    const max = document.getElementById('maxCenturyLabel');
    if (!min || !max) return;

    const patch = () => {
      patchNode(min);
      patchNode(max);
    };
    patch();

    const observer = new MutationObserver(patch);
    observer.observe(min, { childList:true, subtree:true, characterData:true });
    observer.observe(max, { childList:true, subtree:true, characterData:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
