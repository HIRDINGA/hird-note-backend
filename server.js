// ═══════════════════════════════════════════════════════════════════════════
//  Hird Note — Backend OTP & Authentification
//  Node.js + Express + Brevo (SendinBlue)
//  Déploiement : Render.com (gratuit)
// ═══════════════════════════════════════════════════════════════════════════

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const NodeCache  = require('node-cache');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const emailService = require('./services/emailService');
// sendReminderEmail exporté depuis emailService
const smsService   = require('./services/smsService');
const { validateEmail, validateOTP, validatePassword } = require('./utils/validators');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Cache en mémoire (OTP, sessions temporaires) ─────────────────────────
// TTL = 10 minutes pour les OTP
const otpCache   = new NodeCache({ stdTTL: 600,  checkperiod: 60 });
// TTL = 24h pour les données utilisateurs (en prod, remplacer par une DB)
const usersCache = new NodeCache({ stdTTL: 86400, checkperiod: 300 });

// ── Middleware de sécurité ────────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// CORS — autoriser votre frontend Hird Note
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS non autorisé'));
    }
  },
  methods:     ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ─────────────────────────────────────────────────────────
// Envoi OTP : max 3 demandes par 15 minutes par IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { success: false, message: 'Trop de demandes OTP. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Vérification OTP : max 10 tentatives par 15 minutes
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});

// Login : max 5 tentatives par 15 minutes
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
});

// Global : 100 requêtes par 15 minutes par IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(globalLimiter);

// ── Utilitaire : générer un OTP à 6 chiffres ─────────────────────────────
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Middleware : vérifier le JWT ──────────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token manquant' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'hird-note-secret-change-me');
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalide ou expiré' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// ── GET / — Santé du serveur ───────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    app:     'Hird Note Backend',
    version: '1.0.0',
    status:  'OK ✓',
    time:    new Date().toISOString(),
  });
});

// ── POST /api/auth/send-otp ────────────────────────────────────────────────
// Envoie un code OTP à l'email fourni
app.post('/api/auth/send-otp', otpLimiter, async (req, res) => {
  try {
    const { email, name, type = 'register' } = req.body;

    // Validation
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Email invalide' });
    }

    // Pour l'inscription, vérifier si l'email n'est pas déjà utilisé
    if (type === 'register') {
      const existingUser = usersCache.get('user_' + email.toLowerCase());
      if (existingUser && existingUser.verified) {
        return res.status(409).json({
          success: false,
          message: 'Cet email est déjà enregistré. Connectez-vous.'
        });
      }
    }

    // Générer l'OTP
    const otp      = generateOTP();
    const otpKey   = 'otp_' + email.toLowerCase();
    const attempts = 0;

    // Stocker dans le cache (10 min)
    otpCache.set(otpKey, { otp, attempts, type, createdAt: Date.now() });

    // Envoyer l'email via Brevo
    await emailService.sendOTPEmail({
      to:    email,
      name:  name  || 'Utilisateur',
      otp,
      type,
    });

    res.json({
      success: true,
      message: `Code OTP envoyé à ${email}`,
      expiresIn: 600, // secondes
    });

  } catch (err) {
    console.error('[send-otp]', err.message);
    res.status(500).json({ success: false, message: 'Erreur lors de l\'envoi. Réessayez.' });
  }
});

// ── POST /api/auth/verify-otp ──────────────────────────────────────────────
// Vérifie le code OTP saisi par l'utilisateur
app.post('/api/auth/verify-otp', verifyLimiter, (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email et code requis' });
    }
    if (!validateOTP(otp)) {
      return res.status(400).json({ success: false, message: 'Code OTP invalide (6 chiffres requis)' });
    }

    const otpKey = 'otp_' + email.toLowerCase();
    const record = otpCache.get(otpKey);

    if (!record) {
      return res.status(400).json({ success: false, message: 'Code expiré ou introuvable. Demandez un nouveau code.' });
    }

    // Incrémenter les tentatives
    record.attempts++;
    if (record.attempts > 3) {
      otpCache.del(otpKey);
      return res.status(429).json({ success: false, message: 'Trop de tentatives. Demandez un nouveau code.' });
    }
    otpCache.set(otpKey, record);

    // Comparer
    if (record.otp !== otp) {
      const remaining = 3 - record.attempts;
      return res.status(400).json({
        success: false,
        message: `Code incorrect. ${remaining} tentative(s) restante(s).`,
        attemptsLeft: remaining,
      });
    }

    // ✓ OTP valide — générer un token temporaire de vérification
    otpCache.del(otpKey);
    const verificationToken = jwt.sign(
      { email: email.toLowerCase(), verified: true, purpose: record.type },
      process.env.JWT_SECRET || 'hird-note-secret-change-me',
      { expiresIn: '30m' }
    );

    res.json({
      success: true,
      message: 'Email vérifié avec succès ✓',
      verificationToken,
    });

  } catch (err) {
    console.error('[verify-otp]', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /api/auth/register ────────────────────────────────────────────────
// Finalise l'inscription avec mot de passe (après OTP validé)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { verificationToken, name, phone, password, dial } = req.body;

    if (!verificationToken || !password) {
      return res.status(400).json({ success: false, message: 'Token et mot de passe requis' });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ success: false, message: 'Mot de passe trop faible (min 8 caractères)' });
    }

    // Vérifier le token de vérification
    let decoded;
    try {
      decoded = jwt.verify(verificationToken, process.env.JWT_SECRET || 'hird-note-secret-change-me');
    } catch {
      return res.status(401).json({ success: false, message: 'Token de vérification invalide ou expiré' });
    }

    if (!decoded.verified || decoded.purpose !== 'register') {
      return res.status(401).json({ success: false, message: 'Token invalide' });
    }

    const email = decoded.email;

    // Vérifier si déjà enregistré
    if (usersCache.get('user_' + email)) {
      return res.status(409).json({ success: false, message: 'Compte déjà existant. Connectez-vous.' });
    }

    // Hasher le mot de passe
    const passwordHash = await bcrypt.hash(password, 12);

    // Créer l'utilisateur
    const userId = uuidv4();
    const user   = {
      id:           userId,
      name:         name  || '',
      email,
      phone:        phone || '',
      dial:         dial  || '',
      passwordHash,
      verified:     true,
      createdAt:    new Date().toISOString(),
      lastLoginAt:  null,
    };

    // Sauvegarder (en production : remplacer par MongoDB/PostgreSQL)
    usersCache.set('user_' + email, user);

    // Générer le JWT d'accès
    const accessToken = jwt.sign(
      { userId, email, name: user.name },
      process.env.JWT_SECRET || 'hird-note-secret-change-me',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Email de bienvenue
    emailService.sendWelcomeEmail({ to: email, name: user.name }).catch(console.error);

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès ! Bienvenue sur Hird Note ✦',
      accessToken,
      user: {
        id:    userId,
        name:  user.name,
        email,
        phone: user.phone,
      },
    });

  } catch (err) {
    console.error('[register]', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
// Connexion avec email + mot de passe
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis' });
    }

    const user = usersCache.get('user_' + email.toLowerCase());
    if (!user || !user.verified) {
      // Délai pour éviter les attaques timing
      await new Promise(r => setTimeout(r, 300));
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await new Promise(r => setTimeout(r, 300));
      return res.status(401).json({ success: false, message: 'Email ou mot de passe incorrect' });
    }

    // Mettre à jour la dernière connexion
    user.lastLoginAt = new Date().toISOString();
    usersCache.set('user_' + email.toLowerCase(), user);

    // Générer le JWT
    const accessToken = jwt.sign(
      { userId: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET || 'hird-note-secret-change-me',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      success: true,
      message: 'Connexion réussie ✦',
      accessToken,
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        phone:       user.phone,
        lastLoginAt: user.lastLoginAt,
      },
    });

  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────
// Envoie un OTP de réinitialisation de mot de passe
app.post('/api/auth/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Email invalide' });
    }

    const user = usersCache.get('user_' + email.toLowerCase());
    // Répondre toujours la même chose (éviter l'énumération d'emails)
    if (!user) {
      return res.json({ success: true, message: 'Si ce compte existe, un code vous sera envoyé.' });
    }

    const otp    = generateOTP();
    const otpKey = 'otp_' + email.toLowerCase();
    otpCache.set(otpKey, { otp, attempts: 0, type: 'reset', createdAt: Date.now() });

    await emailService.sendOTPEmail({
      to:   email,
      name: user.name,
      otp,
      type: 'reset',
    });

    res.json({ success: true, message: 'Si ce compte existe, un code vous sera envoyé.' });

  } catch (err) {
    console.error('[forgot-password]', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────
// Réinitialise le mot de passe après OTP validé
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { verificationToken, newPassword } = req.body;

    if (!verificationToken || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token et nouveau mot de passe requis' });
    }
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ success: false, message: 'Mot de passe trop faible (min 8 caractères)' });
    }

    let decoded;
    try {
      decoded = jwt.verify(verificationToken, process.env.JWT_SECRET || 'hird-note-secret-change-me');
    } catch {
      return res.status(401).json({ success: false, message: 'Token expiré. Recommencez.' });
    }

    if (!decoded.verified || decoded.purpose !== 'reset') {
      return res.status(401).json({ success: false, message: 'Token invalide' });
    }

    const user = usersCache.get('user_' + decoded.email);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Compte introuvable' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    usersCache.set('user_' + decoded.email, user);

    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès ✓' });

  } catch (err) {
    console.error('[reset-password]', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
// Récupère les infos de l'utilisateur connecté (vérifie le JWT)
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = usersCache.get('user_' + req.user.email);
  if (!user) {
    return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
  }
  res.json({
    success: true,
    user: {
      id:          user.id,
      name:        user.name,
      email:       user.email,
      phone:       user.phone,
      createdAt:   user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
  });
});

// ── PUT /api/auth/update-profile ──────────────────────────────────────────
// Mise à jour du profil
app.put('/api/auth/update-profile', authMiddleware, (req, res) => {
  try {
    const { name, phone, dial } = req.body;
    const user = usersCache.get('user_' + req.user.email);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

    if (name)  user.name  = name;
    if (phone) user.phone = phone;
    if (dial)  user.dial  = dial;
    usersCache.set('user_' + req.user.email, user);

    res.json({ success: true, message: 'Profil mis à jour ✓', user: { name: user.name, phone: user.phone } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});



// ── POST /api/auth/send-sms-otp ───────────────────────────────────────────
// Envoie un OTP par SMS pour vérifier le numéro de téléphone
app.post('/api/auth/send-sms-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, name, code } = req.body;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone requis' });
    }

    const normalizedPhone = smsService.normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, message: 'Format de numéro invalide' });
    }

    // Utiliser le code fourni par le frontend ou en générer un nouveau
    const otp    = code || String(Math.floor(100000 + Math.random() * 900000));
    const otpKey = 'sms_otp_' + normalizedPhone;

    // Stocker dans le cache (10 min)
    otpCache.set(otpKey, { otp, attempts: 0, createdAt: Date.now() });

    // Envoyer le SMS
    await smsService.sendPhoneOTP(normalizedPhone, name || 'Utilisateur', otp);

    res.json({
      success:   true,
      message:   `SMS envoyé au ${normalizedPhone}`,
      expiresIn: 600,
    });

  } catch (err) {
    console.error('[send-sms-otp]', err.message);
    res.status(500).json({ success: false, message: 'Erreur lors de l'envoi du SMS. Vérifiez le format du numéro.' });
  }
});

// ── POST /api/auth/verify-sms-otp ─────────────────────────────────────────
// Vérifie le code OTP SMS
app.post('/api/auth/verify-sms-otp', verifyLimiter, (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: 'Numéro et code requis' });
    }
    if (!validateOTP(otp)) {
      return res.status(400).json({ success: false, message: 'Code OTP invalide (6 chiffres requis)' });
    }

    const normalizedPhone = smsService.normalizePhone(phone);
    const otpKey = 'sms_otp_' + normalizedPhone;
    const record = otpCache.get(otpKey);

    if (!record) {
      return res.status(400).json({ success: false, message: 'Code expiré. Demandez un nouveau SMS.' });
    }

    record.attempts++;
    if (record.attempts > 3) {
      otpCache.del(otpKey);
      return res.status(429).json({ success: false, message: 'Trop de tentatives. Demandez un nouveau code.' });
    }
    otpCache.set(otpKey, record);

    if (record.otp !== otp) {
      const remaining = 3 - record.attempts;
      return res.status(400).json({
        success: false,
        message: `Code SMS incorrect. ${remaining} tentative(s) restante(s).`,
        attemptsLeft: remaining,
      });
    }

    // ✓ Code SMS correct
    otpCache.del(otpKey);
    const verificationToken = jwt.sign(
      { phone: normalizedPhone, phoneVerified: true },
      process.env.JWT_SECRET || 'hird-note-secret-change-me',
      { expiresIn: '30m' }
    );

    res.json({
      success: true,
      message: 'Numéro de téléphone vérifié ✓',
      verificationToken,
    });

  } catch (err) {
    console.error('[verify-sms-otp]', err.message);
    res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
});

// ── POST /api/reminders/send ───────────────────────────────────────────────
// Reçoit une demande de rappel depuis l'application et envoie l'email via Brevo
app.post('/api/reminders/send', async (req, res) => {
  try {
    const { to, phone, name, taskTitle, taskDesc, deadline, priority, progress } = req.body;

    if (!to || !taskTitle) {
      return res.status(400).json({ success: false, message: 'Email destinataire et titre de tâche requis' });
    }
    if (!validateEmail(to)) {
      return res.status(400).json({ success: false, message: 'Email destinataire invalide' });
    }

    const pct = Math.min(100, Math.max(0, parseInt(progress) || 0));
    const opts = {
      name:      name      || 'Utilisateur',
      taskTitle: taskTitle.slice(0, 200),
      taskDesc:  (taskDesc || '').slice(0, 500),
      deadline:  deadline  || '—',
      priority:  priority  || 'moyenne',
      progress:  pct,
    };

    // Envoyer l'email de rappel
    await emailService.sendReminderEmail({ to, ...opts });

    // Envoyer le SMS de rappel si numéro fourni
    let smsSent = false;
    if (phone) {
      try {
        const normalizedPhone = smsService.normalizePhone(phone);
        if (normalizedPhone) {
          await smsService.sendTaskReminderSMS({ phone: normalizedPhone, ...opts });
          smsSent = true;
        }
      } catch (smsErr) {
        console.warn('[reminders/send] SMS échoué :', smsErr.message);
      }
    }

    res.json({
      success: true,
      message: `Rappel envoyé à ${to}${smsSent ? ' + SMS' : ''} pour "${taskTitle}"`,
      emailSent: true,
      smsSent,
    });

  } catch (err) {
    console.error('[reminders/send]', err.message);
    res.status(500).json({ success: false, message: 'Erreur lors de l'envoi du rappel' });
  }
});

// ── POST /api/reminders/batch ──────────────────────────────────────────────
// Envoi groupé de rappels (pour un service cron externe type cron-job.org)
app.post('/api/reminders/batch', async (req, res) => {
  try {
    const { tasks, apiKey } = req.body;

    // Vérification clé API simple pour sécuriser l'endpoint batch
    if (apiKey !== process.env.BATCH_API_KEY && process.env.BATCH_API_KEY) {
      return res.status(401).json({ success: false, message: 'Clé API invalide' });
    }
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ success: false, message: 'Liste de tâches requise' });
    }

    const results = { sent: 0, failed: 0, skipped: 0 };

    for (const task of tasks.slice(0, 50)) { // max 50 par batch
      if (!task.email || !task.title) { results.skipped++; continue; }
      try {
        await emailService.sendReminderEmail({
          to:        task.email,
          name:      task.userName  || 'Utilisateur',
          taskTitle: task.title,
          taskDesc:  task.desc      || '',
          deadline:  task.deadline  || '—',
          priority:  task.priority  || 'moyenne',
          progress:  task.progress  || 0,
        });
        results.sent++;
        // Pause entre les envois pour respecter les limites Brevo
        await new Promise(r => setTimeout(r, 200));
      } catch {
        results.failed++;
      }
    }

    res.json({ success: true, message: 'Batch traité', results });
  } catch (err) {
    console.error('[reminders/batch]', err.message);
    res.status(500).json({ success: false, message: 'Erreur batch' });
  }
});

// ── Gestion des erreurs globale ────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Erreur interne' });
});

// ── Démarrage ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✦ Hird Note Backend`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  🚀 Serveur : http://localhost:${PORT}`);
  console.log(`  📧 Email   : ${process.env.RESEND_API_KEY ? 'Resend configuré ✓' : '⚠ RESEND_API_KEY manquant — mode simulation'}`);
  console.log(`  🔐 JWT     : ${process.env.JWT_SECRET ? 'Configuré ✓' : '⚠ Utilise la clé par défaut (dev)'}`);
  console.log(`  📬 Rappels  : Route /api/reminders/send active ✓`);
  console.log(`  📱 SMS      : ${process.env.TWILIO_ACCOUNT_SID ? 'Twilio configuré ✓' : '⚠ Mode simulation (TWILIO_ACCOUNT_SID manquant)'}`);
  console.log(`  ─────────────────────────────────\n`);
});

module.exports = app;
