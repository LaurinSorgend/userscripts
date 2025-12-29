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

        //get tmdb link
        const tmdbLink = document.querySelector('a[data-track-action="TMDB"]');
        if (!tmdbLink) return;

        //get id
        const tmdbMatch = tmdbLink.href.match(/movie\/(\d+)/);
        if (!tmdbMatch) return;
        const tmdbId = tmdbMatch[1];

        //get radarr url
        const radarrBase = GM_getValue("radarr_url", "http://localhost:7878");
        const radarrSearchUrl = `${radarrBase}/add/new?term=tmdb:${tmdbId}`;

        //add button
        const radarrBtn = document.createElement('a');
        radarrBtn.className = 'micro-button track-event';
        radarrBtn.href = radarrSearchUrl;
        radarrBtn.target = '_blank';
        radarrBtn.innerText = 'Radarr';

       
        tmdbLink.parentNode.appendChild(radarrBtn);
    }

    //wait until tmbd button is loaded
    const checkInterval = setInterval(() => {
        if (document.querySelector('a[data-track-action="TMDB"]')) {
            clearInterval(checkInterval);
            init();
        }
    }, 500);

})();