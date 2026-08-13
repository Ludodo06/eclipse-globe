(() => {
  const MIN_YEAR = 1800;

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

  function parseCenturyLabel(text) {
    const raw = String(text || '');
    const match = raw.match(/^([IVXLCDM]+)/i);
    if (!match) return null;
    return { number:romanToInt(match[1]), bce:/av\.\s*J\.-C\./i.test(raw) };
  }

  function rowYear(row) {
    const text = row.querySelector('.eclipse-option-text strong')?.textContent || '';
    const matches = text.match(/-?\d{3,4}/g);
    return matches?.length ? Number(matches[matches.length - 1]) : null;
  }

  function install() {
    const minInput = document.getElementById('minCenturyRange');
    const maxInput = document.getElementById('maxCenturyRange');
    const minLabel = document.getElementById('minCenturyLabel');
    const maxLabel = document.getElementById('maxCenturyLabel');
    const old = document.querySelector('.range-sliders');
    const shop = document.getElementById('shopSelector');
    const list = document.getElementById('catalogListVisible');
    if (!minInput || !maxInput || !minLabel || !maxLabel || !old || !shop || !list || document.getElementById('singlePeriodSlider')) return;

    const style = document.createElement('style');
    style.id = 'singlePeriodSliderStyles';
    style.textContent = `
      .range-sliders{display:none!important}
      .single-period-slider{position:relative;height:38px;margin:2px 2px 0;touch-action:none;user-select:none;cursor:pointer}
      .single-period-track{position:absolute;left:9px;right:9px;top:17px;height:4px;border-radius:999px;background:rgba(255,255,255,.13)}
      .single-period-fill{position:absolute;top:0;bottom:0;border-radius:999px;background:#eef3fa}
      .single-period-thumb{position:absolute;top:19px;width:20px;height:20px;padding:0;margin:0;transform:translate(-50%,-50%);border:2px solid #09111d;border-radius:50%;background:#fff;box-shadow:0 1px 7px rgba(0,0,0,.45);z-index:2;cursor:grab}
      .single-period-thumb:active{cursor:grabbing}
      .single-period-thumb:focus-visible{outline:2px solid #8fc3ff;outline-offset:2px}
      .eclipse-option[data-before-1800="1"]{display:none!important}
    `;
    document.head.appendChild(style);

    const slider = document.createElement('div');
    slider.id = 'singlePeriodSlider';
    slider.className = 'single-period-slider';
    slider.innerHTML = `
      <div class="single-period-track"><div class="single-period-fill"></div></div>
      <button type="button" class="single-period-thumb" data-bound="min" role="slider" aria-label="Siècle minimum"></button>
      <button type="button" class="single-period-thumb" data-bound="max" role="slider" aria-label="Siècle maximum"></button>
    `;
    old.after(slider);

    const fill = slider.querySelector('.single-period-fill');
    const minThumb = slider.querySelector('[data-bound="min"]');
    const maxThumb = slider.querySelector('[data-bound="max"]');
    let dragBound = null;
    let pointerId = null;
    let cutoffIndex = 0;
    let enforcing = false;

    const values = () => ({
      first: Math.max(0, Number(minInput.min || cutoffIndex || 0)),
      min: Number(minInput.value),
      max: Number(maxInput.value),
      last: Math.max(0, Number(maxInput.max || minInput.max || 0))
    });

    function cleanOldRows() {
      let visible = 0;
      list.querySelectorAll('.eclipse-option').forEach(row => {
        const year = rowYear(row);
        const oldRow = Number.isFinite(year) && year < MIN_YEAR;
        row.dataset.before1800 = oldRow ? '1' : '0';
        if (!oldRow) visible += 1;
        const input = row.querySelector('input[data-shop-eclipse-id]');
        if (oldRow && input?.checked) {
          input.checked = false;
          input.dispatchEvent(new Event('change', { bubbles:true }));
        }
      });
      const resultMeta = document.getElementById('resultMeta');
      if (resultMeta) resultMeta.textContent = `${visible.toLocaleString('fr-FR')} résultat${visible > 1 ? 's' : ''}`;
    }

    function sync() {
      const { first, min, max, last } = values();
      const span = Math.max(1, last - first);
      const minPct = (min - first) / span * 100;
      const maxPct = (max - first) / span * 100;
      minThumb.style.left = `${Math.max(0, Math.min(100, minPct))}%`;
      maxThumb.style.left = `${Math.max(0, Math.min(100, maxPct))}%`;
      fill.style.left = `${Math.max(0, Math.min(100, minPct))}%`;
      fill.style.width = `${Math.max(0, Math.min(100, maxPct) - Math.max(0, minPct))}%`;
      [[minThumb,min,minLabel.textContent],[maxThumb,max,maxLabel.textContent]].forEach(([thumb,value,text]) => {
        thumb.setAttribute('aria-valuemin',String(first));
        thumb.setAttribute('aria-valuemax',String(last));
        thumb.setAttribute('aria-valuenow',String(value));
        thumb.setAttribute('aria-valuetext',text || '');
      });
      cleanOldRows();
    }

    function set(bound, value) {
      const { first, min, max, last } = values();
      const next = Math.max(first, Math.min(last, Math.round(value)));
      const input = bound === 'min' ? minInput : maxInput;
      input.value = String(bound === 'min' ? Math.min(next, max) : Math.max(next, min));
      input.dispatchEvent(new Event('input', { bubbles:true }));
      requestAnimationFrame(sync);
    }

    function pointerValue(event) {
      const rect = slider.getBoundingClientRect();
      const x = Math.max(rect.left + 9, Math.min(rect.right - 9, event.clientX));
      const ratio = (x - (rect.left + 9)) / Math.max(1, rect.width - 18);
      const { first, last } = values();
      return first + ratio * (last - first);
    }

    function enforceCutoff() {
      if (enforcing || shop.dataset.screen !== 'detail') return;
      enforcing = true;
      try {
        const maxIndex = Math.max(0, Number(maxInput.max || 0));
        let candidate = maxIndex;
        for (let index = maxIndex; index >= 0; index -= 1) {
          minInput.value = String(index);
          minInput.dispatchEvent(new Event('input', { bubbles:true }));
          const parsed = parseCenturyLabel(minLabel.textContent);
          if (!parsed || parsed.bce || parsed.number < 18) {
            candidate = Math.min(maxIndex, index + 1);
            break;
          }
          candidate = index;
        }
        cutoffIndex = candidate;
        minInput.min = String(cutoffIndex);
        if (Number(minInput.value) < cutoffIndex) {
          minInput.value = String(cutoffIndex);
          minInput.dispatchEvent(new Event('input', { bubbles:true }));
        }
      } finally {
        enforcing = false;
        requestAnimationFrame(sync);
      }
    }

    slider.addEventListener('pointerdown', event => {
      event.preventDefault();
      const explicit = event.target.closest('.single-period-thumb')?.dataset.bound;
      const v = pointerValue(event);
      const { min, max } = values();
      dragBound = explicit || (Math.abs(v - min) <= Math.abs(v - max) ? 'min' : 'max');
      pointerId = event.pointerId;
      slider.setPointerCapture?.(pointerId);
      set(dragBound, v);
    });
    slider.addEventListener('pointermove', event => {
      if (pointerId !== event.pointerId || !dragBound) return;
      event.preventDefault();
      set(dragBound, pointerValue(event));
    }, { passive:false });
    const stop = event => { if (pointerId === event.pointerId) { pointerId = null; dragBound = null; } };
    slider.addEventListener('pointerup', stop);
    slider.addEventListener('pointercancel', stop);

    slider.addEventListener('keydown', event => {
      const thumb = event.target.closest('.single-period-thumb');
      if (!thumb) return;
      const { first, min, max, last } = values();
      let value = thumb.dataset.bound === 'min' ? min : max;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') value -= 1;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') value += 1;
      else if (event.key === 'Home') value = first;
      else if (event.key === 'End') value = last;
      else return;
      event.preventDefault();
      set(thumb.dataset.bound, value);
    });

    new MutationObserver(() => {
      if (!enforcing && Number(minInput.value) < cutoffIndex) {
        minInput.value = String(cutoffIndex);
        minInput.dispatchEvent(new Event('input', { bubbles:true }));
      }
      sync();
    }).observe(minLabel, { childList:true, subtree:true, characterData:true });
    new MutationObserver(sync).observe(maxLabel, { childList:true, subtree:true, characterData:true });
    new MutationObserver(() => requestAnimationFrame(cleanOldRows)).observe(list, { childList:true, subtree:true });
    new MutationObserver(() => {
      if (shop.dataset.screen === 'detail') setTimeout(enforceCutoff, 0);
    }).observe(shop, { attributes:true, attributeFilter:['data-screen'] });

    if (shop.dataset.screen === 'detail') enforceCutoff();
    else sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
