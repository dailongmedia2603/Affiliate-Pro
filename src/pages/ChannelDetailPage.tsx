import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Video, Heart, Users, UploadCloud, PlusCircle, Film, Loader2, Edit2, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { showError, showSuccess } from '@/utils/toast';
import { Badge } from '@/components/ui/badge';

const StatCard = ({ icon, title, value, colorClass }) => (
  <Card className="shadow-sm">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
      <div className={`p-2 rounded-full ${colorClass}`}>
        {icon}
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

const VideoCard = ({ video }) => (
  <Card className="overflow-hidden group transition-all hover:shadow-lg hover:-translate-y-1">
    <CardContent className="p-0">
      <div className="aspect-video bg-gray-900 flex items-center justify-center">
        {video.result_url ? (
          <video src={video.result_url} controls className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-xs mt-2">Đang xử lý...</p>
          </div>
        )}
      </div>
      <div className="p-4 bg-white">
        <p className="text-sm font-semibold text-gray-800 truncate" title={video.prompt}>{video.prompt || "Không có prompt"}</p>
        <div className="flex justify-between items-center mt-2">
          <Badge variant="outline">{video.model}</Badge>
          <p className="text-xs text-gray-500">{new Date(video.created_at).toLocaleDateString()}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

const ChannelDetailPage = ({ channelId, onBack, onNavigate }) => {
  const [channel, setChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingCharacterImage, setIsUploadingCharacterImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterImageInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const channelPromise = supabase.from('channels').select('*').eq('id', channelId).single();
    const videosPromise = supabase.from('video_tasks').select('*').eq('channel_id', channelId).order('created_at', { ascending: false });

    const [channelRes, videosRes] = await Promise.all([channelPromise, videosPromise]);

    if (channelRes.error) {
      showError('Không thể tải thông tin kênh.');
      onBack();
    } else {
      setChannel(channelRes.data);
    }

    if (videosRes.error) {
      showError('Không thể tải danh sách video.');
    } else {
      setVideos(videosRes.data);
    }
    setLoading(false);
  }, [channelId, onBack]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Cần đăng nhập để thực hiện.");

      const filePath = `public/channel_avatars/${user.id}/${channelId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
      
      const { error: updateError } = await supabase.from('channels').update({ avatar: publicUrl }).eq('id', channelId);
      if (updateError) throw updateError;

      setChannel(prev => prev ? { ...prev, avatar: publicUrl } : null);
      showSuccess('Đã cập nhật ảnh đại diện thành công!');
    } catch (error) {
      showError(`Lỗi tải ảnh lên: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCharacterImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingCharacterImage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Cần đăng nhập để thực hiện.");

      const filePath = `public/character_images/${user.id}/${channelId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
      
      const { error: updateError } = await supabase.from('channels').update({ character_image_url: publicUrl }).eq('id', channelId);
      if (updateError) throw updateError;

      setChannel(prev => prev ? { ...prev, character_image_url: publicUrl } : null);
      showSuccess('Đã cập nhật ảnh nhân vật thành công!');
    } catch (error) {
      showError(`Lỗi tải ảnh nhân vật lên: ${error.message}`);
    } finally {
      setIsUploadingCharacterImage(false);
    }
  };

  if (loading || !channel) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-10 h-10 animate-spin text-orange-500" /></div>;
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{channel.name}</h1>
            <p className="text-sm text-gray-500">Quản lý kênh &gt; {channel.name}</p>
          </div>
        </div>
        <Button onClick={() => onNavigate('Tạo Video', { channelId })} className="bg-orange-500 hover:bg-orange-600 text-white">
          <PlusCircle className="w-4 h-4 mr-2" /> Tạo Video cho Kênh
        </Button>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card className="shadow-sm">
            <CardHeader><CardTitle>Thông tin kênh</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center text-center">
              <div className="relative group mb-4">
                <img src={channel.avatar} alt={channel.name} className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg" />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={isUploading}
                >
                  {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Edit2 className="w-6 h-6" />}
                </button>
                <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" />
              </div>
              <h2 className="text-xl font-bold">{channel.name}</h2>
              <p className="text-gray-500">{channel.category}</p>
              {channel.link && <a href={channel.link} target="_blank" rel="noopener noreferrer" className="text-sm text-orange-600 hover:underline mt-2">Xem kênh</a>}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader><CardTitle>Ảnh Nhân Vật</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center text-center">
              <div className="relative group mb-4 w-32 h-32">
                {channel.character_image_url ? (
                  <img src={channel.character_image_url} alt="Ảnh nhân vật" className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg" />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gray-100 flex items-center justify-center border-4 border-white shadow-lg">
                      <UserIcon className="w-16 h-16 text-gray-400" />
                  </div>
                )}
                <button 
                  onClick={() => characterImageInputRef.current?.click()}
                  className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  disabled={isUploadingCharacterImage}
                >
                  {isUploadingCharacterImage ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
                </button>
                <input type="file" ref={characterImageInputRef} onChange={handleCharacterImageUpload} accept="image/*" className="hidden" />
              </div>
              <p className="text-sm text-gray-500">Ảnh khuôn mặt của nhân vật. Sẽ được dùng để giữ sự đồng nhất khi tạo ảnh mới.</p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={<Film className="w-5 h-5 text-white" />} title="Video đã tạo" value={videos.length} colorClass="bg-green-500" />
            <StatCard icon={<Users className="w-5 h-5 text-white" />} title="Follow" value={channel.company_size} colorClass="bg-blue-500" />
            <StatCard icon={<Heart className="w-5 h-5 text-white" />} title="Like" value={channel.revenue} colorClass="bg-red-500" />
            <StatCard icon={<Video className="w-5 h-5 text-white" />} title="Video" value={channel.open_projects} colorClass="bg-purple-500" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4">Danh sách Video</h3>
            {videos.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {videos.map(video => <VideoCard key={video.id} video={video} />)}
              </div>
            ) : (
              <div className="text-center py-10 border-2 border-dashed rounded-lg">
                <p className="text-gray-500">Kênh này chưa có video nào.</p>
                <p className="text-sm text-gray-400 mt-1">Bắt đầu bằng cách nhấn nút "Tạo Video cho Kênh".</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChannelDetailPage;