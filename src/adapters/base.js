(() => {
  'use strict';

  window.ChatNav = window.ChatNav || {};
  const { utils } = ChatNav;

  /**
   * @typedef {'user'|'assistant'|'system'|'unknown'} ChatRole
   * @typedef {{ id: string, role: ChatRole, el: Element }} ChatMessage
   */

  class BaseChatAdapter {
    constructor() {
      this.name = 'base';
    }

    /**
     * Human-readable label for the assistant model/site.
     * Used in the tooltip.
     */
    getAssistantLabel() {
      return 'Assistant';
    }

    /**
     * Return true if this adapter should be used on the current page.
     * Override in concrete adapters.
     */
    isMatch() {
      return false;
    }

    /**
     * Return the "root" element that contains message nodes.
     * Used for MutationObserver scope.
     */
    getConversationRoot() {
      return document.body;
    }

    /**
     * Return the scroll container that actually scrolls the conversation.
     * Default: nearest scrollable ancestor of the first message, or document scroll.
     */
    getScrollContainer() {
      const first = this.getMessageElements?.()[0]?.el;
      if (first) return utils.getScrollableAncestor(first);
      return document.scrollingElement || document.documentElement;
    }

    /**
     * Return a list of message containers in order.
     * Override in concrete adapters.
     * @returns {ChatMessage[]}
     */
    getMessages() {
      return [];
    }

    /**
     * Derive a stable-ish id for a message.
     */
    getMessageId(el, index) {
      if (!el) return `m_${index}`;
      if (el.id) return el.id;
      if (el.getAttribute) {
        const testid = el.getAttribute('data-testid');
        if (testid) return testid;
      }
      return `m_${index}`;
    }

    /**
     * Get role from message element. Override in concrete adapter if needed.
     * @returns {ChatRole}
     */
    getRole(el) {
      const role = el?.getAttribute?.('data-message-author-role');
      if (role === 'user') return 'user';
      if (role === 'assistant') return 'assistant';
      if (role === 'system') return 'system';
      return 'unknown';
    }

    /**
     * Extract preview text for tooltip.
     */
    getPreview(el, maxLen = 140) {
      const txt = el?.innerText || el?.textContent || '';
      return utils.truncate(txt, maxLen);
    }

    /**
     * Scroll to message.
     */
    scrollToMessage(msg, behavior = 'smooth') {
      try {
        msg.el.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
      } catch (e) {
        // Fallback
        const sc = this.getScrollContainer();
        const top = this.getMessageTop(msg);
        if (sc && typeof sc.scrollTop === 'number') sc.scrollTop = top;
      }
    }

    /**
     * Top offset of message relative to scroll container.
     */
    getMessageTop(msg) {
      const sc = this.getScrollContainer();
      const scRect = sc?.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0 };
      const scrollTop = sc === document.scrollingElement || sc === document.documentElement
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : sc.scrollTop;

      const r = msg.el.getBoundingClientRect();
      return (r.top - scRect.top) + scrollTop;
    }
  }

  ChatNav.BaseChatAdapter = BaseChatAdapter;
})();