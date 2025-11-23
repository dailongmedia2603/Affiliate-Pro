import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Wand2, Loader2, Upload, Info, X, Plus } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { uploadToR2 } from '@/utils/r2-upload';

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
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('1:1');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles = Array.from(files);
    const currentFiles = [...imageFiles, ...newFiles];
    setImageFiles(currentFiles);

    const previewPromises = newFiles.map(file => {
        return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
        });
    });

    Promise.all(previewPromises).then(newPreviews => {
        setImagePreviews(prev => [...prev, ...newPreviews]);
    });

    if (imageFiles.length === 0 && newFiles.length > 0) {
        const firstFile = newFiles[0];
        const reader = new FileReader();
        reader.onloadend = () => {
            const img = new Image();
            img.onload = () => {
                const closestRatio = findClosestAspectRatio(img.width, img.height);
                setAspectRatio(closestRatio);
            };
            img.src = reader.result as string;
        };
        reader.readAsDataURL(firstFile);
    }
  };

  const handleRemoveImage = (indexToRemove: number) => {
    const remainingFiles = imageFiles.filter((_, index) => index !== indexToRemove);
    setImageFiles(remainingFiles);
    setImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));

    if (indexToRemove === 0) {
        if (remainingFiles.length > 0) {
            const firstFile = remainingFiles[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                const img = new Image();
                img.onload = () => {
                    const closestRatio = findClosestAspectRatio(img.width, img.height);
                    setAspectRatio(closestRatio);
                };
                img.src = reader.result as string;
            };
            reader.readAsDataURL(firstFile);
        } else {
            setAspectRatio('1:1');
        }
    }
  };

  const handleSubmit = async () => {
    if (!prompt) {
      showError('Vui lòng nhập prompt.');
      return;
    }
    setIsGenerating(true);
    try {
      const uploadPromises = imageFiles.map(file => uploadToR2(file));
      const imageUrls = await Promise.all(uploadPromises);

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
      setPrompt('A cat wearing a superhero cape');
      setImageFiles([]);
      setImagePreviews([]);
      setAspectRatio('1:1');

    } catch (error) {
      showError(`Lỗi tạo ảnh: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const modelInfo = {
    banana: { title: "Tạo ảnh với Banana", input: "Prompt (bắt buộc) và Ảnh đầu vào (tùy chọn)." },
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
              <Input id="image-upload" type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
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