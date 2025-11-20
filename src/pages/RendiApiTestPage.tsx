import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, Video, X, AlertTriangle, CheckCircle, FileAudio, Film } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';

type MediaFile = {
  file: File;
  type: 'video' | 'image' | 'audio';
  previewUrl: string;
};

type RendiTask = {
  id: string;
  rendi_command_id: string;
  status: string;
  output_files: { out_1: { storage_url: string } } | null;
  error_message: string | null;
  created_at: string;
};

const RendiApiTestPage = () => {
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [task, setTask] = useState<RendiTask | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const pollingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase.from('user_settings').select('rendi_api_key').eq('id', user.id).single();
        if (error && error.code !== 'PGRST116') {
          showError('Không thể tải cài đặt API Rendi.');
        }
        setApiKeySet(!!data?.rendi_api_key);
      } else {
        setApiKeySet(false);
      }
    };
    checkApiKey();

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

  const pollTaskStatus = (commandId: string, taskId: string) => {
    pollingIntervalRef.current = window.setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('proxy-rendi-api', {
          body: { action: 'check_status', payload: { command_id: commandId } },
        });

        if (error) throw error;

        if (data.status === 'SUCCESS' || data.status === 'FAILED') {
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          setIsProcessing(false);
          const newStatus = data.status === 'SUCCESS' ? 'completed' : 'failed';
          const updatePayload = {
            status: newStatus,
            output_files: data.output_files,
            error_message: data.error_message,
          };
          const { data: updatedTask, error: updateError } = await supabase.from('rendi_tasks').update(updatePayload).eq('id', taskId).select().single();
          if (updateError) throw updateError;
          setTask(updatedTask);
          if (newStatus === 'completed') showSuccess('Video đã được render thành công!');
          else showError(`Render video thất bại: ${data.error_message}`);
        } else {
          await supabase.from('rendi_tasks').update({ status: data.status }).eq('id', taskId);
          setTask(prev => prev ? { ...prev, status: data.status } : null);
        }
      } catch (err) {
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        setIsProcessing(false);
        showError(`Lỗi khi kiểm tra trạng thái: ${err.message}`);
        await supabase.from('rendi_tasks').update({ status: 'failed', error_message: err.message }).eq('id', taskId);
      }
    }, 10000);
  };

  const handleMerge = async () => {
    const videosAndImages = mediaFiles.filter(f => f.type === 'video' || f.type === 'image');
    const audioFile = mediaFiles.find(f => f.type === 'audio');

    if (videosAndImages.length === 0) {
      showError('Vui lòng chọn ít nhất một video hoặc hình ảnh.');
      return;
    }

    setIsProcessing(true);
    const loadingToast = showLoading('Đang tải file lên...');

    try {
      const uploadPromises = mediaFiles.map(mf => uploadFile(mf.file));
      const urls = await Promise.all(uploadPromises);
      dismissToast(loadingToast);
      showLoading('Đã tải lên. Đang gửi yêu cầu render...');

      const input_files: { [key: string]: string } = {};
      let filter_complex = '';
      let lastVideoOutput = '';
      const ffmpeg_commands: string[] = [];

      const videoInputs = videosAndImages.map((mf, i) => {
        const alias = `in_${i + 1}`;
        input_files[alias] = urls[mediaFiles.indexOf(mf)];
        return `[${i}:v]`;
      });

      // Command 1: Concatenate all videos/images
      filter_complex = `${videoInputs.join('')}concat=n=${videosAndImages.length}:v=1:a=0[v]`;
      ffmpeg_commands.push(`-filter_complex "${filter_complex}" -map "[v]" {{out_intermediate_video}}`);
      
      // Command 2: Add audio if present
      if (audioFile) {
        const audioAlias = `in_audio`;
        input_files[audioAlias] = urls[mediaFiles.indexOf(audioFile)];
        ffmpeg_commands.push(`-i {{out_intermediate_video}} -i {{${audioAlias}}} -c:v copy -c:a aac -shortest {{out_1}}`);
        lastVideoOutput = 'out_1';
      } else {
        ffmpeg_commands.push(`-i {{out_intermediate_video}} -c copy {{out_1}}`);
        lastVideoOutput = 'out_1';
      }

      const payload = {
        input_files,
        output_files: { out_intermediate_video: 'intermediate.mp4', out_1: 'final_output.mp4' },
        ffmpeg_commands,
      };

      const { data: { user } } = await supabase.auth.getUser();
      const { data: dbTask, error: dbError } = await supabase.from('rendi_tasks').insert({ user_id: user!.id, status: 'QUEUED' }).select().single();
      if (dbError) throw dbError;
      setTask(dbTask);

      const { data: rendiData, error: rendiError } = await supabase.functions.invoke('proxy-rendi-api', {
        body: { action: 'run_chained_commands', payload },
      });

      if (rendiError || rendiData.error) throw new Error(rendiError?.message || rendiData.error);
      
      await supabase.from('rendi_tasks').update({ rendi_command_id: rendiData.command_id, status: 'QUEUED' }).eq('id', dbTask.id);
      setTask(prev => prev ? { ...prev, rendi_command_id: rendiData.command_id, status: 'QUEUED' } : null);
      
      dismissToast(loadingToast);
      showSuccess('Đã gửi yêu cầu render. Đang xử lý...');
      pollTaskStatus(rendiData.command_id, dbTask.id);

    } catch (err) {
      dismissToast(loadingToast);
      showError(`Thao tác thất bại: ${err.message}`);
      setIsProcessing(false);
    }
  };

  if (apiKeySet === null) {
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
            <CardTitle>1. Tải lên Media</CardTitle>
            <CardDescription>Chọn các file video, hình ảnh và một file âm thanh (tùy chọn) để ghép.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="file-upload" className="cursor-pointer inline-block">Chọn Video/Ảnh/Audio</Label>
                <Input id="file-upload" type="file" multiple accept="video/*,image/*,audio/*" onChange={handleFileChange} className="mt-2" />
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto p-2 border rounded-md bg-gray-50">
                {mediaFiles.length === 0 ? (
                  <p className="text-sm text-center text-gray-500 py-4">Chưa có file nào được chọn.</p>
                ) : (
                  mediaFiles.map((mf, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-white border rounded-md">
                      <div className="flex items-center gap-3">
                        {mf.type === 'image' && <img src={mf.previewUrl} className="w-12 h-12 object-cover rounded-md" />}
                        {mf.type === 'video' && <video src={mf.previewUrl} className="w-12 h-12 object-cover rounded-md bg-black" />}
                        {mf.type === 'audio' && <div className="w-12 h-12 flex items-center justify-center bg-gray-200 rounded-md"><FileAudio className="w-6 h-6 text-gray-600" /></div>}
                        <span className="text-sm font-medium truncate w-48" title={mf.file.name}>{mf.file.name}</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeFile(index)}><X className="w-4 h-4" /></Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Xử lý và Kết quả</CardTitle>
            <CardDescription>Bắt đầu quá trình ghép nối và xem kết quả tại đây.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleMerge} disabled={isProcessing || mediaFiles.length === 0} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
              Ghép Video
            </Button>
            {task && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold">Trạng thái tác vụ</h3>
                <div className="flex items-center gap-2 p-3 border rounded-md bg-gray-50">
                  {task.status === 'completed' && <CheckCircle className="w-5 h-5 text-green-500" />}
                  {task.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                  {(task.status !== 'completed' && task.status !== 'failed') && <Loader2 className="w-5 h-5 animate-spin text-blue-500" />}
                  <span className="font-mono text-sm">{task.status}</span>
                </div>
                {task.status === 'completed' && task.output_files?.out_1?.storage_url && (
                  <div>
                    <h3 className="font-semibold mb-2">Video kết quả:</h3>
                    <video src={task.output_files.out_1.storage_url} controls className="w-full rounded-lg border" />
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