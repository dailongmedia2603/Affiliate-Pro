import { useState, useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from './pages/Login';
import { supabase } from './integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import ChannelManagement from './components/ChannelManagement';
import ProductPage from './pages/ProductPage';
import AutomationPage from './pages/AutomationPage';
import PromptLibraryPage from './pages/PromptLibraryPage';
import VoicePage from './pages/VoicePage';
import VideoPage from './pages/VideoPage';
import ImagePage from './pages/ImagePage';
import RendiApiTestPage from './pages/RendiApiTestPage';
import AccountsPage from './pages/AccountsPage';
import SettingsPage from './pages/SettingsPage';

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    getSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Đang tải...</p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" />} />
            <Route path="/" element={session ? <Index /> : <Navigate to="/login" />}>
              <Route index element={<ChannelManagement onNavigate={() => {}} />} />
              <Route path="products" element={<ProductPage />} />
              <Route path="automation" element={<AutomationPage />} />
              <Route path="prompts/:category?" element={<PromptLibraryPage />} />
              <Route path="voice" element={<VoicePage />} />
              <Route path="video/:model?" element={<VideoPage />} />
              <Route path="image" element={<ImagePage />} />
              <Route path="rendi" element={<RendiApiTestPage />} />
              <Route path="accounts" element={<AccountsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={session ? <NotFound /> : <Navigate to="/login" />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;