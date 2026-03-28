const sensitivePatterns = {
    // 💳 BANQUE
    IBAN_FR: { regex: /FR\d{2}\d{10}[A-Z\d]{11}\d{2}/i, type: "donnée bancaire (IBAN)", level: "critical" },
    IBAN_GENERIC: { regex: /[A-Z]{2}\d{2}[A-Z\d]{10,30}/i, type: "donnée bancaire (IBAN)", level: "critical" },
    CREDIT_CARD: { regex: /(?:^|[^\d])\d{13,19}(?:[^\d]|$)/, type: "carte bancaire", level: "critical" }, // Ajusté pour le milieu de phrase
    
    // 🪙 CRYPTO
    BTC_ADDRESS: { regex: /(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,71}/, type: "adresse Bitcoin", level: "critical" },
    ETH_ADDRESS: { regex: /0x[a-fA-F0-9]{40}/i, type: "adresse Ethereum", level: "critical" },
    SOL_ADDRESS: { regex: /[1-9A-HJ-NP-Za-km-z]{32,44}/, type: "adresse Solana", level: "critical" },
    
    // 🇫🇷 ÉTAT / ID
    SEC_SOCIALE: { regex: /[12][0-9]{2}[0-1][0-9][0-9A-B]{2}\d{6}/, type: "numéro de sécurité sociale", level: "high" },
    TAX_ID: { regex: /(?:^|[^\d])[0-3][0-9]{12}(?:[^\d]|$)/, type: "numéro fiscal", level: "high" },
    PASSPORT_FR: { regex: /\d{2}[a-zA-Z]{2}\d{5}/, type: "passeport", level: "high" },
    CARTE_GRISE: { regex: /[a-zA-Z]{2}\d{3}[a-zA-Z]{2}/, type: "certificat d'immatriculation (Carte Grise)", level: "high" },
    
    // 🤖 IA / DEV
    OPENAI_KEY: { regex: /sk-[a-zA-Z0-9]{48}/, type: "clé API OpenAI", level: "info" },
    GITHUB_TOKEN: { regex: /(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}/, type: "jeton GitHub", level: "info" },
    AWS_KEY: { regex: /(A3T[A-Z0-9]|AKIA)[A-Z0-9]{16}/, type: "clé d'accès AWS", level: "info" },
    PRIVATE_KEY: { regex: /[0-9a-fA-F]{64}/, type: "clé privée (Hex)", level: "info" }
};

const rawPatterns = {
    // 🪙 CRYPTO
    SEED_PHRASE: { regex: /^([a-z]{3,8}\s){11,23}[a-z]{3,8}$/i, type: "phrase de récupération (Seed Phrase)", level: "critical" },
    
    // 👤 DONNÉES PERSONNELLES
    EMAIL: { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, type: "adresse email", level: "sensible" },
    PHONE_FR: { regex: /(?:(?:\+|00)33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/, type: "numéro de téléphone", level: "sensible" },
    ADDRESS_FR: { regex: /\b\d{1,4}(?:(?:\s|,|-)+[a-zA-Zàâäéèêëïîôöùûücç]+){2,}\s+\d{5}\s+[a-zA-Zàâäéèêëïîôöùûücç]+\b/i, type: "adresse postale", level: "sensible" }
};

function detectSensitiveContent(text) {
    // 1. Détection sur le texte brut (ex: pour la Seed Phrase qui a besoin des espaces)
    const normalizedText = text.trim();
    for (const [key, config] of Object.entries(rawPatterns)) {
        const match = normalizedText.match(config.regex);
        if (match) {
            if (key === 'SEED_PHRASE') {
                const words = normalizedText.toLowerCase().split(/\s+/);
                if (![12, 15, 18, 21, 24].includes(words.length)) continue;
                const isValidBIP39 = words.every(word => BIP39_WORDLIST.has(word));
                if (!isValidBIP39) continue;
            }
            return { match: true, ...config };
        }
    }

    // 2. Nettoyage des parasites visuels pour les IDs, clés, numéros
    const sanitized = text.replace(/[\s\-\.]/g, '');
    
    // Optimisation : ignorer les textes trop courts
    if (sanitized.length < 7) return { match: false };

    // 3. Boucle sur les patterns
    for (const [key, config] of Object.entries(sensitivePatterns)) {
        const match = sanitized.match(config.regex);
        if (match) {
            return { match: true, ...config };
        }
    }
    
    return { match: false };
}

function showWarningNotification(matchData) {
    // S'assurer qu'une alerte précédente est supprimée
    const existingAlert = document.getElementById('privacy-insight-alerter');
    if (existingAlert) {
        existingAlert.remove();
    }

    const alerter = document.createElement('div');
    alerter.id = 'privacy-insight-alerter';
    
    // Définir la classe en fonction du niveau de risque (critical pour CB/Crypto/Clés)
    alerter.className = `pi-alerter pi-${matchData.level}`;
    
    const icon = matchData.level === 'critical' ? '⚠️' : 'ℹ️';
    const title = matchData.level === 'critical' ? 'Alerte de Sécurité' : 
                  matchData.level === 'high' ? 'Attention' : 
                  matchData.level === 'sensible' ? 'Donnée Sensible' : 'Vigilance';
    
    // Le message s'adapte en fonction de "sensible"
    const message = matchData.level === 'sensible' 
        ? `Ce que vous venez de coller ressemble à une <b>${matchData.type}</b>. Informez-vous sur les politiques de confidentialité de ce site : cette donnée pourrait être partagée à des tiers ou fuiter en cas de piratage.` 
        : `Ce que vous venez de coller ressemble à une <b>${matchData.type}</b>. Si c'est le cas, assurez-vous de faire confiance à ce site avant de valider ce formulaire.`;

    alerter.innerHTML = `
        <div class="pi-alerter-content">
            <div class="pi-alerter-icon">${icon}</div>
            <div class="pi-alerter-text">
                <strong>${title} - Privacy Insight</strong>
                <p>${message}</p>
            </div>
            <button class="pi-alerter-close">&times;</button>
        </div>
        <div class="pi-alerter-progress"></div>
    `;

    document.body.appendChild(alerter);

    const closeBtn = alerter.querySelector('.pi-alerter-close');
    closeBtn.addEventListener('click', () => {
        alerter.style.animation = 'pi-slide-out 0.3s ease-in forwards';
        setTimeout(() => alerter.remove(), 300);
    });

    // Auto dispose après 8 secondes
    setTimeout(() => {
        if (document.body.contains(alerter)) {
            alerter.style.animation = 'pi-slide-out 0.3s ease-in forwards';
            setTimeout(() => {
                if (document.body.contains(alerter)) alerter.remove();
            }, 300);
        }
    }, 8000);
}

document.addEventListener('paste', function(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const pastedText = clipboardData.getData('Text');
    if (!pastedText) return;

    const detection = detectSensitiveContent(pastedText);
    
    if (detection.match) {
        showWarningNotification(detection);
    }
});
