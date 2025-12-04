import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Upload } from 'lucide-react';
import { uploadToR2 } from '@/utils/r2-upload';
import { showError, showSuccess } from '@/utils/toast';
import { supabase } from '@/integrations/supabase/client';

const ProductFormDialog = ({ product, isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (product) {
      setName(product.name || '');
      setDescription(product.description || '');
      setImageUrl(product.image_url || '');
    } else {
      setName('');
      setDescription('');
      setImageUrl('');
    }
  }, [product, isOpen]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
        const url = await uploadToR2(file);
        setImageUrl(url);
    } catch (error: any) {
        showError(error.message);
    } finally {
        setIsUploading(false);
        if(fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    let finalImageUrl = imageUrl;

    // Check if the URL needs to be ingested before saving
    if (finalImageUrl && finalImageUrl.startsWith('http')) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: settings } = await supabase.from('user_settings').select('cloudflare_r2_public_url').eq('id', user.id).single();
            const r2PublicUrl = settings?.cloudflare_r2_public_url;

            // If it's not already an R2 URL, ingest it
            if (!r2PublicUrl || !finalImageUrl.startsWith(r2PublicUrl)) {
                setIsIngesting(true);
                try {
                    showSuccess('Phát hiện URL ngoài. Đang xử lý và lưu trữ ảnh...');
                    const { data, error } = await supabase.functions.invoke('ingest-external-image', {
                        body: { externalUrl: finalImageUrl },
                    });
                    if (error) throw error;
                    if (data.error) throw new Error(data.error);
                    if (data.r2Url) {
                        finalImageUrl = data.r2Url;
                        setImageUrl(data.r2Url); // Update state to show the new URL in the UI
                        showSuccess('Đã nhập ảnh thành công!');
                    }
                } catch (err: any) {
                    showError(`Lỗi nhập ảnh từ URL: ${err.message}. Vui lòng thử tải ảnh lên trực tiếp.`);
                    setIsSaving(false);
                    setIsIngesting(false);
                    return; // Stop saving if ingestion fails
                } finally {
                    setIsIngesting(false);
                }
            }
        }
    }

    await onSave({
      ...product,
      name,
      description,
      image_url: finalImageUrl,
    });
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{product ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}</DialogTitle>
            <DialogDescription>
              {product ? 'Cập nhật thông tin chi tiết cho sản phẩm của bạn.' : 'Điền thông tin để tạo một sản phẩm mới.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Tên
              </Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Mô tả
              </Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="imageUrl" className="text-right">
                URL Hình ảnh
              </Label>
              <div className="col-span-3 flex items-center gap-2 relative">
                <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="flex-grow" placeholder="Dán URL hoặc tải lên" />
                {isIngesting && <Loader2 className="absolute right-12 h-4 w-4 animate-spin text-gray-500" />}
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isUploading || isIngesting}>
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {imageUrl && (
              <div className="grid grid-cols-4 items-start gap-4">
                  <div className="col-start-2 col-span-3">
                      <img src={imageUrl} alt="Xem trước" className="mt-2 rounded-md border max-h-40 object-contain" />
                  </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving || isUploading || isIngesting}>
              Hủy
            </Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={isSaving || isUploading || isIngesting}>
              {(isSaving || isUploading || isIngesting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {product ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProductFormDialog;