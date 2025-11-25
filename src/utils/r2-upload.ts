import { supabase } from '@/integrations/supabase/client';

export const uploadToR2 = async (file: File): Promise<string> => {
  console.log(`[uploadToSupabase] Uploading '${file.name}' via signed URL...`);

  // 1. Lấy một URL đã ký từ function của chúng ta.
  const { data: signedUrlData, error: signedUrlError } = await supabase.functions.invoke('storage-generate-upload-url', {
    body: { fileName: file.name },
  });

  if (signedUrlError) {
    throw new Error(`Không thể lấy signed URL: ${signedUrlError.message}`);
  }
  if (signedUrlData.error) {
    throw new Error(`Lỗi từ function signed URL: ${signedUrlData.error}`);
  }

  const { signedUrl, path } = signedUrlData;

  // 2. Tải file trực tiếp lên Supabase Storage bằng URL đã ký.
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tải file trực tiếp thất bại: ${errorText}`);
  }

  // 3. Lấy URL công khai của file đã tải lên.
  const { data: publicUrlData } = supabase.storage.from('images').getPublicUrl(path);
  
  if (!publicUrlData.publicUrl) {
    throw new Error("Không thể lấy URL công khai cho file đã tải lên.");
  }

  console.log(`[uploadToSupabase] Tải lên thành công. URL công khai: ${publicUrlData.publicUrl}`);
  return publicUrlData.publicUrl;
};