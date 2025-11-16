import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Wand2, Loader2, Upload, Info } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const VideoGenerationForm = ({ model, onTaskCreated }) => {
  const [prompt, setPrompt] = useState('A beautiful girl in a beautiful dress');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (file) {
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
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Cần đăng nhập để thực hiện.");

      let imageData = imageFile ? await fileToBase64(imageFile) : null;
      let videoData = videoFile ? await fileToBase64(videoFile) : null;

      const options = {
        kling: { duration, width: 1024, height: 576, resolution: "1080p" },
        sora: { duration, width: 1024, height: 576, resolution: "1080p", aspect_ratio: "16:9" },
        higg_life: { width: 1024, height: 576, steps: 30, frames: 81 },
        wan2: {},
      };

      const { data, error } = await supabase.functions.invoke('higgsfield-python-proxy', {
        body: { action: 'generate_video', model, prompt, imageData, videoData, options: options[model] },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.success && data.taskId) {
        await supabase.from('video_tasks').insert({ user_id: user.id, higgsfield_task_id: data.taskId, model, prompt });
        showSuccess('Đã gửi yêu cầu tạo video thành công!');
        onTaskCreated();
      } else {
        throw new Error('Không nhận được ID tác vụ từ API.');
      }
    } catch (error) {
      showError(`Lỗi tạo video: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const modelInfo = {
    kling: { title: "Text/Image to Video", input: "Prompt (bắt buộc) và Ảnh (tùy chọn)." },
    sora: { title: "Text/Image to Video", input: "Prompt (bắt buộc) và Ảnh (tùy chọn)." },
    higg_life: { title: "Image to Video", input: "Prompt (bắt buộc) và Ảnh (tùy chọn)." },
    wan2: { title: "Image + Video to Video", input: "Ảnh (bắt buộc) và Video (bắt buộc, dưới 5MB)." },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bảng điều khiển tạo video: {model.charAt(0).toUpperCase() + model.slice(1)}</CardTitle>
        <CardDescription>{modelInfo[model].title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Yêu cầu đầu vào</AlertTitle>
          <AlertDescription>{modelInfo[model].input}</AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., a cinematic shot of a panda drinking bubble tea" className="min-h-[120px]" />
        </div>

        <div className={`grid grid-cols-1 ${model === 'wan2' ? 'md:grid-cols-2' : ''} gap-6`}>
          {(model === 'kling' || model === 'sora' || model === 'higg_life' || model === 'wan2') && (
            <div className="space-y-2">
              <Label htmlFor="image-upload">Ảnh đầu vào</Label>
              <div className="w-full h-[152px] border-2 border-dashed rounded-lg flex items-center justify-center relative bg-gray-50">
                {imagePreview ? <img src={imagePreview} alt="Preview" className="w-full h-full object-contain rounded-lg" /> : <div className="text-center text-gray-500"><Upload className="mx-auto h-8 w-8" /><p className="text-sm mt-1">Tải ảnh lên</p></div>}
                <Input id="image-upload" type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'image')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </div>
            </div>
          )}
          {model === 'wan2' && (
            <div className="space-y-2">
              <Label htmlFor="video-upload">Video đầu vào</Label>
              <div className="w-full h-[152px] border-2 border-dashed rounded-lg flex items-center justify-center relative bg-gray-50">
                {videoPreview ? <video src={videoPreview} className="w-full h-full object-contain rounded-lg" /> : <div className="text-center text-gray-500"><Upload className="mx-auto h-8 w-8" /><p className="text-sm mt-1">Tải video lên</p></div>}
                <Input id="video-upload" type="file" accept="video/mp4" onChange={(e) => handleFileChange(e, 'video')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </div>
            </div>
          )}
        </div>
        
        {(model === 'kling' || model === 'sora') && (
          <div className="space-y-2"><Label>Thời lượng (giây): {duration}</Label><Slider value={[duration]} onValueChange={([v]) => setDuration(v)} min={1} max={10} step={1} /></div>
        )}

        <Button onClick={handleSubmit} disabled={isGenerating} size="lg" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
          {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
          Tạo Video
        </Button>
      </CardContent>
    </Card>
  );
};

export default VideoGenerationForm;