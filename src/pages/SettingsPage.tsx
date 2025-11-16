import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, Film, CheckCircle, XCircle, Loader2 } from "lucide-react";

const SettingsPage = () => {
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [testPrompt, setTestPrompt] = useState('Nguyễn Quang Hải là ai ?');
  const [testResult, setTestResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleTestApi = async () => {
    if (!geminiApiKey) {
      setConnectionStatus('error');
      setTestResult('Vui lòng nhập API key trước khi kiểm tra.');
      return;
    }

    setIsLoading(true);
    setConnectionStatus('idle');
    setTestResult('');

    const formData = new FormData();
    formData.append('prompt', testPrompt);
    formData.append('token', geminiApiKey);

    try {
      const response = await fetch('https://aquarius.qcv.vn/api/chat', {
        method: 'POST',
        body: formData,
      });

      const resultText = await response.text();

      if (response.ok) {
        setConnectionStatus('success');
        setTestResult(resultText);
      } else {
        setConnectionStatus('error');
        setTestResult(`Lỗi: ${response.status} - ${resultText}`);
      }
    } catch (error) {
      setConnectionStatus('error');
      setTestResult(`Lỗi kết nối mạng: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full p-6 bg-gray-50/50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Cài Đặt</h1>
      <Tabs defaultValue="gemini">
        <TabsList className="bg-gray-100 p-1 rounded-lg h-auto">
          <TabsTrigger value="gemini" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors">
            <Sparkles className="w-4 h-4 mr-2" />
            API Gemini
          </TabsTrigger>
          <TabsTrigger value="higgsfield" className="px-4 py-2 text-sm font-semibold text-gray-600 rounded-md data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow transition-colors">
            <Film className="w-4 h-4 mr-2" />
            API Higgsfield
          </TabsTrigger>
        </TabsList>
        <TabsContent value="gemini" className="mt-6">
          <div className="p-6 border rounded-lg bg-white space-y-6">
            {/* API Key Section */}
            <div>
              <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Gemini</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Nhập API key của bạn để kết nối với dịch vụ của Google Gemini.</p>
              <div className="space-y-2 max-w-md">
                <label htmlFor="gemini-api-key" className="text-sm font-medium text-gray-700">Gemini API Key</label>
                <Input
                  id="gemini-api-key"
                  type="password"
                  placeholder="Nhập API key của bạn..."
                  value={geminiApiKey}
                  onChange={(e) => {
                    setGeminiApiKey(e.target.value);
                    setConnectionStatus('idle');
                  }}
                />
              </div>
              <div className="flex items-center gap-4 mt-4">
                 <Button onClick={handleTestApi} disabled={isLoading} variant="outline">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Kiểm tra kết nối
                </Button>
                <Button className="bg-orange-500 hover:bg-orange-600 text-white font-semibold">Lưu thay đổi</Button>
              </div>
            </div>

            {/* Connection Status Alert */}
            {connectionStatus === 'success' && (
              <Alert variant="default" className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-800">Thành công!</AlertTitle>
                <AlertDescription className="text-green-700">Kết nối tới API Gemini thành công.</AlertDescription>
              </Alert>
            )}
            {connectionStatus === 'error' && (
              <Alert variant="destructive" className="bg-red-50 border-red-200">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertTitle className="text-red-800">Thất bại!</AlertTitle>
                <AlertDescription className="text-red-700">Không thể kết nối. Vui lòng kiểm tra lại API key.</AlertDescription>
              </Alert>
            )}

            {/* Prompt Test Section */}
            <div className="border-t pt-6">
              <h2 className="text-lg font-semibold text-gray-700">Kiểm tra Prompt</h2>
              <p className="text-sm text-gray-500 mt-1 mb-4">Gửi một prompt để kiểm tra đầu ra của API.</p>
              <div className="space-y-2">
                <label htmlFor="test-prompt" className="text-sm font-medium text-gray-700">Prompt</label>
                <Textarea
                  id="test-prompt"
                  placeholder="Nhập prompt của bạn ở đây..."
                  value={testPrompt}
                  onChange={(e) => setTestPrompt(e.target.value)}
                  className="min-h-[100px]"
                />
              </div>
              <Button onClick={handleTestApi} disabled={isLoading || !geminiApiKey} className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Gửi Prompt
              </Button>
              
              {testResult && !isLoading && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Kết quả:</h3>
                  <div className="bg-gray-900 text-white p-4 rounded-lg max-h-60 overflow-y-auto">
                    <pre className="whitespace-pre-wrap text-sm font-mono">{testResult}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="higgsfield" className="mt-6">
          <div className="p-6 border rounded-lg bg-white">
            <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Higgsfield</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">Nhập API key của bạn để kết nối với dịch vụ của Higgsfield.</p>
            <div className="space-y-2 max-w-md">
              <label htmlFor="higgsfield-api-key" className="text-sm font-medium text-gray-700">Higgsfield API Key</label>
              <Input id="higgsfield-api-key" type="password" placeholder="Nhập API key của bạn..." />
            </div>
            <Button className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold">Lưu thay đổi</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsPage;