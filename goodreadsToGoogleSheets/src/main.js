import { waitForElement } from '../../shared/utils.js';
import SettingsManager from '../../shared/SettingsManager.js';
import InfoExtractor from '../../shared/InfoExtractor.js';
import GoogleSheetsManager from '../../shared/GoogleSheetsManager.js';
import UI from './UI.js';
import { FIELD_DEFINITIONS, DEBUG, DEFAULT_SETTINGS } from './constants.js';

function initialize() {
    const settings = new SettingsManager({ storageKey: 'settings', defaultSettings: DEFAULT_SETTINGS });
    const extractor = new InfoExtractor(settings, { fieldDefinitions: FIELD_DEFINITIONS, debug: DEBUG });
    const sheetsManager = new GoogleSheetsManager(settings);
    let settingsModal = null;

    UI.addStyles();

    waitForElement('h1.Text__title1, .BookPageTitleSection h1', () => {
        setTimeout(() => {
            UI.addButtons(
                function () {
                    const info = extractor.getInfo();
                    if (!info) {
                        UI.showNotification('Error extracting book info', 3000);
                        return;
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(info).then(() => {
                            UI.showNotification('Book info copied!');
                        }).catch(() => UI.showNotification('Copy failed', 3000));
                    }
                },
                () => {
                    if (!settingsModal) {
                        settingsModal = UI.createSettingsModal(settings, extractor, sheetsManager);
                    }
                    settingsModal.classList.add('show');
                },
                async function () {
                    const sheetsSettings = settings.getGoogleSheetsSettings();

                    if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
                        UI.showNotification('Please configure Google Sheets settings first', 3000, true);
                        if (!settingsModal) {
                            settingsModal = UI.createSettingsModal(settings, extractor, sheetsManager);
                        }
                        settingsModal.classList.add('show');
                        return;
                    }

                    const info = extractor.getFormattedData();
                    const label = this.querySelector('.Button__labelItem');
                    const original = label.innerHTML;

                    try {
                        label.innerHTML = '<span class="gr2gs-loading"></span>Sending...';
                        await sheetsManager.appendToSheet(info);
                        label.innerHTML = original;
                        UI.showNotification('Book info sent to Google Sheets!');
                    } catch (error) {
                        label.innerHTML = original;
                        UI.showNotification(error.message, 5000, true);
                    }
                }
            );
        }, 500);
    });
}

setTimeout(initialize, 500);
