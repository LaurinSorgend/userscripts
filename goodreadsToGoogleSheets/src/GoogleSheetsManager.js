import { GM_xmlhttpRequest } from '$';
import KJUR from 'jsrsasign';

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
        
        // BUGFIX 1: Quotes around sheet name to support spaces
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
        const accessToken = await this.getAccessToken();
        return this.makeApiRequest(formattedData, sheetsSettings, accessToken);
    }

    formatDataForSheet(data) {
        const sheetsSettings = this.settings.getGoogleSheetsSettings();
        const mapping = sheetsSettings.columnMapping;

        const order = (mapping && mapping.length > 0) ? mapping : this.settings.get('fieldOrder');

        const values = order.map(field => {
            if (!field || field === '_empty_') return '';
            return data[field] || '';
        });

        return { values };
    }

    makeApiRequest(data, settings, accessToken) {
        return new Promise((resolve, reject) => {
            // BUGFIX 2: Anchor the append to Column A
            const range = encodeURIComponent(`'${settings.sheetName}'!A:A`);
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

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