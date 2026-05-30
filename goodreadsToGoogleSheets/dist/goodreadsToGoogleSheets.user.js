// ==UserScript==
// @name         Goodreads to Google Sheets
// @namespace    https://github.com/laurinsorgend
// @version      1.0
// @author       laurin@sorgend.eu
// @description  Adds a button to send book information directly to Google Sheets using Googles API
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToGoogleSheets/dist/goodreadsToGoogleSheets.user.js
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsToGoogleSheets/dist/goodreadsToGoogleSheets.meta.js
// @match        https://www.goodreads.com/book/show/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/10.9.0/jsrsasign-all-min.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  function getText(primary, fallbacks = []) {
    let el = document.querySelector(primary);
    let i = 0;
    while (!el && i < fallbacks.length) {
      el = document.querySelector(fallbacks[i++]);
    }
    return el ? el.textContent.trim() : "";
  }
  function getMonthNumber(monthName) {
    const months = {
      January: 1,
      February: 2,
      March: 3,
      April: 4,
      May: 5,
      June: 6,
      July: 7,
      August: 8,
      September: 9,
      October: 10,
      November: 11,
      December: 12
    };
    return months[monthName] || 1;
  }
  function extractPageCount() {
    const pagesEl = document.querySelector('p[data-testid="pagesFormat"]');
    if (pagesEl) {
      const match = pagesEl.textContent.match(/(\d+)\s+pages/);
      if (match) return match[1];
    }
    const formatText = getText(".BookDetails__info span", [".BookDetails__format"]);
    if (formatText) {
      const match = formatText.match(/(\d+)\s+pages/);
      if (match) return match[1];
    }
    const details = document.querySelectorAll(".BookDetails .BookDetails__list span, .BookDetails__metadata span");
    for (const el of details) {
      if (el.textContent.includes("pages")) {
        return el.textContent.replace(/\D/g, "");
      }
    }
    return "";
  }
  function waitForElement(selector, callback, checkFreq = 100, timeout = 15e3) {
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
  var _GM_addStyle = /* @__PURE__ */ (() => typeof GM_addStyle != "undefined" ? GM_addStyle : void 0)();
  var _GM_getValue = /* @__PURE__ */ (() => typeof GM_getValue != "undefined" ? GM_getValue : void 0)();
  var _GM_setValue = /* @__PURE__ */ (() => typeof GM_setValue != "undefined" ? GM_setValue : void 0)();
  var _GM_xmlhttpRequest = /* @__PURE__ */ (() => typeof GM_xmlhttpRequest != "undefined" ? GM_xmlhttpRequest : void 0)();
  const DEFAULT_SETTINGS = {
    fieldOrder: [
      "title",
      "seriesName",
      "seriesNumber",
      "type",
      "pages",
      "personalRating",
      "goodreadsRating",
      "author",
      "narrator",
      "publishDate",
      "timesRead",
      "plan",
      "dateAdded",
      "recommendedBy",
      "link"
    ],
    customEmptyFields: [],
    constantFields: [],
    separator: "	",
    authorFormat: "lastFirst",
    dateFormat: "full",
    dateAddedFormat: "full",
    googleSheets: {
      serviceAccountJson: "",
      spreadsheetId: "",
      sheetName: "Sheet1",
      columnMapping: []
    }
  };
  const FIELD_DEFINITIONS = {
    title: {
      label: "Title",
      extract: () => getText("h1.Text__title1", [".BookPageTitleSection h1", ".BookPageTitleSection__title"]),
      format: (value) => value
    },
    seriesName: {
      label: "Series Name",
      extract: () => {
        const elements = document.querySelectorAll("h3.Text__title3 a, .BookPageTitleSection__series a");
        if (!elements.length) return "";
        const text = elements[0].textContent.trim();
        const match = text.match(/^(.+?)\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/);
        return match ? match[1].trim() : text;
      },
      format: (value) => value
    },
    seriesNumber: {
      label: "Series Number",
      extract: () => {
        const elements = document.querySelectorAll("h3.Text__title3 a, .BookPageTitleSection__series a");
        if (!elements.length) return "";
        const text = elements[0].textContent.trim();
        const match = text.match(/\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/);
        return match ? match[1] : "";
      },
      format: (value) => value
    },
    type: {
      label: "Type",
      extract: () => {
        const pages = extractPageCount();
        if (!pages) return "";
        const pageNum = parseInt(pages, 10);
        if (pageNum <= 40) return "Short Story";
        if (pageNum <= 300) return "Novella";
        return "Novel";
      },
      format: (value) => value
    },
    pages: {
      label: "Pages",
      extract: () => extractPageCount(),
      format: (value) => value
    },
    goodreadsRating: {
      label: "Goodreads Rating",
      extract: () => getText(".RatingStatistics__rating", ['[data-testid="averageRating"]', ".BookPageMetadataSection__ratingStats span"]),
      format: (value) => value
    },
    author: {
      label: "Author",
      extract: () => getText(".ContributorLink__name", [".BookPageMetadataSection__contributor a", ".AuthorLink__name"]),
      format: (value, settings) => {
        if (!value) return "";
        if (settings.authorFormat === "lastFirst") {
          const parts = value.split(" ");
          if (parts.length > 1) {
            const last = parts.pop();
            const first = parts.join(" ");
            return `${last}, ${first}`;
          }
        }
        return value;
      }
    },
    publishDate: {
      label: "Published Date",
      extract: () => {
        const pubEl = document.querySelector('p[data-testid="publicationInfo"]');
        let text = pubEl ? pubEl.textContent.trim() : getText(".BookDetails__row span", [".BookDetails__publication"]);
        if (!text) return "";
        const fullMatch = text.match(/(?:First |)published\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
        if (fullMatch) return { month: fullMatch[1], day: fullMatch[2], year: fullMatch[3] };
        const yearMatch = text.match(/(?:First |)published\s+(\d{4})/i);
        if (yearMatch) return { year: yearMatch[1] };
        return "";
      },
      format: (value, settings) => {
        if (!value || typeof value === "string") return value;
        const formats = {
          "full": `${value.month} ${value.day}, ${value.year}`,
          "yearOnly": value.year,
          "iso": value.month && value.day ? `${value.year}-${String(getMonthNumber(value.month)).padStart(2, "0")}-${String(value.day).padStart(2, "0")}` : value.year
        };
        return formats[settings.dateFormat] || formats.full;
      }
    },
    plan: {
      label: "Plan",
      extract: () => "99",
      format: (value) => value
    },
    dateAdded: {
      label: "Date Added",
      extract: () => /* @__PURE__ */ new Date(),
      format: (value, settings) => {
        const formats = {
          "full": value.toLocaleDateString("en-UK", { year: "numeric", month: "short", day: "numeric" }),
          "iso": value.toISOString().split("T")[0],
          "us": value.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
        };
        return formats[settings.dateAddedFormat] || formats.full;
      }
    },
    link: {
      label: "Goodreads Link",
      extract: () => window.location.href,
      format: (value) => value
    }
  };
  class SettingsManager {
    constructor() {
      this.settings = this.load();
    }
    load() {
      try {
        const saved = _GM_getValue("settings", null);
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }
    save() {
      try {
        _GM_setValue("settings", JSON.stringify(this.settings));
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
      this.settings.customEmptyFields = this.settings.customEmptyFields.filter((f) => f.id !== id);
      this.settings.fieldOrder = this.settings.fieldOrder.filter((f) => f !== id);
      this.save();
    }
    getCustomEmptyField(id) {
      return this.settings.customEmptyFields.find((f) => f.id === id);
    }
    addConstantField(label, value) {
      const id = `const_${Date.now()}`;
      this.settings.constantFields.push({ id, label, value });
      this.save();
      return id;
    }
    removeConstantField(id) {
      this.settings.constantFields = this.settings.constantFields.filter((f) => f.id !== id);
      this.settings.fieldOrder = this.settings.fieldOrder.filter((f) => f !== id);
      this.save();
    }
    getConstantField(id) {
      return this.settings.constantFields.find((f) => f.id === id);
    }
    updateConstantField(id, label, value) {
      const field = this.settings.constantFields.find((f) => f.id === id);
      if (field) {
        field.label = label;
        field.value = value;
        this.save();
      }
    }
    asObject() {
      return { ...this.settings };
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
      this.settings.get("customEmptyFields").forEach((field) => {
        definitions[field.id] = {
          label: field.label,
          extract: () => "",
          format: (value) => value,
          isCustom: true
        };
      });
      this.settings.get("constantFields").forEach((field) => {
        definitions[field.id] = {
          label: field.label,
          extract: () => field.value,
          format: (value) => value,
          isConstant: true
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
          data[key] = "";
        }
      }
      return data;
    }
    format(data) {
      const formatted = {};
      const definitions = this.getAllFieldDefinitions();
      for (const [key, definition] of Object.entries(definitions)) {
        try {
          formatted[key] = definition.format(data[key], this.settings.asObject());
        } catch (e) {
          formatted[key] = data[key] || "";
        }
      }
      return formatted;
    }
    buildOutput(formatted) {
      const order = this.settings.get("fieldOrder");
      const separator = this.settings.get("separator");
      return order.map((field) => formatted[field] || "").join(separator);
    }
    getBookInfo() {
      const raw = this.extract();
      const formatted = this.format(raw);
      return this.buildOutput(formatted);
    }
    getFormattedData() {
      return this.format(this.extract());
    }
  }
  class GoogleSheetsManager {
    constructor(settings) {
      this.settings = settings;
      this.accessToken = null;
      this.tokenExpiration = 0;
    }
    async getAccessToken() {
      const now = Math.floor(Date.now() / 1e3);
      if (this.accessToken && now < this.tokenExpiration) {
        return this.accessToken;
      }
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      if (!sheetsSettings.serviceAccountJson) {
        throw new Error("Service Account JSON is not configured.");
      }
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(sheetsSettings.serviceAccountJson);
      } catch (e) {
        throw new Error("Invalid Service Account JSON format.");
      }
      if (!serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error("Service Account JSON is missing required fields.");
      }
      const claim = {
        iss: serviceAccount.client_email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
      };
      const sHeader = JSON.stringify({ alg: "RS256", typ: "JWT" });
      const sPayload = JSON.stringify(claim);
      const sJWT = window.KJUR.jws.JWS.sign("RS256", sHeader, sPayload, serviceAccount.private_key);
      return new Promise((resolve, reject) => {
        _GM_xmlhttpRequest({
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
          onerror: (error) => {
            reject(new Error(`Network error getting token: ${error.error}`));
          },
          ontimeout: () => {
            reject(new Error("Token request timed out"));
          }
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
        _GM_xmlhttpRequest({
          method: "GET",
          url,
          headers: { "Authorization": `Bearer ${accessToken}` },
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              try {
                const data = JSON.parse(response.responseText);
                resolve(data.values && data.values.length > 0 ? data.values[0] : []);
              } catch (e) {
                reject(new Error("Failed to parse headers"));
              }
            } else {
              reject(new Error("Failed to fetch headers: " + response.responseText));
            }
          },
          onerror: (e) => reject(new Error("Network error fetching headers"))
        });
      });
    }
    async appendToSheet(data) {
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
        throw new Error("Google Sheets settings are not configured. Please open the settings modal to configure your credentials.");
      }
      const formattedData = this.formatDataForSheet(data);
      const accessToken = await this.getAccessToken();
      return this.makeApiRequest(formattedData, sheetsSettings, accessToken);
    }
    formatDataForSheet(data) {
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      const mapping = sheetsSettings.columnMapping;
      const order = mapping && mapping.length > 0 ? mapping : this.settings.get("fieldOrder");
      const values = order.map((field) => {
        if (!field || field === "_empty_") return "";
        return data[field] || "";
      });
      return { values };
    }
    makeApiRequest(data, settings, accessToken) {
      return new Promise((resolve, reject) => {
        const range = encodeURIComponent(`'${settings.sheetName}'!A:A`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
        const requestBody = {
          values: [data.values]
        };
        _GM_xmlhttpRequest({
          method: "POST",
          url,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          data: JSON.stringify(requestBody),
          onload: (response) => {
            var _a;
            if (response.status >= 200 && response.status < 300) {
              try {
                const result = JSON.parse(response.responseText);
                resolve(result);
              } catch (e) {
                reject(new Error("Invalid response from Google Sheets API"));
              }
            } else {
              let errorMessage = "Unknown error";
              try {
                const errorData = JSON.parse(response.responseText);
                errorMessage = ((_a = errorData.error) == null ? void 0 : _a.message) || errorMessage;
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
            reject(new Error("Request timed out"));
          }
        });
      });
    }
    validateSettings() {
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      const errors = [];
      if (!sheetsSettings.serviceAccountJson) {
        errors.push("Service Account JSON is required");
      } else {
        try {
          const json = JSON.parse(sheetsSettings.serviceAccountJson);
          if (!json.client_email || !json.private_key) {
            errors.push("Service Account JSON missing required fields");
          }
        } catch {
          errors.push("Invalid Service Account JSON");
        }
      }
      if (!sheetsSettings.spreadsheetId) {
        errors.push("Spreadsheet ID is required");
      }
      if (!sheetsSettings.sheetName) {
        errors.push("Sheet Name is required");
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
            .gr2gs-notification.error { background-color: #f44336; }

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

            .gr2gs-settings-section { margin-bottom: 25px; }
            .gr2gs-settings-section h3 { font-size: 18px; margin-bottom: 15px; color: #555; }
            .gr2gs-form-group { margin-bottom: 15px; }
            .gr2gs-form-group label { display: block; margin-bottom: 5px; font-weight: 500; color: #666; }
            
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

            .gr2gs-form-group textarea { resize: vertical; font-family: monospace; font-size: 12px; }
            .gr2gs-form-group .hint { font-size: 12px; color: #999; margin-top: 4px; }
            
            .gr2gs-button-group { display: flex; gap: 10px; margin-top: 20px; }
            .gr2gs-btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; }
            .gr2gs-btn-primary { background: #00635d; color: white; }
            .gr2gs-btn-primary:hover { background: #004d47; }
            .gr2gs-btn-secondary { background: #f0f0f0; color: #333; }
            .gr2gs-btn-secondary:hover { background: #e0e0e0; }
            
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

            @keyframes spin { to { transform: rotate(360deg); } }

            .gr2gs-error-message {
                color: #f44336;
                font-size: 14px;
                margin-top: 10px;
                padding: 10px;
                background: #ffebee;
                border-radius: 4px;
            }

            .gr2gs-tabs {
                display: flex;
                border-bottom: 2px solid #eee;
                margin-bottom: 20px;
            }

            .gr2gs-tab {
                padding: 12px 20px;
                cursor: pointer;
                border: none;
                background: none;
                font-size: 15px;
                font-weight: 500;
                color: #666;
                border-bottom: 2px solid transparent;
                margin-bottom: -2px;
                transition: all 0.2s;
            }

            .gr2gs-tab:hover {
                color: #00635d;
            }

            .gr2gs-tab.active {
                color: #00635d;
                border-bottom-color: #00635d;
            }

            .gr2gs-tab-content {
                display: none;
            }

            .gr2gs-tab-content.active {
                display: block;
            }

            .gr2gs-field-order {
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 10px;
                max-height: 250px;
                overflow-y: auto;
            }

            .gr2gs-field-item {
                display: flex;
                align-items: center;
                padding: 8px;
                margin-bottom: 5px;
                background: #f9f9f9;
                border-radius: 4px;
                cursor: move;
            }

            .gr2gs-field-item:hover {
                background: #f0f0f0;
            }

            .gr2gs-drag-handle {
                margin-right: 10px;
                color: #999;
            }

            .gr2gs-field-label {
                flex: 1;
            }

            .gr2gs-field-delete,
            .gr2gs-field-edit {
                background: #ff4444;
                color: white;
                border: none;
                border-radius: 3px;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 12px;
                margin-left: 5px;
            }

            .gr2gs-field-edit {
                background: #2196F3;
            }

            .gr2gs-field-delete:hover {
                background: #cc0000;
            }

            .gr2gs-field-edit:hover {
                background: #1976D2;
            }

            .gr2gs-add-field-container {
                display: flex;
                gap: 10px;
                margin-top: 10px;
            }

            .gr2gs-add-field-input {
                flex: 1;
            }

            .gr2gs-constant-fields {
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #eee;
            }

            .gr2gs-constant-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px;
                margin-bottom: 5px;
                background: #f9f9f9;
                border-radius: 4px;
            }

            .gr2gs-constant-item label {
                flex: 1;
                margin: 0;
            }

            .gr2gs-constant-item input {
                flex: 1;
                padding: 6px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 13px;
            }

            .gr2gs-btn-small {
                padding: 6px 12px;
                font-size: 13px;
            }
        `;
      if (typeof _GM_addStyle === "function") {
        _GM_addStyle(css);
      } else {
        const styleNode = document.createElement("style");
        styleNode.textContent = css;
        document.head.appendChild(styleNode);
      }
    }
    static showNotification(message, duration = 2e3, isError = false) {
      const existing = document.querySelector(".gr2gs-notification");
      if (existing) existing.remove();
      const notification = document.createElement("div");
      notification.className = `gr2gs-notification${isError ? " error" : ""}`;
      notification.textContent = message;
      document.body.appendChild(notification);
      setTimeout(() => notification.classList.add("show"), 10);
      setTimeout(() => {
        notification.classList.remove("show");
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }
    static createSettingsModal(settings, extractor, sheetsManager) {
      const modal = document.createElement("div");
      modal.className = "gr2gs-settings-modal";
      modal.innerHTML = `
            <div class="gr2gs-settings-content">
                <div class="gr2gs-settings-header">
                    <div class="gr2gs-settings-title">Settings</div>
                    <button class="gr2gs-close">&times;</button>
                </div>

                <div class="gr2gs-tabs">
                    <button class="gr2gs-tab active" data-tab="format">Format</button>
                    <button class="gr2gs-tab" data-tab="fields">Fields</button>
                    <button class="gr2gs-tab" data-tab="sheets">Google Sheets</button>
                </div>

                <div id="gr2gs-tab-format" class="gr2gs-tab-content active">
                    <div class="gr2gs-settings-section">
                        <h3>Format Options</h3>
                        <div class="gr2gs-form-group">
                            <label for="gr2gs-separator">Field Separator</label>
                            <select id="gr2gs-separator">
                                <option value="	">Tab</option>
                                <option value=",">Comma</option>
                                <option value=";">Semicolon</option>
                                <option value="|">Pipe</option>
                            </select>
                        </div>
                        <div class="gr2gs-form-group">
                            <label for="gr2gs-author-format">Author Format</label>
                            <select id="gr2gs-author-format">
                                <option value="full">Full Name</option>
                                <option value="lastFirst">Last, First</option>
                            </select>
                        </div>
                        <div class="gr2gs-form-group">
                            <label for="gr2gs-date-format">Publish Date Format</label>
                            <select id="gr2gs-date-format">
                                <option value="full">Month Day, Year</option>
                                <option value="yearOnly">Year Only</option>
                                <option value="iso">ISO (YYYY-MM-DD)</option>
                            </select>
                        </div>
                        <div class="gr2gs-form-group">
                            <label for="gr2gs-dateadded-format">Date Added Format</label>
                            <select id="gr2gs-dateadded-format">
                                <option value="full">UK Format</option>
                                <option value="us">US Format</option>
                                <option value="iso">ISO (YYYY-MM-DD)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div id="gr2gs-tab-fields" class="gr2gs-tab-content">
                    <div class="gr2gs-settings-section">
                        <h3>Field Order (Drag to Reorder)</h3>
                        <div class="gr2gs-field-order" id="gr2gs-field-list"></div>
                    </div>

                    <div class="gr2gs-settings-section">
                        <h3>Custom Empty Fields</h3>
                        <div id="gr2gs-custom-fields-list"></div>
                        <div class="gr2gs-add-field-container">
                            <input type="text" id="gr2gs-new-custom-field" class="gr2gs-add-field-input" placeholder="Empty field name">
                            <button class="gr2gs-btn gr2gs-btn-primary gr2gs-btn-small" id="gr2gs-add-custom-field">Add</button>
                        </div>
                    </div>

                    <div class="gr2gs-settings-section gr2gs-constant-fields">
                        <h3>Constant Fields</h3>
                        <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                            Add fields with a fixed value (e.g., Plan = "99", Recommended = "John Doe")
                        </p>
                        <div id="gr2gs-constant-fields-list"></div>
                        <div class="gr2gs-add-field-container">
                            <input type="text" id="gr2gs-new-constant-label" class="gr2gs-add-field-input" placeholder="Field name" style="flex: 1;">
                            <input type="text" id="gr2gs-new-constant-value" placeholder="Value" style="flex: 1;">
                            <button class="gr2gs-btn gr2gs-btn-primary gr2gs-btn-small" id="gr2gs-add-constant">Add</button>
                        </div>
                    </div>
                </div>

                <div id="gr2gs-tab-sheets" class="gr2gs-tab-content">
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
                </div>

                <div class="gr2gs-button-group" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                    <button class="gr2gs-btn gr2gs-btn-primary" id="gr2gs-save">Save Settings</button>
                    <button class="gr2gs-btn gr2gs-btn-secondary" id="gr2gs-reset">Reset to Default</button>
                    <button class="gr2gs-btn gr2gs-btn-secondary" id="gr2gs-cancel">Cancel</button>
                </div>

                <div class="gr2gs-settings-section" style="margin-top: 20px;">
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
      this.populateSettings(modal, settings, extractor);
      this.attachSettingsHandlers(modal, settings, extractor, sheetsManager);
      return modal;
    }
    static populateSettings(modal, settings, extractor) {
      modal.querySelector("#gr2gs-separator").value = settings.get("separator");
      modal.querySelector("#gr2gs-author-format").value = settings.get("authorFormat");
      modal.querySelector("#gr2gs-date-format").value = settings.get("dateFormat");
      modal.querySelector("#gr2gs-dateadded-format").value = settings.get("dateAddedFormat");
      const sheetsSettings = settings.getGoogleSheetsSettings();
      modal.querySelector("#gr2gs-service-account").value = sheetsSettings.serviceAccountJson || "";
      modal.querySelector("#gr2gs-spreadsheet-id").value = sheetsSettings.spreadsheetId || "";
      modal.querySelector("#gr2gs-sheet-name").value = sheetsSettings.sheetName || "Sheet1";
      this.populateFieldOrder(modal, settings, extractor);
      this.populateCustomFields(modal, settings);
      this.populateConstantFields(modal, settings);
    }
    static populateFieldOrder(modal, settings, extractor) {
      const fieldList = modal.querySelector("#gr2gs-field-list");
      fieldList.innerHTML = "";
      const allDefinitions = extractor.getAllFieldDefinitions();
      const order = settings.get("fieldOrder");
      order.forEach((fieldKey) => {
        const definition = allDefinitions[fieldKey];
        if (!definition) return;
        const item = document.createElement("div");
        item.className = "gr2gs-field-item";
        item.dataset.field = fieldKey;
        item.draggable = true;
        const dragHandle = document.createElement("span");
        dragHandle.className = "gr2gs-drag-handle";
        dragHandle.textContent = "☰";
        const label = document.createElement("span");
        label.className = "gr2gs-field-label";
        label.textContent = definition.label;
        item.appendChild(dragHandle);
        item.appendChild(label);
        fieldList.appendChild(item);
      });
      this.attachDragHandlers(fieldList);
    }
    static populateCustomFields(modal, settings) {
      const container = modal.querySelector("#gr2gs-custom-fields-list");
      container.innerHTML = "";
      const customFields = settings.get("customEmptyFields") || [];
      customFields.forEach((field) => {
        const item = document.createElement("div");
        item.className = "gr2gs-field-item";
        item.innerHTML = `
                <span class="gr2gs-drag-handle">☰</span>
                <span class="gr2gs-field-label">${field.label}</span>
                <button class="gr2gs-field-delete" data-id="${field.id}">Delete</button>
            `;
        container.appendChild(item);
      });
    }
    static populateConstantFields(modal, settings) {
      const container = modal.querySelector("#gr2gs-constant-fields-list");
      container.innerHTML = "";
      const constantFields = settings.get("constantFields") || [];
      constantFields.forEach((field) => {
        const item = document.createElement("div");
        item.className = "gr2gs-constant-item";
        item.dataset.id = field.id;
        item.innerHTML = `
                <label>${field.label}</label>
                <input type="text" class="gr2gs-constant-value" value="${field.value}">
                <button class="gr2gs-field-delete" data-id="${field.id}">Delete</button>
            `;
        container.appendChild(item);
      });
    }
    static attachDragHandlers(container) {
      let draggedItem = null;
      container.addEventListener("dragstart", (e) => {
        draggedItem = e.target.closest(".gr2gs-field-item");
        e.dataTransfer.effectAllowed = "move";
      });
      container.addEventListener("dragover", (e) => {
        e.preventDefault();
        const afterElement = this.getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
          container.appendChild(draggedItem);
        } else {
          container.insertBefore(draggedItem, afterElement);
        }
      });
    }
    static getDragAfterElement(container, y) {
      const draggableElements = [...container.querySelectorAll(".gr2gs-field-item:not(.dragging)")];
      return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset, element: child };
        } else {
          return closest;
        }
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    static attachSettingsHandlers(modal, settings, extractor, sheetsManager) {
      modal.querySelector(".gr2gs-close").addEventListener("click", () => modal.classList.remove("show"));
      modal.querySelector("#gr2gs-cancel").addEventListener("click", () => modal.classList.remove("show"));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("show");
      });
      modal.querySelectorAll(".gr2gs-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          modal.querySelectorAll(".gr2gs-tab").forEach((t) => t.classList.remove("active"));
          modal.querySelectorAll(".gr2gs-tab-content").forEach((c) => c.classList.remove("active"));
          tab.classList.add("active");
          modal.querySelector(`#gr2gs-tab-${tab.dataset.tab}`).classList.add("active");
        });
      });
      modal.querySelector("#gr2gs-add-custom-field").addEventListener("click", () => {
        const input = modal.querySelector("#gr2gs-new-custom-field");
        const name = input.value.trim();
        if (!name) {
          this.showNotification("Please enter a field name", 2e3, true);
          return;
        }
        const id = settings.addCustomEmptyField(name);
        const order = settings.get("fieldOrder");
        order.push(id);
        settings.set("fieldOrder", order);
        input.value = "";
        this.populateFieldOrder(modal, settings, extractor);
        this.populateCustomFields(modal, settings);
        this.showNotification(`Added "${name}"`);
      });
      modal.querySelector("#gr2gs-custom-fields-list").addEventListener("click", (e) => {
        if (e.target.classList.contains("gr2gs-field-delete")) {
          const id = e.target.dataset.id;
          const field = settings.getCustomEmptyField(id);
          if (confirm(`Delete "${field == null ? void 0 : field.label}"?`)) {
            settings.removeCustomEmptyField(id);
            this.populateFieldOrder(modal, settings, extractor);
            this.populateCustomFields(modal, settings);
          }
        }
      });
      modal.querySelector("#gr2gs-add-constant").addEventListener("click", () => {
        const labelInput = modal.querySelector("#gr2gs-new-constant-label");
        const valueInput = modal.querySelector("#gr2gs-new-constant-value");
        const label = labelInput.value.trim();
        const value = valueInput.value.trim();
        if (!label) {
          this.showNotification("Please enter a field name", 2e3, true);
          return;
        }
        const id = settings.addConstantField(label, value);
        const order = settings.get("fieldOrder");
        order.push(id);
        settings.set("fieldOrder", order);
        labelInput.value = "";
        valueInput.value = "";
        this.populateFieldOrder(modal, settings, extractor);
        this.populateConstantFields(modal, settings);
        this.showNotification(`Added constant "${label}"`);
      });
      modal.querySelector("#gr2gs-constant-fields-list").addEventListener("click", (e) => {
        if (e.target.classList.contains("gr2gs-field-delete")) {
          const id = e.target.dataset.id;
          const field = settings.getConstantField(id);
          if (confirm(`Delete constant "${field == null ? void 0 : field.label}"?`)) {
            settings.removeConstantField(id);
            this.populateFieldOrder(modal, settings, extractor);
            this.populateConstantFields(modal, settings);
          }
        }
      });
      modal.querySelector("#gr2gs-constant-fields-list").addEventListener("input", (e) => {
        if (e.target.classList.contains("gr2gs-constant-value")) {
          const item = e.target.closest(".gr2gs-constant-item");
          const id = item.dataset.id;
          const field = settings.getConstantField(id);
          if (field) {
            field.value = e.target.value;
            settings.save();
          }
        }
      });
      const renderMappingUI = (headers, currentMapping) => {
        const container = modal.querySelector("#gr2gs-mapping-container");
        container.innerHTML = "";
        const allDefinitions = extractor.getAllFieldDefinitions();
        const fieldOptions = Object.entries(allDefinitions).map(([key, def]) => `<option value="${key}">${def.label}</option>`).join("");
        const emptyOption = `<option value="_empty_">-- Leave Empty --</option>`;
        headers.forEach((header, index) => {
          const row = document.createElement("div");
          row.className = "gr2gs-form-group";
          row.style.display = "flex";
          row.style.alignItems = "center";
          row.style.gap = "15px";
          row.style.marginBottom = "10px";
          let defaultValue = currentMapping && currentMapping[index] ? currentMapping[index] : "";
          if (!defaultValue) {
            const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "");
            for (const [key, def] of Object.entries(allDefinitions)) {
              const normalizedLabel = def.label.toLowerCase().replace(/[^a-z0-9]/g, "");
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
            row.querySelector("select").value = defaultValue;
          }
          container.appendChild(row);
        });
        modal.querySelector("#gr2gs-mapping-section").style.display = "block";
      };
      modal.querySelector("#gr2gs-save").addEventListener("click", () => {
        settings.set("separator", modal.querySelector("#gr2gs-separator").value);
        settings.set("authorFormat", modal.querySelector("#gr2gs-author-format").value);
        settings.set("dateFormat", modal.querySelector("#gr2gs-date-format").value);
        settings.set("dateAddedFormat", modal.querySelector("#gr2gs-dateadded-format").value);
        const fieldItems = modal.querySelectorAll("#gr2gs-field-list .gr2gs-field-item");
        const newOrder = Array.from(fieldItems).map((item) => item.dataset.field);
        settings.set("fieldOrder", newOrder);
        const constantItems = modal.querySelectorAll("#gr2gs-constant-fields-list .gr2gs-constant-item");
        constantItems.forEach((item) => {
          const id = item.dataset.id;
          const value = item.querySelector(".gr2gs-constant-value").value;
          const field = settings.getConstantField(id);
          if (field) {
            field.value = value;
          }
        });
        settings.save();
        const serviceAccountJson = modal.querySelector("#gr2gs-service-account").value.trim();
        const spreadsheetId = modal.querySelector("#gr2gs-spreadsheet-id").value.trim();
        const sheetName = modal.querySelector("#gr2gs-sheet-name").value.trim();
        if (!serviceAccountJson || !spreadsheetId || !sheetName) {
          this.showNotification("Please fill in all Google Sheets fields", 2e3, true);
          return;
        }
        try {
          JSON.parse(serviceAccountJson);
        } catch (e) {
          this.showNotification("Invalid JSON format", 2e3, true);
          return;
        }
        const mappingSelects = modal.querySelectorAll(".gr2gs-mapping-select");
        let columnMapping = [];
        if (mappingSelects.length > 0) {
          columnMapping = Array.from(mappingSelects).sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index)).map((select) => select.value);
        } else {
          const sectionVisible = modal.querySelector("#gr2gs-mapping-section").style.display !== "none";
          if (!sectionVisible) {
            columnMapping = settings.getGoogleSheetsSettings().columnMapping || [];
          }
        }
        settings.setGoogleSheetsSettings({ serviceAccountJson, spreadsheetId, sheetName, columnMapping });
        this.showNotification("Settings saved!");
        modal.classList.remove("show");
      });
      modal.querySelector("#gr2gs-reset").addEventListener("click", () => {
        if (confirm("Reset all settings to default?")) {
          settings.reset();
          this.populateSettings(modal, settings, extractor);
          this.showNotification("Settings reset to default");
        }
      });
      modal.querySelector("#gr2gs-test-load").addEventListener("click", async () => {
        const serviceAccountJson = modal.querySelector("#gr2gs-service-account").value.trim();
        const spreadsheetId = modal.querySelector("#gr2gs-spreadsheet-id").value.trim();
        const sheetName = modal.querySelector("#gr2gs-sheet-name").value.trim();
        const errorDiv = modal.querySelector("#gr2gs-error-message");
        if (!serviceAccountJson || !spreadsheetId || !sheetName) {
          errorDiv.textContent = "Please fill in all fields first";
          errorDiv.style.display = "block";
          return;
        }
        try {
          JSON.parse(serviceAccountJson);
        } catch (e) {
          errorDiv.textContent = "Invalid Service Account JSON";
          errorDiv.style.display = "block";
          return;
        }
        errorDiv.style.display = "none";
        const testButton = modal.querySelector("#gr2gs-test-load");
        const originalText = testButton.textContent;
        testButton.textContent = "Connecting...";
        testButton.disabled = true;
        try {
          const tempSettingsManager = { getGoogleSheetsSettings: () => ({ serviceAccountJson, spreadsheetId, sheetName }) };
          const tempSheetsManager = new GoogleSheetsManager(tempSettingsManager);
          const headers = await tempSheetsManager.getSheetHeaders();
          if (!headers || headers.length === 0) {
            throw new Error("Connected, but found no headers in row 1. Please add headers to your sheet.");
          }
          this.showNotification("Connected! Loading columns...");
          const currentMapping = settings.getGoogleSheetsSettings().columnMapping;
          renderMappingUI(headers, currentMapping);
          testButton.textContent = originalText;
          testButton.disabled = false;
        } catch (error) {
          testButton.textContent = originalText;
          testButton.disabled = false;
          errorDiv.textContent = `Error: ${error.message}`;
          errorDiv.style.display = "block";
          this.showNotification("Connection failed", 3e3, true);
        }
      });
    }
    static addButtons(onCopy, onSettings, onSendToSheets) {
      const buttonBar = this.findButtonBar();
      if (!buttonBar) return;
      const buttonGroup = document.createElement("div");
      buttonGroup.className = "ButtonGroup ButtonGroup--block";
      const settingsButtonContainer = document.createElement("div");
      settingsButtonContainer.className = "Button__container";
      settingsButtonContainer.innerHTML = `
            <button type="button" class="Button Button--secondary Button--medium Button--rounded" aria-label="Copy settings">
                <span class="Button__labelItem">
                    <i class="Icon ChevronIcon">
                        <svg viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.12-.22.07-.49.12-.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65z"/></svg>
                    </i>
                </span>
            </button>
        `;
      const sendToSheetsButtonContainer = document.createElement("div");
      sendToSheetsButtonContainer.className = "Button__container Button__container--block";
      sendToSheetsButtonContainer.innerHTML = `
            <button type="button" class="Button Button--secondary Button--medium Button--block" aria-label="Send to Google Sheets">
                <span class="Button__labelItem">Sheets</span>
            </button>
        `;
      settingsButtonContainer.querySelector("button").addEventListener("click", onSettings);
      sendToSheetsButtonContainer.querySelector("button").addEventListener("click", onSendToSheets);
      buttonGroup.appendChild(sendToSheetsButtonContainer);
      buttonGroup.appendChild(settingsButtonContainer);
      buttonBar.appendChild(buttonGroup);
    }
    static findButtonBar() {
      return document.querySelector(".BookActions") || document.querySelector('div[class*="BookActions"]') || document.querySelector(".BookPage__rightColumn");
    }
  }
  function initialize() {
    const settings = new SettingsManager();
    const extractor = new BookInfoExtractor(settings);
    const sheetsManager = new GoogleSheetsManager(settings);
    let settingsModal = null;
    UI.addStyles();
    waitForElement("h1.Text__title1, .BookPageTitleSection h1", () => {
      setTimeout(() => {
        UI.addButtons(
          function() {
            const info = extractor.getBookInfo();
            if (!info) {
              UI.showNotification("Error extracting book info", 3e3);
              return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(info).then(() => {
                UI.showNotification("Book info copied!");
              }).catch(() => UI.showNotification("Copy failed", 3e3));
            }
          },
          () => {
            if (!settingsModal) {
              settingsModal = UI.createSettingsModal(settings, extractor, sheetsManager);
            }
            settingsModal.classList.add("show");
          },
          async function() {
            const sheetsSettings = settings.getGoogleSheetsSettings();
            if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
              UI.showNotification("Please configure Google Sheets settings first", 3e3, true);
              if (!settingsModal) {
                settingsModal = UI.createSettingsModal(settings, extractor, sheetsManager);
              }
              settingsModal.classList.add("show");
              return;
            }
            const info = extractor.getFormattedData();
            const label = this.querySelector(".Button__labelItem");
            const original = label.innerHTML;
            try {
              label.innerHTML = '<span class="gr2gs-loading"></span>Sending...';
              await sheetsManager.appendToSheet(info);
              label.innerHTML = original;
              UI.showNotification("Book info sent to Google Sheets!");
            } catch (error) {
              label.innerHTML = original;
              UI.showNotification(error.message, 5e3, true);
            }
          }
        );
      }, 500);
    });
  }
  setTimeout(initialize, 500);

})();