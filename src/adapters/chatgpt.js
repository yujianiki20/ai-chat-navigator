(() => {
  'use strict';

  window.ChatNav = window.ChatNav || {};
  const { utils, BaseChatAdapter } = ChatNav;

  class ChatGPTAdapter extends BaseChatAdapter {
    constructor() {
      super();
      this.name = 'chatgpt';
    }

    getAssistantLabel() {
      return 'ChatGPT';
    }

    isMatch() {
      return /(^|\.)chatgpt\.com$/.test(location.hostname) || /(^|\.)chat\.openai\.com$/.test(location.hostname);
    }

    getConversationRoot() {
      // ChatGPT is a SPA; the main element is a safe broad root.
      // We still try to narrow to where messages actually live to reduce mutation noise.
      const main = document.querySelector('main');
      if (main) return main;

      const root = document.querySelector('[data-testid="conversation-turns"]');
      if (root) return root;

      return document.body;
    }

    /**
     * ChatGPT usually exposes [data-message-author-role] on each turn.
     * We prefer those; fallback to conversation turn testids.
     */
    getMessages() {
      const root = this.getConversationRoot() || document.body;

      // Prefer data-message-author-role nodes
      let nodes = Array.from(root.querySelectorAll('[data-message-author-role]'));

      // Filter to top-level message containers (avoid nested matches, if any)
      nodes = nodes.filter((el) => {
        const parent = el.parentElement;
        if (!parent) return true;
        return !parent.closest('[data-message-author-role]');
      });

      if (nodes.length === 0) {
        // Fallback: conversation turns
        nodes = Array.from(root.querySelectorAll('[data-testid^="conversation-turn"]'));
      }

      return nodes.map((el, index) => {
        const role = this.getRole(el);
        return {
          id: this.getMessageId(el, index),
          role,
          el
        };
      });
    }

    getRole(el) {
      const role = el?.getAttribute?.('data-message-author-role');
      if (role === 'user') return 'user';
      if (role === 'assistant') return 'assistant';
      if (role === 'system') return 'system';

      // Fallback heuristic for conversation-turn nodes
      const txt = (el?.innerText || '').trim().toLowerCase();
      // If it contains obvious UI labels, skip; but we still mark unknown.
      if (txt.startsWith('you') || txt.includes('\n you\n')) return 'user';
      return 'unknown';
    }

    getPreview(el, maxLen = 140) {
      // Try to avoid grabbing sidebar/button labels by preferring markdown-ish blocks if present.
      const markdown = el?.querySelector?.('.markdown, [data-testid="message-content"], [class*="markdown"]');
      const txt = (markdown?.innerText || el?.innerText || el?.textContent || '');
      return utils.truncate(txt, maxLen);
    }

    getScrollContainer() {
      // Find a scrollable ancestor from a message; this is usually the conversation scroller.
      const msgs = this.getMessages();
      if (msgs.length) return utils.getScrollableAncestor(msgs[0].el);
      return document.scrollingElement || document.documentElement;
    }
  }

  ChatNav.ChatGPTAdapter = ChatGPTAdapter;
})();