import React from 'react';
import {
  Users,
  ThumbsUp,
  Video,
  Edit,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const ChannelCard = ({ channel, productName, onClick, onEdit, onDelete }) => {
  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <img
          src={channel.avatar}
          alt={channel.name}
          className="w-12 h-12 rounded-lg object-cover"
        />
        <div className="flex-1">
          <h3 className="font-bold text-gray-800">{channel.name}</h3>
          <p className="text-sm text-gray-500">{channel.category}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleEditClick}>
                <Edit className="w-4 h-4 text-gray-600" />
            </Button>
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={handleDeleteClick}>
                <Trash2 className="w-4 h-4 text-red-500" />
            </Button>
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-1 rounded-md">
          <Video className="w-3.5 h-3.5" />
          <span>{channel.attachments}</span>
        </div>
        {productName && (
          <div className="bg-orange-100 text-orange-700 text-xs font-semibold px-2 py-1 rounded-md">
            {productName}
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center text-gray-500">
          <Users className="w-4 h-4 mr-2" />
          <span>Follow</span>
          <span className="ml-auto font-bold text-gray-800">{channel.company_size}</span>
        </div>
        <div className="flex items-center text-gray-500">
          <ThumbsUp className="w-4 h-4 mr-2" />
          <span>Like</span>
          <span className="ml-auto font-bold text-gray-800">{channel.revenue}</span>
        </div>
        <div className="flex items-center text-gray-500">
          <Video className="w-4 h-4 mr-2" />
          <span>Video</span>
          <span className="ml-auto font-bold text-gray-800">{channel.open_projects}</span>
        </div>
      </div>

      {/* Action Button */}
      <button 
        onClick={handleButtonClick}
        className="w-full mt-2 py-2.5 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
      >
        Video đã tạo
      </button>
    </div>
  );
};

export default ChannelCard;