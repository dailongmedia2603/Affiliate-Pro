import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Upload, Video, X, AlertTriangle, CheckCircle, FileAudio, Film, XCircle, Wand, Layers } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { uploadToR2 } from '@/utils/r2-upload';

type MediaFile = {
  file: File;
  type: 'video' | 'image' | 'audio';
  previewUrl: string;
  duration?: number;
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

const getVideoDuration = (file: File): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = (e) => {
      reject(`Could not get duration for video ${file.name}. Error: ${e}`);
    };
    video.src = URL.createObjectURL(file);
  });
};

const RendiApiTestPage = () => {
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [task, setTask] = useState<RendiTask | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pollingIntervalRef = useRef<number | null>(null);
  
  const [operationMode, setOperationMode] = useState<'merge' | 'overlay'>('merge');
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [transition, setTransition] = useState<string>('fade');
  const [transitionDuration, setTransitionDuration] = useState<number>(1);
  const [clipDuration, setClipDuration] = useState<number>(3);

  const [overlayX, setOverlayX] = useState(10);
  const [overlayY, setOverlayY] = useState(10);
  const [overlayScale, setOverlayScale] = useState(0.25);
  const [overlayStartTime, setOverlayStartTime] = useState(0);
  const [overlayDuration, setOverlayDuration] = useState(5);

  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const overlayImageRef = useRef<HTMLImageElement>(null);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  const videoFile = mediaFiles.find(f => f.type === 'video');
  const imageFile = mediaFiles.find(f => f.type === 'image');

  useEffect(() => {
    if (videoFile) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            window.URL.revokeObjectURL(video.src);
            setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
        };
        video.src = URL.createObjectURL(videoFile.file);
    } else {
        setVideoDimensions(null);
    }
  }, [videoFile]);

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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newMediaFilePromises = Array.from(files).map(async (file) => {
      let type: 'video' | 'image' | 'audio' = 'video';
      if (file.type.startsWith('image/')) type = 'image';
      if (file.type.startsWith('audio/')) type = 'audio';
      
      let duration: number | undefined = undefined;
      if (type === 'video') {
        try {
          duration = await getVideoDuration(file);
        } catch (error) {
          console.error(error);
          showError(`Không thể lấy thời lượng của video: ${file.name}`);
        }
      }

      return { file, type, previewUrl: URL.createObjectURL(file), duration };
    });

    const newMediaFiles = await Promise.all(newMediaFilePromises);
    setMediaFiles(prev => [...prev, ...newMediaFiles]);
  };

  const removeFile = (index: number) => {
    const fileToRemove = mediaFiles[index];
    URL.revokeObjectURL(fileToRemove.previewUrl);
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleProcess = async () => {
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

      let ffmpeg_command = '';
      let input_files: { [key: string]: string } = {};
      const output_files: { [key: string]: string } = { 'out_final': 'final_output.mp4' };

      if (operationMode === 'overlay') {
        if (!videoFile || !imageFile) {
          throw new Error('Chế độ Chèn ảnh yêu cầu chính xác 1 video và 1 ảnh.');
        }
        if (!previewContainerRef.current || !videoDimensions) {
            throw new Error("Không thể tính toán tọa độ overlay, thiếu thông tin video.");
        }

        const containerW = previewContainerRef.current.clientWidth;
        const containerH = previewContainerRef.current.clientHeight;
        const videoW = videoDimensions.width;
        const videoH = videoDimensions.height;
        const containerRatio = containerW / containerH;
        const videoRatio = videoW / videoH;

        let displayedVideoW, displayedVideoH, offsetX, offsetY;

        if (videoRatio > containerRatio) {
            displayedVideoW = containerW;
            displayedVideoH = containerW / videoRatio;
            offsetX = 0;
            offsetY = (containerH - displayedVideoH) / 2;
        } else {
            displayedVideoH = containerH;
            displayedVideoW = containerH * videoRatio;
            offsetY = 0;
            offsetX = (containerW - displayedVideoW) / 2;
        }

        const overlayX_relative = overlayX - offsetX;
        const overlayY_relative = overlayY - offsetY;
        const scaleFactor = videoW / displayedVideoW;
        const finalX = Math.round(overlayX_relative * scaleFactor);
        const finalY = Math.round(overlayY_relative * scaleFactor);

        dismissToast(loadingToast);
        loadingToast = showLoading('Đang tải file lên...');
        const [videoUrl, imageUrl] = await Promise.all([uploadToR2(videoFile.file), uploadToR2(imageFile.file)]);
        
        input_files = { 'in_video': videoUrl, 'in_image': imageUrl };
        const endTime = overlayStartTime + overlayDuration;
        ffmpeg_command = `-i {{in_video}} -i {{in_image}} -filter_complex "[1:v]scale=iw*${overlayScale}:-1[scaled_img];[0:v][scaled_img] overlay=x=${finalX}:y=${finalY}:enable='between(t,${overlayStartTime},${endTime})'" -pix_fmt yuv420p -c:a copy {{out_final}}`;

      } else { // 'merge' mode
        const videosAndImages = mediaFiles.filter(f => f.type === 'video' || f.type === 'image');
        const audioFile = mediaFiles.find(f => f.type === 'audio');

        if (videosAndImages.length === 0) {
          throw new Error('Vui lòng chọn ít nhất một video hoặc hình ảnh.');
        }

        dismissToast(loadingToast);
        loadingToast = showLoading('Đang tải file lên...');
        const urls = await Promise.all(mediaFiles.map(mf => uploadToR2(mf.file)));
        mediaFiles.forEach((mf, i) => {
            input_files[`in_${i}`] = urls[i];
        });

        if (isAdvancedMode) {
          if (videosAndImages.length < 2) {
              throw new Error("Chế độ nâng cao yêu cầu ít nhất 2 video hoặc hình ảnh để tạo chuyển cảnh.");
          }
          
          const clipDurations: number[] = [];
          let inputFlags = '';
          const filterComplexParts: string[] = [];

          for (const mf of videosAndImages) {
              const inputIndex = mediaFiles.indexOf(mf);
              const inputKey = `in_${inputIndex}`;
              if (mf.type === 'image') {
                  if (clipDuration <= 0) throw new Error("Thời lượng cho ảnh phải lớn hơn 0.");
                  inputFlags += ` -loop 1 -t ${clipDuration} -i {{${inputKey}}}`;
                  clipDurations.push(clipDuration);
              } else { // video
                  inputFlags += ` -i {{${inputKey}}}`;
                  if (typeof mf.duration !== 'number') {
                      throw new Error(`Không thể lấy thời lượng cho video: ${mf.file.name}. Vui lòng thử tải lại file.`);
                  }
                  clipDurations.push(mf.duration);
              }
          }

          videosAndImages.forEach((mf, i) => {
              filterComplexParts.push(`[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black,setsar=1[v${i}]`);
          });

          if (audioFile) {
              const audioInputIndex = mediaFiles.indexOf(audioFile);
              inputFlags += ` -i {{in_${audioInputIndex}}}`;
          }

          let lastStream = '[v0]';
          let currentTimelineDuration = clipDurations[0];
          for (let i = 1; i < videosAndImages.length; i++) {
              const nextStream = `[v${i}]`;
              const outStream = i === videosAndImages.length - 1 ? '[vout]' : `[vt${i}]`;
              
              if (currentTimelineDuration <= transitionDuration) {
                  throw new Error(`Thời lượng của clip #${i} (${currentTimelineDuration}s) phải lớn hơn thời lượng chuyển cảnh (${transitionDuration}s).`);
              }
              const offset = currentTimelineDuration - transitionDuration;
              
              filterComplexParts.push(`${lastStream}${nextStream}xfade=transition=${transition}:duration=${transitionDuration}:offset=${offset}${outStream}`);
              
              lastStream = outStream;
              currentTimelineDuration += (clipDurations[i] - transitionDuration);
          }

          const filterComplex = `"${filterComplexParts.join(';')}"`;
          
          let mapArgs = `-map "[vout]"`;
          if (audioFile) {
              const audioInputIndex = mediaFiles.findIndex(mf => mf.type === 'audio');
              mapArgs += ` -map ${audioInputIndex}:a:0`;
          }

          ffmpeg_command = `${inputFlags} -filter_complex ${filterComplex} ${mapArgs} -c:v libx264 -c:a aac -shortest {{out_final}}`;

        } else { // Simple Merge Mode
            const inputFlags = Object.keys(input_files).map(key => `-i {{${key}}}`).join(' ');
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

            ffmpeg_command = `${inputFlags} -filter_complex ${filter_complex} ${map_args} -c:v libx264 -c:a aac -shortest {{out_final}}`;
        }
      }
      
      await supabase.from('rendi_tasks').update({ status: 'BUILDING_COMMAND' }).eq('id', dbTask.id);
      setTask(prev => prev ? { ...prev, status: 'BUILDING_COMMAND' } : null);

      dismissToast(loadingToast);
      loadingToast = showLoading('Đang xây dựng và gửi lệnh render...');

      const payload = { input_files, output_files, ffmpeg_command };

      const { data: rendiData, error: rendiError } = await supabase.functions.invoke('proxy-rendi-api', { body: { action: 'run_command', payload } });
      
      if (rendiError || (rendiData && rendiData.error)) {
        throw new Error(rendiError?.message || rendiData.error);
      }
      if (!rendiData.command_id) {
        throw new Error("Rendi API did not return a command_id.");
      }
      
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

  const handleMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    if (!overlayImageRef.current) return;
    const imageRect = overlayImageRef.current.getBoundingClientRect();
    dragStartPos.current = {
      x: e.clientX - imageRect.left,
      y: e.clientY - imageRect.top,
    };
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !previewContainerRef.current || !overlayImageRef.current || !videoDimensions) return;
    e.preventDefault();

    const containerRect = previewContainerRef.current.getBoundingClientRect();
    const imageRect = overlayImageRef.current.getBoundingClientRect();

    const mouseXInContainer = e.clientX - containerRect.left;
    const mouseYInContainer = e.clientY - containerRect.top;

    let newX = mouseXInContainer - dragStartPos.current.x;
    let newY = mouseYInContainer - dragStartPos.current.y;

    const containerW = containerRect.width;
    const containerH = containerRect.height;
    const videoW = videoDimensions.width;
    const videoH = videoDimensions.height;
    const containerRatio = containerW / containerH;
    const videoRatio = videoW / videoH;

    let displayedVideoW, displayedVideoH, offsetX, offsetY;
    if (videoRatio > containerRatio) {
        displayedVideoW = containerW;
        displayedVideoH = containerW / videoRatio;
        offsetX = 0;
        offsetY = (containerH - displayedVideoH) / 2;
    } else {
        displayedVideoH = containerH;
        displayedVideoW = containerH * videoRatio;
        offsetY = 0;
        offsetX = (containerW - displayedVideoW) / 2;
    }

    const minX = offsetX;
    const minY = offsetY;
    const maxX = offsetX + displayedVideoW - imageRect.width;
    const maxY = offsetY + displayedVideoH - imageRect.height;

    newX = Math.max(minX, Math.min(newX, maxX));
    newY = Math.max(minY, Math.min(newY, maxY));

    setOverlayX(Math.round(newX));
    setOverlayY(Math.round(newY));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
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
            <CardDescription>Chọn chế độ, tải file và thiết lập các thông số.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Chế độ hoạt động</Label>
              <Select value={operationMode} onValueChange={(value) => setOperationMode(value as 'merge' | 'overlay')}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chế độ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Ghép nối Video/Ảnh</SelectItem>
                  <SelectItem value="overlay">Chèn ảnh vào Video (Overlay)</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            
            {operationMode === 'merge' && (
              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center space-x-2">
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
              </div>
            )}

            {operationMode === 'overlay' && (
              <>
                {videoFile && imageFile && (
                  <div className="space-y-2 pt-4 border-t">
                    <Label>Xem trước vị trí</Label>
                    <div
                      ref={previewContainerRef}
                      className="relative w-full aspect-video bg-gray-800 rounded-md overflow-hidden select-none"
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                    >
                      <video src={videoFile.previewUrl} className="w-full h-full object-contain" muted playsInline />
                      <img
                        ref={overlayImageRef}
                        src={imageFile.previewUrl}
                        className="absolute cursor-move"
                        style={{
                          left: `${overlayX}px`,
                          top: `${overlayY}px`,
                          width: `${overlayScale * 100}%`,
                          height: 'auto'
                        }}
                        onMouseDown={handleMouseDown}
                        alt="Overlay Preview"
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-4 pt-4 border-t">
                  <h3 className="text-sm font-semibold text-gray-700">Tùy chọn chèn ảnh</h3>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label htmlFor="overlay-x">Vị trí X (px)</Label>
                          <Input id="overlay-x" type="number" value={overlayX} onChange={e => setOverlayX(Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="overlay-y">Vị trí Y (px)</Label>
                          <Input id="overlay-y" type="number" value={overlayY} onChange={e => setOverlayY(Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="overlay-start">Bắt đầu sau (giây)</Label>
                          <Input id="overlay-start" type="number" value={overlayStartTime} onChange={e => setOverlayStartTime(Number(e.target.value))} min="0" />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="overlay-duration">Thời lượng hiển thị (giây)</Label>
                          <Input id="overlay-duration" type="number" value={overlayDuration} onChange={e => setOverlayDuration(Number(e.target.value))} min="1" />
                      </div>
                  </div>
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="overlay-scale">Tỷ lệ (Scale): {Math.round(overlayScale * 100)}%</Label>
                    <Slider
                        id="overlay-scale"
                        min={0.05}
                        max={1}
                        step={0.01}
                        value={[overlayScale]}
                        onValueChange={(value) => setOverlayScale(value[0])}
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. Xử lý và Kết quả</CardTitle>
            <CardDescription>Bắt đầu quá trình và xem kết quả tại đây.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleProcess} disabled={isProcessing || mediaFiles.length === 0} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand className="mr-2 h-4 w-4" />}
              {operationMode === 'merge' ? (isAdvancedMode ? 'Ghép & Áp dụng hiệu ứng' : 'Ghép Nối Đơn Giản') : 'Chèn ảnh vào Video'}
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