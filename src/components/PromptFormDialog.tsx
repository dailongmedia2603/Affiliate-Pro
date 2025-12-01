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
import { Loader2, PlusCircle, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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
  const [pairs, setPairs] = useState([{ image_prompt: '', video_prompt: '' }]);
  const [isPublic, setIsPublic] = useState(false);

  const categoryVariables = {
    image: ['product_name', 'product_description', 'image_count'],
    voice: ['product_name', 'product_description'],
  };

  const availableVariables = categoryVariables[category] || [];

  useEffect(() => {
    if (isOpen) {
      if (prompt) {
        setName(prompt.name || '');
        setProductId(prompt.product_id || '');
        setIsPublic(prompt.is_public || false);
        if (category === 'video') {
          try {
            const parsedContent = JSON.parse(prompt.content);
            if (Array.isArray(parsedContent) && parsedContent.length > 0) {
              setPairs(parsedContent);
            } else {
              setPairs([{ image_prompt: '', video_prompt: '' }]);
            }
          } catch (e) {
            setPairs([{ image_prompt: '', video_prompt: '' }]);
          }
        } else {
          setContent(prompt.content || '');
        }
      } else {
        setName('');
        setContent('');
        setProductId('');
        setPairs([{ image_prompt: '', video_prompt: '' }]);
        setIsPublic(false);
      }
    }
  }, [prompt, isOpen, category]);

  const handleAddPair = () => {
    setPairs([...pairs, { image_prompt: '', video_prompt: '' }]);
  };

  const handleRemovePair = (index: number) => {
    if (pairs.length > 1) {
      const newPairs = pairs.filter((_, i) => i !== index);
      setPairs(newPairs);
    }
  };

  const handlePairChange = (index: number, field: 'image_prompt' | 'video_prompt', value: string) => {
    const newPairs = [...pairs];
    newPairs[index][field] = value;
    setPairs(newPairs);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const finalContent = category === 'video' ? JSON.stringify(pairs) : content;
    await onSave({
      id: prompt?.id,
      name,
      content: finalContent,
      product_id: productId || null,
      category,
      is_public: isPublic,
    });
    setIsSaving(false);
  };

  const handleProductChange = (value: string) => {
    setProductId(value === 'none' ? '' : value);
  };

  const renderVideoForm = () => (
    <div className="space-y-4">
      {pairs.map((pair, index) => (
        <div key={index} className="p-4 border rounded-lg relative space-y-3 bg-gray-50">
          <h4 className="font-semibold text-gray-700">Cặp Prompt #{index + 1}</h4>
          {pairs.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 text-red-500"
              onClick={() => handleRemovePair(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <div className="space-y-2">
            <Label htmlFor={`image-prompt-${index}`}>Prompt Tạo Ảnh</Label>
            <Textarea
              id={`image-prompt-${index}`}
              value={pair.image_prompt}
              onChange={(e) => handlePairChange(index, 'image_prompt', e.target.value)}
              placeholder="e.g., a cinematic shot of a panda..."
              className="min-h-[100px]"
            />
            <VariablesList variables={['product_name', 'product_description']} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`video-prompt-${index}`}>Prompt Tạo Video (Chuyển động)</Label>
            <Textarea
              id={`video-prompt-${index}`}
              value={pair.video_prompt}
              onChange={(e) => handlePairChange(index, 'video_prompt', e.target.value)}
              placeholder="e.g., a slow zoom in"
              className="min-h-[60px]"
            />
             <VariablesList variables={['product_name', 'product_description', 'image_prompt']} />
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={handleAddPair}>
        <PlusCircle className="w-4 h-4 mr-2" />
        Thêm cặp Prompt
      </Button>
    </div>
  );

  const renderDefaultForm = () => (
    <div className="space-y-2">
      <Label htmlFor="content">Nội dung Prompt</Label>
      <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} required className="min-h-[150px]" />
      <VariablesList variables={availableVariables} />
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{prompt ? 'Chỉnh sửa Prompt' : 'Thêm Prompt Mới'}</DialogTitle>
            <DialogDescription>
              {prompt
                ? 'Cập nhật thông tin cho prompt của bạn.'
                : category === 'video'
                ? 'Tạo một kịch bản Ảnh / Video mới bằng cách thêm các cặp prompt.'
                : `Điền thông tin để tạo một prompt mới cho mục "${category}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-2">
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
            {category === 'video' ? renderVideoForm() : renderDefaultForm()}
            <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                    <div className="space-y-0.5">
                        <Label htmlFor="is-public-switch">Chia sẻ công khai</Label>
                        <p className="text-xs text-muted-foreground">
                            Cho phép các tài khoản khác xem và sử dụng prompt này.
                        </p>
                    </div>
                    <Switch
                        id="is-public-switch"
                        checked={isPublic}
                        onCheckedChange={setIsPublic}
                    />
                </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t">
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