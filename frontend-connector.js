// ═══════════════════════════════════════════════════════════════════════════
//  CONNECTEUR FRONTEND → BACKEND Hird Note
//  Ajoutez ce code dans HirdNote-Android.html pour remplacer la simulation
//
//  Remplacez BACKEND_URL par votre URL Render (ex: https://hird-note-backend.onrender.com)
// ═══════════════════════════════════════════════════════════════════════════

const BACKEND_URL = 'https://hird-note-backend.onrender.com'; // ← votre URL Render

// ── Client API ────────────────────────────────────────────────────────────
const API = {
  async request(method, endpoint, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BACKEND_URL + endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erreur serveur');
    return data;
  },

  // Envoyer l'OTP
  sendOTP: (email, name, type = 'register') =>
    API.request('POST', '/api/auth/send-otp', { email, name, type }),

  // Vérifier l'OTP → retourne verificationToken
  verifyOTP: (email, otp) =>
    API.request('POST', '/api/auth/verify-otp', { email, otp }),

  // Finaliser l'inscription
  register: (verificationToken, name, phone, dial, password) =>
    API.request('POST', '/api/auth/register', { verificationToken, name, phone, dial, password }),

  // Connexion
  login: (email, password) =>
    API.request('POST', '/api/auth/login', { email, password }),

  // Mot de passe oublié
  forgotPassword: (email) =>
    API.request('POST', '/api/auth/forgot-password', { email }),


  // Envoyer l'OTP SMS
  sendSmsOTP: (phone, name, code) =>
    API.request('POST', '/api/auth/send-sms-otp', { phone, name, code }),

  // Vérifier l'OTP SMS
  verifySmsOTP: (phone, otp) =>
    API.request('POST', '/api/auth/verify-sms-otp', { phone, otp }),
  // Réinitialiser le mot de passe
  resetPassword: (verificationToken, newPassword) =>
    API.request('POST', '/api/auth/reset-password', { verificationToken, newPassword }),

  // Récupérer le profil
  getMe: (token) =>
    API.request('GET', '/api/auth/me', null, token),
};

// ══ REMPLACER LES FONCTIONS EXISTANTES DANS HIRDNOTE-ANDROID.HTML ════════

// Remplace sendOTPEmail() — appelle le vrai backend Brevo
async function sendOTPEmail(code, email, name) {
  try {
    await API.sendOTP(email, name, 'register');
    toast('Code envoyé à ' + email + ' ✓', 'success');
  } catch (err) {
    toast('Erreur envoi email : ' + err.message, 'error');
    // Fallback simulation
    showSimulationOTP(code);
  }
}

// Remplace verifyOTP() — vérifie via le backend
async function verifyOTP() {
  const entered = Array.from({length:6}, (_,i) => document.getElementById('otp-'+i).value).join('');
  const email   = _pendingProfile?.email || '';
  if (!entered || entered.length < 6) return;

  try {
    document.getElementById('otp-verify-btn').disabled = true;
    document.getElementById('otp-verify-btn').textContent = 'Vérification…';

    const result = await API.verifyOTP(email, entered);

    // ✓ Stocker le token de vérification
    _verificationToken = result.verificationToken;
    for (let i = 0; i < 6; i++) document.getElementById('otp-' + i).className = 'otp-digit success';
    toast('Email vérifié ✓', 'success');
    setTimeout(() => {
      document.getElementById('otp-screen').style.display = 'none';
      document.getElementById('password-screen').style.display = 'flex';
    }, 800);
  } catch (err) {
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById('otp-' + i);
      el.value = ''; el.className = 'otp-digit error';
    }
    setTimeout(() => {
      for (let i = 0; i < 6; i++) document.getElementById('otp-'+i).className='otp-digit';
    }, 800);
    document.getElementById('otp-verify-btn').disabled = false;
    document.getElementById('otp-verify-btn').textContent = 'Vérifier le code';
    toast(err.message, 'error');
  }
}

// Remplace createPassword() — inscription finale via le backend
let _verificationToken = '';
async function createPassword() {
  const pwd = document.getElementById('pwd-new').value;
  if (pwd !== document.getElementById('pwd-confirm').value) {
    toast('Les mots de passe ne correspondent pas', 'error'); return;
  }
  try {
    document.getElementById('pwd-create-btn').disabled = true;
    document.getElementById('pwd-create-btn').textContent = 'Création du compte…';

    const result = await API.register(
      _verificationToken,
      _pendingProfile.name,
      _pendingProfile.phone,
      _pendingProfile.dial,
      pwd
    );

    // Sauvegarder le JWT
    localStorage.setItem('hird_access_token', result.accessToken);

    profile = _pendingProfile;
    profile.email = result.user.email;
    saveProf();

    document.getElementById('password-screen').style.display = 'none';
    applyProfileToUI();
    renderTasks();
    toast('Compte créé ! Bienvenue sur Hird Note ✦', 'success');
  } catch (err) {
    document.getElementById('pwd-create-btn').disabled = false;
    document.getElementById('pwd-create-btn').textContent = '✦ Créer mon compte';
    toast(err.message, 'error');
  }
}

// Remplace loginUser() — connexion via le backend
async function loginUser() {
  const pwd = document.getElementById('login-pwd').value;
  if (!pwd || !profile?.email) return;
  try {
    document.getElementById('login-btn').disabled = true;
    document.getElementById('login-btn').textContent = 'Connexion…';

    const result = await API.login(profile.email, pwd);

    localStorage.setItem('hird_access_token', result.accessToken);
    _loginAttempts = 0;
    document.getElementById('login-screen').style.display = 'none';
    applyProfileToUI();
    renderTasks();
    toast('Connexion réussie ✦', 'success');
  } catch (err) {
    _loginAttempts++;
    document.getElementById('login-btn').disabled = false;
    document.getElementById('login-btn').textContent = 'Entrer dans Hird Note';
    document.getElementById('login-pwd').value = '';
    document.getElementById('login-status').className = 'field-status err';
    document.getElementById('login-status').textContent = '✗ ' + err.message;
    if (_loginAttempts >= 5) {
      document.getElementById('login-attempts-warn').style.display = 'block';
      document.getElementById('login-attempts-txt').textContent = _loginAttempts + ' tentatives. Utilisez "Mot de passe oublié".';
    }
    toast(err.message, 'error');
  }
}

// Remplace forgotPassword()
async function forgotPassword() {
  if (!profile?.email) { toast('Aucun email associé', 'error'); return; }
  try {
    await API.forgotPassword(profile.email);
    _pendingProfile = profile;
    document.getElementById('login-screen').style.display = 'none';
    _pendingOTP  = '------'; // géré par le backend
    _otpExpiry   = Date.now() + 10 * 60 * 1000;
    _otpAttempts = 0;
    _resetMode   = true;
    document.getElementById('otp-email-display').textContent = profile.email;
    for (let i = 0; i < 6; i++) {
      const el = document.getElementById('otp-' + i);
      el.value = ''; el.className = 'otp-digit';
    }
    document.getElementById('otp-screen').style.display = 'flex';
    startOTPTimer();
    toast('Code envoyé à ' + profile.email, 'success');
    document.getElementById('otp-0').focus();
  } catch (err) {
    toast(err.message, 'error');
  }
}
