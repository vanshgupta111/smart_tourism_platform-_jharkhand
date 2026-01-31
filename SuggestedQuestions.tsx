import React from 'react';
import { SparklesIcon } from './icons.tsx';

interface SuggestedQuestionsProps {
  onQuestionSelect: (question: string) => void;
}

const questions = [
  "What are the most famous waterfalls?",
  "Create a trip plan.",
  "Tell me about tribal art and culture.",
  "Suggest adventure activities.",
  "Learn a local phrase",
];

const SuggestedQuestions: React.FC<SuggestedQuestionsProps> = ({ onQuestionSelect }) => {
  return (
    <div className="px-4 pb-3 pt-3 border-t border-gray-200 bg-white/60">
      <div className="flex items-center gap-2 mb-2">
        <SparklesIcon className="h-5 w-5 text-green-600" />
        <h3 className="text-sm font-semibold text-gray-600">Quick Questions</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {questions.map((q) => (
          <button
            key={q}
            onClick={() => onQuestionSelect(q)}
            className="px-3 py-1.5 text-sm bg-green-50 hover:bg-green-100 text-green-800 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestedQuestions;
