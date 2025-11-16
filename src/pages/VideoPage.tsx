import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Film, AlertTriangle, Loader2 } from "lucide-react";
import { showError } from '@/utils/toast';
import VideoGenerationForm from '@/components/VideoGenerationForm';
import VideoTaskHistory from '@/components/VideoTaskHistory';

const VideoPage = () => {
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const [refreshTasks, setRefreshTasks] = useState(0);

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

  if (apiKeySet === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!apiKeySet) {
    return (
      <div className="w-full h-full p-6 bg-gray-50/50 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chưa cấu hình API Higgsfield</AlertTitle>
          <AlertDescription>
            Vui lòng vào trang Cài đặt và thêm Cookie và Clerk Context cho dịch vụ Higgsfield để sử dụng tính năng này.
          </AlertDescription>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <VideoGenerationForm onTaskCreated={() => setRefreshTasks(c => c + 1)} />
        </div>
        <div className="lg:col-span-1">
          <VideoTaskHistory key={refreshTasks} />
        </div>
      </div>
    </div>
  );
};

export default VideoPage;