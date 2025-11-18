import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Settings, Play, Bot } from 'lucide-react';
import { showError } from '@/utils/toast';
import AutomationConfigDialog from '@/components/AutomationConfigDialog';

type Channel = {
  id: string;
  name: string;
  avatar: string;
  user_id: string;
};

const AutomationPage = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configuringChannel, setConfiguringChannel] = useState<Channel | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError("Không thể xác thực người dùng.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('channels')
      .select('id, name, avatar, user_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      showError('Không thể tải danh sách kênh.');
    } else {
      setChannels(data || []);
      if (data && data.length > 0 && !selectedChannel) {
        setSelectedChannel(data[0]);
      }
    }
    setLoading(false);
  }, [selectedChannel]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const filteredChannels = useMemo(() => {
    return channels.filter(channel =>
      channel.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [channels, searchTerm]);

  const handleConfigure = (channel: Channel) => {
    setConfiguringChannel(channel);
    setIsConfigOpen(true);
  };

  const handleRunAutomation = (channelId: string) => {
    // Logic for Phase 3
    alert(`Chạy automation cho kênh ${channelId} sẽ được triển khai ở giai đoạn sau.`);
  };

  return (
    <>
      <div className="w-full h-full flex p-6 gap-6 bg-gray-50/50">
        {/* Left Column: Channel List */}
        <div className="w-[400px] bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Kênh Automation</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Tìm kiếm kênh..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              </div>
            ) : filteredChannels.length > 0 ? (
              filteredChannels.map(channel => (
                <div
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel)}
                  className={`w-full p-3 rounded-lg transition-colors cursor-pointer ${selectedChannel?.id === channel.id ? 'bg-orange-100' : 'hover:bg-gray-100'}`}
                >
                  <div className="flex items-center gap-3">
                    <img src={channel.avatar || '/placeholder.svg'} alt={channel.name} className="w-10 h-10 rounded-md object-cover bg-gray-200" />
                    <span className="font-semibold flex-1 truncate text-gray-800">{channel.name}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleConfigure(channel); }}>
                      <Settings className="w-4 h-4 mr-2" />
                      Cấu hình
                    </Button>
                    <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={(e) => { e.stopPropagation(); handleRunAutomation(channel.id); }}>
                      <Play className="w-4 h-4 mr-2" />
                      Chạy
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-500">
                <p>Không tìm thấy kênh nào.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: History */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          {selectedChannel ? (
            <>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-2xl font-bold text-gray-800">Lịch sử chạy: {selectedChannel.name}</h2>
                <p className="text-sm text-gray-500">Xem lại các lần chạy tự động hóa cho kênh này.</p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 border-2 border-dashed rounded-lg">
                  <Bot className="w-16 h-16 mb-4" />
                  <h3 className="text-xl font-semibold">Sắp ra mắt</h3>
                  <p>Lịch sử các lần chạy tự động hóa sẽ được hiển thị ở đây.</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <Bot className="w-16 h-16 mb-4" />
              <h3 className="text-xl font-semibold">{loading ? 'Đang tải kênh...' : 'Chưa có kênh nào'}</h3>
              <p>{loading ? 'Vui lòng chờ trong giây lát.' : 'Chọn một kênh từ danh sách bên trái để bắt đầu.'}</p>
            </div>
          )}
        </div>
      </div>
      {configuringChannel && (
        <AutomationConfigDialog
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          channelId={configuringChannel.id}
          channelName={configuringChannel.name}
        />
      )}
    </>
  );
};

export default AutomationPage;