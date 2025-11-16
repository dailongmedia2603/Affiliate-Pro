import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mic, UserPlus, AlertTriangle, Loader2 } from "lucide-react";
import TextToSpeechTab from '@/components/TextToSpeechTab';
import CloneVoiceTab from '@/components/CloneVoiceTab';
import { showError } from '@/utils/toast';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const VoicePage = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApiKey = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('user_settings')
          .select('voice_api_key')
          .eq('id', user.id)
          .single();
        
        if (error && error.code !== 'PGRST116') {
          showError('Không thể tải cài đặt API key.');
        }
        if (data && data.voice_api_key) {
          setApiKey(data.voice_api_key);
        }
      }
      setLoading(false);
    };
    fetchApiKey();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="w-full h-full p-6 bg-gray-50/50 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chưa cấu hình API Voice</AlertTitle>
          <AlertDescription>
            Vui lòng vào trang Cài đặt và thêm API Key cho dịch vụ Voice để sử dụng tính năng này.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full p-6 bg-gray-50/50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Tạo Voice</h1>
      <Tabs defaultValue="tts">
        <TabsList className="bg-gray-100 p-1 rounded-lg h-auto">
          <TabsTrigger value="tts" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Mic className="w-4 h-4 mr-2" /> Text to Speech</TabsTrigger>
          <TabsTrigger value="clone" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><UserPlus className="w-4 h-4 mr-2" /> Clone Voice</TabsTrigger>
        </TabsList>
        <TabsContent value="tts" className="mt-6">
          <TextToSpeechTab apiKey={apiKey} />
        </TabsContent>
        <TabsContent value="clone" className="mt-6">
          <CloneVoiceTab apiKey={apiKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VoicePage;