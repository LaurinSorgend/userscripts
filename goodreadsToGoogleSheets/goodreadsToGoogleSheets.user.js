// ==UserScript==
// @name         Goodreads to Google Sheets
// @namespace    https://github.com/laurinsorgend
// @version      0.1
// @description  Adds a button to send book information directly to Google Sheets using Googles API
// @author       laurin@sorgend.eu
// @match        https://www.goodreads.com/book/show/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_info
// @require      https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/10.9.0/jsrsasign-all-min.js
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToGoogleSheets/goodreadsToGoogleSheets.meta.js
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToGoogleSheets/goodreadsToGoogleSheets.user.js
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const DEBUG = false;

    const FIELD_DEFINITIONS = {
        title: {
            label: 'Title',
            extract: () => getText('h1.Text__title1', ['.BookPageTitleSection h1', '.BookPageTitleSection__title']),
            format: (value) => value
        },
        seriesName: {
            label: 'Series Name',
            extract: () => {
                const elements = document.querySelectorAll('h3.Text__title3 a, .BookPageTitleSection__series a');
                if (!elements.length) return '';

                const text = elements[0].textContent.trim();
                const match = text.match(/^(.+?)\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/);
                return match ? match[1].trim() : text;
            },
            format: (value) => value
        },
        seriesNumber: {
            label: 'Series Number',
            extract: () => {
                const elements = document.querySelectorAll('h3.Text__title3 a, .BookPageTitleSection__series a');
                if (!elements.length) return '';

                const text = elements[0].textContent.trim();
                const match = text.match(/\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/);
                return match ? match[1] : '';
            },
            format: (value) => value
        },
        type: {
            label: 'Type',
            extract: () => {
                const pages = FIELD_DEFINITIONS.pages.extract();
                if (!pages) return '';

                const pageNum = parseInt(pages, 10);
                if (pageNum <= 40) return 'Short Story';
                if (pageNum <= 300) return 'Novella';
                return 'Novel';
            },
            format: (value) => value
        },
        pages: {
            label: 'Pages',
            extract: () => {
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
            },
            format: (value) => value
        },
        goodreadsRating: {
            label: 'Goodreads Rating',
            extract: () => getText('.RatingStatistics__rating', ['[data-testid="averageRating"]', '.BookPageMetadataSection__ratingStats span']),
            format: (value) => value
        },
        author: {
            label: 'Author',
            extract: () => getText('.ContributorLink__name', ['.BookPageMetadataSection__contributor a', '.AuthorLink__name']),
            format: (value, settings) => {
                if (!value) return '';
                if (settings.authorFormat === 'lastFirst') {
                    const parts = value.split(' ');
                    if (parts.length > 1) {
                        const last = parts.pop();
                        const first = parts.join(' ');
                        return `${last}, ${first}`;
                    }
                }
                return value;
            }
        },
        publishDate: {
            label: 'Published Date',
            extract: () => {
                const pubEl = document.querySelector('p[data-testid="publicationInfo"]');
                let text = pubEl ? pubEl.textContent.trim() : getText('.BookDetails__row span', ['.BookDetails__publication']);

                if (!text) return '';

                const fullMatch = text.match(/(?:First |)published\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
                if (fullMatch) return { month: fullMatch[1], day: fullMatch[2], year: fullMatch[3] };

                const yearMatch = text.match(/(?:First |)published\s+(\d{4})/i);
                if (yearMatch) return { year: yearMatch[1] };

                return '';
            },
            format: (value, settings) => {
                if (!value || typeof value === 'string') return value;

                const formats = {
                    'full': `${value.month} ${value.day}, ${value.year}`,
                    'yearOnly': value.year,
                    'iso': value.month && value.day ?
                        `${value.year}-${String(getMonthNumber(value.month)).padStart(2, '0')}-${String(value.day).padStart(2, '0')}` :
                        value.year
                };

                return formats[settings.dateFormat] || formats.full;
            }
        },
        plan: {
            label: 'Plan',
            extract: () => '99',
            format: (value) => value
        },
        dateAdded: {
            label: 'Date Added',
            extract: () => new Date(),
            format: (value, settings) => {
                const formats = {
                    'full': value.toLocaleDateString('en-UK', { year: 'numeric', month: 'short', day: 'numeric' }),
                    'iso': value.toISOString().split('T')[0],
                    'us': value.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                };
                return formats[settings.dateAddedFormat] || formats.full;
            }
        },
        link: {
            label: 'Goodreads Link',
            extract: () => window.location.href,
            format: (value) => value
        }
    };

    const DEFAULT_SETTINGS = {
        fieldOrder: ['title', 'seriesName', 'seriesNumber', 'type', 'pages', 'personalRating',
            'goodreadsRating', 'author', 'narrator', 'publishDate', 'timesRead',
            'plan', 'dateAdded', 'recommendedBy', 'link'],
        customEmptyFields: [],
        separator: '\t',
        authorFormat: 'lastFirst',
        dateFormat: 'full',
        dateAddedFormat: 'full',
        googleSheets: {
            serviceAccountJson: '',
            spreadsheetId: '',
            sheetName: 'Sheet1',
            columnMapping: []
        }
    };

    class SettingsManager {
        constructor() {
            this.settings = this.load();
        }

        load() {
            try {
                const saved = GM_getValue('settings', null);
                return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
            } catch {
                return { ...DEFAULT_SETTINGS };
            }
        }

        save() {
            try {
                GM_setValue('settings', JSON.stringify(this.settings));
                return true;
            } catch {
                return false;
            }
        }

        get(key) {
            return this.settings[key];
        }

        set(key, value) {
            this.settings[key] = value;
            this.save();
        }

        reset() {
            this.settings = { ...DEFAULT_SETTINGS };
            this.save();
        }

        addCustomEmptyField(label) {
            const id = `custom_${Date.now()}`;
            this.settings.customEmptyFields.push({ id, label });
            this.save();
            return id;
        }

        removeCustomEmptyField(id) {
            this.settings.customEmptyFields = this.settings.customEmptyFields.filter(f => f.id !== id);
            this.settings.fieldOrder = this.settings.fieldOrder.filter(f => f !== id);
            this.save();
        }

        getCustomEmptyField(id) {
            return this.settings.customEmptyFields.find(f => f.id === id);
        }

        getGoogleSheetsSettings() {
            return this.settings.googleSheets || DEFAULT_SETTINGS.googleSheets;
        }

        setGoogleSheetsSettings(settings) {
            this.settings.googleSheets = { ...this.settings.googleSheets, ...settings };
            this.save();
        }
    }

    class BookInfoExtractor {
        constructor(settings) {
            this.settings = settings;
        }

        getAllFieldDefinitions() {
            const definitions = { ...FIELD_DEFINITIONS };

            this.settings.get('customEmptyFields').forEach(field => {
                definitions[field.id] = {
                    label: field.label,
                    extract: () => '',
                    format: (value) => value,
                    isCustom: true
                };
            });

            return definitions;
        }

        extract() {
            const data = {};
            const definitions = this.getAllFieldDefinitions();

            for (const [key, definition] of Object.entries(definitions)) {
                try {
                    data[key] = definition.extract();
                } catch (e) {
                    if (DEBUG) console.error(`Error extracting ${key}:`, e);
                    data[key] = '';
                }
            }

            return data;
        }

        format(data) {
            const formatted = {};
            const definitions = this.getAllFieldDefinitions();

            for (const [key, definition] of Object.entries(definitions)) {
                try {
                    formatted[key] = definition.format(data[key], this.settings.settings);
                } catch (e) {
                    if (DEBUG) console.error(`Error formatting ${key}:`, e);
                    formatted[key] = data[key] || '';
                }
            }

            return formatted;
        }

        buildOutput(formatted) {
            const order = this.settings.get('fieldOrder');
            const separator = this.settings.get('separator');

            return order.map(field => formatted[field] || '').join(separator);
        }

        getBookInfo() {
            const raw = this.extract();
            const formatted = this.format(raw);
            return this.buildOutput(formatted);
        }

        getFormattedData() {
            const raw = this.extract();
            const formatted = this.format(raw);
            return formatted;
        }
    }

    class GoogleSheetsManager {
        constructor(settings) {
            this.settings = settings;
            this.accessToken = null;
            this.tokenExpiration = 0;
        }

        async getAccessToken() {
            const now = Math.floor(Date.now() / 1000);
            if (this.accessToken && now < this.tokenExpiration) {
                return this.accessToken;
            }

            const sheetsSettings = this.settings.getGoogleSheetsSettings();
            if (!sheetsSettings.serviceAccountJson) {
                throw new Error('Service Account JSON is not configured.');
            }

            let serviceAccount;
            try {
                serviceAccount = JSON.parse(sheetsSettings.serviceAccountJson);
            } catch (e) {
                throw new Error('Invalid Service Account JSON format.');
            }

            if (!serviceAccount.client_email || !serviceAccount.private_key) {
                throw new Error('Service Account JSON is missing required fields.');
            }

            const claim = {
                iss: serviceAccount.client_email,
                scope: "https://www.googleapis.com/auth/spreadsheets",
                aud: "https://oauth2.googleapis.com/token",
                exp: now + 3600,
                iat: now
            };

            const sHeader = JSON.stringify({ alg: 'RS256', typ: 'JWT' });
            const sPayload = JSON.stringify(claim);
            const sJWT = KJUR.jws.JWS.sign("RS256", sHeader, sPayload, serviceAccount.private_key);

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "POST",
                    url: "https://oauth2.googleapis.com/token",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    data: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + sJWT,
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                const tokenData = JSON.parse(response.responseText);
                                this.accessToken = tokenData.access_token;
                                this.tokenExpiration = now + tokenData.expires_in - 60; // Buffer of 60s
                                resolve(this.accessToken);
                            } catch (e) {
                                reject(new Error("Failed to parse token response"));
                            }
                        } else {
                            reject(new Error("Failed to get access token: " + response.responseText));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error(`Network error getting token: ${error.error}`));
                    },
                    ontimeout: () => {
                        reject(new Error('Token request timed out'));
                    }
                });
            });
        }

        async getSheetHeaders() {
            const settings = this.settings.getGoogleSheetsSettings();
            if (!settings.spreadsheetId || !settings.sheetName) return [];

            const accessToken = await this.getAccessToken();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${settings.sheetName}!1:1`;

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const data = JSON.parse(response.responseText);
                                resolve(data.values && data.values.length > 0 ? data.values[0] : []);
                            } catch (e) {
                                reject(new Error('Failed to parse headers'));
                            }
                        } else {
                            reject(new Error('Failed to fetch headers: ' + response.responseText));
                        }
                    },
                    onerror: (e) => reject(new Error('Network error fetching headers'))
                });
            });
        }

        async appendToSheet(data) {
            const sheetsSettings = this.settings.getGoogleSheetsSettings();

            if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
                throw new Error('Google Sheets settings are not configured. Please open the settings modal to configure your credentials.');
            }

            const formattedData = this.formatDataForSheet(data);

            try {
                const accessToken = await this.getAccessToken();
                const response = await this.makeApiRequest(formattedData, sheetsSettings, accessToken);
                return response;
            } catch (error) {
                throw new Error(`Failed to append to sheet: ${error.message}`);
            }
        }

        formatDataForSheet(data) {
            const sheetsSettings = this.settings.getGoogleSheetsSettings();
            const mapping = sheetsSettings.columnMapping;

            // Fallback to default fieldOrder if no mapping exists
            const order = (mapping && mapping.length > 0) ? mapping : this.settings.get('fieldOrder');

            const values = order.map(field => {
                if (!field || field === '_empty_') return '';
                return data[field] || '';
            });

            return { values };
        }

        makeApiRequest(data, settings, accessToken) {
            return new Promise((resolve, reject) => {
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${settings.sheetName}:append?valueInputOption=USER_ENTERED`;

                // Only send the values (data row), ignoring headers to prevent duplicates on every append
                const requestBody = {
                    values: [data.values]
                };

                GM_xmlhttpRequest({
                    method: 'POST',
                    url: url,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    data: JSON.stringify(requestBody),
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const result = JSON.parse(response.responseText);
                                resolve(result);
                            } catch (e) {
                                reject(new Error('Invalid response from Google Sheets API'));
                            }
                        } else {
                            let errorMessage = 'Unknown error';
                            try {
                                const errorData = JSON.parse(response.responseText);
                                errorMessage = errorData.error?.message || errorMessage;
                            } catch (e) {
                                errorMessage = response.responseText || errorMessage;
                            }
                            reject(new Error(errorMessage));
                        }
                    },
                    onerror: (error) => {
                        reject(new Error(`Network error: ${error.error}`));
                    },
                    ontimeout: () => {
                        reject(new Error('Request timed out'));
                    }
                });
            });
        }

        validateSettings() {
            const sheetsSettings = this.settings.getGoogleSheetsSettings();
            const errors = [];

            if (!sheetsSettings.serviceAccountJson) {
                errors.push('Service Account JSON is required');
            } else {
                try {
                    const json = JSON.parse(sheetsSettings.serviceAccountJson);
                    if (!json.client_email || !json.private_key) {
                        errors.push('Service Account JSON missing required fields');
                    }
                } catch {
                    errors.push('Invalid Service Account JSON');
                }
            }

            if (!sheetsSettings.spreadsheetId) {
                errors.push('Spreadsheet ID is required');
            }

            if (!sheetsSettings.sheetName) {
                errors.push('Sheet Name is required');
            }

            return errors;
        }
    }

    class UI {
        static addStyles() {
            const css = `
                .gr2gs-notification {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background-color: #4caf50;
                    color: white;
                    padding: 16px;
                    border-radius: 4px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    z-index: 9999;
                    opacity: 0;
                    transition: opacity 0.3s ease-in-out;
                }
                .gr2gs-notification.show { opacity: 1; }
                .gr2gs-notification.error {
                    background-color: #f44336;
                }

                .gr2gs-settings-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0,0,0,0.5);
                    z-index: 10000;
                    overflow-y: auto;
                }
                .gr2gs-settings-modal.show { display: block; }

                .gr2gs-settings-content {
                    background: white;
                    max-width: 600px;
                    margin: 50px auto;
                    padding: 30px;
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }

                .gr2gs-settings-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #f0f0f0;
                }

                .gr2gs-settings-title {
                    font-size: 24px;
                    font-weight: bold;
                    color: #333;
                }

                .gr2gs-close {
                    cursor: pointer;
                    font-size: 28px;
                    color: #999;
                    background: none;
                    border: none;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    line-height: 30px;
                }
                .gr2gs-close:hover { color: #333; }

                .gr2gs-settings-section {
                    margin-bottom: 25px;
                }

                .gr2gs-settings-section h3 {
                    font-size: 18px;
                    margin-bottom: 15px;
                    color: #555;
                }

                .gr2gs-form-group {
                    margin-bottom: 15px;
                }

                .gr2gs-form-group label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: 500;
                    color: #666;
                }

                .gr2gs-form-group input,
                .gr2gs-form-group select,
                .gr2gs-form-group textarea {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    font-family: inherit;
                }

                .gr2gs-form-group textarea {
                    resize: vertical;
                    font-family: monospace;
                    font-size: 12px;
                }

                .gr2gs-form-group .hint {
                    font-size: 12px;
                    color: #999;
                    margin-top: 4px;
                }

                .gr2gs-button-group {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                }

                .gr2gs-btn {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    font-weight: 500;
                }

                .gr2gs-btn-primary {
                    background: #00635d;
                    color: white;
                }
                .gr2gs-btn-primary:hover { background: #004d47; }

                .gr2gs-btn-secondary {
                    background: #f0f0f0;
                    color: #333;
                }
                .gr2gs-btn-secondary:hover { background: #e0e0e0; }

                .gr2gs-btn-small {
                    padding: 6px 12px;
                    font-size: 13px;
                }

                .gr2gs-loading {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(255,255,255,0.3);
                    border-radius: 50%;
                    border-top-color: white;
                    animation: spin 1s ease-in-out infinite;
                    margin-right: 8px;
                    vertical-align: middle;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .gr2gs-error-message {
                    color: #f44336;
                    font-size: 14px;
                    margin-top: 10px;
                    padding: 10px;
                    background: #ffebee;
                    border-radius: 4px;
                }
            `;

            if (typeof GM_addStyle === 'function') {
                GM_addStyle(css);
            } else {
                const styleNode = document.createElement('style');
                styleNode.textContent = css;
                document.head.appendChild(styleNode);
            }
        }

        static showNotification(message, duration = 2000, isError = false) {
            const existing = document.querySelector('.gr2gs-notification');
            if (existing) existing.remove();

            const notification = document.createElement('div');
            notification.className = `gr2gs-notification${isError ? ' error' : ''}`;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => notification.classList.add('show'), 10);
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }

        static createSettingsModal(settings, extractor, sheetsManager) {
            const modal = document.createElement('div');
            modal.className = 'gr2gs-settings-modal';
            modal.innerHTML = `
                <div class="gr2gs-settings-content">
                    <div class="gr2gs-settings-header">
                        <div class="gr2gs-settings-title">Google Sheets Settings</div>
                        <button class="gr2gs-close">&times;</button>
                    </div>

                    <div class="gr2gs-settings-section">
                        <h3>Google Sheets API Configuration</h3>

                        <div class="gr2gs-form-group">
                            <label for="gr2gs-service-account">Service Account JSON</label>
                            <textarea id="gr2gs-service-account" rows="6" placeholder="Paste the entire Service Account JSON file content here"></textarea>
                            <div class="hint">The JSON file you downloaded from Google Cloud Console</div>
                        </div>

                        <div class="gr2gs-form-group">
                            <label for="gr2gs-spreadsheet-id">Spreadsheet ID</label>
                            <input type="text" id="gr2gs-spreadsheet-id" placeholder="Enter your spreadsheet ID">
                            <div class="hint">Found in the URL: https://docs.google.com/spreadsheets/d/<span style="font-family: monospace;">SPREADSHEET_ID</span>/edit</div>
                        </div>

                        <div class="gr2gs-form-group">
                            <label for="gr2gs-sheet-name">Sheet Name</label>
                            <input type="text" id="gr2gs-sheet-name" placeholder="Enter the sheet name">
                            <div class="hint">The name of the sheet where data will be appended</div>
                        </div>

                        <div id="gr2gs-error-message" class="gr2gs-error-message" style="display: none;"></div>

                        <div class="gr2gs-button-group">
                            <button class="gr2gs-btn gr2gs-btn-secondary" id="gr2gs-test-load">Test & Load Columns</button>
                        </div>
                    </div>

                    <div id="gr2gs-mapping-section" class="gr2gs-settings-section" style="display: none;">
                        <h3>Column Mapping</h3>
                        <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                            Map your Google Sheet columns to Goodreads data fields.
                        </p>
                        <div id="gr2gs-mapping-container"></div>
                    </div>

                    <div class="gr2gs-button-group" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                        <button class="gr2gs-btn gr2gs-btn-primary" id="gr2gs-save">Save Settings</button>
                        <button class="gr2gs-btn gr2gs-btn-secondary" id="gr2gs-cancel">Cancel</button>
                    </div>

                    <div class="gr2gs-settings-section" style="margin-top: 30px;">
                        <h3>How to Get Your Service Account</h3>
                        <ol style="font-size: 14px; color: #666; line-height: 1.6;">
                            <li>Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></li>
                            <li>Create a new project or select an existing one</li>
                            <li>Enable the <strong>Google Sheets API</strong></li>
                            <li>Go to <strong>IAM & Admin > Service Accounts</strong></li>
                            <li>Create a Service Account and create a Key (JSON)</li>
                            <li><strong>Important:</strong> Share your spreadsheet with the service account email (client_email in the JSON)</li>
                            <li>Copy the content of the JSON file and paste it above</li>
                        </ol>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            this.populateSettings(modal, settings);
            this.attachSettingsHandlers(modal, settings, extractor, sheetsManager);

            return modal;
        }

        static populateSettings(modal, settings) {
            const sheetsSettings = settings.getGoogleSheetsSettings();
            modal.querySelector('#gr2gs-service-account').value = sheetsSettings.serviceAccountJson || '';
            modal.querySelector('#gr2gs-spreadsheet-id').value = sheetsSettings.spreadsheetId || '';
            modal.querySelector('#gr2gs-sheet-name').value = sheetsSettings.sheetName || 'Sheet1';
        }

        static attachSettingsHandlers(modal, settings, extractor, sheetsManager) {
            modal.querySelector('.gr2gs-close').addEventListener('click', () => {
                modal.classList.remove('show');
            });

            modal.querySelector('#gr2gs-cancel').addEventListener('click', () => {
                modal.classList.remove('show');
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('show');
            });

            const renderMappingUI = (headers, currentMapping) => {
                const container = modal.querySelector('#gr2gs-mapping-container');
                container.innerHTML = '';

                const fieldOptions = Object.entries(extractor.getAllFieldDefinitions())
                    .map(([key, def]) => `<option value="${key}">${def.label}</option>`)
                    .join('');
                const emptyOption = `<option value="_empty_">-- Leave Empty --</option>`;

                headers.forEach((header, index) => {
                    const row = document.createElement('div');
                    row.className = 'gr2gs-form-group';
                    row.style.display = 'flex';
                    row.style.alignItems = 'center';
                    row.style.gap = '15px';
                    row.style.marginBottom = '10px';

                    // Try to guess default value
                    let defaultValue = currentMapping && currentMapping[index] ? currentMapping[index] : '';
                    if (!defaultValue) {
                        const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
                        for (const [key, def] of Object.entries(extractor.getAllFieldDefinitions())) {
                            const normalizedLabel = def.label.toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (normalizedHeader.includes(normalizedLabel) || normalizedLabel.includes(normalizedHeader)) {
                                defaultValue = key;
                                break;
                            }
                        }
                    }

                    row.innerHTML = `
                        <label style="width: 40%; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${header}">${header}</label>
                        <select class="gr2gs-mapping-select" data-index="${index}" style="width: 60%;">
                            ${emptyOption}
                            ${fieldOptions}
                        </select>
                    `;

                    if (defaultValue) {
                        row.querySelector('select').value = defaultValue;
                    }

                    container.appendChild(row);
                });

                modal.querySelector('#gr2gs-mapping-section').style.display = 'block';
            };

            // Pre-populate if we have existing mapping and can fetch headers?
            // Actually we don't know the headers unless we fetch them.
            // But we can check if credentials are there.

            modal.querySelector('#gr2gs-save').addEventListener('click', () => {
                const serviceAccountJson = modal.querySelector('#gr2gs-service-account').value.trim();
                const spreadsheetId = modal.querySelector('#gr2gs-spreadsheet-id').value.trim();
                const sheetName = modal.querySelector('#gr2gs-sheet-name').value.trim();

                if (!serviceAccountJson || !spreadsheetId || !sheetName) {
                    this.showNotification('Please fill in all fields', 2000, true);
                    return;
                }

                try {
                    JSON.parse(serviceAccountJson);
                } catch (e) {
                    this.showNotification('Invalid JSON format', 2000, true);
                    return;
                }

                // Collect Mapping
                const mappingSelects = modal.querySelectorAll('.gr2gs-mapping-select');
                let columnMapping = [];
                if (mappingSelects.length > 0) {
                    columnMapping = Array.from(mappingSelects)
                        .sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index))
                        .map(select => select.value);
                } else {
                    // Keep existing mapping if section wasn't opened?
                    // No, if user saves, we should probably keep what was there if UI wasn't loaded.
                    // But if UI was loaded, we take UI values.
                    const sectionVisible = modal.querySelector('#gr2gs-mapping-section').style.display !== 'none';
                    if (!sectionVisible) {
                        columnMapping = settings.getGoogleSheetsSettings().columnMapping || [];
                    }
                }

                settings.setGoogleSheetsSettings({ serviceAccountJson, spreadsheetId, sheetName, columnMapping });
                this.showNotification('Settings saved!');
                modal.classList.remove('show');
            });

            modal.querySelector('#gr2gs-test-load').addEventListener('click', async () => {
                const serviceAccountJson = modal.querySelector('#gr2gs-service-account').value.trim();
                const spreadsheetId = modal.querySelector('#gr2gs-spreadsheet-id').value.trim();
                const sheetName = modal.querySelector('#gr2gs-sheet-name').value.trim();
                const errorDiv = modal.querySelector('#gr2gs-error-message');

                if (!serviceAccountJson || !spreadsheetId || !sheetName) {
                    errorDiv.textContent = 'Please fill in all fields first';
                    errorDiv.style.display = 'block';
                    return;
                }

                try {
                    JSON.parse(serviceAccountJson);
                } catch (e) {
                    errorDiv.textContent = 'Invalid Service Account JSON';
                    errorDiv.style.display = 'block';
                    return;
                }

                errorDiv.style.display = 'none';

                const testButton = modal.querySelector('#gr2gs-test-load');
                const originalText = testButton.textContent;
                testButton.textContent = 'Connecting...';
                testButton.disabled = true;

                try {
                    const tempSettingsManager = {
                        getGoogleSheetsSettings: () => ({ serviceAccountJson, spreadsheetId, sheetName })
                    };
                    const tempSheetsManager = new GoogleSheetsManager(tempSettingsManager);

                    // Test connection by fetching headers
                    const headers = await tempSheetsManager.getSheetHeaders();

                    if (!headers || headers.length === 0) {
                        throw new Error('Connected, but found no headers in row 1. Please add headers to your sheet.');
                    }

                    this.showNotification('Connected! Loading columns...');

                    const currentMapping = settings.getGoogleSheetsSettings().columnMapping;
                    renderMappingUI(headers, currentMapping);

                    testButton.textContent = originalText;
                    testButton.disabled = false;
                } catch (error) {
                    testButton.textContent = originalText;
                    testButton.disabled = false;
                    errorDiv.textContent = `Error: ${error.message}`;
                    errorDiv.style.display = 'block';
                    this.showNotification('Connection failed', 3000, true);
                }
            });
        }

        static addButtons(onCopy, onSettings, onSendToSheets) {
            const buttonBar = this.findButtonBar();
            if (!buttonBar) return;

            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'ButtonGroup ButtonGroup--block';

            // const copyButtonContainer = document.createElement('div');
            // copyButtonContainer.className = 'Button__container Button__container--block';
            // copyButtonContainer.innerHTML = `
            //     <button type="button" class="Button Button--secondary Button--medium Button--block">
            //         <span class="Button__labelItem">Copy Info</span>
            //     </button>
            // `;

            const settingsButtonContainer = document.createElement('div');
            settingsButtonContainer.className = 'Button__container';
            settingsButtonContainer.innerHTML = `
                <button type="button" class="Button Button--secondary Button--medium Button--rounded" aria-label="Copy settings">
                    <span class="Button__labelItem">
                        <i class="Icon ChevronIcon">
                            <svg viewBox="0 0 24 24">
                                <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                                <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.12-.22.07-.49.12-.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/>
                            </svg>
                        </i>
                    </span>
                </button>
            `;

            const sendToSheetsButtonContainer = document.createElement('div');
            sendToSheetsButtonContainer.className = 'Button__container Button__container--block';
            sendToSheetsButtonContainer.innerHTML = `
                <button type="button" class="Button Button--secondary Button--medium Button--block" aria-label="Send to Google Sheets">
                    <span class="Button__labelItem">
                        <i class="Icon GoogleIcon">
                            <svg width="49px" height="67px" viewBox="0 0 49 67" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
                                <!-- Generator: Sketch 54.1 (76490) - https://sketchapp.com -->
                                <title>Sheets-icon</title>
                                <desc>Created with Sketch.</desc>
                                <defs>
                                    <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L29.5833333,0 Z" id="path-1"/>
                                    <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L29.5833333,0 Z" id="path-3"/>
                                    <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L29.5833333,0 Z" id="path-5"/>
                                    <linearGradient x1="50.0053945%" y1="8.58610612%" x2="50.0053945%" y2="100.013939%" id="linearGradient-7">
                                        <stop stop-color="#263238" stop-opacity="0.2" offset="0%"/>
                                        <stop stop-color="#263238" stop-opacity="0.02" offset="100%"/>
                                    </linearGradient>
                                    <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L29.5833333,0 Z" id="path-8"/>
                                    <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L29.5833333,0 Z" id="path-10"/>
                                    <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L29.5833333,0 Z" id="path-12"/>
                                    <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L29.5833333,0 Z" id="path-14"/>
                                    <radialGradient cx="3.16804688%" cy="2.71744318%" fx="3.16804688%" fy="2.71744318%" r="161.248516%" gradientTransform="translate(0.031680,0.027174),scale(1.000000,0.727273),translate(-0.031680,-0.027174)" id="radialGradient-16">
                                        <stop stop-color="#FFFFFF" stop-opacity="0.1" offset="0%"/>
                                        <stop stop-color="#FFFFFF" stop-opacity="0" offset="100%"/>
                                    </radialGradient>
                                </defs>
                                <g id="Page-1" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
                                    <g id="Consumer-Apps-Sheets-Large-VD-R8-" transform="translate(-451.000000, -451.000000)">
                                        <g id="Hero" transform="translate(0.000000, 63.000000)">
                                            <g id="Personal" transform="translate(277.000000, 299.000000)">
                                                <g id="Sheets-icon" transform="translate(174.833333, 89.958333)">
                                                    <g id="Group">
                                                        <g id="Clipped">
                                                            <mask id="mask-2" fill="white">
                                                                <use xlink:href="#path-1"/>
                                                            </mask>
                                                            <g id="SVGID_1_"/>
                                                            <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L36.9791667,10.3541667 L29.5833333,0 Z" id="Path" fill="#0F9D58" fill-rule="nonzero" mask="url(#mask-2)"/>
                                                        </g>
                                                        <g id="Clipped">
                                                            <mask id="mask-4" fill="white">
                                                                <use xlink:href="#path-3"/>
                                                            </mask>
                                                            <g id="SVGID_1_"/>
                                                            <path d="M11.8333333,31.8020833 L11.8333333,53.25 L35.5,53.25 L35.5,31.8020833 L11.8333333,31.8020833 Z M22.1875,50.2916667 L14.7916667,50.2916667 L14.7916667,46.59375 L22.1875,46.59375 L22.1875,50.2916667 Z M22.1875,44.375 L14.7916667,44.375 L14.7916667,40.6770833 L22.1875,40.6770833 L22.1875,44.375 Z M22.1875,38.4583333 L14.7916667,38.4583333 L14.7916667,34.7604167 L22.1875,34.7604167 L22.1875,38.4583333 Z M32.5416667,50.2916667 L25.1458333,50.2916667 L25.1458333,46.59375 L32.5416667,46.59375 L32.5416667,50.2916667 Z M32.5416667,44.375 L25.1458333,44.375 L25.1458333,40.6770833 L32.5416667,40.6770833 L32.5416667,44.375 Z M32.5416667,38.4583333 L25.1458333,38.4583333 L25.1458333,34.7604167 L32.5416667,34.7604167 L32.5416667,38.4583333 Z" id="Shape" fill="#F1F1F1" fill-rule="nonzero" mask="url(#mask-4)"/>
                                                        </g>
                                                        <g id="Clipped">
                                                            <mask id="mask-6" fill="white">
                                                                <use xlink:href="#path-5"/>
                                                            </mask>
                                                            <g id="SVGID_1_"/>
                                                            <polygon id="Path" fill="url(#linearGradient-7)" fill-rule="nonzero" mask="url(#mask-6)" points="30.8813021 16.4520313 47.3333333 32.9003646 47.3333333 17.75"/>
                                                        </g>
                                                        <g id="Clipped">
                                                            <mask id="mask-9" fill="white">
                                                                <use xlink:href="#path-8"/>
                                                            </mask>
                                                            <g id="SVGID_1_"/>
                                                            <g id="Group" mask="url(#mask-9)">
                                                                <g transform="translate(26.625000, -2.958333)">
                                                                    <path d="M2.95833333,2.95833333 L2.95833333,16.2708333 C2.95833333,18.7225521 4.94411458,20.7083333 7.39583333,20.7083333 L20.7083333,20.7083333 L2.95833333,2.95833333 Z" id="Path" fill="#87CEAC" fill-rule="nonzero"/>
                                                                </g>
                                                            </g>
                                                        </g>
                                                        <g id="Clipped">
                                                            <mask id="mask-11" fill="white">
                                                                <use xlink:href="#path-10"/>
                                                            </mask>
                                                            <g id="SVGID_1_"/>
                                                            <path d="M4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,4.80729167 C0,2.36666667 1.996875,0.369791667 4.4375,0.369791667 L29.5833333,0.369791667 L29.5833333,0 L4.4375,0 Z" id="Path" fill-opacity="0.2" fill="#FFFFFF" fill-rule="nonzero" mask="url(#mask-11)"/>
                                                        </g>
                                                        <g id="Clipped">
                                                            <mask id="mask-13" fill="white">
                                                                <use xlink:href="#path-12"/>
                                                            </mask>
                                                            <g id="SVGID_1_"/>
                                                            <path d="M42.8958333,64.7135417 L4.4375,64.7135417 C1.996875,64.7135417 0,62.7166667 0,60.2760417 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,60.2760417 C47.3333333,62.7166667 45.3364583,64.7135417 42.8958333,64.7135417 Z" id="Path" fill-opacity="0.2" fill="#263238" fill-rule="nonzero" mask="url(#mask-13)"/>
                                                        </g>
                                                        <g id="Clipped">
                                                            <mask id="mask-15" fill="white">
                                                                <use xlink:href="#path-14"/>
                                                            </mask>
                                                            <g id="SVGID_1_"/>
                                                            <path d="M34.0208333,17.75 C31.5691146,17.75 29.5833333,15.7642188 29.5833333,13.3125 L29.5833333,13.6822917 C29.5833333,16.1340104 31.5691146,18.1197917 34.0208333,18.1197917 L47.3333333,18.1197917 L47.3333333,17.75 L34.0208333,17.75 Z" id="Path" fill-opacity="0.1" fill="#263238" fill-rule="nonzero" mask="url(#mask-15)"/>
                                                        </g>
                                                    </g>
                                                    <path d="M29.5833333,0 L4.4375,0 C1.996875,0 0,1.996875 0,4.4375 L0,60.6458333 C0,63.0864583 1.996875,65.0833333 4.4375,65.0833333 L42.8958333,65.0833333 C45.3364583,65.0833333 47.3333333,63.0864583 47.3333333,60.6458333 L47.3333333,17.75 L29.5833333,0 Z" id="Path" fill="url(#radialGradient-16)" fill-rule="nonzero"/>
                                                </g>
                                            </g>
                                        </g>
                                    </g>
                                </g>
                            </svg>
                        </i>
                        Send to Sheets
                    </span>
                </button>
            `;

            settingsButtonContainer.querySelector('button').addEventListener('click', onSettings);
            sendToSheetsButtonContainer.querySelector('button').addEventListener('click', onSendToSheets);

            buttonGroup.appendChild(sendToSheetsButtonContainer);
            buttonGroup.appendChild(settingsButtonContainer);

            buttonBar.appendChild(buttonGroup);
        }

        static findButtonBar() {
            let bar = document.querySelector('.BookActions');
            if (!bar) {
                bar = Array.from(document.querySelectorAll('div[class*="BookActions"]'))
                    .find(el => el.className.includes('BookActions'));
            }
            if (!bar) {
                bar = document.querySelector('.BookPage__rightColumn');
            }
            return bar;
        }
    }

    function getText(primary, fallbacks = []) {
        let el = document.querySelector(primary);
        let i = 0;
        while (!el && i < fallbacks.length) {
            el = document.querySelector(fallbacks[i++]);
        }
        return el ? el.textContent.trim() : '';
    }

    function getMonthNumber(monthName) {
        const months = {
            January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
            July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
        };
        return months[monthName] || 1;
    }

    function waitForElement(selector, callback, checkFreq = 100, timeout = 15000) {
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

    function initialize() {
        const settings = new SettingsManager();
        const extractor = new BookInfoExtractor(settings);
        const sheetsManager = new GoogleSheetsManager(settings);
        let settingsModal = null;

        UI.addStyles();

        waitForElement('h1.Text__title1, .BookPageTitleSection h1', () => {
            setTimeout(() => {
                UI.addButtons(
                    function () {
                        const info = extractor.getBookInfo();
                        if (!info) {
                            UI.showNotification('Error extracting book info', 3000);
                            return;
                        }

                        if (copyToClipboard(info)) {
                            const label = this.querySelector('.Button__labelItem');
                            const original = label.textContent;
                            label.textContent = 'Copied!';
                            setTimeout(() => label.textContent = original, 1500);
                            UI.showNotification('Book info copied!');
                        } else {
                            UI.showNotification('Copy failed', 3000);
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        setTimeout(initialize, 500);
    }
})();
