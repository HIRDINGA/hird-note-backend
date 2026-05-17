# Connecter Resend à Hird Note — Guide complet

## Pourquoi Resend plutôt que Brevo ?
- Plus simple : 1 clé API, configuration en 3 minutes
- 3 000 emails gratuits par mois (sans limite journalière)
- Pas de vérification de domaine obligatoire pour tester
- API moderne, documentation claire

---

## ÉTAPE 1 — Créer votre compte Resend

1. Allez sur **https://resend.com**
2. Cliquez **"Sign Up"**
3. Entrez votre email → créez un mot de passe
4. Confirmez votre email (lien reçu par mail)
5. Vous êtes sur le dashboard Resend ✓

---

## ÉTAPE 2 — Créer votre clé API

1. Dans le menu gauche → cliquez **"API Keys"**
2. Cliquez **"Create API Key"** (bouton en haut à droite)
3. Donnez un nom : `hird-note-production`
4. Permission : **"Sending access"** (par défaut)
5. Cliquez **"Add"**
6. **Copiez la clé immédiatement** — elle commence par `re_`
   ⚠ Elle ne s'affiche qu'une seule fois

---

## ÉTAPE 3 — Configurer l'adresse expéditeur

### Option A — Tester rapidement (sans domaine)
Resend vous fournit une adresse de test :
`onboarding@resend.dev`

Dans votre `.env`, mettez :
```
SENDER_EMAIL=onboarding@resend.dev
SENDER_NAME=Hird Note
```
✓ Parfait pour tester immédiatement

### Option B — Votre propre domaine hird-tech.com (recommandé)
1. Dans Resend → **"Domains"** → **"Add Domain"**
2. Entrez `hird-tech.com`
3. Resend vous donne 3 enregistrements DNS à ajouter
4. Ajoutez-les dans votre hébergeur DNS
5. Cliquez **"Verify"** → attendez 5-30 minutes
6. Une fois vérifié → mettez `noreply@hird-tech.com` comme SENDER_EMAIL

---

## ÉTAPE 4 — Coller la clé dans Render.com

C'est ICI que beaucoup se bloquent — voici exactement comment faire :

1. Connectez-vous sur **https://dashboard.render.com**
2. Cliquez sur votre service **"hird-note-backend"** dans la liste
3. Dans le menu GAUCHE de la page → cliquez **"Environment"**
4. Vous voyez une liste de variables. Cliquez **"+ Add Environment Variable"**
5. Dans le champ **"Key"** → tapez exactement : `RESEND_API_KEY`
6. Dans le champ **"Value"** → collez votre clé : `re_xxxxxxxxxxxxxxxx`
7. Répétez pour les autres variables :
   - Key: `SENDER_EMAIL` / Value: `onboarding@resend.dev` (ou votre email)
   - Key: `SENDER_NAME` / Value: `Hird Note`
8. Cliquez **"Save Changes"** → choisissez **"Save and Deploy"**
9. Attendez 60 secondes que le serveur redémarre

---

## ÉTAPE 5 — Tester que ça fonctionne

Ouvrez ce lien dans votre navigateur (remplacez l'URL par la vôtre) :
```
https://hird-note-backend.onrender.com/
```

Vous devez voir :
```json
{
  "app": "Hird Note Backend",
  "status": "OK ✓"
}
```

Puis testez l'envoi d'un OTP :
```
POST https://hird-note-backend.onrender.com/api/auth/send-otp
Body: {"email":"votre@email.com","name":"Test","type":"register"}
```

Vous recevez l'email en moins de 5 secondes ✓

---

## Résumé des variables Render à configurer

| Variable | Valeur |
|----------|--------|
| `RESEND_API_KEY` | `re_votre_cle_ici` |
| `SENDER_EMAIL` | `onboarding@resend.dev` ou `noreply@hird-tech.com` |
| `SENDER_NAME` | `Hird Note` |
| `JWT_SECRET` | (généré automatiquement par Render) |
| `TWILIO_ACCOUNT_SID` | Votre SID Twilio (pour les SMS) |
| `TWILIO_AUTH_TOKEN` | Votre token Twilio |
| `TWILIO_PHONE_NUMBER` | Votre numéro Twilio |

---

## Coût Resend

| Volume | Coût |
|--------|------|
| 0 – 3 000 emails/mois | **0 $** |
| 3 000 – 50 000/mois | **20 $/mois** |
| 50 000 – 100 000/mois | **90 $/mois** |

Pour Hird Note au démarrage : **totalement gratuit**.
