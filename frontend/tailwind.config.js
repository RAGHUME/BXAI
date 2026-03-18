/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#f5f8ff',
        primary: '#0b1f52',
        accent1: '#14b8a6',
        accent2: '#a855f7',
        text: '#1e293b',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 18px 45px -24px rgba(11, 31, 82, 0.45)',
        glow: '0 0 120px rgba(20, 184, 166, 0.25)',
      },
      backgroundImage: {
        'hero-glow': 'radial-gradient(circle at top, rgba(20, 184, 166, 0.25), transparent 55%), radial-gradient(circle at 20% 80%, rgba(168, 85, 247, 0.25), transparent 60%)',
      },
    },
  },
  plugins: [],
};
