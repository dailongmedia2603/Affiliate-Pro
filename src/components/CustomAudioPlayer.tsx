import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CustomAudioPlayerProps {
  src: string;
}

const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Generate a static waveform-like pattern once
  const waveformBars = useRef(Array.from({ length: 50 }, () => Math.random() * 0.8 + 0.2)).current;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
      setCurrentTime(audio.currentTime);
    };

    const setAudioTime = () => setCurrentTime(audio.currentTime);

    const handleEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleEnd);

    // If audio is already loaded
    if (audio.readyState >= 2) {
        setAudioData();
    }

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleEnd);
    };
  }, [src]);

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(error => console.error("Error playing audio:", error));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    if (!isFinite(time) || time <= 0) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 p-2 bg-white border border-gray-200 rounded-full w-full shadow-sm">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlayPause}
        className="bg-orange-500 hover:bg-orange-600 text-white rounded-full w-8 h-8 flex-shrink-0"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5 fill-white" />}
      </Button>
      <div className="flex items-center gap-2 w-full overflow-hidden">
        <div className="flex items-center h-8 w-full relative">
          {waveformBars.map((height, index) => {
            const barIsActive = (index / waveformBars.length) * 100 < progress;
            return (
              <div
                key={index}
                className={cn(
                  'w-0.5 rounded-full transition-colors duration-75',
                  barIsActive ? 'bg-orange-500' : 'bg-gray-300'
                )}
                style={{ height: `${height * 100}%`, marginRight: '2px' }}
              />
            );
          })}
        </div>
      </div>
      <span className="text-sm text-gray-600 font-mono flex-shrink-0 pr-2">
        {formatTime(duration)}
      </span>
    </div>
  );
};

export default CustomAudioPlayer;