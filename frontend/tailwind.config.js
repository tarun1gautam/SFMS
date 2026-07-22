/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // High-Vibrancy Primary Brand Colors (Vibrant Sapphire / Deep Slate)
        brand: {
          50: '#f0f3ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1', // Main Primary Accent (Indigo)
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },

        // Crisp Light-Mode Tokens (Rich Contrast & Separation)
        canvas:        '#EAEFF8', // Deeper page backdrop to make white elements explode off the screen
        surface:       '#FFFFFF', // Cards, drawers, and modal surfaces
        'surface-alt': '#F1F5F9', // Toolbars, active table header rows, subtle highlights
        field:         '#E2E8F0', // Input fields, dropzones, selectable elements
        line:          '#CBD5E1', // Sharp, legible border lines
        'line-strong': '#94A3B8', // High-visibility dividers and focus borders
        ink:           '#020617', // Pitch-dark primary text for maximum readability
        subtle:        '#334155', // Secondary copy, high-contrast labels
        faint:         '#64748B', // Muted text, timestamps, secondary icons

        // Deep Dark-Mode Tokens (High-Density Contrast)
        'dark-canvas':  '#090D16', // Ultra-deep dark canvas
        'dark-surface': '#111827', // High-contrast cards and panels
        'dark-field':   '#1F2937', // Input background for dark mode
        'dark-line':    '#374151', // Crisp borders on dark elements

        // System Status Tokens (Pre-balanced for contrast & accessibility)
        success: {
          light: '#dcfce7',
          DEFAULT: '#10b981',
          dark: '#064e3b',
        },
        warning: {
          light: '#fef3c7',
          DEFAULT: '#f59e0b',
          dark: '#78350f',
        },
        danger: {
          light: '#fee2e2',
          DEFAULT: '#ef4444',
          dark: '#7f1d1d',
        },
        info: {
          light: '#e0f2fe',
          DEFAULT: '#0ea5e9',
          dark: '#0c4a6e',
        }
      },

      // Subtle Elevation & Glows for visual crispness
      boxShadow: {
        'card-soft': '0 4px 20px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)',
        'glow-sm': '0 0 12px -2px rgba(99, 102, 241, 0.25)',
        'glow-brand': '0 0 20px -3px rgba(99, 102, 241, 0.4)',
      },
    }
  },
  plugins: []
}