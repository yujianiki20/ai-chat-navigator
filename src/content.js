(() => {
  'use strict';

  window.ChatNav = window.ChatNav || {};
  const { utils, registry, ChatNavigator } = ChatNav;

  // Guard: if content script re-runs, clean up the old one.
  const teardownOld = () => {
    try {
      if (window.__chatnav_navigator) {
        window.__chatnav_navigator.destroy();
        window.__chatnav_navigator = null;
      }
    } catch (_) {}
  };

  const boot = () => {
    const adapter = registry.getAdapter();
    if (!adapter) return;

    teardownOld();

    try {
      const nav = new ChatNavigator(adapter);
      window.__chatnav_navigator = nav;
      nav.mount();
    } catch (e) {
      // If already mounted, try to refresh the existing one.
      try {
        window.__chatnav_navigator?.refresh?.();
      } catch (_) {}
    }
  };

  const EVENT = utils.installHistoryListener();
  const scheduleBoot = utils.debounce(() => boot(), 350);

  // Initial
  scheduleBoot();

  // Route changes
  window.addEventListener(EVENT, scheduleBoot);

  // When tab becomes visible again, refresh (layout may have changed)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleBoot();
  });
})();