import React, { useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ChannelManagement from '@/components/ChannelManagement';
import SettingsPage from '@/pages/SettingsPage';
import PlaceholderPage from '@/pages/PlaceholderPage';
import ProductPage from '@/pages/ProductPage';
import VoicePage from '@/pages/VoicePage';
import VideoPage from '@/pages/VideoPage';
import ImagePage from '@/pages/ImagePage';

const Index = () => {
  const [activeItem, setActiveItem] = useState('Quản lý kênh');

  const renderContent = () => {
    switch (activeItem) {
      case 'Quản lý kênh':
        return <ChannelManagement />;
      case 'Sản phẩm':
        return <ProductPage />;
      case 'Tạo Video':
        return <VideoPage />;
      case 'Tạo Ảnh':
        return <ImagePage />;
      case 'Tạo Voice':
        return <VoicePage />;
      case 'Cài Đặt':
        return <SettingsPage />;
      default:
        return <PlaceholderPage pageName={activeItem} />;
    }
  };

  return (
    <div className="bg-[#F6F8FA] h-screen flex flex-col">
      <Header activeItem={activeItem} setActiveItem={setActiveItem} />
      <main className="flex flex-1 items-stretch p-3 gap-3 overflow-hidden">
        <Sidebar />
        <div className="bg-white flex-1 rounded-lg border border-solid border-[#EDEDED] overflow-y-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default Index;