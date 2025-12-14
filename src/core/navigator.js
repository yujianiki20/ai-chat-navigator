(() => {
  'use strict';

  window.ChatNav = window.ChatNav || {};
  const { utils } = ChatNav;

  // Theme detection helper
  const detectTheme = () => {
    // Check ChatGPT specific dark mode class/attribute on html or body
    const html = document.documentElement;
    const body = document.body;

    // ChatGPT uses 'dark' class or data-theme="dark" on html/body
    if (html.classList.contains('dark') || body.classList.contains('dark')) return 'dark';
    if (html.dataset.theme === 'dark' || body.dataset.theme === 'dark') return 'dark';
    if (html.classList.contains('light') || body.classList.contains('light')) return 'light';
    if (html.dataset.theme === 'light' || body.dataset.theme === 'light') return 'light';

    // Fallback: check computed background color
    const bgColor = getComputedStyle(body).backgroundColor;
    if (bgColor) {
      const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (luminance < 0.5) return 'dark';
        return 'light';
      }
    }

    // Use prefers-color-scheme as last resort
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  };

  class ChatNavigator {
    /**
     * @param {import('../adapters/base.js').BaseChatAdapter} adapter
     * @param {{ userLineWidth?: number, assistantLineWidth?: number }} [options]
     */
    constructor(adapter, options = {}) {
      this.adapter = adapter;
      this.options = {
        userLineWidth: options.userLineWidth ?? 8,
        assistantLineWidth: options.assistantLineWidth ?? 16,
        linePitch: 10, // fixed pitch in px
        maxHeight: 100, // vh
        padding: 16, // top/bottom padding in px
      };

      this.host = null;
      this.shadow = null;
      this.track = null;
      this.linesLayer = null;
      this.btnPrev = null;
      this.btnNext = null;

      // Tooltip lives in document.body directly (not in shadow DOM)
      this.tooltip = null;
      this.tooltipLabel = null;
      this.tooltipContent = null;

      this.messages = [];
      this.messageCenters = [];
      this.activeIndex = -1;
      this.currentTheme = 'dark';

      this.scrollContainer = null;
      this._boundOnScroll = null;
      this._boundOnResize = null;
      this._mo = null;
      this._themeMo = null;
      this._themeMediaQuery = null;

      this._refresh = utils.debounce(() => this.refresh(), 120);
      this._layout = utils.debounce(() => this.layout(), 60);
      this._updateTheme = utils.debounce(() => this._applyTheme(), 100);
    }

    mount() {
      if (!this.adapter) return;

      this._createUI();
      this._createTooltip();
      this._attach();
      this._setupThemeObserver();
      this.refresh();
    }

    destroy() {
      try {
        if (this.scrollContainer && this._boundOnScroll) {
          this.scrollContainer.removeEventListener('scroll', this._boundOnScroll);
        }
      } catch (_) {}

      try {
        window.removeEventListener('resize', this._boundOnResize);
      } catch (_) {}

      try {
        if (this._mo) this._mo.disconnect();
      } catch (_) {}

      try {
        if (this._themeMo) this._themeMo.disconnect();
      } catch (_) {}

      try {
        if (this._themeMediaQuery) {
          this._themeMediaQuery.removeEventListener('change', this._updateTheme);
        }
      } catch (_) {}

      try {
        if (this.host) this.host.remove();
      } catch (_) {}

      try {
        if (this.tooltip) this.tooltip.remove();
      } catch (_) {}

      this.host = null;
      this.shadow = null;
      this.tooltip = null;
    }

    _createUI() {
      // id guard: if something already mounted (duplicate injection), remove it.
      const existing = document.getElementById('chatnav-host');
      if (existing) existing.remove();

      const host = document.createElement('div');
      host.id = 'chatnav-host';
      host.__chatnav_instance = true;

      host.style.position = 'fixed';
      host.style.right = '10px';
      host.style.top = '50%';
      host.style.transform = 'translateY(-50%)';
      host.style.width = '36px';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'none';

      const shadow = host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `
        :host { all: initial; }
        * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"; }

        .wrap {
          position: absolute;
          inset: 0;
          pointer-events: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          opacity: 0.35;
          transition: opacity 200ms ease;
        }

        .wrap:hover {
          opacity: 0.9;
        }

        /* Theme variables - defaults to dark */
        :host {
          --line-color: rgba(255,255,255,0.45);
          --line-hover-color: rgba(255,255,255,0.75);
          --line-active-color: rgba(255,255,255,0.97);
          --btn-color: rgba(255,255,255,0.55);
          --btn-hover-color: rgba(255,255,255,0.85);
        }

        :host(.light) {
          --line-color: rgba(0,0,0,0.35);
          --line-hover-color: rgba(0,0,0,0.6);
          --line-active-color: rgba(0,0,0,0.85);
          --btn-color: rgba(0,0,0,0.45);
          --btn-hover-color: rgba(0,0,0,0.75);
        }

        .btn-container {
          display: flex;
          justify-content: center;
          width: 100%;
          pointer-events: auto;
        }

        .btn-container.top {
          padding-bottom: 6px;
        }

        .btn-container.bottom {
          padding-top: 6px;
        }

        .btn {
          width: 0;
          height: 0;
          opacity: 0;
          pointer-events: auto;
          cursor: pointer;
          filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
          transition: opacity 200ms ease, transform 100ms ease;
        }

        .wrap:hover .btn {
          opacity: 0.85;
        }

        .btn:hover {
          opacity: 1 !important;
          transform: scale(1.15);
        }

        .btn.prev {
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-bottom: 11px solid var(--btn-color);
        }

        .btn.prev:hover {
          border-bottom-color: var(--btn-hover-color);
        }

        .btn.next {
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-top: 11px solid var(--btn-color);
        }

        .btn.next:hover {
          border-top-color: var(--btn-hover-color);
        }

        .lines-container {
          position: relative;
          width: 100%;
          flex: 0 0 auto;
        }

        .lines {
          position: relative;
          width: 100%;
        }

        .line {
          position: absolute;
          left: 0;
          right: 0;
          height: var(--hit-h, 12px);
          transform: translateY(-50%);
          cursor: pointer;
          background: transparent;
        }

        .line::after {
          content: "";
          position: absolute;
          right: 6px;
          top: 50%;
          transform: translateY(-50%);
          height: 2px;
          border-radius: 999px;
          width: var(--w, ${this.options.assistantLineWidth}px);
          background: var(--line-color);
          transition: background 100ms ease;
        }

        .line.user { --w: ${this.options.userLineWidth}px; }
        .line.assistant { --w: ${this.options.assistantLineWidth}px; }
        .line.unknown { --w: ${this.options.assistantLineWidth}px; }
        .line.unknown::after { opacity: 0.55; }

        .line:hover::after {
          background: var(--line-hover-color);
        }

        .line.active::after {
          background: var(--line-active-color);
          box-shadow: 0 0 0 1px rgba(128,128,128,0.2);
        }

        @media (max-width: 720px) {
          .wrap { display: none; }
        }
      `;

      const wrap = document.createElement('div');
      wrap.className = 'wrap';

      // Top button container (above lines)
      const btnTopContainer = document.createElement('div');
      btnTopContainer.className = 'btn-container top';

      const btnPrev = document.createElement('div');
      btnPrev.className = 'btn prev';
      btnPrev.title = '前の応答';
      btnTopContainer.appendChild(btnPrev);

      // Lines container
      const linesContainer = document.createElement('div');
      linesContainer.className = 'lines-container';

      const lines = document.createElement('div');
      lines.className = 'lines';
      linesContainer.appendChild(lines);

      // Bottom button container (below lines)
      const btnBottomContainer = document.createElement('div');
      btnBottomContainer.className = 'btn-container bottom';

      const btnNext = document.createElement('div');
      btnNext.className = 'btn next';
      btnNext.title = '次の応答';
      btnBottomContainer.appendChild(btnNext);

      wrap.appendChild(btnTopContainer);
      wrap.appendChild(linesContainer);
      wrap.appendChild(btnBottomContainer);

      shadow.appendChild(style);
      shadow.appendChild(wrap);

      this.host = host;
      this.shadow = shadow;
      this.track = wrap;
      this.linesLayer = lines;
      this.linesContainer = linesContainer;
      this.btnPrev = btnPrev;
      this.btnNext = btnNext;
    }

    _createTooltip() {
      // Remove existing tooltip if any
      const existingTooltip = document.getElementById('chatnav-tooltip');
      if (existingTooltip) existingTooltip.remove();

      const tooltip = document.createElement('div');
      tooltip.id = 'chatnav-tooltip';

      // Label element for ChatGPT
      const labelEl = document.createElement('div');
      labelEl.className = 'chatnav-tooltip-label';
      Object.assign(labelEl.style, {
        fontSize: '12px',
        color: 'rgba(160,160,160,0.9)',
        marginBottom: '4px',
        lineHeight: '1.2',
      });

      // Content element for message text
      const contentEl = document.createElement('div');
      contentEl.className = 'chatnav-tooltip-content';
      Object.assign(contentEl.style, {
        fontSize: '14px',
        lineHeight: '1.4',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: '2',
        WebkitBoxOrient: 'vertical',
        wordBreak: 'break-word',
      });

      tooltip.appendChild(labelEl);
      tooltip.appendChild(contentEl);

      // Inline styles for tooltip (it's in document.body, not shadow DOM)
      Object.assign(tooltip.style, {
        position: 'fixed',
        display: 'none',
        width: '320px',
        maxWidth: '320px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'rgba(60,60,60,0.95)',
        color: 'rgba(255,255,255,0.95)',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        zIndex: '2147483647',
      });

      document.body.appendChild(tooltip);
      this.tooltip = tooltip;
      this.tooltipLabel = labelEl;
      this.tooltipContent = contentEl;
    }

    _attach() {
      if (!this.host) return;
      document.documentElement.appendChild(this.host);

      // Delegated events for lines
      this.linesLayer.addEventListener('click', (e) => {
        const line = e.target?.closest?.('.line');
        if (!line) return;
        const idx = Number(line.dataset.index);
        if (!Number.isFinite(idx)) return;
        const msg = this.messages[idx];
        if (!msg) return;
        this.adapter.scrollToMessage(msg, 'smooth');
      });

      this.linesLayer.addEventListener('pointerover', (e) => {
        const line = e.target?.closest?.('.line');
        if (!line) return;
        const idx = Number(line.dataset.index);
        if (!Number.isFinite(idx)) return;
        const msg = this.messages[idx];
        if (!msg) return;
        this._showTooltip(line, msg);
      });

      this.linesLayer.addEventListener('pointermove', (e) => {
        const line = e.target?.closest?.('.line');
        if (!line) return;
        if (this.tooltip?.style?.display !== 'block') return;
        this._positionTooltip(line);
      });

      this.linesLayer.addEventListener('pointerout', (e) => {
        const to = e.relatedTarget;
        if (to && to.closest && to.closest('.line')) return;
        this._hideTooltip();
      });

      this.btnPrev.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._jumpToPrevAssistant();
      });

      this.btnNext.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._jumpToNextAssistant();
      });

      // Scroll listener
      this._boundOnScroll = utils.throttle(() => this.updateActiveFromScroll(), 60);
      this._ensureScrollListener();

      // Resize
      this._boundOnResize = utils.debounce(() => this.refresh(), 200);
      window.addEventListener('resize', this._boundOnResize);

      // Mutations
      this._mo = new MutationObserver(() => this._refresh());
      const root = this.adapter.getConversationRoot();
      if (root) {
        this._mo.observe(root, { childList: true, subtree: true, characterData: true });
      } else {
        this._mo.observe(document.body, { childList: true, subtree: true, characterData: true });
      }
    }

    _setupThemeObserver() {
      // Initial theme
      this._applyTheme();

      // Watch for theme changes on html/body attributes/classes
      this._themeMo = new MutationObserver(() => this._updateTheme());
      this._themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      this._themeMo.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });

      // Watch prefers-color-scheme
      this._themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._themeMediaQuery.addEventListener('change', this._updateTheme);
    }

    _applyTheme() {
      const theme = detectTheme();
      this.currentTheme = theme;

      if (this.host) {
        if (theme === 'light') {
          this.host.classList.add('light');
        } else {
          this.host.classList.remove('light');
        }
      }

      // Update tooltip colors based on theme
      if (this.tooltip) {
        if (theme === 'light') {
          Object.assign(this.tooltip.style, {
            background: 'rgba(240,240,240,0.95)',
            color: 'rgba(0,0,0,0.9)',
            border: '1px solid rgba(0,0,0,0.1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          });
          if (this.tooltipLabel) {
            this.tooltipLabel.style.color = 'rgba(100,100,100,0.9)';
          }
        } else {
          Object.assign(this.tooltip.style, {
            background: 'rgba(60,60,60,0.95)',
            color: 'rgba(255,255,255,0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          });
          if (this.tooltipLabel) {
            this.tooltipLabel.style.color = 'rgba(160,160,160,0.9)';
          }
        }
      }
    }

    _ensureScrollListener() {
      const sc = this.adapter.getScrollContainer();
      if (sc === this.scrollContainer) return;

      try {
        if (this.scrollContainer && this._boundOnScroll) {
          this.scrollContainer.removeEventListener('scroll', this._boundOnScroll);
        }
      } catch (_) {}

      this.scrollContainer = sc;

      try {
        if (this.scrollContainer && this._boundOnScroll) {
          this.scrollContainer.addEventListener('scroll', this._boundOnScroll, { passive: true });
        }
      } catch (_) {}
    }

    refresh() {
      this._ensureScrollListener();

      // Pull messages fresh every time
      const msgs = this.adapter.getMessages();
      this.messages = msgs;

      // Rebuild line elements
      this._renderLines();

      // Recompute layout
      this.layout();

      // Update active state
      this.updateActiveFromScroll();
    }

    _renderLines() {
      if (!this.linesLayer) return;

      const existing = Array.from(this.linesLayer.querySelectorAll('.line'));
      const needed = this.messages.length;

      // Remove extras
      for (let i = needed; i < existing.length; i++) {
        existing[i].remove();
      }

      // Create missing
      const frag = document.createDocumentFragment();
      for (let i = existing.length; i < needed; i++) {
        const line = document.createElement('div');
        line.className = 'line';
        frag.appendChild(line);
      }
      if (frag.childNodes.length) this.linesLayer.appendChild(frag);

      // Update all
      const all = Array.from(this.linesLayer.querySelectorAll('.line'));
      for (let i = 0; i < needed; i++) {
        const msg = this.messages[i];
        const line = all[i];
        line.dataset.index = String(i);

        line.classList.remove('user', 'assistant', 'unknown', 'active');
        const role = msg.role || 'unknown';
        if (role === 'user') line.classList.add('user');
        else if (role === 'assistant') line.classList.add('assistant');
        else line.classList.add('unknown');
      }
    }

    layout() {
      if (!this.scrollContainer || !this.linesLayer || !this.linesContainer) return;
      if (this.messages.length === 0) {
        // Hide if no messages
        this.host.style.height = '0px';
        return;
      }

      const { linePitch, maxHeight, padding } = this.options;
      const n = this.messages.length;

      // Calculate content height based on fixed pitch
      const contentH = (n - 1) * linePitch;
      const totalH = contentH + padding * 2;

      // Cap at maxHeight (in vh)
      const maxHPx = window.innerHeight * (maxHeight / 100);
      const finalH = Math.min(maxHPx, totalH);

      // Set host height dynamically
      this.host.style.height = `${finalH + 40}px`; // +40 for button containers

      // Set lines container height
      this.linesContainer.style.height = `${finalH}px`;

      // Compute usable area inside linesContainer
      const usableH = Math.max(1, finalH - padding * 2);

      // Precompute centers for active-index calc
      this.messageCenters = [];

      // If content would be smaller than maxHeight, use fixed pitch; otherwise scale
      const actualStep = n > 1 ? Math.min(linePitch, usableH / (n - 1)) : usableH;
      const hitH = Math.min(14, Math.max(6, actualStep * 0.85));

      const lines = Array.from(this.linesLayer.querySelectorAll('.line'));
      for (let i = 0; i < this.messages.length; i++) {
        const msg = this.messages[i];
        const line = lines[i];
        if (!line) continue;

        const top = this._getElementTop(msg.el);
        const height = msg.el instanceof HTMLElement ? msg.el.offsetHeight : 0;
        const center = top + Math.max(0, height / 2);
        this.messageCenters.push(center);

        // Position line in the linesLayer
        const y = padding + (n === 1 ? usableH / 2 : i * actualStep);
        line.style.top = `${y}px`;
        line.style.setProperty('--hit-h', `${hitH}px`);
      }
    }

    _getElementTop(el) {
      const sc = this.scrollContainer;
      const scRect = sc?.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0 };

      const scrollTop = (sc === document.scrollingElement || sc === document.documentElement || sc === document.body)
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : sc.scrollTop;

      const r = el.getBoundingClientRect();
      return (r.top - scRect.top) + scrollTop;
    }

    _getScrollMetrics() {
      const sc = this.scrollContainer;

      if (sc === document.scrollingElement || sc === document.documentElement || sc === document.body) {
        const doc = document.documentElement;
        const scrollTop = window.scrollY || doc.scrollTop || 0;
        const clientHeight = window.innerHeight || doc.clientHeight || 1;
        const scrollHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0, clientHeight);
        return { scrollTop, clientHeight, scrollHeight };
      }

      const scrollTop = sc.scrollTop;
      const clientHeight = sc.clientHeight || 1;
      const scrollHeight = Math.max(sc.scrollHeight || 0, clientHeight);
      return { scrollTop, clientHeight, scrollHeight };
    }

    updateActiveFromScroll() {
      if (!this.scrollContainer || this.messages.length === 0) return;
      if (!this.messageCenters || this.messageCenters.length !== this.messages.length) {
        this.layout();
      }

      const metrics = this._getScrollMetrics();
      const anchor = metrics.scrollTop + metrics.clientHeight / 2;

      const centers = this.messageCenters;
      let lo = 0;
      let hi = centers.length - 1;

      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (centers[mid] < anchor) lo = mid + 1;
        else hi = mid;
      }

      let idx = lo;
      if (idx > 0) {
        const a = centers[idx];
        const b = centers[idx - 1];
        if (Math.abs(b - anchor) < Math.abs(a - anchor)) idx = idx - 1;
      }

      this.setActiveIndex(idx);
    }

    setActiveIndex(idx) {
      if (idx === this.activeIndex) return;
      this.activeIndex = idx;

      const lines = Array.from(this.linesLayer.querySelectorAll('.line'));
      for (let i = 0; i < lines.length; i++) {
        if (i === idx) lines[i].classList.add('active');
        else lines[i].classList.remove('active');
      }
    }

    _showTooltip(lineEl, msg) {
      if (!this.tooltip || !this.tooltipLabel || !this.tooltipContent) return;

      const text = this.adapter.getPreview(msg.el, 200);
      if (!text) return;

      // Set label (only for assistant)
      if (msg.role === 'assistant') {
        this.tooltipLabel.textContent = 'ChatGPT';
        this.tooltipLabel.style.display = 'block';
      } else {
        this.tooltipLabel.textContent = '';
        this.tooltipLabel.style.display = 'none';
      }

      // Set content (truncated to 2 lines via CSS)
      this.tooltipContent.textContent = text;

      this.tooltip.style.display = 'block';
      this._positionTooltip(lineEl);
    }

    _positionTooltip(lineEl) {
      if (!this.tooltip || !this.host) return;
      
      // Get navigator host position to ensure tooltip doesn't overlap
      const navRect = this.host.getBoundingClientRect();
      const tipRect = this.tooltip.getBoundingClientRect();
      const margin = 16;

      // Position tooltip to the left of the navigator
      const desiredLeft = navRect.left - tipRect.width - margin;
      const left = Math.max(8, desiredLeft);

      // Vertically centered on the line (use lineEl position)
      const lineRect = lineEl.getBoundingClientRect();
      const desiredTop = lineRect.top + lineRect.height / 2 - tipRect.height / 2;
      const top = utils.clamp(desiredTop, 8, window.innerHeight - tipRect.height - 8);

      // Set position directly without animation
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
    }

    _hideTooltip() {
      if (!this.tooltip) return;
      this.tooltip.style.display = 'none';
    }

    /**
     * Jump to previous assistant message from current position.
     * Recalculates from latest message list to handle MutationObserver updates.
     */
    _jumpToPrevAssistant() {
      // Re-fetch messages to get latest state
      const msgs = this.adapter.getMessages();
      if (!msgs.length) return;

      // Find current position based on scroll
      const sc = this.adapter.getScrollContainer();
      const scrollTop = sc === document.scrollingElement || sc === document.documentElement
        ? (window.scrollY || 0)
        : sc.scrollTop;
      const clientHeight = sc === document.scrollingElement || sc === document.documentElement
        ? window.innerHeight
        : sc.clientHeight;
      const anchor = scrollTop + clientHeight / 3; // Use upper third as reference

      // Find current visible message
      let currentIdx = 0;
      for (let i = 0; i < msgs.length; i++) {
        const el = msgs[i].el;
        const elTop = this._getElementTopFor(el, sc);
        if (elTop < anchor) currentIdx = i;
        else break;
      }

      // Find previous assistant from current position
      for (let i = currentIdx - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }

      // If none found above, go to first assistant
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].role === 'assistant') {
          msgs[i].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    }

    /**
     * Jump to next assistant message from current position.
     */
    _jumpToNextAssistant() {
      const msgs = this.adapter.getMessages();
      if (!msgs.length) return;

      const sc = this.adapter.getScrollContainer();
      const scrollTop = sc === document.scrollingElement || sc === document.documentElement
        ? (window.scrollY || 0)
        : sc.scrollTop;
      const clientHeight = sc === document.scrollingElement || sc === document.documentElement
        ? window.innerHeight
        : sc.clientHeight;
      const anchor = scrollTop + clientHeight / 2;

      // Find current visible message
      let currentIdx = 0;
      for (let i = 0; i < msgs.length; i++) {
        const el = msgs[i].el;
        const elTop = this._getElementTopFor(el, sc);
        const elBottom = elTop + (el.offsetHeight || 0);
        if (elTop <= anchor && elBottom > anchor) {
          currentIdx = i;
          break;
        } else if (elTop > anchor) {
          currentIdx = Math.max(0, i - 1);
          break;
        }
        currentIdx = i;
      }

      // Find next assistant after current position
      for (let i = currentIdx + 1; i < msgs.length; i++) {
        if (msgs[i].role === 'assistant') {
          msgs[i].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }

      // If none found below, go to last assistant
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i].el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    }

    _getElementTopFor(el, sc) {
      const scRect = sc?.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0 };
      const scrollTop = (sc === document.scrollingElement || sc === document.documentElement || sc === document.body)
        ? (window.scrollY || document.documentElement.scrollTop || 0)
        : sc.scrollTop;
      const r = el.getBoundingClientRect();
      return (r.top - scRect.top) + scrollTop;
    }
  }

  ChatNav.ChatNavigator = ChatNavigator;
})();
