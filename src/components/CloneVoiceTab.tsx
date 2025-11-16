import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UploadCloud, UserPlus, Trash2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
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

const CloneVoiceTab = ({ apiKey }) => {
  const [file, setFile] = useState(null);
  const [voiceName, setVoiceName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [clonedVoices, setClonedVoices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceToDelete, setVoiceToDelete] = useState(null);

  const fetchClonedVoices = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: 'v1m/voice/clone', token: apiKey, method: 'GET' }
      });
      if (error) throw error;
      if (data.success) {
        setClonedVoices(data.data);
      } else {
        throw new Error(data.error || 'Failed to fetch cloned voices');
      }
    } catch (error) {
      showError(`Lỗi tải danh sách voice clone: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    fetchClonedVoices();
  }, [fetchClonedVoices]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type === 'audio/mpeg' && selectedFile.size <= 20 * 1024 * 1024) {
      setFile(selectedFile);
    } else {
      showError('Vui lòng chọn tệp MP3 và dung lượng dưới 20MB.');
      setFile(null);
    }
  };

  const handleClone = async () => {
    if (!file || !voiceName) {
      showError('Vui lòng chọn tệp âm thanh và nhập tên cho giọng nói.');
      return;
    }
    setIsUploading(true);
    const formData = new FormData();
    formData.append('path', 'v1m/voice/clone');
    formData.append('token', apiKey);
    formData.append('method', 'POST');
    formData.append('file', file);
    formData.append('voice_name', voiceName);

    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        headers: { 'Content-Type': 'multipart/form-data' },
        body: formData,
      });
      if (error) throw error;
      if (data.success) {
        showSuccess('Clone voice thành công! Giọng nói mới sẽ sớm có sẵn.');
        setFile(null);
        setVoiceName('');
        (document.getElementById('audio-upload') as HTMLInputElement).value = '';
        setTimeout(fetchClonedVoices, 3000);
      } else {
        throw new Error(data.error || 'Clone voice thất bại.');
      }
    } catch (error) {
      showError(`Lỗi clone voice: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!voiceToDelete) return;
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: `v1m/voice/clone/${voiceToDelete.voice_id}`, token: apiKey, method: 'DELETE' }
      });
      if (error) throw error;
      if (data.success) {
        showSuccess('Đã xóa voice clone.');
        fetchClonedVoices();
      } else {
        throw new Error(data.error || 'Xóa voice clone thất bại.');
      }
    } catch (error) {
      showError(`Lỗi xóa voice: ${error.message}`);
    } finally {
      setVoiceToDelete(null);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tạo Voice Clone Mới</CardTitle>
            <CardDescription>Tải lên một tệp âm thanh (MP3, dưới 20MB) để tạo ra một phiên bản giọng nói của riêng bạn.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-6 items-end">
            <div className="space-y-2">
              <Label htmlFor="audio-upload">Tệp âm thanh (MP3)</Label>
              <Input id="audio-upload" type="file" accept=".mp3" onChange={handleFileChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="voice-name">Tên giọng nói</Label>
              <Input id="voice-name" type="text" placeholder="VD: Giọng đọc của tôi" value={voiceName} onChange={(e) => setVoiceName(e.target.value)} />
            </div>
            <Button onClick={handleClone} disabled={isUploading || !file || !voiceName} className="bg-orange-500 hover:bg-orange-600 text-white">
              {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Bắt đầu Clone
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Danh sách Voice Đã Clone</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div> : clonedVoices.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {clonedVoices.map(voice => (
                  <div key={voice.voice_id} className="relative group border rounded-lg p-4 flex flex-col items-center text-center space-y-2">
                    <img src={voice.cover_url || '/placeholder.svg'} alt={voice.voice_name} className="w-20 h-20 rounded-full object-cover bg-gray-200" />
                    <p className="font-semibold">{voice.voice_name}</p>
                    <audio controls src={voice.sample_audio} className="w-full h-8" />
                    <Button variant="destructive" size="icon" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8" onClick={() => setVoiceToDelete(voice)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">Bạn chưa clone giọng nói nào.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <AlertDialog open={!!voiceToDelete} onOpenChange={(open) => !open && setVoiceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle><AlertDialogDescription>Hành động này sẽ xóa vĩnh viễn voice clone "{voiceToDelete?.voice_name}" và không thể hoàn tác.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Xóa</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CloneVoiceTab;