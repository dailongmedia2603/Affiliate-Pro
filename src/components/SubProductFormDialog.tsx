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
import { showError } from '@/utils/toast';

const SubProductFormDialog = ({ subProduct, isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [productLink, setProductLink] = useState('');
  const [price, setPrice] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (subProduct) {
      setName(subProduct.name || '');
      setDescription(subProduct.description || '');
      setImageUrl(subProduct.image_url || '');
      setProductLink(subProduct.product_link || '');
      setPrice(subProduct.price || '');
    } else {
      setName('');
      setDescription('');
      setImageUrl('');
      setProductLink('');
      setPrice('');
    }
  }, [subProduct, isOpen]);

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
    await onSave({
      ...subProduct,
      name,
      description,
      image_url: imageUrl,
      product_link: productLink,
      price: parseFloat(price) || 0,
    });
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{subProduct ? 'Chỉnh sửa sản phẩm con' : 'Thêm sản phẩm con'}</DialogTitle>
            <DialogDescription>
              {subProduct ? 'Cập nhật thông tin chi tiết.' : 'Điền thông tin để tạo sản phẩm con mới.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Tên</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">Mô tả</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="imageUrl" className="text-right">URL Hình ảnh</Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="flex-grow" />
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
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
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="productLink" className="text-right">Link sản phẩm</Label>
              <Input id="productLink" value={productLink} onChange={(e) => setProductLink(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="price" className="text-right">Giá (VND)</Label>
              <Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving || isUploading}>Hủy</Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={isSaving || isUploading}>
              {(isSaving || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {subProduct ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SubProductFormDialog;