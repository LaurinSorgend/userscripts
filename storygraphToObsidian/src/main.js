import { waitForElement, sendToObsidian } from '../../shared/utils.js';
import SettingsManager from '../../shared/SettingsManager.js';
import InfoExtractor from '../../shared/InfoExtractor.js';
import ObsidianManager from '../../shared/ObsidianManager.js';
import UI from './UI.js';
import { FIELD_DEFINITIONS, DEBUG, DEFAULT_SETTINGS, toFrontmatterFields } from './constants.js';

function initialize() {
    const settings = new SettingsManager({ storageKey: 'sg2obs_settings', defaultSettings: DEFAULT_SETTINGS });
    const extractor = new InfoExtractor(settings, { fieldDefinitions: FIELD_DEFINITIONS, debug: DEBUG });
    const obsidianManager = new ObsidianManager(settings);
    let settingsModal = null;

    UI.addStyles();

    const openSettings = () => {
        if (!settingsModal) {
            settingsModal = UI.createSettingsModal(settings, extractor, obsidianManager);
        }
        settingsModal.classList.add('show');
    };

    const sendToObsidianHandler = async function () {
        const obsidianSettings = settings.getObsidianSettings();

        if (!obsidianSettings.baseUrl || !obsidianSettings.apiKey) {
            UI.showNotification('Please configure Obsidian settings first', 3000, true);
            openSettings();
            return;
        }

        const fmData = toFrontmatterFields(extractor.extract());
        const label = this.querySelector('svg') ? this.lastChild : this;
        const original = label.textContent;

        try {
            label.textContent = ' Sending...';
            this.disabled = true;
            await sendToObsidian(obsidianManager, fmData, UI, 'Book note');
        } catch (error) {
            UI.showNotification(error.message, 5000, true);
        } finally {
            label.textContent = original;
            this.disabled = false;
        }
    };

    waitForElement('.book-title-author-and-series', () => {
        setTimeout(() => UI.addButtons(openSettings, sendToObsidianHandler), 500);
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
