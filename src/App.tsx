import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Analytics from "./pages/Analytics";
import ConfirmDispatch from "./pages/ConfirmDispatch";
import SharedThread from "./pages/SharedThread";
import Pricing from "./pages/Pricing";
import VoidMap from "./pages/VoidMap";
import BackgroundDebugOverlay from "./components/BackgroundDebugOverlay";

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center aurora-bg">
        <div className="text-primary/60 text-xs uppercase tracking-widest">
          Loading the Void...
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BackgroundDebugOverlay />

        <BrowserRouter>
          <Routes>

            {/* ROOT */}
            <Route
              path="/"
              element={
                session ? (
                  <Navigate to="/chat" replace />
                ) : (
                  <Auth onAuth={() => {}} />
                )
              }
            />

            {/* AUTH */}
            <Route path="/auth" element={<Auth onAuth={() => {}} />} />

            {/* MAIN CHAT (WILSON CORE) */}
            <Route
              path="/chat"
              element={
                session ? (
                  <Index
                    userId={session.user.id}
                    displayName={session.user.user_metadata?.display_name}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />

            {/* 🔥 FIXED: VOID ROUTE ADDED */}
            <Route
              path="/void"
              element={
                session ? (
                  <Index
                    userId={session.user.id}
                    displayName={session.user.user_metadata?.display_name}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />

            {/* PUBLIC ROUTES */}
            <Route
              path="/analytics"
              element={
                session ? (
                  <Analytics userId={session.user.id} />
                ) : (
                  <Auth onAuth={() => {}} />
                )
              }
            />

            <Route path="/confirm-dispatch" element={<ConfirmDispatch />} />
            <Route path="/share/:token" element={<SharedThread />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/void-map" element={<VoidMap />} />

            {/* FALLBACK */}
            <Route path="*" element={<NotFound />} />

          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
