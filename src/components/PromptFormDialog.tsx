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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const VariablesList = ({ variables }: { variables: string[] }) => (
    <div className="mt-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500">Biến có sẵn:</span>
        {variables.map(variable => (
            <code key={variable} className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded-md">{`{{${variable}}}`}</code>
        ))}
    </div>
);

const PromptFormDialog = ({ isOpen, onClose, onSave, prompt, products, category }) => {
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [productId, setProductId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const categoryVariables = {
    image: ['product_name', 'product_description', 'image_count'],
    video: ['image_prompt', 'product_name', 'product_description'],
    voice: ['product_name', 'product_description'],
  };

  const availableVariables = categoryVariables[category] || [];

  useEffect(() => {
    if (isOpen) {
      if (prompt) {
        setName(prompt.name || '');
        setContent(prompt.content || '');
        setProductId(prompt.product_id || '');
      } else {
        setName('');
        setContent('');
        setProductId('');
      }
    }
  }, [prompt, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    await onSave({
      id: prompt?.id,
      name,
      content,
      product_id: productId || null,
      category,
    });
    setIsSaving(false);
  };

  const handleProductChange = (value: string) => {
    setProductId(value === 'none' ? '' : value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{prompt ? 'Chỉnh sửa Prompt' : 'Thêm Prompt Mới'}</DialogTitle>
            <DialogDescription>
              {prompt ? 'Cập nhật thông tin cho prompt của bạn.' : `Điền thông tin để tạo một prompt mới cho mục "${category}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tên Prompt</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product">Sản phẩm (Tùy chọn)</Label>
              <Select onValueChange={handleProductChange} value={productId || 'none'}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn một sản phẩm để liên kết" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Không có sản phẩm</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Nội dung Prompt</Label>
              <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} required className="min-h-[150px]" />
              <VariablesList variables={availableVariables} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Hủy
            </Button>
            <Button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {prompt ? 'Lưu thay đổi' : 'Tạo Prompt'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PromptFormDialog;