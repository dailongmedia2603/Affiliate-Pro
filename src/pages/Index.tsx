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
  const [activePage, setActivePage] = useState({ page: 'Quản lý kênh', payload: null });

  const navigate = (page: string, payload: any = null) => {
    setActivePage({ page, payload });
  };

  const renderContent = () => {
    const { page, payload } = activePage;
    switch (page) {
      case 'Quản lý kênh':
        return <ChannelManagement onNavigate={navigate} />;
      case 'Sản phẩm':
        return <ProductPage />;
      case 'Tạo Video':
        return <VideoPage {...payload} />;
      case 'Tạo Ảnh':
        return <ImagePage />;
      case 'Tạo Voice':
        return <VoicePage />;
      case 'Cài Đặt':
        return <SettingsPage />;
      default:
        return <PlaceholderPage pageName={page} />;
    }
  };

  return (
    <div className="bg-[#F6F8FA] h-screen flex flex-col">
      <Header activeItem={activePage.page} setActiveItem={navigate} />
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