// background.js

// --- MODULE HAGEZI MINI ENGINE ---
let blocklistSet = new Set();

async function loadBlocklist() {
    try {
        const url = chrome.runtime.getURL('hagezi_mini.json');
        const response = await fetch(url);
        const data = await response.json();
        blocklistSet = new Set(data);
        console.log(`Blocklist chargée: ${blocklistSet.size} domaines`);
    } catch (e) {
        console.error("Erreur de chargement de la blocklist:", e);
    }
}

// Algorithme de Suffix Matching
function isTracker(hostname) {
    if (blocklistSet.size === 0) return false;

    let parts = hostname.split('.');
    while (parts.length > 1) { // S'arrêter au TLD
        const domainToTest = parts.join('.');
        if (blocklistSet.has(domainToTest)) {
            return true;
        }
        // Retire le composant le plus à gauche (ex: sub.doubleclick.net -> doubleclick.net)
        parts.shift();
    }
    return false;
}

let REGEX_RULES = {
    "IA": [],
    "BANQUE": [],
    "CRYPTO": []
};

async function loadRegexRules() {
    try {
        const categories = {
            "IA": 'rules_ia.json',
            "BANQUE": 'rules_banque.json',
            "CRYPTO": 'rules_crypto.json'
        };

        for (const [category, filename] of Object.entries(categories)) {
            const url = chrome.runtime.getURL(filename);
            const response = await fetch(url);
            const patterns = await response.json();
            
            // Convert strings back to Regex objects for fast evaluating -> O(n)
            REGEX_RULES[category] = patterns.map(p => ({
                regex: new RegExp(p.regex, 'i'),
                name: p.name,
                category: p.category,
                risk: p.risk,
                mainCategory: category
            }));
        }
    } catch (e) {
        console.error("Erreur de chargement des règles Regex JS:", e);
    }
}

let DOMAIN_MAP = {};

let aiDomainsMap = {};

function getSiteCategory(urlOrHostname) {
    try {
        let hostname = "";
        if (urlOrHostname.startsWith('http')) {
            hostname = new URL(urlOrHostname).hostname;
        } else {
            hostname = urlOrHostname;
        }
        hostname = hostname.replace(/^www\./, '');

        // 1. Test direct (O(1))
        if (DOMAIN_MAP[hostname]) return DOMAIN_MAP[hostname];

        // 2. Test Regex (O(n))
        for (const [catName, rules] of Object.entries(REGEX_RULES)) {
            for (const rule of rules) {
                if (rule.regex.test(hostname)) {
                    return rule;
                }
            }
        }
    } catch (e) {
        return null;
    }
    return null;
}

async function loadAIDomains() {
    try {
        const url = chrome.runtime.getURL('ai_domains.json');
        const response = await fetch(url);
        aiDomainsMap = await response.json();
        
        // Charger map
        for (const [domain, info] of Object.entries(aiDomainsMap)) {
            DOMAIN_MAP[domain] = {
                mainCategory: "IA",
                name: info.name,
                category: info.category,
                risk: info.risk
            };
        }
    } catch (e) {
        console.error("Erreur de chargement de ai_domains.json:", e);
    }
}

// Initialisation au démarrage
loadBlocklist();
loadAIDomains();
loadRegexRules();
// ---------------------------------

// Cache mémoire des domaines des onglets (tabId -> eTLD+1)
// Permet d'éviter un appel lourd à chrome.tabs.get à chaque requête réseau
const tabDomains = new Map();
const tabHostnames = new Map();

// État local en buffer pour réduire les I/O vers chrome.storage.session
let sessionStats = {
    total_intercepted: 0,
    total_third_party_cookies: 0,
    tabs: {},
    session_start: new Date().toISOString()
};

let writeTimeout = null;

// Initialisation au démarrage depuis le stockage
chrome.storage.session.get(['stats_session'], (result) => {
    if (result.stats_session) {
        sessionStats = result.stats_session;
    } else {
        saveToStorage(true); // Persist init state
    }
});

/**
 * Fonction heuristique simple d'extraction du domaine (eTLD+1)
 * @param {string} hostname - Hôte complet (ex: photos.google.com)
 * @returns {string} - eTLD+1 (ex: google.com)
 */
function getETLD1(hostname) {
    if (!hostname) return '';
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;

    // Gérer les cas classiques en .co.uk, .com.au, .nom.fr
    const secondLevel = parts[parts.length - 2];
    if (['co', 'com', 'net', 'org', 'gov', 'edu'].includes(secondLevel)) {
        return parts.slice(-3).join('.');
    }

    return parts.slice(-2).join('.');
}

// -------------------------------------------------------------
// GESTION DU BADGE (Score et IA/Sécurité)
// -------------------------------------------------------------

const CATEGORY_DISPLAY_CONFIG = {
    "BANQUE": { text: "BNQ", color: "#e74c3c", blink: true },   // Texte Banque, Rouge alerte
    "CRYPTO": { text: "CRY", color: "#d35400", blink: true },   // Texte Crypto, Orange foncé
    "SECURITE": { text: "SEC", color: "#e74c3c", blink: false }, // Texte Sécurité, Rouge alerte
    "IA": { text: "IA", color: "#8e44ad", blink: false }         // Texte IA, Violet informatif
};

const blinkingTabs = new Map();

function clearBlink(tabId) {
    if (blinkingTabs.has(tabId)) {
        clearInterval(blinkingTabs.get(tabId));
        blinkingTabs.delete(tabId);
    }
}

function updateBadge(tabId) {
    const hostname = tabHostnames.get(tabId);
    if (!hostname) return;

    // Toujours nettoyer le clignotement précédent
    clearBlink(tabId);

    const matchedRule = getSiteCategory(hostname);

    if (matchedRule) {
        // Utiliser la configuration définie, ou des valeurs par défaut si non trouvée
        const config = CATEGORY_DISPLAY_CONFIG[matchedRule.mainCategory] || { text: "!", color: "#8e44ad", blink: false };

        if (config.blink) {
            let isAlertState = true;
            chrome.action.setBadgeText({ text: config.text, tabId: tabId }).catch(() => {});
            chrome.action.setBadgeBackgroundColor({ color: config.color, tabId: tabId }).catch(() => {});
            chrome.action.setBadgeTextColor({ color: '#ffffff', tabId: tabId }).catch(() => {});

            const intervalId = setInterval(() => {
                isAlertState = !isAlertState;
                const bgColor = isAlertState ? config.color : "#ffffff";
                const fgColor = isAlertState ? "#ffffff" : "#444444"; // Gris foncé quand fond blanc
                
                chrome.action.setBadgeBackgroundColor({ color: bgColor, tabId: tabId }).catch(() => {});
                chrome.action.setBadgeTextColor({ color: fgColor, tabId: tabId }).catch(() => {});
            }, 800);
            blinkingTabs.set(tabId, intervalId);
        } else {
            chrome.action.setBadgeText({ text: config.text, tabId: tabId }).catch(() => {});
            chrome.action.setBadgeBackgroundColor({ color: config.color, tabId: tabId }).catch(() => {});
            chrome.action.setBadgeTextColor({ color: '#ffffff', tabId: tabId }).catch(() => {});
        }
        return;
    }

    const tabStats = sessionStats.tabs && sessionStats.tabs[tabId] ? sessionStats.tabs[tabId] : { count: 0, cookies: 0 };
    const trackers = tabStats.count || 0;
    const cookies = tabStats.cookies || 0;

    let score = 'A';
    let colorHex = '#27ae60';

    if (trackers > 15 || cookies > 10) {
        score = 'D';
        colorHex = '#e74c3c';
    } else if (trackers >= 6 || cookies >= 3) {
        score = 'C';
        colorHex = '#e67e22';
    } else if (trackers >= 1 || cookies >= 1) {
        score = 'B';
        colorHex = '#f1c40f';
    }

    chrome.action.setBadgeText({ text: score, tabId: tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: colorHex, tabId: tabId }).catch(() => {});
    chrome.action.setBadgeTextColor({ color: '#ffffff', tabId: tabId }).catch(() => {});
}

// -------------------------------------------------------------
// GESTION DU CACHE DES ONGLETS (Performance)
// -------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // On ne met en cache que les vraies pages HTTP/HTTPS
    if (tab.url && tab.url.startsWith('http')) {
        try {
            const url = new URL(tab.url);
            const domain = getETLD1(url.hostname);
            tabDomains.set(tabId, domain);
            tabHostnames.set(tabId, url.hostname);

            // Si la page commence à charger, on efface le badge de l'ancienne page
            if (changeInfo.status === 'loading') {
                clearBlink(tabId);
                chrome.action.setBadgeText({ text: '', tabId: tabId }).catch(() => {});
            }

            // Mettre à jour le badge quand la page a fini de charger
            if (changeInfo.status === 'complete') {
                updateBadge(tabId);
            }
        } catch (e) {
            console.error("Erreur parsing URL onglet:", e);
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    // Libération mémoire
    tabDomains.delete(tabId);
    tabHostnames.delete(tabId);
    if (sessionStats.tabs && sessionStats.tabs[tabId]) {
        delete sessionStats.tabs[tabId];
        saveToStorage();
    }
    // Nettoyage visuel de sécurité
    clearBlink(tabId);
    chrome.action.setBadgeText({ text: '', tabId: tabId }).catch(() => { });
});

// -------------------------------------------------------------
// GESTION DE L'ÉCRITURE DIFFÉRÉE (Anti-Throttling)
// -------------------------------------------------------------

function saveToStorage(force = false) {
    if (writeTimeout && !force) return;

    const writeTask = () => {
        chrome.storage.session.set({ stats_session: sessionStats }, () => {
            writeTimeout = null;
        });
    };

    if (force) {
        writeTask();
    } else {
        // Écriture groupée au bout d'une seconde
        writeTimeout = setTimeout(writeTask, 1000);
    }
}

// -------------------------------------------------------------
// LE GUETTEUR : INTERCEPTION DES FLUX (Logique métier)
// -------------------------------------------------------------

chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        // Ignorer les requêtes qui ne sont pas rattachées à un onglet
        if (details.tabId === -1 || !tabDomains.has(details.tabId)) return;

        try {
            const tabDomain = tabDomains.get(details.tabId);

            const reqUrl = new URL(details.url);
            const reqDomain = getETLD1(reqUrl.hostname);

            // 1. Est-ce une requête tierce ? (Heuristique d'exclusion)
            const isThirdParty = tabDomain && reqDomain && tabDomain !== reqDomain;

            // 2. Est-ce un traqueur connu ? (Méthode statique via Suffix Matching)
            const isKnownTracker = isTracker(reqUrl.hostname);

            if (isThirdParty && isKnownTracker) {

                // 1. Incrémenter le compteur global
                sessionStats.total_intercepted++;

                // 2. Initialiser l'objet pour l'onglet si inexistant
                if (!sessionStats.tabs) sessionStats.tabs = {};
                if (!sessionStats.tabs[details.tabId]) {
                    sessionStats.tabs[details.tabId] = { count: 0, domains: {}, cookies: 0 };
                }

                // 3. Mettre à jour les compteurs de l'onglet
                sessionStats.tabs[details.tabId].count++;
                if (!sessionStats.tabs[details.tabId].domains[reqDomain]) {
                    sessionStats.tabs[details.tabId].domains[reqDomain] = 0;
                }
                sessionStats.tabs[details.tabId].domains[reqDomain]++;

                // --- PHASE 2: DYNAMIC BADGE UPDATE ---
                updateBadge(details.tabId);
                // -------------------------------------

                // 4. Demander une écriture différée
                saveToStorage();
            }
        } catch (e) {
            // Ignorer les erreurs de parsing d'URL dans les paquets bizarres
        }
    },
    { urls: ["<all_urls>"] }
);

// -------------------------------------------------------------
// COMPTAGE DES COOKIES TIERS
// -------------------------------------------------------------
chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
        // Ignorer les requêtes qui ne sont pas rattachées à un onglet
        if (details.tabId === -1 || !tabDomains.has(details.tabId)) return;

        try {
            const tabDomain = tabDomains.get(details.tabId);
            const reqUrl = new URL(details.url);
            const reqDomain = getETLD1(reqUrl.hostname);

            // Est-ce une requête tierce ?
            const isThirdParty = tabDomain && reqDomain && tabDomain !== reqDomain;

            if (isThirdParty && details.responseHeaders) {
                // Chercher un en-tête Set-Cookie
                const hasSetCookie = details.responseHeaders.some(
                    h => h.name.toLowerCase() === 'set-cookie'
                );

                if (hasSetCookie) {
                    if (sessionStats.total_third_party_cookies === undefined) {
                        sessionStats.total_third_party_cookies = 0;
                    }
                    sessionStats.total_third_party_cookies++;

                    if (!sessionStats.tabs) sessionStats.tabs = {};
                    if (!sessionStats.tabs[details.tabId]) {
                        sessionStats.tabs[details.tabId] = { count: 0, domains: {}, cookies: 0 };
                    }
                    if (sessionStats.tabs[details.tabId].cookies === undefined) {
                        sessionStats.tabs[details.tabId].cookies = 0;
                    }
                    sessionStats.tabs[details.tabId].cookies++;

                    updateBadge(details.tabId);
                    saveToStorage();
                }
            }
        } catch (e) {
            // Ignorer les erreurs de parsing d'URL
        }
    },
    { urls: ["<all_urls>"] },
    ["responseHeaders", "extraHeaders"]
);

// Listener pour la communication avec le popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getCategory') {
        const category = getSiteCategory(request.hostname);
        sendResponse({ category: category });
    }
    return true; // Keep message channel open for async if needed
});

