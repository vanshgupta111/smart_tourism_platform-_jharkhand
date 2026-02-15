import React from 'react';
import type { Message } from '../types.ts';
import ItineraryCard from './ItineraryCard.tsx';
import PhraseCard from './PhraseCard.tsx';
import { UserIcon, BotIcon } from './icons.tsx';

interface MessageBubbleProps {
  message: Message;
}

const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/\*\*(.*?)\*\*/g);

  return (
    <p className="text-base whitespace-pre-wrap">
      {parts.map((part, index) =>
        index % 2 === 1 ? <strong key={index}>{part}</strong> : part
      )}
    </p>
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const bubbleClasses = isUser
    ? 'bg-green-600 text-white self-end rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl'
    : 'bg-gray-100 text-gray-800 self-start rounded-tl-2xl rounded-tr-2xl rounded-br-2xl';

  const containerClasses = isUser ? 'flex-row-reverse' : 'flex-row';

  return (
    <div className={`flex items-end gap-2 max-w-lg ${isUser ? 'self-end' : 'self-start'} ${containerClasses}`}>
      <div className="flex-shrink-0">
        {isUser ? <UserIcon className="h-8 w-8 text-white bg-green-500 rounded-full p-1" /> : <BotIcon className="h-8 w-8 text-white bg-gray-500 rounded-full p-1" />}
      </div>
      <div className={`p-4 shadow-md ${bubbleClasses}`}>
        {message.itinerary ? (
          <ItineraryCard itinerary={message.itinerary} />
        ) : message.dailyPhrase ? (
          <PhraseCard phrase={message.dailyPhrase} />
        ) : (
          <FormattedText text={message.text} />
        )}
      </div>
    </div>
  );
};

export default MessageBubble;