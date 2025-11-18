import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Wand2, Loader2, Upload, Info } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "4:3", "16:9", "21:9", "5:4", "3:2",
  "2:3", "9:16", "3:4", "4:5"
];

const findClosestAspectRatio = (width: number, height: number): string => {
  const originalRatio = width / height;
  let closestRatio = "1:1";
  let minDifference = Infinity;

  SUPPORTED_ASPECT_RATIOS.forEach(ratioStr => {
    const [w, h] = ratioStr.split(':').map(Number);
    const supportedRatio = w / h;
    const difference = Math.abs(originalRatio - supportedRatio);

    if (difference < minDifference) {
      minDifference = difference;
      closestRatio = ratioStr;
    }
  });

  return closestRatio;
};

const ImageGenerationForm = ({ model, onTaskCreated }) => {
  const [prompt, setPrompt] = useState('A cat wearing a superhero cape');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('1:1');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
        const img = new Image();
        img.onload = () => {
          const closestRatio = findClosestAspectRatio(img.width, img.height);
          setAspectRatio(closestRatio);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadToStorage = async (file: File): Promise<string> => {
    // 1. Get presigned URL from our new Edge Function
    const { data: presignedData, error: presignedError } = await supabase.functions.invoke('storage-generate-upload-url', {
      body: { fileName: file.name },
    });
    if (presignedError) throw new Error(`Không thể lấy URL tải lên: ${presignedError.message}`);

    // 2. Upload the file directly to Supabase Storage using the presigned URL
    const uploadResponse = await fetch(presignedData.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Lỗi tải tệp lên: ${errorText}`);
    }

    // 3. Get the public URL of the uploaded file
    const { data: urlData } = supabase.storage.from('images').getPublicUrl(presignedData.path);
    return urlData.publicUrl;
  };

  const handleSubmit = async () => {
    if (!prompt) {
      showError('Vui lòng nhập prompt.');
      return;
    }
    setIsGenerating(true);
    try {
      let imageUrls: string[] = [];
      if (imageFile) {
        const publicUrl = await uploadToStorage(imageFile);
        imageUrls.push(publicUrl);
      }

      const { error } = await supabase.functions.invoke('generate-image', {
        body: {
          action: 'generate_image',
          model,
          prompt,
          image_urls: imageUrls,
          aspect_ratio: aspectRatio,
        },
      });

      if (error) throw error;

      showSuccess('Đã gửi yêu cầu tạo ảnh thành công! Kiểm tra tab lịch sử.');
      onTaskCreated();
      // Reset form
      setPrompt('A cat wearing a superhero cape');
      setImageFile(null);
      setImagePreview(null);
      setAspectRatio('1:1');

    } catch (error) {
      showError(`Lỗi tạo ảnh: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const modelInfo = {
    banana: { title: "Tạo ảnh với Banana", input: "Prompt (bắt buộc) và Ảnh đầu vào (tùy chọn)." },
    seedream: { title: "Hòa trộn ảnh với SeeDream", input: "Prompt (bắt buộc) và Ảnh đầu vào (tùy chọn)." },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bảng điều khiển: {model.charAt(0).toUpperCase() + model.slice(1)}</CardTitle>
        <CardDescription>{modelInfo[model].title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Yêu cầu đầu vào</AlertTitle>
          <AlertDescription>{modelInfo[model].input}</AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., a cat wearing a superhero cape" className="min-h-[152px]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="image-upload">Ảnh đầu vào (Tùy chọn)</Label>
            <div className="w-full h-[152px] border-2 border-dashed rounded-lg flex items-center justify-center relative bg-gray-50">
              {imagePreview ? <img src={imagePreview} alt="Preview" className="w-full h-full object-contain rounded-lg" /> : <div className="text-center text-gray-500"><Upload className="mx-auto h-8 w-8" /><p className="text-sm mt-1">Tải ảnh lên</p></div>}
              <Input id="image-upload" type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
          </div>
        </div>
        
        <div className="space-y-2">
          <Label>Tỷ lệ khung hình (tự động chọn)</Label>
          <Input type="text" value={aspectRatio} readOnly className="bg-gray-100" />
        </div>

        <Button onClick={handleSubmit} disabled={isGenerating} size="lg" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
          {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
          Tạo Ảnh
        </Button>
      </CardContent>
    </Card>
  );
};

export default ImageGenerationForm;