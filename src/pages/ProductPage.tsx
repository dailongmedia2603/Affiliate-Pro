import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Search, PlusCircle, Package, Loader2, Edit, Trash2, ExternalLink } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import ProductFormDialog from '@/components/ProductFormDialog';
import SubProductFormDialog from '@/components/SubProductFormDialog';
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
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  user_id?: string;
};

type SubProduct = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  product_link: string | null;
  price: number | null;
  product_id: string;
  user_id?: string;
  is_active: boolean;
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

  const [subProducts, setSubProducts] = useState<SubProduct[]>([]);
  const [loadingSubProducts, setLoadingSubProducts] = useState(false);
  const [isSubProductFormOpen, setIsSubProductFormOpen] = useState(false);
  const [subProductToEdit, setSubProductToEdit] = useState<SubProduct | null>(null);
  const [isSubProductAlertOpen, setIsSubProductAlertOpen] = useState(false);
  const [subProductToDelete, setSubProductToDelete] = useState<SubProduct | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const fetchProducts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase.from('products').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) {
      showError('Không thể tải danh sách sản phẩm.');
    } else {
      setProducts(data);
      if (data.length > 0 && !selectedProduct) {
        setSelectedProduct(data[0]);
      }
    }
    setLoading(false);
  };

  const fetchSubProducts = async (productId: string) => {
    setLoadingSubProducts(true);
    const { data, error } = await supabase.from('sub_products').select('*').eq('product_id', productId).order('created_at', { ascending: false });
    if (error) {
      showError('Không thể tải danh sách sản phẩm con.');
    } else {
      setSubProducts(data);
    }
    setLoadingSubProducts(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchProducts();
  }, []);

  useEffect(() => {
    if (selectedProduct) {
      fetchSubProducts(selectedProduct.id);
    } else {
      setSubProducts([]);
    }
  }, [selectedProduct]);

  const filteredProducts = useMemo(() => products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())), [products, searchTerm]);

  useEffect(() => {
    if (!selectedProduct || !filteredProducts.some(p => p.id === selectedProduct.id)) {
      setSelectedProduct(filteredProducts.length > 0 ? filteredProducts[0] : null);
    }
  }, [filteredProducts, selectedProduct]);

  const handleAddNew = () => { setProductToEdit(null); setIsFormOpen(true); };
  const handleEdit = (product: Product) => { setProductToEdit(product); setIsFormOpen(true); };
  const handleDeleteRequest = (product: Product) => { setProductToDelete(product); setIsAlertOpen(true); };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;
    const { error } = await supabase.from('products').delete().eq('id', productToDelete.id);
    if (error) { showError('Xóa sản phẩm thất bại.'); } 
    else {
      showSuccess('Sản phẩm đã được xóa.');
      await fetchProducts();
      if (selectedProduct?.id === productToDelete.id) {
        setSelectedProduct(products.length > 1 ? products.find(p => p.id !== productToDelete.id) || null : null);
      }
    }
    setIsAlertOpen(false);
    setProductToDelete(null);
  };

  const handleSave = async (productData: Product) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showError('Bạn cần đăng nhập để thực hiện.'); return; }
    const dataToSave = { name: productData.name, description: productData.description, image_url: productData.image_url, user_id: user.id };
    const { error } = productData.id ? await supabase.from('products').update(dataToSave).eq('id', productData.id) : await supabase.from('products').insert(dataToSave);
    if (error) { showError('Lưu sản phẩm thất bại.'); } 
    else {
      showSuccess(`Sản phẩm đã được ${productData.id ? 'cập nhật' : 'tạo mới'}.`);
      await fetchProducts();
    }
    setIsFormOpen(false);
  };

  const handleAddNewSubProduct = () => { setSubProductToEdit(null); setIsSubProductFormOpen(true); };
  const handleEditSubProduct = (subProduct: SubProduct) => { setSubProductToEdit(subProduct); setIsSubProductFormOpen(true); };
  const handleDeleteSubProductRequest = (subProduct: SubProduct) => { setSubProductToDelete(subProduct); setIsSubProductAlertOpen(true); };

  const handleDeleteSubProductConfirm = async () => {
    if (!subProductToDelete) return;
    const { error } = await supabase.from('sub_products').delete().eq('id', subProductToDelete.id);
    if (error) { showError('Xóa sản phẩm con thất bại.'); } 
    else {
      showSuccess('Sản phẩm con đã được xóa.');
      if (selectedProduct) fetchSubProducts(selectedProduct.id);
    }
    setIsSubProductAlertOpen(false);
    setSubProductToDelete(null);
  };

  const handleSaveSubProduct = async (subProductData: Omit<SubProduct, 'id' | 'product_id' | 'user_id' | 'is_active'> & { id?: string }) => {
    if (!selectedProduct) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showError('Bạn cần đăng nhập để thực hiện.'); return; }
    const dataToSave = { ...subProductData, product_id: selectedProduct.id, user_id: user.id };
    const { error } = subProductData.id ? await supabase.from('sub_products').update(dataToSave).eq('id', subProductData.id) : await supabase.from('sub_products').insert(dataToSave);
    if (error) { showError('Lưu sản phẩm con thất bại.'); } 
    else {
      showSuccess(`Sản phẩm con đã được ${subProductData.id ? 'cập nhật' : 'tạo mới'}.`);
      fetchSubProducts(selectedProduct.id);
    }
    setIsSubProductFormOpen(false);
  };

  const handleToggleActive = async (subProduct: SubProduct) => {
    const newStatus = !subProduct.is_active;
    const { error } = await supabase
      .from('sub_products')
      .update({ is_active: newStatus })
      .eq('id', subProduct.id);

    if (error) {
      showError('Cập nhật trạng thái thất bại.');
    } else {
      showSuccess(`Sản phẩm con đã được ${newStatus ? 'kích hoạt' : 'tắt'}.`);
      setSubProducts(prev => 
        prev.map(sp => 
          sp.id === subProduct.id ? { ...sp, is_active: newStatus } : sp
        )
      );
    }
  };

  return (
    <>
      <div className="w-full h-full flex p-6 gap-6 bg-gray-50/50">
        {/* Left Column Card */}
        <div className="w-[400px] bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden flex-shrink-0">
          <div className="p-4 border-b border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">Sản phẩm</h2>
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={handleAddNew}><PlusCircle className="w-4 h-4 mr-2" />Thêm sản phẩm</Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input type="text" placeholder="Tìm kiếm sản phẩm..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loading ? <div className="flex justify-center items-center h-full"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div> : filteredProducts.map(product => (
              <button key={product.id} onClick={() => setSelectedProduct(product)} className={`w-full text-left p-3 rounded-lg transition-colors flex items-center gap-3 ${selectedProduct?.id === product.id ? 'bg-orange-100 text-orange-700' : 'hover:bg-gray-100'}`}>
                <img src={product.image_url || '/placeholder.svg'} alt={product.name} className="w-10 h-10 rounded-md object-cover bg-gray-200" />
                <span className="font-semibold flex-1 truncate">{product.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column Card */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6">
            {selectedProduct ? (
              <div className="space-y-6">
                <div className="flex justify-between items-start border-b pb-4">
                  <div className="mr-4">
                    <h2 className="text-3xl font-bold text-gray-800">{selectedProduct.name}</h2>
                    <p className="text-gray-600 mt-1">{selectedProduct.description || 'Chưa có mô tả cho sản phẩm này.'}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => handleEdit(selectedProduct)}>
                      <Edit className="w-4 h-4 text-gray-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => handleDeleteRequest(selectedProduct)}>
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-gray-700">Danh sách sản phẩm con</h3>
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={handleAddNewSubProduct}><PlusCircle className="w-4 h-4 mr-2" />Thêm sản phẩm con</Button>
                </div>
                {loadingSubProducts ? <div className="flex justify-center items-center py-10"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div> : subProducts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {subProducts.map(sub => (
                      <Card key={sub.id} className={`overflow-hidden flex flex-col transition-all ${!sub.is_active ? 'bg-gray-100' : 'bg-white'}`}>
                        <div className={`relative ${!sub.is_active ? 'opacity-50' : ''}`}>
                          <button onClick={() => sub.image_url && setSelectedImage(sub.image_url)} className="w-full h-40 block cursor-pointer">
                            <img src={sub.image_url || '/placeholder.svg'} alt={sub.name} className="w-full h-full object-cover bg-gray-200" />
                          </button>
                        </div>
                        <CardHeader className="flex-row items-start justify-between pb-2">
                          <CardTitle className="text-lg font-semibold leading-tight truncate flex-1">{sub.name}</CardTitle>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => handleEditSubProduct(sub)}><Edit className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500" onClick={() => handleDeleteSubProductRequest(sub)}><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col justify-between">
                          <p className="text-sm text-gray-500 h-10 overflow-hidden">{sub.description || 'Không có mô tả.'}</p>
                          <div className="flex justify-between items-center mt-4">
                            <span className="text-lg font-bold text-orange-600">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(sub.price || 0)}</span>
                            {sub.product_link && <a href={sub.product_link} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-2" /> Link</Button></a>}
                          </div>
                        </CardContent>
                        <CardFooter className="p-3 bg-gray-50 border-t">
                          <div className="flex items-center justify-between w-full">
                              <Label htmlFor={`active-switch-${sub.id}`} className="text-sm font-medium text-gray-600 cursor-pointer">
                                  {sub.is_active ? 'Đang hoạt động' : 'Đã tắt'}
                              </Label>
                              <Switch
                                  id={`active-switch-${sub.id}`}
                                  checked={sub.is_active}
                                  onCheckedChange={() => handleToggleActive(sub)}
                              />
                          </div>
                        </CardFooter>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 border-2 border-dashed rounded-lg"><p className="text-gray-500">Chưa có sản phẩm con nào.</p><p className="text-sm text-gray-400">Hãy bắt đầu bằng cách thêm một sản phẩm con mới.</p></div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                <Package className="w-16 h-16 mb-4" />
                <h3 className="text-xl font-semibold">{loading ? 'Đang tải sản phẩm...' : 'Không tìm thấy sản phẩm'}</h3>
                <p>{loading ? 'Vui lòng chờ trong giây lát.' : 'Hãy thử lại với từ khóa khác hoặc thêm sản phẩm mới.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <ProductFormDialog isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} onSave={handleSave} product={productToEdit} />
      <SubProductFormDialog isOpen={isSubProductFormOpen} onClose={() => setIsSubProductFormOpen(false)} onSave={handleSaveSubProduct} subProduct={subProductToEdit} />
      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle><AlertDialogDescription>Hành động này không thể được hoàn tác. Sản phẩm "{productToDelete?.name}" sẽ bị xóa vĩnh viễn.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">Xóa</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isSubProductAlertOpen} onOpenChange={setIsSubProductAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle><AlertDialogDescription>Hành động này không thể được hoàn tác. Sản phẩm con "{subProductToDelete?.name}" sẽ bị xóa vĩnh viễn.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction onClick={handleDeleteSubProductConfirm} className="bg-red-600 hover:bg-red-700">Xóa</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!selectedImage} onOpenChange={(isOpen) => !isOpen && setSelectedImage(null)}>
        <DialogContent className="max-w-5xl w-auto p-0 bg-transparent border-none shadow-none">
          <img src={selectedImage || ''} alt="Xem trước ảnh" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ProductPage;