import React, { useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ChannelManagement from '@/components/ChannelManagement';
import SettingsPage from '@/pages/SettingsPage';
import PlaceholderPage from '@/pages/PlaceholderPage';

const Index = () => {
  const [activeItem, setActiveItem] = useState('Quản lý kênh');

  const renderContent = () => {
    switch (activeItem) {
      case 'Quản lý kênh':
        return <ChannelManagement />;
      case 'Cài Đặt':
        return <SettingsPage />;
      default:
        return <PlaceholderPage pageName={activeItem} />;
    }
  };

  return (
    <div className="bg-[#F6F8FA] min-h-screen flex flex-col">
      <div className="w-full flex flex-col flex-1">
        <Header activeItem={activeItem} setActiveItem={setActiveItem} />
        <main className="flex flex-1 items-stretch my-3 mx-3 gap-3">
          <Sidebar />
          <div className="flex items-start bg-white flex-1 rounded-lg border border-solid border-[#EDEDED]">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;