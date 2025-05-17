// ==UserScript==
// @name         Goodreads Copy Book Info
// @namespace    https://github.com/laurinsorgend
// @version      1.2
// @description  Adds a button to copy book information in a format ready for spreadsheet pasting
// @author       laurin@sorgend.eu
// @match        https://www.goodreads.com/book/show/*
// @grant        GM_setClipboard
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsCopyInfo/goodreadsCopyInfo.meta.js
// @downloadURL  https://raw.githubusercontent.com/laurinsorgend/userscripts/main/goodreadsCopyInfo/goodreadsCopyInfo.user.js
// @supportURL   https://github.com/laurinsorgend/userscripts/issues
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .grcopy-notification {
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
        .grcopy-notification.show {
            opacity: 1;
        }
    `);

    /**
     * Wait for an element to be present in the DOM
     * @param {string} selector - CSS selector to find the element
     * @param {function} callback - Function to execute when element is found
     * @param {number} checkFrequencyInMs - How often to check for the element
     * @param {number} timeoutInMs - How long to keep trying before giving up
     */
    function waitForElement(selector, callback, checkFrequencyInMs = 100, timeoutInMs = 10000) {
        const startTimeInMs = Date.now();
        (function loopSearch() {
            if (document.querySelector(selector) !== null) {
                callback();
                return;
            }
            else {
                setTimeout(function () {
                    if (timeoutInMs && Date.now() - startTimeInMs > timeoutInMs) {
                        console.warn(`Goodreads Copy Book Info: Timed out waiting for element: ${selector}`);
                        return;
                    }
                    loopSearch();
                }, checkFrequencyInMs);
            }
        })();
    }

    /**
     * Show a notification to the user
     * @param {string} message - The message to display
     * @param {number} duration - How long to show the message (ms)
     */
    function showNotification(message, duration = 2000) {
        // Remove any existing notifications
        const existingNotification = document.querySelector('.grcopy-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        // Create and append new notification
        const notification = document.createElement('div');
        notification.className = 'grcopy-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        // Show the notification
        setTimeout(() => notification.classList.add('show'), 10);

        // Hide and remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    function addCopyButton() {
        try {
            const buttonBar = document.getElementsByClassName("BookActions")[0];
            if (!buttonBar) {
                console.error("Goodreads Copy Book Info: BookActions element not found");
                return;
            }

            const templateButton = document.getElementsByClassName("BookActions__button")[0];
            if (!templateButton) {
                console.error("Goodreads Copy Book Info: Template button not found");
                return;
            }

            const copyButton = templateButton.cloneNode(true);
            copyButton.innerHTML = '<div class="Button__container Button__container--block"><button type="button" class="Button Button--secondary Button--medium Button--block"><span class="Button__labelItem">Copy Info</span></button></div>';

            const actualButton = copyButton.querySelector("button");
            if (!actualButton) {
                console.error("Goodreads Copy Book Info: Failed to get button element");
                return;
            }

            actualButton.addEventListener('click', function() {
                try {
                    const bookInfo = getBookInfo();
                    GM_setClipboard(bookInfo);

                    const buttonLabel = this.querySelector(".Button__labelItem");
                    const originalText = buttonLabel.textContent;
                    buttonLabel.textContent = 'Copied!';

                    showNotification("Book info copied to clipboard!");

                    setTimeout(() => {
                        buttonLabel.textContent = originalText;
                    }, 1500);
                } catch (e) {
                    console.error("Goodreads Copy Book Info: Error copying book info", e);
                    showNotification("Error copying book info. See console for details.", 3000);
                }
            });

            buttonBar.appendChild(copyButton);
            console.log("Goodreads Copy Book Info: 'Copy Info' button added successfully");
        } catch (e) {
            console.error("Goodreads Copy Book Info: Failed to add copy button", e);
        }
    }

    /**
     * Extract book information from the Goodreads page
     * @returns {string} Tab-separated string of book information
     */
    function getBookInfo() {
        // Title
        const titleElement = document.querySelector('h1.Text__title1');
        const title = titleElement ? titleElement.textContent.trim() : '';
        if (!title) {
            console.warn("Goodreads Copy Book Info: Could not find book title");
        }

        // Series information
        let seriesName = '';
        let seriesNumber = '';

        try {
            const seriesElements = document.querySelectorAll('h3.Text__title3 a');
            if (seriesElements && seriesElements.length > 0) {
                const seriesElement = seriesElements[0];
                const seriesText = seriesElement.textContent.trim();
                const regex = /\s*(?:#\s*)?(\d+(?:-\d+)?(?:\.\d+)?)\s*$/;
                const match = seriesText.match(regex);
                if (match) {
                    seriesName = seriesText.slice(0, seriesText.lastIndexOf(match[0])).trim();
                    seriesNumber = match[1];
                }
                else {
                    seriesName = seriesText.trim();
                    seriesNumber = '';
                }
            }
        } catch (e) {
            console.warn("Goodreads Copy Book Info: Error parsing series info", e);
        }

        // Page count
        let pages = '';
        try {
            const pagesElement = document.querySelector('p[data-testid="pagesFormat"]');
            if (pagesElement) {
                const pagesMatch = pagesElement.textContent.match(/(\d+)\s+pages/);
                if (pagesMatch) {
                    pages = pagesMatch[1];
                }
            }

            if (!pages) {
                const detailsElements = document.querySelectorAll('.BookDetails .BookDetails__list span');
                for (let i = 0; i < detailsElements.length; i++) {
                    const text = detailsElements[i].textContent;
                    if (text.includes('pages')) {
                        pages = text.replace(/\D/g, '');
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn("Goodreads Copy Book Info: Error parsing page count", e);
        }

        // Rating
        let rating = '';
        try {
            const ratingElement = document.querySelector('.RatingStatistics__rating');
            rating = ratingElement ? ratingElement.textContent.trim() : '';
        } catch (e) {
            console.warn("Goodreads Copy Book Info: Error parsing rating", e);
        }

        // Author
        let authorFullName = '';
        let authorLastFirst = '';
        try {
            const authorElement = document.querySelector('.ContributorLink__name');
            authorFullName = authorElement ? authorElement.textContent.trim() : '';

            if (authorFullName) {
                const nameParts = authorFullName.split(' ');
                if (nameParts.length > 1) {
                    const lastName = nameParts.pop();
                    const firstName = nameParts.join(' ');
                    authorLastFirst = `${lastName}, ${firstName}`;
                } else {
                    authorLastFirst = authorFullName;
                }
            }
        } catch (e) {
            console.warn("Goodreads Copy Book Info: Error parsing author", e);
        }

        // Publication date
        let publishDate = '';
        try {
            const pubInfoElement = document.querySelector('p[data-testid="publicationInfo"]');
            if (pubInfoElement) {
                const pubText = pubInfoElement.textContent.trim();
                const fullDateMatch = pubText.match(/(?:First |)published\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
                if (fullDateMatch) {
                    publishDate = `${fullDateMatch[1]} ${fullDateMatch[2]}, ${fullDateMatch[3]}`;
                } else {
                    const yearMatch = pubText.match(/(?:First |)published\s+(\d{4})/i);
                    if (yearMatch) {
                        publishDate = yearMatch[1];
                    }
                }
            }
        } catch (e) {
            console.warn("Goodreads Copy Book Info: Error parsing publication date", e);
        }

        // Current date
        const options = {
            year: "numeric",
            month: "short",
            day: "numeric"
        };
        const currentDate = new Date().toLocaleDateString("en-UK", options);

        // Book | Series Name | Series | Type | Pages | Rating | GoodReads | Author | Narrator | Published | Times Read | Plan | Date Added | Recommended By | Link
        const type = '';
        if (pages <= 40) {
            type = 'Short Story';
        } else if (pages <= 300) {
            type = 'Novella';
        } else if (pages > 300) {
            type = 'Novel';
        }
        const personalRating = '';  // Empty personal rating field
        const goodreadsLink = window.location.href;
        const narrator = '';  // Empty narrator field
        const timesRead = '';  // Empty times read field
        const plan = '99';  // Default plan value as requested
        const recommendedBy = '';  // Empty recommended by field

        const result = [
            title,
            seriesName,
            seriesNumber,
            type,
            pages,
            personalRating,  // Empty Rating column for personal ratings
            rating,          // GoodReads column gets the Goodreads rating
            authorLastFirst,
            narrator,
            publishDate,
            timesRead,
            plan,
            currentDate,
            recommendedBy,
            goodreadsLink    // Added Goodreads URL as the last column
        ].join('\t');

        console.log("Goodreads Copy Book Info: Successfully extracted book information");
        return result;
    }

    // Start the script once the page is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            waitForElement('h1.Text__title1', addCopyButton);
        });
    } else {
        waitForElement('h1.Text__title1', addCopyButton);
    }
})();