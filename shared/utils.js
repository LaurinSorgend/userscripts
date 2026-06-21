/**
 * Helpers shared across the "*ToGoogleSheets" userscripts.
 * Site-specific scraping helpers stay in each project's own src/utils.js.
 */

/** Query a primary selector, falling back through alternatives; return trimmed text or ''. */
export function getText(primary, fallbacks = []) {
    let el = document.querySelector(primary);
    let i = 0;
    while (!el && i < fallbacks.length) {
        el = document.querySelector(fallbacks[i++]);
    }
    return el ? el.textContent.trim() : '';
}

/** Poll for a selector and invoke callback once it appears (timeout 15s). */
export function waitForElement(selector, callback, checkFreq = 100, timeout = 15000) {
    const start = Date.now();

    function check() {
        const el = document.querySelector(selector);
        if (el) {
            callback(el);
        } else if (Date.now() - start < timeout) {
            setTimeout(check, checkFreq);
        }
    }

    check();
}

/** Shared field-separator options for the Format tab of the settings modal. */
export const SEPARATOR_OPTIONS = [
    { value: '\t', label: 'Tab' },
    { value: ',', label: 'Comma' },
    { value: ';', label: 'Semicolon' },
    { value: '|', label: 'Pipe' }
];
