import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wand2, Loader2, Sparkles, X, ImagePlus } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';

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

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
};

const Veo3GenerationForm = ({ onTaskCreated }) => {
  const [projectId, setProjectId] = useState('50c7f7bf-4799-4cd3-83ff-742090513f21');
  const [prompt, setPrompt] = useState('a beautiful girl in a beautiful dress');
  
  const [startImageUrl, setStartImageUrl] = useState('');
  const [endImageUrl, setEndImageUrl] = useState('');
  const [startImageFile, setStartImageFile] = useState<File | null>(null);
  const [endImageFile, setEndImageFile] = useState<File | null>(null);

  const [batchSize, setBatchSize] = useState(1);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBeautifying, setIsBeautifying] = useState(false);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'start' | 'end') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const setImageUrl = type === 'start' ? setStartImageUrl : setEndImageUrl;
    const setFile = type === 'start' ? setStartImageFile : setEndImageFile;
    const currentPreviewUrl = type === 'start' ? startImageUrl : endImageUrl;

    if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
    }

    setFile(file);
    const previewUrl = URL.createObjectURL(file);
    setImageUrl(previewUrl);
  };

  const handleRemoveImage = (type: 'start' | 'end') => {
    const setImageUrl = type === 'start' ? setStartImageUrl : setEndImageUrl;
    const setFile = type === 'start' ? setStartImageFile : setEndImageFile;
    const imageUrl = type === 'start' ? startImageUrl : endImageUrl;

    if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
    }
    setImageUrl('');
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!projectId || !prompt) {
      showError('Vui lòng nhập Project ID và Prompt.');
      return;
    }
    setIsGenerating(true);
    let taskId: string | null = null;
    const loadingToast = showLoading('Đang khởi tạo tác vụ...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Cần đăng nhập để thực hiện.");

      const { data: newTask, error: taskError } = await supabase
        .from('veo3_tasks')
        .insert({ user_id: user.id, project_id: projectId, prompt, status: 'pending' })
        .select('id')
        .single();
      if (taskError) throw taskError;
      taskId = newTask.id;
      onTaskCreated();

      let finalStartImageUrl: string | null = null;
      let finalEndImageUrl: string | null = null;

      if (startImageFile) {
        dismissToast(loadingToast);
        const startToast = showLoading('Đang tải lên ảnh bắt đầu...');
        const base64 = await fileToBase64(startImageFile);
        const { data, error } = await supabase.functions.invoke('proxy-veo3-api', {
            body: { path: 'veo3/image_upload', payload: { base64 }, taskId },
        });
        if (error) throw error;
        if (data.error) throw new Error(`Lỗi đăng ký ảnh bắt đầu: ${getErrorMessage(data)}`);
        
        finalStartImageUrl = data.data?.[0]?.url;

        if (!finalStartImageUrl) {
            console.error("VEO3 image upload response missing URL:", data);
            throw new Error('API không trả về URL cho ảnh bắt đầu.');
        }
        showSuccess('Tải lên ảnh bắt đầu thành công!', startToast);
      }

      if (endImageFile) {
        dismissToast(loadingToast);
        const endToast = showLoading('Đang tải lên ảnh kết thúc...');
        const base64 = await fileToBase64(endImageFile);
        const { data, error } = await supabase.functions.invoke('proxy-veo3-api', {
            body: { path: 'veo3/image_upload', payload: { base64 }, taskId },
        });
        if (error) throw error;
        if (data.error) throw new Error(`Lỗi đăng ký ảnh kết thúc: ${getErrorMessage(data)}`);
        
        finalEndImageUrl = data.data?.[0]?.url;

        if (!finalEndImageUrl) {
            console.error("VEO3 image upload response missing URL:", data);
            throw new Error('API không trả về URL cho ảnh kết thúc.');
        }
        showSuccess('Tải lên ảnh kết thúc thành công!', endToast);
      }

      showSuccess('Đang gửi yêu cầu tạo video...', loadingToast);
      
      const apiAspectRatio = aspectRatio === '9:16' 
        ? 'VIDEO_ASPECT_RATIO_PORTRAIT' 
        : 'VIDEO_ASPECT_RATIO_LANDSCAPE';

      const payload = {
        prompt,
        project_id: projectId,
        bath: batchSize,
        aspect_ratio: apiAspectRatio,
        startImage: finalStartImageUrl,
        endImage: finalEndImageUrl,
      };

      const { data, error } = await supabase.functions.invoke('proxy-veo3-api', {
        body: { path: 'veo3/genarate', payload, taskId },
      });

      if (error) throw error;
      if (data.error) throw new Error(getErrorMessage(data));

      if (data.operations) {
        await supabase.from('veo3_tasks').update({
          api_operations: data.operations,
          status: 'processing',
        }).eq('id', taskId);
        showSuccess('Đã gửi yêu cầu tạo video thành công!', loadingToast);
        handleRemoveImage('start');
        handleRemoveImage('end');
      } else {
        throw new Error('API không trả về thông tin tác vụ (operations).');
      }
    } catch (err) {
      showError(`Lỗi tạo video: ${getErrorMessage(err)}`, loadingToast);
      if (taskId) {
        await supabase.from('veo3_tasks').update({ status: 'failed', error_message: getErrorMessage(err) }).eq('id', taskId);
      }
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
          <div className="space-y-2">
            <Label htmlFor="start-image-upload">Ảnh Bắt Đầu (Tùy chọn)</Label>
            <div className="w-full aspect-video border-2 border-dashed rounded-lg p-2 bg-gray-50 flex items-center justify-center relative">
              {startImageUrl ? (
                <div className="relative group w-full h-full">
                  <img src={startImageUrl} alt="Preview" className="w-full h-full object-contain rounded-md" />
                  <Button
                    variant="destructive" size="icon" onClick={() => handleRemoveImage('start')}
                    className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label htmlFor="start-image-upload" className="cursor-pointer text-center text-gray-500">
                  <ImagePlus className="mx-auto h-8 w-8" />
                  <p className="text-sm mt-1">Tải ảnh lên</p>
                </label>
              )}
              <Input id="start-image-upload" type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'start')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-image-upload">Ảnh Kết Thúc (Tùy chọn)</Label>
            <div className="w-full aspect-video border-2 border-dashed rounded-lg p-2 bg-gray-50 flex items-center justify-center relative">
              {endImageUrl ? (
                <div className="relative group w-full h-full">
                  <img src={endImageUrl} alt="Preview" className="w-full h-full object-contain rounded-md" />
                  <Button
                    variant="destructive" size="icon" onClick={() => handleRemoveImage('end')}
                    className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label htmlFor="end-image-upload" className="cursor-pointer text-center text-gray-500">
                  <ImagePlus className="mx-auto h-8 w-8" />
                  <p className="text-sm mt-1">Tải ảnh lên</p>
                </label>
              )}
              <Input id="end-image-upload" type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'end')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
          </div>
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
        <Button onClick={handleSubmit} disabled={isGenerating} size="lg" className="w-full bg-orange-500 hover:bg-orange-600 text-white">
          {isGenerating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Wand2 className="mr-2 h-5 w-5" />}
          Tạo Video
        </Button>
      </CardContent>
    </Card>
  );
};

export default Veo3GenerationForm;