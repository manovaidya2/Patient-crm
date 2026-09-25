/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Manrope"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif'],
        display: ['"Lora"', 'serif'],
        serif: ['"Lora"', 'serif'],
      },
      colors: {
        // Sidebar — dark teal with shaded button states
        teal: {
          950: '#062B29',
          900: '#0A3733',
          800: '#0F4642',
          700: '#175C56',
          600: '#20766E',
          500: '#2C9389',
          400: '#4EB3A8',
        },
        // App background — warm cream
        cream: {
          DEFAULT: '#F6F0E3',
          100: '#FBF7ED',
          200: '#F6F0E3',
          300: '#EFE3CF',
        },
        // Card surfaces — off-white shades sitting on the cream background
        offwhite: {
          100: '#FBF7ED',
          200: '#EFE3CF',
          300: '#E8D5B5',
        },
        cardline: {
          DEFAULT: '#DED2BD',
          soft: '#DED2BD',
        },
        sage: {
          DEFAULT: '#657B6C',
          muted: '#A9B5A3',
        },
        charcoal: {
          DEFAULT: '#273238',
        },
      },
      boxShadow: {
        card: '0 1px 1px rgba(39, 50, 56, 0.03)',
      },
      borderRadius: {
        xl2: '1.1rem',
      },
    },
  },
  plugins: [],
};
