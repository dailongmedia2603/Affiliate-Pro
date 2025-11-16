import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, PlusCircle, Package, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import ProductFormDialog from '@/components/ProductFormDialog';
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

type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  user_id?: string;
};

const ProductPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  const fetchProducts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      showError('Không thể tải danh sách sản phẩm.');
      console.error(error);
    } else {
      setProducts(data);
      if (data.length > 0 && !selectedProduct) {
        setSelectedProduct(data[0]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter(product =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  useEffect(() => {
    if (!selectedProduct || !filteredProducts.some(p => p.id === selectedProduct.id)) {
      setSelectedProduct(filteredProducts.length > 0 ? filteredProducts[0] : null);
    }
  }, [filteredProducts, selectedProduct]);

  const handleAddNew = () => {
    setProductToEdit(null);
    setIsFormOpen(true);
  };

  const handleEdit = (product: Product) => {
    setProductToEdit(product);
    setIsFormOpen(true);
  };

  const handleDeleteRequest = (product: Product) => {
    setProductToDelete(product);
    setIsAlertOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;

    const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);

    if (error) {
      showError('Xóa sản phẩm thất bại.');
    } else {
      showSuccess('Sản phẩm đã được xóa.');
      await fetchProducts();
      // Reset selection if the deleted product was selected
      if (selectedProduct?.id === productToDelete.id) {
        setSelectedProduct(products.length > 1 ? products.find(p => p.id !== productToDelete.id) || null : null);
      }
    }
    setIsAlertOpen(false);
    setProductToDelete(null);
  };

  const handleSave = async (productData: Product) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError('Bạn cần đăng nhập để thực hiện.');
      return;
    }

    const dataToSave = {
      name: productData.name,
      description: productData.description,
      image_url: productData.image_url,
      user_id: user.id,
    };

    let error;
    if (productData.id) { // Update
      ({ error } = await supabase.from('products').update(dataToSave).eq('id', productData.id));
    } else { // Insert
      ({ error } = await supabase.from('products').insert(dataToSave));
    }

    if (error) {
      showError('Lưu sản phẩm thất bại.');
    } else {
      showSuccess(`Sản phẩm đã được ${productData.id ? 'cập nhật' : 'tạo mới'}.`);
      await fetchProducts();
    }
    setIsFormOpen(false);
  };

  return (
    <>
      <div className="w-full h-full flex bg-gray-50/50">
        {/* Left Column: Product List */}
        <div className="w-[400px] border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Sản phẩm</h2>
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={handleAddNew}>
                <PlusCircle className="w-4 h-4 mr-2" />
                Thêm sản phẩm
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Tìm kiếm sản phẩm..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {loading ? (
              <div className="flex justify-center items-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              </div>
            ) : (
              filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${
                    selectedProduct?.id === product.id
                      ? 'bg-orange-100 text-orange-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <img src={product.image_url || '/placeholder.svg'} alt={product.name} className="w-10 h-10 rounded-md object-cover bg-gray-200" />
                  <span className="font-semibold flex-1 truncate">{product.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Product Details */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selectedProduct ? (
            <Card className="border-none shadow-none bg-transparent">
              <CardHeader>
                <CardTitle className="text-2xl">{selectedProduct.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <img src={selectedProduct.image_url || '/placeholder.svg'} alt={selectedProduct.name} className="w-full h-64 rounded-lg object-cover mb-4 bg-gray-200" />
                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Mô tả sản phẩm</h3>
                  <p className="text-gray-600">{selectedProduct.description || 'Chưa có mô tả cho sản phẩm này.'}</p>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" className="text-red-600 border-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => handleDeleteRequest(selectedProduct)}>Xóa</Button>
                  <Button className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => handleEdit(selectedProduct)}>Chỉnh sửa</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <Package className="w-16 h-16 mb-4" />
              <h3 className="text-xl font-semibold">
                {loading ? 'Đang tải sản phẩm...' : 'Không tìm thấy sản phẩm'}
              </h3>
              <p>
                {loading ? 'Vui lòng chờ trong giây lát.' : 'Hãy thử lại với từ khóa khác hoặc thêm sản phẩm mới.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <ProductFormDialog
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSave={handleSave}
        product={productToEdit}
      />

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể được hoàn tác. Sản phẩm "{productToDelete?.name}" sẽ bị xóa vĩnh viễn.
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

export default ProductPage;