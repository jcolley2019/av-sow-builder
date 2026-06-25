import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        panel: "hsl(var(--panel))",
        raised: "hsl(var(--raised))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Paper surface — the SOW preview pane (mimics the .docx).
        paper: {
          DEFAULT: "hsl(var(--paper))",
          ink: "hsl(var(--paper-ink))",
          muted: "hsl(var(--paper-muted))",
          hairline: "hsl(var(--paper-hairline))",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        paper: ["var(--font-paper)"],
      },
      // Deliberate, compact instrument type scale.
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }], // 12 — captions, table heads, eyebrows
        sm: ["0.8125rem", { lineHeight: "1.15rem" }], // 13 — secondary text, dense cells
        base: ["0.875rem", { lineHeight: "1.35rem" }], // 14 — body / UI default
        md: ["1rem", { lineHeight: "1.5rem" }], // 16 — emphasis
        lg: ["1.125rem", { lineHeight: "1.6rem" }], // 18 — panel / section titles
        xl: ["1.375rem", { lineHeight: "1.75rem" }], // 22 — pane titles
        "2xl": ["1.75rem", { lineHeight: "2.1rem" }], // 28 — paper document title
        "3xl": ["2.25rem", { lineHeight: "2.6rem" }],
      },
      borderRadius: {
        lg: "var(--radius)", // 8px
        md: "calc(var(--radius) - 2px)", // 6px
        sm: "calc(var(--radius) - 4px)", // 4px
      },
      boxShadow: {
        // A single soft lift for the paper sheet — the one allowed exception to
        // the "hairlines over shadows" rule (it's a page sitting on a desk).
        page: "0 1px 2px rgba(0,0,0,0.30), 0 18px 40px -16px rgba(0,0,0,0.55)",
        panel: "0 1px 0 0 hsl(var(--border) / 0.6)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.32s ease-out both",
      },
    },
  },
  plugins: [animate],
};
