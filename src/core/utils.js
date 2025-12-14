(() => {
  'use strict';

  // Single global namespace to keep things portable / easy to embed in other extensions.
  window.ChatNav = window.ChatNav || {};

  const utils = {};

  utils.clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  utils.debounce = (fn, wait = 150) => {
    let t = null;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  utils.throttle = (fn, wait = 100) => {
    let last = 0;
    let timer = null;

    return (...args) => {
      const now = Date.now();
      const remaining = wait - (now - last);

      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        last = now;
        fn(...args);
        return;
      }

      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        fn(...args);
      }, remaining);
    };
  };

  utils.isElement = (v) => v && v.nodeType === Node.ELEMENT_NODE;

  utils.safeText = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  utils.truncate = (text, maxLen = 120) => {
    const t = utils.safeText(text);
    if (t.length <= maxLen) return t;
    return t.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
  };

  utils.getScrollableAncestor = (el) => {
    // Walk up until we find an overflow-y scroll container.
    // Fallback: document.scrollingElement.
    let cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur instanceof HTMLElement) {
        const style = getComputedStyle(cur);
        const oy = style.overflowY;
        const isScrollable = (oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight + 10;
        if (isScrollable) return cur;
      }
      cur = cur.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  };

  utils.once = (fn) => {
    let called = false;
    return (...args) => {
      if (called) return;
      called = true;
      fn(...args);
    };
  };

  utils.installHistoryListener = () => {
    // SPA route changes: patch pushState/replaceState once and emit event.
    const EVENT = 'chatnav:locationchange';
    const emit = () => window.dispatchEvent(new Event(EVENT));
    const patch = (type) => {
      const original = history[type];
      if (original.__chatnav_patched) return;

      const wrapped = function (...args) {
        const ret = original.apply(this, args);
        emit();
        return ret;
      };
      wrapped.__chatnav_patched = true;
      history[type] = wrapped;
    };

    patch('pushState');
    patch('replaceState');
    window.addEventListener('popstate', emit);
    return EVENT;
  };

  ChatNav.utils = utils;
})();