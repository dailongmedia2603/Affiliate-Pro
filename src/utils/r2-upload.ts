import { supabase } from '@/integrations/supabase/client';

export const uploadToR2 = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  const { data, error } = await supabase.functions.invoke('r2-upload-proxy', {
    body: formData,
  });

  if (error) {
    throw new Error(`Lỗi tải lên: ${error.message}`);
  }
  if (data.error) {
    throw new Error(`Lỗi từ server tải lên: ${data.error}`);
  }
  if (!data.finalUrl) {
    throw new Error('Không nhận được URL cuối cùng từ server.');
  }

  return data.finalUrl;
};