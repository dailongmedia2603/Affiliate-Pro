import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Loader2, PlusCircle } from 'lucide-react';
import ChannelCard from './ChannelCard';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import AddChannelDialog from './AddChannelDialog';
import ChannelDetailPage from '@/pages/ChannelDetailPage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  link: string | null;
};

const ChannelManagement = ({ onNavigate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProductId, setActiveProductId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [channelToEdit, setChannelToEdit] = useState<Channel | null>(null);
  const [channelToDelete, setChannelToDelete] = useState<Channel | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const fetchData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddChannel = () => {
    setChannelToEdit(null);
    setIsAddDialogOpen(true);
  };

  const handleEditChannel = (channel: Channel) => {
    setChannelToEdit(channel);
    setIsAddDialogOpen(true);
  };

  const handleDeleteRequest = (channel: Channel) => {
    setChannelToDelete(channel);
    setIsAlertOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!channelToDelete) return;
    const loadingToast = showLoading('Đang xoá kênh và tất cả dữ liệu liên quan...');
    
    try {
      const { error } = await supabase.functions.invoke('delete-channel', {
        body: { channelId: channelToDelete.id },
      });

      if (error) {
        throw new Error(error.message);
      }

      showSuccess('Đã xoá kênh thành công.');
      fetchData(); // Refresh the list
    } catch (error) {
      showError(`Xoá thất bại: ${error.message}`);
    } finally {
      dismissToast(loadingToast);
      setIsAlertOpen(false);
      setChannelToDelete(null);
    }
  };

  const handleSaveChannel = async (channelData: { name: string; product_id: string | null; link: string; id?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError('Bạn cần đăng nhập để thực hiện.');
      return;
    }

    if (channelData.id) {
      // Update logic
      const { error } = await supabase
        .from('channels')
        .update({
          name: channelData.name,
          product_id: channelData.product_id,
          link: channelData.link,
        })
        .eq('id', channelData.id);

      if (error) {
        showError('Cập nhật kênh thất bại: ' + error.message);
      } else {
        showSuccess('Kênh đã được cập nhật.');
        await fetchData();
        setIsAddDialogOpen(false);
      }
    } else {
      // Insert logic
      const dataToSave = {
        name: channelData.name,
        product_id: channelData.product_id,
        link: channelData.link,
        user_id: user.id,
        type: 'social',
        avatar: `https://avatar.vercel.sh/${encodeURIComponent(channelData.name)}.png`,
        category: 'Chưa phân loại',
        attachments: 0,
        status: 'pending',
        company_size: 1,
        revenue: 0,
        open_projects: 0,
      };

      const { error } = await supabase.from('channels').insert(dataToSave);

      if (error) {
        showError('Thêm kênh thất bại: ' + error.message);
      } else {
        showSuccess('Kênh đã được thêm thành công.');
        await fetchData();
        setIsAddDialogOpen(false);
      }
    }
  };

  const productMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach(p => map.set(p.id, p.name));
    return map;
  }, [products]);

  const filteredChannels = useMemo(() => {
    return channels
      .filter(channel => activeProductId === 'all' || channel.product_id === activeProductId)
      .filter(channel => channel.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [channels, activeProductId, searchTerm]);

  const filters = [{ id: 'all', name: 'Tất cả' }, ...products];

  if (selectedChannelId) {
    return <ChannelDetailPage channelId={selectedChannelId} onBack={() => setSelectedChannelId(null)} onNavigate={onNavigate} />;
  }

  return (
    <>
      <div className="w-full p-6 bg-gray-50/50">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-800">Quản lý kênh</h1>
            <Button onClick={handleAddChannel} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white">
              <PlusCircle className="w-4 h-4 mr-2" />
              Thêm kênh
            </Button>
          </div>
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
                <ChannelCard
                  key={channel.id}
                  channel={channel}
                  productName={channel.product_id ? productMap.get(channel.product_id) : undefined}
                  onClick={() => setSelectedChannelId(channel.id)}
                  onEdit={() => handleEditChannel(channel)}
                  onDelete={() => handleDeleteRequest(channel)}
                />
              ))
            ) : (
              <p className="col-span-full text-center text-gray-500 py-10">Không tìm thấy kênh nào phù hợp.</p>
            )}
          </div>
        )}
      </div>
      <AddChannelDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSave={handleSaveChannel}
        products={products}
        channel={channelToEdit}
      />
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể được hoàn tác. Kênh "{channelToDelete?.name}" và tất cả dữ liệu liên quan (automation, video, ảnh...) sẽ bị xóa vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ChannelManagement;