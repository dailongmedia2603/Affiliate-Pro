import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, Film, Mic, CheckCircle, XCircle, Loader2 } from "lucide-react";

const SettingsPage = () => {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiApiUrl, setGeminiApiUrl] = useState('https://aquarius.qcv.vn/api/chat');
  const [higgsfieldCookie, setHiggsfieldCookie] = useState('');
  const [higgsfieldClerkContext, setHiggsfieldClerkContext] = useState('');
  const [voiceApiKey, setVoiceApiKey] = useState('');
  const [voiceCredits, setVoiceCredits] = useState<number | null>(null);
  const [testPrompt, setTestPrompt] = useState('Nguyễn Quang Hải là ai ?');
  const [testResult, setTestResult] = useState('');
  const [isLoadingApiTest, setIsLoadingApiTest] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [geminiConnectionStatus, setGeminiConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isCheckingVoiceConnection, setIsCheckingVoiceConnection] = useState(false);
  const [isFetchingCredits, setIsFetchingCredits] = useState(false);
  const [voiceConnectionStatus, setVoiceConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTestingHiggsfield, setIsTestingHiggsfield] = useState(false);
  const [higgsfieldConnectionStatus, setHiggsfieldConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const fetchVoiceCredits = async () => {
    if (!voiceApiKey) return;
    setIsFetchingCredits(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: 'credits' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.success) {
        setVoiceCredits(data.credits);
      } else {
        throw new Error('Không thể lấy thông tin credits.');
      }
    } catch (error) {
      showError(`Lỗi khi lấy credits: ${error.message}`);
      setVoiceCredits(null);
    } finally {
      setIsFetchingCredits(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('user_settings')
          .select('gemini_api_key, gemini_api_url, voice_api_key, higgsfield_cookie, higgsfield_clerk_context')
          .eq('id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          showError('Không thể tải cài đặt.');
        }
        if (data) {
          setGeminiApiKey(data.gemini_api_key || '');
          setGeminiApiUrl(data.gemini_api_url || 'https://aquarius.qcv.vn/api/chat');
          setVoiceApiKey(data.voice_api_key || '');
          setHiggsfieldCookie(data.higgsfield_cookie || '');
          setHiggsfieldClerkContext(data.higgsfield_clerk_context || '');
          if (data.voice_api_key) {
            fetchVoiceCredits();
          }
        }
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSettings = async (apiKeyType: 'gemini' | 'higgsfield' | 'voice') => {
    setIsSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showError("Bạn cần đăng nhập để lưu cài đặt.");
      setIsSaving(false);
      return;
    }

    let updateData;
    switch (apiKeyType) {
      case 'gemini':
        updateData = { gemini_api_key: geminiApiKey, gemini_api_url: geminiApiUrl };
        break;
      case 'higgsfield':
        updateData = { higgsfield_cookie: higgsfieldCookie, higgsfield_clerk_context: higgsfieldClerkContext };
        break;
      case 'voice':
        updateData = { voice_api_key: voiceApiKey };
        break;
    }

    const { error } = await supabase
      .from('user_settings')
      .upsert({ id: user.id, ...updateData });

    if (error) {
      showError(`Lỗi khi lưu cài đặt: ${error.message}`);
    } else {
      showSuccess("Đã lưu cài đặt thành công!");
      if (apiKeyType === 'voice') {
        fetchVoiceCredits();
      }
    }
    setIsSaving(false);
  };

  const handleTestGeminiApi = async () => {
    if (!geminiApiKey || !geminiApiUrl) {
      setGeminiConnectionStatus('error');
      setTestResult('Vui lòng nhập API key và URL trước khi kiểm tra.');
      return;
    }
    setIsLoadingApiTest(true);
    setGeminiConnectionStatus('idle');
    setTestResult('');

    try {
      const { data, error } = await supabase.functions.invoke('proxy-gemini-api', {
        body: { apiUrl: geminiApiUrl, prompt: testPrompt, token: geminiApiKey },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setGeminiConnectionStatus('success');
      setTestResult(data);
    } catch (error) {
      setGeminiConnectionStatus('error');
      setTestResult(`Lỗi: ${error.message}`);
    } finally {
      setIsLoadingApiTest(false);
    }
  };

  const handleTestVoiceConnection = async () => {
    if (!voiceApiKey) {
      setVoiceConnectionStatus('error');
      return;
    }
    setIsCheckingVoiceConnection(true);
    setVoiceConnectionStatus('idle');
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: 'health-check' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.success && (data.data.minimax === 'good' || data.data.minimax === 'degraded')) {
        setVoiceConnectionStatus('success');
        showSuccess('Kết nối API Voice thành công!');
        fetchVoiceCredits();
      } else {
        throw new Error(`Dịch vụ không khả dụng: ${JSON.stringify(data.data)}`);
      }
    } catch (error) {
      setVoiceConnectionStatus('error');
      showError(`Lỗi kết nối: ${error.message}`);
    } finally {
      setIsCheckingVoiceConnection(false);
    }
  };

  const handleTestHiggsfieldConnection = async () => {
    if (!higgsfieldCookie || !higgsfieldClerkContext) {
      setHiggsfieldConnectionStatus('error');
      showError('Vui lòng nhập đầy đủ Cookie và Clerk Context.');
      return;
    }
    setIsTestingHiggsfield(true);
    setHiggsfieldConnectionStatus('idle');
    try {
      const { data, error } = await supabase.functions.invoke('higgsfield-python-proxy', {
        body: { action: 'test_connection' },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.success) {
        setHiggsfieldConnectionStatus('success');
        showSuccess('Kết nối API Higgsfield thành công!');
      } else {
        throw new Error('Kiểm tra kết nối thất bại.');
      }
    } catch (error) {
      setHiggsfieldConnectionStatus('error');
      showError(`Lỗi kết nối Higgsfield: ${error.message}`);
    } finally {
      setIsTestingHiggsfield(false);
    }
  };

  return (
    <div className="w-full p-6 bg-gray-50/50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Cài Đặt</h1>
      <Tabs defaultValue="gemini">
        <TabsList className="bg-gray-100 p-1 rounded-lg h-auto">
          <TabsTrigger value="gemini" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Sparkles className="w-4 h-4 mr-2" /> API Gemini</TabsTrigger>
          <TabsTrigger value="higgsfield" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Film className="w-4 h-4 mr-2" /> API Higgsfield</TabsTrigger>
          <TabsTrigger value="voice" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Mic className="w-4 h-4 mr-2" /> API Voice</TabsTrigger>
        </TabsList>
        <TabsContent value="gemini" className="mt-6">
          <div className="p-6 border rounded-lg bg-white space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Gemini</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Nhập API key và URL của bạn để kết nối với dịch vụ của Google Gemini.</p>
              <div className="space-y-4 max-w-md">
                <div className="space-y-2"><label htmlFor="gemini-api-url" className="text-sm font-medium text-gray-700">Gemini API URL</label><Input id="gemini-api-url" type="text" placeholder="https://example.com/api/chat" value={geminiApiUrl} onChange={(e) => setGeminiApiUrl(e.target.value)} /></div>
                <div className="space-y-2"><label htmlFor="gemini-api-key" className="text-sm font-medium text-gray-700">Gemini API Key</label><Input id="gemini-api-key" type="password" placeholder="Nhập API key của bạn..." value={geminiApiKey} onChange={(e) => { setGeminiApiKey(e.target.value); setGeminiConnectionStatus('idle'); }} /></div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Button onClick={handleTestGeminiApi} disabled={isLoadingApiTest} variant="outline">{isLoadingApiTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Kiểm tra kết nối</Button>
                <Button onClick={() => handleSaveSettings('gemini')} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Lưu thay đổi</Button>
              </div>
            </div>
            {geminiConnectionStatus === 'success' && (<Alert variant="default" className="bg-green-50 border-green-200"><CheckCircle className="h-4 w-4 text-green-600" /><AlertTitle className="text-green-800">Thành công!</AlertTitle><AlertDescription className="text-green-700">Kết nối tới API Gemini thành công.</AlertDescription></Alert>)}
            {geminiConnectionStatus === 'error' && (<Alert variant="destructive" className="bg-red-50 border-red-200"><XCircle className="h-4 w-4 text-red-600" /><AlertTitle className="text-red-800">Thất bại!</AlertTitle><AlertDescription className="text-red-700">Không thể kết nối. Vui lòng kiểm tra lại API key và URL.</AlertDescription></Alert>)}
            <div className="border-t pt-6">
              <h2 className="text-lg font-semibold text-gray-700">Kiểm tra Prompt</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Gửi một prompt để kiểm tra đầu ra của API.</p>
              <div className="space-y-2"><label htmlFor="test-prompt" className="text-sm font-medium text-gray-700">Prompt</label><Textarea id="test-prompt" placeholder="Nhập prompt của bạn ở đây..." value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} className="min-h-[100px]" /></div>
              <Button onClick={handleTestGeminiApi} disabled={isLoadingApiTest || !geminiApiKey || !geminiApiUrl} className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isLoadingApiTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Gửi Prompt</Button>
              {testResult && !isLoadingApiTest && (<div className="mt-4"><h3 className="text-sm font-semibold text-gray-700 mb-2">Kết quả:</h3><div className="bg-gray-900 text-white p-4 rounded-lg max-h-60 overflow-y-auto"><pre className="whitespace-pre-wrap text-sm font-mono">{testResult}</pre></div></div>)}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="higgsfield" className="mt-6">
          <div className="p-6 border rounded-lg bg-white space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Higgsfield</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Nhập thông tin xác thực để kết nối với dịch vụ của Higgsfield.</p>
              <div className="space-y-4 max-w-lg">
                <div className="space-y-2">
                  <label htmlFor="higgsfield-cookie" className="text-sm font-medium text-gray-700">Higgsfield Cookie</label>
                  <Textarea id="higgsfield-cookie" placeholder="Nhập Cookie của bạn..." value={higgsfieldCookie} onChange={(e) => { setHiggsfieldCookie(e.target.value); setHiggsfieldConnectionStatus('idle'); }} className="min-h-[100px] font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="higgsfield-clerk-context" className="text-sm font-medium text-gray-700">Higgsfield Clerk Context</label>
                  <Textarea id="higgsfield-clerk-context" placeholder="Nhập Clerk Context của bạn..." value={higgsfieldClerkContext} onChange={(e) => { setHiggsfieldClerkContext(e.target.value); setHiggsfieldConnectionStatus('idle'); }} className="min-h-[100px] font-mono text-xs" />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Button onClick={handleTestHiggsfieldConnection} disabled={isTestingHiggsfield} variant="outline">{isTestingHiggsfield ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Kiểm tra kết nối</Button>
                <Button onClick={() => handleSaveSettings('higgsfield')} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Lưu thay đổi</Button>
              </div>
            </div>
            {higgsfieldConnectionStatus === 'success' && (<Alert variant="default" className="bg-green-50 border-green-200"><CheckCircle className="h-4 w-4 text-green-600" /><AlertTitle className="text-green-800">Thành công!</AlertTitle><AlertDescription className="text-green-700">Kết nối tới API Higgsfield thành công.</AlertDescription></Alert>)}
            {higgsfieldConnectionStatus === 'error' && (<Alert variant="destructive" className="bg-red-50 border-red-200"><XCircle className="h-4 w-4 text-red-600" /><AlertTitle className="text-red-800">Thất bại!</AlertTitle><AlertDescription className="text-red-700">Không thể kết nối. Vui lòng kiểm tra lại Cookie và Clerk Context.</AlertDescription></Alert>)}
          </div>
        </TabsContent>
        <TabsContent value="voice" className="mt-6">
          <div className="p-6 border rounded-lg bg-white space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Voice</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Nhập API key của bạn để kết nối với dịch vụ Voice.</p>
              <div className="space-y-2 max-w-md"><label htmlFor="voice-api-key" className="text-sm font-medium text-gray-700">Voice API Key</label><Input id="voice-api-key" type="password" placeholder="Nhập API key của bạn..." value={voiceApiKey} onChange={(e) => { setVoiceApiKey(e.target.value); setVoiceConnectionStatus('idle'); }} /></div>
              <div className="flex items-center gap-4 mt-4">
                <Button onClick={handleTestVoiceConnection} disabled={isCheckingVoiceConnection} variant="outline">{isCheckingVoiceConnection ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Kiểm tra kết nối</Button>
                <Button onClick={() => handleSaveSettings('voice')} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Lưu thay đổi</Button>
              </div>
            </div>
            {voiceConnectionStatus === 'success' && (<Alert variant="default" className="bg-green-50 border-green-200"><CheckCircle className="h-4 w-4 text-green-600" /><AlertTitle className="text-green-800">Thành công!</AlertTitle><AlertDescription className="text-green-700">Kết nối tới API Voice thành công.</AlertDescription></Alert>)}
            {voiceConnectionStatus === 'error' && (<Alert variant="destructive" className="bg-red-50 border-red-200"><XCircle className="h-4 w-4 text-red-600" /><AlertTitle className="text-red-800">Thất bại!</AlertTitle><AlertDescription className="text-red-700">Không thể kết nối. Vui lòng kiểm tra lại API key.</AlertDescription></Alert>)}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-700">Thông tin Credits</h3>
              {isFetchingCredits ? (<div className="flex items-center text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải...</div>) : voiceCredits !== null ? (<p className="text-gray-800 font-medium">Số dư credits hiện tại: <span className="font-bold text-orange-600">{voiceCredits}</span></p>) : (<p className="text-gray-500">Nhập API key và kiểm tra kết nối để xem số dư.</p>)}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;