(() => {
  function install() {
    const minInput = document.getElementById('minCenturyRange');
    const maxInput = document.getElementById('maxCenturyRange');
    const minLabel = document.getElementById('minCenturyLabel');
    const maxLabel = document.getElementById('maxCenturyLabel');
    const old = document.querySelector('.range-sliders');
    if (!minInput || !maxInput || !minLabel || !maxLabel || !old || document.getElementById('singlePeriodSlider')) return;

    const style = document.createElement('style');
    style.textContent = `
      .range-sliders{display:none!important}
      .single-period-slider{position:relative;height:38px;margin:2px 2px 0;touch-action:none;user-select:none;cursor:pointer}
      .single-period-track{position:absolute;left:9px;right:9px;top:17px;height:4px;border-radius:999px;background:rgba(255,255,255,.13)}
      .single-period-fill{position:absolute;top:0;bottom:0;border-radius:999px;background:#eef3fa}
      .single-period-thumb{position:absolute;top:19px;width:20px;height:20px;padding:0;margin:0;transform:translate(-50%,-50%);border:2px solid #09111d;border-radius:50%;background:#fff;box-shadow:0 1px 7px rgba(0,0,0,.45);z-index:2;cursor:grab}
      .single-period-thumb:active{cursor:grabbing}
      .single-period-thumb:focus-visible{outline:2px solid #8fc3ff;outline-offset:2px}
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

    const values = () => ({
      min: Number(minInput.value),
      max: Number(maxInput.value),
      last: Math.max(0, Number(maxInput.max || minInput.max || 0))
    });

    function sync() {
      const { min, max, last } = values();
      const minPct = last ? min / last * 100 : 50;
      const maxPct = last ? max / last * 100 : 50;
      minThumb.style.left = `${minPct}%`;
      maxThumb.style.left = `${maxPct}%`;
      fill.style.left = `${minPct}%`;
      fill.style.width = `${Math.max(0, maxPct - minPct)}%`;
      [[minThumb,min,minLabel.textContent],[maxThumb,max,maxLabel.textContent]].forEach(([thumb,value,text]) => {
        thumb.setAttribute('aria-valuemin','0');
        thumb.setAttribute('aria-valuemax',String(last));
        thumb.setAttribute('aria-valuenow',String(value));
        thumb.setAttribute('aria-valuetext',text || '');
      });
    }

    function set(bound, value) {
      const { min, max, last } = values();
      const next = Math.max(0, Math.min(last, Math.round(value)));
      const input = bound === 'min' ? minInput : maxInput;
      input.value = String(bound === 'min' ? Math.min(next, max) : Math.max(next, min));
      input.dispatchEvent(new Event('input', { bubbles:true }));
      requestAnimationFrame(sync);
    }

    function pointerValue(event) {
      const rect = slider.getBoundingClientRect();
      const x = Math.max(rect.left + 9, Math.min(rect.right - 9, event.clientX));
      const ratio = (x - (rect.left + 9)) / Math.max(1, rect.width - 18);
      return ratio * values().last;
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
      const { min, max, last } = values();
      let value = thumb.dataset.bound === 'min' ? min : max;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') value -= 1;
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') value += 1;
      else if (event.key === 'Home') value = 0;
      else if (event.key === 'End') value = last;
      else return;
      event.preventDefault();
      set(thumb.dataset.bound, value);
    });

    new MutationObserver(sync).observe(minLabel, { childList:true, subtree:true, characterData:true });
    new MutationObserver(sync).observe(maxLabel, { childList:true, subtree:true, characterData:true });
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
