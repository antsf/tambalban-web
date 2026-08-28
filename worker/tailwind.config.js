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
      // Color palette ported from the Android app (../../tambalban/app/src/main/res/values/
      // colors.xml + themes.xml) — 2026-08-28, so both front doors share one brand identity.
      // Named after the app's own token names, not generic Tailwind-style scale numbers, so
      // a future diff against colors.xml is a straight name-to-name comparison.
      // A few tokens have no Android equivalent (the app has no hover states — touch UI — and
      // no light/dark "container" pairing for its error or rating-star colors); those are
      // marked "derived" below with the reasoning, not invented arbitrarily.
      colors: {
        brand: {
          primary: "#8A2BE2",
          primaryHover: "#7623C9", // derived: primary darkened ~12%, app has no hover state (touch UI)
          onPrimary: "#FFFFFF",
          primaryContainer: "#DDB8F5",
          onPrimaryContainer: "#1A0A2E",
          secondary: "#B47AE0",
          surface: "#F8F9FA",
          surfaceContainerLow: "#F3F4F5",
          onSurface: "#191C1D",
          onSurfaceVariant: "#454748",
          textSecondary: "#757575",
          divider: "#E0E0E0",
          success: "#4CAF50",
          tertiaryContainer: "#D1E8D1", // app's own "Functional / tertiary" comment — used here as the verified/success badge pairing
          onTertiaryContainer: "#1A3E1A",
          error: "#B3261E",
          onError: "#FFFFFF",
          errorContainer: "#F9DEDC", // derived: standard Material3 light tint paired with this error, app doesn't declare one
          onErrorContainer: "#410E0B", // derived, paired with errorContainer above
          ratingStar: "#FFB300",
          ratingStarContainer: "#FFF3D6", // derived light tint of rating_star, used for the unverified/pending badge
          onRatingStarContainer: "#7A5200", // derived dark tint, contrast text on ratingStarContainer
        },
      },
    },
  },
  plugins: [],
};
