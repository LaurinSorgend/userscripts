// ==UserScript==
// @name         Discogs to Google Sheets
// @namespace    https://github.com/laurinsorgend
// @version      1.0
// @author       laurin@sorgend.eu
// @description  Adds a button to send album information from Discogs directly to Google Sheets
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/discogsToGoogleSheets/dist/discogsToGoogleSheets.user.js
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/discogsToGoogleSheets/dist/discogsToGoogleSheets.meta.js
// @match        https://www.discogs.com/release/*
// @match        https://www.discogs.com/*/release/*
// @match        https://www.discogs.com/master/*
// @match        https://www.discogs.com/*/master/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jsrsasign/10.9.0/jsrsasign-all-min.js
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==
