import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlusCircle, Users, Trash2, Edit } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import AddAccountDialog from '@/components/AddAccountDialog';
import EditAccountDialog from '@/components/EditAccountDialog';
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
import { User } from '@supabase/supabase-js';

type AppUser = {
  id: string;
  email: string;
  user_metadata: {
    name?: string;
  };
  created_at: string;
};

const AccountsPage = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<AppUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-users');
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setUsers(data.users || []);
    } catch (err) {
      showError(`Không thể tải danh sách người dùng: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    }
    getCurrentUser();
    fetchUsers();
  }, [fetchUsers]);

  const handleSave = async (userData) => {
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: userData,
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      showSuccess('Đã tạo tài khoản thành công!');
      fetchUsers();
      setIsAddDialogOpen(false);
    } catch (err) {
      showError(`Tạo tài khoản thất bại: ${err.message}`);
    }
  };

  const handleUpdate = async (userData: { userId: string; name: string }) => {
    try {
      const { data, error } = await supabase.functions.invoke('update-user', {
        body: userData,
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      showSuccess('Đã cập nhật tài khoản thành công!');
      fetchUsers();
      setIsEditDialogOpen(false);
    } catch (err) {
      showError(`Cập nhật tài khoản thất bại: ${err.message}`);
    }
  };

  const handleEditRequest = (user: AppUser) => {
    setUserToEdit(user);
    setIsEditDialogOpen(true);
  };

  const handleDeleteRequest = (user: AppUser) => {
    setUserToDelete(user);
  };

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return;
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: userToDelete.id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      showSuccess('Đã xóa tài khoản thành công!');
      fetchUsers();
    } catch (err) {
      showError(`Xóa tài khoản thất bại: ${err.message}`);
    } finally {
      setUserToDelete(null);
    }
  };

  return (
    <>
      <div className="w-full p-6 bg-gray-50/50">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Users className="w-7 h-7 text-orange-500" />
            <h1 className="text-2xl font-bold text-gray-800">Quản lý Tài khoản</h1>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
            <PlusCircle className="w-4 h-4 mr-2" />
            Thêm tài khoản
          </Button>
        </div>
        <div className="border rounded-lg bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ngày tạo</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <Loader2 className="mx-auto w-6 h-6 animate-spin text-orange-500" />
                  </TableCell>
                </TableRow>
              ) : users.length > 0 ? (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.user_metadata?.name || 'N/A'}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleEditRequest(user)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleDeleteRequest(user)} disabled={user.id === currentUser?.id}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    Chưa có tài khoản nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <AddAccountDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSave={handleSave}
      />
      <EditAccountDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={handleUpdate}
        user={userToEdit}
      />
      <AlertDialog open={!!userToDelete} onOpenChange={(isOpen) => { if (!isOpen) setUserToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể được hoàn tác. Tài khoản "{userToDelete?.email}" sẽ bị xóa vĩnh viễn.
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

export default AccountsPage;