// ==UserScript==
// @name         Letterboxd to Radarr Redirect
// @namespace    https://github.com/laurinsorgend
// @version      1.0
// @description  Adds a button to Letterboxd film pages to search for the movie in Radarr using the TMDB ID
// @author       Laurin Sorgend
// @match        https://letterboxd.com/film/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    GM_registerMenuCommand("Set Radarr URL", function() {
        const currentUrl = GM_getValue("radarr_url", "http://localhost:7878");
        const newUrl = prompt("Enter your Radarr base URL (including port):", currentUrl);
        if (newUrl !== null) {

            const sanitizedUrl = newUrl.replace(/\/$/, "");
            GM_setValue("radarr_url", sanitizedUrl);
            window.location.reload();

        }
    });

    function init() {
        if (document.querySelector('.radarr-btn-injected')) return;

        const tmdbLink = document.querySelector('a[data-track-action="TMDB"]');
        if (!tmdbLink) return;

        const tmdbMatch = tmdbLink.href.match(/movie\/(\d+)/);
        if (!tmdbMatch) return;
        const tmdbId = tmdbMatch[1];

        const radarrBase = GM_getValue("radarr_url", "http://localhost:7878");
        const radarrSearchUrl = `${radarrBase}/add/new?term=tmdb:${tmdbId}`;

        const radarrBtn = document.createElement('a');
        radarrBtn.className = 'micro-button track-event radarr-btn-injected';
        radarrBtn.href = radarrSearchUrl;
        radarrBtn.target = '_blank';
        radarrBtn.textContent = 'Radarr';

        tmdbLink.parentNode.appendChild(radarrBtn);
    }

    let attempts = 0;
    const checkInterval = setInterval(() => {
        if (document.querySelector('a[data-track-action="TMDB"]')) {
            clearInterval(checkInterval);
            init();
        } else if (++attempts > 20) {
            clearInterval(checkInterval);
        }
    }, 500);

})();