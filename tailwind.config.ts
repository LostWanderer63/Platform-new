import type { Config } from "tailwindcss";

/**
 * Token-driven Tailwind theme.
 * Every color resolves to a CSS variable (RGB channel triplet) so opacity
 * modifiers work (bg-accent/20) and accent themes swap via [data-theme].
 */
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    screens: {
      xs: "375px", // mobile (360/375/390/414/430)
      sm: "640px",
      md: "834px", // tablet portrait
      lg: "1024px", // tablet landscape
      xl: "1280px", // laptop
      "2xl": "1440px", // desktop
      "3xl": "1920px", // large desktop
    },
    container: {
      center: true,
      padding: { DEFAULT: "1.25rem", lg: "2rem" },
      screens: { "3xl": "1600px" },
    },
    extend: {
      zIndex: {
        base: "0",
        raised: "10",
        sticky: "20",
        drawer: "30",
        nav: "40",
        modal: "50",
        toast: "60",
      },
      colors: {
        // surfaces / elevation
        base: rgb("--c-bg-base"),
        elevated: rgb("--c-bg-elevated"),
        surface: rgb("--c-surface"),
        card: rgb("--c-card"),
        glass: rgb("--c-glass"),
        line: rgb("--c-border"),
        divider: rgb("--c-divider"),
        // text
        ink: rgb("--c-text"),
        "ink-soft": rgb("--c-text-soft"),
        "ink-mut": rgb("--c-text-muted"),
        // brand accents (theme-swappable)
        accent: rgb("--c-accent"),
        "accent-2": rgb("--c-accent-2"),
        glow: rgb("--c-glow"),
        // semantic
        success: rgb("--c-success"),
        warning: rgb("--c-warning"),
        danger: rgb("--c-danger"),
        info: rgb("--c-info"),
        // metals
        gold: rgb("--c-gold"),
        silver: rgb("--c-silver"),
        bronze: rgb("--c-bronze"),
      },
      fontFamily: {
        display: ['"Sora"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        stat: ['"Space Grotesk"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        xs: "6px",
        sm: "10px",
        md: "14px",
        lg: "20px",
        xl: "28px",
        "2xl": "36px",
      },
      boxShadow: {
        e1: "0 1px 2px rgb(0 0 0 / 0.4)",
        e2: "0 8px 24px -8px rgb(0 0 0 / 0.5)",
        e3: "0 20px 48px -12px rgb(0 0 0 / 0.6)",
        glow: "0 4px 12px rgb(0 0 0 / 0.35)",
        "glow-lg": "0 12px 32px rgb(0 0 0 / 0.5)",
      },
      backdropBlur: { glass: "18px" },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
        spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        drift: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "50%": { transform: "translate(4%,-3%) scale(1.08)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "slide-in": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        float: "float 6s ease-in-out infinite",
        drift: "drift 16s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        marquee: "marquee 32s linear infinite",
        "slide-in": "slide-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
