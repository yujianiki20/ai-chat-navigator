(() => {
  'use strict';

  window.ChatNav = window.ChatNav || {};

  const registry = {};

  registry.getAdapter = () => {
    const candidates = [];
    if (ChatNav.ChatGPTAdapter) candidates.push(new ChatNav.ChatGPTAdapter());
    if (ChatNav.GeminiAdapter) candidates.push(new ChatNav.GeminiAdapter());

    for (const a of candidates) {
      try {
        if (a.isMatch()) return a;
      } catch (_) {}
    }
    return null;
  };

  ChatNav.registry = registry;
})();