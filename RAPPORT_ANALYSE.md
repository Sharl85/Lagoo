# LaGo — Rapport d'analyse et de mise à jour (v2.0 → v3.0)

## Problèmes trouvés dans la v2.0

### Sécurité (critique)

| # | Problème | Conséquence |
|---|---|---|
| 1 | Le serveur servait **tous les fichiers du dossier**, y compris `data/lago_database.json` | N'importe qui pouvait télécharger `/data/lago_database.json` : emails, **mots de passe**, journaux intimes de toutes les utilisatrices |
| 2 | Mots de passe stockés **en clair** (serveur et navigateur) | Fuite directe en cas d'accès à la base ou au téléphone |
| 3 | Aucune authentification sur l'API | `GET /api/cycle/logs?userId=…` renvoyait le journal de n'importe qui ; `POST /api/admin/user/role` permettait à quiconque de se nommer Super Admin |
| 4 | `Auth.init()` appelait `/api/admin/users` pour **tous les visiteurs** et copiait la liste complète (avec mots de passe) dans le `localStorage` | Tous les comptes exposés sur chaque appareil |
| 5 | Noms et emails insérés en HTML sans échappement (panneau admin, toasts) | Injection de code (XSS) possible via un prénom malveillant |
| 6 | Le repli « hors-ligne » s'activait aussi quand le serveur répondait « mauvais mot de passe » | Connexion possible avec un ancien mot de passe resté en cache local |
| 7 | CORS ouvert à tous (`*`), pas de limite de taille de requête ni de tentatives | Force brute et abus possibles |
| 8 | Dockerfile Nginx : servait uniquement les fichiers statiques | API inopérante en production **et** base de données publique |
| 9 | `capacitor.config.json` avec `webDir: "."` | L'APK aurait embarqué `server.js`, `node_modules` et la base avec les mots de passe |

### Bugs fonctionnels

| # | Problème | Correction |
|---|---|---|
| 10 | `Auth.login()` / `register()` sont asynchrones mais appelés sans `await` → `res.success` toujours indéfini | **La connexion et l'inscription par formulaire ne fonctionnaient pas** (alerte « undefined ») — corrigé |
| 11 | Le journal et les réglages n'étaient **jamais envoyés au serveur** (`Api.saveLog` jamais appelé) | Synchronisation complète avec file d'attente hors-ligne |
| 12 | Tant que Sarah n'avait pas enregistré ses réglages, chaque lecture **réinitialisait son journal** | Supprimé ; données de démo créées une seule fois |
| 13 | L'admin qui créait une utilisatrice était **déconnecté et connecté à sa place** | Création via une route admin dédiée, sans toucher à la session |
| 14 | `new Date('2026-09-03')` lu en UTC → décalage d'un jour selon le fuseau | Lecture en heure locale partout |
| 15 | Changer de mois un 31 sautait un mois (31 janv. → mars) | Navigation par 1er du mois |
| 16 | Date des dernières règles dans le futur → jour de cycle faux ; cycles courts → ovulation pendant les règles | Recalage et bornes |
| 17 | Prévisions « 6 prochains cycles » partaient de l'ancienne date (cycles déjà passés) | Partent du cycle en cours |
| 18 | Le calendrier n'affichait jamais les règles réellement notées, seulement les prévisions | Les jours avec flux noté sont marqués |
| 19 | « Symptôme fréquent » codé en dur (« Crampes ») ; journal d'activité admin uniquement local | Calcul réel côté serveur |
| 20 | Statut « bloqué » jamais vérifié côté serveur, aucun bouton pour bloquer | Suspension / réactivation fonctionnelles |
| 21 | Service worker « cache d'abord » sur `index.html` : les mises à jour n'arrivaient jamais | Réseau d'abord + version de cache automatique |
| 22 | Polices Google Fonts externes (contraire au « zéro CDN » annoncé, cassées hors-ligne) | Polices hébergées localement |
| 23 | Icônes SVG seulement : installation PWA / Android incomplète | Icônes PNG 192/512/maskable + ressources Android |
| 24 | Zoom bloqué (`user-scalable=no`), cases du calendrier non accessibles au clavier | Accessibilité rétablie |
| 25 | `pinCode` et `discreetMode` présents dans les réglages mais non utilisés | Verrouillage PIN et mode discret implémentés |

## Ce qui a été conservé

Toutes les fonctionnalités existantes sont conservées : tableau de bord et cadran, fleur de lotus animée, pluie de pétales, mode nuit, calendrier-journal, 4 phases, prévisions, conseils bien-être, export / import / réinitialisation, bouton de masquage rapide, installation PWA, comptes démo 1-clic, connexion automatique de Sarah en démo, mode hors-ligne, espace Super Admin (KPIs, rôles, suppression, création, journal d'activité).

Deux comportements ajustés :
- **Connexion automatique de Sarah** : uniquement au tout premier lancement (avant, elle revenait après chaque déconnexion). Désactivée avec `DEMO_MODE=false`.
- **Création d'utilisatrice / confirmations** : formulaire et boîtes de dialogue intégrés au lieu des fenêtres `prompt()` / `confirm()` du navigateur (qui s'affichent mal dans l'app mobile).

## Nouveautés v3.0

- Deux versions générées à partir du même code : **web/PWA** et **application Android** (Capacitor 8)
- Interface mobile dédiée : barre d'onglets en bas, bouton flottant, fenêtres en feuille, zones sûres (encoche), bouton retour Android
- Rappels de règles par notification (mobile), respectant le mode discret
- Verrouillage par code PIN (stocké uniquement sur l'appareil, jamais sur le serveur)
- Changement de mot de passe et suppression de son propre compte
- Indicateur de synchronisation (synchronisé / hors-ligne / mode local)
- Suspension de comptes par le Super Admin, tableau admin lisible sur téléphone
- Serveur : hachage scrypt, jetons signés, contrôle des rôles, validation des données, anti force brute, en-têtes de sécurité (CSP…), écriture atomique de la base, Docker Node
- 18 tests automatiques, workflow GitHub pour compiler l'APK

## Points à prévoir avant une mise en ligne publique

- Héberger derrière **HTTPS** et définir `LAGO_SECRET`, `DEMO_MODE=false`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- La base JSON convient à quelques centaines d'utilisatrices ; au-delà, migrer vers SQLite/PostgreSQL (la couche `server/db.js` est isolée pour cela)
- Données de santé de mineures : prévoir une politique de confidentialité, le consentement parental selon l'âge (RGPD art. 8 en Europe, législation camerounaise sur les données personnelles) et un hébergement adapté
- Pas de récupération de mot de passe par email (nécessite un service d'envoi d'emails)
- Compilation de l'APK : à faire sur un poste avec Android Studio ou via le workflow GitHub fourni
