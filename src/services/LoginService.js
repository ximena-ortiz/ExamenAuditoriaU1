// Autenticación simple con credenciales fijas y mejoras de sesión
const credentials = { username: "admin", password: "123456" };
const MAX_ATTEMPTS = 3;
const BLOCK_MS = 30_000; // 30s de bloqueo
const SESSION_MS = 2 * 60 * 60 * 1000; // 2h

function now() { return Date.now(); }

export const login = (username, password) => {
  return new Promise((resolve, reject) => {
    const blockedUntil = parseInt(localStorage.getItem('blockedUntil') || '0', 10);
    if (now() < blockedUntil) {
      const secs = Math.ceil((blockedUntil - now()) / 1000);
      return reject({ success: false, message: `Demasiados intentos. Intenta en ${secs}s` });
    }

    setTimeout(() => {
      if (username === credentials.username && password === credentials.password) {
        const token = "mock-jwt-" + Math.random().toString(36).slice(2);
        const expiresAt = now() + SESSION_MS;
        localStorage.setItem('authToken', token);
        localStorage.setItem('user', username);
        localStorage.setItem('expiresAt', String(expiresAt));
        localStorage.removeItem('attempts');
        localStorage.removeItem('blockedUntil');
        resolve({ success: true, user: username, token, expiresAt });
      } else {
        const att = parseInt(localStorage.getItem('attempts') || '0', 10) + 1;
        localStorage.setItem('attempts', String(att));
        if (att >= MAX_ATTEMPTS) {
          localStorage.setItem('blockedUntil', String(now() + BLOCK_MS));
          localStorage.removeItem('attempts');
          return reject({ success: false, message: "Cuenta bloqueada temporalmente" });
        }
        reject({ success: false, message: "Credenciales inválidas" });
      }
    }, 400);
  });
};

export const isAuthenticated = () => {
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('user');
  const expiresAt = parseInt(localStorage.getItem('expiresAt') || '0', 10);
  if (!token || !user) return false;
  if (now() > expiresAt) {
    logout();
    return false;
  }
  return true;
};

export const logout = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('expiresAt');
  return { success: true };
};

export default { login, isAuthenticated, logout };
