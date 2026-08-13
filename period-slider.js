(() => {
  const MIN_YEAR = 1800;

  function centuryOf(year) {
    return Math.floor((Number(year) - 1) / 100) + 1;
  }

  function rowYear(row) {
    const text = row.querySelector('.eclipse-option-text strong')?.textContent || '';
    const matches = text.match(/\d{4}/g);
    return matches?.length ? Number(matches[matches.length - 1]) : null;
  }

  function install() {
    const oldInputs = document.querySelector('.range-sliders');
    const list = document.getElementById('catalogListVisible');
    const minLabel = document.getElementById('minCenturyLabel');
    const maxLabel = document.getElementById('maxCenturyLabel');
    const resultMeta = document.getElementById('resultMeta');
    const regionName = document.getElementById('detailRegionName');
    const resetButton = document.getElementById('resetCenturyRange');
    if (!oldInputs || !list || !minLabel || !maxLabel || document.getElementById('singlePeriodSlider')) return;

    const style = document.createElement('style');
    style.id = 'singlePeriodSliderStyles';
    style.textContent = `
      .range-sliders{display:none!important}
      .single-period-slider{position:relative;height:38px;margin:2px 2px 0;touch-action:none;user-select:none;cursor:pointer}
      .single-period-track{position:absolute;left:10px;right:10px;top:17px;height:4px;border-radius:999px;background:rgba(255,255,255,.13)}
      .single-period-fill{position:absolute;top:0;bottom:0;border-radius:999px;background:#eef3fa}
      .single-period-thumb{position:absolute;top:19px;width:20px;height:20px;padding:0;margin:0;transform:translate(-50%,-50%);border:2px solid #09111d;border-radius:50%;background:#fff;box-shadow:0 1px 7px rgba(0,0,0,.45);z-index:2;cursor:grab}
      .single-period-thumb:active{cursor:grabbing}
      .single-period-thumb:focus-visible{outline:2px solid #8fc3ff;outline-offset:2px}
      .eclipse-option[data-in-period="0"]{display:none!important}
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
    oldInputs.after(slider);

    const fill = slider.querySelector('.single-period-fill');
    const minThumb = slider.querySelector('[data-bound="min"]');
    const maxThumb = slider.querySelector('[data-bound="max"]');

    let availableMin = 19;
    let availableMax = 30;
    let selectedMin = availableMin;
    let selectedMax = availableMax;
    let currentRegion = '';
    let dragBound = null;
    let pointerId = null;
    let scheduled = false;

    function rows() {
      return [...list.querySelectorAll('.eclipse-option')];
    }

    function measureRange() {
      const years = rows()
        .map(rowYear)
        .filter(year => Number.isFinite(year) && year >= MIN_YEAR);
      if (!years.length) return false;

      const nextMin = Math.min(...years.map(centuryOf));
      const nextMax = Math.max(...years.map(centuryOf));
      const nextRegion = regionName?.textContent || '';

      if (nextRegion !== currentRegion) {
        currentRegion = nextRegion;
        selectedMin = nextMin;
        selectedMax = nextMax;
      } else {
        selectedMin = Math.max(nextMin, Math.min(selectedMin, nextMax));
        selectedMax = Math.max(selectedMin, Math.min(selectedMax, nextMax));
      }

      availableMin = nextMin;
      availableMax = nextMax;
      return true;
    }

    function positionFor(value) {
      const span = Math.max(1, availableMax - availableMin);
      return ((value - availableMin) / span) * 100;
    }

    function syncUi() {
      const minPct = positionFor(selectedMin);
      const maxPct = positionFor(selectedMax);
      minThumb.style.left = `${minPct}%`;
      maxThumb.style.left = `${maxPct}%`;
      fill.style.left = `${minPct}%`;
      fill.style.width = `${Math.max(0, maxPct - minPct)}%`;

      minLabel.textContent = `${selectedMin}e siècle`;
      maxLabel.textContent = `${selectedMax}e siècle`;

      [[minThumb, selectedMin], [maxThumb, selectedMax]].forEach(([thumb, value]) => {
        thumb.setAttribute('aria-valuemin', String(availableMin));
        thumb.setAttribute('aria-valuemax', String(availableMax));
        thumb.setAttribute('aria-valuenow', String(value));
        thumb.setAttribute('aria-valuetext', `${value}e siècle`);
      });
    }

    function applyFilter() {
      let visible = 0;
      rows().forEach(row => {
        const year = rowYear(row);
        const century = Number.isFinite(year) ? centuryOf(year) : null;
        const inPeriod = Number.isFinite(year)
          && year >= MIN_YEAR
          && century >= selectedMin
          && century <= selectedMax;
        row.dataset.inPeriod = inPeriod ? '1' : '0';
        row.dataset.before1800 = Number.isFinite(year) && year < MIN_YEAR ? '1' : '0';
        if (inPeriod) visible += 1;
      });
      if (resultMeta) resultMeta.textContent = `${visible.toLocaleString('fr-FR')} résultat${visible > 1 ? 's' : ''}`;
      syncUi();
    }

    function refresh() {
      scheduled = false;
      if (!measureRange()) return;
      applyFilter();
    }

    function scheduleRefresh() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(refresh);
    }

    function valueFromPointer(event) {
      const rect = slider.getBoundingClientRect();
      const left = rect.left + 10;
      const right = rect.right - 10;
      const x = Math.max(left, Math.min(right, event.clientX));
      const ratio = (x - left) / Math.max(1, right - left);
      return Math.round(availableMin + ratio * (availableMax - availableMin));
    }

    function setBound(bound, value) {
      const next = Math.max(availableMin, Math.min(availableMax, Math.round(value)));
      if (bound === 'min') selectedMin = Math.min(next, selectedMax);
      else selectedMax = Math.max(next, selectedMin);
      applyFilter();
    }

    slider.addEventListener('pointerdown', event => {
      event.preventDefault();
      const value = valueFromPointer(event);
      dragBound = event.target.closest('.single-period-thumb')?.dataset.bound
        || (Math.abs(value - selectedMin) <= Math.abs(value - selectedMax) ? 'min' : 'max');
      pointerId = event.pointerId;
      slider.setPointerCapture?.(pointerId);
      setBound(dragBound, value);
    });

    slider.addEventListener('pointermove', event => {
      if (!dragBound || pointerId !== event.pointerId) return;
      event.preventDefault();
      setBound(dragBound, valueFromPointer(event));
    }, { passive:false });

    const stopDrag = event => {
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      dragBound = null;
    };
    slider.addEventListener('pointerup', stopDrag);
    slider.addEventListener('pointercancel', stopDrag);

    slider.addEventListener('keydown', event => {
      const thumb = event.target.closest('.single-period-thumb');
      if (!thumb) return;
      let value = thumb.dataset.bound === 'min' ? selectedMin : selectedMax;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') value -= 1;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') value += 1;
      else if (event.key === 'Home') value = availableMin;
      else if (event.key === 'End') value = availableMax;
      else return;
      event.preventDefault();
      setBound(thumb.dataset.bound, value);
    });

    document.addEventListener('click', event => {
      if (!event.target.closest?.('#resetCenturyRange')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectedMin = availableMin;
      selectedMax = availableMax;
      applyFilter();
    }, { capture:true });

    new MutationObserver(scheduleRefresh).observe(list, { childList:true, subtree:false });
    if (regionName) new MutationObserver(scheduleRefresh).observe(regionName, { childList:true, characterData:true, subtree:true });
    scheduleRefresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
