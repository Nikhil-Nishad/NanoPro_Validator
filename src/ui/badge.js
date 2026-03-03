/**
 * NanoPro Badge v2.0 - Floating Status Badge with Mode Toggle
 * 
 * Displays validation status at top-center of page.
 * States: valid, invalid, incomplete, loading, ready, selecting
 * v2: Added mode toggle (Auto/Manual)
 */

const NanoProBadge = (function () {
    'use strict';

    // Badge states configuration
    const STATES = {
        loading: {
            icon: '🔄',
            text: 'Validating...',
            className: 'loading'
        },
        valid: {
            icon: '✅',
            textFn: (count) => `${count}/${count} Valid`,
            className: 'valid'
        },
        invalid: {
            icon: '❌',
            textFn: (errorCount, total) => `${errorCount} Error${errorCount > 1 ? 's' : ''} Found`,
            className: 'invalid'
        },
        incomplete: {
            icon: '⚠️',
            text: 'Incomplete Data',
            className: 'incomplete'
        },
        noData: {
            icon: '📋',
            text: 'No Data Found',
            className: 'incomplete'
        },
        ready: {
            icon: '📐',
            text: 'Click to Select Table',
            className: 'ready'
        },
        selecting: {
            icon: '✂️',
            text: 'Select Table Area...',
            className: 'selecting'
        }
    };

    /**
     * Badge class
     */
    class Badge {
        constructor() {
            this.element = null;
            this.currentState = null;
            this.currentMode = 'manual';
            this.onRefreshCallback = null;
            this.onClickCallback = null;
            this.onModeToggleCallback = null;
        }

        /**
         * Create the badge element
         */
        create(container) {
            if (this.element) {
                this.element.remove();
            }

            this.element = document.createElement('div');
            this.element.className = 'nanopro-badge loading';
            this.element.innerHTML = `
        <span class="nanopro-badge-icon">🔄</span>
        <span class="nanopro-badge-text">Initializing...</span>
        <span class="nanopro-badge-pulse-dot"></span>
        <button class="nanopro-mode-toggle" title="Switch detection mode">
          <span class="nanopro-mode-label">Manual</span>
          <span class="nanopro-mode-switch">
            <span class="nanopro-mode-knob"></span>
          </span>
        </button>
        <button class="nanopro-badge-refresh" title="Refresh validation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      `;

            // Badge click handler
            this.element.addEventListener('click', (e) => {
                if (e.target.closest('.nanopro-badge-refresh')) return;
                if (e.target.closest('.nanopro-mode-toggle')) return;

                if (this.onClickCallback) {
                    this.onClickCallback();
                }
            });

            // Refresh button handler
            const refreshBtn = this.element.querySelector('.nanopro-badge-refresh');
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onRefreshCallback) {
                    this.setState('loading');
                    this.onRefreshCallback();
                }
            });

            // v2: Mode toggle handler
            const modeToggle = this.element.querySelector('.nanopro-mode-toggle');
            modeToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onModeToggleCallback) {
                    this.onModeToggleCallback();
                }
            });

            container.appendChild(this.element);
            return this.element;
        }

        /**
         * Set badge state
         */
        setState(state, options = {}) {
            if (!this.element) return;

            const config = STATES[state];
            if (!config) {
                console.error(`[NanoPro Badge] Unknown state: ${state}`);
                return;
            }

            this.currentState = state;

            // Update class
            this.element.className = `nanopro-badge ${config.className}`;

            // Update icon
            const iconEl = this.element.querySelector('.nanopro-badge-icon');
            if (iconEl) {
                iconEl.textContent = config.icon;
            }

            // Update text
            const textEl = this.element.querySelector('.nanopro-badge-text');
            if (textEl) {
                let text;
                if (config.textFn) {
                    text = config.textFn(options.errorCount || 0, options.total || 0);
                } else {
                    text = config.text;
                }
                textEl.textContent = text;
            }
        }

        /**
         * v2: Set current mode and update toggle UI
         */
        setMode(mode) {
            this.currentMode = mode;
            if (!this.element) return;

            const label = this.element.querySelector('.nanopro-mode-label');
            const toggle = this.element.querySelector('.nanopro-mode-toggle');

            if (label) {
                label.textContent = mode === 'auto' ? 'Auto' : 'Manual';
            }

            if (toggle) {
                if (mode === 'auto') {
                    toggle.classList.add('active');
                } else {
                    toggle.classList.remove('active');
                }
            }

            // Update ready state text based on mode
            if (this.currentState === 'ready') {
                const textEl = this.element.querySelector('.nanopro-badge-text');
                if (textEl) {
                    textEl.textContent = mode === 'auto' ? 'Auto-detecting...' : 'Click to Select Table';
                }
            }
        }

        setValid(rowCount) {
            this.setState('valid', { total: rowCount });
            const textEl = this.element.querySelector('.nanopro-badge-text');
            if (textEl) {
                textEl.textContent = `${rowCount}/${rowCount} Valid`;
            }
        }

        setInvalid(errorCount, total) {
            this.setState('invalid', { errorCount, total });
        }

        setIncomplete() {
            this.setState('incomplete');
        }

        setLoading() {
            this.setState('loading');
        }

        setNoData() {
            this.setState('noData');
        }

        setReady() {
            this.setState('ready');
            // Restore mode-appropriate text
            if (this.currentMode === 'auto') {
                const textEl = this.element?.querySelector('.nanopro-badge-text');
                if (textEl) textEl.textContent = 'Auto-detecting...';
            }
        }

        setSelecting() {
            this.setState('selecting');
        }

        onRefresh(callback) {
            this.onRefreshCallback = callback;
        }

        onClick(callback) {
            this.onClickCallback = callback;
        }

        /**
         * v2: Set mode toggle callback
         */
        onModeToggle(callback) {
            this.onModeToggleCallback = callback;
        }

        getState() {
            return this.currentState;
        }

        getMode() {
            return this.currentMode;
        }

        remove() {
            if (this.element && this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
            this.element = null;
        }
    }

    // Create singleton instance
    const badge = new Badge();

    // Public API
    return {
        create: (container) => badge.create(container),
        setState: (state, options) => badge.setState(state, options),
        setValid: (rowCount) => badge.setValid(rowCount),
        setInvalid: (errorCount, total) => badge.setInvalid(errorCount, total),
        setIncomplete: () => badge.setIncomplete(),
        setLoading: () => badge.setLoading(),
        setNoData: () => badge.setNoData(),
        setReady: () => badge.setReady(),
        setSelecting: () => badge.setSelecting(),
        setMode: (mode) => badge.setMode(mode),
        onRefresh: (callback) => badge.onRefresh(callback),
        onClick: (callback) => badge.onClick(callback),
        onModeToggle: (callback) => badge.onModeToggle(callback),
        getState: () => badge.getState(),
        getMode: () => badge.getMode(),
        remove: () => badge.remove()
    };

})();

// Export
if (typeof window !== 'undefined') {
    window.NanoProBadge = NanoProBadge;
}
