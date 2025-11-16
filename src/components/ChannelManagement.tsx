import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import ChannelCard from './ChannelCard';

const channels = [
  { 
    id: 1, 
    name: 'Fanpage Thời Trang', 
    type: 'Facebook', 
    avatar: 'https://i.pravatar.cc/150?img=1', 
    category: 'E-commerce',
    attachments: 10,
    status: 'updated',
    companySize: 150,
    revenue: 5,
    openProjects: 10,
  },
  { 
    id: 2, 
    name: 'Mỹ phẩm chính hãng', 
    type: 'Instagram', 
    avatar: 'https://i.pravatar.cc/150?img=2', 
    category: 'Beauty',
    attachments: 5,
    status: 'pending',
    companySize: 80,
    revenue: 2.5,
    openProjects: 4,
  },
  { 
    id: 3, 
    name: 'Zalo Shop Mẹ & Bé', 
    type: 'Zalo', 
    avatar: 'https://i.pravatar.cc/150?img=3', 
    category: 'Retail',
    attachments: 12,
    status: 'updated',
    companySize: 45,
    revenue: 1.2,
    openProjects: 8,
  },
  { 
    id: 4, 
    name: 'Website Giày Sneaker', 
    type: 'Website', 
    avatar: 'https://i.pravatar.cc/150?img=4', 
    category: 'Fashion',
    attachments: 25,
    status: 'pending',
    companySize: 200,
    revenue: 10,
    openProjects: 15,
  },
  { 
    id: 5, 
    name: 'Kênh Bán Hàng Phụ Kiện', 
    type: 'Facebook', 
    avatar: 'https://i.pravatar.cc/150?img=5', 
    category: 'Accessories',
    attachments: 8,
    status: 'updated',
    companySize: 30,
    revenue: 0.8,
    openProjects: 3,
  },
  { 
    id: 6, 
    name: 'Trang sức cao cấp', 
    type: 'Instagram', 
    avatar: 'https://i.pravatar.cc/150?img=6', 
    category: 'Luxury Goods',
    attachments: 15,
    status: 'pending',
    companySize: 60,
    revenue: 4,
    openProjects: 6,
  },
];

const filters = ['Tất cả', 'Facebook', 'Instagram', 'Zalo', 'Website'];

const ChannelManagement = () => {
  const [activeFilter, setActiveFilter] = useState('Tất cả');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredChannels = useMemo(() => {
    return channels
      .filter(channel => activeFilter === 'Tất cả' || channel.type === activeFilter)
      .filter(channel => channel.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [activeFilter, searchTerm]);

  return (
    <div className="w-full p-6 bg-gray-50/50">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Quản lý kênh</h1>
        <div className="relative w-1/3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Tìm kiếm kênh..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          {filters.map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeFilter === filter
                  ? 'bg-orange-500 text-white shadow'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Channel Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredChannels.length > 0 ? (
          filteredChannels.map(channel => (
            <ChannelCard key={channel.id} channel={channel} />
          ))
        ) : (
          <p className="col-span-full text-center text-gray-500">Không tìm thấy kênh nào.</p>
        )}
      </div>
    </div>
  );
};

export default ChannelManagement;