import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Upload, Play, Pause, Download, Loader2, Mic, FileAudio, Trash2, UserPlus } from "lucide-react";

const VoicePage = () => {
  const [activeTab, setActiveTab] = useState('tts');
  const [text, setText] = useState('Xin chào, đây là một thử nghiệm chuyển văn bản thành giọng nói.');
  const [voices, setVoices] = useState([]);
  const [clonedVoices, setClonedVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [stability, setStability] = useState(0.75);
  const [similarity, setSimilarity] = useState(0.95);
  const [style, setStyle] = useState(0.0);
  const [useSpeakerBoost, setUseSpeakerBoost] = useState(true);
  const [generatedAudio, setGeneratedAudio] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingVoices, setIsLoadingVoices] = useState(true);
  const audioRef = useRef(null);

  // Voice Clone State
  const [cloneFiles, setCloneFiles] = useState([]);
  const [cloneName, setCloneName] = useState('');
  const [isCloning, setIsCloning] = useState(false);

  const fetchVoices = async () => {
    setIsLoadingVoices(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: 'voices' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      const allVoices = data.voices || [];
      const predefinedVoices = allVoices.filter(v => v.category === 'premade');
      const cloned = allVoices.filter(v => v.category === 'cloned');
      
      setVoices(predefinedVoices);
      setClonedVoices(cloned);

      if (predefinedVoices.length > 0) {
        setSelectedVoice(predefinedVoices[0].voice_id);
      }
    } catch (error) {
      showError(`Lỗi khi tải danh sách giọng nói: ${error.message}`);
    } finally {
      setIsLoadingVoices(false);
    }
  };

  useEffect(() => {
    fetchVoices();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [generatedAudio]);

  const handleGenerate = async () => {
    if (!text || !selectedVoice) {
      showError("Vui lòng nhập văn bản và chọn một giọng nói.");
      return;
    }
    setIsLoading(true);
    setGeneratedAudio(null);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: {
          path: `text-to-speech/${selectedVoice}`,
          method: 'POST',
          payload: {
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability,
              similarity_boost: similarity,
              style,
              use_speaker_boost: useSpeakerBoost,
            },
          },
        },
      });

      if (error) throw new Error(`Lỗi function: ${error.message}`);
      if (data.error) throw new Error(data.error);
      
      // The function returns a base64 string, create a blob URL from it
      const audioBlob = new Blob([Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0))], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      setGeneratedAudio(audioUrl);
      showSuccess("Tạo audio thành công!");

    } catch (error) {
      showError(`Lỗi khi tạo audio: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
    }
  };

  const handleFileChange = (event) => {
    const newFiles = Array.from(event.target.files);
    if (cloneFiles.length + newFiles.length > 25) {
        showError("Bạn chỉ có thể tải lên tối đa 25 tệp.");
        return;
    }
    setCloneFiles(prev => [...prev, ...newFiles]);
  };

  const handleRemoveFile = (index) => {
    setCloneFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleCloneVoice = async () => {
    if (!cloneName.trim()) {
        showError("Vui lòng nhập tên cho giọng nói clone.");
        return;
    }
    if (cloneFiles.length === 0) {
        showError("Vui lòng tải lên ít nhất một tệp âm thanh.");
        return;
    }
    setIsCloning(true);
    try {
        const filesAsBase64 = await Promise.all(cloneFiles.map(file => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                    if (typeof reader.result === 'string') {
                        resolve({ name: file.name, data: reader.result.split(',')[1] });
                    } else {
                        reject(new Error('Failed to read file as data URL string.'));
                    }
                };
                reader.onerror = error => reject(error);
            });
        }));

        const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
            body: {
                path: 'voices/add',
                method: 'POST',
                payload: {
                    name: cloneName,
                    files: filesAsBase64,
                }
            }
        });

        if (error) throw new Error(`Lỗi function: ${error.message}`);
        if (data.error) throw new Error(data.error);

        showSuccess(`Tạo voice clone "${cloneName}" thành công!`);
        setCloneName('');
        setCloneFiles([]);
        fetchVoices(); // Refresh voice list
        setActiveTab('tts'); // Switch back to TTS tab

    } catch (error) {
        showError(`Lỗi khi clone voice: ${error.message}`);
    } finally {
        setIsCloning(false);
    }
  };

  const renderVoiceSelector = () => (
    <Select value={selectedVoice} onValueChange={setSelectedVoice} disabled={isLoadingVoices}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={isLoadingVoices ? "Đang tải giọng nói..." : "Chọn một giọng nói"} />
      </SelectTrigger>
      <SelectContent>
        {clonedVoices.length > 0 && (
          <>
            <h3 className="px-2 py-1.5 text-sm font-semibold text-gray-500">Giọng nói của bạn</h3>
            {clonedVoices.map(voice => (
              <SelectItem key={voice.voice_id} value={voice.voice_id}>{voice.name}</SelectItem>
            ))}
          </>
        )}
        <h3 className="px-2 py-1.5 text-sm font-semibold text-gray-500">Giọng nói có sẵn</h3>
        {voices.map(voice => (
          <SelectItem key={voice.voice_id} value={voice.voice_id}>{voice.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="w-full h-full flex flex-col p-6 bg-gray-50/50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Tạo Voice</h1>
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-gray-100 p-1 rounded-lg h-auto">
              <TabsTrigger value="tts" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Mic className="w-4 h-4 mr-2" /> Tạo Voice (TTS)</TabsTrigger>
              <TabsTrigger value="clone" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><UserPlus className="w-4 h-4 mr-2" /> Voice Clone</TabsTrigger>
            </TabsList>
            <TabsContent value="tts" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Chuyển văn bản thành giọng nói</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Giọng nói</label>
                    {renderVoiceSelector()}
                  </div>
                  <div>
                    <label htmlFor="tts-text" className="text-sm font-medium text-gray-700 mb-2 block">Văn bản</label>
                    <Textarea id="tts-text" placeholder="Nhập văn bản của bạn ở đây..." value={text} onChange={(e) => setText(e.target.value)} className="min-h-[150px]" />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleGenerate} disabled={isLoading}>
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mic className="mr-2 h-4 w-4" />}
                      {isLoading ? 'Đang tạo...' : 'Tạo Audio'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="clone" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tạo một Giọng nói mới (Voice Clone)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <Alert>
                    <FileAudio className="h-4 w-4" />
                    <AlertTitle>Hướng dẫn</AlertTitle>
                    <AlertDescription>
                      Tải lên các mẫu âm thanh (tối đa 25 tệp, tổng dung lượng dưới 100MB) của một giọng nói duy nhất. Để có kết quả tốt nhất, hãy đảm bảo âm thanh rõ ràng và không có tiếng ồn xung quanh.
                    </AlertDescription>
                  </Alert>
                  <div>
                    <label htmlFor="clone-name" className="text-sm font-medium text-gray-700 mb-2 block">Tên giọng nói</label>
                    <Input id="clone-name" placeholder="Ví dụ: Giọng đọc của tôi" value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Tệp âm thanh mẫu</label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-orange-600 hover:text-orange-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-orange-500">
                        <span>Tải lên tệp</span>
                        <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="audio/*" onChange={handleFileChange} />
                      </label>
                      <p className="text-xs text-gray-500 mt-1">MP3, WAV, FLAC, etc. (Tối đa 100MB)</p>
                    </div>
                    <div className="mt-4 space-y-2">
                      {cloneFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-gray-100 p-2 rounded-md">
                          <div className="flex items-center gap-2">
                            <FileAudio className="h-5 w-5 text-gray-500" />
                            <span className="text-sm text-gray-800">{file.name}</span>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveFile(index)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleCloneVoice} disabled={isCloning}>
                      {isCloning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                      {isCloning ? 'Đang tạo...' : 'Tạo Voice Clone'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cài đặt giọng nói</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-4 block">Độ ổn định: <span className="font-normal text-gray-600">{stability}</span></label>
                <Slider defaultValue={[0.75]} max={1} step={0.01} onValueChange={(value) => setStability(value[0])} />
                <p className="text-xs text-gray-500 mt-2">Tăng để giọng nói ổn định hơn, giảm để biểu cảm hơn.</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-4 block">Độ tương đồng: <span className="font-normal text-gray-600">{similarity}</span></label>
                <Slider defaultValue={[0.95]} max={1} step={0.01} onValueChange={(value) => setSimilarity(value[0])} />
                <p className="text-xs text-gray-500 mt-2">Tăng để giọng nói giống với bản gốc hơn.</p>
              </div>
               <div>
                <label className="text-sm font-medium text-gray-700 mb-4 block">Khuếch đại phong cách: <span className="font-normal text-gray-600">{style}</span></label>
                <Slider defaultValue={[0.0]} max={1} step={0.01} onValueChange={(value) => setStyle(value[0])} />
                <p className="text-xs text-gray-500 mt-2">Khuếch đại phong cách của giọng nói (chỉ hoạt động trên v2).</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Kết quả</CardTitle>
            </CardHeader>
            <CardContent>
              {generatedAudio ? (
                <div className="space-y-4">
                  <audio ref={audioRef} src={generatedAudio} className="w-full"></audio>
                  <div className="flex items-center justify-center gap-4">
                    <Button onClick={handlePlayPause} size="lg" className="rounded-full w-16 h-16">
                      {isPlaying ? <Pause className="h-8 w-8" /> : <Play className="h-8 w-8" />}
                    </Button>
                    <a href={generatedAudio} download="generated_audio.mp3">
                      <Button variant="outline" size="lg">
                        <Download className="mr-2 h-5 w-5" /> Tải xuống
                      </Button>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-500 py-10">
                  <p>Audio được tạo sẽ xuất hiện ở đây.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VoicePage;