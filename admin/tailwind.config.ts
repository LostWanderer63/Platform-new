import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0c14",
        panel: "#11141f",
        panel2: "#171b29",
        line: "#252b3d",
        ink: "#e7eaf3",
        mut: "#8b93a9",
        accent: "#7c5cff",
        accent2: "#38d6ff",
        ok: "#2ed58e",
        warn: "#ffb83c",
        bad: "#ff565c",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
