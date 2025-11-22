import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, Video, X, AlertTriangle, CheckCircle, FileAudio, Film, XCircle, Wand } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type MediaFile = {
  file: File;
  type: 'video' | 'image' | 'audio';
  previewUrl: string;
};

type RendiTask = {
  id: string;
  rendi_command_id: string;
  status: string;
  output_files: { [key: string]: { storage_url: string } } | null;
  error_message: string | null;
  created_at: string;
};

const transitions = [
    { value: 'fade', label: 'Mờ dần (Fade)' },
    { value: 'wipeleft', label: 'Quét Trái (Wipe Left)' },
    { value: 'wiperight', label: 'Quét Phải (Wipe Right)' },
    { value: 'wipeup', label: 'Quét Lên (Wipe Up)' },
    { value: 'wipedown', label: 'Quét Xuống (Wipe Down)' },
    { value: 'slideleft', label: 'Trượt Trái (Slide Left)' },
    { value: 'slideright', label: 'Trượt Phải (Slide Right)' },
    { value: 'slideup', label: 'Trượt Lên (Slide Up)' },
    { value: 'slidedown', label: 'Trượt Xuống (Slide Down)' },
    { value: 'circlecrop', label: 'Cắt Tròn (Circle Crop)' },
    { value: 'rectcrop', label: 'Cắt Chữ Nhật (Rect Crop)' },
    { value: 'distance', label: 'Khoảng Cách (Distance)' },
    { value: 'radial', label: 'Tỏa Tròn (Radial)' },
    { value: 'smoothleft', label: 'Mượt Trái (Smooth Left)' },
    { value: 'dissolve', label: 'Hòa Tan (Dissolve)' },
    { value: 'pixelize', label: 'Điểm Ảnh (Pixelize)' },
    { value: 'diagtl', label: 'Chéo Trên Trái (Diagonal TL)' },
    { value: 'diagtr', label: 'Chéo Trên Phải (Diagonal TR)' },
    { value: 'diagbl', label: 'Chéo Dưới Trái (Diagonal BL)' },
    { value: 'diagbr', label: 'Chéo Dưới Phải (Diagonal BR)' },
];

const RendiApiTestPage = () => {
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [task, setTask] = useState<RendiTask | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pollingIntervalRef = useRef<number | null>(null);
  
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [transition, setTransition] = useState<string>('fade');
  const [transitionDuration, setTransitionDuration] = useState<number>(1);
  const [clipDuration, setClipDuration] = useState<number>(3);

  const pollTaskStatus = (commandId: string, taskId: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('proxy-rendi-api', {
          body: { action: 'check_status', payload: { command_id: commandId } },
        });

        if (error) throw error;

        const newApiStatus = data.status;
        if (newApiStatus === 'SUCCESS' || newApiStatus === 'FAILED') {
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          setIsProcessing(false);
          const newDbStatus = newApiStatus === 'SUCCESS' ? 'completed' : 'failed';
          const updatePayload = {
            status: newDbStatus,
            output_files: data.output_files,
            error_message: data.error_message,
          };
          const { data: updatedTask, error: updateError } = await supabase.from('rendi_tasks').update(updatePayload).eq('id', taskId).select().single();
          if (updateError) throw updateError;
          setTask(updatedTask);
          if (newDbStatus === 'completed') showSuccess('Video đã được render thành công!');
          else showError(`Render video thất bại: ${data.error_message}`);
        } else {
          setTask(prev => prev && prev.id === taskId ? { ...prev, status: newApiStatus } : prev);
        }
      } catch (err) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setIsProcessing(false);
        showError(`Lỗi khi kiểm tra trạng thái: ${err.message}`);
        setTask(prev => prev && prev.id === taskId ? { ...prev, status: 'failed', error_message: err.message } : prev);
      }
    }, 10000);
  };

  useEffect(() => {
    const checkApiKeyAndFetchTask = async () => {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: settings, error: settingsError } = await supabase.from('user_settings').select('rendi_api_key').eq('id', user.id).single();
        const isKeySet = !!settings?.rendi_api_key;
        setApiKeySet(isKeySet);

        if (isKeySet) {
          const { data: latestTask, error: taskError } = await supabase
            .from('rendi_tasks')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['QUEUED', 'PROCESSING', 'PREPARED_FFMPEG_COMMAND', 'INITIALIZING', 'UPLOADING', 'BUILDING_COMMAND'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (latestTask && !taskError) {
            setTask(latestTask);
            setIsProcessing(true);
            if (latestTask.rendi_command_id) {
              pollTaskStatus(latestTask.rendi_command_id, latestTask.id);
            }
          }
        }
      } else {
        setApiKeySet(false);
      }
      setIsLoading(false);
    };

    checkApiKeyAndFetchTask();

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newMediaFiles: MediaFile[] = Array.from(files).map(file => {
      let type: 'video' | 'image' | 'audio' = 'video';
      if (file.type.startsWith('image/')) type = 'image';
      if (file.type.startsWith('audio/')) type = 'audio';
      return { file, type, previewUrl: URL.createObjectURL(file) };
    });

    setMediaFiles(prev => [...prev, ...newMediaFiles]);
  };

  const removeFile = (index: number) => {
    const fileToRemove = mediaFiles[index];
    URL.revokeObjectURL(fileToRemove.previewUrl);
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (file: File): Promise<string> => {
    const fileData = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });

    const { data, error } = await supabase.functions.invoke('upload-image-to-r2', {
      body: { fileName: `${Date.now()}_${file.name}`, fileType: file.type, fileData },
    });

    if (error || data.error) throw new Error(error?.message || data.error);
    return data.url;
  };

  const handleMerge = async () => {
    const videosAndImages = mediaFiles.filter(f => f.type === 'video' || f.type === 'image');
    const audioFile = mediaFiles.find(f => f.type === 'audio');

    if (videosAndImages.length === 0) {
      showError('Vui lòng chọn ít nhất một video hoặc hình ảnh.');
      return;
    }

    if (isAdvancedMode) {
        showError("Chế độ nâng cao yêu cầu gói Rendi trả phí. Vui lòng sử dụng chế độ ghép nối đơn giản hoặc nâng cấp tài khoản của bạn.");
        return;
    }

    setIsProcessing(true);
    setTask(null);
    let loadingToast = showLoading('Đang chuẩn bị tác vụ...');
    let dbTask: RendiTask | null = null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated.");
      
      const { data: newDbTask, error: dbError } = await supabase.from('rendi_tasks').insert({ user_id: user.id, status: 'INITIALIZING' }).select().single();
      if (dbError) throw dbError;
      dbTask = newDbTask;
      setTask(dbTask);

      dismissToast(loadingToast);
      loadingToast = showLoading('Đang tải file lên...');
      const urls = await Promise.all(mediaFiles.map(mf => uploadFile(mf.file)));
      
      await supabase.from('rendi_tasks').update({ status: 'BUILDING_COMMAND' }).eq('id', dbTask.id);
      setTask(prev => prev ? { ...prev, status: 'BUILDING_COMMAND' } : null);

      dismissToast(loadingToast);
      loadingToast = showLoading('Đang xây dựng và gửi lệnh render...');

      const input_files: { [key: string]: string } = {};
      const output_files: { [key: string]: string } = { 'output': 'final_output.mp4' };
      
      mediaFiles.forEach((mf, i) => {
          input_files[`in_${i}`] = urls[i];
      });

      // SIMPLE MODE - SINGLE COMMAND
      const videoInputStreams = videosAndImages.map((mf) => {
          const inputIndex = mediaFiles.indexOf(mf);
          return `[${inputIndex}:v:0]`;
      }).join('');

      let filter_complex = `"${videoInputStreams}concat=n=${videosAndImages.length}:v=1:a=0[v]"`;
      let map_args = `-map "[v]"`;

      if (audioFile) {
          const audioInputIndex = mediaFiles.indexOf(audioFile);
          map_args += ` -map ${audioInputIndex}:a:0`;
      }

      const ffmpeg_command = `-filter_complex ${filter_complex} ${map_args} -c:v libx264 -c:a aac -shortest {{output}}`;
      
      const payload = { input_files, output_files, ffmpeg_command };

      const { data: rendiData, error: rendiError } = await supabase.functions.invoke('proxy-rendi-api', { body: { action: 'run_command', payload } });
      if (rendiError || rendiData.error) throw new Error(rendiError?.message || rendiData.error);
      if (!rendiData.command_id) throw new Error("Rendi API did not return a command_id.");
      
      const { data: updatedTask, error: updateError } = await supabase.from('rendi_tasks').update({ rendi_command_id: rendiData.command_id, status: 'QUEUED' }).eq('id', dbTask.id).select().single();
      if (updateError) throw updateError;
      setTask(updatedTask);
      
      dismissToast(loadingToast);
      showSuccess('Đã gửi yêu cầu render. Đang xử lý...');
      pollTaskStatus(rendiData.command_id, dbTask.id);

    } catch (err) {
      dismissToast(loadingToast);
      showError(`Thao tác thất bại: ${err.message}`);
      setIsProcessing(false);
      if (dbTask) {
        await supabase.from('rendi_tasks').update({ status: 'failed', error_message: err.message }).eq('id', dbTask.id);
        setTask(prev => prev ? { ...prev, status: 'failed', error_message: err.message } : null);
      }
    }
  };

  const finalOutputUrl = task?.status === 'completed' ? Object.values(task.output_files || {}).find(f => f.storage_url.includes('final_output'))?.storage_url : null;

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  }

  if (!apiKeySet) {
    return (
      <div className="w-full h-full p-6 bg-gray-50/50 flex items-center justify-center">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Chưa cấu hình API Rendi</AlertTitle>
          <AlertDescription>Vui lòng vào trang Cài đặt và thêm API Key cho dịch vụ Rendi để sử dụng tính năng này.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="w-full p-6 bg-gray-50/50 space-y-6">
      <div className="flex items-center gap-3">
        <Film className="w-7 h-7 text-orange-500" />
        <h1 className="text-2xl font-bold text-gray-800">Ffmpeg Rendi - Kiểm thử API</h1>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Tải lên & Cấu hình</CardTitle>
            <CardDescription>Chọn file, hiệu ứng và thời lượng. Video sẽ giữ thời lượng gốc.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="file-upload" className="cursor-pointer inline-block mb-2">Chọn Video/Ảnh/Audio</Label>
              <Input id="file-upload" type="file" multiple accept="video/*,image/*,audio/*" onChange={handleFileChange} />
              <div className="mt-4 space-y-2 max-h-60 overflow-y-auto p-2 border rounded-md bg-gray-50">
                {mediaFiles.length === 0 ? (
                  <p className="text-sm text-center text-gray-500 py-4">Chưa có file nào được chọn.</p>
                ) : (
                  mediaFiles.map((mf, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-white border rounded-md">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {mf.type === 'image' && <img src={mf.previewUrl} className="w-12 h-12 object-cover rounded-md flex-shrink-0" />}
                        {mf.type === 'video' && <video src={mf.previewUrl} className="w-12 h-12 object-cover rounded-md bg-black flex-shrink-0" />}
                        {mf.type === 'audio' && <div className="w-12 h-12 flex items-center justify-center bg-gray-200 rounded-md flex-shrink-0"><FileAudio className="w-6 h-6 text-gray-600" /></div>}
                        <span className="text-sm font-medium truncate" title={mf.file.name}>{mf.file.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeFile(index)}><X className="w-4 h-4" /></Button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2 pt-4 border-t">
                <Switch id="advanced-mode" checked={isAdvancedMode} onCheckedChange={setIsAdvancedMode} />
                <Label htmlFor="advanced-mode">Kích hoạt tùy chọn nâng cao (chuyển cảnh, thời lượng)</Label>
            </div>
            {isAdvancedMode && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="clip-duration">Thời lượng cho ảnh (s)</Label>
                        <Input id="clip-duration" type="number" value={clipDuration} onChange={e => setClipDuration(Number(e.target.value))} min="1" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="transition-duration">Thời lượng chuyển cảnh (s)</Label>
                        <Input id="transition-duration" type="number" value={transitionDuration} onChange={e => setTransitionDuration(Number(e.target.value))} min="0.1" step="0.1" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="transition-effect">Hiệu ứng chuyển cảnh</Label>
                        <Select value={transition} onValueChange={setTransition}>
                            <SelectTrigger id="transition-effect"><SelectValue placeholder="Chọn hiệu ứng" /></SelectTrigger>
                            <SelectContent>
                                {transitions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Xử lý và Kết quả</CardTitle>
            <CardDescription>Bắt đầu quá trình ghép nối và xem kết quả tại đây.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleMerge} disabled={isProcessing || mediaFiles.length === 0} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand className="mr-2 h-4 w-4" />}
              {isAdvancedMode ? 'Ghép & Áp dụng hiệu ứng' : 'Ghép Nối Đơn Giản'}
            </Button>
            {task && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold">Trạng thái tác vụ</h3>
                <div className="flex items-center gap-2 p-3 border rounded-md bg-gray-50">
                  {task.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                  {task.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                  {(!['completed', 'failed'].includes(task.status)) && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
                  <span className="font-mono text-sm">{task.status}</span>
                </div>
                {finalOutputUrl && (
                  <div>
                    <h3 className="font-semibold mb-2">Video kết quả:</h3>
                    <video src={finalOutputUrl} controls className="w-full rounded-lg border" />
                  </div>
                )}
                {task.status === 'failed' && task.error_message && (
                  <Alert variant="destructive">
                    <AlertTitle>Render thất bại</AlertTitle>
                    <AlertDescription>{task.error_message}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RendiApiTestPage;