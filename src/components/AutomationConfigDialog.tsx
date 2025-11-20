import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, HelpCircle } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Config = {
  imagePromptGenerationTemplate: string;
  imageCount: number;
  videoPromptGenerationTemplate: string;
  voiceScriptTemplate: string;
  voiceId: string | null;
};

const defaultConfig: Config = {
  imagePromptGenerationTemplate: 'Vui lòng tạo chính xác {{image_count}} prompt khác nhau để tạo ảnh quảng cáo cho sản phẩm "{{product_name}}".\nMô tả sản phẩm: {{product_description}}.\nBối cảnh chung cho các ảnh là: studio background, high quality, professional lighting.\nYÊU CẦU CỰC KỲ QUAN TRỌNG: Mỗi prompt phải được đặt trong một cặp thẻ <prompt> và </prompt>. Ví dụ: <prompt>Một prompt mẫu.</prompt><prompt>Một prompt mẫu khác.</prompt>. KHÔNG thêm bất kỳ văn bản nào khác ngoài các thẻ prompt.',
  imageCount: 4,
  videoPromptGenerationTemplate: 'Dựa vào prompt tạo ảnh sau: "{{image_prompt}}", hãy tạo một prompt mô tả chuyển động ngắn gọn cho video, ví dụ: "a slow pan from left to right". Chỉ trả về prompt chuyển động, không thêm lời giải thích.',
  voiceScriptTemplate: 'Viết một kịch bản quảng cáo ngắn gọn, hấp dẫn cho sản phẩm "{{product_name}}".\nMô tả sản phẩm: {{product_description}}.\nHãy tập trung vào lợi ích và kêu gọi hành động.',
  voiceId: null,
};

const PlaceholderTooltip = ({ content }: { content: React.ReactNode }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="w-4 h-4 text-gray-400 cursor-help ml-2" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {content}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const AutomationConfigDialog = ({ isOpen, onClose, channelId, channelName }) => {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [clonedVoices, setClonedVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleConfigChange = (field: keyof Config, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (!isOpen || !channelId) return;

    const fetchData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError("Không thể xác thực người dùng.");
        setLoading(false);
        return;
      }

      const [configRes, settingsRes] = await Promise.all([
        supabase.from('automation_configs').select('config_data').eq('channel_id', channelId).single(),
        supabase.from('user_settings').select('voice_api_key').eq('id', user.id).single()
      ]);

      if (configRes.data?.config_data) {
        setConfig(prev => ({ ...defaultConfig, ...configRes.data.config_data }));
      } else {
        setConfig(defaultConfig);
      }

      const voiceApiKey = settingsRes.data?.voice_api_key;
      if (voiceApiKey) {
        try {
          const { data: voiceData, error: voiceError } = await supabase.functions.invoke('proxy-voice-api', {
            body: { path: 'v1m/voice/clone', token: voiceApiKey, method: 'GET' }
          });
          if (voiceError) throw voiceError;
          if (voiceData.success) {
            setClonedVoices(voiceData.data || []);
          } else {
            throw new Error(voiceData.error || 'Failed to fetch cloned voices');
          }
        } catch (error) {
          showError(`Không thể tải danh sách giọng nói: ${error.message}`);
        }
      }
      setLoading(false);
    };

    fetchData();
  }, [isOpen, channelId]);

  const handleSave = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError("Bạn cần đăng nhập để lưu.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('automation_configs').upsert(
      { channel_id: channelId, user_id: user.id, config_data: config },
      { onConflict: 'channel_id' }
    );

    if (error) {
      showError(`Lưu cấu hình thất bại: ${error.message}`);
    } else {
      showSuccess('Đã lưu cấu hình thành công!');
      onClose();
    }
    setSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cấu hình Automation cho kênh "{channelName}"</DialogTitle>
          <DialogDescription>
            Tùy chỉnh các bước trong luồng tự động hóa. Hệ thống sẽ sử dụng các mẫu này để tạo nội dung.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          </div>
        ) : (
          <Tabs defaultValue="image" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="image">1. Tạo Ảnh</TabsTrigger>
              <TabsTrigger value="video">2. Tạo Video</TabsTrigger>
              <TabsTrigger value="voice">3. Tạo Voice</TabsTrigger>
            </TabsList>
            <div className="mt-4 max-h-[60vh] overflow-y-auto p-1">
              <TabsContent value="image" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="imagePromptGenerationTemplate">Mẫu Prompt cho AI (Tạo Prompt Ảnh)</Label>
                    <PlaceholderTooltip content={
                      <div>
                        <p className="font-bold">Đây là câu lệnh để yêu cầu AI tạo ra các prompt tạo ảnh.</p>
                        <p className="mt-2 font-bold">Các biến có thể dùng:</p>
                        <ul className="list-disc list-inside">
                          <li><code className="bg-gray-200 px-1 rounded">{"{{product_name}}"}</code>: Tên sản phẩm con.</li>
                          <li><code className="bg-gray-200 px-1 rounded">{"{{product_description}}"}</code>: Mô tả sản phẩm con.</li>
                          <li><code className="bg-gray-200 px-1 rounded">{"{{image_count}}"}</code>: Số lượng ảnh cần tạo.</li>
                        </ul>
                      </div>
                    } />
                  </div>
                  <Textarea id="imagePromptGenerationTemplate" value={config.imagePromptGenerationTemplate} onChange={(e) => handleConfigChange('imagePromptGenerationTemplate', e.target.value)} className="min-h-[150px] font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imageCount">Số lượng ảnh / sản phẩm con</Label>
                  <Input id="imageCount" type="number" min="1" max="10" value={config.imageCount} onChange={(e) => handleConfigChange('imageCount', parseInt(e.target.value, 10) || 1)} />
                </div>
              </TabsContent>
              <TabsContent value="video" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="videoPromptGenerationTemplate">Mẫu Prompt cho AI (Tạo Prompt Video)</Label>
                    <PlaceholderTooltip content={
                      <div>
                        <p className="font-bold">Đây là câu lệnh để yêu cầu AI tạo ra prompt mô tả chuyển động cho video.</p>
                        <p className="mt-2 font-bold">Biến có thể dùng:</p>
                        <ul className="list-disc list-inside">
                          <li><code className="bg-gray-200 px-1 rounded">{"{{image_prompt}}"}</code>: Prompt đã dùng để tạo ảnh gốc.</li>
                        </ul>
                      </div>
                    } />
                  </div>
                  <Textarea id="videoPromptGenerationTemplate" value={config.videoPromptGenerationTemplate} onChange={(e) => handleConfigChange('videoPromptGenerationTemplate', e.target.value)} className="min-h-[120px] font-mono text-sm" />
                </div>
              </TabsContent>
              <TabsContent value="voice" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="voiceScriptTemplate">Mẫu Prompt Kịch Bản Voice</Label>
                    <PlaceholderTooltip content={
                      <div>
                        <p className="font-bold">Các biến có thể dùng:</p>
                        <ul className="list-disc list-inside">
                          <li><code className="bg-gray-200 px-1 rounded">{"{{product_name}}"}</code>: Tên sản phẩm con.</li>
                          <li><code className="bg-gray-200 px-1 rounded">{"{{product_description}}"}</code>: Mô tả sản phẩm con.</li>
                        </ul>
                      </div>
                    } />
                  </div>
                  <Textarea id="voiceScriptTemplate" value={config.voiceScriptTemplate} onChange={(e) => handleConfigChange('voiceScriptTemplate', e.target.value)} className="min-h-[120px] font-mono text-sm" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voiceId">Giọng nói mặc định cho kênh</Label>
                  <Select value={config.voiceId || undefined} onValueChange={(value) => handleConfigChange('voiceId', value)}>
                    <SelectTrigger id="voiceId">
                      <SelectValue placeholder="Chọn một giọng nói..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clonedVoices.length > 0 ? (
                        clonedVoices.map(voice => (
                          <SelectItem key={voice.voice_id} value={voice.voice_id}>{voice.voice_name}</SelectItem>
                        ))
                      ) : (
                        <div className="p-4 text-center text-sm text-gray-500">Không có giọng nói clone nào.</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Hủy</Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading} className="bg-orange-500 hover:bg-orange-600 text-white">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Lưu Cấu hình
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AutomationConfigDialog;