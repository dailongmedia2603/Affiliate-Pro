import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Wand2, Loader2, Upload } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';

const VideoGenerationForm = ({ onTaskCreated }) => {
  const [model, setModel] = useState('kling');
  const [prompt, setPrompt] = useState('A beautiful girl in a beautiful dress');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [duration, setDuration] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
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
    if (!prompt) {
      showError('Vui lòng nhập prompt.');
      return;
    }
    setIsGenerating(true);
    try {
      let imageData = null;
      if (imageFile) {
        imageData = await fileToBase64(imageFile);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Cần đăng nhập để thực hiện.");

      const options = {
        kling: { duration, width: 1024, height: 576, resolution: "1080p" },
        sora: { duration, width: 1024, height: 576, resolution: "1080p", aspect_ratio: "16:9" },
        higg_life: { width: 1024, height: 576, steps: 30, frames: 81 },
      };

      const { data, error } = await supabase.functions.invoke('higgsfield-python-proxy', {
        body: { action: 'generate_video', model, prompt, imageData, options: options[model] },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      if (data.success && data.taskId) {
        const { error: insertError } = await supabase.from('video_tasks').insert({
          user_id: user.id,
          higgsfield_task_id: data.taskId,
          model,
          prompt,
        });
        if (insertError) throw insertError;
        
        showSuccess('Đã gửi yêu cầu tạo video thành công!');
        onTaskCreated();
        // Reset form could be added here
      } else {
        throw new Error('Không nhận được ID tác vụ từ API.');
      }
    } catch (error) {
      showError(`Lỗi tạo video: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bảng điều khiển tạo video</CardTitle>
        <CardDescription>Chọn một mô hình, cung cấp prompt và hình ảnh để bắt đầu.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={model} onValueChange={setModel}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="kling">Kling</TabsTrigger>
            <TabsTrigger value="sora">Sora</TabsTrigger>
            <TabsTrigger value="higg_life">Higg Life</TabsTrigger>
          </TabsList>
          <div className="space-y-6 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., a cinematic shot of a panda drinking bubble tea" className="min-h-[120px]" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="image-upload">Ảnh đầu vào (Tùy chọn)</Label>
                <div className="w-full h-[152px] border-2 border-dashed rounded-lg flex items-center justify-center relative">
                  {imagePreview ? (
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-contain rounded-lg" />
                  ) : (
                    <div className="text-center text-gray-500">
                      <Upload className="mx-auto h-8 w-8" />
                      <p className="text-sm mt-1">Kéo thả hoặc nhấn để tải ảnh</p>
                    </div>
                  )}
                  <Input id="image-upload" type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                </div>
              </div>
            </div>
            
            {(model === 'kling' || model === 'sora') && (
              <div className="space-y-2">
                <Label>Thời lượng (giây): {duration}</Label>
                <Slider value={[duration]} onValueChange={([v]) => setDuration(v)} min={1} max={10} step={1} />
              </div>
            )}

            <Button onClick={handleSubmit} disabled={isGenerating} size="lg" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
              {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
              Tạo Video
            </Button>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default VideoGenerationForm;