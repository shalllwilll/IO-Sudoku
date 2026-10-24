/** @type {import('tailwindcss').Config} */
// Palette: five greys for all chrome. Colour appears only for data states.
// The data colours are provisional until checked against build.md section 3.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        graphite: "#141619",
        carbon: "#1C1F23",
        gunmetal: "#262A30",
        steel: "#41464E",
        "soft-white": "#D7DADF",
        data: {
          input: "#5BC0EB",
          output: "#F4A259",
          spare: "#9AA3AE",
          wiredSpare: "#6BD9A8",
          reserved: "#B794F4",
          tq: "#FF6B6B",
        },
      },
      fontFamily: {
        ui: ["var(--font-ui)"],
      },
      borderRadius: {
        panel: "1.25rem",
      },
    },
  },
  plugins: [],
};
