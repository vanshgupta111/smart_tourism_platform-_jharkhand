export type Role = 'user' | 'model';

export type Language = 'English' | 'Hindi' | 'Bengali' | 'Santali';

export interface Message {
  role: Role;
  text: string;
  itinerary?: Itinerary;
  dailyPhrase?: DailyPhrase;
  timestamp: number;
}

export interface ItineraryDay {
  day: number;
  title: string;
  activities: string[];
  accommodation: string;
  estimatedCost: string;
}

export interface Itinerary {
  title: string;
  duration: string;
  people: string;
  budget: string;
  interests: string;
  totalEstimatedCost: string;
  dailyPlan: ItineraryDay[];
}

export interface PhraseTranslation {
  language: string;
  translation: string;
  pronunciation: string;
}

export interface DailyPhrase {
  phrase_english: string;
  translations: PhraseTranslation[];
}
