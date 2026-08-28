/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.ts"],
  theme: {
    extend: {
      // Admin-only typography tokens (/admin/users). Deliberately NOT the `sans`/`mono`
      // keys — Preflight applies `theme('fontFamily.sans')` to <html> globally, so
      // overriding those would change every page's default font, not just this one.
      fontFamily: {
        disp: ['"Barlow Condensed"', "Arial", "sans-serif"],
        barlow: ['"Barlow"', "Arial", "sans-serif"],
        plexmono: ['"IBM Plex Mono"', '"Courier New"', "monospace"],
      },
    },
  },
  plugins: [],
};
