const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Chemins des fichiers
const INPUT_FILE = path.join(__dirname, '../blocklist.txt');
const OUTPUT_FILE = path.join(__dirname, '../hagezi_mini.json');

async function processBlocklist() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ Fichier introuvable: ${INPUT_FILE}`);
        console.log("👉 Veuillez placer votre fichier texte (ex: hagezi_pro_mini.txt) sous le nom 'blocklist.txt' à la racine du dossier 'PrivacyInsight'.");
        return;
    }

    const fileStream = fs.createReadStream(INPUT_FILE);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const uniqueDomains = new Set();
    let lineCount = 0;

    console.log("⏳ Lecture et nettoyage de la liste en cours...");

    for await (const line of rl) {
        lineCount++;
        const trimmed = line.trim();

        // 1. Ignorer les commentaires et lignes vides
        if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('#')) {
            continue;
        }

        // 2. Ignorer les exceptions liées à AdBlock (commençant par @@)
        if (trimmed.startsWith('@@')) {
            continue;
        }

        let domain = trimmed;

        // 3. Retirer la syntaxe AdBlock de début (||)
        if (domain.startsWith('||')) {
            domain = domain.substring(2);
        }

        // 4. Retirer tout ce qui suit le caret (^)
        const caretIndex = domain.indexOf('^');
        if (caretIndex !== -1) {
            domain = domain.substring(0, caretIndex);
        }

        // 5. Cas rares : Retirer les chemins additionnels s'il y en a
        const slashIndex = domain.indexOf('/');
        if (slashIndex !== -1) {
            domain = domain.substring(0, slashIndex);
        }

        // 6. Conserver uniquement un nom de domaine valide (Set garantit l'unicité)
        if (domain && domain.length > 3) {
            uniqueDomains.add(domain);
        }
    }

    // 7. Reconversion du Set en Array pour la sérialisation
    const domainsArray = Array.from(uniqueDomains);

    console.log(`✅ Lignes analysées : ${lineCount}`);
    console.log(`✅ Domaines uniques extraits : ${domainsArray.length}`);

    // 8. Écriture du fichier JSON compact (pas d'indentation pour gagner de la place)
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(domainsArray));

    console.log(`📁 Fichier JSON généré avec succès : ${OUTPUT_FILE}`);
    console.log(`📏 Poids estimé : ${(fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2)} Mo`);
}

processBlocklist().catch(console.error);
