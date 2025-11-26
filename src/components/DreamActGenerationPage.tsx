import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Wand2, RefreshCw } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import DreamActTaskItem from './DreamActTaskItem';

const DreamActGenerationPage = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('dream_act_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      showError('Không thể tải lịch sử Dream ACT.');
    } else {
      setTasks(data || []);
    }
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (type === 'image') {
        setImageFile(file);
        setImagePreview(reader.result as string);
      } else {
        setVideoFile(file);
        setVideoPreview(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!imageFile || !videoFile) {
      showError('Vui lòng tải lên cả ảnh nguồn và video điều khiển.');
      return;
    }
    setIsGenerating(true);
    let loadingToast = showLoading('Đang tạo tác vụ...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Cần đăng nhập để thực hiện.");

      const { data: taskData, error: taskError } = await supabase
        .from('dream_act_tasks')
        .insert({ user_id: user.id, status: 'uploading_image' })
        .select()
        .single();
      if (taskError) throw taskError;

      dismissToast(loadingToast);
      loadingToast = showLoading('Đang tải ảnh nguồn...');

      const imageFormData = new FormData();
      imageFormData.append('action', 'upload_image');
      imageFormData.append('file', imageFile);
      const { data: imageData, error: imageUploadError } = await supabase.functions.invoke('proxy-dream-act-api', { body: imageFormData });
      if (imageUploadError || imageData.code !== 200) throw new Error(imageUploadError?.message || imageData.message || 'Lỗi tải ảnh nguồn.');
      const imageUrl = imageData.data.extraData.filePath;
      await supabase.from('dream_act_tasks').update({ status: 'uploading_video', source_image_url: imageUrl }).eq('id', taskData.id);

      dismissToast(loadingToast);
      loadingToast = showLoading('Đang tải video điều khiển...');

      const videoFormData = new FormData();
      videoFormData.append('action', 'upload_video');
      videoFormData.append('file', videoFile);
      const { data: videoData, error: videoUploadError } = await supabase.functions.invoke('proxy-dream-act-api', { body: videoFormData });
      if (videoUploadError || videoData.code !== 200) throw new Error(videoUploadError?.message || videoData.message || 'Lỗi tải video điều khiển.');
      const videoUrl = videoData.data.extraData.videoUrl;
      await supabase.from('dream_act_tasks').update({ status: 'animating', driving_video_url: videoUrl }).eq('id', taskData.id);

      dismissToast(loadingToast);
      loadingToast = showLoading('Đang tạo video...');

      const { data: animateData, error: animateError } = await supabase.functions.invoke('proxy-dream-act-api', {
        body: {
          action: 'animate_video',
          payload: { imageUrl, videoUrl }
        }
      });
      if (animateError || animateData.code !== 200) throw new Error(animateError?.message || animateData.message || 'Lỗi tạo video.');
      const animateId = animateData.data.animateId;
      await supabase.from('dream_act_tasks').update({ animate_id: animateId }).eq('id', taskData.id);

      dismissToast(loadingToast);
      showSuccess('Đã gửi yêu cầu tạo video thành công! Vui lòng kiểm tra lịch sử.');
      fetchHistory();
      setImageFile(null);
      setVideoFile(null);
      setImagePreview(null);
      setVideoPreview(null);

    } catch (error) {
      dismissToast(loadingToast);
      showError(`Tạo video thất bại: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Tạo Video Dream ACT</CardTitle>
            <CardDescription>Tải lên một ảnh nguồn và một video điều khiển để tạo video chuyển động khuôn mặt.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="image-upload">Ảnh nguồn</Label>
                <div className="w-full aspect-square border-2 border-dashed rounded-lg flex items-center justify-center relative bg-gray-50">
                  {imagePreview ? <img src={imagePreview} className="w-full h-full object-contain rounded-lg" /> : <div className="text-center text-gray-500"><Upload className="mx-auto h-8 w-8" /><p className="text-sm mt-1">Tải ảnh lên</p></div>}
                  <Input id="image-upload" type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'image')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="video-upload">Video điều khiển</Label>
                <div className="w-full aspect-square border-2 border-dashed rounded-lg flex items-center justify-center relative bg-gray-50">
                  {videoPreview ? <video src={videoPreview} className="w-full h-full object-contain rounded-lg" /> : <div className="text-center text-gray-500"><Upload className="mx-auto h-8 w-8" /><p className="text-sm mt-1">Tải video lên</p></div>}
                  <Input id="video-upload" type="file" accept="video/mp4" onChange={(e) => handleFileChange(e, 'video')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
            </div>
            <Button onClick={handleSubmit} disabled={isGenerating || !imageFile || !videoFile} size="lg" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
              Tạo Video
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-1">
        <Card className="flex flex-col h-full min-h-[600px]">
          <CardHeader className="flex-row justify-between items-center">
            <CardTitle>Lịch sử tạo</CardTitle>
            <Button variant="ghost" size="icon" onClick={fetchHistory} disabled={loadingHistory}>
              <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-3">
            {loadingHistory && tasks.length === 0 ? (
              <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>
            ) : tasks.length > 0 ? (
              tasks.map(task => <DreamActTaskItem key={task.id} initialTask={task} onTaskDeleted={fetchHistory} />)
            ) : (
              <p className="text-center text-gray-500 pt-8">Chưa có tác vụ nào.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DreamActGenerationPage;