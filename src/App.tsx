import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import PromptLibrary from './pages/PromptLibrary';
import Index from './pages/Index';
import { supabase } from './integrations/supabase/client';
import { useEffect, useState } from 'react';
import Login from './pages/Login';

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!session) {
    return <Login />
  }

  return (
    <Router>
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/prompt-library" element={<PromptLibrary />} />
            {/* Placeholder routes for other icons */}
            <Route path="/inbox" element={<Index />} />
            <Route path="/contacts" element={<Index />} />
            <Route path="/reports" element={<Index />} />
            <Route path="/files" element={<Index />} />
            <Route path="/help" element={<Index />} />
            <Route path="/settings" element={<Index />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;