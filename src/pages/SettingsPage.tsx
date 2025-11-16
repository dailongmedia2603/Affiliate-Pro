import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Film } from "lucide-react";

const SettingsPage = () => {
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
          <div className="p-6 border rounded-lg bg-white">
            <h2 className="text-lg font-semibold text-gray-700">Cấu hình API Gemini</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">Nhập API key của bạn để kết nối với dịch vụ của Google Gemini.</p>
            <div className="space-y-2 max-w-md">
              <label htmlFor="gemini-api-key" className="text-sm font-medium text-gray-700">Gemini API Key</label>
              <Input id="gemini-api-key" type="password" placeholder="Nhập API key của bạn..." />
            </div>
            <Button className="mt-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold">Lưu thay đổi</Button>
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