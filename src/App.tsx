import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import NotFound from "./pages/NotFound.tsx";
import Analytics from "./pages/Analytics.tsx";
import ConfirmDispatch from "./pages/ConfirmDispatch.tsx";

const queryClient = new QueryClient();

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // CRITICAL: Only swap the session reference when the *identity* actually
      // changes. Supabase fires TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION
      // periodically (and at random moments mid-stream). If we always call
      // setSession(nextSession), <Index> remounts because its `userId` /
      // `displayName` props get a fresh object reference — wiping all chat
      // state and snapping the user back to the landing/auth screen.
      setSession((prev: { user?: { id?: string } } | null) => {
        const prevId = prev?.user?.id ?? null;
        const nextId = nextSession?.user?.id ?? null;
        if (event === "SIGNED_OUT") return null;
        if (prevId !== nextId) return nextSession;
        // Same user — keep the existing reference so React doesn't re-render
        // every consumer that depends on the session object.
        return prev;
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center aurora-bg">
        <div className="text-primary/60 text-xs uppercase tracking-widest">Loading the Void...</div>
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
            <Route
              path="/"
              element={
                session ? (
                  <Index
                    userId={session.user.id}
                    displayName={session.user.user_metadata?.display_name}
                  />
                ) : (
                  <Auth onAuth={() => {}} />
                )
              }
            />
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
