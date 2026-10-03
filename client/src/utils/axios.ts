import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Paths whose 401 must NOT trigger a hard redirect:
//  - /auth/me        -> app bootstrap with a stale/expired token. Clearing the token is
//                      enough; the AuthContext flips user to null and the router
//                      bounces to /login silently. A window.location reload here was
//                      the "stale token flash of a full page reload" bug.
//  - /auth/login     -> wrong password legitimately 401s. Hard-redirecting to /login
//                      reloaded the page and swallowed the "用户名或密码错误" message.
//  - /auth/register  -> registration failures never bounce to /login.
export const NO_REDIRECT_401_PATHS = ['/auth/me', '/auth/login', '/auth/register'];

export type Auth401Action = 'clear-only' | 'redirect';

/**
 * Decide what to do on a 401. Pure/testable: bootstrap and auth-form 401s only clear
 * the token (the React router handles navigation); mid-session expiry on protected
 * APIs bounces to /login, unless we are already on /login.
 */
export function decideAuth401Action(url: string, pathname: string): Auth401Action {
  const isAuthPath = NO_REDIRECT_401_PATHS.some((p) => url.includes(p));
  if (isAuthPath) return 'clear-only';
  if (pathname === '/login') return 'clear-only';
  return 'redirect';
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const url: string = error.config?.url ?? '';
    if (status === 401) {
      localStorage.removeItem('token');
      const pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/';
      if (decideAuth401Action(url, pathname) === 'redirect') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;
