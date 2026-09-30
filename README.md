# LaGo 🌸 — v3.0 (Web + Mobile)

Application de calcul et de suivi du cycle menstruel pour femmes et adolescentes : tableau de bord, calendrier-journal, 4 phases, conseils bien-être, espace Super Admin.

Un seul code source (`src/`) produit **deux versions** :

| Version | Dossier généré | Utilisation |
|---|---|---|
| **Web** (navigateur + PWA installable) | `dist/web` | Servie par `server/server.js` (API + fichiers) ou Docker |
| **Mobile** (application Android native) | `dist/mobile` → `android/` | Compilée avec Capacitor 8 en `.apk` / `.aab` |

Voir `RAPPORT_ANALYSE.md` pour le détail des problèmes trouvés dans la v2 et des corrections.

---

## 1. Démarrage rapide (version web)

Prérequis : Node.js 20 ou plus récent.

```bash
npm install          # uniquement nécessaire pour la partie mobile (Capacitor)
npm run dev          # construit dist/ puis lance le serveur
```

Ouvrir **http://localhost:8080**.

Le serveur n'a **aucune dépendance** : `npm run build && npm start` suffit en production.

### Comptes de démonstration (si `DEMO_MODE` n'est pas `false`)

| Compte | Email | Mot de passe |
|---|---|---|
| 👑 Super Admin | `admin@lago.app` | `admin123` |
| 🌸 Utilisatrice | `sarah@lago.app` | `user123` |
| 🌸 Utilisatrice | `lea@lago.app` | `user123` |

> ⚠️ **En production**, mettez `DEMO_MODE=false` et créez votre administratrice avec `ADMIN_EMAIL` / `ADMIN_PASSWORD` (voir `.env.example`).

---

## 2. Structure du projet

```
src/                  Code partagé web + mobile (HTML, CSS, JS, polices, icônes)
  config.js           Configuration par défaut (régénérée au build)
  js/platform.js      Tout ce qui diffère entre web et mobile (PWA, bouton retour, rappels…)
  css/mobile.css      Interface mobile : barre d'onglets en bas, bouton +, fenêtres en feuille
server/               API REST sécurisée (Node.js natif, zéro dépendance)
  server.js           Routes, contrôles d'accès, fichiers statiques
  db.js               Base JSON en mémoire + écriture atomique
  security.js         Hachage scrypt, jetons signés, anti force brute
data/seed.json        Données de démonstration (copiées au 1er démarrage)
data/lago_database.json   Base réelle (créée automatiquement, jamais servie au navigateur)
scripts/build.js      Génère dist/web et dist/mobile
android/              Projet Android Studio (Capacitor)
assets/               Icône et écran de démarrage sources pour Android
tests/                Tests automatiques (npm test)
lago.config.json      URL de l'API et mode démo par version
```

---

## 3. Version mobile (Android)

### Option A — Android Studio (sur votre ordinateur)

```bash
npm install
npm run android        # construit dist/mobile, synchronise et ouvre Android Studio
```

Dans Android Studio : **Build › Build Bundle(s) / APK(s) › Build APK(s)**.
Pour le Play Store : **Build › Generate Signed Bundle / APK** (fichier `.aab`).

En ligne de commande (SDK Android installé) : `npm run android:apk` → `android/app/build/outputs/apk/debug/app-debug.apk`.

### Option B — Compilation automatique sur GitHub (sans Android Studio)

Poussez le projet sur GitHub, puis **Actions › Android APK › Run workflow**. L'APK est téléchargeable dans l'onglet *Artifacts* du run.

### Connecter l'app mobile au serveur

Sans URL d'API, l'application fonctionne **100 % en local sur le téléphone** (comptes et journal stockés sur l'appareil, mots de passe hachés).

Pour synchroniser avec votre serveur (HTTPS obligatoire) :

```bash
LAGO_API_URL=https://api.votre-domaine.com npm run cap:sync
```

ou renseignez `mobile.apiBaseUrl` dans `lago.config.json`. L'origine de l'app Android (`https://localhost`) est déjà autorisée côté serveur.

### Fonctions propres à la version mobile

- Barre d'onglets en bas, bouton flottant **+** « Noter mon jour », fenêtres qui montent du bas
- Bouton retour Android (ferme la fenêtre → revient à l'accueil → réduit l'app)
- **Rappels** : notification 2 jours avant les règles et le jour J (texte neutre en mode discret)
- **Verrouillage PIN** au retour dans l'app après 30 s en arrière-plan
- Bouton cadenas : verrouille et réduit l'app (au lieu de rediriger vers Google)
- Export de sauvegarde via le menu de partage Android
- Sauvegarde Android désactivée (`allowBackup=false`) pour protéger le journal intime

### Icônes et écran de démarrage

Remplacez `assets/icon.png` (1024×1024), `assets/icon-foreground.png`, `assets/splash.png`, puis `npm run android:icons`.

---

## 4. Déploiement de la version web

### Docker

```bash
docker build -t lago .
docker run -d -p 8080:8080 -v lago-data:/app/storage \
  -e LAGO_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))") \
  -e DEMO_MODE=false -e ADMIN_EMAIL=vous@domaine.com -e ADMIN_PASSWORD='MotDePasseSolide' \
  lago
```

### Serveur Node (VPS, Plesk, cPanel Node.js…)

```bash
npm run build:web
cp .env.example .env    # puis complétez
npm run start:env
```

Placez un proxy HTTPS (Nginx, Caddy, Cloudflare) devant le port 8080. La PWA et l'installation sur téléphone exigent HTTPS.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `PORT` | Port HTTP (8080) |
| `LAGO_SECRET` | Secret de signature des sessions (sinon généré dans `data/.secret`) |
| `DEMO_MODE` | `false` = pas de comptes démo |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Crée ou réinitialise un Super Admin au démarrage |
| `ALLOWED_ORIGINS` | Origines supplémentaires autorisées (CORS) |
| `DATA_DIR` | Dossier de la base (`data/` par défaut) |

---

## 5. API REST

Toutes les routes (sauf connexion/inscription/santé) exigent l'en-tête `Authorization: Bearer <jeton>`. L'utilisatrice est identifiée par son jeton : impossible de lire les données d'une autre.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/health` | État du serveur |
| POST | `/api/auth/login` · `/api/auth/register` | Connexion / inscription → `{ user, token }` |
| GET | `/api/auth/me` | Profil courant |
| POST | `/api/auth/password` | Changer son mot de passe |
| DELETE | `/api/auth/account` | Supprimer son compte |
| GET/POST | `/api/cycle/settings` | Réglages du cycle |
| GET/POST/DELETE | `/api/cycle/logs` | Journal quotidien |
| POST | `/api/cycle/import` | Import / synchronisation groupée |
| DELETE | `/api/cycle/data` | Effacer ses données |
| GET | `/api/admin/stats` · `/api/admin/users` | Super Admin |
| POST | `/api/admin/user` · `/api/admin/user/role` · `/api/admin/user/status` | Créer, changer le rôle, suspendre |
| DELETE | `/api/admin/user?userId=` | Supprimer une utilisatrice |

---

## 6. Tests

```bash
npm test
```

18 tests : calculs du cycle (dates, phases, cas limites) et sécurité de l'API (mots de passe hachés, base non téléchargeable, droits admin, jetons falsifiés, CORS, anti force brute).

---

*Les prévisions sont données à titre indicatif et ne remplacent pas un avis médical. LaGo n'est pas une méthode de contraception.*
