// Single source of truth for the backend base URL.
//
// - Dev: VITE_API_URL is unset -> '/api', served through the Vite proxy to the
//   local Worker (localhost:8787).
// - Production (GitHub Pages + Cloudflare Worker on a different origin): set
//   VITE_API_URL at build time to the Worker URL, e.g.
//   "https://webllm-api.<subdomain>.workers.dev/api".
export const API_BASE = import.meta.env.VITE_API_URL || '/api';

/** Build a full API URL from a path (with or without a leading slash). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
