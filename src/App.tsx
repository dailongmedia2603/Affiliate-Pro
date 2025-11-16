import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './integrations/supabase/client';
import { Toaster } from "@/components/ui/toaster";
import { Session } from '@supabase/supabase-js';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginPage from './pages/LoginPage';
import PlaceholderPage from './pages/PlaceholderPage';
import SettingsPage from './pages/SettingsPage';
import VoicePage from './pages/VoicePage';

function App() {
  return (
    <Router>
      <AppContent />
      <Toaster />
    </Router>
  );
}

const AppContent = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setInitialized(true);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (initialized) {
      if (!session && location.pathname !== '/login') {
        navigate('/login');
      } else if (session && location.pathname === '/login') {
        navigate('/');
      }
    }
  }, [session, location.pathname, navigate, initialized]);

  if (!initialized) {
    return <div>Loading...</div>; // Or a proper splash screen
  }

  if (!session) {
    return <LoginPage />;
  }

  return <MainLayout />;
};

const MainLayout = () => {
  const [activeItem, setActiveItem] = useState('Trang chủ');

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar activeItem={activeItem} setActiveItem={setActiveItem} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header activeItem={activeItem} setActiveItem={setActiveItem} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50">
          <Routes>
            <Route path="/" element={<PlaceholderPage pageName="Trang chủ" />} />
            <Route path="/products" element={<PlaceholderPage pageName="Sản phẩm" />} />
            <Route path="/channels" element={<PlaceholderPage pageName="Kênh" />} />
            <Route path="/voice" element={<VoicePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

export default App;