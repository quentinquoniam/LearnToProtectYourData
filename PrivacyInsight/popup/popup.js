// popup.js

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const tabDomainEl = document.getElementById('tab-domain');
    const tabTrackerCountEl = document.getElementById('tab-tracker-count');
    const tabDomainsListEl = document.getElementById('tab-domains-list');

    // Nouveaux éléments Score
    const privacyScoreContainerEl = document.getElementById('privacy-score-container');
    const privacyScoreLetterEl = document.getElementById('privacy-score-letter');
    const privacyScoreTextEl = document.getElementById('privacy-score-text');
    const tabCookieCountEl = document.getElementById('tab-cookie-count');

    // Éléments pour la Carte Sécurité
    const securityCardEl = document.getElementById('security-card');
    const securityIconEl = document.getElementById('security-icon');
    const securityTitleEl = document.getElementById('security-title');
    const securityCategoryEl = document.getElementById('security-category');
    const securityRiskLabelEl = document.getElementById('security-risk-label');
    const securityRiskTextEl = document.getElementById('security-risk-text');

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
            if (tabCookieCountEl) tabCookieCountEl.textContent = '0';
            if (privacyScoreLetterEl) privacyScoreLetterEl.textContent = '?';
            if (privacyScoreTextEl) privacyScoreTextEl.textContent = 'Non applicable';
            return;
        }

        const url = new URL(activeTab.url);
        tabDomainEl.textContent = getHostname(activeTab.url);

        const mainDomainParts = url.hostname.split('.');
        const mainDomain = mainDomainParts.length > 2
            ? mainDomainParts.slice(-2).join('.')
            : url.hostname;

        // --- Vérification Sécurité (IA / Banque / Crypto) ---
        chrome.runtime.sendMessage({ action: 'getCategory', hostname: url.hostname }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn("Erreur background:", chrome.runtime.lastError.message);
                return;
            }
            if (response && response.category) {
                const rule = response.category;
                const mainCategory = rule.mainCategory;
                
                securityCardEl.className = 'card security-card'; // Reset
                
                if (mainCategory === 'IA') {
                    securityCardEl.classList.add('card-theme-ia');
                    securityIconEl.textContent = '💡';
                    securityTitleEl.innerHTML = 'Conseil IA : <span id="security-name"></span>';
                    securityRiskLabelEl.textContent = 'Point de vigilance :';
                } else if (mainCategory === 'BANQUE') {
                    securityCardEl.classList.add('card-theme-banque');
                    securityIconEl.textContent = '🏦';
                    securityTitleEl.innerHTML = 'Protection Bancaire : <span id="security-name"></span>';
                    securityRiskLabelEl.textContent = 'Bouclier Actif :';
                } else if (mainCategory === 'CRYPTO') {
                    securityCardEl.classList.add('card-theme-crypto');
                    securityIconEl.textContent = '🛡️';
                    securityTitleEl.innerHTML = 'Sécurité Crypto : <span id="security-name"></span>';
                    securityRiskLabelEl.textContent = 'Alerte Phishing :';
                }

                // Injecter les données dynamiques
                document.getElementById('security-name').textContent = rule.name || "Service Inconnu";
                securityCategoryEl.textContent = rule.category || mainCategory;
                securityRiskTextEl.textContent = rule.risk || "Soyez prudents avec vos données.";
                
                securityCardEl.classList.remove('hidden');
            }
        });
        // --------------------------------

        // B. Lecture des statistiques globales et trackers depuis le stockage session
        chrome.storage.session.get(['stats_session'], (result) => {
            const stats = result.stats_session || { total_intercepted: 0, tabs: {} };

            // Stats Spécifiques à l'onglet
            const tabStats = stats.tabs[activeTab.id] || { count: 0, domains: {}, cookies: 0 };
            const tabTrackerDomains = Object.keys(tabStats.domains || {});
            const tabTrackersCount = tabStats.count || 0;
            const tabCookiesCount = tabStats.cookies || 0;

            tabTrackerCountEl.textContent = tabTrackersCount;
            tabCookieCountEl.textContent = tabCookiesCount;

            // Calcul du Score
            let scoreLetter = 'A';
            let scoreText = 'Ce site respecte votre vie privée.';
            
            if (tabTrackersCount > 15 || tabCookiesCount > 10) {
                scoreLetter = 'D';
                scoreText = 'Ce site place beaucoup de cookies publicitaires et de suivi.';
            } else if (tabTrackersCount >= 6 || tabCookiesCount >= 3) {
                scoreLetter = 'C';
                scoreText = 'Ce site suit activement votre navigation.';
            } else if (tabTrackersCount >= 1 || tabCookiesCount >= 1) {
                scoreLetter = 'B';
                scoreText = 'Ce site effectue un suivi léger.';
            }

            privacyScoreLetterEl.textContent = scoreLetter;
            privacyScoreTextEl.textContent = scoreText;
            
            // Appliquer la classe de couleur
            privacyScoreContainerEl.className = `score-container score-${scoreLetter}`;

            tabDomainsListEl.innerHTML = '';

            if (tabTrackerDomains.length === 0) {
                tabDomainsListEl.innerHTML = '<li class="empty-state">Aucun tracker détecté sur cette page</li>';
                return;
            }

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
