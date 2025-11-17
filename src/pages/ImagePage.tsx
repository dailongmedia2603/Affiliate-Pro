import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Image as ImageIcon, AlertTriangle, Loader2, Banana, Sparkles } from "lucide-react";
import { showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImageGenerationForm from '@/components/ImageGenerationForm';
import ImageTaskHistory from '@/components/ImageTaskHistory';

const ImagePage = () => {
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const [activeModel, setActiveModel] = useState('banana');
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
    { id: 'banana', name: 'Banana', icon: <Banana className="w-4 h-4 mr-2" />, color: "text-yellow-500" },
    { id: 'seedream', name: 'SeeDream', icon: <Sparkles className="w-4 h-4 mr-2" />, color: "text-cyan-500" },
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
        <ImageIcon className="w-7 h-7 text-orange-500" />
        <h1 className="text-2xl font-bold text-gray-800">Tạo Ảnh</h1>
      </div>
      <Tabs value={activeModel} onValueChange={setActiveModel} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-lg h-auto">
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
                <ImageGenerationForm model={model.id} onTaskCreated={() => setRefreshTrigger(c => c + 1)} />
              </div>
              <div className="lg:col-span-1">
                <ImageTaskHistory model={model.id} key={`${model.id}-${refreshTrigger}`} />
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default ImagePage;