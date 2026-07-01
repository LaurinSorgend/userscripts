import { waitForElement, sendToSheet } from '../../shared/utils.js';
import SettingsManager from '../../shared/SettingsManager.js';
import InfoExtractor from '../../shared/InfoExtractor.js';
import GoogleSheetsManager from '../../shared/GoogleSheetsManager.js';
import UI from './UI.js';
import { FIELD_DEFINITIONS, DEBUG, DEFAULT_SETTINGS } from './constants.js';

function initialize() {
    const settings = new SettingsManager({ storageKey: 'sg2gs_settings', defaultSettings: DEFAULT_SETTINGS });
    const extractor = new InfoExtractor(settings, { fieldDefinitions: FIELD_DEFINITIONS, debug: DEBUG });
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
            await sendToSheet(sheetsManager, extractor, info, UI, 'Book');
        } catch (error) {
            UI.showNotification(error.message, 5000, true);
        } finally {
            label.textContent = original;
            this.disabled = false;
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
