import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Wand2, Loader2, Upload, Info, X, Plus } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { uploadToR2 } from '@/utils/r2-upload';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

const VideoGenerationForm = ({ model, onTaskCreated, channelId }) => {
  const [prompt, setPrompt] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState(4);
  const [isGenerating, setIsGenerating] = useState(false);
  const [wan2Type, setWan2Type] = useState('animate');

  useEffect(() => {
    if (model === 'kling') {
      setDuration(5);
    } else if (model === 'sora') {
      setDuration(4);
    }
  }, [model]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (type === 'image') {
      const newFiles = Array.from(files);
      setImageFiles(prev => [...prev, ...newFiles]);

      const newPreviewPromises = newFiles.map(file => {
        return new Promise<string>(resolve => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });

      Promise.all(newPreviewPromises).then(newPreviews => {
        setImagePreviews(prev => [...prev, ...newPreviews]);
      });
    } else { // type === 'video'
      const file = files[0];
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setVideoFile(file);
          setVideoPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };
  
  const handleRemoveImage = (indexToRemove: number) => {
    setImageFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    setImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Cần đăng nhập để thực hiện.");

      const videoData = videoFile ? await fileToBase64(videoFile) : null;

      const options = {
        sora: { duration, width: 1024, height: 576, resolution: "1080p", aspect_ratio: "16:9" },
        kling: { duration, width: 576, height: 1024, resolution: "1080p", aspect_ratio: "9:16" },
        higg_life: { width: 1024, height: 576, steps: 30, frames: 81 },
        wan2: { type: wan2Type },
      };

      let functionName: string;
      let functionPayload: object;

      if (model === 'sora') {
        functionName = 'tao-video-sora';
        const imageBases64 = await Promise.all(imageFiles.map(file => fileToBase64(file)));
        functionPayload = {
          prompt,
          imageBases64,
          options: options.sora,
        };
      } else {
        const imageUrls = await Promise.all(imageFiles.map(file => uploadToR2(file)));
        functionName = 'higgsfield-python-proxy';
        functionPayload = {
          action: 'generate_video',
          model,
          prompt,
          imageUrls,
          videoData,
          options: options[model],
        };
      }

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: functionPayload,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.success && data.taskId) {
        await supabase.from('video_tasks').insert({ user_id: user.id, higgsfield_task_id: data.taskId, model, prompt, channel_id: channelId });
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
    sora: { title: "Text/Image to Video (Sora)", input: "Prompt (bắt buộc) và Ảnh (tùy chọn)." },
    kling: { title: "Text/Image to Video", input: "Prompt (bắt buộc) và Ảnh (tùy chọn)." },
    higg_life: { title: "Image to Video", input: "Prompt (bắt buộc) và Ảnh (tùy chọn)." },
    wan2: { title: "Image + Video to Video", input: "Ảnh (bắt buộc), Video (bắt buộc, dưới 5MB) và Prompt (tùy chọn)." },
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
          <Label htmlFor="prompt">Prompt {model === 'wan2' && '(Tùy chọn)'}</Label>
          <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={model === 'wan2' ? "Nhập prompt nếu muốn..." : "e.g., a cinematic shot of a panda drinking bubble tea"} className="min-h-[120px]" />
        </div>

        <div className={`grid grid-cols-1 ${model === 'wan2' ? 'md:grid-cols-2' : ''} gap-6`}>
          {(model === 'sora' || model === 'kling' || model === 'higg_life' || model === 'wan2') && (
            <div className="space-y-2">
              <Label htmlFor="image-upload">Ảnh đầu vào</Label>
              <div className="w-full min-h-[152px] border-2 border-dashed rounded-lg p-2 bg-gray-50">
                {imagePreviews.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative group aspect-square">
                        <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover rounded-md" />
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleRemoveImage(index)}
                          className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Remove image"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <label htmlFor="image-upload" className="flex flex-col items-center justify-center aspect-square border-2 border-dashed rounded-md cursor-pointer hover:bg-gray-100 text-gray-400">
                      <Plus className="w-6 h-6" />
                      <span className="text-xs mt-1">Thêm ảnh</span>
                    </label>
                  </div>
                ) : (
                  <label htmlFor="image-upload" className="w-full h-[136px] flex items-center justify-center relative cursor-pointer">
                    <div className="text-center text-gray-500">
                      <Upload className="mx-auto h-8 w-8" />
                      <p className="text-sm mt-1">Tải ảnh lên</p>
                    </div>
                  </label>
                )}
                <Input id="image-upload" type="file" accept="image/*" multiple onChange={(e) => handleFileChange(e, 'image')} className="hidden" />
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
        
        {model === 'sora' && (
          <div className="space-y-2">
            <Label>Thời lượng (giây)</Label>
            <RadioGroup
              value={String(duration)}
              onValueChange={(value) => setDuration(Number(value))}
              className="flex items-center gap-6 pt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="4" id="duration-4" />
                <Label htmlFor="duration-4" className="cursor-pointer font-normal">4 giây</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="8" id="duration-8" />
                <Label htmlFor="duration-8" className="cursor-pointer font-normal">8 giây</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="12" id="duration-12" />
                <Label htmlFor="duration-12" className="cursor-pointer font-normal">12 giây</Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {model === 'kling' && (
          <div className="space-y-2">
            <Label>Thời lượng (giây)</Label>
            <RadioGroup
              value={String(duration)}
              onValueChange={(value) => setDuration(Number(value))}
              className="flex items-center gap-6 pt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="5" id="duration-5" />
                <Label htmlFor="duration-5" className="cursor-pointer font-normal">5 giây</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="10" id="duration-10" />
                <Label htmlFor="duration-10" className="cursor-pointer font-normal">10 giây</Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {model === 'wan2' && (
          <div className="space-y-2">
            <Label>Chế độ tạo</Label>
            <RadioGroup defaultValue="animate" value={wan2Type} onValueChange={setWan2Type} className="flex items-center gap-6 pt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="animate" id="r-animate" />
                <Label htmlFor="r-animate" className="cursor-pointer">Animate (Chuyển động)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="rep" id="r-rep" />
                <Label htmlFor="r-rep" className="cursor-pointer">Repaint (Vẽ lại)</Label>
              </div>
            </RadioGroup>
          </div>
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