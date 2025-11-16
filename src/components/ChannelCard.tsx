import React from 'react';
import {
  Users2,
  DollarSign,
  Presentation,
  Paperclip,
  CheckCircle2,
  Clock,
} from 'lucide-react';

const StatusBadge = ({ status }) => {
  if (status === 'updated') {
    return (
      <div className="flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-md">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>All updated</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 bg-orange-100 text-orange-600 text-xs font-semibold px-2 py-1 rounded-md">
      <Clock className="w-3.5 h-3.5" />
      <span>Task pending</span>
    </div>
  );
};

const ChannelCard = ({ channel }) => {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      {/* Header */}
      <div className="flex items-center gap-3">
        <img
          src={channel.avatar}
          alt={channel.name}
          className="w-12 h-12 rounded-lg object-cover"
        />
        <div className="flex-1">
          <h3 className="font-bold text-gray-800">{channel.name}</h3>
          <p className="text-sm text-gray-500">{channel.category}</p>
        </div>
        <div className="flex -space-x-2">
          <img className="inline-block h-7 w-7 rounded-full ring-2 ring-white" src="https://i.pravatar.cc/150?img=10" alt="member 1" />
          <img className="inline-block h-7 w-7 rounded-full ring-2 ring-white" src="https://i.pravatar.cc/150?img=11" alt="member 2" />
          <div className="h-7 w-7 rounded-full ring-2 ring-white bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">
            +20
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-gray-100 text-gray-600 text-xs font-semibold px-2 py-1 rounded-md">
          <Paperclip className="w-3.5 h-3.5" />
          <span>{channel.attachments}</span>
        </div>
        <StatusBadge status={channel.status} />
      </div>

      {/* Details */}
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center text-gray-500">
          <Users2 className="w-4 h-4 mr-2" />
          <span>Company Size</span>
          <span className="ml-auto font-bold text-gray-800">{channel.company_size} Members</span>
        </div>
        <div className="flex items-center text-gray-500">
          <DollarSign className="w-4 h-4 mr-2" />
          <span>Revenue</span>
          <span className="ml-auto font-bold text-gray-800">${channel.revenue}M /year</span>
        </div>
        <div className="flex items-center text-gray-500">
          <Presentation className="w-4 h-4 mr-2" />
          <span>Open projects</span>
          <span className="ml-auto font-bold text-gray-800">{channel.open_projects} projects</span>
        </div>
      </div>

      {/* Action Button */}
      <button className="w-full mt-2 py-2.5 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500">
        Visit Company
      </button>
    </div>
  );
};

export default ChannelCard;