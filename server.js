// ═══════════════════════════════════════════════════════════════════════
// HIRD NOTE BACKEND v2.0
// Express + Supabase + Postmark + Brevo OTP
// ═══════════════════════════════════════════════════════════════════════

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const app      = express();

// ── CORS ───────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Permettre les requêtes sans origin (Postman, mobile, no-cors)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Permettre tous les netlify.app par défaut
    if (origin.endsWith('.netlify.app')) return callback(null, true);
    if (origin.endsWith('.onrender.com')) return callback(null, true);
    callback(null, true); // Permissif pour le développement
  },
  credentials: true,
}));

app.use(express.json());

// ── Supabase ───────────────────────────────────────────────────────────
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Postmark ───────────────────────────────────────────────────────────
const postmark = require('postmark');
const postmarkClient = new postmark.ServerClient(process.env.POSTMARK_TOKEN);
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@hird-tech.com';

// ── Stockage OTP en mémoire ────────────────────────────────────────────
const otpStore = new Map();

// ══ ROUTES OTP ══════════════════════════════════════════════════════════

// POST /api/auth/send-otp
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, name, otp_override } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email requis' });

    const code    = otp_override || Math.floor(100000 + Math.random() * 900000).toString();
    const expiry  = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email, { code, expiry });

    // Envoyer via Postmark
    await postmarkClient.sendEmail({
      From   : FROM_EMAIL,
      To     : email,
      Subject: 'Votre code de vérification Hird Note',
      HtmlBody: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;">
          <div style="background:#1C1A16;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
            <div style="color:#C9A84C;font-size:22px;font-weight:700;letter-spacing:2px;">✦ HIRD NOTE</div>
          </div>
          <p style="color:#333;">Bonjour <strong>${name || email}</strong>,</p>
          <p style="color:#555;">Votre code de vérification est :</p>
          <div style="background:#f5f0e8;border:2px solid #C9A84C;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
            <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1C1A16;">${code}</div>
          </div>
          <p style="color:#888;font-size:13px;">Ce code expire dans 10 minutes. Ne le partagez jamais.</p>
          <p style="color:#aaa;font-size:11px;margin-top:24px;">— Hird Note · Votre assistant de productivité</p>
        </div>`,
      TextBody: `Bonjour ${name || email},\n\nVotre code Hird Note : ${code}\n\nExpire dans 10 minutes.\n\n— Hird Note`,
      MessageStream: 'outbound',
    });

    console.log(`[OTP] Code envoyé à ${email}`);
    res.json({ success: true, message: 'Code OTP envoyé' });

  } catch (err) {
    console.error('[OTP] Erreur envoi:', err.message);
    res.status(500).json({ success: false, message: 'Erreur envoi OTP: ' + err.message });
  }
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email et OTP requis' });

  const record = otpStore.get(email);
  if (!record) return res.json({ success: false, message: 'Code non trouvé ou expiré' });
  if (Date.now() > record.expiry) {
    otpStore.delete(email);
    return res.json({ success: false, message: 'Code expiré' });
  }
  if (record.code !== otp.toString()) {
    return res.json({ success: false, message: 'Code incorrect' });
  }

  otpStore.delete(email);
  const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
  res.json({ success: true, verificationToken: token });
});

// ══ ROUTES RAPPELS ══════════════════════════════════════════════════════

// POST /api/reminders/schedule — programmer un rappel
app.post('/api/reminders/schedule', async (req, res) => {
  try {
    const {
      task_id, user_email, user_name, task_title,
      task_desc = '', deadline, priority = 'moyenne',
      progress = 0, reminder_minutes, group_members = []
    } = req.body;

    if (!task_id || !user_email || !task_title || !deadline || !reminder_minutes) {
      return res.status(400).json({ success: false, error: 'Champs manquants' });
    }

    const deadlineDate  = new Date(deadline);
    const reminderDate  = new Date(deadlineDate.getTime() - reminder_minutes * 60 * 1000);

    if (reminderDate <= new Date()) {
      return res.status(400).json({ success: false, error: 'Rappel déjà passé' });
    }

    // Supprimer anciens rappels non envoyés pour cette tâche
    await supabase.from('scheduled_reminders')
      .delete().eq('task_id', task_id).eq('sent', false);

    // Insérer le nouveau rappel
    const { data, error } = await supabase.from('scheduled_reminders')
      .insert({
        task_id, user_email, user_name, task_title, task_desc,
        deadline: deadlineDate.toISOString(),
        priority, progress,
        reminder_time: reminderDate.toISOString(),
        group_members
      }).select().single();

    if (error) throw error;

    console.log(`[Rappel] Programmé: "${task_title}" → ${reminderDate.toLocaleString('fr-FR')}`);
    res.json({ success: true, id: data.id, reminder_time: reminderDate.toISOString() });

  } catch (err) {
    console.error('[Rappel] Erreur schedule:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reminders/process — traiter les rappels dus (cron)
app.get('/api/reminders/process', async (req, res) => {
  try {
    const now = new Date();
    const { data: reminders, error } = await supabase
      .from('scheduled_reminders')
      .select('*')
      .eq('sent', false)
      .lte('reminder_time', now.toISOString())
      .limit(50);

    if (error) throw error;
    if (!reminders || reminders.length === 0) {
      return res.json({ success: true, processed: 0, message: 'Aucun rappel dû' });
    }

    console.log(`[Cron] ${reminders.length} rappel(s) à traiter`);
    let sent = 0;

    for (const reminder of reminders) {
      try {
        const deadline    = new Date(reminder.deadline);
        const diffMin     = Math.round((deadline - now) / 60000);
        const delayText   = diffMin >= 60 ? `${Math.round(diffMin/60)}h` : `${Math.max(0,diffMin)} min`;
        const deadlineStr = deadline.toLocaleString('fr-FR', {
          day:'2-digit', month:'long', year:'numeric',
          hour:'2-digit', minute:'2-digit'
        });

        const recipients = [reminder.user_email];
        if (reminder.group_members && reminder.group_members.length > 0) {
          recipients.push(...reminder.group_members);
        }

        const priorityEmoji = { haute:'🔥', moyenne:'🟡', basse:'🟢' }[reminder.priority] || '🟡';

        for (const email of recipients) {
          const isOwner = email === reminder.user_email;
          await postmarkClient.sendEmail({
            From   : FROM_EMAIL,
            To     : email,
            Subject: `⏰ Rappel Hird Note — ${reminder.task_title}`,
            HtmlBody: `
              <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);">
                <div style="background:#1C1A16;border-radius:8px;padding:20px;text-align:center;margin-bottom:20px;">
                  <div style="color:#C9A84C;font-size:20px;font-weight:700;">✦ HIRD NOTE</div>
                  <div style="background:#C4623A;color:#fff;border-radius:20px;padding:4px 14px;font-size:13px;display:inline-block;margin-top:8px;">⏰ Dans ${delayText}</div>
                </div>
                <p>Bonjour <strong>${isOwner ? reminder.user_name : 'Membre du groupe'}</strong>,</p>
                ${!isOwner ? `<p style="color:#666;font-size:13px;">📋 Tâche créée par <strong>${reminder.user_name}</strong></p>` : ''}
                <h2 style="color:#1C1A16;font-size:18px;margin:0 0 16px;">${reminder.task_title}</h2>
                ${reminder.task_desc ? `<p style="color:#666;font-size:13px;">${reminder.task_desc}</p>` : ''}
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">📅 Échéance</td><td style="font-weight:600;font-size:13px;text-align:right;">${deadlineStr}</td></tr>
                  <tr><td style="padding:8px 0;border-bottom:1px solid #f0f0f0;color:#888;font-size:13px;">⚡ Priorité</td><td style="font-weight:600;font-size:13px;text-align:right;">${priorityEmoji} ${reminder.priority}</td></tr>
                  <tr><td style="padding:8px 0;color:#888;font-size:13px;">📊 Progression</td><td style="font-weight:600;font-size:13px;text-align:right;">${reminder.progress}%</td></tr>
                </table>
                <div style="background:#f0f0f0;border-radius:4px;height:8px;margin:12px 0;">
                  <div style="background:#C9A84C;border-radius:4px;height:8px;width:${reminder.progress}%;"></div>
                </div>
                <p style="color:#aaa;font-size:11px;text-align:center;margin-top:20px;">Hird Note · Votre assistant de productivité</p>
              </div>`,
            TextBody: `Rappel dans ${delayText} : "${reminder.task_title}"\nÉchéance : ${deadlineStr}\n\n— Hird Note`,
            MessageStream: 'outbound',
          });
        }

        await supabase.from('scheduled_reminders')
          .update({ sent: true, sent_at: now.toISOString() })
          .eq('id', reminder.id);

        sent++;
        console.log(`[Cron] ✓ Email(s) envoyé(s) pour: "${reminder.task_title}"`);

      } catch (emailErr) {
        console.error(`[Cron] Erreur pour ${reminder.id}:`, emailErr.message);
      }
    }

    res.json({ success: true, processed: reminders.length, sent });

  } catch (err) {
    console.error('[Cron] Erreur process:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/reminders/cancel/:task_id
app.delete('/api/reminders/cancel/:task_id', async (req, res) => {
  try {
    await supabase.from('scheduled_reminders')
      .delete().eq('task_id', req.params.task_id).eq('sent', false);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reminders/send — rappel immédiat (depuis frontend)
app.post('/api/reminders/send', async (req, res) => {
  try {
    const { to, name, taskTitle, taskDesc, deadline, priority, progress, creator, minutesBefore } = req.body;
    if (!to || !taskTitle) return res.status(400).json({ success: false });

    const priorityEmoji = { haute:'🔥', moyenne:'🟡', basse:'🟢' }[priority] || '🟡';
    const delayText = minutesBefore ? `${minutesBefore} min` : 'maintenant';

    await postmarkClient.sendEmail({
      From   : FROM_EMAIL,
      To     : to,
      Subject: `⏰ Rappel Hird Note — ${taskTitle}`,
      HtmlBody: `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#C9A84C;">⏰ Rappel Hird Note</h2>
        <p>Bonjour <strong>${name || to}</strong>,</p>
        ${creator ? `<p style="color:#666;font-size:13px;">Tâche de <strong>${creator}</strong></p>` : ''}
        <h3>${taskTitle}</h3>
        ${taskDesc ? `<p>${taskDesc}</p>` : ''}
        <p>📅 Échéance : <strong>${deadline}</strong></p>
        <p>${priorityEmoji} Priorité : ${priority} | 📊 ${progress}%</p>
        <p style="color:#aaa;font-size:11px;">— Hird Note</p>
      </div>`,
      TextBody: `Rappel dans ${delayText} : "${taskTitle}"\nÉchéance : ${deadline}\n\n— Hird Note`,
      MessageStream: 'outbound',
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Send] Erreur:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Route santé ────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Hird Note Backend v2.0' });
});

// ══ CRON JOB INTERNE (toutes les 60 secondes) ═══════════════════════════
function startCronJob() {
  console.log('[Cron] Démarré — vérification toutes les 60s');
  setInterval(async () => {
    try {
      const now = new Date();
      const { data: reminders } = await supabase
        .from('scheduled_reminders')
        .select('id')
        .eq('sent', false)
        .lte('reminder_time', now.toISOString())
        .limit(1);

      if (reminders && reminders.length > 0) {
        // Appel interne à processReminders
        const fakeReq = {};
        const fakeRes = {
          json: (d) => console.log('[Cron] Résultat:', JSON.stringify(d)),
          status: (c) => ({ json: (d) => console.error('[Cron] Erreur:', d) })
        };
        // Appel direct à la logique process
        const resp = await fetch(`http://localhost:${PORT}/api/reminders/process`);
        const data = await resp.json();
        if (data.sent > 0) console.log(`[Cron] ${data.sent} email(s) envoyé(s)`);
      }
    } catch (e) {
      console.error('[Cron] Erreur tick:', e.message);
    }
  }, 60 * 1000);
}

// ── Démarrage ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✦ Hird Note Backend v2.0 — Port ${PORT}`);
  startCronJob();
});
