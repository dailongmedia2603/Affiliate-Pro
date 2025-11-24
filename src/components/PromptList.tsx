import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PromptCard from '@/components/PromptCard';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import PromptFormDialog from './PromptFormDialog';
import { toast } from 'react-hot-toast';

const PromptList = ({ category }) => {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        toast.error("Bạn cần đăng nhập để xem prompts.");
        setLoading(false);
        return;
    }

    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('category', category)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching prompts:', error);
      toast.error('Không thể tải danh sách prompt.');
    } else {
      setPrompts(data);
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const handleAddNew = () => {
    setEditingPrompt(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (prompt) => {
    setEditingPrompt(prompt);
    setIsDialogOpen(true);
  };

  const handleDelete = async (promptId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xoá prompt này không?')) {
      return;
    }
    const { error } = await supabase.from('prompts').delete().eq('id', promptId);
    if (error) {
      toast.error('Xoá prompt thất bại.');
      console.error('Error deleting prompt:', error);
    } else {
      toast.success('Đã xoá prompt thành công.');
      fetchPrompts();
    }
  };

  const handleSave = () => {
    setIsDialogOpen(false);
    fetchPrompts();
  };

  if (loading) {
    return <div className="text-center py-10">Đang tải...</div>;
  }

  return (
    <div className="mt-6">
      <div className="flex justify-end mb-4">
        <Button onClick={handleAddNew} className="bg-orange-500 hover:bg-orange-600">
          <PlusCircle className="w-4 h-4 mr-2" />
          Thêm mới Prompt
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {prompts.map((prompt) => (
          <PromptCard
            key={prompt.id}
            prompt={prompt}
            onEdit={() => handleEdit(prompt)}
            onDelete={() => handleDelete(prompt.id)}
          />
        ))}
      </div>
      {prompts.length === 0 && !loading && (
        <div className="text-center py-16 border-2 border-dashed rounded-lg mt-4">
            <p className="text-gray-500 font-semibold">Chưa có prompt nào.</p>
            <p className="text-sm text-gray-400 mt-2">Bấm "Thêm mới Prompt" để bắt đầu tạo.</p>
        </div>
      )}
      <PromptFormDialog
        isOpen={isDialogOpen}
        setIsOpen={setIsDialogOpen}
        prompt={editingPrompt}
        category={category}
        onSave={handleSave}
      />
    </div>
  );
};

export default PromptList;