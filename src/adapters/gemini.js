(() => {
  'use strict';

  window.ChatNav = window.ChatNav || {};
  const { utils, BaseChatAdapter } = ChatNav;

  class GeminiAdapter extends BaseChatAdapter {
    constructor() {
      super();
      this.name = 'gemini';
    }

    isMatch() {
      // Gemini web app (formerly Bard)
      return /(^|\.)gemini\.google\.com$/.test(location.hostname) || /(^|\.)bard\.google\.com$/.test(location.hostname);
    }

    getAssistantLabel() {
      return 'Gemini';
    }

    getConversationRoot() {
      // Gemini has a fairly stable custom element structure.
      // Prefer the chat history scroller, then fall back to broader roots.
      const stable = document.querySelector('chat-window-content > div.chat-history-scroll-container');
      if (stable) return stable;

      const byId = document.querySelector('div#chat-history');
      if (byId) return byId;

      const chatWindow = document.querySelector('chat-window');
      if (chatWindow) return chatWindow;

      const main = document.querySelector('main');
      if (main) return main;

      return document.body;
    }

    getMessages() {
      const root = this.getConversationRoot() || document.body;

      // Primary: Gemini uses custom elements for turns.
      let nodes = Array.from(root.querySelectorAll('user-query, model-response'));

      // Fallbacks (in case Google renames custom elements / adds test ids)
      if (nodes.length === 0) {
        nodes = Array.from(
          root.querySelectorAll(
            '[data-test-id="user-query"], [data-test-id="model-response"], [data-test-id="model-response-container"], [data-test-id="message"]'
          )
        );
      }

      // Keep only top-level turn nodes (avoid nested matches)
      nodes = nodes.filter((el) => {
        const p = el.parentElement;
        if (!p) return true;
        const ancestor = p.closest(
          'user-query, model-response, [data-test-id="user-query"], [data-test-id="model-response"], [data-test-id="model-response-container"]'
        );
        return !ancestor;
      });

      return nodes.map((el, index) => {
        const role = this.getRole(el);
        return {
          id: this.getMessageId(el, index),
          role,
          el,
        };
      });
    }

    getRole(el) {
      const tag = (el?.tagName || '').toLowerCase();
      if (tag === 'user-query') return 'user';
      if (tag === 'model-response') return 'assistant';

      const testid = el?.getAttribute?.('data-test-id') || '';
      if (testid.includes('user')) return 'user';
      if (testid.includes('model') || testid.includes('response')) return 'assistant';

      // Heuristics
      if (el?.querySelector?.('div.query-text, span.user-query-bubble-with-background')) return 'user';
      if (el?.querySelector?.('.markdown, .markdown-main-panel, .model-response-content')) return 'assistant';

      return 'unknown';
    }

    getPreview(el, maxLen = 140) {
      const tag = (el?.tagName || '').toLowerCase();

      let target = el;
      if (tag === 'model-response') {
        target =
          el.querySelector('.markdown.markdown-main-panel') ||
          el.querySelector('.markdown') ||
          el;
      } else if (tag === 'user-query') {
        target = el.querySelector('div.query-text') || el;
      }

      const txt = target?.innerText || target?.textContent || '';
      return utils.truncate(txt, maxLen);
    }

    getScrollContainer() {
      // Prefer Gemini's chat scroller if present.
      const sc =
        document.querySelector('chat-window-content > div.chat-history-scroll-container') ||
        document.querySelector('div#chat-history');
      if (sc instanceof HTMLElement) return sc;

      // Fallback: scrollable ancestor from first message
      const msgs = this.getMessages();
      if (msgs.length) return utils.getScrollableAncestor(msgs[0].el);

      return document.scrollingElement || document.documentElement;
    }
  }

  ChatNav.GeminiAdapter = GeminiAdapter;
})();
