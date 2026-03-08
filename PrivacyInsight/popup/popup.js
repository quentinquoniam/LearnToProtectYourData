// popup.js

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const tabDomainEl = document.getElementById('tab-domain');
    const tabTrackerCountEl = document.getElementById('tab-tracker-count');
    const tabDomainsListEl = document.getElementById('tab-domains-list');

    // Globals
    const cookieThirdCountEl = document.getElementById('cookie-third-count');
    const globalTrackerCountEl = document.getElementById('global-tracker-count');

    // Helper pour extraire le domaine de base
    function getHostname(urlStr) {
        try {
            const url = new URL(urlStr);
            return url.hostname;
        } catch {
            return 'Inconnu';
        }
    }

    // 1. Audit Cookies et Tracker pour l'onglet actif
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.url.startsWith('http')) {
            tabDomainEl.textContent = 'Non applicable';
            tabTrackerCountEl.textContent = '0';
            cookieThirdCountEl.textContent = '0';
            globalTrackerCountEl.textContent = '0';
            return;
        }

        const url = new URL(activeTab.url);
        tabDomainEl.textContent = getHostname(activeTab.url);

        const mainDomainParts = url.hostname.split('.');
        const mainDomain = mainDomainParts.length > 2
            ? mainDomainParts.slice(-2).join('.')
            : url.hostname;

        // B. Lecture des statistiques globales et trackers depuis le stockage session
        chrome.storage.session.get(['stats_session'], (result) => {
            const stats = result.stats_session || { total_intercepted: 0, tabs: {} };

            // Session Globale
            globalTrackerCountEl.textContent = stats.total_intercepted;

            // Stats Spécifiques à l'onglet
            const tabStats = stats.tabs[activeTab.id] || { count: 0, domains: {} };
            const tabTrackerDomains = Object.keys(tabStats.domains || {});

            // A. Récupérer TOUS les cookies pour déduire les Tiers Globaux de la session
            chrome.cookies.getAll({}, (cookies) => {
                let globalThirdPartyCookies = 0;

                cookies.forEach(cookie => {
                    const cookieDomain = cookie.domain.replace(/^\./, '');

                    // Si ce n'est pas le domaine principal de l'onglet actif, c'est considéré comme un cookie tiers global
                    if (!cookieDomain.includes(mainDomain)) {
                        globalThirdPartyCookies++; // Total de la session
                    }
                });

                cookieThirdCountEl.textContent = globalThirdPartyCookies;
            });

            tabDomainsListEl.innerHTML = '';

            if (tabTrackerDomains.length === 0) {
                tabTrackerCountEl.textContent = '0';
                tabDomainsListEl.innerHTML = '<li class="empty-state">Aucun tracker bloqué sur cette page</li>';
                return;
            }

            tabTrackerCountEl.textContent = tabStats.count;

            // Trier les domaines du plus intercepté au moins intercepté
            const domains = Object.entries(tabStats.domains);
            domains.sort((a, b) => b[1] - a[1]);

            // Prendre le top 10 et additionner le reste
            const top10 = domains.slice(0, 10);
            const othersCount = domains.slice(10).reduce((acc, curr) => acc + curr[1], 0);

            // Fonction helper pour ajouter une ligne de liste
            const createListItem = (name, count, isOther = false) => {
                const li = document.createElement('li');
                li.className = isOther ? 'domain-item other' : 'domain-item';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'domain-name';
                nameSpan.textContent = name;

                const countSpan = document.createElement('span');
                countSpan.className = 'domain-count';
                countSpan.textContent = count;

                li.appendChild(nameSpan);
                li.appendChild(countSpan);
                return li;
            };

            // Ajouter le top 10 au DOM
            top10.forEach(([domain, count]) => {
                tabDomainsListEl.appendChild(createListItem(domain, count));
            });

            // S'il y a d'autres domaines, ajouter la ligne "Autres"
            if (othersCount > 0) {
                tabDomainsListEl.appendChild(createListItem('Autres', othersCount, true));
            }
        });
    });
});
