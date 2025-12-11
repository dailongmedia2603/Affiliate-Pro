import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

const Index = () => {
  return (
    <div className="bg-[#F6F8FA] h-screen flex flex-col">
      <Header />
      <main className="flex flex-1 items-stretch p-3 gap-3 overflow-hidden">
        <Sidebar />
        <div className="bg-white flex-1 rounded-lg border border-solid border-[#EDEDED] overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Index;