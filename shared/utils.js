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

/**
 * Send an extracted item to the sheet, updating an existing row (via the merge
 * dialog) instead of appending a duplicate, and report the outcome via the UI's
 * notification toast. Shared by all "*ToGoogleSheets" send buttons.
 */
export async function sendToSheet(sheetsManager, extractor, info, UI, label = 'Item') {
    const defs = extractor.getAllFieldDefinitions();
    const result = await sheetsManager.upsert(info, (diffs) => {
        const enriched = diffs.map(d => ({ ...d, label: defs[d.key]?.label || d.key }));
        return UI.showMergeDialog(enriched);
    });

    const messages = {
        appended: `${label} sent to Google Sheets!`,
        updated: 'Existing row updated!',
        unchanged: 'Already up to date — nothing to change',
        cancelled: 'Update cancelled'
    };
    UI.showNotification(messages[result.action] || messages.appended, 2500, result.action === 'cancelled');
    return result;
}

/**
 * Send a mapped frontmatter object to the vault, updating the existing note
 * (via the merge dialog) instead of creating a duplicate, and report the
 * outcome via the UI's notification toast. Shared by all "*ToObsidian" send
 * buttons.
 */
export async function sendToObsidian(obsidianManager, fmData, UI, label = 'Item') {
    const result = await obsidianManager.upsert(fmData, (diffs) => UI.showMergeDialog(diffs));

    const messages = {
        created: `${label} created in Obsidian!`,
        updated: 'Existing note updated!',
        unchanged: 'Already up to date — nothing to change',
        cancelled: 'Update cancelled'
    };
    UI.showNotification(messages[result.action] || messages.created, 2500, result.action === 'cancelled');
    return result;
}

/** Shared field-separator options for the Format tab of the settings modal. */
export const SEPARATOR_OPTIONS = [
    { value: '\t', label: 'Tab' },
    { value: ',', label: 'Comma' },
    { value: ';', label: 'Semicolon' },
    { value: '|', label: 'Pipe' }
];
