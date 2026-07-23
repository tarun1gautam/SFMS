// utils/inputGuard.js
//
// Frontend guard against characters that can corrupt path-based logic
// (full_path / parent_path use '/' as a structural separator) or break
// the manual Postgres array literals built elsewhere in the app
// (e.g. `{"${u}"}` in editFile — a stray '"' or ',' there is not just
// a display bug, it changes what gets stored).
//
// This is a UX safeguard, not a security boundary — the backend must
// still validate/parameterize independently. This just stops normal
// users from accidentally typing something that silently breaks things.

const RESERVED_WINDOWS_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1','COM2','COM3','COM4','COM5','COM6','COM7','COM8','COM9',
  'LPT1','LPT2','LPT3','LPT4','LPT5','LPT6','LPT7','LPT8','LPT9',
];

// Characters that break: URL path segments, Windows filenames,
// or the manual `{"user"}` postgres array literal built in editFile.
const UNSAFE_CHAR_PATTERN = /[\/\\<>:"|?*\x00-\x1F]/;

export function validateName(name, { label = 'Name' } = {}) {
  const trimmed = (name || '').trim();

  if (!trimmed) {
    return { valid: false, message: `${label} cannot be empty.` };
  }
  if (trimmed.length > 200) {
    return { valid: false, message: `${label} is too long (max 200 characters).` };
  }
  if (UNSAFE_CHAR_PATTERN.test(trimmed)) {
    return { valid: false, message: `${label} cannot contain / \\ < > : " | ? * or control characters.` };
  }
  if (/^\.+$/.test(trimmed)) {
    return { valid: false, message: `${label} cannot be just dots.` };
  }
  if (RESERVED_WINDOWS_NAMES.includes(trimmed.toUpperCase())) {
    return { valid: false, message: `"${trimmed}" is a reserved system name — choose another.` };
  }
  if (/,/.test(trimmed)) {
    return { valid: false, message: `${label} cannot contain a comma.` };
  }
  return { valid: true, message: '' };
}

// For descriptions/free text — looser, just blocks control chars and
// the quote character that would break the manual array literal if
// this value ever ends up interpolated anywhere.
export function validateFreeText(text, { label = 'Description', maxLen = 2000 } = {}) {
  const trimmed = (text || '').trim();
  if (trimmed.length > maxLen) {
    return { valid: false, message: `${label} is too long (max ${maxLen} characters).` };
  }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed)) {
    return { valid: false, message: `${label} contains invalid control characters.` };
  }
  return { valid: true, message: '' };
}

// For a single username being added into a target_users chip list —
// this one matters most, since target_users gets hand-built into a
// postgres array literal string in fileController.editFile.
export function validateUsername(username) {
  const trimmed = (username || '').trim();
  if (!trimmed) return { valid: false, message: 'Invalid user.' };
  if (/["',\\]/.test(trimmed)) {
    return { valid: false, message: 'Selected user contains an unsupported character.' };
  }
  return { valid: true, message: '' };
}