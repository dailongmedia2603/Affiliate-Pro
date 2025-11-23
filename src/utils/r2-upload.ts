import { supabase } from '@/integrations/supabase/client';

export const uploadToR2 = async (file: File): Promise<string> => {
  const fileName = `${Date.now()}_${file.name.replace(/\s/g, '_')}`;

  const { data, error } = await supabase.functions.invoke('r2-upload-proxy', {
    headers: {
      'x-file-name': fileName,
      'x-file-type': file.type,
    },
    body: file,
  });

  if (error || data.error) {
    throw new Error(error?.message || data.error);
  }

  return data.finalUrl;
};