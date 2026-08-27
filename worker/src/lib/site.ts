/**
 * Public base URL for this worker.
 *
 * Hardcoded to the live workers.dev host until the custom domain (tambalban.org)
 * is mapped in the Cloudflare dashboard. Reverting to the branded domain is a
 * one-line change here — update public/robots.txt too.
 */
export const SITE_URL = "https://tambalban-web.antsf.workers.dev";
