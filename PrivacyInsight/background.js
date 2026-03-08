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

// Initialisation au démarrage
loadBlocklist();
// ---------------------------------

// Cache mémoire des domaines des onglets (tabId -> eTLD+1)
// Permet d'éviter un appel lourd à chrome.tabs.get à chaque requête réseau
const tabDomains = new Map();

// État local en buffer pour réduire les I/O vers chrome.storage.session
let sessionStats = {
    total_intercepted: 0,
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
// GESTION DU CACHE DES ONGLETS (Performance)
// -------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // On ne met en cache que les vraies pages HTTP/HTTPS
    if (tab.url && tab.url.startsWith('http')) {
        try {
            const url = new URL(tab.url);
            const domain = getETLD1(url.hostname);
            tabDomains.set(tabId, domain);

            // Si la page commence à charger, on efface le badge de l'ancienne page
            if (changeInfo.status === 'loading') {
                chrome.action.setBadgeText({ text: '', tabId: tabId });
            }

            // Si la page a fini de charger, et qu'on a *aucun* tracker enregistré, on met le badge vert "0"
            if (changeInfo.status === 'complete') {
                const tabStats = sessionStats.tabs[tabId];
                if (!tabStats || tabStats.count === 0) {
                    chrome.action.setBadgeText({ text: '0', tabId: tabId });
                    chrome.action.setBadgeBackgroundColor({ color: '#27ae60', tabId: tabId });
                }
            }
        } catch (e) {
            console.error("Erreur parsing URL onglet:", e);
        }
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    // Libération mémoire
    tabDomains.delete(tabId);
    if (sessionStats.tabs && sessionStats.tabs[tabId]) {
        delete sessionStats.tabs[tabId];
        saveToStorage();
    }
    // Nettoyage visuel de sécurité
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
                    sessionStats.tabs[details.tabId] = { count: 0, domains: {} };
                }

                // 3. Mettre à jour les compteurs de l'onglet
                sessionStats.tabs[details.tabId].count++;
                if (!sessionStats.tabs[details.tabId].domains[reqDomain]) {
                    sessionStats.tabs[details.tabId].domains[reqDomain] = 0;
                }
                sessionStats.tabs[details.tabId].domains[reqDomain]++;

                // --- PHASE 2: DYNAMIC BADGE UPDATE ---
                const count = sessionStats.tabs[details.tabId].count;
                let colorHex = "#27ae60"; // Vert par défaut
                if (count > 25) colorHex = "#e74c3c"; // Rouge
                else if (count > 10) colorHex = "#e67e22"; // Orange
                else if (count > 0) colorHex = "#f1c40f"; // Jaune

                chrome.action.setBadgeText({ text: count.toString(), tabId: details.tabId });
                chrome.action.setBadgeBackgroundColor({ color: colorHex, tabId: details.tabId });
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
