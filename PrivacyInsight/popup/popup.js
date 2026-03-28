// popup.js

document.addEventListener('DOMContentLoaded', () => {
    // ---- Theme Logic ----
    const themeToggleBtn = document.getElementById('theme-toggle');
    const rootHtml = document.documentElement;
    
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('privacyInsightTheme') || 'dark';
    rootHtml.setAttribute('data-theme', savedTheme);

    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = rootHtml.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        rootHtml.setAttribute('data-theme', newTheme);
        localStorage.setItem('privacyInsightTheme', newTheme);
    });

    // ---- UI Elements ----
    const tabDomainEl = document.getElementById('tab-domain');
    const httpsCheckIconEl = document.getElementById('https-check-icon');
    const httpsCheckStrongEl = document.getElementById('https-check-strong');
    const httpsCheckTextEl = document.getElementById('https-check-text');
    const httpsIndicatorEl = document.getElementById('https-indicator');

    const tabTrackerCountEl = document.getElementById('tab-tracker-count');
    const tabCookieCountEl = document.getElementById('tab-cookie-count');
    const privacyScoreLetterEl = document.getElementById('privacy-score-letter');
    const privacyScoreTextEl = document.getElementById('privacy-score-text');

    const tabDomainsListEl = document.getElementById('tab-domains-list');
    const toggleTrackersBtn = document.getElementById('toggle-trackers-btn');
    const tabDomainsListWrapper = document.getElementById('tab-domains-list-wrapper');

    const securityCardEl = document.getElementById('security-card');
    const securityIconEl = document.getElementById('security-icon');
    const securityTitleEl = document.getElementById('security-title');
    const securityCategoryEl = document.getElementById('security-category');
    const securityRiskLabelEl = document.getElementById('security-risk-label');
    const securityRiskTextEl = document.getElementById('security-risk-text');
    const securityNameEl = document.getElementById('security-name');

    // Accordion Logic
    if (toggleTrackersBtn && tabDomainsListWrapper) {
        toggleTrackersBtn.addEventListener('click', () => {
            tabDomainsListWrapper.classList.toggle('hidden');
            toggleTrackersBtn.classList.toggle('active');
            if (tabDomainsListWrapper.classList.contains('hidden')) {
                toggleTrackersBtn.innerHTML = 'Détails des traceurs <span class="chevron">▼</span>';
            } else {
                toggleTrackersBtn.innerHTML = 'Masquer les détails <span class="chevron">▼</span>';
            }
        });
    }

    // Helper to get hostname
    function getHostname(urlStr) {
        try {
            const url = new URL(urlStr);
            return url.hostname;
        } catch {
            return 'Inconnu';
        }
    }

    // 1. Audit active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];

        if (!activeTab || !activeTab.url.startsWith('http')) {
            tabDomainEl.textContent = 'Page locale';
            if (httpsCheckStrongEl) httpsCheckStrongEl.textContent = 'Non applicable';
            if (httpsCheckTextEl) httpsCheckTextEl.textContent = 'Aucune connexion réseau.';
            if (httpsIndicatorEl) {
                httpsIndicatorEl.classList.remove('status-green', 'status-red');
                httpsIndicatorEl.classList.add('status-gray');
            }
            if (privacyScoreLetterEl) {
                privacyScoreLetterEl.textContent = '-';
                privacyScoreLetterEl.className = 'grade-badge grade-U';
            }
            if (privacyScoreTextEl) privacyScoreTextEl.textContent = 'Analyse désactivée';
            return;
        }

        const url = new URL(activeTab.url);
        tabDomainEl.textContent = url.hostname;

        // --- HTTPS Check ---
        if (url.protocol === 'https:') {
            if (httpsCheckIconEl) httpsCheckIconEl.textContent = '🔒';
            if (httpsCheckStrongEl) httpsCheckStrongEl.textContent = 'Connexion sécurisée';
            if (httpsCheckTextEl) httpsCheckTextEl.textContent = 'Le trafic vers ce site est chiffré (Certificat SSL valide).';
            if (httpsIndicatorEl) {
                httpsIndicatorEl.classList.add('status-green');
                httpsIndicatorEl.classList.remove('status-red', 'status-gray');
            }
        } else {
            if (httpsCheckIconEl) httpsCheckIconEl.textContent = '🔓';
            if (httpsCheckStrongEl) httpsCheckStrongEl.textContent = 'Connexion HTTP !';
            if (httpsCheckTextEl) httpsCheckTextEl.textContent = 'Le trafic n\'est pas chiffré. Évitez de saisir des mots de passe.';
            if (httpsIndicatorEl) {
                httpsIndicatorEl.classList.add('status-red');
                httpsIndicatorEl.classList.remove('status-green', 'status-gray');
            }
        }

        // --- Security Check (IA / Banque / Crypto) ---
        chrome.runtime.sendMessage({ action: 'getCategory', hostname: url.hostname }, (response) => {
            if (chrome.runtime.lastError) return;
            
            if (response && response.category) {
                const rule = response.category;
                const mainCategory = rule.mainCategory;
                
                // Reset card classes
                securityCardEl.className = 'card widget-card context-widget'; 
                
                if (mainCategory === 'IA') {
                    securityCardEl.classList.add('theme-ia');
                    securityIconEl.textContent = '💡';
                    securityTitleEl.textContent = 'IA & Vie Privée';
                    securityRiskLabelEl.textContent = 'Point de vigilance :';
                } else if (mainCategory === 'BANQUE') {
                    securityCardEl.classList.add('theme-bank');
                    securityIconEl.textContent = '🏦';
                    securityTitleEl.textContent = 'Espace Bancaire';
                    securityRiskLabelEl.textContent = 'Bouclier Actif :';
                } else if (mainCategory === 'CRYPTO') {
                    securityCardEl.classList.add('theme-crypto');
                    securityIconEl.textContent = '🛡️';
                    securityTitleEl.textContent = 'Service Crypto';
                    securityRiskLabelEl.textContent = 'Alerte Phishing :';
                }

                securityCategoryEl.textContent = rule.category || mainCategory;
                securityNameEl.textContent = rule.name || url.hostname;
                securityRiskTextEl.textContent = rule.risk || "Soyez prudents avec vos données.";
                
                securityCardEl.classList.remove('hidden');
            }
        });

        // --- Tracker and Cookie Stats ---
        chrome.storage.session.get(['stats_session'], (result) => {
            const stats = result.stats_session || { tabs: {} };
            const tabStats = stats.tabs[activeTab.id] || { count: 0, domains: {}, cookies: 0 };
            const tabTrackerDomains = Object.keys(tabStats.domains || {});
            
            const tabTrackersCount = tabStats.count || 0;
            const tabCookiesCount = tabStats.cookies || 0;

            if (tabTrackerCountEl) tabTrackerCountEl.textContent = tabTrackersCount;
            if (tabCookieCountEl) tabCookieCountEl.textContent = tabCookiesCount;

            // Score Logic
            let scoreLetter = 'A';
            let scoreText = 'Excellent respect de la vie privée';
            
            if (tabTrackersCount > 15 || tabCookiesCount > 10) {
                scoreLetter = 'D';
                scoreText = 'Suivi agressif (nombreux traceurs)';
            } else if (tabTrackersCount >= 6 || tabCookiesCount >= 3) {
                scoreLetter = 'C';
                scoreText = 'Suivi actif de votre navigation';
            } else if (tabTrackersCount >= 1 || tabCookiesCount >= 1) {
                scoreLetter = 'B';
                scoreText = 'Suivi modéré détecté';
            }

            if (privacyScoreLetterEl) {
                privacyScoreLetterEl.textContent = scoreLetter;
                privacyScoreLetterEl.className = `grade-badge grade-${scoreLetter}`;
            }
            if (privacyScoreTextEl) privacyScoreTextEl.textContent = scoreText;

            // Fill Tracker List
            if (tabDomainsListEl) {
                tabDomainsListEl.innerHTML = '';

                if (tabTrackerDomains.length === 0) {
                    tabDomainsListEl.innerHTML = '<li class="empty-state">Aucun traceur tiers détecté</li>';
                    return;
                }

                const domains = Object.entries(tabStats.domains);
                domains.sort((a, b) => b[1] - a[1]); // Descending count

                const top10 = domains.slice(0, 10);
                const othersCount = domains.slice(10).reduce((acc, curr) => acc + curr[1], 0);

                const createListItem = (name, count, isOther = false) => {
                    const li = document.createElement('li');
                    li.className = isOther ? 'domain-item other' : 'domain-item';
                    li.innerHTML = `<span class="domain-name">${name}</span><span class="domain-count">${count}</span>`;
                    return li;
                };

                top10.forEach(([domain, count]) => {
                    tabDomainsListEl.appendChild(createListItem(domain, count));
                });

                if (othersCount > 0) {
                    tabDomainsListEl.appendChild(createListItem('Autres', othersCount, true));
                }
            }
        });
    });
});
