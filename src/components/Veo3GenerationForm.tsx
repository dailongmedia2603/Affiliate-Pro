import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wand2, Loader2, Upload, Sparkles, X, ImagePlus } from 'lucide-react';
import { showError, showSuccess, showLoading, updateLoading } from '@/utils/toast';
import { uploadToR2 } from '@/utils/r2-upload';

const ImageUploader = ({ label, image, onImageChange, onImageRemove, isUploading }) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageChange(file);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="w-full aspect-video border-2 border-dashed rounded-lg p-2 bg-gray-50 flex items-center justify-center">
        {isUploading ? (
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        ) : image ? (
          <div className="relative group w-full h-full">
            <img src={image.url} alt="Preview" className="w-full h-full object-contain rounded-md" />
            <Button
              variant="destructive" size="icon" onClick={onImageRemove}
              className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <label htmlFor={`upload-${label}`} className="text-center text-gray-500 cursor-pointer">
            <ImagePlus className="mx-auto h-8 w-8" />
            <p className="text-sm mt-1">Tải ảnh lên</p>
            <Input id={`upload-${label}`} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>
        )}
      </div>
    </div>
  );
};

const getErrorMessage = (error: any): string => {
  if (!error) return 'Đã xảy ra lỗi không xác định.';
  
  if (error.context && typeof error.context.body === 'string') {
      try {
          const body = JSON.parse(error.context.body);
          if (body.error) {
              if (typeof body.error === 'object' && body.error !== null) {
                  return body.error.message || JSON.stringify(body.error);
              }
              return body.error;
          }
      } catch (e) {
          return error.context.body;
      }
  }

  if (error.message) {
    return typeof error.message === 'string' ? error.message : JSON.stringify(error.message);
  }

  if (typeof error === 'string') return error;

  return JSON.stringify(error);
};


const Veo3GenerationForm = ({ onTaskCreated }) => {
  const [projectId, setProjectId] = useState('50c7f7bf-4799-4cd3-83ff-742090513f21');
  const [prompt, setPrompt] = useState('a beautiful girl in a beautiful dress');
  const [startImage, setStartImage] = useState<{ id: string, url: string } | null>(null);
  const [endImage, setEndImage] = useState<{ id: string, url: string } | null>(null);
  const [batchSize, setBatchSize] = useState(1);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBeautifying, setIsBeautifying] = useState(false);
  const [isUploadingStart, setIsUploadingStart] = useState(false);
  const [isUploadingEnd, setIsUploadingEnd] = useState(false);

  const handleBeautifyPrompt = async () => {
    if (!prompt) {
      showError('Vui lòng nhập prompt trước.');
      return;
    }
    setIsBeautifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-veo3-api', {
        body: { path: 'veo3/re_promt', payload: { prompt } },
      });
      if (error) throw error;
      if (data.error) throw new Error(typeof data.error === 'object' ? JSON.stringify(data.error) : data.error);
      if (data.prompt) {
        setPrompt(data.prompt);
        showSuccess('Đã làm đẹp prompt!');
      }
    } catch (err) {
      showError(`Lỗi làm đẹp prompt: ${getErrorMessage(err)}`);
    } finally {
      setIsBeautifying(false);
    }
  };

  const handleImageUpload = async (file: File, type: 'start' | 'end') => {
    const setIsUploading = type === 'start' ? setIsUploadingStart : setIsUploadingEnd;
    const setImage = type === 'start' ? setStartImage : setEndImage;
    
    setIsUploading(true);
    const toastId = showLoading(`Bắt đầu tải lên ${type === 'start' ? 'ảnh bắt đầu' : 'ảnh kết thúc'}...`);
    
    try {
      updateLoading(toastId, 'Bước 1/3: Đang tải ảnh lên R2...');
      const imageUrl = await uploadToR2(file);
      if (!imageUrl) {
        throw new Error('Tải ảnh lên R2 thất bại, không nhận được URL.');
      }
      
      console.log(`[VEO3 Upload] URL ảnh đã tải lên: ${imageUrl}`);
      updateLoading(toastId, `Bước 2/3: Đang đăng ký với VEO 3...`);
      
      const { data, error } = await supabase.functions.invoke('proxy-veo3-api', {
        body: { 
          path: 'veo3/image_uploadv2',
          payload: { img_url: [imageUrl] }
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(typeof data.error === 'object' ? JSON.stringify(data.error) : data.error);
      
      const mediaId = data.mediaGenerationId || data.data?.[0]?.mediaGenerationId || data.data?.mediaGenerationId;

      if (mediaId) {
        setImage({ id: mediaId, url: URL.createObjectURL(file) });
        showSuccess(`Bước 3/3: Đăng ký ảnh thành công!`, toastId);
      } else {
        throw new Error('API không trả về ID ảnh (mediaGenerationId). Phản hồi: ' + JSON.stringify(data));
      }
    } catch (err) {
      showError(`Lỗi tải ảnh: ${getErrorMessage(err)}`, toastId);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!projectId || !prompt) {
      showError('Vui lòng nhập Project ID và Prompt.');
      return;
    }
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Cần đăng nhập để thực hiện.");

      const payload = {
        prompt,
        project_id: projectId,
        batch: batchSize,
        aspect_ratio: aspectRatio,
        start_image: startImage?.id || null,
        end_image: endImage?.id || null,
      };

      const { data, error } = await supabase.functions.invoke('proxy-veo3-api', {
        body: { path: 'veo3/generate', payload },
      });

      if (error) throw error;
      if (data.error) throw new Error(typeof data.error === 'object' ? JSON.stringify(data.error) : data.error);

      if (data.operations) {
        await supabase.from('veo3_tasks').insert({
          user_id: user.id,
          project_id: projectId,
          prompt,
          api_operations: data.operations,
          status: 'processing',
        });
        showSuccess('Đã gửi yêu cầu tạo video thành công!');
        onTaskCreated();
      } else {
        throw new Error('API không trả về thông tin tác vụ (operations).');
      }
    } catch (err) {
      showError(`Lỗi tạo video: ${getErrorMessage(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bảng điều khiển tạo video: VEO 3</CardTitle>
        <CardDescription>Nhập thông tin chi tiết để tạo video bằng API VEO 3.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="project-id">Project ID</Label>
          <Input id="project-id" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <div className="relative">
            <Textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[100px] pr-28" />
            <Button
              variant="outline" size="sm" onClick={handleBeautifyPrompt} disabled={isBeautifying}
              className="absolute top-2 right-2"
            >
              {isBeautifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Làm đẹp
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ImageUploader
            label="Ảnh Bắt Đầu (Tùy chọn)"
            image={startImage}
            onImageChange={(file) => handleImageUpload(file, 'start')}
            onImageRemove={() => setStartImage(null)}
            isUploading={isUploadingStart}
          />
          <ImageUploader
            label="Ảnh Kết Thúc (Tùy chọn)"
            image={endImage}
            onImageChange={(file) => handleImageUpload(file, 'end')}
            onImageRemove={() => setEndImage(null)}
            isUploading={isUploadingEnd}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="batch-size">Số lượng video (Batch)</Label>
            <Input id="batch-size" type="number" min="1" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="aspect-ratio">Tỷ lệ khung hình</Label>
            <Select value={aspectRatio} onValueChange={setAspectRatio}>
              <SelectTrigger id="aspect-ratio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="9:16">Dọc (9:16)</SelectItem>
                <SelectItem value="16:9">Ngang (16:9)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleSubmit} disabled={isGenerating || isUploadingStart || isUploadingEnd} size="lg" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
          {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
          Tạo Video
        </Button>
      </CardContent>
    </Card>
  );
};

export default Veo3GenerationForm;