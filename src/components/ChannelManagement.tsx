import React, { useState, useMemo, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import ChannelCard from './ChannelCard';
import { supabase } from '@/integrations/supabase/client';
import { showError } from '@/utils/toast';

type Product = {
  id: string;
  name: string;
};

type Channel = {
  id: string;
  name: string;
  type: string;
  avatar: string;
  category: string;
  attachments: number;
  status: string;
  company_size: number;
  revenue: number;
  open_projects: number;
  product_id: string | null;
};

const ChannelManagement = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProductId, setActiveProductId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError("Không thể xác thực người dùng.");
        setLoading(false);
        return;
      }

      const [productsRes, channelsRes] = await Promise.all([
        supabase.from('products').select('id, name').eq('user_id', user.id),
        supabase.from('channels').select('*').eq('user_id', user.id)
      ]);

      if (productsRes.error) {
        showError('Không thể tải danh sách sản phẩm.');
      } else {
        setProducts(productsRes.data || []);
      }

      if (channelsRes.error) {
        showError('Không thể tải danh sách kênh.');
      } else {
        setChannels(channelsRes.data || []);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  const filteredChannels = useMemo(() => {
    return channels
      .filter(channel => activeProductId === 'all' || channel.product_id === activeProductId)
      .filter(channel => channel.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [channels, activeProductId, searchTerm]);

  const filters = [{ id: 'all', name: 'Tất cả' }, ...products];

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
        <div className="flex items-center gap-2 flex-wrap">
          {filters.map(filter => (
            <button
              key={filter.id}
              onClick={() => setActiveProductId(filter.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeProductId === filter.id
                  ? 'bg-orange-500 text-white shadow'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.name}
            </button>
          ))}
        </div>
      </div>

      {/* Channel Grid */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredChannels.length > 0 ? (
            filteredChannels.map(channel => (
              <ChannelCard key={channel.id} channel={channel} />
            ))
          ) : (
            <p className="col-span-full text-center text-gray-500 py-10">Không tìm thấy kênh nào phù hợp.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default ChannelManagement;