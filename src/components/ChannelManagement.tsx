import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import ChannelCard from './ChannelCard';

const channels = [
  { id: 1, name: 'Fanpage Thời Trang', type: 'Facebook', avatar: 'https://i.pravatar.cc/150?img=1', rating: 4.8 },
  { id: 2, name: 'Mỹ phẩm chính hãng', type: 'Instagram', avatar: 'https://i.pravatar.cc/150?img=2', rating: 4.5 },
  { id: 3, name: 'Zalo Shop Mẹ & Bé', type: 'Zalo', avatar: 'https://i.pravatar.cc/150?img=3', rating: 4.2 },
  { id: 4, name: 'Website Giày Sneaker', type: 'Website', avatar: 'https://i.pravatar.cc/150?img=4', rating: 5.0 },
  { id: 5, name: 'Kênh Bán Hàng Phụ Kiện', type: 'Facebook', avatar: 'https://i.pravatar.cc/150?img=5', rating: 4.9 },
  { id: 6, name: 'Trang sức cao cấp', type: 'Instagram', avatar: 'https://i.pravatar.cc/150?img=6', rating: 4.7 },
  { id: 7, name: 'Đồ gia dụng thông minh', type: 'Website', avatar: 'https://i.pravatar.cc/150?img=7', rating: 4.6 },
  { id: 8, name: 'Cửa hàng Zalo', type: 'Zalo', avatar: 'https://i.pravatar.cc/150?img=8', rating: 4.4 },
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
    <div className="w-full p-6">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
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