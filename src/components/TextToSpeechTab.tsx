import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Loader2, Wand2, RefreshCw } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import VoiceCard from './VoiceCard';
import TaskItem from './TaskItem';

const TextToSpeechTab = ({ apiKey }) => {
  const [text, setText] = useState('Chào bạn, đây là một thử nghiệm chuyển văn bản thành giọng nói.');
  const [clonedVoices, setClonedVoices] = useState([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [settings, setSettings] = useState({ vol: 1, pitch: 0, speed: 1 });

  const fetchVoices = useCallback(async () => {
    setIsLoadingVoices(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', { body: { path: 'v1m/voice/clone', token: apiKey, method: 'GET' } });
      
      if (error) throw error;
      if (data.success) {
        setClonedVoices(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch cloned voices');
      }
    } catch (error) {
      showError(`Lỗi tải danh sách giọng nói: ${error.message}`);
    } finally {
      setIsLoadingVoices(false);
    }
  }, [apiKey]);

  const fetchTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: 'v1/tasks?limit=20&type=minimax_tts', token: apiKey, method: 'GET' }
      });
      if (error) throw error;
      if (data.success) setTasks(data.data);
      else throw new Error(data.error || 'Failed to fetch tasks');
    } catch (error) {
      showError(`Lỗi tải danh sách tác vụ: ${error.message}`);
    } finally {
      setIsLoadingTasks(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchVoices();
    fetchTasks();
  }, [fetchVoices, fetchTasks]);

  useEffect(() => {
    const pendingTasks = tasks.filter(t => t.status === 'doing');
    if (pendingTasks.length === 0) return;

    const interval = setInterval(async () => {
      let changed = false;
      const updatedTasks = [...tasks];
      for (let i = 0; i < updatedTasks.length; i++) {
        if (updatedTasks[i].status === 'doing') {
          const { data } = await supabase.functions.invoke('proxy-voice-api', {
            body: { path: `v1/task/${updatedTasks[i].id}`, token: apiKey, method: 'GET' }
          });
          if (data && data.status !== 'doing') {
            updatedTasks[i] = data;
            changed = true;
          }
        }
      }
      if (changed) setTasks(updatedTasks);
    }, 5000);

    return () => clearInterval(interval);
  }, [tasks, apiKey]);

  const handleGenerate = async () => {
    if (!text || !selectedVoiceId) {
      showError('Vui lòng nhập văn bản và chọn một giọng nói.');
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: {
          path: 'v1m/task/text-to-speech',
          token: apiKey,
          method: 'POST',
          body: {
            text,
            model: 'speech-2.5-hd-preview',
            voice_setting: { voice_id: selectedVoiceId, ...settings },
          }
        }
      });
      if (error) throw error;
      if (data.success) {
        showSuccess('Đã gửi yêu cầu tạo voice. Vui lòng chờ trong giây lát.');
        setTimeout(fetchTasks, 2000);
      } else {
        throw new Error(data.error || 'Failed to generate speech');
      }
    } catch (error) {
      showError(`Lỗi tạo voice: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const allVoices = clonedVoices.map(v => ({...v, isCloned: true}));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader><CardTitle>1. Nhập nội dung</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder="Nhập văn bản cần chuyển đổi..." value={text} onChange={e => setText(e.target.value)} className="min-h-[150px] text-base" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>2. Chọn giọng nói</CardTitle></CardHeader>
          <CardContent>
            {isLoadingVoices ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div> : allVoices.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[400px] overflow-y-auto p-1">
                {allVoices.map(voice => (
                  <VoiceCard key={voice.voice_id} voice={voice} isSelected={selectedVoiceId === voice.voice_id} onSelect={() => setSelectedVoiceId(voice.voice_id)} />
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 pt-8">Bạn chưa có giọng nói clone nào. Hãy qua tab "Clone Voice" để tạo.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>3. Tùy chỉnh & Tạo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-6">
              <div><Label>Volume: {settings.vol.toFixed(1)}</Label><Slider value={[settings.vol]} onValueChange={([v]) => setSettings(s => ({...s, vol: v}))} min={0.5} max={2} step={0.1} /></div>
              <div><Label>Pitch: {settings.pitch}</Label><Slider value={[settings.pitch]} onValueChange={([v]) => setSettings(s => ({...s, pitch: v}))} min={-12} max={12} step={1} /></div>
              <div><Label>Speed: {settings.speed.toFixed(1)}</Label><Slider value={[settings.speed]} onValueChange={([v]) => setSettings(s => ({...s, speed: v}))} min={0.5} max={2} step={0.1} /></div>
            </div>
            <Button onClick={handleGenerate} disabled={isGenerating || !text || !selectedVoiceId} size="lg" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
              Tạo Voice Ngay
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card className="lg:col-span-1 flex flex-col">
        <CardHeader className="flex-row justify-between items-center">
          <CardTitle>Lịch sử tạo</CardTitle>
          <Button variant="ghost" size="icon" onClick={fetchTasks} disabled={isLoadingTasks}><RefreshCw className={`w-4 h-4 ${isLoadingTasks ? 'animate-spin' : ''}`} /></Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto space-y-3">
          {isLoadingTasks ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div> : tasks.length > 0 ? (
            tasks.map(task => <TaskItem key={task.id} task={task} apiKey={apiKey} onTaskDeleted={fetchTasks} />)
          ) : (
            <p className="text-center text-gray-500 pt-8">Chưa có tác vụ nào.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TextToSpeechTab;