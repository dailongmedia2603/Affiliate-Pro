import { supabase } from '@/integrations/supabase/client';

export const uploadToR2 = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  console.log(`[uploadToR2] Uploading '${file.name}' via proxy function...`);

  const { data, error } = await supabase.functions.invoke('r2-upload-proxy', {
    body: formData,
  });

  if (error) {
    throw new Error(error.message);
  }
  if (data.error) {
    throw new Error(data.error);
  }
  if (!data.finalUrl) {
    throw new Error("Proxy function did not return a final URL.");
  }

  console.log(`[uploadToR2] Proxy upload successful. Final URL: ${data.finalUrl}`);
  return data.finalUrl;
};