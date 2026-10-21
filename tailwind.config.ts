import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"] },
      colors: {
        ground: "#F5F6F2",
        ink: "#17252B",
        muted: "#55636A",
        line: "#DDE1DB",
        line2: "#C9CFC9",
        primary: { DEFAULT: "#1D5C70", dark: "#123E4C", soft: "#E3EEF2" },
        amber: { soft: "#FCEBD0", ink: "#7A4A08", strong: "#B26B0C", line: "#E8C48C" },
        ok: { soft: "#DDEFE3", ink: "#1E5A36" },
        full: { soft: "#E6E8E4", ink: "#4B575C" },
        open: { soft: "#ECEEEA", ink: "#2F3E44" },
        danger: { DEFAULT: "#8A2A1B", soft: "#F6E0DC" },
      },
    },
  },
  plugins: [],
} satisfies Config;
