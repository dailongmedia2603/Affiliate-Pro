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
  imagePromptGenerationTemplate: 'MỤC ĐÍCH SỬ DỤNG: Các ảnh này sẽ được sử dụng cho mục đích review sản phẩm {{product_name}}, các ảnh này sẽ được chuyển thành video để ghép lại với nhau vì vậy các ảnh sẽ cần phải có liên quan đến nhau, mỗi ảnh được hiểu là 1 phân cảnh để tạo ra 1 video review sản chất lượng và hiệu quả. Vì vậy prompot tạo ảnh của mỗi ảnh phải có sự liên quan với nhau và phù hợp để chuyển sang từng ảnh.\n\nVui lòng tạo chính xác {{image_count}} prompt khác nhau để tạo ảnh quảng cáo cho sản phẩm "{{product_name}}".\n\nMô tả sản phẩm: {{product_description}}.\n\nBối cảnh chung cho các ảnh là: studio background, high quality, professional lighting.\n\nKịch bản tạo ảnh: {{image_count}} ảnh này kết hợp thành 1 kịch bản review hoàn chỉnh, hình ảnh cần được thiết kế để có câu chuyện liên quan đến sản phẩm, kết hợp yếu tố và tình huống đời thường sẽ gồm các phân cảnh: \n- Ảnh 1: Hình ảnh phù hợp để bắt đầu câu chuyện (yêu cầu: người + sản phẩm + background + bối cảnh)\n- Ảnh 2: Phân cảnh tiếp theo tiếp nối với ảnh 1. Là ảnh focus vào sản phẩm, cận cảnh. (yêu cầu: Chỉ sản phẩm + background + bối cảnh)\n- Ảnh 3: Phân cảnh tiếp theo mục đích là sử dụng sản phẩm, vd như người cầm sản phẩm lên hoặc hành động sử dụng,... (yêu cầu: người + sản phẩm + background + bối cảnh)\n- Ảnh 4: Phân cảnh cuối cùng là ảnh thể hiện ứng dụng của sản phẩm vào cuộc sống đời thường, vd như sử dụng {{product_name}} trong những trường hợp thực tế trong đời thường theo các tình huống thực tế phù hợp với sản phẩm. (yêu cầu: người + sản phẩm + background + bối cảnh)\n\nNếu yêu cầu là {{image_count}} ảnh thì hãy đưa ra prompt cho {{image_count}} ảnh. Có sự hệ thống và mạch lạc giữa ảnh đầu tiên và cuối cùng từ ảnh với nội dung bắt đầu câu chuyện -> chi tiết sản phẩm -> hành động sử dụng -> sử dụng sản phẩm trong tình huống đời thường cuộc sống. Mỗi phần có thể 1 hoặc nhiều ảnh tuỳ theo số lượng ảnh tạo chứ không bắt buộc là mỗi phần là 1 ảnh, miễn sao là hợp lý\n\nYÊU CẦU CỰC KỲ QUAN TRỌNG: Mỗi prompt phải được đặt trong một cặp thẻ <prompt> và </prompt>. Ví dụ: <prompt>Một prompt mẫu.</prompt><prompt>Một prompt mẫu khác.</prompt>, đồng thời trong mỗi cặp thẻ luôn luôn phải kèm 1 câu là: "QUAN TRỌNG: Đảm bảo tuyệt đối khuôn mặt của người mẫu trong ảnh và hình sản phẩm phải luôn được chính xác không được thay đổi sang sản phẩm, người mẫu khác nhé, đặc biệt là các chi tiết nhỏ của sản phẩm". . KHÔNG thêm bất kỳ văn bản nào khác ngoài các thẻ prompt.',
  imageCount: 4,
  videoPromptGenerationTemplate: 'MỤC ĐÍCH: Tạo một prompt mô tả chuyển động (motion prompt) ngắn gọn và tinh tế để biến ảnh tĩnh thành một video ngắn. Chuyển động phải phù hợp với nội dung và cảm xúc của ảnh gốc, liên quan đến sản phẩm "{{product_name}}".\n\nBỐI CẢNH:\n- Sản phẩm: {{product_name}}\n- Mô tả sản phẩm: {{product_description}}\n- Prompt đã dùng để tạo ảnh gốc: "{{image_prompt}}"\n\nYÊU CẦU: Dựa vào các thông tin trên, hãy đề xuất một chuyển động phù hợp bằng tiếng Anh. Các chuyển động nên đơn giản và chuyên nghiệp. Ví dụ: "a slow zoom in", "a gentle pan from left to right", "subtle camera rotation clockwise", "a slight tilt up".\n\nQUAN TRỌNG: KHÔNG thêm bất kỳ lời giải thích, lời chào, hay văn bản nào khác. Chỉ trả về duy nhất một dòng prompt chuyển động.',
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
                    <PlaceholderTooltip content="Câu lệnh để yêu cầu AI tạo ra các prompt tạo ảnh." />
                  </div>
                  <Textarea id="imagePromptGenerationTemplate" value={config.imagePromptGenerationTemplate} onChange={(e) => handleConfigChange('imagePromptGenerationTemplate', e.target.value)} className="min-h-[150px] font-mono text-sm" />
                  <VariablesList variables={['product_name', 'product_description', 'image_count']} />
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
                    <PlaceholderTooltip content="Câu lệnh để yêu cầu AI tạo ra prompt mô tả chuyển động cho video." />
                  </div>
                  <Textarea id="videoPromptGenerationTemplate" value={config.videoPromptGenerationTemplate} onChange={(e) => handleConfigChange('videoPromptGenerationTemplate', e.target.value)} className="min-h-[120px] font-mono text-sm" />
                  <VariablesList variables={['image_prompt', 'product_name', 'product_description']} />
                </div>
              </TabsContent>
              <TabsContent value="voice" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <Label htmlFor="voiceScriptTemplate">Mẫu Prompt Kịch Bản Voice</Label>
                    <PlaceholderTooltip content="Câu lệnh để yêu cầu AI tạo ra kịch bản voice cho video." />
                  </div>
                  <Textarea id="voiceScriptTemplate" value={config.voiceScriptTemplate} onChange={(e) => handleConfigChange('voiceScriptTemplate', e.target.value)} className="min-h-[120px] font-mono text-sm" />
                  <VariablesList variables={['product_name', 'product_description']} />
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