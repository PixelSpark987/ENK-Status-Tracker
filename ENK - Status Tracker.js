// ==UserScript==
// @name         ENK - Status Tracker
// @description  Mark Setlists as completed to avoid downloading the same one again.
// @author       PixelSpark987 - https://is.gd/PS987
// @namespace    http://tampermonkey.net/
// @icon         https://is.gd/NKTwins
// @downloadURL  https://raw.githubusercontent.com/PixelSpark987/ENK-Status-Tracker/refs/heads/main/ENK%20-%20Status%20Tracker.js
// @updateURL    https://raw.githubusercontent.com/PixelSpark987/ENK-Status-Tracker/refs/heads/main/ENK%20-%20Status%20Tracker.js
// @version      2026-10-22_01
// @match        *://evilkaraoke.com/*
// @match        *://*.evilkaraoke.com/*
// @match        *://neurokaraoke.com/*
// @match        *://*.neurokaraoke.com/*
// @match        *://twinskaraoke.com/*
// @match        *://*.twinskaraoke.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // --- CONFIGURATION ---
    const CARD_DIM = 0.45;
    const CARD_BLUR = '0px';
    const CARD_GREYSCALE = '1.0';

    const COLOR_CONFIG = {
        pending: ["Pending Status", "#ff0066"],
        done:    ["Done Status",    "#9d5cff"]
    };

    // --- DYNAMIC GITHUB CONFIGURATION ---
    let GITHUB_USERNAME = GM_getValue("github_username", "");
    let REPO_NAME = GM_getValue("github_repo", "");
    const FILE_PATH = GM_getValue("github_filepath", "status-data.json");
    let GITHUB_TOKEN = GM_getValue("github_token", "");

    // Prompt for Username if missing
    if (!GITHUB_USERNAME) {
        const userInput = prompt("Evil and Neuro Karaoke - Status Tracker:\nEnter your GitHub Username:");
        if (userInput && userInput.trim() !== "") {
            GITHUB_USERNAME = userInput.trim();
            GM_setValue("github_username", GITHUB_USERNAME);
        }
    }

    // Prompt for Repository Name if missing
    if (!REPO_NAME) {
        const repoInput = prompt("Evil and Neuro Karaoke - Status Tracker:\nEnter your GitHub Repository Name:");
        if (repoInput && repoInput.trim() !== "") {
            REPO_NAME = repoInput.trim();
            GM_setValue("github_repo", REPO_NAME);
        }
    }

    // Prompt for Token if missing
    if (!GITHUB_TOKEN) {
        const tokenInput = prompt("Evil and Neuro Karaoke - Status Tracker:\nEnter your GitHub Personal Access Token to enable cross-device sync:");
        if (tokenInput && tokenInput.trim() !== "") {
            GITHUB_TOKEN = tokenInput.trim();
            GM_setValue("github_token", GITHUB_TOKEN);
        }
    }

    const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${FILE_PATH}`;
    let cachedSha = "";

    // Function to push local keys to GitHub with SHA caching and conflict retry
    function syncToCloud(callback) {
        if (!GITHUB_TOKEN || !GITHUB_USERNAME || !REPO_NAME) {
            if (callback) callback();
            return;
        }

        const keys = GM_listValues();
        const dataMap = {};
        keys.forEach(k => {
            if (k !== "github_token" && k !== "github_username" && k !== "github_repo" && k !== "github_filepath") {
                const cleanKey = k.replace(/\/+$/, '');
                dataMap[cleanKey] = GM_getValue(k, false);
            }
        });

        const jsonString = JSON.stringify(dataMap, null, 2);
        const base64Content = btoa(unescape(encodeURIComponent(jsonString)));

        function sendPut(shaToUse) {
            GM_xmlhttpRequest({
                method: "PUT",
                url: API_URL,
                headers: {
                    "Authorization": `token ${GITHUB_TOKEN}`,
                    "Content-Type": "application/json",
                    "Accept": "application/vnd.github+json"
                },
                data: JSON.stringify({
                    message: "Update setlist completion statuses via userscript sync",
                    content: base64Content,
                    sha: shaToUse
                }),
                onload: function(putRes) {
                    if (putRes.status === 200 || putRes.status === 201) {
                        try {
                            const resJson = JSON.parse(putRes.responseText);
                            cachedSha = resJson.content.sha;
                        } catch (e) {}
                        if (callback) callback();
                    } else if (putRes.status === 409) {
                        // Conflict detected; fetch fresh SHA and retry once
                        fetchFreshSha(() => sendPut(cachedSha));
                    } else {
                        console.warn("Failed to sync status to GitHub:", putRes.statusText);
                        if (callback) callback();
                    }
                },
                onerror: function() {
                    if (callback) callback();
                }
            });
        }

        function fetchFreshSha(next) {
            GM_xmlhttpRequest({
                method: "GET",
                url: API_URL,
                headers: {
                    "Authorization": `token ${GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github+json",
                    "Cache-Control": "no-cache"
                },
                onload: function(getRes) {
                    if (getRes.status === 200) {
                        try {
                            const fileData = JSON.parse(getRes.responseText);
                            cachedSha = fileData.sha;
                        } catch (e) {}
                    }
                    next();
                }
            });
        }

        if (cachedSha) {
            sendPut(cachedSha);
        } else {
            fetchFreshSha(() => sendPut(cachedSha));
        }
    }

    // Function to pull remote statuses from GitHub on load
    function syncFromCloud() {
        if (!GITHUB_TOKEN || !GITHUB_USERNAME || !REPO_NAME) return;

        GM_xmlhttpRequest({
            method: "GET",
            url: API_URL,
            headers: {
                "Authorization": `token ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "Cache-Control": "no-cache"
            },
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        const fileData = JSON.parse(response.responseText);
                        cachedSha = fileData.sha;
                        const remoteData = JSON.parse(atob(fileData.content));

                        let needsReload = false;
                        for (const [key, value] of Object.entries(remoteData)) {
                            const cleanKey = key.replace(/\/+$/, '');
                            if (GM_getValue(cleanKey, false) !== value) {
                                GM_setValue(cleanKey, value);
                                needsReload = true;
                            }
                        }
                        if (needsReload) {
                            location.reload();
                        }
                    } catch (err) {
                        console.error("Failed to parse GitHub remote sync data:", err);
                    }
                }
            }
        });
    }

    syncFromCloud();

    const style = document.createElement('style');
    style.innerHTML = `
        .sl-complete-card > *:not(.sl-btn-universal) {
            opacity: ${CARD_DIM} !important;
            filter: grayscale(${CARD_GREYSCALE}) blur(${CARD_BLUR}) !important;
        }

        .sl-btn-universal {
            color: white !important;
            border: 1px solid rgba(255,255,255,0.4) !important;
            padding: 3px 8px !important;
            font-size: 10px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            z-index: 99 !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            opacity: 1.0 !important;
            filter: saturate(1) brightness(1) !important;
        }

        .status-pending { background: ${COLOR_CONFIG.pending[1]} !important; }
        .status-done { background: ${COLOR_CONFIG.done[1]} !important; }

        .sl-btn-list {
            position: absolute !important;
            bottom: 12px !important;
            right: 12px !important;
        }
    `;
    document.head.appendChild(style);

    function runTracker() {
        const isPlaylistPage = window.location.pathname.includes('/playlist/');
        const floatingBtn = document.querySelector('#page-toggle');

        if (!isPlaylistPage && floatingBtn) floatingBtn.remove();

        const cards = document.querySelectorAll('a[href*="/playlist/"]');
        cards.forEach(card => {
            const rawHref = card.getAttribute('href');
            const href = rawHref ? rawHref.replace(/\/+$/, '') : '';
            if (!href || card.querySelector('.sl-btn-universal')) return;

            card.style.position = 'relative';

            const isDone = GM_getValue(href, false);
            if (isDone) card.classList.add('sl-complete-card');

            const btn = document.createElement('button');
            btn.className = `sl-btn-universal sl-btn-list ${isDone ? 'status-done' : 'status-pending'}`;
            btn.innerText = isDone ? '✓ COMPLETED' : 'PENDING';

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                GM_setValue(href, !isDone);
                syncToCloud(() => {
                    location.reload();
                });
            };

            card.appendChild(btn);
        });

        if (isPlaylistPage && !floatingBtn) {
            const rawPath = window.location.pathname;
            const path = rawPath.replace(/\/+$/, '');
            const isDone = GM_getValue(path, false);

            const pageBtn = document.createElement('button');
            pageBtn.id = 'page-toggle';
            pageBtn.className = `sl-btn-universal ${isDone ? 'status-done' : 'status-pending'}`;
            pageBtn.style.position = 'fixed';
            pageBtn.style.top = '70px';
            pageBtn.style.right = '10px';
            pageBtn.style.padding = '6px 12px';
            pageBtn.innerText = isDone ? '✓ COMPLETED' : 'MARK AS COMPLETE';

            pageBtn.onclick = () => {
                GM_setValue(path, !isDone);
                syncToCloud(() => {
                    location.reload();
                });
            };
            document.body.appendChild(pageBtn);
        }
    }

    setInterval(runTracker, 1500);
})();
