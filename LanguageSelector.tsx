
import React, { useState } from 'react';
import type { Language } from '../types.ts';
import { GlobeIcon } from './icons.tsx';

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onSelectLanguage: (language: Language) => void;
}

const LANGUAGES: Language[] = ['English', 'Hindi', 'Bengali', 'Santali'];

const LanguageSelector: React.FC<LanguageSelectorProps> = ({ selectedLanguage, onSelectLanguage }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (lang: Language) => {
    onSelectLanguage(lang);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
      >
        <GlobeIcon className="h-5 w-5 text-gray-500" />
        {selectedLanguage}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
          <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
            {LANGUAGES.map((lang) => (
              <a
                key={lang}
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleSelect(lang);
                }}
                className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                role="menuitem"
              >
                {lang}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
