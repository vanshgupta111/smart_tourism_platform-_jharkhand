// geminiService.ts (Final Fixed Code Block)
import { GoogleGenAI, Type } from "@google/genai";
import type { Message, Language, Itinerary, DailyPhrase } from '../types.ts';

const apiKey = import.meta.env.VITE_API_KEY;

if (!apiKey) {
  // CRITICAL: Throwing the error here ensures we never try to instantiate GoogleGenAI with an undefined key.
  throw new Error("VITE_API_KEY is not set in the .env.local file.");
}

// Instantiate GoogleGenAI ONLY when the apiKey is guaranteed to be a string.
// This structure satisfies the TypeScript compiler.
const ai = new GoogleGenAI({ apiKey });
const model = "gemini-2.5-flash";

// geminiService.ts

// ... (keep the apiKey and ai initialization block at the top)

export const getChatResponse = async (
    currentMessage: string,
    history: Message[],
    language: Language
  ): Promise<string> => {
    // Correct contents mapping and current message push
    const contents = history.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user', 
      parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: currentMessage }] });
  
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: `You are 'Jharna', a friendly and knowledgeable multilingual chatbot. Your purpose is to promote eco-cultural tourism in Jharkhand. You MUST respond in ${language}. To emphasize key places, names, or terms, enclose them in double asterisks, like **this**. Never mention that you are an AI model. Your knowledge is strictly limited to Jharkhand tourism. If asked about anything else, politely decline and steer the conversation back to Jharkhand.`,
      },
    });
  
    // CRITICAL FIX for Line 47
    if (!response.text) {
      throw new Error("Gemini did not return a chat response text.");
    }
    return response.text;
  };
  
  export const checkForItineraryIntent = async (text: string): Promise<boolean> => {
      const prompt = `Does the following user query express an intent to create a travel plan or itinerary? Respond with only "yes" or "no".\n\nQuery: "${text}"`;
      
      const response = await ai.models.generateContent({
          model,
          contents: prompt,
      });
  
      // CRITICAL FIX for Line 60
      if (!response.text) {
          return false; 
      }
  
      const resultText = response.text.toLowerCase().trim();
      return resultText.includes('yes');
  }
  
  export const generateItinerary = async (data: Itinerary, language: Language): Promise<Itinerary> => {
      const prompt = `Create a detailed travel itinerary for Jharkhand based on these details:
      - Language for response: ${language}
      - Duration: ${data.duration}
      - Number of People: ${data.people}
      - Budget: ${data.budget}
      - Interests: ${data.interests}
  
      Provide a catchy title for the trip. Generate a day-by-day plan including activities, suggested accommodation, and estimated cost per day. Also provide a total estimated cost for the trip. The response must be in JSON format.`;
  
      const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
              responseMimeType: "application/json",
              responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                      title: { type: Type.STRING, description: 'A catchy title for the itinerary.' },
                      duration: { type: Type.STRING },
                      people: { type: Type.STRING },
                      budget: { type: Type.STRING },
                      interests: { type: Type.STRING },
                      totalEstimatedCost: { type: Type.STRING, description: 'Total estimated cost for the entire trip.' },
                      dailyPlan: {
                          type: Type.ARRAY,
                          items: {
                              type: Type.OBJECT,
                              properties: {
                                  day: { type: Type.INTEGER },
                                  title: { type: Type.STRING, description: 'A title for the day\'s plan.' },
                                  activities: { 
                                      type: Type.ARRAY, 
                                      items: { type: Type.STRING },
                                      description: 'List of activities for the day.'
                                  },
                                  accommodation: { type: Type.STRING, description: 'Suggestion for accommodation.' },
                                  estimatedCost: { type: Type.STRING, description: 'Estimated cost for the day.' }
                              },
                              required: ['day', 'title', 'activities', 'accommodation', 'estimatedCost']
                          }
                      }
                  },
                  required: ['title', 'duration', 'people', 'budget', 'interests', 'totalEstimatedCost', 'dailyPlan']
              }
          }
      });
  
      // CRITICAL FIX for Line 112
      if (!response.text) {
        throw new Error("Could not generate a valid itinerary plan. API returned no text.");
      }
      
      const jsonString = response.text.trim();
      try {
          return JSON.parse(jsonString) as Itinerary;
      } catch(e) {
          console.error("Failed to parse itinerary JSON:", e);
          console.error("Received string:", jsonString);
          throw new Error("Could not generate a valid itinerary plan due to invalid JSON format.");
      }
  };
  
  export const getBackgroundImageTopic = async (text: string): Promise<string> => {
      const prompt = `Analyze the following text for its main topic related to Jharkhand tourism. Respond with 2-3 comma-separated, URL-friendly keywords in lowercase for finding a vibrant, joyful background image. 
      For example, for "Tell me about Hundru Falls", respond with "waterfall,nature,flowing-water". 
      For "I want to see tigers", respond with "wildlife,tiger,forest". 
      For general greetings, respond with "jharkhand,nature,landscape".
    
      Text: "${text}"`;
    
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
    
      // CRITICAL FIX for Line 136
      if (!response.text) {
        // Default topic if API fails to respond
        return "jharkhand,nature,landscape"; 
      }
  
      // Sanitize the response to be clean keywords for the URL
      return response.text.trim().toLowerCase().replace(/\s+/g, ',').replace(/[^a-z,]/g, '');
  };
  
  export const getPhraseOfTheDay = async (language: Language): Promise<DailyPhrase> => {
      const prompt = `Generate a single, common, and useful phrase for a tourist in Jharkhand. 
      Provide the phrase in English.
      Also provide translations for the phrase in Santali, Hindi, and Bengali.
      For each translation, include a simple, easy-to-read phonetic pronunciation guide.
      The response must be in JSON format. The user's primary language is ${language}.`;
  
      const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
              responseMimeType: "application/json",
              responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                      phrase_english: { type: Type.STRING, description: 'The phrase in English.' },
                      translations: {
                          type: Type.ARRAY,
                          description: 'List of translations and pronunciations.',
                          items: {
                              type: Type.OBJECT,
                              properties: {
                                  language: { type: Type.STRING, description: 'The local language (e.g., Santali).' },
                                  translation: { type: Type.STRING, description: 'The translated phrase.' },
                                  pronunciation: { type: Type.STRING, description: 'A simple phonetic guide.' }
                              },
                              required: ['language', 'translation', 'pronunciation']
                          }
                      }
                  },
                  required: ['phrase_english', 'translations']
              }
          }
      });
      
      // CRITICAL FIX for Line 174
      if (!response.text) {
        throw new Error("Could not generate a valid phrase. API returned no text.");
      }
      
      const jsonString = response.text.trim();
      try {
          return JSON.parse(jsonString) as DailyPhrase;
      } catch(e) {
          console.error("Failed to parse daily phrase JSON:", e, jsonString);
          throw new Error("Could not generate a valid phrase due to invalid JSON format.");
      }
  };