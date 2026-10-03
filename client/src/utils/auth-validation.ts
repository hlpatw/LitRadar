// Client-side auth form validation. Mirrors the server-side DTO contract
// (username MinLength(3), email IsEmail, password MinLength(8)) so the client and
// server never disagree on what is acceptable — the staging bug was a 6-vs-8
// password mismatch that only surfaced as an opaque 400.

export const MIN_USERNAME_LENGTH = 3;
export const MIN_PASSWORD_LENGTH = 8;

// Pragmatic email shape: non-empty local part @ domain with a dot. Matches the
// spirit of class-validator @IsEmail without its permissive edge cases.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterFormValues {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginFormValues {
  username: string;
  password: string;
}

/**
 * Return a human-readable Chinese error for the first failing rule, or null when
 * the form is valid. Pure: same inputs → same output, no DOM/browser dependencies.
 */
export function validateRegisterInput(values: RegisterFormValues): string | null {
  const username = (values.username ?? '').trim();
  const email = (values.email ?? '').trim();
  const password = values.password ?? '';
  const confirmPassword = values.confirmPassword ?? '';

  if (!username || username.length < MIN_USERNAME_LENGTH) {
    return `用户名至少 ${MIN_USERNAME_LENGTH} 个字符`;
  }
  if (!EMAIL_PATTERN.test(email)) {
    return '请输入有效的邮箱地址';
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  }
  if (password !== confirmPassword) {
    return '两次输入的密码不一致';
  }
  return null;
}

/** Return a Chinese error for empty login fields, or null when non-empty. */
export function validateLoginInput(values: LoginFormValues): string | null {
  if (!(values.username ?? '').trim()) return '请输入用户名';
  if (!(values.password ?? '')) return '请输入密码';
  return null;
}
