require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();

// ── Variables d'environnement ──────────────────────────────────────────
const SUPABASE_URL   = process.env.SUPABASE_URL   || '';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || '';
const POSTMARK_TOKEN = process.env.POSTMARK_TOKEN || '';
const FROM_EMAIL     = process.env.FROM_EMAIL     || 'noreply@hird-tech.com';
const BREVO_KEY      = process.env.BREVO_API_KEY  || '';

console.log('[Config] SUPABASE_URL:',    SUPABASE_URL   ? '✓ défini' : '✗ MANQUANT');
console.log('[Config] SUPABASE_KEY:',    SUPABASE_KEY   ? '✓ défini' : '✗ MANQUANT');
console.log('[Config] POSTMARK_TOKEN:',  POSTMARK_TOKEN ? '✓ défini' : '✗ MANQUANT');
console.log('[Config] BREVO_KEY:',       BREVO_KEY      ? '✓ défini' : '✗ MANQUANT');

// ── CORS ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Supabase ───────────────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('[Config] Supabase connecté');
}

// ── Postmark (rappels) ─────────────────────────────────────────────────
let postmarkClient = null;
if (POSTMARK_TOKEN) {
  const postmark = require('postmark');
  postmarkClient = new postmark.ServerClient(POSTMARK_TOKEN);
  console.log('[Config] Postmark connecté');
}

// ── Brevo (OTP) ────────────────────────────────────────────────────────
// ── Envoi email via Postmark ──────────────────────────────────────────
function sendViaPostmark(to, toName, subject, htmlContent, textContent) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      From         : FROM_EMAIL,
      To           : to,
      Subject      : subject,
      HtmlBody     : htmlContent,
      TextBody     : textContent || '',
      MessageStream: 'outbound',
    });
    const options = {
      hostname: 'api.postmarkapp.com',
      path    : '/email',
      method  : 'POST',
      headers : {
        'Content-Type'         : 'application/json',
        'X-Postmark-Server-Token': POSTMARK_TOKEN,
        'Content-Length'       : Buffer.byteLength(body),
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, provider: 'postmark' });
        } else {
          reject(new Error('Postmark erreur ' + res.statusCode + ': ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Envoi email via Brevo ────────────────────────────────────────────
function sendViaBrevo(to, toName, subject, htmlContent, textContent) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender     : { name: 'Hird Note', email: FROM_EMAIL },
      to         : [{ email: to, name: toName || to }],
      subject    : subject,
      htmlContent: htmlContent,
      textContent: textContent,
    });
    const options = {
      hostname: 'api.brevo.com',
      path    : '/v3/smtp/email',
      method  : 'POST',
      headers : {
        'Content-Type' : 'application/json',
        'api-key'      : BREVO_KEY,
        'Content-Length': Buffer.byteLength(body),
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, provider: 'brevo' });
        } else {
          reject(new Error('Brevo erreur ' + res.statusCode + ': ' + data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Envoi email — Postmark d'abord, Brevo en fallback ────────────────
async function sendBrevoEmail(to, toName, subject, htmlContent, textContent) {
  // Essayer Postmark en premier (déjà approuvé, domaine vérifié)
  if (POSTMARK_TOKEN) {
    try {
      const result = await sendViaPostmark(to, toName, subject, htmlContent, textContent);
      console.log('[Email] Envoyé via Postmark à', to);
      return result;
    } catch(e) {
      console.warn('[Email] Postmark échoué:', e.message, '— tentative Brevo');
    }
  }
  // Fallback Brevo
  if (BREVO_KEY) {
    const result = await sendViaBrevo(to, toName, subject, htmlContent, textContent);
    console.log('[Email] Envoyé via Brevo à', to);
    return result;
  }
  throw new Error('Aucun service email configuré (Postmark + Brevo absents)');
}

// ── Stockage OTP ───────────────────────────────────────────────────────
const otpStore = new Map();

// ══ ROUTE SANTÉ ══════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status : 'ok',
    service: 'Hird Note Backend v2.1',
    config : {
      supabase : !!supabase,
      postmark : !!postmarkClient,
      brevo    : !!BREVO_KEY,
    }
  });
});

// ══ ROUTES OTP (via Brevo) ════════════════════════════════════════════

// POST /api/auth/send-otp
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, name, otp_override } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email requis' });

    const code   = otp_override || Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + 10 * 60 * 1000;
    otpStore.set(email, { code, expiry });

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;">
        <div style="background:#1C1A16;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
          <div style="color:#C9A84C;font-size:22px;font-weight:700;letter-spacing:2px;">✦ HIRD NOTE</div>
        </div>
        <p style="color:#333;">Bonjour <strong>${name || email}</strong>,</p>
        <p style="color:#555;">Votre code de vérification Hird Note :</p>
        <div style="background:#f5f0e8;border:2px solid #C9A84C;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
          <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1C1A16;">${code}</div>
        </div>
        <p style="color:#888;font-size:13px;">Ce code expire dans 10 minutes. Ne le partagez jamais.</p>
        <p style="color:#aaa;font-size:11px;margin-top:24px;">— Hird Note · Votre assistant de productivité</p>
      </div>`;

    await sendBrevoEmail(
      email,
      name || email,
      'Votre code de vérification Hird Note',
      html,
      `Code Hird Note : ${code}\n\nExpire dans 10 minutes.`
    );

    console.log('[OTP] Code envoyé via Brevo à', email);
    res.json({ success: true, message: 'Code OTP envoyé' });

  } catch (err) {
    console.error('[OTP] Erreur Brevo:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email et OTP requis' });

  const record = otpStore.get(email);
  if (!record) return res.json({ success: false, message: 'Code non trouvé' });
  if (Date.now() > record.expiry) {
    otpStore.delete(email);
    return res.json({ success: false, message: 'Code expiré' });
  }
  if (record.code !== otp.toString()) return res.json({ success: false, message: 'Code incorrect' });

  otpStore.delete(email);
  const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
  res.json({ success: true, verificationToken: token });
});

// ══ ROUTES RAPPELS (via Postmark) ═════════════════════════════════════

// Fonction d'envoi email rappel (Postmark si dispo, sinon Brevo)
async function sendReminderEmail(to, subject, html, text) {
  // Utilise sendBrevoEmail : Postmark d'abord, Brevo en fallback
  await sendBrevoEmail(to, to, subject, html, text);
}

// POST /api/reminders/schedule
app.post('/api/reminders/schedule', async (req, res) => {
  if (!supabase) return res.status(503).json({ success: false, error: 'Supabase non configuré' });
  try {
    const {
      task_id, user_email, user_name, task_title,
      task_desc = '', deadline, priority = 'moyenne',
      progress = 0, reminder_minutes, group_members = []
    } = req.body;

    if (!task_id || !user_email || !task_title || !deadline || !reminder_minutes) {
      return res.status(400).json({ success: false, error: 'Champs manquants' });
    }

    const deadlineDate = new Date(deadline);
    const reminderDate = new Date(deadlineDate.getTime() - reminder_minutes * 60 * 1000);

    if (reminderDate <= new Date()) {
      return res.status(400).json({ success: false, error: 'Rappel déjà passé' });
    }

    await supabase.from('scheduled_reminders')
      .delete().eq('task_id', task_id).eq('sent', false);

    const { data, error } = await supabase.from('scheduled_reminders')
      .insert({
        task_id, user_email, user_name, task_title, task_desc,
        deadline: deadlineDate.toISOString(), priority, progress,
        reminder_time: reminderDate.toISOString(), group_members
      }).select().single();

    if (error) throw error;

    console.log(`[Rappel] Programmé: "${task_title}" → ${reminderDate.toLocaleString('fr-FR')}`);
    res.json({ success: true, id: data.id, reminder_time: reminderDate.toISOString() });

  } catch (err) {
    console.error('[Rappel] Erreur schedule:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reminders/process
app.get('/api/reminders/process', async (req, res) => {
  if (!supabase) return res.status(503).json({ success: false, error: 'Supabase non configuré' });
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
      return res.json({ success: true, processed: 0 });
    }

    let sent = 0;
    for (const r of reminders) {
      try {
        const deadline    = new Date(r.deadline);
        const diffMin     = Math.round((deadline - now) / 60000);
        const delayText   = diffMin >= 60 ? `${Math.round(diffMin/60)}h` : `${Math.max(0,diffMin)} min`;
        const deadlineStr = deadline.toLocaleString('fr-FR', {
          day:'2-digit', month:'long', year:'numeric',
          hour:'2-digit', minute:'2-digit'
        });
        const emoji      = { haute:'🔥', moyenne:'🟡', basse:'🟢' }[r.priority] || '🟡';
        const recipients = [r.user_email, ...(r.group_members || [])];

        for (const email of recipients) {
          const isOwner = email === r.user_email;
          const html = `
            <div style="font-family:Arial;max-width:520px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;">
              <div style="background:#1C1A16;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px;">
                <div style="color:#C9A84C;font-size:18px;font-weight:700;">✦ HIRD NOTE</div>
                <div style="background:#C4623A;color:#fff;border-radius:20px;padding:4px 12px;font-size:12px;display:inline-block;margin-top:6px;">⏰ Dans ${delayText}</div>
              </div>
              <p>Bonjour <strong>${isOwner ? r.user_name : 'Membre du groupe'}</strong>,</p>
              ${!isOwner ? `<p style="color:#666;font-size:13px;">Tâche de <strong>${r.user_name}</strong></p>` : ''}
              <h2 style="color:#1C1A16;font-size:18px;">${r.task_title}</h2>
              ${r.task_desc ? `<p style="color:#666;">${r.task_desc}</p>` : ''}
              <p>📅 <strong>${deadlineStr}</strong></p>
              <p>${emoji} ${r.priority} | 📊 ${r.progress}%</p>
              <div style="background:#f0f0f0;border-radius:4px;height:6px;margin:8px 0;">
                <div style="background:#C9A84C;border-radius:4px;height:6px;width:${r.progress}%;"></div>
              </div>
              <p style="color:#aaa;font-size:11px;text-align:center;">Hird Note · Votre assistant de productivité</p>
            </div>`;
          await sendReminderEmail(
            email,
            `⏰ Rappel Hird Note — ${r.task_title}`,
            html,
            `Rappel dans ${delayText} : "${r.task_title}"\nÉchéance : ${deadlineStr}\n\n— Hird Note`
          );
        }

        await supabase.from('scheduled_reminders')
          .update({ sent: true, sent_at: now.toISOString() })
          .eq('id', r.id);

        sent++;
        console.log(`[Cron] ✓ "${r.task_title}" → ${recipients.join(', ')}`);
      } catch (e) {
        console.error(`[Cron] Erreur ${r.id}:`, e.message);
      }
    }
    res.json({ success: true, processed: reminders.length, sent });
  } catch (err) {
    console.error('[Cron] Erreur:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/reminders/cancel/:task_id
app.delete('/api/reminders/cancel/:task_id', async (req, res) => {
  if (!supabase) return res.status(503).json({ success: false });
  try {
    await supabase.from('scheduled_reminders')
      .delete().eq('task_id', req.params.task_id).eq('sent', false);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reminders/send — rappel immédiat
app.post('/api/reminders/send', async (req, res) => {
  try {
    const { to, name, taskTitle, taskDesc, deadline, priority, progress, creator, minutesBefore } = req.body;
    if (!to || !taskTitle) return res.status(400).json({ success: false });

    const emoji     = { haute:'🔥', moyenne:'🟡', basse:'🟢' }[priority] || '🟡';
    const delayText = minutesBefore ? `${minutesBefore} min` : 'maintenant';
    const html = `
      <div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px;background:#fff;border-radius:12px;">
        <div style="background:#1C1A16;border-radius:8px;padding:16px;text-align:center;margin-bottom:20px;">
          <div style="color:#C9A84C;font-size:18px;font-weight:700;">✦ HIRD NOTE</div>
        </div>
        <p>Bonjour <strong>${name || to}</strong>,</p>
        ${creator ? `<p style="color:#666;font-size:13px;">Tâche de <strong>${creator}</strong></p>` : ''}
        <h2 style="color:#1C1A16;">${taskTitle}</h2>
        ${taskDesc ? `<p>${taskDesc}</p>` : ''}
        <p>📅 Échéance : <strong>${deadline}</strong></p>
        <p>${emoji} ${priority} | 📊 ${progress}%</p>
        <p style="color:#aaa;font-size:11px;">— Hird Note</p>
      </div>`;

    await sendReminderEmail(
      to,
      `⏰ Rappel Hird Note — ${taskTitle}`,
      html,
      `Rappel dans ${delayText} : "${taskTitle}"\nÉchéance : ${deadline}\n\n— Hird Note`
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Send] Erreur:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ══ CRON JOB INTERNE ═══════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✦ Hird Note Backend v2.1 — Port ${PORT}`);
  if (supabase) {
    console.log('[Cron] Démarrage — vérification toutes les 60s');
    setInterval(async () => {
      try {
        const now = new Date();
        const { data } = await supabase
          .from('scheduled_reminders')
          .select('id')
          .eq('sent', false)
          .lte('reminder_time', now.toISOString())
          .limit(1);
        if (data && data.length > 0) {
          const resp = await fetch(`http://localhost:${PORT}/api/reminders/process`);
          const result = await resp.json();
          if (result.sent > 0) console.log(`[Cron] ${result.sent} email(s) envoyé(s)`);
        }
      } catch (e) {
        console.error('[Cron] Erreur tick:', e.message);
      }
    }, 60000);
  }
});
