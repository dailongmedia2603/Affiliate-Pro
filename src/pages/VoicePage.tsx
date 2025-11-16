import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Search, PlusCircle, Loader2, Download, History, Mic, Wand2, XCircle } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type Voice = {
  voice_id: string;
  name: string;
  preview_url: string;
  category: 'premade' | 'cloned';
  labels: Record<string, string>;
};

const VoicePage = () => {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voiceApiKey, setVoiceApiKey] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const [text, setText] = useState('Xin chào, đây là một thử nghiệm tạo giọng nói bằng trí tuệ nhân tạo.');
  const [stability, setStability] = useState(50);
  const [clarity, setClarity] = useState(75);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('user_settings')
          .select('voice_api_key')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          showError('Không thể tải cài đặt API key.');
          setConnectionStatus('error');
        }
        if (data && data.voice_api_key) {
          setVoiceApiKey(data.voice_api_key);
          setConnectionStatus('success');
        } else {
          setConnectionStatus('error');
        }
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (connectionStatus === 'success' && voiceApiKey) {
      fetchVoices();
    }
  }, [connectionStatus, voiceApiKey]);

  const fetchVoices = async () => {
    setLoadingVoices(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: 'voices', token: voiceApiKey, method: 'GET' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setVoices(data.voices || []);
      if (data.voices && data.voices.length > 0) {
        setSelectedVoice(data.voices[0]);
      }
    } catch (error) {
      showError(`Không thể tải danh sách giọng nói: ${error.message}`);
    } finally {
      setLoadingVoices(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedVoice || !text || !voiceApiKey) {
      showError('Vui lòng chọn giọng nói và nhập văn bản.');
      return;
    }
    setIsGenerating(true);
    setGeneratedAudioUrl(null);
    const toastId = showLoading('Đang tạo âm thanh...');

    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: {
          path: `text-to-speech/${selectedVoice.voice_id}`,
          token: voiceApiKey,
          method: 'POST',
          body: {
            text: text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: stability / 100,
              similarity_boost: clarity / 100,
            },
          },
        },
      });

      if (error) throw error;

      if (!(data instanceof Blob)) {
        throw new Error(data.error || 'Phản hồi không hợp lệ từ server.');
      }
      
      const audioUrl = URL.createObjectURL(data);
      setGeneratedAudioUrl(audioUrl);
      showSuccess('Tạo âm thanh thành công!');
    } catch (error) {
      let errorMessage = error.message;
      try {
        const parsedError = JSON.parse(errorMessage);
        if (parsedError.error) errorMessage = parsedError.error;
      } catch (e) { /* Not JSON */ }
      showError(`Lỗi khi tạo âm thanh: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
      dismissToast(toastId);
    }
  };

  const filteredVoices = useMemo(() => voices.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase())), [voices, searchTerm]);

  if (connectionStatus === 'error') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-4 text-center">
        <XCircle className="w-16 h-16 text-red-500" />
        <h2 className="text-2xl font-bold text-gray-800">Lỗi kết nối API Voice</h2>
        <p className="text-gray-600 max-w-md">
          Không tìm thấy API Key. Vui lòng đi đến trang Cài đặt, nhập API Key và đảm bảo kết nối thành công trước khi sử dụng tính năng này.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex p-6 gap-6 bg-gray-50/50">
      <div className="w-[400px] bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-800">Giọng nói</h2>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" disabled><PlusCircle className="w-4 h-4 mr-2" />Thêm giọng (Clone)</Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input type="text" placeholder="Tìm kiếm giọng nói..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingVoices ? (
            <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
          ) : filteredVoices.length > 0 ? (
            filteredVoices.map(voice => (
              <button key={voice.voice_id} onClick={() => setSelectedVoice(voice)} className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-4 ${selectedVoice?.voice_id === voice.voice_id ? 'bg-orange-100' : 'hover:bg-gray-100'}`}>
                <Avatar><AvatarImage src={voice.labels.avatar} /><AvatarFallback>{voice.name.charAt(0)}</AvatarFallback></Avatar>
                <div className="flex-1 truncate">
                  <p className="font-semibold text-gray-800">{voice.name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                    <Badge variant={voice.category === 'premade' ? 'secondary' : 'outline'}>{voice.category === 'premade' ? 'Có sẵn' : 'Cloned'}</Badge>
                    {voice.labels.accent && <Badge variant="outline">{voice.labels.accent}</Badge>}
                    {voice.labels.gender && <Badge variant="outline">{voice.labels.gender}</Badge>}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="text-center text-gray-500 p-4">Không tìm thấy giọng nói.</p>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {selectedVoice ? (
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-3 text-2xl"><Mic className="w-8 h-8 text-orange-500" /><span>Tạo giọng nói</span></CardTitle><CardDescription>Nhập văn bản và điều chỉnh cài đặt để tạo âm thanh.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  <div><Label htmlFor="text-input" className="text-base font-semibold">Văn bản</Label><Textarea id="text-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhập văn bản của bạn ở đây..." className="mt-2 min-h-[150px] text-base" /></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="flex justify-between items-center mb-2"><Label htmlFor="stability" className="font-semibold">Độ ổn định</Label><span className="text-sm font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded">{stability}%</span></div>
                      <Slider id="stability" value={[stability]} onValueChange={(val) => setStability(val[0])} max={100} step={1} />
                      <p className="text-xs text-gray-500 mt-1">Tăng để giọng nói đều đặn hơn, giảm để tăng biểu cảm.</p>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2"><Label htmlFor="clarity" className="font-semibold">Độ rõ ràng + Tương đồng</Label><span className="text-sm font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded">{clarity}%</span></div>
                      <Slider id="clarity" value={[clarity]} onValueChange={(val) => setClarity(val[0])} max={100} step={1} />
                      <p className="text-xs text-gray-500 mt-1">Tăng để giọng nói rõ ràng và giống với giọng gốc hơn.</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-4 pt-4 border-t">
                    <Button size="lg" onClick={handleGenerate} disabled={isGenerating || !text} className="w-full max-w-xs bg-orange-500 hover:bg-orange-600 text-white text-base font-bold py-6">
                      {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}Tạo âm thanh
                    </Button>
                    {generatedAudioUrl && (
                      <div className="w-full p-4 bg-gray-100 rounded-lg flex items-center gap-4">
                        <audio controls src={generatedAudioUrl} className="w-full">Trình duyệt không hỗ trợ.</audio>
                        <a href={generatedAudioUrl} download={`voice_${selectedVoice.name}_${Date.now()}.mp3`}><Button variant="outline" size="icon"><Download className="w-5 h-5" /></Button></a>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-3 text-xl"><History className="w-6 h-6 text-gray-600" /><span>Lịch sử</span></CardTitle></CardHeader>
                <CardContent><div className="text-center py-10 border-2 border-dashed rounded-lg"><p className="text-gray-500">Tính năng lịch sử đang được phát triển.</p></div></CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <Mic className="w-16 h-16 mb-4" />
              <h3 className="text-xl font-semibold">{loadingVoices ? 'Đang tải danh sách giọng nói...' : 'Chọn một giọng nói'}</h3>
              <p>{loadingVoices ? 'Vui lòng chờ trong giây lát.' : 'Chọn một giọng nói từ danh sách bên trái để bắt đầu.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoicePage;