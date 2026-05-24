import { waitForElement } from './utils.js';
import SettingsManager from './SettingsManager.js';
import AlbumInfoExtractor from './AlbumInfoExtractor.js';
import GoogleSheetsManager from './GoogleSheetsManager.js';
import UI from './UI.js';

function initialize() {
    const settings = new SettingsManager();
    const extractor = new AlbumInfoExtractor(settings);
    const sheetsManager = new GoogleSheetsManager(settings);
    let settingsModal = null;

    UI.addStyles();

    waitForElement('script#release_schema, h1', () => {
        setTimeout(() => {
            UI.addButtons(
                function () {
                    const info = extractor.getAlbumInfo();
                    if (!info) {
                        UI.showNotification('Error extracting album info', 3000, true);
                        return;
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(info).then(() => {
                            UI.showNotification('Album info copied!');
                        }).catch(() => UI.showNotification('Copy failed', 3000, true));
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
                    const original = this.innerHTML;

                    try {
                        this.innerHTML = '<span class="d2gs-loading"></span>Sending...';
                        this.disabled = true;
                        await sheetsManager.appendToSheet(info);
                        this.innerHTML = original;
                        this.disabled = false;
                        UI.showNotification('Album sent to Google Sheets!');
                    } catch (error) {
                        this.innerHTML = original;
                        this.disabled = false;
                        UI.showNotification(error.message, 5000, true);
                    }
                }
            );
        }, 500);
    });
}

setTimeout(initialize, 500);
