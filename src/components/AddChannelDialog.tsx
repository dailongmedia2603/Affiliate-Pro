import React, { useState, useEffect } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const AddChannelDialog = ({ isOpen, onClose, onSave, products, channel }) => {
  const [name, setName] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (channel) {
        setName(channel.name || '');
        setProductId(channel.product_id || null);
        setLink(channel.link || '');
      } else {
        setName('');
        setProductId(null);
        setLink('');
      }
    }
  }, [isOpen, channel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setIsSaving(true);
    await onSave({ id: channel?.id, name, product_id: productId, link });
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{channel ? 'Chỉnh sửa kênh' : 'Thêm kênh mới'}</DialogTitle>
            <DialogDescription>
              {channel ? 'Cập nhật thông tin cho kênh của bạn.' : 'Điền thông tin để tạo một kênh mới và liên kết với sản phẩm.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Tên kênh
              </Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="product" className="text-right">
                Sản phẩm
              </Label>
              <Select onValueChange={setProductId} value={productId || undefined}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Chọn một sản phẩm" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="link" className="text-right">
                Link kênh
              </Label>
              <Input id="link" value={link} onChange={(e) => setLink(e.target.value)} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Hủy
            </Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {channel ? 'Lưu thay đổi' : 'Thêm kênh'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddChannelDialog;