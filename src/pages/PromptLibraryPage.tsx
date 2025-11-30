import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, PlusCircle, Edit, Trash2, Video, Mic, BookText, Copy } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import PromptFormDialog from '@/components/PromptFormDialog';
import { Badge } from '@/components/ui/badge';

type Product = { id: string; name: string; };
type Prompt = {
  id: string;
  name: string;
  content: string;
  category: 'video' | 'image' | 'voice';
  created_at: string;
  product_id: string | null;
  product: { name: string } | null;
};

const PromptLibraryPage = () => {
  const [activeTab, setActiveTab] = useState('video');
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [promptToEdit, setPromptToEdit] = useState<Prompt | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [promptToDelete, setPromptToDelete] = useState<Prompt | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      const { data, error } = await supabase.from('products').select('id, name');
      if (error) {
        showError('Không thể tải danh sách sản phẩm.');
      } else {
        setProducts(data || []);
      }
    };
    fetchProducts();
  }, []);

  const fetchPrompts = useCallback(async (category) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('prompts')
      .select('*, product:products(name)')
      .eq('category', category)
      .order('created_at', { ascending: false });

    if (error) {
      showError(`Không thể tải danh sách prompt cho mục "${category}".`);
      setPrompts([]);
    } else {
      setPrompts(data as Prompt[] || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPrompts(activeTab);
  }, [activeTab, fetchPrompts]);

  const handleAddNew = () => {
    setPromptToEdit(null);
    setIsFormOpen(true);
  };

  const handleEdit = (prompt: Prompt) => {
    setPromptToEdit(prompt);
    setIsFormOpen(true);
  };

  const handleDeleteRequest = (prompt: Prompt) => {
    setPromptToDelete(prompt);
    setIsAlertOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!promptToDelete) return;
    const { error } = await supabase.from('prompts').delete().eq('id', promptToDelete.id);
    if (error) {
      showError('Xóa prompt thất bại.');
    } else {
      showSuccess('Prompt đã được xóa.');
      fetchPrompts(activeTab);
    }
    setIsAlertOpen(false);
    setPromptToDelete(null);
  };

  const handleSave = async (promptData: { id?: string; name: string; content: string; product_id: string | null; category: string; }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError('Bạn cần đăng nhập để thực hiện.');
      return;
    }

    const dataToSave = {
      name: promptData.name,
      content: promptData.content,
      product_id: promptData.product_id,
      category: activeTab,
      user_id: user.id,
    };

    const { error } = promptData.id
      ? await supabase.from('prompts').update(dataToSave).eq('id', promptData.id)
      : await supabase.from('prompts').insert(dataToSave);

    if (error) {
      showError(`Lưu prompt thất bại: ${error.message}`);
    } else {
      showSuccess(`Prompt đã được ${promptData.id ? 'cập nhật' : 'tạo mới'}.`);
      fetchPrompts(activeTab);
    }
    setIsFormOpen(false);
  };

  const handleCopy = async (promptToCopy: Prompt) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError('Bạn cần đăng nhập để thực hiện.');
      return;
    }

    const newPromptData = {
      name: `Bản sao của ${promptToCopy.name}`,
      content: promptToCopy.content,
      category: promptToCopy.category,
      product_id: promptToCopy.product_id,
      user_id: user.id,
    };

    const { error } = await supabase.from('prompts').insert(newPromptData);

    if (error) {
      showError(`Sao chép prompt thất bại: ${error.message}`);
    } else {
      showSuccess('Đã sao chép prompt thành công!');
      fetchPrompts(activeTab);
    }
  };

  const renderContent = () => (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleAddNew} className="bg-orange-500 hover:bg-orange-600 text-white">
          <PlusCircle className="w-4 h-4 mr-2" />
          Thêm Prompt Mới
        </Button>
      </div>
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Tên Prompt</TableHead>
              <TableHead className="w-[150px]">Sản phẩm</TableHead>
              <TableHead>Nội dung</TableHead>
              <TableHead className="w-[150px]">Ngày tạo</TableHead>
              <TableHead className="w-[120px] text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto w-6 h-6 animate-spin text-orange-500" />
                </TableCell>
              </TableRow>
            ) : prompts.length > 0 ? (
              prompts.map((prompt) => (
                <TableRow key={prompt.id}>
                  <TableCell className="font-medium">{prompt.name}</TableCell>
                  <TableCell>
                    {prompt.product ? (
                      <Badge variant="outline">{prompt.product.name}</Badge>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-sm truncate" title={prompt.content}>{prompt.content}</TableCell>
                  <TableCell>{new Date(prompt.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(prompt)} title="Chỉnh sửa">
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleCopy(prompt)} title="Sao chép">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDeleteRequest(prompt)} title="Xóa">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Chưa có prompt nào trong mục này.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const tabs = [
    { value: 'video', label: 'Prompt tạo Ảnh / Video', icon: <Video className="w-4 h-4 mr-2" /> },
    { value: 'voice', label: 'Prompt Tạo Voice', icon: <Mic className="w-4 h-4 mr-2" /> },
  ];

  return (
    <>
      <div className="w-full p-6 bg-gray-50/50">
        <div className="flex items-center gap-3 mb-6">
          <BookText className="w-7 h-7 text-orange-500" />
          <h1 className="text-2xl font-bold text-gray-800">Thư Viện Prompt</h1>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-gray-100 p-1 rounded-lg h-auto">
            {tabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors">
                {tab.icon} {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="video" className="mt-6">{renderContent()}</TabsContent>
          <TabsContent value="voice" className="mt-6">{renderContent()}</TabsContent>
        </Tabs>
      </div>

      <PromptFormDialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSave}
        prompt={promptToEdit}
        products={products}
        category={activeTab}
      />

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể được hoàn tác. Prompt "{promptToDelete?.name}" sẽ bị xóa vĩnh viễn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">Xóa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default PromptLibraryPage;