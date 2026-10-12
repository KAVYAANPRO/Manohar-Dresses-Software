import axios from 'axios';

// Backend auth is httpOnly session-cookie + double-submit CSRF cookie (see
// backend/src/identity/auth.controller.ts), not a bearer token — the browser
// sends the session cookie automatically, we just need withCredentials + the
// CSRF header on mutating requests.
const CSRF_COOKIE_NAME = 'gerp_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith(`${name}=`))
    ?.split('=')[1];
}

export const apiClient = axios.create({
  // Same-origin by default: the Vite dev/preview server proxies /api to the backend (vite.config.ts).
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use(config => {
  const method = config.method?.toLowerCase();
  if (method && method !== 'get' && method !== 'head') {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) config.headers[CSRF_HEADER_NAME] = csrfToken;
  }
  return config;
});

const SESSION_ERROR_KEY = 'erp_session_error';

apiClient.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401 && window.location.pathname !== '/login') {
      // The redirect below wipes the page (and any on-screen error) instantly, so the real
      // reason from the backend — an RFC9457 problem+json body ({ code, detail }) — would
      // otherwise never be seen. Stash it so the login page can show it after landing.
      const detail = err.response?.data?.detail ?? err.response?.data?.message;
      const code = err.response?.data?.code;
      console.error('[auth] 401 on', err.config?.method?.toUpperCase(), err.config?.url, { code, detail });
      try {
        sessionStorage.setItem(SESSION_ERROR_KEY, JSON.stringify({
          detail: detail ?? 'Your session has ended. Please sign in again.',
          code,
          path: err.config?.url,
        }));
      } catch {
        // sessionStorage unavailable (private mode, etc.) — redirect still proceeds below.
      }
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export function consumeSessionError(): { detail: string; code?: string; path?: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_ERROR_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SESSION_ERROR_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
