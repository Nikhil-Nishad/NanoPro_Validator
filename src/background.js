/**
 * NanoPro Validator v2.0 — Background Script
 * 
 * Handles keyboard shortcuts and communication between
 * the extension popup and content scripts.
 * v2: Added toggle-mode command
 */

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
    console.log('[NanoPro Background] Command received:', command);

    // Send command to active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'NANOPRO_COMMAND',
                command: command
            }).catch(err => {
                console.log('[NanoPro Background] Tab not ready:', err.message);
            });
        }
    });
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, {
        type: 'NANOPRO_COMMAND',
        command: 'start-selection'
    }).catch(err => {
        console.log('[NanoPro Background] Content script not loaded:', err.message);
    });
});

console.log('[NanoPro Background v2] Service worker started');
