import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'react-hot-toast';

const PromptFormDialog = ({ isOpen, setIsOpen, prompt, category, onSave }) => {
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (prompt) {
      setName(prompt.name);
      setField(prompt.field || '');
      setContent(prompt.content);
    } else {
      // Reset form for new prompt
      setName('');
      setField('');
      setContent('');
    }
  }, [prompt, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        toast.error("Bạn cần đăng nhập để thực hiện hành động này.");
        setIsSaving(false);
        return;
    }

    const promptData = {
      name,
      field,
      content,
      category,
      user_id: user.id,
    };

    let error;
    if (prompt) {
      // Update existing prompt
      const { error: updateError } = await supabase
        .from('prompts')
        .update({ ...promptData, updated_at: new Date().toISOString() })
        .eq('id', prompt.id);
      error = updateError;
    } else {
      // Create new prompt
      const { error: insertError } = await supabase.from('prompts').insert(promptData);
      error = insertError;
    }

    if (error) {
      toast.error('Lưu prompt thất bại.');
      console.error('Error saving prompt:', error);
    } else {
      toast.success(`Đã lưu prompt thành công!`);
      onSave();
    }
    setIsSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{prompt ? 'Sửa Prompt' : 'Tạo Prompt Mới'}</DialogTitle>
          <DialogDescription>
            {prompt ? 'Chỉnh sửa thông tin prompt của bạn.' : 'Thêm một prompt mới vào thư viện của bạn.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                Tên prompt
                </Label>
                <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                required
                />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="field" className="text-right">
                Lĩnh vực
                </Label>
                <Input
                id="field"
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="col-span-3"
                placeholder="VD: Thời trang, Công nghệ"
                />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="content" className="text-right pt-2">
                Nội dung
                </Label>
                <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="col-span-3"
                rows={6}
                placeholder="Nhập nội dung prompt. Dùng {{variable}} để tạo biến."
                required
                />
            </div>
            </div>
            <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Huỷ
            </Button>
            <Button type="submit" disabled={isSaving} className="bg-orange-500 hover:bg-orange-600">
                {isSaving ? 'Đang lưu...' : 'Lưu'}
            </Button>
            </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PromptFormDialog;