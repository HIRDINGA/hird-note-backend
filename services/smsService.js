// ═══════════════════════════════════════════════════════════════════════════
//  services/smsService.js
//  Envoi de SMS via Twilio
//  — OTP de vérification du téléphone
//  — Rappels d'échéance des tâches
// ═══════════════════════════════════════════════════════════════════════════

const twilio = require('twilio');

// Client Twilio (null si clés absentes → mode simulation)
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log('  📱 Twilio initialisé ✓');
  }
} catch (e) {
  console.warn('  ⚠ Twilio non disponible — mode simulation SMS');
}

const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER || '+15005550006'; // numéro test Twilio
const APP_NAME   = 'Hird Note';

// ── Utilitaire : normaliser le numéro de téléphone ────────────────────────
function normalizePhone(phone) {
  if (!phone) return null;
  // Supprimer tous les espaces et tirets
  let clean = phone.replace(/[\s\-().]/g, '');
  // Ajouter + si absent
  if (!clean.startsWith('+')) clean = '+' + clean;
  return clean;
}

// ── Envoi via Twilio ou simulation ────────────────────────────────────────
async function sendSMS(to, body) {
  const phone = normalizePhone(to);
  if (!phone) throw new Error('Numéro de téléphone invalide');

  if (!twilioClient) {
    // Mode simulation
    console.log('\n  📱 [SIMULATION SMS]');
    console.log(`  → Destinataire : ${phone}`);
    console.log(`  → Message      : ${body}\n`);
    return { sid: 'simulation_' + Date.now(), to: phone };
  }

  const message = await twilioClient.messages.create({
    body,
    from: TWILIO_FROM,
    to:   phone,
  });

  console.log(`  📱 SMS envoyé à ${phone} — SID: ${message.sid}`);
  return message;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fonctions exportées
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Envoie un OTP par SMS pour vérification du numéro de téléphone
 * @param {string} phone  - Numéro destinataire (format international)
 * @param {string} name   - Prénom de l'utilisateur
 * @param {string} otp    - Code à 6 chiffres
 */
async function sendPhoneOTP(phone, name, otp) {
  const body =
    `[${APP_NAME}] Bonjour ${name},\n\n` +
    `Votre code de vérification : ${otp}\n\n` +
    `Valable 10 minutes. Ne le partagez pas.\n` +
    `— ${APP_NAME}`;

  return sendSMS(phone, body);
}

/**
 * Envoie un rappel de tâche par SMS
 * @param {Object} opts - { phone, name, taskTitle, deadline, priority, progress }
 */
async function sendTaskReminderSMS({ phone, name, taskTitle, deadline, priority, progress }) {
  const prioEmoji = { haute: '🔥', moyenne: '🟡', basse: '🟢' }[priority] || '📋';
  const progressTxt = progress >= 100 ? '✅ Terminé'
    : progress > 0 ? `⏳ ${progress}% réalisé`
    : '○ Non commencé';

  const body =
    `⏰ Rappel ${APP_NAME}\n\n` +
    `Bonjour ${name},\n\n` +
    `Tâche : ${taskTitle}\n` +
    `📅 Échéance : ${deadline}\n` +
    `${prioEmoji} Priorité : ${priority}\n` +
    `${progressTxt}\n\n` +
    `Ouvrez ${APP_NAME} pour mettre à jour.`;

  return sendSMS(phone, body);
}


// ══ WHATSAPP ═══════════════════════════════════════════════════════════════

const WA_FROM = process.env.TWILIO_WHATSAPP_NUMBER
  ? 'whatsapp:' + process.env.TWILIO_WHATSAPP_NUMBER
  : 'whatsapp:+14155238886'; // Numéro sandbox Twilio par défaut

async function sendWhatsApp(to, body) {
  const waTo = to.startsWith('whatsapp:') ? to : 'whatsapp:' + to;
  if (!twilioClient) {
    console.log('\n  💬 [SIMULATION WHATSAPP]');
    console.log('  → Destinataire : ' + waTo);
    console.log('  → Message      : ' + body + '\n');
    return { sid: 'wa_sim_' + Date.now(), to: waTo };
  }
  const msg = await twilioClient.messages.create({ body, from: WA_FROM, to: waTo });
  console.log('  💬 WhatsApp envoyé à ' + waTo + ' — SID: ' + msg.sid);
  return msg;
}

async function sendWhatsAppOTP(phone, name, otp) {
  const body =
    '💬 *Hird Note* — Vérification\n\n' +
    'Bonjour ' + name + ',\n\n' +
    'Votre code de vérification :\n\n' +
    '*' + otp + '*\n\n' +
    '⏱ Valable 10 minutes.\n' +
    'Ne partagez pas ce code.\n\n' +
    '— Hird Note by Hird-Tech';
  return sendWhatsApp(phone, body);
}

async function sendWhatsAppReminder({ phone, name, taskTitle, deadline, priority, progress }) {
  const prioEmoji = { haute: '🔥', moyenne: '🟡', basse: '🟢' }[priority] || '📋';
  const statusTxt = progress >= 100 ? '✅ Terminé' : progress > 0 ? '⏳ ' + progress + '% réalisé' : '○ Non commencé';
  const body =
    '⏰ *Rappel Hird Note*\n\n' +
    'Bonjour ' + name + ',\n\n' +
    '📌 *' + taskTitle + '*\n' +
    '📅 Échéance : ' + deadline + '\n' +
    prioEmoji + ' Priorité : ' + priority + '\n' +
    statusTxt + '\n\n' +
    '👉 Ouvrez Hird Note pour mettre à jour cette tâche.';
  return sendWhatsApp(phone, body);
}

module.exports = { sendPhoneOTP, sendTaskReminderSMS, sendWhatsAppOTP, sendWhatsAppReminder, normalizePhone };
