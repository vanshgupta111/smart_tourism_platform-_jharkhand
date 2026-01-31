import React from 'react';
import type { DailyPhrase } from '../types.ts';
import { PhrasebookIcon } from './icons.tsx';

const PhraseCard: React.FC<{ phrase: DailyPhrase }> = ({ phrase }) => {
  return (
    <div className="bg-yellow-50 rounded-lg p-4 max-w-md w-full text-gray-800">
      <div className="flex items-center gap-3 mb-3">
        <PhrasebookIcon className="h-7 w-7 text-yellow-600 flex-shrink-0" />
        <h2 className="text-xl font-bold text-yellow-800">Phrase of the Day</h2>
      </div>
      
      <div className="mb-4 pl-1">
        <p className="text-sm text-gray-600 font-semibold">English</p>
        <p className="text-lg font-semibold text-yellow-900">{phrase.phrase_english}</p>
      </div>

      <div className="border-t border-yellow-200 pt-3 space-y-4 pl-1">
        {phrase.translations.map(t => (
          <div key={t.language}>
            <p className="font-bold text-yellow-800">{t.language}: <span className="font-medium text-gray-700">{t.translation}</span></p>
            <p className="text-sm text-gray-500 italic">Pronunciation: {t.pronunciation}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PhraseCard;
