export function clearSession() {
  ['userInfo', 'user', 'access_token', 'refresh_token'].forEach(key => localStorage.removeItem(key));
  window.dispatchEvent(new Event('auth-change'));
}

export function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem('userInfo') || 'null');
    if (typeof session?.access_token !== 'string' || !session.refresh_token) return null;
    const part = session.access_token.split('.')[1];
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload.user_id || !Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) return null;
    return session;
  } catch { return null; }
}
