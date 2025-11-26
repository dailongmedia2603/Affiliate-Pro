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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';

type Prompt = {
  id: string;
  name: string;
  content: string;
  category: 'video' | 'image' | 'voice';
};

type Config = {
  videoScriptId: string | null;
  voiceScriptTemplate: string;
  voiceId: string | null;
  videoDuration: number;
  isVoiceEnabled: boolean;
  useLibraryPromptForVoice: boolean;
  voicePromptId: string | null;
};

const defaultConfig: Config = {
  videoScriptId: null,
  voiceScriptTemplate: 'Viết một kịch bản quảng cáo ngắn gọn, hấp dẫn cho sản phẩm "{{product_name}}".\nMô tả sản phẩm: {{product_description}}.\nHãy tập trung vào lợi ích và kêu gọi hành động.',
  voiceId: null,
  videoDuration: 5,
  isVoiceEnabled: true,
  useLibraryPromptForVoice: false,
  voicePromptId: null,
};

const VariablesList = ({ variables }: { variables: string[] }) => (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500">Biến có sẵn:</span>
        {variables.map(variable => (
            <code key={variable} className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded-md">{`{{${variable}}}`}</code>
        ))}
    </div>
);

const AutomationConfigDialog = ({ isOpen, onClose, channelId, channelName }) => {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [clonedVoices, setClonedVoices] = useState([]);
  const [voicePrompts, setVoicePrompts] = useState<Prompt[]>([]);
  const [videoPrompts, setVideoPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfigChange = (field: keyof Config, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleUseLibraryToggle = (
    useField: 'useLibraryPromptForVoice',
    idField: 'voicePromptId',
    checked: boolean
  ) => {
    setConfig(prev => ({
      ...prev,
      [useField]: checked,
      [idField]: checked ? prev[idField] : null,
    }));
  };

  const handlePromptSelect = (
    idField: 'voicePromptId',
    templateField: 'voiceScriptTemplate',
    promptId: string,
    promptList: Prompt[]
  ) => {
    const selectedPrompt = promptList.find(p => p.id === promptId);
    if (selectedPrompt) {
      setConfig(prev => ({
        ...prev,
        [idField]: promptId,
        [templateField]: selectedPrompt.content,
      }));
    }
  };

  useEffect(() => {
    if (!isOpen || !channelId) return;

    const fetchInitialData = async () => {
      setLoading(true);
      setLoadingExtra(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showError("Không thể xác thực người dùng.");
        setLoading(false);
        setLoadingExtra(false);
        return;
      }

      const [configRes, settingsRes, promptsRes] = await Promise.all([
        supabase.from('automation_configs').select('config_data').eq('channel_id', channelId).single(),
        supabase.from('user_settings').select('voice_api_key').eq('id', user.id).single(),
        supabase.from('prompts').select('id, name, content, category').in('category', ['video', 'voice'])
      ]);

      if (configRes.data?.config_data) {
        setConfig(prev => ({ ...defaultConfig, ...configRes.data.config_data }));
      } else {
        setConfig(defaultConfig);
      }
      setLoading(false);

      if (promptsRes.data) {
        setVoicePrompts(promptsRes.data.filter(p => p.category === 'voice'));
        setVideoPrompts(promptsRes.data.filter(p => p.category === 'video'));
      }

      const voiceApiKey = settingsRes.data?.voice_api_key;
      if (voiceApiKey) {
        try {
          const { data: voiceData, error: voiceError } = await supabase.functions.invoke('proxy-voice-api', {
            body: { path: 'v1m/voice/clone', token: voiceApiKey, method: 'GET' }
          });
          if (voiceError) throw voiceError;
          if (voiceData.success) setClonedVoices(voiceData.data || []);
          else throw new Error(voiceData.error || 'Failed to fetch cloned voices');
        } catch (error) {
          showError(`Không thể tải danh sách giọng nói: ${error.message}`);
          setClonedVoices([]);
        }
      }
      setLoadingExtra(false);
    };

    fetchInitialData();
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

  const renderVoicePromptSection = () => (
    <>
      <div className="flex items-center justify-between p-2 bg-gray-100 rounded-md">
        <Label htmlFor="switch-useLibraryPromptForVoice" className="font-semibold cursor-pointer">Sử dụng Prompt từ thư viện</Label>
        <Switch
          id="switch-useLibraryPromptForVoice"
          checked={!!config.useLibraryPromptForVoice}
          onCheckedChange={(checked) => handleUseLibraryToggle('useLibraryPromptForVoice', 'voicePromptId', checked)}
        />
      </div>
      {config.useLibraryPromptForVoice && (
        <div className="space-y-2">
          <Label>Chọn Prompt từ thư viện</Label>
          <Select
            value={config.voicePromptId || undefined}
            onValueChange={(value) => handlePromptSelect('voicePromptId', 'voiceScriptTemplate', value, voicePrompts)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn một mẫu prompt..." />
            </SelectTrigger>
            <SelectContent>
              {voicePrompts.length > 0 ? (
                voicePrompts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
              ) : (
                <div className="p-4 text-center text-sm text-gray-500">Không có prompt nào.</div>
              )}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="voiceScriptTemplate">Mẫu Prompt Kịch Bản Voice</Label>
        <Textarea
          id="voiceScriptTemplate"
          value={config.voiceScriptTemplate}
          onChange={(e) => handleConfigChange('voiceScriptTemplate', e.target.value)}
          className="min-h-[150px] font-mono text-sm"
          readOnly={!!config.useLibraryPromptForVoice}
        />
        <VariablesList variables={['product_name', 'product_description']} />
      </div>
    </>
  );

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
          <Tabs defaultValue="video_script" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="video_script">1. Prompt tạo Ảnh / Video</TabsTrigger>
              <TabsTrigger value="voice">2. Tạo Voice</TabsTrigger>
            </TabsList>
            <div className="mt-4 max-h-[60vh] overflow-y-auto p-1">
              <TabsContent value="video_script" className="space-y-4">
                <div className="space-y-2">
                  <Label>Chọn Kịch bản Video từ Thư viện</Label>
                  <Select
                    value={config.videoScriptId || undefined}
                    onValueChange={(value) => handleConfigChange('videoScriptId', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn một kịch bản video..." />
                    </SelectTrigger>
                    <SelectContent>
                      {videoPrompts.length > 0 ? (
                        videoPrompts.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
                      ) : (
                        <div className="p-4 text-center text-sm text-gray-500">Không có kịch bản video nào.</div>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">Kịch bản này chứa các cặp prompt tạo ảnh và video. Bạn có thể tạo mới trong Thư viện Prompt.</p>
                </div>
                <div className="space-y-2">
                  <Label>Thời lượng video (giây)</Label>
                  <RadioGroup
                      value={String(config.videoDuration)}
                      onValueChange={(value) => handleConfigChange('videoDuration', Number(value))}
                      className="flex items-center gap-4 pt-1"
                  >
                      <div className="flex items-center space-x-2">
                          <RadioGroupItem value="5" id="duration-5" />
                          <Label htmlFor="duration-5" className="cursor-pointer">5 giây</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                          <RadioGroupItem value="10" id="duration-10" />
                          <Label htmlFor="duration-10" className="cursor-pointer">10 giây</Label>
                      </div>
                  </RadioGroup>
                </div>
              </TabsContent>
              <TabsContent value="voice" className="space-y-4">
                <div className="flex items-center space-x-2 p-2 bg-gray-100 rounded-md">
                  <Switch
                    id="voice-enabled-switch"
                    checked={config.isVoiceEnabled}
                    onCheckedChange={(checked) => handleConfigChange('isVoiceEnabled', checked)}
                  />
                  <Label htmlFor="voice-enabled-switch" className="cursor-pointer font-semibold">
                    Kích hoạt tạo Voice cho Automation
                  </Label>
                </div>
                <div className={`space-y-4 transition-opacity ${!config.isVoiceEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                  {renderVoicePromptSection()}
                  <div className="space-y-2">
                    <Label htmlFor="voiceId">Giọng nói mặc định cho kênh</Label>
                    <Select value={config.voiceId || undefined} onValueChange={(value) => handleConfigChange('voiceId', value)} disabled={loadingExtra}>
                      <SelectTrigger id="voiceId">
                        <SelectValue placeholder={loadingExtra ? "Đang tải giọng nói..." : "Chọn một giọng nói..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingExtra ? (
                          <div className="flex items-center justify-center p-4">
                            <Loader2 className="w-4 h-4 animate-spin" />
                          </div>
                        ) : clonedVoices.length > 0 ? (
                          clonedVoices.map((voice: any) => (
                            <SelectItem key={voice.voice_id} value={voice.voice_id}>{voice.voice_name}</SelectItem>
                          ))
                        ) : (
                          <div className="p-4 text-center text-sm text-gray-500">Không có giọng nói clone nào.</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
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