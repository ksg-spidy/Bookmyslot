import type { Config } from "tailwindcss";

export default {
  content: ["./src/pages/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}", "./src/app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#0d1117",
        card: "#161b22",
        edge: { DEFAULT: "#30363d", soft: "#21262d" },
        muted: "#8b949e",
        ink: "#e6edf3",
        accent: { DEFAULT: "#238636", hover: "#2ea043" },
        link: "#58a6ff",
        success: { DEFAULT: "#3fb950", soft: "#0c2218" },
        warn: { DEFAULT: "#f0c93a", soft: "#3d2a00" },
        danger: "#f85149",
      },
    },
  },
  plugins: [],
} satisfies Config;
