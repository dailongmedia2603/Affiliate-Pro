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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';

type Prompt = {
  id: string;
  name: string;
  content: string;
  category: 'video' | 'image' | 'voice';
};

type Config = {
  imagePromptGenerationTemplate: string;
  imageCount: number;
  useLibraryPromptForImage: boolean;
  imagePromptId: string | null;

  videoPromptGenerationTemplate: string;
  useLibraryPromptForVideo: boolean;
  videoPromptId: string | null;

  voiceScriptTemplate: string;
  voiceId: string | null;
  videoDuration: number;
  isVoiceEnabled: boolean;
  useLibraryPromptForVoice: boolean;
  voicePromptId: string | null;
};

const defaultConfig: Config = {
  imagePromptGenerationTemplate: 'MỤC ĐÍCH SỬ DỤNG: Các ảnh này sẽ được sử dụng cho mục đích review sản phẩm {{product_name}}. Các ảnh này sẽ được chuyển thành video để ghép lại với nhau, vì vậy chúng cần có sự liên quan, tạo thành một câu chuyện review sản phẩm hoàn chỉnh.\n\nKỊCH BẢN TẠO ẢNH:\n- Ảnh 1: Hình ảnh bắt đầu câu chuyện (yêu cầu: người + sản phẩm + background + bối cảnh).\n- Ảnh 2: Cận cảnh, tập trung vào chi tiết sản phẩm (yêu cầu: chỉ sản phẩm + background + bối cảnh).\n- Ảnh 3: Cảnh người mẫu sử dụng sản phẩm (yêu cầu: người + sản phẩm + background + bối cảnh).\n- Ảnh 4: Cảnh ứng dụng sản phẩm vào đời sống thực tế.\n- (Tiếp tục cho đến khi đủ {{image_count}} ảnh, đảm bảo có sự mạch lạc).\n\nYÊU CẦU ĐỊNH DẠNG:\nTrả về kết quả dưới dạng một đối tượng JSON duy nhất.\nĐối tượng này phải có một khóa là "prompts", giá trị của khóa này là một mảng (array) chứa chính xác {{image_count}} chuỗi (string). Mỗi chuỗi là một prompt để tạo ảnh, tương ứng với kịch bản ở trên.\nTrong mỗi prompt, hãy thêm câu sau để đảm bảo tính nhất quán: "QUAN TRỌNG: Đảm bảo tuyệt đối khuôn mặt của người mẫu trong ảnh và hình sản phẩm phải luôn được chính xác không được thay đổi sang sản phẩm, người mẫu khác nhé, đặc biệt là các chi tiết nhỏ của sản phẩm".\n\nVÍ DỤ ĐỊNH DẠNG JSON:\n{\n  "prompts": [\n    "Prompt cho Ảnh 1...",\n    "Prompt cho Ảnh 2...",\n    "Prompt cho Ảnh 3...",\n    "Prompt cho Ảnh 4..."\n  ]\n}\n\nQUAN TRỌNG: KHÔNG thêm bất kỳ văn bản, giải thích, hay ký tự markdown nào khác ngoài đối tượng JSON này.',
  imageCount: 4,
  useLibraryPromptForImage: false,
  imagePromptId: null,

  videoPromptGenerationTemplate: 'MỤC ĐÍCH: Tạo một prompt mô tả chuyển động (motion prompt) ngắn gọn và tinh tế để biến ảnh tĩnh thành một video ngắn. Chuyển động phải phù hợp với nội dung và cảm xúc của ảnh gốc, liên quan đến sản phẩm "{{product_name}}".\n\nBỐI CẢNH:\n- Sản phẩm: {{product_name}}\n- Mô tả sản phẩm: {{product_description}}\n- Prompt đã dùng để tạo ảnh gốc: "{{image_prompt}}"\n\nYÊU CẦU: Dựa vào các thông tin trên, hãy đề xuất một chuyển động phù hợp bằng tiếng Anh. Các chuyển động nên đơn giản và chuyên nghiệp. Ví dụ: "a slow zoom in", "a gentle pan from left to right", "subtle camera rotation clockwise", "a slight tilt up".\n\nQUAN TRỌNG: KHÔNG thêm bất kỳ lời giải thích, lời chào, hay văn bản nào khác. Chỉ trả về duy nhất một dòng prompt chuyển động.',
  useLibraryPromptForVideo: false,
  videoPromptId: null,

  voiceScriptTemplate: 'Viết một kịch bản quảng cáo ngắn gọn, hấp dẫn cho sản phẩm "{{product_name}}".\nMô tả sản phẩm: {{product_description}}.\nHãy tập trung vào lợi ích và kêu gọi hành động.',
  voiceId: null,
  videoDuration: 5,
  isVoiceEnabled: true,
  useLibraryPromptForVoice: false,
  voicePromptId: null,
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
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingExtra, setLoadingExtra] = useState(false);
  const [saving, setSaving] = useState(false);

  const imagePrompts = prompts.filter(p => p.category === 'image');
  const videoPrompts = prompts.filter(p => p.category === 'video');
  const voicePrompts = prompts.filter(p => p.category === 'voice');

  const handleConfigChange = (field: keyof Config, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleUseLibraryToggle = (
    useField: 'useLibraryPromptForImage' | 'useLibraryPromptForVideo' | 'useLibraryPromptForVoice',
    idField: 'imagePromptId' | 'videoPromptId' | 'voicePromptId',
    templateField: keyof Config,
    checked: boolean
  ) => {
    setConfig(prev => {
      const updatedFields: Partial<Config> = {
        [useField]: checked,
      };
      if (!checked) {
        updatedFields[idField] = null;
      }
      return { ...prev, ...updatedFields };
    });
  };

  const handlePromptSelect = (
    idField: 'imagePromptId' | 'videoPromptId' | 'voicePromptId',
    templateField: 'imagePromptGenerationTemplate' | 'videoPromptGenerationTemplate' | 'voiceScriptTemplate',
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
        supabase.from('prompts').select('id, name, content, category').in('category', ['image', 'video', 'voice'])
      ]);

      if (configRes.data?.config_data) {
        setConfig(prev => ({ ...defaultConfig, ...configRes.data.config_data }));
      } else {
        setConfig(defaultConfig);
      }
      setLoading(false);

      if (promptsRes.data) {
        setPrompts(promptsRes.data);
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

  const renderPromptSection = (
    title: string,
    useLibraryField: 'useLibraryPromptForImage' | 'useLibraryPromptForVideo' | 'useLibraryPromptForVoice',
    idField: 'imagePromptId' | 'videoPromptId' | 'voicePromptId',
    templateField: 'imagePromptGenerationTemplate' | 'videoPromptGenerationTemplate' | 'voiceScriptTemplate',
    promptList: Prompt[],
    variables: string[]
  ) => (
    <>
      <div className="flex items-center justify-between p-2 bg-gray-100 rounded-md">
        <Label htmlFor={`switch-${useLibraryField}`} className="font-semibold cursor-pointer">Sử dụng Prompt từ thư viện</Label>
        <Switch
          id={`switch-${useLibraryField}`}
          checked={!!config[useLibraryField]}
          onCheckedChange={(checked) => handleUseLibraryToggle(useLibraryField, idField, templateField, checked)}
        />
      </div>
      {config[useLibraryField] && (
        <div className="space-y-2">
          <Label>Chọn Prompt từ thư viện</Label>
          <Select
            value={config[idField] || undefined}
            onValueChange={(value) => handlePromptSelect(idField, templateField, value, promptList)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn một mẫu prompt..." />
            </SelectTrigger>
            <SelectContent>
              {promptList.length > 0 ? (
                promptList.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
              ) : (
                <div className="p-4 text-center text-sm text-gray-500">Không có prompt nào.</div>
              )}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center">
          <Label htmlFor={templateField}>{title}</Label>
          <PlaceholderTooltip content="Câu lệnh để yêu cầu AI tạo ra nội dung." />
        </div>
        <Textarea
          id={templateField}
          value={config[templateField]}
          onChange={(e) => handleConfigChange(templateField, e.target.value)}
          className="min-h-[150px] font-mono text-sm"
          readOnly={!!config[useLibraryField]}
        />
        <VariablesList variables={variables} />
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
          <Tabs defaultValue="image" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="image">1. Tạo Ảnh</TabsTrigger>
              <TabsTrigger value="video">2. Tạo Video</TabsTrigger>
              <TabsTrigger value="voice">3. Tạo Voice</TabsTrigger>
            </TabsList>
            <div className="mt-4 max-h-[60vh] overflow-y-auto p-1">
              <TabsContent value="image" className="space-y-4">
                {renderPromptSection(
                  'Mẫu Prompt cho AI (Tạo Prompt Ảnh)',
                  'useLibraryPromptForImage',
                  'imagePromptId',
                  'imagePromptGenerationTemplate',
                  imagePrompts,
                  ['product_name', 'product_description', 'image_count']
                )}
                <div className="space-y-2">
                  <Label htmlFor="imageCount">Số lượng ảnh / sản phẩm con</Label>
                  <Input id="imageCount" type="number" min="1" max="10" value={config.imageCount} onChange={(e) => handleConfigChange('imageCount', parseInt(e.target.value, 10) || 1)} />
                </div>
              </TabsContent>
              <TabsContent value="video" className="space-y-4">
                {renderPromptSection(
                  'Mẫu Prompt cho AI (Tạo Prompt Video)',
                  'useLibraryPromptForVideo',
                  'videoPromptId',
                  'videoPromptGenerationTemplate',
                  videoPrompts,
                  ['image_prompt', 'product_name', 'product_description']
                )}
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
                  {renderPromptSection(
                    'Mẫu Prompt Kịch Bản Voice',
                    'useLibraryPromptForVoice',
                    'voicePromptId',
                    'voiceScriptTemplate',
                    voicePrompts,
                    ['product_name', 'product_description']
                  )}
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