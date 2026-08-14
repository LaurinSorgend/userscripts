import { waitForElement, sendToObsidian } from '../../shared/utils.js';
import SettingsManager from '../../shared/SettingsManager.js';
import InfoExtractor from '../../shared/InfoExtractor.js';
import ObsidianManager from '../../shared/ObsidianManager.js';
import UI from './UI.js';
import { FIELD_DEFINITIONS, DEBUG, DEFAULT_SETTINGS, toFrontmatterFields } from './constants.js';

function initialize() {
    const settings = new SettingsManager({ storageKey: 'gr2obs_settings', defaultSettings: DEFAULT_SETTINGS });
    const extractor = new InfoExtractor(settings, { fieldDefinitions: FIELD_DEFINITIONS, debug: DEBUG });
    const obsidianManager = new ObsidianManager(settings);
    let settingsModal = null;

    const openSettings = () => {
        if (!settingsModal) {
            settingsModal = UI.createSettingsModal(settings, extractor, obsidianManager);
        }
        settingsModal.classList.add('show');
    };

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
                openSettings,
                async function () {
                    const obsidianSettings = settings.getObsidianSettings();

                    if (!obsidianSettings.baseUrl || !obsidianSettings.apiKey) {
                        UI.showNotification('Please configure Obsidian settings first', 3000, true);
                        openSettings();
                        return;
                    }

                    const fmData = toFrontmatterFields(extractor.extract());
                    const label = this.querySelector('.Button__labelItem');
                    const original = label.innerHTML;

                    try {
                        label.innerHTML = '<span class="gr2obs-loading"></span>Sending...';
                        await sendToObsidian(obsidianManager, fmData, UI, 'Book note');
                    } catch (error) {
                        UI.showNotification(error.message, 5000, true);
                    } finally {
                        label.innerHTML = original;
                    }
                }
            );
        }, 500);
    });
}

setTimeout(initialize, 500);
