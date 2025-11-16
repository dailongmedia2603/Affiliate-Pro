import React from 'react';
import { Star, Settings, Trash2 } from 'lucide-react';

const typeStyles = {
  Facebook: 'bg-blue-100 text-blue-600',
  Instagram: 'bg-pink-100 text-pink-600',
  Zalo: 'bg-cyan-100 text-cyan-600',
  Website: 'bg-gray-100 text-gray-600',
};

const ChannelCard = ({ channel }) => {
  const typeStyle = typeStyles[channel.type] || typeStyles.Website;

  return (
    <div className="relative bg-white rounded-lg border border-gray-200 p-4 flex flex-col items-center text-center transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <div className="absolute top-3 left-3 bg-white px-2 py-1 rounded-full border border-gray-200 flex items-center gap-1 text-sm shadow-sm">
        <Star className="w-4 h-4 text-orange-400 fill-orange-400" />
        <span className="font-semibold text-gray-700">{channel.rating}</span>
      </div>
      <img
        src={channel.avatar}
        alt={channel.name}
        className="w-24 h-24 rounded-full object-cover mt-8"
      />
      <h3 className="mt-4 font-bold text-lg text-gray-800">{channel.name}</h3>
      <p className={`mt-2 text-xs font-bold px-3 py-1 rounded-full ${typeStyle}`}>
        {channel.type.toUpperCase()}
      </p>
      <div className="mt-6 w-full border-t border-gray-200 pt-4 flex justify-around items-center text-gray-500">
        <button className="flex items-center gap-2 text-sm hover:text-orange-500 transition-colors">
          <Settings className="w-4 h-4" />
          <span>Cài đặt</span>
        </button>
        <button className="flex items-center gap-2 text-sm hover:text-red-500 transition-colors">
          <Trash2 className="w-4 h-4" />
          <span>Xóa</span>
        </button>
      </div>
    </div>
  );
};

export default ChannelCard;