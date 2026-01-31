import React from 'react';
import type { Itinerary } from '../types.ts';
import { CalendarIcon, UsersIcon, WalletIcon, CompassIcon, PriceTagIcon, PinIcon, ActivityIcon } from './icons.tsx';

const ItineraryCard: React.FC<{ itinerary: Itinerary }> = ({ itinerary }) => {
  return (
    <div className="bg-green-50 rounded-lg p-4 max-w-md w-full text-gray-800">
      <h2 className="text-xl font-bold text-green-800 mb-3">{itinerary.title}</h2>
      
      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div className="flex items-center gap-2"><CalendarIcon className="h-4 w-4 text-green-600" /> <span>{itinerary.duration}</span></div>
        <div className="flex items-center gap-2"><UsersIcon className="h-4 w-4 text-green-600" /> <span>{itinerary.people}</span></div>
        <div className="flex items-center gap-2"><WalletIcon className="h-4 w-4 text-green-600" /> <span>{itinerary.budget}</span></div>
        <div className="flex items-center gap-2"><CompassIcon className="h-4 w-4 text-green-600" /> <span>{itinerary.interests}</span></div>
      </div>

      <div className="border-t border-green-200 pt-4">
        {itinerary.dailyPlan.map(day => (
          <div key={day.day} className="mb-4 last:mb-0">
            <h3 className="font-bold text-green-700">Day {day.day}: {day.title}</h3>
            <div className="pl-4 mt-1 border-l-2 border-green-200">
              <div className="flex items-start gap-2 mt-2">
                <ActivityIcon className="h-4 w-4 mt-1 text-green-600 flex-shrink-0" />
                <p className="text-sm"><strong className="font-semibold">Activities:</strong> {day.activities.join(', ')}</p>
              </div>
               <div className="flex items-start gap-2 mt-2">
                <PinIcon className="h-4 w-4 mt-1 text-green-600 flex-shrink-0" />
                <p className="text-sm"><strong className="font-semibold">Stay:</strong> {day.accommodation}</p>
              </div>
              <div className="flex items-start gap-2 mt-2">
                <PriceTagIcon className="h-4 w-4 mt-1 text-green-600 flex-shrink-0" />
                <p className="text-sm"><strong className="font-semibold">Cost:</strong> {day.estimatedCost}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-green-200 font-bold text-right text-green-800">
        Total Estimated Cost: {itinerary.totalEstimatedCost}
      </div>
    </div>
  );
};

export default ItineraryCard;
