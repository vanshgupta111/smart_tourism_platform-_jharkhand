import React from 'react';
import { BotIcon } from './icons.tsx';

const TypingIndicator: React.FC = () => {
  return (
    <div className="flex items-end gap-2 self-start">
        <BotIcon className="h-8 w-8 text-white bg-gray-500 rounded-full p-1" />
        <div className="bg-gray-100 p-4 rounded-tl-2xl rounded-tr-2xl rounded-br-2xl shadow-md">
            <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce delay-0"></span>
                <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce delay-150"></span>
                <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce delay-300"></span>
            </div>
        </div>
    </div>
  );
};

export default TypingIndicator;
