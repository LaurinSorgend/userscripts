import { waitForElement } from './utils.js';
import SettingsManager from './SettingsManager.js';
import BookInfoExtractor from './BookInfoExtractor.js';
import GoogleSheetsManager from './GoogleSheetsManager.js';
import UI from './UI.js';

function initialize() {
    const settings = new SettingsManager();
    const extractor = new BookInfoExtractor(settings);
    const sheetsManager = new GoogleSheetsManager(settings);
    let settingsModal = null;

    UI.addStyles();

    const openSettings = () => {
        if (!settingsModal) {
            settingsModal = UI.createSettingsModal(settings, extractor, sheetsManager);
        }
        settingsModal.classList.add('show');
    };

    const sendToSheets = async function () {
        const sheetsSettings = settings.getGoogleSheetsSettings();

        if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
            UI.showNotification('Please configure Google Sheets settings first', 3000, true);
            openSettings();
            return;
        }

        const info = extractor.getFormattedData();
        const label = this.querySelector('svg') ? this.lastChild : this;
        const original = label.textContent;

        try {
            label.textContent = ' Sending...';
            this.disabled = true;
            await sheetsManager.appendToSheet(info);
            label.textContent = original;
            this.disabled = false;
            UI.showNotification('Book sent to Google Sheets!');
        } catch (error) {
            label.textContent = original;
            this.disabled = false;
            UI.showNotification(error.message, 5000, true);
        }
    };

    waitForElement('.book-title-author-and-series', () => {
        setTimeout(() => UI.addButtons(openSettings, sendToSheets), 500);
    });
}

function hookSpaNavigation(callback) {
    const orig = (type) => {
        const fn = history[type];
        return function (...args) {
            fn.apply(this, args);
            callback();
        };
    };
    history.pushState = orig('pushState');
    history.replaceState = orig('replaceState');
}

setTimeout(() => {
    initialize();
    hookSpaNavigation(() => setTimeout(initialize, 600));
}, 500);
