# Hird Note — Backend OTP & Auth
## Guide de déploiement complet sur Render.com (gratuit)

---

## 📁 Structure du projet

```
hird-note-backend/
├── server.js                 ← Serveur principal Express
├── services/
│   └── emailService.js       ← Envoi d'emails via Brevo
├── utils/
│   └── validators.js         ← Validation des données
├── frontend-connector.js     ← Code JS à coller dans HirdNote-Android.html
├── package.json
├── render.yaml               ← Config déploiement automatique
├── .env.example              ← Variables d'environnement (modèle)
├── .gitignore
└── README.md
```

---

## 🚀 Déploiement en 6 étapes

### Étape 1 — Compte Brevo (gratuit)

1. Créez un compte sur **https://www.brevo.com/fr/**
2. Allez dans **Paramètres → Clés API**
3. Cliquez **"Créer une nouvelle clé API"** → copiez-la
4. Dans **Expéditeurs → Domaines**, vérifiez votre email d'expédition

### Étape 2 — Mettre le code sur GitHub

```bash
# Dans le dossier hird-note-backend/
git init
git add .
git commit -m "Hird Note Backend - Initial"

# Créez un dépôt sur github.com (bouton +)
git remote add origin https://github.com/VOTRE_NOM/hird-note-backend.git
git branch -M main
git push -u origin main
```

### Étape 3 — Déploiement sur Render.com

1. Créez un compte sur **https://render.com** (gratuit)
2. Cliquez **"New +" → "Web Service"**
3. Connectez votre compte GitHub → sélectionnez `hird-note-backend`
4. Render détecte automatiquement `render.yaml`
5. Cliquez **"Create Web Service"**
6. Attendez ~3 minutes → Render déploie automatiquement

### Étape 4 — Configurer les variables d'environnement sur Render

Dans votre service Render → **"Environment"** :

| Variable | Valeur |
|----------|--------|
| `BREVO_API_KEY` | Votre clé API Brevo |
| `SENDER_EMAIL` | votre@email.com (vérifié dans Brevo) |
| `SENDER_NAME` | Hird Note |
| `JWT_SECRET` | (Render génère automatiquement) |
| `ALLOWED_ORIGINS` | URL de votre frontend Hird Note |

Cliquez **"Save Changes"** → le serveur redémarre.

### Étape 5 — Tester le backend

Votre URL Render ressemble à : `https://hird-note-backend.onrender.com`

```bash
# Test de santé
curl https://hird-note-backend.onrender.com/

# Test envoi OTP
curl -X POST https://hird-note-backend.onrender.com/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@exemple.com","name":"Test","type":"register"}'
```

### Étape 6 — Connecter Hird Note au backend

1. Ouvrez `HirdNote-Android.html` dans un éditeur
2. Cherchez la ligne `// ══ SYSTÈME AUTH`
3. Ajoutez AVANT cette ligne le contenu de `frontend-connector.js`
4. Changez `BACKEND_URL` avec votre URL Render
5. Enregistrez et testez

---

## 📡 Routes API disponibles

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/` | Santé du serveur |
| POST | `/api/auth/send-otp` | Envoie un OTP par email |
| POST | `/api/auth/verify-otp` | Vérifie le code OTP |
| POST | `/api/auth/register` | Finalise l'inscription |
| POST | `/api/auth/login` | Connexion utilisateur |
| POST | `/api/auth/forgot-password` | Demande réinitialisation |
| POST | `/api/auth/reset-password` | Nouveau mot de passe |
| GET | `/api/auth/me` | Profil utilisateur (JWT requis) |
| PUT | `/api/auth/update-profile` | Mise à jour profil (JWT requis) |

---

## ⚠️ Important pour la production

Le cache en mémoire (`node-cache`) est suffisant pour les tests mais
**les données sont perdues au redémarrage du serveur** (Render redémarre
souvent sur le plan gratuit après 15 min d'inactivité).

Pour une vraie base de données persistante, ajoutez :

```
MongoDB Atlas (gratuit 512 Mo) → https://www.mongodb.com/atlas
ou
Supabase PostgreSQL (gratuit)  → https://supabase.com
```

Contactez-nous pour le code d'intégration avec MongoDB Atlas.

---

## 💰 Coûts

| Service | Plan | Coût |
|---------|------|------|
| Render.com | Free | 0 €/mois |
| Brevo | Free (9 000 emails/mois) | 0 €/mois |
| **Total** | | **0 €/mois** |

---

*Hird Note Backend v1.0 — 2026*

---

## 📧 Routes Email de rappel (nouvelles)

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/reminders/send` | Envoie un email de rappel pour une tâche |
| POST | `/api/reminders/batch` | Envoi groupé (max 50 tâches, nécessite BATCH_API_KEY) |

### Exemple d'appel depuis Hird Note

```json
POST /api/reminders/send
{
  "to":        "user@email.com",
  "name":      "Marie Dupont",
  "taskTitle": "Réunion avec le client",
  "taskDesc":  "Préparer la présentation Q1",
  "deadline":  "Vendredi 20 juin · 14:00",
  "priority":  "haute",
  "progress":  50
}
```

### Rappels automatiques avec cron-job.org (gratuit)

Pour envoyer des rappels même quand l'app est fermée :

1. Créez un compte sur **cron-job.org** (gratuit)
2. Créez un job qui appelle `POST /api/reminders/batch` toutes les heures
3. Le body JSON contiendra les tâches dont l'échéance approche

---

## 🔄 Flux complet OTP → Rappels

```
Utilisateur → Inscription → OTP par email (Brevo) → Compte créé
                                                          ↓
Tâche créée → Délai configuré → setTimeout() → Email de rappel (Brevo)
                                                  avec : titre, description,
                                                         échéance, avancement
```

