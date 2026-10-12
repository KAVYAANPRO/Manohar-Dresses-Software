export const SESSION_COOKIE_NAME = 'gerp_sid';
/** tech.md §9.1: "an anti-forgery token ... together with an Origin check" - double-submit cookie, readable by the SPA so it can echo it back as a header. */
export const CSRF_COOKIE_NAME = 'gerp_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const MIN_PASSWORD_LENGTH = 10;
