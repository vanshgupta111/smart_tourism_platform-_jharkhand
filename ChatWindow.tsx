
import React, { useRef, useEffect } from 'react';
import type { Message } from '../types.ts';
import MessageBubble from './MessageBubble.tsx';
import TypingIndicator from './TypingIndicator.tsx';

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, isLoading }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  return (
    <div className="flex-1 p-4 overflow-y-auto min-h-0">
      <div className="flex flex-col gap-4"> {}
        {messages.map((msg) => (
          <MessageBubble key={msg.timestamp} message={msg} />
        ))}
        {isLoading && <TypingIndicator />}
        <div ref={endOfMessagesRef} />
      </div>
    </div>
  );
};

export default ChatWindow;
