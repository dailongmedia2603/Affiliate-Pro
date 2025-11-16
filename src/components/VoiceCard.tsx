import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Play, UserCheck } from 'lucide-react';

const VoiceCard = ({ voice, isSelected, onSelect }) => {
  const handlePlay = (e) => {
    e.stopPropagation();
    const audio = new Audio(voice.sample_audio);
    audio.play();
  };

  return (
    <div
      onClick={onSelect}
      className={`relative group p-3 border-2 rounded-lg cursor-pointer transition-all duration-200 ${isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-orange-400 hover:shadow-md'}`}
    >
      {voice.isCloned && <Badge className="absolute top-2 left-2 bg-green-500 text-white"><UserCheck className="w-3 h-3 mr-1" />Cloned</Badge>}
      <div className="flex flex-col items-center space-y-2">
        <div className="relative">
          <img src={voice.cover_url || '/placeholder.svg'} alt={voice.voice_name} className="w-20 h-20 rounded-full object-cover bg-gray-200" />
          <button onClick={handlePlay} className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-50 rounded-full transition-opacity">
            <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        </div>
        <p className="font-semibold text-center text-sm leading-tight h-8">{voice.voice_name}</p>
        <div className="flex flex-wrap gap-1 justify-center h-10 overflow-hidden">
          {voice.tag_list?.slice(0, 2).map(tag => <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>)}
        </div>
      </div>
    </div>
  );
};

export default VoiceCard;