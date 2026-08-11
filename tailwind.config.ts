import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#FF5A36",
        secondary: "#1B1F3B",
        accent: "#17C3B2",
        offer: "#FF3D68",
        background: "#FAFAFA",
        textPrimary: "#1A1A1A",
        textSecondary: "#6B7280",
        border: "#E5E7EB",
        success: "#22C55E",
        warning: "#F59E0B",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
