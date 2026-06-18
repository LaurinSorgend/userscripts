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
 * Parses a community review bar section by its heading text.
 * Returns a map of { label → percentage } in display order, or null if not found.
 */
export function extractReviewSection(headingText) {
    const frame = document.querySelector('turbo-frame#community_reviews');
    if (!frame) return null;

    const headings = frame.querySelectorAll('p.text-center.font-semibold');
    for (const h of headings) {
        if (h.textContent.trim() !== headingText) continue;

        const barContainer = h.nextElementSibling;
        if (!barContainer) continue;

        const result = {};
        for (const span of barContainer.querySelectorAll('.sr-only')) {
            const m = span.textContent.match(/(\d+)% of readers chose (.+)/i);
            if (m) result[m[2].toLowerCase()] = parseInt(m[1], 10);
        }
        return Object.keys(result).length ? result : null;
    }
    return null;
}

/**
 * Converts a review section data map to a string.
 * 'majority' mode returns just the dominant label when it exceeds 50%; falls back to 'full'.
 */
export function formatReviewSection(data, communityReviewFormat) {
    if (!data) return '';

    if (communityReviewFormat === 'majority') {
        let maxLabel = null, maxPct = 0;
        for (const [label, pct] of Object.entries(data)) {
            if (pct > maxPct) { maxPct = pct; maxLabel = label; }
        }
        if (maxPct > 50 && maxLabel) {
            return maxLabel.charAt(0).toUpperCase() + maxLabel.slice(1);
        }
    }

    return Object.entries(data)
        .map(([label, pct]) => `${pct}% ${label.charAt(0).toUpperCase() + label.slice(1)}`)
        .join(' ');
}
