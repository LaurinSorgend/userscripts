import { getText } from '../../shared/utils.js';

export { getText, waitForElement } from '../../shared/utils.js';

export function getMonthNumber(monthName) {
    const months = {
        January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
        July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
    };
    return months[monthName] || 1;
}

export function extractPageCount() {
    const pagesEl = document.querySelector('p[data-testid="pagesFormat"]');
    if (pagesEl) {
        const match = pagesEl.textContent.match(/(\d+)\s+pages/);
        if (match) return match[1];
    }

    const formatText = getText('.BookDetails__info span', ['.BookDetails__format']);
    if (formatText) {
        const match = formatText.match(/(\d+)\s+pages/);
        if (match) return match[1];
    }

    const details = document.querySelectorAll('.BookDetails .BookDetails__list span, .BookDetails__metadata span');
    for (const el of details) {
        if (el.textContent.includes('pages')) {
            return el.textContent.replace(/\D/g, '');
        }
    }

    return '';
}
