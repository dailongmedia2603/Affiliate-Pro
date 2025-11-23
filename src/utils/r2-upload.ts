import { supabase } from '@/integrations/supabase/client';

export const uploadToR2 = async (file: File): Promise<string> => {
  // 1. Get presigned URL from our new Edge Function
  const fileName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;
  const { data, error } = await supabase.functions.invoke('r2-generate-presigned-url', {
    body: { fileName, fileType: file.type },
  });

  if (error || data.error) {
    throw new Error(error?.message || data.error);
  }

  const { presignedUrl, finalUrl } = data;

  // 2. Upload the file directly to R2 using the presigned URL
  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Lỗi tải tệp lên R2: ${errorText}`);
  }

  // 3. Return the public URL of the file
  return finalUrl;
};