// ═══════════════════════════════════════════════════════════════════════════
//  services/emailService.js
//  Envoi d'emails via Resend (resend.com)
//  Remplace Brevo — API plus simple, 3 000 emails/mois gratuits
// ═══════════════════════════════════════════════════════════════════════════

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY || '');

const SENDER_EMAIL = process.env.SENDER_EMAIL || 'noreply@hird-tech.com';
const SENDER_NAME  = process.env.SENDER_NAME  || 'Hird Note';
const FROM         = `${SENDER_NAME} <${SENDER_EMAIL}>`;
const APP_NAME     = 'Hird Note';

// ── Template HTML OTP ──────────────────────────────────────────────────────
function buildOTPEmailHTML(name, otp, type) {
  const isReset = type === 'reset';
  const desc    = isReset
    ? 'Vous avez demandé la réinitialisation de votre mot de passe. Utilisez ce code :'
    : 'Pour finaliser votre inscription sur Hird Note, saisissez ce code :';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#FDFAF4;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(28,26,22,0.12);">
  <tr><td style="background:#1C1A16;padding:28px 40px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#E8C96A;">${APP_NAME}</div>
    <div style="font-size:10px;color:#A89880;letter-spacing:0.18em;text-transform:uppercase;margin-top:3px;">· Rappels &amp; Tâches ·</div>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(to right,#1C1A16,#E8C96A,#1C1A16);"></td></tr>
  <tr><td style="padding:36px 40px 28px;">
    <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#1C1A16;">Bonjour ${name} 👋</p>
    <p style="margin:0 0 24px;font-size:14px;color:#7C6A52;line-height:1.7;">${desc}</p>
    <div style="background:#1C1A16;border-radius:12px;padding:28px;text-align:center;margin:0 0 24px;">
      <div style="font-size:11px;color:#A89880;letter-spacing:0.18em;text-transform:uppercase;margin-bottom:14px;">Code de vérification</div>
      <div style="font-size:48px;font-weight:700;color:#E8C96A;letter-spacing:14px;font-family:monospace;">${otp}</div>
      <div style="font-size:11px;color:#7C6A52;margin-top:14px;">⏱ Valide <strong style="color:#A89880;">10 minutes</strong></div>
    </div>
    <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;">
      <tr align="center">
        ${otp.split('').map(d => `<td style="width:14%;padding:2px;"><div style="background:#F5F0E8;border:2px solid rgba(124,106,82,0.2);border-radius:8px;padding:12px 0;font-size:24px;font-weight:700;color:#1C1A16;font-family:monospace;">${d}</div></td>`).join('')}
      </tr>
    </table>
    <p style="margin:0;font-size:12px;color:#A89880;line-height:1.6;padding:12px 16px;background:#F5F0E8;border-radius:8px;border-left:3px solid #C4623A;">
      🔒 Ne partagez jamais ce code. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.
    </p>
  </td></tr>
  <tr><td style="background:#F5F0E8;padding:16px 40px;text-align:center;border-top:1px solid rgba(124,106,82,0.15);">
    <p style="margin:0;font-size:10px;color:#A89880;">© ${new Date().getFullYear()} ${APP_NAME} · Tous droits réservés</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Template Rappel d'échéance ─────────────────────────────────────────────
function buildReminderEmailHTML(name, taskTitle, taskDesc, deadline, priority, progress) {
  const prioColor = { haute:'#C4623A', moyenne:'#C9A84C', basse:'#6B8F71' }[priority] || '#7C6A52';
  const prioLabel = { haute:'🔥 Élevée', moyenne:'🟡 Moyenne', basse:'🟢 Basse' }[priority] || priority;
  const barColor  = progress >= 100 ? '#6B8F71' : progress >= 50 ? '#E8876A' : '#C9A84C';
  const statusTxt = progress >= 100 ? '✅ Terminé' : progress > 0 ? `⏳ ${progress}% réalisé` : '○ Non commencé';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#FDFAF4;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(28,26,22,0.12);">
  <tr><td style="background:#1C1A16;padding:28px 40px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#E8C96A;">${APP_NAME}</div>
    <div style="font-size:10px;color:#A89880;letter-spacing:0.18em;text-transform:uppercase;margin-top:3px;">· Rappels &amp; Tâches ·</div>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(to right,#1C1A16,#E8C96A,#1C1A16);"></td></tr>
  <tr><td style="background:#C4623A;padding:12px 40px;text-align:center;">
    <span style="color:#fff;font-size:13px;letter-spacing:0.08em;">⏰ &nbsp; RAPPEL D'ÉCHÉANCE &nbsp; ⏰</span>
  </td></tr>
  <tr><td style="padding:32px 40px 28px;">
    <p style="margin:0 0 6px;font-size:17px;font-weight:600;color:#1C1A16;">Bonjour ${name},</p>
    <p style="margin:0 0 22px;font-size:14px;color:#7C6A52;line-height:1.6;">Une échéance approche pour votre tâche :</p>
    <div style="background:#F5F0E8;border:1px solid rgba(124,106,82,0.18);border-radius:10px;padding:20px 24px;margin-bottom:22px;border-left:4px solid ${prioColor};">
      <div style="font-size:17px;font-weight:700;color:#1C1A16;margin-bottom:6px;">${taskTitle}</div>
      ${taskDesc ? `<div style="font-size:13px;color:#7C6A52;font-style:italic;margin-bottom:12px;line-height:1.5;">${taskDesc}</div>` : ''}
      <table width="100%" cellpadding="0" cellspacing="4" style="margin-bottom:14px;">
        <tr>
          <td width="50%">
            <span style="font-size:10px;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;color:#A89880;">📅 Échéance</span><br>
            <strong style="font-size:13px;color:#C4623A;">${deadline}</strong>
          </td>
          <td width="50%">
            <span style="font-size:10px;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;color:#A89880;">Priorité</span><br>
            <strong style="font-size:13px;color:${prioColor};">${prioLabel}</strong>
          </td>
        </tr>
      </table>
      <div style="font-size:10px;font-family:monospace;letter-spacing:0.1em;text-transform:uppercase;color:#A89880;margin-bottom:6px;">Avancement</div>
      <div style="background:rgba(124,106,82,0.12);border-radius:3px;height:7px;overflow:hidden;margin-bottom:5px;">
        <div style="width:${progress}%;height:100%;background:${barColor};border-radius:3px;"></div>
      </div>
      <div style="font-size:12px;color:#7C6A52;font-family:monospace;">${progress}% · ${statusTxt}</div>
    </div>
    <p style="margin:0;font-size:12px;color:#A89880;line-height:1.6;padding:12px 16px;background:#F5F0E8;border-radius:8px;border-left:3px solid #E8C96A;">
      💡 Ouvrez Hird Note pour mettre à jour l'avancement ou marquer cette tâche comme terminée.
    </p>
  </td></tr>
  <tr><td style="background:#F5F0E8;padding:16px 40px;text-align:center;border-top:1px solid rgba(124,106,82,0.15);">
    <p style="margin:0;font-size:10px;color:#A89880;">© ${new Date().getFullYear()} ${APP_NAME} · Rappel automatique</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Template Bienvenue ─────────────────────────────────────────────────────
function buildWelcomeEmailHTML(name) {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 20px;">
<tr><td align="center">
<table width="100%" style="max-width:520px;background:#FDFAF4;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(28,26,22,0.12);">
  <tr><td style="background:#1C1A16;padding:28px 40px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#E8C96A;">${APP_NAME}</div>
    <div style="font-size:10px;color:#A89880;letter-spacing:0.18em;text-transform:uppercase;margin-top:3px;">· Rappels &amp; Tâches ·</div>
  </td></tr>
  <tr><td style="height:3px;background:linear-gradient(to right,#1C1A16,#E8C96A,#1C1A16);"></td></tr>
  <tr><td style="padding:36px 40px;">
    <p style="font-size:20px;color:#1C1A16;margin:0 0 14px;font-weight:700;">Bienvenue, ${name} ✦</p>
    <p style="color:#7C6A52;line-height:1.7;margin:0 0 18px;font-size:14px;">Votre compte Hird Note est activé. Vous pouvez dès maintenant :</p>
    <ul style="color:#3D3A34;line-height:2.1;padding-left:20px;margin:0 0 22px;font-size:14px;">
      <li>Créer et planifier vos tâches avec échéances</li>
      <li>Recevoir des rappels par email et SMS avant chaque échéance</li>
      <li>Suivre l'avancement de chaque tâche (0% → 100%)</li>
    </ul>
    <p style="color:#A89880;font-size:12px;line-height:1.6;background:#F5F0E8;padding:12px 16px;border-radius:8px;border-left:3px solid #E8C96A;margin:0;">
      💡 Installez Hird Note sur Android : Chrome → ⋮ → Ajouter à l'écran d'accueil.
    </p>
  </td></tr>
  <tr><td style="background:#F5F0E8;padding:16px 40px;text-align:center;border-top:1px solid rgba(124,106,82,0.15);">
    <p style="margin:0;font-size:10px;color:#A89880;">© ${new Date().getFullYear()} ${APP_NAME} · Tous droits réservés</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Fonction centrale d'envoi via Resend
// ═══════════════════════════════════════════════════════════════════════════
async function _send({ to, toName, subject, html, text, tags }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('\n  📧 [SIMULATION RESEND — ajoutez RESEND_API_KEY dans Render]');
    console.log(`  → À      : ${to}`);
    console.log(`  → Sujet  : ${subject}\n`);
    return { id: 'simulation_' + Date.now() };
  }

  const { data, error } = await resend.emails.send({
    from:    FROM,
    to:      toName ? [`${toName} <${to}>`] : [to],
    subject,
    html,
    text:    text || subject,
    tags:    tags || [],
  });

  if (error) {
    console.error('  ✗ Resend erreur :', error.message);
    throw new Error(error.message);
  }

  console.log(`  📧 Email envoyé à ${to} — ID: ${data.id}`);
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
//  API publique
// ═══════════════════════════════════════════════════════════════════════════

async function sendOTPEmail({ to, name, otp, type = 'register' }) {
  const isReset = type === 'reset';
  return _send({
    to, toName: name,
    subject: isReset
      ? `[${APP_NAME}] Réinitialisation mot de passe — Code : ${otp}`
      : `[${APP_NAME}] Votre code de confirmation : ${otp}`,
    html: buildOTPEmailHTML(name, otp, type),
    text: `Bonjour ${name},\n\nVotre code ${APP_NAME} : ${otp}\n\nValide 10 minutes. Ne le partagez pas.\n\n— ${APP_NAME}`,
    tags: [{ name: 'type', value: 'otp' }],
  });
}

async function sendReminderEmail({ to, name, taskTitle, taskDesc, deadline, priority, progress }) {
  return _send({
    to, toName: name,
    subject: `[Rappel] ${taskTitle} — échéance approche · ${APP_NAME}`,
    html:    buildReminderEmailHTML(name, taskTitle, taskDesc, deadline, priority, progress),
    text:    `Rappel ${APP_NAME}\n\nBonjour ${name},\n\nTâche : ${taskTitle}\nÉchéance : ${deadline}\nAvancement : ${progress}%\n\n— ${APP_NAME}`,
    tags:    [{ name: 'type', value: 'reminder' }],
  });
}

async function sendWelcomeEmail({ to, name }) {
  return _send({
    to, toName: name,
    subject: `Bienvenue sur ${APP_NAME}, ${name} ✦`,
    html:    buildWelcomeEmailHTML(name),
    text:    `Bienvenue sur ${APP_NAME}, ${name} ! Votre compte est activé.\n\n— ${APP_NAME}`,
    tags:    [{ name: 'type', value: 'welcome' }],
  });
}

module.exports = { sendOTPEmail, sendReminderEmail, sendWelcomeEmail };
