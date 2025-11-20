import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Film, AlertTriangle, Loader2, Sparkles, Wind, Clapperboard } from "lucide-react";
import { showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import VideoGenerationForm from '@/components/VideoGenerationForm';
import VideoTaskHistory from '@/components/VideoTaskHistory';

const VideoPage = ({ channelId = null }) => {
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const [activeModel, setActiveModel] = useState('sora');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const checkApiKeys = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('user_settings')
          .select('higgsfield_cookie, higgsfield_clerk_context')
          .eq('id', user.id)
          .single();
        
        if (error && error.code !== 'PGRST116') {
          showError('Không thể tải cài đặt API Higgsfield.');
        }
        setApiKeySet(!!(data?.higgsfield_cookie && data?.higgsfield_clerk_context));
      } else {
        setApiKeySet(false);
      }
    };
    checkApiKeys();
  }, []);

  const models = [
    { id: 'sora', name: 'Sora', icon: <Film className="w-4 h-4 mr-2" />, color: "text-blue-500" },
    { id: 'kling', name: 'Kling', icon: <Sparkles className="w-4 h-4 mr-2" />, color: "text-purple-500" },
    { id: 'higg_life', name: 'Higg Life', icon: <Wind className="w-4 h-4 mr-2" />, color: "text-green-500" },
    { id: 'wan2', name: 'Wan2', icon: <Clapperboard className="w-4 h-4 mr-2" />, color: "text-red-500" },
  ];

  if (apiKeySet === null) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  }

  if (!apiKeySet) {
    return (
      <div className="w-full h-full p-6 bg-gray-50/50 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chưa cấu hình API Higgsfield</AlertTitle>
          <AlertDescription>Vui lòng vào trang Cài đặt và thêm Cookie và Clerk Context để sử dụng tính năng này.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full p-6 bg-gray-50/50">
      <div className="flex items-center gap-3 mb-6">
        <Film className="w-7 h-7 text-orange-500" />
        <h1 className="text-2xl font-bold text-gray-800">Tạo Video</h1>
      </div>
      {channelId && (
        <Alert className="mb-6 bg-blue-50 border-blue-200">
          <AlertTriangle className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">Chế độ tạo video cho kênh</AlertTitle>
          <AlertDescription className="text-blue-700">
            Các video bạn tạo bây giờ sẽ được tự động liên kết với kênh đã chọn.
          </AlertDescription>
        </Alert>
      )}
      <Tabs value={activeModel} onValueChange={setActiveModel} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-gray-100 p-1 rounded-lg h-auto">
          {models.map(model => (
            <TabsTrigger key={model.id} value={model.id} className="data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-orange-600 font-semibold flex items-center justify-center">
              <span className={model.color}>{model.icon}</span> {model.name}
            </TabsTrigger>
          ))}
        </TabsList>
        {models.map(model => (
          <TabsContent key={model.id} value={model.id} className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <VideoGenerationForm model={model.id} onTaskCreated={() => setRefreshTrigger(c => c + 1)} channelId={channelId} />
              </div>
              <div className="lg:col-span-1">
                <VideoTaskHistory model={model.id} key={`${model.id}-${refreshTrigger}`} />
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default VideoPage;