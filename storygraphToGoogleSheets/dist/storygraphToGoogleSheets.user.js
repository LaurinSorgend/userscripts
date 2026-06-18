// ==UserScript==
// @name         StoryGraph to Google Sheets
// @namespace    https://github.com/laurinsorgend
// @version      1.1
// @author       laurin@sorgend.eu
// @description  Adds a button to send book information from StoryGraph directly to Google Sheets
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/storygraphToGoogleSheets/dist/storygraphToGoogleSheets.user.js
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/storygraphToGoogleSheets/dist/storygraphToGoogleSheets.meta.js
// @match        https://app.thestorygraph.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/10.9.0/jsrsasign-all-min.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==

(function (KJUR) {
  'use strict';

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
  function extractReviewSection(headingText) {
    const frame = document.querySelector("turbo-frame#community_reviews");
    if (!frame) return null;
    const headings = frame.querySelectorAll("p.text-center.font-semibold");
    for (const h of headings) {
      if (h.textContent.trim() !== headingText) continue;
      const barContainer = h.nextElementSibling;
      if (!barContainer) continue;
      const result = {};
      for (const span of barContainer.querySelectorAll(".sr-only")) {
        const m = span.textContent.match(/(\d+)% of readers chose (.+)/i);
        if (m) result[m[2].toLowerCase()] = parseInt(m[1], 10);
      }
      return Object.keys(result).length ? result : null;
    }
    return null;
  }
  function formatReviewSection(data, communityReviewFormat) {
    if (!data) return "";
    if (communityReviewFormat === "majority") {
      let maxLabel = null, maxPct = 0;
      for (const [label, pct] of Object.entries(data)) {
        if (pct > maxPct) {
          maxPct = pct;
          maxLabel = label;
        }
      }
      if (maxPct > 50 && maxLabel) {
        return maxLabel.charAt(0).toUpperCase() + maxLabel.slice(1);
      }
    }
    return Object.entries(data).map(([label, pct]) => `${pct}% ${label.charAt(0).toUpperCase() + label.slice(1)}`).join(" ");
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
      "author",
      "pages",
      "type",
      "pubDate",
      "storygraphRating",
      "reviewCount",
      "genres",
      "moods",
      "pace",
      "plotVsCharacter",
      "strongCharDev",
      "loveableChars",
      "diverseCast",
      "flawsAsFocus",
      "coverUrl",
      "link",
      "dateAdded",
      "personalRating"
    ],
    customEmptyFields: [],
    constantFields: [],
    separator: "	",
    dateAddedFormat: "iso",
    communityReviewFormat: "full",
    googleSheets: {
      serviceAccountJson: "",
      spreadsheetId: "",
      sheetName: "Books",
      columnMapping: []
    }
  };
  function getAuthors() {
    const container = document.querySelector(".book-title-author-and-series");
    if (!container) return "";
    const authors = [];
    for (const p of container.querySelectorAll("p.font-body")) {
      if (p.textContent.includes("Translator") || p.textContent.includes("Narrator")) continue;
      for (const a of p.querySelectorAll("a")) {
        const name = a.textContent.trim();
        if (name) authors.push(name);
      }
    }
    return authors.join(", ");
  }
  function getPages() {
    for (const el of document.querySelectorAll(".toggle-edition-info-link")) {
      const match = el.textContent.trim().match(/^(\d+)\s+pages$/);
      if (match) return match[1];
    }
    return "";
  }
  function getCommunityField(headingText) {
    return {
      extract: () => extractReviewSection(headingText),
      format: (value, settings) => formatReviewSection(value, settings.communityReviewFormat)
    };
  }
  function getSeriesEl() {
    const container = document.querySelector(".book-title-author-and-series");
    return container ? container.querySelector("p.font-semibold.tracking-tight") : null;
  }
  const FIELD_DEFINITIONS = {
    title: {
      label: "Title",
      extract: () => {
        const el = document.querySelector(".book-title-author-and-series h3.font-serif, .book-title-author-and-series h3.font-semibold");
        return el ? el.textContent.trim() : "";
      },
      format: (value) => value
    },
    seriesName: {
      label: "Series Name",
      extract: () => {
        var _a, _b;
        const links = (_a = getSeriesEl()) == null ? void 0 : _a.querySelectorAll("a");
        return ((_b = links == null ? void 0 : links[0]) == null ? void 0 : _b.textContent.trim()) ?? "";
      },
      format: (value) => value
    },
    seriesNumber: {
      label: "Series Number",
      extract: () => {
        var _a, _b;
        const links = (_a = getSeriesEl()) == null ? void 0 : _a.querySelectorAll("a");
        return ((_b = links == null ? void 0 : links[1]) == null ? void 0 : _b.textContent.trim().replace(/^#/, "")) ?? "";
      },
      format: (value) => value
    },
    author: {
      label: "Author",
      extract: getAuthors,
      format: (value) => value
    },
    pages: {
      label: "Pages",
      extract: getPages,
      format: (value) => value
    },
    pubDate: {
      label: "Pub Date",
      extract: () => {
        for (const p of document.querySelectorAll(".edition-info p.text-sm")) {
          const label = p.querySelector("span.font-semibold");
          if ((label == null ? void 0 : label.textContent.trim()) === "Edition Pub Date:") {
            return p.textContent.replace(label.textContent, "").trim();
          }
        }
        return "";
      },
      format: (value) => value
    },
    type: {
      label: "Type",
      extract: () => {
        const pages = parseInt(getPages(), 10);
        if (isNaN(pages)) return "";
        if (pages <= 40) return "Short Story";
        if (pages <= 300) return "Novella";
        return "Novel";
      },
      format: (value) => value
    },
    storygraphRating: {
      label: "Rating",
      extract: () => {
        const frame = document.querySelector("turbo-frame#community_reviews");
        const el = (frame || document).querySelector(".average-star-rating");
        return el ? el.textContent.trim() : "";
      },
      format: (value) => value
    },
    reviewCount: {
      label: "Review Count",
      extract: () => {
        const frame = document.querySelector("turbo-frame#community_reviews");
        if (!frame) return "";
        const div = frame.querySelector('[aria-label*="based on"]');
        if (!div) return "";
        const m = div.getAttribute("aria-label").match(/based on (\d+) reviews/);
        return m ? m[1] : "";
      },
      format: (value) => value
    },
    genres: {
      label: "Genres",
      extract: () => {
        const section = document.querySelector(".book-page-tag-section");
        if (!section) return "";
        return Array.from(section.querySelectorAll("span")).map((s) => s.textContent.trim()).filter(Boolean).join(", ");
      },
      format: (value) => value
    },
    moods: {
      label: "Moods",
      extract: () => {
        const frame = document.querySelector("turbo-frame#community_reviews");
        if (!frame) return "";
        return Array.from(frame.querySelectorAll(".moods-list-reviews .mood-item p")).map((p) => p.textContent.trim()).join(", ");
      },
      format: (value) => value
    },
    pace: { label: "Pace", ...getCommunityField("Pace") },
    plotVsCharacter: { label: "Plot vs Character", ...getCommunityField("Plot or character driven?") },
    strongCharDev: { label: "Strong Char. Dev.", ...getCommunityField("Strong character development?") },
    loveableChars: { label: "Loveable Characters", ...getCommunityField("Loveable characters?") },
    diverseCast: { label: "Diverse Cast", ...getCommunityField("Diverse cast of characters?") },
    flawsAsFocus: { label: "Flaws as Focus", ...getCommunityField("Flaws of characters a main focus?") },
    coverUrl: {
      label: "Cover URL",
      extract: () => {
        const og = document.querySelector('meta[property="og:image"]');
        return og ? og.getAttribute("content") : "";
      },
      format: (value) => value
    },
    link: {
      label: "StoryGraph Link",
      extract: () => {
        const canonical = document.querySelector('link[rel="canonical"]');
        return canonical ? canonical.href : window.location.href;
      },
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
        return formats[settings.dateAddedFormat] || formats.iso;
      }
    },
    personalRating: {
      label: "Personal Rating",
      extract: () => "",
      format: (value) => value
    }
  };
  class SettingsManager {
    constructor() {
      this.settings = this.load();
    }
    load() {
      try {
        const saved = _GM_getValue("sg2gs_settings", null);
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    }
    save() {
      try {
        _GM_setValue("sg2gs_settings", JSON.stringify(this.settings));
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
      const sJWT = KJUR.jws.JWS.sign("RS256", sHeader, sPayload, serviceAccount.private_key);
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
          onerror: (error) => reject(new Error(`Network error getting token: ${error.error}`)),
          ontimeout: () => reject(new Error("Token request timed out"))
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
          onerror: () => reject(new Error("Network error fetching headers"))
        });
      });
    }
    async appendToSheet(data) {
      const sheetsSettings = this.settings.getGoogleSheetsSettings();
      if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
        throw new Error("Google Sheets settings are not configured. Please open the settings modal.");
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
        _GM_xmlhttpRequest({
          method: "POST",
          url,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          data: JSON.stringify({ values: [data.values] }),
          onload: (response) => {
            var _a;
            if (response.status >= 200 && response.status < 300) {
              try {
                resolve(JSON.parse(response.responseText));
              } catch (e) {
                reject(new Error("Invalid response from Google Sheets API"));
              }
            } else {
              let msg = "Unknown error";
              try {
                msg = ((_a = JSON.parse(response.responseText).error) == null ? void 0 : _a.message) || msg;
              } catch (e) {
                msg = response.responseText || msg;
              }
              reject(new Error(msg));
            }
          },
          onerror: (error) => reject(new Error(`Network error: ${error.error}`)),
          ontimeout: () => reject(new Error("Request timed out"))
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
          if (!json.client_email || !json.private_key) errors.push("Service Account JSON missing required fields");
        } catch {
          errors.push("Invalid Service Account JSON");
        }
      }
      if (!sheetsSettings.spreadsheetId) errors.push("Spreadsheet ID is required");
      if (!sheetsSettings.sheetName) errors.push("Sheet Name is required");
      return errors;
    }
  }
  class UI {
    static addStyles() {
      const css = `
            .sg2gs-notification {
                position: fixed; bottom: 20px; right: 20px;
                background-color: #4caf50; color: white; padding: 16px;
                border-radius: 4px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                z-index: 9999; opacity: 0; transition: opacity 0.3s ease-in-out;
            }
            .sg2gs-notification.show { opacity: 1; }
            .sg2gs-notification.error { background-color: #f44336; }

            .sg2gs-modal {
                display: none; position: fixed; top: 0; left: 0;
                width: 100%; height: 100%; background: rgba(0,0,0,0.5);
                z-index: 10000; overflow-y: auto;
            }
            .sg2gs-modal.show { display: block; }

            .sg2gs-content {
                background: #fff !important; color: #333 !important; max-width: 600px;
                margin: 50px auto; padding: 30px;
                border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }

            .sg2gs-header {
                display: flex; justify-content: space-between; align-items: center;
                margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #f0f0f0;
            }

            .sg2gs-title { font-size: 24px; font-weight: bold; color: #333 !important; }

            .sg2gs-close {
                cursor: pointer; font-size: 28px; color: #999 !important;
                background: none !important; border: none; padding: 0; width: 30px; height: 30px; line-height: 30px;
            }
            .sg2gs-close:hover { color: #333 !important; }

            .sg2gs-section { margin-bottom: 25px; }
            .sg2gs-section h3 { font-size: 18px; margin-bottom: 15px; color: #555 !important; }
            .sg2gs-group { margin-bottom: 15px; }
            .sg2gs-group label { display: block; margin-bottom: 5px; font-weight: 500; color: #444 !important; }

            .sg2gs-group input, .sg2gs-group select, .sg2gs-group textarea {
                width: 100%; padding: 8px; border: 1px solid #ddd !important;
                border-radius: 4px; font-size: 14px; font-family: inherit;
                background: #fff !important; color: #333 !important;
            }
            .sg2gs-group textarea { resize: vertical; font-family: monospace; font-size: 12px; }
            .sg2gs-group .hint { font-size: 12px; color: #888 !important; margin-top: 4px; }

            .sg2gs-btn-group { display: flex; gap: 10px; margin-top: 20px; }
            .sg2gs-btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; }
            .sg2gs-btn-primary { background: #00635d; color: white; }
            .sg2gs-btn-primary:hover { background: #004d47; }
            .sg2gs-btn-secondary { background: #f0f0f0; color: #333; }
            .sg2gs-btn-secondary:hover { background: #e0e0e0; }
            .sg2gs-btn-small { padding: 6px 12px; font-size: 13px; }

            .sg2gs-error {
                color: #f44336; font-size: 14px; margin-top: 10px;
                padding: 10px; background: #ffebee; border-radius: 4px;
            }

            .sg2gs-tabs { display: flex; border-bottom: 2px solid #eee; margin-bottom: 20px; }
            .sg2gs-tab {
                padding: 12px 20px; cursor: pointer; border: none; background: none !important;
                font-size: 15px; font-weight: 500; color: #666 !important;
                border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s;
            }
            .sg2gs-tab:hover { color: #00635d !important; }
            .sg2gs-tab.active { color: #00635d !important; border-bottom-color: #00635d; }
            .sg2gs-tab-content { display: none; }
            .sg2gs-tab-content.active { display: block; }

            .sg2gs-field-list {
                border: 1px solid #ddd; border-radius: 4px; padding: 10px;
                max-height: 250px; overflow-y: auto; background: #fff !important;
            }
            .sg2gs-field-item {
                display: flex; align-items: center; padding: 8px; margin-bottom: 5px;
                background: #f9f9f9 !important; color: #333 !important; border-radius: 4px; cursor: move;
            }
            .sg2gs-field-item:hover { background: #f0f0f0 !important; }
            .sg2gs-drag-handle { margin-right: 10px; color: #999 !important; }
            .sg2gs-field-label { flex: 1; }

            .sg2gs-field-delete, .sg2gs-field-edit {
                background: #ff4444; color: white; border: none;
                border-radius: 3px; padding: 4px 8px; cursor: pointer; font-size: 12px; margin-left: 5px;
            }
            .sg2gs-field-edit { background: #2196F3; }
            .sg2gs-field-delete:hover { background: #cc0000; }
            .sg2gs-field-edit:hover { background: #1976D2; }

            .sg2gs-add-field { display: flex; gap: 10px; margin-top: 10px; }
            .sg2gs-add-field-input { flex: 1; }

            .sg2gs-constant-fields { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
            .sg2gs-constant-item {
                display: flex; align-items: center; gap: 10px; padding: 8px;
                margin-bottom: 5px; background: #f9f9f9 !important; color: #333 !important; border-radius: 4px;
            }
            .sg2gs-constant-item label { flex: 1; margin: 0; color: #333 !important; }
            .sg2gs-constant-item input {
                flex: 1; padding: 6px; border: 1px solid #ddd !important; border-radius: 4px; font-size: 13px;
                background: #fff !important; color: #333 !important;
            }

            .sg2gs-page-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        `;
      if (typeof _GM_addStyle === "function") {
        _GM_addStyle(css);
      } else {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      }
    }
    static showNotification(message, duration = 2e3, isError = false) {
      const existing = document.querySelector(".sg2gs-notification");
      if (existing) existing.remove();
      const n = document.createElement("div");
      n.className = `sg2gs-notification${isError ? " error" : ""}`;
      n.textContent = message;
      document.body.appendChild(n);
      setTimeout(() => n.classList.add("show"), 10);
      setTimeout(() => {
        n.classList.remove("show");
        setTimeout(() => n.remove(), 300);
      }, duration);
    }
    static addButtons(onSettings, onSendToSheets) {
      if (document.querySelector("[data-sg2gs-btns]")) return;
      const cover = document.querySelector(".book-cover");
      if (!cover) return;
      const parent = cover.parentElement;
      if (!parent) return;
      const BTN = "text-[13px] inline-flex items-center gap-2 px-4 py-3 bg-lightGrey dark:bg-[#3B3B3B] border border-midGrey dark:border-darkerGrey rounded-md text-blackish dark:text-white font-semibold hover:bg-darkGrey dark:hover:bg-darkerGrey cursor-pointer";
      const group = document.createElement("div");
      group.setAttribute("data-sg2gs-btns", "");
      group.className = "flex gap-2 mt-2";
      const sheetsBtn = document.createElement("button");
      sheetsBtn.className = `flex-1 ${BTN}`;
      sheetsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 shrink-0">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m1.125 2.625h7.5" />
            </svg>
            Send to Sheets`;
      sheetsBtn.addEventListener("click", function() {
        onSendToSheets.call(this);
      });
      const settingsBtn = document.createElement("button");
      settingsBtn.className = `justify-center ${BTN}`;
      settingsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>`;
      settingsBtn.addEventListener("click", onSettings);
      group.appendChild(sheetsBtn);
      group.appendChild(settingsBtn);
      parent.appendChild(group);
    }
    static createSettingsModal(settings, extractor, sheetsManager) {
      const modal = document.createElement("div");
      modal.className = "sg2gs-modal";
      modal.innerHTML = `
            <div class="sg2gs-content">
                <div class="sg2gs-header">
                    <div class="sg2gs-title">StoryGraph → Sheets Settings</div>
                    <button class="sg2gs-close">&times;</button>
                </div>

                <div class="sg2gs-tabs">
                    <button class="sg2gs-tab active" data-tab="format">Format</button>
                    <button class="sg2gs-tab" data-tab="fields">Fields</button>
                    <button class="sg2gs-tab" data-tab="sheets">Google Sheets</button>
                </div>

                <div id="sg2gs-tab-format" class="sg2gs-tab-content active">
                    <div class="sg2gs-section">
                        <h3>Format Options</h3>
                        <div class="sg2gs-group">
                            <label for="sg2gs-separator">Field Separator</label>
                            <select id="sg2gs-separator">
                                <option value="	">Tab</option>
                                <option value=",">Comma</option>
                                <option value=";">Semicolon</option>
                                <option value="|">Pipe</option>
                            </select>
                        </div>
                        <div class="sg2gs-group">
                            <label for="sg2gs-dateadded-format">Date Added Format</label>
                            <select id="sg2gs-dateadded-format">
                                <option value="full">UK Format</option>
                                <option value="us">US Format</option>
                                <option value="iso">ISO (YYYY-MM-DD)</option>
                            </select>
                        </div>
                        <div class="sg2gs-group">
                            <label for="sg2gs-review-format">Community Review Format</label>
                            <select id="sg2gs-review-format">
                                <option value="full">Full breakdown (38% Fast 53% Medium 7% Slow)</option>
                                <option value="majority">Majority only (Medium)</option>
                            </select>
                            <div class="hint">Majority only returns the dominant label when it exceeds 50%</div>
                        </div>
                    </div>
                </div>

                <div id="sg2gs-tab-fields" class="sg2gs-tab-content">
                    <div class="sg2gs-section">
                        <h3>Field Order (Drag to Reorder)</h3>
                        <div class="sg2gs-field-list" id="sg2gs-field-list"></div>
                    </div>

                    <div class="sg2gs-section">
                        <h3>Custom Empty Fields</h3>
                        <div id="sg2gs-custom-fields-list"></div>
                        <div class="sg2gs-add-field">
                            <input type="text" id="sg2gs-new-custom-field" class="sg2gs-add-field-input" placeholder="Empty field name">
                            <button class="sg2gs-btn sg2gs-btn-primary sg2gs-btn-small" id="sg2gs-add-custom-field">Add</button>
                        </div>
                    </div>

                    <div class="sg2gs-section sg2gs-constant-fields">
                        <h3>Constant Fields</h3>
                        <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                            Fields with a fixed value (e.g., Source = "StoryGraph")
                        </p>
                        <div id="sg2gs-constant-fields-list"></div>
                        <div class="sg2gs-add-field">
                            <input type="text" id="sg2gs-new-constant-label" class="sg2gs-add-field-input" placeholder="Field name" style="flex: 1;">
                            <input type="text" id="sg2gs-new-constant-value" placeholder="Value" style="flex: 1;">
                            <button class="sg2gs-btn sg2gs-btn-primary sg2gs-btn-small" id="sg2gs-add-constant">Add</button>
                        </div>
                    </div>
                </div>

                <div id="sg2gs-tab-sheets" class="sg2gs-tab-content">
                    <div class="sg2gs-section">
                        <h3>Google Sheets API Configuration</h3>
                        <div class="sg2gs-group">
                            <label for="sg2gs-service-account">Service Account JSON</label>
                            <textarea id="sg2gs-service-account" rows="6" placeholder="Paste the entire Service Account JSON file content here"></textarea>
                            <div class="hint">The JSON file you downloaded from Google Cloud Console</div>
                        </div>
                        <div class="sg2gs-group">
                            <label for="sg2gs-spreadsheet-id">Spreadsheet ID</label>
                            <input type="text" id="sg2gs-spreadsheet-id" placeholder="Enter your spreadsheet ID">
                            <div class="hint">Found in the URL: https://docs.google.com/spreadsheets/d/<span style="font-family: monospace;">SPREADSHEET_ID</span>/edit</div>
                        </div>
                        <div class="sg2gs-group">
                            <label for="sg2gs-sheet-name">Sheet Name</label>
                            <input type="text" id="sg2gs-sheet-name" placeholder="Enter the sheet name (e.g., Books)">
                        </div>
                        <div id="sg2gs-error" class="sg2gs-error" style="display: none;"></div>
                        <div class="sg2gs-btn-group">
                            <button class="sg2gs-btn sg2gs-btn-secondary" id="sg2gs-test-load">Test & Load Columns</button>
                        </div>
                    </div>
                    <div id="sg2gs-mapping-section" class="sg2gs-section" style="display: none;">
                        <h3>Column Mapping</h3>
                        <p style="font-size: 13px; color: #666; margin-bottom: 15px;">
                            Map your Google Sheet columns to StoryGraph data fields.
                        </p>
                        <div id="sg2gs-mapping-container"></div>
                    </div>
                </div>

                <div class="sg2gs-btn-group" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
                    <button class="sg2gs-btn sg2gs-btn-primary" id="sg2gs-save">Save Settings</button>
                    <button class="sg2gs-btn sg2gs-btn-secondary" id="sg2gs-reset">Reset to Default</button>
                    <button class="sg2gs-btn sg2gs-btn-secondary" id="sg2gs-cancel">Cancel</button>
                </div>

                <div class="sg2gs-section" style="margin-top: 20px;">
                    <h3>How to Get Your Service Account</h3>
                    <ol style="font-size: 14px; color: #666; line-height: 1.6;">
                        <li>Go to <a href="https://console.cloud.google.com/" target="_blank">Google Cloud Console</a></li>
                        <li>Create a new project or select an existing one</li>
                        <li>Enable the <strong>Google Sheets API</strong></li>
                        <li>Go to <strong>IAM & Admin > Service Accounts</strong></li>
                        <li>Create a Service Account and create a Key (JSON)</li>
                        <li><strong>Important:</strong> Share your spreadsheet with the service account email</li>
                        <li>Copy the content of the JSON file and paste it above</li>
                    </ol>
                </div>
            </div>
        `;
      document.body.appendChild(modal);
      this.populateSettings(modal, settings, extractor);
      this.attachHandlers(modal, settings, extractor, sheetsManager);
      return modal;
    }
    static populateSettings(modal, settings, extractor) {
      modal.querySelector("#sg2gs-separator").value = settings.get("separator");
      modal.querySelector("#sg2gs-dateadded-format").value = settings.get("dateAddedFormat");
      modal.querySelector("#sg2gs-review-format").value = settings.get("communityReviewFormat") || "full";
      const sheetsSettings = settings.getGoogleSheetsSettings();
      modal.querySelector("#sg2gs-service-account").value = sheetsSettings.serviceAccountJson || "";
      modal.querySelector("#sg2gs-spreadsheet-id").value = sheetsSettings.spreadsheetId || "";
      modal.querySelector("#sg2gs-sheet-name").value = sheetsSettings.sheetName || "Books";
      this.populateFieldOrder(modal, settings, extractor);
      this.populateCustomFields(modal, settings);
      this.populateConstantFields(modal, settings);
    }
    static populateFieldOrder(modal, settings, extractor) {
      const fieldList = modal.querySelector("#sg2gs-field-list");
      fieldList.innerHTML = "";
      const allDefs = extractor.getAllFieldDefinitions();
      for (const fieldKey of settings.get("fieldOrder")) {
        const def = allDefs[fieldKey];
        if (!def) continue;
        const item = document.createElement("div");
        item.className = "sg2gs-field-item";
        item.dataset.field = fieldKey;
        item.draggable = true;
        item.innerHTML = `<span class="sg2gs-drag-handle">☰</span><span class="sg2gs-field-label">${def.label}</span>`;
        fieldList.appendChild(item);
      }
      this.attachDragHandlers(fieldList);
    }
    static populateCustomFields(modal, settings) {
      const container = modal.querySelector("#sg2gs-custom-fields-list");
      container.innerHTML = "";
      for (const field of settings.get("customEmptyFields") || []) {
        const item = document.createElement("div");
        item.className = "sg2gs-field-item";
        item.innerHTML = `
                <span class="sg2gs-drag-handle">☰</span>
                <span class="sg2gs-field-label">${field.label}</span>
                <button class="sg2gs-field-delete" data-id="${field.id}">Delete</button>
            `;
        container.appendChild(item);
      }
    }
    static populateConstantFields(modal, settings) {
      const container = modal.querySelector("#sg2gs-constant-fields-list");
      container.innerHTML = "";
      for (const field of settings.get("constantFields") || []) {
        const item = document.createElement("div");
        item.className = "sg2gs-constant-item";
        item.dataset.id = field.id;
        item.innerHTML = `
                <label>${field.label}</label>
                <input type="text" class="sg2gs-constant-value" value="${field.value}">
                <button class="sg2gs-field-delete" data-id="${field.id}">Delete</button>
            `;
        container.appendChild(item);
      }
    }
    static attachDragHandlers(container) {
      let dragged = null;
      container.addEventListener("dragstart", (e) => {
        dragged = e.target.closest(".sg2gs-field-item");
        e.dataTransfer.effectAllowed = "move";
      });
      container.addEventListener("dragover", (e) => {
        e.preventDefault();
        const after = this.getDragAfterElement(container, e.clientY);
        if (after == null) container.appendChild(dragged);
        else container.insertBefore(dragged, after);
      });
    }
    static getDragAfterElement(container, y) {
      const items = [...container.querySelectorAll(".sg2gs-field-item:not(.dragging)")];
      return items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        return offset < 0 && offset > closest.offset ? { offset, element: child } : closest;
      }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    static attachHandlers(modal, settings, extractor, sheetsManager) {
      modal.querySelector(".sg2gs-close").addEventListener("click", () => modal.classList.remove("show"));
      modal.querySelector("#sg2gs-cancel").addEventListener("click", () => modal.classList.remove("show"));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("show");
      });
      modal.querySelectorAll(".sg2gs-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          modal.querySelectorAll(".sg2gs-tab").forEach((t) => t.classList.remove("active"));
          modal.querySelectorAll(".sg2gs-tab-content").forEach((c) => c.classList.remove("active"));
          tab.classList.add("active");
          modal.querySelector(`#sg2gs-tab-${tab.dataset.tab}`).classList.add("active");
        });
      });
      this.attachFieldHandlers(modal, settings, extractor);
      this.attachSheetsHandlers(modal, settings, extractor, sheetsManager);
      this.attachSaveHandler(modal, settings, extractor);
    }
    static attachFieldHandlers(modal, settings, extractor) {
      modal.querySelector("#sg2gs-add-custom-field").addEventListener("click", () => {
        const input = modal.querySelector("#sg2gs-new-custom-field");
        const name = input.value.trim();
        if (!name) {
          this.showNotification("Please enter a field name", 2e3, true);
          return;
        }
        const id = settings.addCustomEmptyField(name);
        settings.set("fieldOrder", [...settings.get("fieldOrder"), id]);
        input.value = "";
        this.populateFieldOrder(modal, settings, extractor);
        this.populateCustomFields(modal, settings);
        this.showNotification(`Added "${name}"`);
      });
      modal.querySelector("#sg2gs-custom-fields-list").addEventListener("click", (e) => {
        if (!e.target.classList.contains("sg2gs-field-delete")) return;
        const id = e.target.dataset.id;
        const field = settings.getCustomEmptyField(id);
        if (confirm(`Delete "${field == null ? void 0 : field.label}"?`)) {
          settings.removeCustomEmptyField(id);
          this.populateFieldOrder(modal, settings, extractor);
          this.populateCustomFields(modal, settings);
        }
      });
      modal.querySelector("#sg2gs-add-constant").addEventListener("click", () => {
        const labelInput = modal.querySelector("#sg2gs-new-constant-label");
        const valueInput = modal.querySelector("#sg2gs-new-constant-value");
        const label = labelInput.value.trim();
        if (!label) {
          this.showNotification("Please enter a field name", 2e3, true);
          return;
        }
        const id = settings.addConstantField(label, valueInput.value.trim());
        settings.set("fieldOrder", [...settings.get("fieldOrder"), id]);
        labelInput.value = "";
        valueInput.value = "";
        this.populateFieldOrder(modal, settings, extractor);
        this.populateConstantFields(modal, settings);
        this.showNotification(`Added constant "${label}"`);
      });
      modal.querySelector("#sg2gs-constant-fields-list").addEventListener("click", (e) => {
        if (!e.target.classList.contains("sg2gs-field-delete")) return;
        const id = e.target.dataset.id;
        const field = settings.getConstantField(id);
        if (confirm(`Delete constant "${field == null ? void 0 : field.label}"?`)) {
          settings.removeConstantField(id);
          this.populateFieldOrder(modal, settings, extractor);
          this.populateConstantFields(modal, settings);
        }
      });
      modal.querySelector("#sg2gs-constant-fields-list").addEventListener("input", (e) => {
        if (!e.target.classList.contains("sg2gs-constant-value")) return;
        const id = e.target.closest(".sg2gs-constant-item").dataset.id;
        const field = settings.getConstantField(id);
        if (field) {
          field.value = e.target.value;
          settings.save();
        }
      });
    }
    static attachSheetsHandlers(modal, settings, extractor, sheetsManager) {
      const renderMapping = (headers, currentMapping) => {
        const container = modal.querySelector("#sg2gs-mapping-container");
        container.innerHTML = "";
        const allDefs = extractor.getAllFieldDefinitions();
        const toOption = ([key, def]) => `<option value="${key}">${def.label}</option>`;
        const standardOpts = Object.entries(allDefs).filter(([, d]) => !d.isConstant && !d.isCustom).map(toOption).join("");
        const constantOpts = Object.entries(allDefs).filter(([, d]) => d.isConstant).map(toOption).join("");
        const customOpts = Object.entries(allDefs).filter(([, d]) => d.isCustom).map(toOption).join("");
        const fieldOptions = standardOpts + (constantOpts ? `<optgroup label="Constants">${constantOpts}</optgroup>` : "") + (customOpts ? `<optgroup label="Custom Empty">${customOpts}</optgroup>` : "");
        headers.forEach((header, index) => {
          const row = document.createElement("div");
          row.className = "sg2gs-group";
          row.style.cssText = "display:flex;align-items:center;gap:15px;margin-bottom:10px;";
          let defaultValue = currentMapping && currentMapping[index] ? currentMapping[index] : "";
          if (!defaultValue) {
            const norm = header.toLowerCase().replace(/[^a-z0-9]/g, "");
            for (const [key, def] of Object.entries(allDefs)) {
              const defNorm = def.label.toLowerCase().replace(/[^a-z0-9]/g, "");
              if (norm.includes(defNorm) || defNorm.includes(norm)) {
                defaultValue = key;
                break;
              }
            }
          }
          row.innerHTML = `
                    <label style="width:40%;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${header}">${header}</label>
                    <select class="sg2gs-mapping-select" data-index="${index}" style="width:60%;">
                        <option value="_empty_">-- Leave Empty --</option>
                        ${fieldOptions}
                    </select>
                `;
          if (defaultValue) row.querySelector("select").value = defaultValue;
          container.appendChild(row);
        });
        modal.querySelector("#sg2gs-mapping-section").style.display = "block";
      };
      modal.querySelector("#sg2gs-test-load").addEventListener("click", async () => {
        const serviceAccountJson = modal.querySelector("#sg2gs-service-account").value.trim();
        const spreadsheetId = modal.querySelector("#sg2gs-spreadsheet-id").value.trim();
        const sheetName = modal.querySelector("#sg2gs-sheet-name").value.trim();
        const errorDiv = modal.querySelector("#sg2gs-error");
        if (!serviceAccountJson || !spreadsheetId || !sheetName) {
          errorDiv.textContent = "Please fill in all fields first";
          errorDiv.style.display = "block";
          return;
        }
        try {
          JSON.parse(serviceAccountJson);
        } catch {
          errorDiv.textContent = "Invalid Service Account JSON";
          errorDiv.style.display = "block";
          return;
        }
        errorDiv.style.display = "none";
        const btn = modal.querySelector("#sg2gs-test-load");
        const orig = btn.textContent;
        btn.textContent = "Connecting...";
        btn.disabled = true;
        try {
          const tempManager = new GoogleSheetsManager({
            getGoogleSheetsSettings: () => ({ serviceAccountJson, spreadsheetId, sheetName })
          });
          const headers = await tempManager.getSheetHeaders();
          if (!headers || !headers.length) throw new Error("No headers found in row 1. Please add headers to your sheet.");
          this.showNotification("Connected! Loading columns...");
          renderMapping(headers, settings.getGoogleSheetsSettings().columnMapping);
        } catch (error) {
          errorDiv.textContent = `Error: ${error.message}`;
          errorDiv.style.display = "block";
          this.showNotification("Connection failed", 3e3, true);
        } finally {
          btn.textContent = orig;
          btn.disabled = false;
        }
      });
    }
    static attachSaveHandler(modal, settings, extractor) {
      modal.querySelector("#sg2gs-save").addEventListener("click", () => {
        settings.set("separator", modal.querySelector("#sg2gs-separator").value);
        settings.set("dateAddedFormat", modal.querySelector("#sg2gs-dateadded-format").value);
        settings.set("communityReviewFormat", modal.querySelector("#sg2gs-review-format").value);
        const newOrder = Array.from(modal.querySelectorAll("#sg2gs-field-list .sg2gs-field-item")).map((item) => item.dataset.field);
        settings.set("fieldOrder", newOrder);
        for (const item of modal.querySelectorAll("#sg2gs-constant-fields-list .sg2gs-constant-item")) {
          const field = settings.getConstantField(item.dataset.id);
          if (field) field.value = item.querySelector(".sg2gs-constant-value").value;
        }
        settings.save();
        const serviceAccountJson = modal.querySelector("#sg2gs-service-account").value.trim();
        const spreadsheetId = modal.querySelector("#sg2gs-spreadsheet-id").value.trim();
        const sheetName = modal.querySelector("#sg2gs-sheet-name").value.trim();
        if (!serviceAccountJson || !spreadsheetId || !sheetName) {
          this.showNotification("Please fill in all Google Sheets fields", 2e3, true);
          return;
        }
        try {
          JSON.parse(serviceAccountJson);
        } catch {
          this.showNotification("Invalid JSON format", 2e3, true);
          return;
        }
        const mappingSelects = modal.querySelectorAll(".sg2gs-mapping-select");
        const columnMapping = mappingSelects.length > 0 ? Array.from(mappingSelects).sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index)).map((s) => s.value) : settings.getGoogleSheetsSettings().columnMapping || [];
        settings.setGoogleSheetsSettings({ serviceAccountJson, spreadsheetId, sheetName, columnMapping });
        this.showNotification("Settings saved!");
        modal.classList.remove("show");
      });
      modal.querySelector("#sg2gs-reset").addEventListener("click", () => {
        if (confirm("Reset all settings to default?")) {
          settings.reset();
          this.populateSettings(modal, settings, extractor);
          this.showNotification("Settings reset to default");
        }
      });
    }
  }
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
      settingsModal.classList.add("show");
    };
    const sendToSheets = async function() {
      const sheetsSettings = settings.getGoogleSheetsSettings();
      if (!sheetsSettings.serviceAccountJson || !sheetsSettings.spreadsheetId || !sheetsSettings.sheetName) {
        UI.showNotification("Please configure Google Sheets settings first", 3e3, true);
        openSettings();
        return;
      }
      const info = extractor.getFormattedData();
      const label = this.querySelector("svg") ? this.lastChild : this;
      const original = label.textContent;
      try {
        label.textContent = " Sending...";
        this.disabled = true;
        await sheetsManager.appendToSheet(info);
        label.textContent = original;
        this.disabled = false;
        UI.showNotification("Book sent to Google Sheets!");
      } catch (error) {
        label.textContent = original;
        this.disabled = false;
        UI.showNotification(error.message, 5e3, true);
      }
    };
    waitForElement(".book-title-author-and-series", () => {
      setTimeout(() => UI.addButtons(openSettings, sendToSheets), 500);
    });
  }
  function hookSpaNavigation(callback) {
    const orig = (type) => {
      const fn = history[type];
      return function(...args) {
        fn.apply(this, args);
        callback();
      };
    };
    history.pushState = orig("pushState");
    history.replaceState = orig("replaceState");
  }
  setTimeout(() => {
    initialize();
    hookSpaNavigation(() => setTimeout(initialize, 600));
  }, 500);

})(KJUR);