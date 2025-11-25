import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, Film, Mic, CheckCircle, XCircle, Loader2, Cloud, Video, Info, Cpu } from "lucide-react";

const SettingsPage = () => {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiApiUrl, setGeminiApiUrl] = useState('https://aquarius.qcv.vn/api/chat');
  const [higgsfieldCookie, setHiggsfieldCookie] = useState('');
  const [higgsfieldClerkContext, setHiggsfieldClerkContext] = useState('');
  const [voiceApiKey, setVoiceApiKey] = useState('');
  const [vertexAiServiceAccount, setVertexAiServiceAccount] = useState('');
  const [cloudflareAccountId, setCloudflareAccountId] = useState('');
  const [cloudflareAccessKeyId, setCloudflareAccessKeyId] = useState('');
  const [cloudflareSecretAccessKey, setCloudflareSecretAccessKey] = useState('');
  const [cloudflareR2BucketName, setCloudflareR2BucketName] = useState('');
  const [cloudflareR2PublicUrl, setCloudflareR2PublicUrl] = useState('');
  const [rendiApiKey, setRendiApiKey] = useState('');
  const [veo3Cookie, setVeo3Cookie] = useState('');
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
  const [isTestingVertexAi, setIsTestingVertexAi] = useState(false);
  const [vertexAiConnectionStatus, setVertexAiConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTestingR2, setIsTestingR2] = useState(false);
  const [r2ConnectionStatus, setR2ConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTestingRendi, setIsTestingRendi] = useState(false);
  const [rendiConnectionStatus, setRendiConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTestingVeo3, setIsTestingVeo3] = useState(false);
  const [veo3ConnectionStatus, setVeo3ConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const fetchVoiceCredits = async (apiKey: string) => {
    if (!apiKey) return;
    setIsFetchingCredits(true);
    try {
      const { data, error } = await supabase.functions.invoke('proxy-voice-api', {
        body: { path: 'v1/credits', token: apiKey },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.success) {
        setVoiceCredits(data.credits);
      } else {
        throw new Error('Không thể lấy thông tin credits.');
      }
    } catch (error) {
      const errorMessage = error.context?.json?.error || error.message;
      showError(`Lỗi khi lấy credits: ${errorMessage}`);
      setVoiceCredits(null);
    } finally {
      setIsFetchingCredits(false);
    }
  };

  useEffect(() => {
    const fetchSettings = async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        showError('Không thể tải cài đặt toàn cục.');
      }
      if (data) {
        setGeminiApiKey(data.gemini_api_key || '');
        setGeminiApiUrl(data.gemini_api_url || 'https://aquarius.qcv.vn/api/chat');
        setVoiceApiKey(data.voice_api_key || '');
        setHiggsfieldCookie(data.higgsfield_cookie || '');
        setHiggsfieldClerkContext(data.higgsfield_clerk_context || '');
        setVertexAiServiceAccount(data.vertex_ai_service_account ? JSON.stringify(data.vertex_ai_service_account, null, 2) : '');
        setCloudflareAccountId(data.cloudflare_account_id || '');
        setCloudflareAccessKeyId(data.cloudflare_access_key_id || '');
        setCloudflareSecretAccessKey(data.cloudflare_secret_access_key || '');
        setCloudflareR2BucketName(data.cloudflare_r2_bucket_name || '');
        setCloudflareR2PublicUrl(data.cloudflare_r2_public_url || '');
        setRendiApiKey(data.rendi_api_key || '');
        setVeo3Cookie(data.veo3_cookie || '');
        if (data.voice_api_key) {
          fetchVoiceCredits(data.voice_api_key);
        }
      }
    };
    fetchSettings();
  }, []);

  const handleSaveSettings = async (apiKeyType: 'gemini' | 'higgsfield' | 'voice' | 'vertex_ai' | 'cloudflare_r2' | 'rendi' | 'veo3') => {
    setIsSaving(true);
    
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
      case 'vertex_ai':
        try {
          const parsedServiceAccount = vertexAiServiceAccount ? JSON.parse(vertexAiServiceAccount) : null;
          updateData = { vertex_ai_service_account: parsedServiceAccount };
        } catch (e) {
          showError("Nội dung Service Account không phải là một file JSON hợp lệ.");
          setIsSaving(false);
          return;
        }
        break;
      case 'cloudflare_r2':
        updateData = {
          cloudflare_account_id: cloudflareAccountId,
          cloudflare_access_key_id: cloudflareAccessKeyId,
          cloudflare_secret_access_key: cloudflareSecretAccessKey,
          cloudflare_r2_bucket_name: cloudflareR2BucketName,
          cloudflare_r2_public_url: cloudflareR2PublicUrl,
        };
        break;
      case 'rendi':
        updateData = { rendi_api_key: rendiApiKey };
        break;
      case 'veo3':
        updateData = { veo3_cookie: veo3Cookie };
        break;
    }

    const { error } = await supabase
      .from('app_settings')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', true);

    if (error) {
      showError(`Lỗi khi lưu cài đặt: ${error.message}`);
    } else {
      showSuccess("Đã lưu cài đặt thành công!");
      if (apiKeyType === 'voice') {
        fetchVoiceCredits(voiceApiKey);
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
      
      if (error) { throw error; }
      if (data && data.error) { throw new Error(data.error); }

      setGeminiConnectionStatus('success');
      setTestResult(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    } catch (error) {
      setGeminiConnectionStatus('error');
      const errorMessage = error.context?.json?.error || error.message;
      setTestResult(errorMessage);
    } finally {
      setIsLoadingApiTest(false);
    }
  };

  const handleTestVertexAiApi = async () => {
    setIsTestingVertexAi(true);
    setVertexAiConnectionStatus('idle');
    setTestResult('');

    try {
      const { data, error } = await supabase.functions.invoke('proxy-vertex-ai', {
        body: { prompt: testPrompt },
      });

      if (error) throw error;
      if (data.success) {
        setVertexAiConnectionStatus('success');
        setTestResult(data.data);
      } else {
        throw new Error(data.error || 'Đã xảy ra lỗi không xác định.');
      }
    } catch (error) {
      setVertexAiConnectionStatus('error');
      const errorMessage = error.context?.json?.error || error.message;
      setTestResult(errorMessage);
    } finally {
      setIsTestingVertexAi(false);
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
        body: { path: 'v1/credits', token: voiceApiKey },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      if (data.success && typeof data.credits === 'number') {
        setVoiceConnectionStatus('success');
        showSuccess('Kết nối API Voice thành công!');
        setVoiceCredits(data.credits);
      } else {
        throw new Error(`Phản hồi từ API không hợp lệ hoặc API key sai.`);
      }
    } catch (error) {
      setVoiceConnectionStatus('error');
      const errorMessage = error.context?.json?.error || error.message;
      showError(`Lỗi kết nối: ${errorMessage}`);
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
      const errorMessage = error.context?.json?.error || error.message;
      showError(`Lỗi kết nối Higgsfield: ${errorMessage}`);
    } finally {
      setIsTestingHiggsfield(false);
    }
  };

  const handleTestR2Connection = async () => {
    setIsTestingR2(true);
    setR2ConnectionStatus('idle');
    try {
      const { data, error } = await supabase.functions.invoke('r2-list-files');
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setR2ConnectionStatus('success');
      showSuccess('Kết nối Cloudflare R2 thành công!');
    } catch (error) {
      setR2ConnectionStatus('error');
      const errorMessage = error.context?.json?.error || error.message;
      showError(`Lỗi kết nối R2: ${errorMessage}`);
    } finally {
      setIsTestingR2(false);
    }
  };

  const handleTestRendiConnection = async () => {
    if (!rendiApiKey) {
      setRendiConnectionStatus('error');
      showError('Vui lòng nhập Rendi API key.');
      return;
    }
    setIsTestingRendi(true);
    setRendiConnectionStatus('idle');
    try {
      const { error } = await supabase.functions.invoke('proxy-rendi-api', {
        body: { action: 'test_connection' },
      });
      if (error) throw error;
      setRendiConnectionStatus('success');
      showSuccess('Kết nối API Rendi thành công!');
    } catch (error) {
      setRendiConnectionStatus('error');
      const errorMessage = error.context?.json?.error || error.message;
      showError(`Lỗi kết nối Rendi: ${errorMessage}`);
    } finally {
      setIsTestingRendi(false);
    }
  };

  const handleTestVeo3Connection = async () => {
    if (!veo3Cookie) {
      setVeo3ConnectionStatus('error');
      showError('Vui lòng nhập Cookie.');
      return;
    }
    setIsTestingVeo3(true);
    setVeo3ConnectionStatus('idle');
    try {
      const { data, error } = await supabase.functions.invoke('proxy-veo3-api', {
        body: {
          path: 'veo3/get_token',
          payload: {}
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.access_token) {
        setVeo3ConnectionStatus('success');
        showSuccess('Kết nối API Veo3 thành công!');
      } else {
        throw new Error('Kiểm tra kết nối thất bại: ' + (data.message || 'Phản hồi không chứa access_token.'));
      }
    } catch (error) {
      setVeo3ConnectionStatus('error');
      const errorMessage = error.context?.json?.error || error.message;
      showError(`Lỗi kết nối Veo3: ${errorMessage}`);
    } finally {
      setIsTestingVeo3(false);
    }
  };

  return (
    <div className="w-full p-6 bg-gray-50/50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Cài Đặt</h1>
      <Tabs defaultValue="gemini">
        <TabsList className="bg-gray-100 p-1 rounded-lg h-auto flex flex-wrap justify-start">
          <TabsTrigger value="gemini" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Sparkles className="w-4 h-4 mr-2" /> API Gemini</TabsTrigger>
          <TabsTrigger value="vertex_ai" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Cloud className="w-4 h-4 mr-2" /> API Vertex AI</TabsTrigger>
          <TabsTrigger value="cloudflare_r2" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Cloud className="w-4 h-4 mr-2" /> Cloudflare R2</TabsTrigger>
          <TabsTrigger value="higgsfield" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Film className="w-4 h-4 mr-2" /> API Higgsfield</TabsTrigger>
          <TabsTrigger value="voice" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Mic className="w-4 h-4 mr-2" /> API Voice</TabsTrigger>
          <TabsTrigger value="rendi" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Video className="w-4 h-4 mr-2" /> API Rendi</TabsTrigger>
          <TabsTrigger value="veo3" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors"><Cpu className="w-4 h-4 mr-2" /> API Veo3</TabsTrigger>
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
            {geminiConnectionStatus === 'error' && (<Alert variant="destructive" className="bg-red-50 border-red-200"><XCircle className="h-4 w-4 text-red-600" /><AlertTitle className="text-red-800">Thất bại!</AlertTitle><AlertDescription className="text-red-700">{testResult || 'Không thể kết nối. Vui lòng kiểm tra lại API key và URL.'}</AlertDescription></Alert>)}
            <div className="border-t pt-6">
              <h2 className="text-lg font-semibold text-gray-700">Kiểm tra Prompt</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Gửi một prompt để kiểm tra đầu ra của API.</p>
              <div className="space-y-2"><label htmlFor="test-prompt" className="text-sm font-medium text-gray-700">Prompt</label><Textarea id="test-prompt" placeholder="Nhập prompt của bạn ở đây..." value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} className="min-h-[100px]" /></div>
              <Button onClick={handleTestGeminiApi} disabled={isLoadingApiTest || !geminiApiKey || !geminiApiUrl} className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isLoadingApiTest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Gửi Prompt</Button>
              {testResult && !isLoadingApiTest && (<div className="mt-4"><h3 className="text-sm font-semibold text-gray-700 mb-2">Kết quả:</h3><div className="bg-gray-900 text-white p-4 rounded-lg max-h-60 overflow-y-auto"><pre className="whitespace-pre-wrap text-sm font-mono">{testResult}</pre></div></div>)}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="vertex_ai" className="mt-6">
          <div className="p-6 border rounded-lg bg-white space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Phương pháp bảo mật hơn</AlertTitle>
              <AlertDescription>
                Để tăng cường bảo mật, bạn nên lưu trữ Service Account JSON dưới dạng một secret trong Supabase. Tạo một secret mới có tên <strong>VERTEX_AI_SERVICE_ACCOUNT_JSON</strong> và dán nội dung file JSON vào đó. Hệ thống sẽ ưu tiên sử dụng secret này nếu có.
              </AlertDescription>
            </Alert>
            <div>
              <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Vertex AI (Phương pháp cũ)</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Dán toàn bộ nội dung file JSON Service Account của bạn vào ô bên dưới. <strong>Lưu ý:</strong> Phương pháp này kém an toàn hơn so với việc sử dụng secret.</p>
              <div className="space-y-4 max-w-lg">
                <div className="space-y-2"><label htmlFor="vertex-ai-service-account" className="text-sm font-medium text-gray-700">Nội dung Service Account (JSON)</label><Textarea id="vertex-ai-service-account" placeholder="Dán toàn bộ nội dung file JSON của bạn vào đây..." value={vertexAiServiceAccount} onChange={(e) => { setVertexAiServiceAccount(e.target.value); setVertexAiConnectionStatus('idle'); }} className="min-h-[200px] font-mono text-xs" /></div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Button onClick={handleTestVertexAiApi} disabled={isTestingVertexAi} variant="outline">{isTestingVertexAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Kiểm tra kết nối</Button>
                <Button onClick={() => handleSaveSettings('vertex_ai')} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Lưu thay đổi</Button>
              </div>
            </div>
            {vertexAiConnectionStatus === 'success' && (<Alert variant="default" className="bg-green-50 border-green-200"><CheckCircle className="h-4 w-4 text-green-600" /><AlertTitle className="text-green-800">Thành công!</AlertTitle><AlertDescription className="text-green-700">Kết nối tới API Vertex AI thành công.</AlertDescription></Alert>)}
            {vertexAiConnectionStatus === 'error' && (<Alert variant="destructive" className="bg-red-50 border-red-200"><XCircle className="h-4 w-4 text-red-600" /><AlertTitle className="text-red-800">Thất bại!</AlertTitle><AlertDescription className="text-red-700">{testResult || 'Không thể kết nối. Vui lòng kiểm tra lại nội dung Service Account.'}</AlertDescription></Alert>)}
            <div className="border-t pt-6">
              <h2 className="text-lg font-semibold text-gray-700">Kiểm tra Prompt</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Gửi một prompt để kiểm tra đầu ra của API.</p>
              <div className="space-y-2"><label htmlFor="test-prompt-vertex" className="text-sm font-medium text-gray-700">Prompt</label><Textarea id="test-prompt-vertex" placeholder="Nhập prompt của bạn ở đây..." value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} className="min-h-[100px]" /></div>
              <Button onClick={handleTestVertexAiApi} disabled={isTestingVertexAi} className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isTestingVertexAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Gửi Prompt</Button>
              {testResult && !isTestingVertexAi && (<div className="mt-4"><h3 className="text-sm font-semibold text-gray-700 mb-2">Kết quả:</h3><div className="bg-gray-900 text-white p-4 rounded-lg max-h-60 overflow-y-auto"><pre className="whitespace-pre-wrap text-sm font-mono">{testResult}</pre></div></div>)}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="cloudflare_r2" className="mt-6">
          <div className="p-6 border rounded-lg bg-white space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-700">Cấu hình Cloudflare R2</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Nhập thông tin xác thực để kết nối với dịch vụ lưu trữ Cloudflare R2.</p>
              <div className="space-y-4 max-w-md">
                <div className="space-y-2"><label htmlFor="cf-account-id" className="text-sm font-medium text-gray-700">Account ID</label><Input id="cf-account-id" type="text" placeholder="Nhập Account ID..." value={cloudflareAccountId} onChange={(e) => { setCloudflareAccountId(e.target.value); setR2ConnectionStatus('idle'); }} /></div>
                <div className="space-y-2"><label htmlFor="cf-access-key-id" className="text-sm font-medium text-gray-700">Access Key ID</label><Input id="cf-access-key-id" type="text" placeholder="Nhập Access Key ID..." value={cloudflareAccessKeyId} onChange={(e) => { setCloudflareAccessKeyId(e.target.value); setR2ConnectionStatus('idle'); }} /></div>
                <div className="space-y-2"><label htmlFor="cf-secret-access-key" className="text-sm font-medium text-gray-700">Secret Access Key</label><Input id="cf-secret-access-key" type="password" placeholder="Nhập Secret Access Key..." value={cloudflareSecretAccessKey} onChange={(e) => { setCloudflareSecretAccessKey(e.target.value); setR2ConnectionStatus('idle'); }} /></div>
                <div className="space-y-2"><label htmlFor="cf-bucket-name" className="text-sm font-medium text-gray-700">Bucket Name</label><Input id="cf-bucket-name" type="text" placeholder="Nhập tên Bucket..." value={cloudflareR2BucketName} onChange={(e) => { setCloudflareR2BucketName(e.target.value); setR2ConnectionStatus('idle'); }} /></div>
                <div className="space-y-2"><label htmlFor="cf-public-url" className="text-sm font-medium text-gray-700">Public URL</label><Input id="cf-public-url" type="text" placeholder="https://assets.yourdomain.com" value={cloudflareR2PublicUrl} onChange={(e) => { setCloudflareR2PublicUrl(e.target.value); setR2ConnectionStatus('idle'); }} /></div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Button onClick={handleTestR2Connection} disabled={isTestingR2} variant="outline">{isTestingR2 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Kiểm tra kết nối</Button>
                <Button onClick={() => handleSaveSettings('cloudflare_r2')} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Lưu thay đổi</Button>
              </div>
            </div>
            {r2ConnectionStatus === 'success' && (<Alert variant="default" className="bg-green-50 border-green-200"><CheckCircle className="h-4 w-4 text-green-600" /><AlertTitle className="text-green-800">Thành công!</AlertTitle><AlertDescription className="text-green-700">Kết nối tới Cloudflare R2 thành công.</AlertDescription></Alert>)}
            {r2ConnectionStatus === 'error' && (<Alert variant="destructive" className="bg-red-50 border-red-200"><XCircle className="h-4 w-4 text-red-600" /><AlertTitle className="text-red-800">Thất bại!</AlertTitle><AlertDescription className="text-red-700">Không thể kết nối. Vui lòng kiểm tra lại thông tin xác thực và lưu lại.</AlertDescription></Alert>)}
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
        <TabsContent value="rendi" className="mt-6">
          <div className="p-6 border rounded-lg bg-white space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Rendi Ffmpeg</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Nhập API key của bạn để kết nối với dịch vụ Rendi.</p>
              <div className="space-y-2 max-w-md">
                <label htmlFor="rendi-api-key" className="text-sm font-medium text-gray-700">Rendi API Key</label>
                <Input id="rendi-api-key" type="password" placeholder="Nhập API key của bạn..." value={rendiApiKey} onChange={(e) => { setRendiApiKey(e.target.value); setRendiConnectionStatus('idle'); }} />
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Button onClick={handleTestRendiConnection} disabled={isTestingRendi} variant="outline">
                  {isTestingRendi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Kiểm tra kết nối
                </Button>
                <Button onClick={() => handleSaveSettings('rendi')} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Lưu thay đổi
                </Button>
              </div>
            </div>
            {rendiConnectionStatus === 'success' && (
              <Alert variant="default" className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Thành công!</AlertTitle>
                <AlertDescription className="text-green-700">Kết nối tới API Rendi thành công.</AlertDescription>
              </Alert>
            )}
            {rendiConnectionStatus === 'error' && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800">Thất bại!</AlertTitle>
                <AlertDescription className="text-red-700">Không thể kết nối. Vui lòng kiểm tra lại API key.</AlertDescription>
              </Alert>
            )}
          </div>
        </TabsContent>
        <TabsContent value="veo3" className="mt-6">
          <div className="p-6 border rounded-lg bg-white space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Veo3</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Nhập thông tin xác thực để kết nối với dịch vụ Veo3. URL API được đặt cố định là <strong>https://api.beautyapp.work</strong>.</p>
              <div className="space-y-4 max-w-lg">
                <div className="space-y-2">
                  <label htmlFor="veo3-cookie" className="text-sm font-medium text-gray-700">Veo3 Cookie</label>
                  <Textarea id="veo3-cookie" placeholder="Nhập Cookie của bạn..." value={veo3Cookie} onChange={(e) => { setVeo3Cookie(e.target.value); setVeo3ConnectionStatus('idle'); }} className="min-h-[150px] font-mono text-xs" />
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4">
                <Button onClick={handleTestVeo3Connection} disabled={isTestingVeo3} variant="outline">{isTestingVeo3 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Kiểm tra kết nối</Button>
                <Button onClick={() => handleSaveSettings('veo3')} disabled={isSaving} className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">{isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Lưu thay đổi</Button>
              </div>
            </div>
            {veo3ConnectionStatus === 'success' && (<Alert variant="default" className="bg-green-50 border-green-200"><CheckCircle className="h-4 w-4 text-green-600" /><AlertTitle className="text-green-800">Thành công!</AlertTitle><AlertDescription className="text-green-700">Kết nối tới API Veo3 thành công.</AlertDescription></Alert>)}
            {veo3ConnectionStatus === 'error' && (<Alert variant="destructive" className="bg-red-50 border-red-200"><XCircle className="h-4 w-4 text-red-600" /><AlertTitle className="text-red-800">Thất bại!</AlertTitle><AlertDescription className="text-red-700">Không thể kết nối. Vui lòng kiểm tra lại Cookie và đảm bảo API server đang chạy.</AlertDescription></Alert>)}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;