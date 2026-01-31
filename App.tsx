import React, { useState, useEffect, useRef } from 'react';
import { Message, Itinerary, Language, DailyPhrase } from './types.ts';
import ChatWindow from './components/ChatWindow.tsx';
import ChatInput from './components/ChatInput.tsx';
import LanguageSelector from './components/LanguageSelector.tsx';
import SuggestedQuestions from './components/SuggestedQuestions.tsx';
import { getChatResponse, checkForItineraryIntent, generateItinerary, getBackgroundImageTopic, getPhraseOfTheDay } from './services/geminiService.ts';
import { SaveIcon, LoadIcon } from './components/icons.tsx';


const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [language, setLanguage] = useState<Language>('English');
  const [itineraryData, setItineraryData] = useState<Partial<Itinerary>>({});
  const [isCollectingInfo, setIsCollectingInfo] = useState(false);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>("https://source.unsplash.com/1920x1080/?jharkhand,waterfall,misty,forest");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages([
      {
        role: 'model',
        text: 'Johar! I am Jharna, your personal guide to Jharkhand. How can I help you explore our beautiful land today? You can ask me questions or ask me to create a travel plan for you.',
        timestamp: Date.now()
      }
    ]);
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = { role: 'user', text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
        if (text === "Learn a local phrase") {
            const phraseData = await getPhraseOfTheDay(language);
            const phraseMessage: Message = { 
                role: 'model', 
                text: '', 
                dailyPhrase: phraseData, 
                timestamp: Date.now() 
            };
            setMessages(prev => [...prev, phraseMessage]);
            return;
        }

        const topic = await getBackgroundImageTopic(text);
        setBackgroundImageUrl(`https://source.unsplash.com/1920x1080/?${topic},jharkhand,vibrant`);

        if (isCollectingInfo) {
            const updatedData = { ...itineraryData, ...parseItineraryInfo(text) };
            setItineraryData(updatedData);

            if (updatedData.budget && updatedData.people && updatedData.duration && updatedData.interests) {
                 const planMessage: Message = { role: 'model', text: 'Great! I have all the details. Generating a personalized itinerary for you now...', timestamp: Date.now() };
                 setMessages(prev => [...prev, planMessage]);
                 const itinerary = await generateItinerary(updatedData as Itinerary, language);
                 const itineraryMessage: Message = { role: 'model', text: 'Here is your personalized itinerary:', itinerary, timestamp: Date.now() };
                 setMessages(prev => [...prev, itineraryMessage]);
                 setIsCollectingInfo(false);
                 setItineraryData({});
            } else {
                 const nextQuestion = getNextQuestion(updatedData);
                 const questionMessage: Message = { role: 'model', text: nextQuestion, timestamp: Date.now() };
                 setMessages(prev => [...prev, questionMessage]);
            }
        } else {
            const wantsItinerary = await checkForItineraryIntent(text);
            if (wantsItinerary) {
                setIsCollectingInfo(true);
                const firstQuestion = getNextQuestion({});
                const questionMessage: Message = { role: 'model', text: firstQuestion, timestamp: Date.now() };
                setMessages(prev => [...prev, questionMessage]);
            } else {
                const botResponse = await getChatResponse(text, messages, language);
                const modelMessage: Message = { role: 'model', text: botResponse, timestamp: Date.now() };
                setMessages(prev => [...prev, modelMessage]);
            }
        }

    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage: Message = {
        role: 'model',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const parseItineraryInfo = (text: string): Partial<Itinerary> => {
    const data: Partial<Itinerary> = {};
    if (!itineraryData.duration) data.duration = text;
    else if (!itineraryData.people) data.people = text;
    else if (!itineraryData.budget) data.budget = text;
    else if (!itineraryData.interests) data.interests = text;
    return data;
  };
  
  const getNextQuestion = (data: Partial<Itinerary>): string => {
    if (!data.duration) return "How many days are you planning for your trip?";
    if (!data.people) return "How many people will be travelling?";
    if (!data.budget) return "What is your approximate budget per person (e.g., 'budget-friendly', 'mid-range', 'luxury')?";
    if (!data.interests) return "What are your interests? (e.g., 'wildlife', 'waterfalls', 'temples', 'tribal culture', 'adventure')";
    return "I have all I need. Generating your itinerary!";
  };

  const handleSaveChat = () => {
    if (messages.length === 0) {
      alert("There's no conversation to save yet.");
      return;
    }
    const dataStr = JSON.stringify(messages, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.download = `jharkhand-chat-${new Date().toISOString().split('T')[0]}.json`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadChat = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') throw new Error("File content is not readable text.");
        const loadedMessages = JSON.parse(text);
        
        if (Array.isArray(loadedMessages) && loadedMessages.every(m => 'role' in m && 'text' in m && 'timestamp' in m)) {
          setMessages(loadedMessages);
        } else {
          throw new Error("Invalid chat history file format.");
        }
      } catch (error) {
        console.error("Failed to load and parse chat history:", error);
        alert("Could not load chat history. The file may be corrupted or in an incorrect format.");
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Allow loading the same file again
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-gray-50 font-sans text-gray-800 min-h-screen w-screen flex flex-col overflow-y-auto">
      <div 
        className="absolute top-0 left-0 w-full h-full bg-cover bg-center opacity-20 transition-all duration-1000 ease-in-out" 
        style={{backgroundImage: `url('${backgroundImageUrl}')`}}
      ></div>
       <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-gray-50 via-gray-50/50 to-transparent"></div>
      
      <header className="relative w-full p-4 bg-white/80 backdrop-blur-sm border-b border-gray-200 flex items-center justify-between z-10">
        <h1 className="text-2xl md:text-3xl font-bold text-green-800">Jharna</h1>
        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={handleSaveChat} title="Save Chat" className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
            <SaveIcon className="h-5 w-5 text-gray-600" />
            <span className="hidden md:inline">Save</span>
          </button>
          <button onClick={triggerFileInput} title="Load Chat" className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors">
            <LoadIcon className="h-5 w-5 text-gray-600" />
             <span className="hidden md:inline">Load</span>
          </button>
          <LanguageSelector selectedLanguage={language} onSelectLanguage={setLanguage} />
        </div>
      </header>
      
      <main className="relative flex-1 flex flex-col items-center justify-center p-2 md:p-4">
          <div className="w-full max-w-3xl h-full flex flex-col bg-white/70 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
              <ChatWindow messages={messages} isLoading={isLoading} />
              {!isLoading && <SuggestedQuestions onQuestionSelect={handleSendMessage} />}
              <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
          </div>
      </main>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleLoadChat} 
        accept="application/json" 
        className="hidden" 
      />
    </div>
  );
};

export default App;