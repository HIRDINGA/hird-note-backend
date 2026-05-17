// ═══════════════════════════════════════════════════════════════════════════
//  utils/validators.js
//  Fonctions de validation des entrées utilisateur
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valide un email (RFC basique)
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return re.test(email.trim().toLowerCase());
}

/**
 * Valide un OTP (exactement 6 chiffres)
 */
function validateOTP(otp) {
  if (!otp || typeof otp !== 'string') return false;
  return /^\d{6}$/.test(otp.trim());
}

/**
 * Valide un mot de passe (min 8 caractères)
 */
function validatePassword(pwd) {
  if (!pwd || typeof pwd !== 'string') return false;
  return pwd.length >= 8 && pwd.length <= 128;
}

/**
 * Valide un numéro de téléphone (6 à 15 chiffres)
 */
function validatePhone(phone) {
  if (!phone) return true; // facultatif
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 6 && digits.length <= 15;
}

/**
 * Sanitize une chaîne (supprimer les caractères dangereux)
 */
function sanitizeString(str, maxLength = 100) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength).replace(/[<>]/g, '');
}

module.exports = {
  validateEmail,
  validateOTP,
  validatePassword,
  validatePhone,
  sanitizeString,
};
