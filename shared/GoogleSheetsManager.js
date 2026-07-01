import { GM_xmlhttpRequest } from '$';
import KJUR from 'jsrsasign';

/**
 * Shared Google Sheets connection used by all "*ToGoogleSheets" userscripts.
 * Talks to the Sheets API v4 using a service-account JWT (signed via jsrsasign)
 * and appends rows through GM_xmlhttpRequest so CORS is not an issue.
 *
 * The manager is agnostic of the concrete settings store: it only needs an
 * object exposing `getGoogleSheetsSettings()` and `get(key)` (i.e. a
 * SettingsManager instance).
 */
export default class GoogleSheetsManager {
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
                            this.tokenExpiration = now + tokenData.expires_in - 60;
                            resolve(this.accessToken);
                        } catch (e) {
                            reject(new Error("Failed to parse token response"));
                        }
                    } else {
                        reject(new Error("Failed to get access token: " + response.responseText));
                    }
                },
                onerror: (error) => reject(new Error(`Network error getting token: ${error.error}`)),
                ontimeout: () => reject(new Error('Token request timed out'))
            });
        });
    }

    async getSheetHeaders() {
        const settings = this.settings.getGoogleSheetsSettings();
        if (!settings.spreadsheetId || !settings.sheetName) return [];

        const accessToken = await this.getAccessToken();
        const range = encodeURIComponent(`'${settings.sheetName}'!1:1`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}`;

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
                onerror: () => reject(new Error('Network error fetching headers'))
            });
        });
    }

    async appendToSheet(data) {
        const sheetsSettings = this.settings.getGoogleSheetsSettings();

        if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
            throw new Error('Google Sheets settings are not configured. Please open the settings modal to configure your credentials.');
        }

        const formattedData = this.formatDataForSheet(data);
        const accessToken = await this.getAccessToken();
        return this.makeApiRequest(formattedData, sheetsSettings, accessToken);
    }

    /**
     * Send an item to the sheet, updating an existing row when one already holds
     * the same value in the configured match field instead of appending a
     * duplicate. Empty incoming values never overwrite existing data.
     *
     * @param {Object} data Formatted field map from the extractor.
     * @param {Function} [resolveConflicts] async (diffs) => ({ [colIndex]: value })
     *        | null. Called with the fields that would change so a UI can let the
     *        user choose; returning null aborts the update.
     * @returns {Promise<{action: 'appended'|'updated'|'unchanged'|'cancelled'}>}
     */
    async upsert(data, resolveConflicts) {
        const sheetsSettings = this.settings.getGoogleSheetsSettings();
        if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
            throw new Error('Google Sheets settings are not configured. Please open the settings modal to configure your credentials.');
        }

        const order = this.getEffectiveOrder();
        const newValues = this.formatDataForSheet(data).values;
        const matchCol = order.indexOf(this.getMatchFieldKey());

        if (matchCol === -1 || !this.normalize(newValues[matchCol])) {
            await this._appendRow(newValues);
            return { action: 'appended' };
        }

        const found = this.findExistingRow(await this.fetchRows(), matchCol, newValues[matchCol]);
        if (!found) {
            await this._appendRow(newValues);
            return { action: 'appended' };
        }

        return this._mergeAndUpdate(order, newValues, found, resolveConflicts);
    }

    /** Resolve conflicts (optionally via the callback) and write the merged row. */
    async _mergeAndUpdate(order, newValues, found, resolveConflicts) {
        const merged = order.map((key, i) => (newValues[i] !== '' ? newValues[i] : (found.row[i] ?? '')));

        const diffs = order.reduce((acc, key, i) => {
            const incoming = newValues[i] ?? '';
            const existing = found.row[i] ?? '';
            if (incoming !== '' && incoming !== existing) acc.push({ index: i, key, existing, incoming });
            return acc;
        }, []);

        if (diffs.length && typeof resolveConflicts === 'function') {
            const resolution = await resolveConflicts(diffs);
            if (resolution === null) return { action: 'cancelled' };
            for (const idx of Object.keys(resolution)) merged[idx] = resolution[idx];
        } else if (!diffs.length) {
            return { action: 'unchanged' };
        }

        await this._updateRow(found.rowNumber, merged);
        return { action: 'updated' };
    }

    /** Effective column order: explicit column mapping, else the field order. */
    getEffectiveOrder() {
        const mapping = this.settings.getGoogleSheetsSettings().columnMapping;
        return (mapping && mapping.length > 0) ? mapping : this.settings.get('fieldOrder');
    }

    getMatchFieldKey() {
        return this.settings.getGoogleSheetsSettings().matchField || 'link';
    }

    /** Loosely compare cell values (trim, lowercase, ignore trailing slash). */
    normalize(value) {
        return String(value ?? '').trim().toLowerCase().replace(/\/+$/, '');
    }

    /** All value rows of the sheet (including the header row). */
    async fetchRows() {
        const settings = this.settings.getGoogleSheetsSettings();
        const accessToken = await this.getAccessToken();
        const range = encodeURIComponent(`'${settings.sheetName}'`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}`;
        const data = await this._request('GET', url, null, accessToken);
        return data.values || [];
    }

    /** Find the first data row whose match column equals matchValue. */
    findExistingRow(rows, matchCol, matchValue) {
        const target = this.normalize(matchValue);
        for (let i = 1; i < rows.length; i++) {
            if (this.normalize(rows[i][matchCol]) === target) {
                return { rowNumber: i + 1, row: rows[i] };
            }
        }
        return null;
    }

    async _appendRow(values) {
        const settings = this.settings.getGoogleSheetsSettings();
        const accessToken = await this.getAccessToken();
        return this.makeApiRequest({ values }, settings, accessToken);
    }

    async _updateRow(rowNumber, values) {
        const settings = this.settings.getGoogleSheetsSettings();
        const accessToken = await this.getAccessToken();
        const lastCol = this.columnLetter(values.length);
        const range = encodeURIComponent(`'${settings.sheetName}'!A${rowNumber}:${lastCol}${rowNumber}`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;
        return this._request('PUT', url, { values: [values] }, accessToken);
    }

    /** 1-based column number to A1 column letters (1 -> A, 27 -> AA). */
    columnLetter(n) {
        let letter = '';
        while (n > 0) {
            const rem = (n - 1) % 26;
            letter = String.fromCharCode(65 + rem) + letter;
            n = Math.floor((n - 1) / 26);
        }
        return letter || 'A';
    }

    _request(method, url, body, accessToken) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method,
                url,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                data: body ? JSON.stringify(body) : undefined,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            resolve(JSON.parse(response.responseText));
                        } catch (e) {
                            reject(new Error('Invalid response from Google Sheets API'));
                        }
                    } else {
                        let message = 'Unknown error';
                        try {
                            message = JSON.parse(response.responseText).error?.message || message;
                        } catch (e) {
                            message = response.responseText || message;
                        }
                        reject(new Error(message));
                    }
                },
                onerror: (error) => reject(new Error(`Network error: ${error.error}`)),
                ontimeout: () => reject(new Error('Request timed out'))
            });
        });
    }

    formatDataForSheet(data) {
        const values = this.getEffectiveOrder().map(field => {
            if (!field || field === '_empty_') return '';
            return data[field] || '';
        });

        return { values };
    }

    makeApiRequest(data, settings, accessToken) {
        return new Promise((resolve, reject) => {
            const range = encodeURIComponent(`'${settings.sheetName}'!A:A`);
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

            GM_xmlhttpRequest({
                method: 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                data: JSON.stringify({ values: [data.values] }),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            resolve(JSON.parse(response.responseText));
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
                onerror: (error) => reject(new Error(`Network error: ${error.error}`)),
                ontimeout: () => reject(new Error('Request timed out'))
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

        if (!sheetsSettings.spreadsheetId) errors.push('Spreadsheet ID is required');
        if (!sheetsSettings.sheetName) errors.push('Sheet Name is required');

        return errors;
    }
}
