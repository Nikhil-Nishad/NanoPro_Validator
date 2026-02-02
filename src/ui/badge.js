/**
 * NanoPro Badge - Floating Status Badge
 * 
 * Displays validation status at top-center of page.
 * States: valid, invalid, incomplete, loading
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
            this.onRefreshCallback = null;
            this.onClickCallback = null;
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
        <button class="nanopro-badge-refresh" title="Refresh validation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
        </button>
      `;

            // Add event listeners
            this.element.addEventListener('click', (e) => {
                // Ignore if clicking refresh button
                if (e.target.closest('.nanopro-badge-refresh')) return;

                if (this.onClickCallback) {
                    this.onClickCallback();
                }
            });

            const refreshBtn = this.element.querySelector('.nanopro-badge-refresh');
            refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onRefreshCallback) {
                    this.setState('loading');
                    this.onRefreshCallback();
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
         * Update for valid state
         */
        setValid(rowCount) {
            this.setState('valid', { total: rowCount });
            const textEl = this.element.querySelector('.nanopro-badge-text');
            if (textEl) {
                textEl.textContent = `${rowCount}/${rowCount} Valid`;
            }
        }

        /**
         * Update for invalid state
         */
        setInvalid(errorCount, total) {
            this.setState('invalid', { errorCount, total });
        }

        /**
         * Update for incomplete state
         */
        setIncomplete() {
            this.setState('incomplete');
        }

        /**
         * Update for loading state
         */
        setLoading() {
            this.setState('loading');
        }

        /**
         * Update for no data state
         */
        setNoData() {
            this.setState('noData');
        }

        /**
         * Update for ready state
         */
        setReady() {
            this.setState('ready');
        }

        /**
         * Update for selecting state
         */
        setSelecting() {
            this.setState('selecting');
        }

        /**
         * Set refresh callback
         */
        onRefresh(callback) {
            this.onRefreshCallback = callback;
        }

        /**
         * Set click callback
         */
        onClick(callback) {
            this.onClickCallback = callback;
        }

        /**
         * Get current state
         */
        getState() {
            return this.currentState;
        }

        /**
         * Remove badge
         */
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
        onRefresh: (callback) => badge.onRefresh(callback),
        onClick: (callback) => badge.onClick(callback),
        getState: () => badge.getState(),
        remove: () => badge.remove()
    };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.NanoProBadge = NanoProBadge;
}
