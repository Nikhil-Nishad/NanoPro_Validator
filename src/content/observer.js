/**
 * NanoPro Observer - DOM Mutation Handler
 * 
 * Watches for DOM changes and triggers re-validation
 * with debouncing to prevent excessive processing.
 */

const NanoProObserver = (function () {
    'use strict';

    // Configuration
    const CONFIG = {
        debounceMs: 500,        // Debounce delay for mutations
        maxRetries: 3,          // Max retries on scan failure
        retryDelayMs: 1000      // Delay between retries
    };

    /**
     * Observer class
     */
    class Observer {
        constructor() {
            this.observer = null;
            this.timeoutId = null;
            this.callback = null;
            this.isActive = false;
            this.mutationCount = 0;
        }

        /**
         * Start observing DOM mutations
         * 
         * @param {Function} onMutation - Callback when relevant mutation detected
         */
        start(onMutation) {
            if (this.isActive) {
                console.log('[NanoPro Observer] Already active');
                return;
            }

            this.callback = onMutation;
            this.isActive = true;
            this.mutationCount = 0;

            this.observer = new MutationObserver((mutations) => {
                // Check if mutations are relevant (text content changes)
                const hasRelevantMutation = mutations.some(mutation => {
                    // Character data changes (text updates)
                    if (mutation.type === 'characterData') return true;

                    // Child list changes that might affect values
                    if (mutation.type === 'childList') {
                        // Check if added/removed nodes contain text
                        const hasTextNodes = (nodes) => {
                            for (const node of nodes) {
                                if (node.nodeType === Node.TEXT_NODE) return true;
                                if (node.nodeType === Node.ELEMENT_NODE && node.textContent.trim()) return true;
                            }
                            return false;
                        };

                        return hasTextNodes(mutation.addedNodes) || hasTextNodes(mutation.removedNodes);
                    }

                    return false;
                });

                if (!hasRelevantMutation) return;

                this.mutationCount++;

                // Debounce the callback
                clearTimeout(this.timeoutId);
                this.timeoutId = setTimeout(() => {
                    console.log(`[NanoPro Observer] Processing mutations (${this.mutationCount} since last callback)`);
                    this.mutationCount = 0;

                    if (this.callback) {
                        this.callback();
                    }
                }, CONFIG.debounceMs);
            });

            // Start observing
            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                characterDataOldValue: false
            });

            console.log('[NanoPro Observer] Started watching DOM mutations');
        }

        /**
         * Stop observing DOM mutations
         */
        stop() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }

            clearTimeout(this.timeoutId);
            this.timeoutId = null;
            this.isActive = false;
            this.callback = null;

            console.log('[NanoPro Observer] Stopped watching DOM mutations');
        }

        /**
         * Pause observation temporarily
         */
        pause() {
            if (this.observer) {
                this.observer.disconnect();
                console.log('[NanoPro Observer] Paused');
            }
        }

        /**
         * Resume observation
         */
        resume() {
            if (this.observer && this.isActive) {
                this.observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
                console.log('[NanoPro Observer] Resumed');
            }
        }

        /**
         * Check if observer is active
         */
        isRunning() {
            return this.isActive;
        }

        /**
         * Update configuration
         */
        configure(options) {
            Object.assign(CONFIG, options);
        }
    }

    // Create singleton instance
    const observer = new Observer();

    // Public API
    return {
        start: (callback) => observer.start(callback),
        stop: () => observer.stop(),
        pause: () => observer.pause(),
        resume: () => observer.resume(),
        isRunning: () => observer.isRunning(),
        configure: (options) => observer.configure(options),
        CONFIG: CONFIG
    };

})();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.NanoProObserver = NanoProObserver;
}
