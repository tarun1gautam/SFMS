import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`relative flex items-center w-14 h-8 rounded-full transition-colors duration-300 cursor-pointer
                  bg-gray-200 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 ${className}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 flex items-center justify-center w-6 h-6 rounded-full
                    bg-white dark:bg-gray-950 shadow-md transition-transform duration-300
                    ${isDark ? 'translate-x-6' : 'translate-x-0'}`}
      >
        {isDark ? (
          <Moon size={13} className="text-blue-400" />
        ) : (
          <Sun size={13} className="text-amber-500" />
        )}
      </span>
    </button>
  );
}
