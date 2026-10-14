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
      // Existing Android identity stays in the unchanged logo/icon assets. Web
      // actions use the approved emerald accent; semantic action utilities must
      // match Basecoat's CSS variables rather than retain a second purple UI theme.
      // A few tokens have no Android equivalent (the app has no hover states — touch UI — and
      // no light/dark "container" pairing for its error or rating-star colors); those are
      // marked "derived" below with the reasoning, not invented arbitrarily.
      colors: {
        brand: {
          primary: "#047857",
          primaryHover: "#065F46",
          onPrimary: "#FFFFFF",
          primaryContainer: "#D1FAE5",
          onPrimaryContainer: "#064E3B",
          secondary: "#55565A",
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
