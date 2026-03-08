# Learn to Protect Your Data

```markdown
**Learn to Protect Your Data** est une extension Chrome éducative conçue pour sensibiliser les utilisateurs à leur empreinte numérique. L'approche est **"Local-First"**, ce qui signifie que tout le traitement de détection des trackers est effectué localement dans le navigateur, sans jamais envoyer de données d'historique de navigation à un serveur distant.
```

Ce projet correspond à l'achèvement du MVP (Minimum Viable Product).

## 🚀 Fonctionnalités Clés

- **Détection de Trackers en Temps Réel** : Analyse les requêtes réseau pour identifier de manière proactive les domaines associés à des traqueurs à l'aide d'une approche par "Suffix Matching".
- **Badge Dynamique** : L'icône de l'extension affiche le nombre de trackers détectés sur l'onglet actif et change de couleur (Vert, Jaune, Orange, Rouge) selon l'intensité du pistage.
- **Tableau de Bord Global (Popup)** :
  - **Statistiques de l'onglet actif** : Affiche le domaine principal, le nombre de trackers interceptés et le top 10 des trackers détectés.
  - **Statistiques de la session entière** : Affiche le nombre total de cookies tiers ainsi que le total global des trackers interceptés par l'extension depuis le démarrage du navigateur.
- **Moteur "Mini" Intégré** : L'extension utilise une liste de domaines de blocage optimisée (basée sur HaGeZi Mini) pour identifier efficacement les pisteurs.

## 🛠 Architecture du Projet

Le projet suit l'architecture standard des extensions Chrome Manifest V3 :

- `manifest.json` : Cœur de l'extension, déclare les autorisations requises (`cookies`, `webRequest`, `storage`, `tabs`) et les métadonnées.
- `background.js` (Service Worker) : 
  - Gère l'interception du trafic via l'API `webRequest.onBeforeRequest`.
  - Effectue le "Suffix Matching" des domaines par rapport à `hagezi_mini.json`.
  - Maintient l'état du pistage et gère la logique de la couleur / du compteur du Badge de l'extension.
- `popup/` :
  - `popup.html` / `styles.css` : L'interface utilisateur du petit tableau de bord déclenché lors du clic sur le badge de l'extension.
  - `popup.js` : Communique avec le service worker via  `chrome.storage.session` et l'interface `chrome.tabs` pour mettre à jour les jauges et la liste en temps réel.
- `hagezi_mini.json` : La liste JSON contenant les signatures de domaines des trackers à surveiller.
- `icons/` : Les ressources graphiques nécessaires à l'extension.

## ⚙️ Fonctionnement Interne

1. Au démarrage, `background.js` pré-charge la blocklist locale en mémoire `Set()`.
2. Lorsqu'un site web est chargé, l'API `chrome.webRequest` écoute les requêtes sortantes avant qu'elles ne soient envoyées.
3. Chaque requête est évaluée :
   - S'agit-il d'une requête "Tierce" (le domaine de la requête diffère de celui de la page) ?
   - Le domaine correspond-il (exactement ou partiellement) à une entrée de la blocklist de référence via la méthode *Suffix Matching* ?
4. Si c'est le cas, la base de données de la session (`chrome.storage.session`) et le compteur de l'onglet actif sont incrémentés, puis l'apparence de l'icône de l'extension (le badge) est modifiée.
5. Lorsque l'interface popup est ouverte, `popup.js` lit ces statistiques (et d'autres métriques telles que le compte de cookies tiers depuis l'API `chrome.cookies`) pour afficher un compte rendu visuel.

## 📥 Installation (Mode Développeur)

1. Téléchargez ou clonez ce dépôt sur votre machine.
2. Ouvrez Google Chrome et accédez à l'URL suivante : `chrome://extensions/`.
3. Activez le **"Mode développeur"** (bouton en haut à droite de l'écran).
4. Cliquez sur le bouton **"Charger l'extension non empaquetée"** ("Load unpacked").
5. Sélectionnez le dossier contenant l'extension (`PrivacyInsight`).
6. C'est prêt ! L'icône de l'extension devrait apparaître à côté de votre barre d'adresse et commencer à analyser les pages web que vous visitez.

## 🔒 Vie Privée et Sécurité

Cette extension a pour unique but l'apprentissage et la mise en évidence des mécanismes de tracking, et aucun comportement n'est enregistré ni partagé à l'extérieur. L'intégralité du traitement et de l'interception se passe strictement au sein de votre instance locale Chrome. Toutes les statistiques sont conservées temporairement dans le stockage de session Chrome et disparaissent lors de la fermeture du navigateur.
