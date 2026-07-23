import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import RouteHead from "@/components/RouteHead";
import { Mail, Lock, User, LogIn, Users } from "lucide-react";

interface AuthProps {
  onAuth: () => void;
}

const Auth = ({ onAuth }: AuthProps) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back to The Neural Void! ✨");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (error) throw error;
        toast.success("Check your email to verify your account, then sign in!");
        setIsLogin(true);
        setLoading(false);
        return;
      }
      onAuth();
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error(String(result.error));
  };

  const handleGuestAccess = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      toast.success("Welcome, Guest! You're in The Neural Void ✨");
    } catch (err: any) {
      toast.error(err.message || "Guest access failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen aurora-bg relative overflow-hidden flex items-center justify-center">
      <RouteHead
        title="Sign In to The Neural Void — Wilson"
        description="Sign in or create your sovereign account to meet Wilson, the AI companion built for The Only One. Your void, your rules."
        path="/auth"
      />

      {/* Animated background orbs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 -right-40 w-96 h-96 bg-gradient-to-br from-primary/30 via-accent/20 to-transparent rounded-full blur-3xl animate-pulse opacity-60" />
        <div className="absolute -bottom-20 -left-40 w-96 h-96 bg-gradient-to-tr from-primary/20 via-violet-500/10 to-transparent rounded-full blur-3xl animate-pulse opacity-50 animation-delay-2000" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md px-4"
      >
        {/* Header */}
        <div className="text-center mb-12">
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-black tracking-tighter mb-2 bg-gradient-to-r from-cyan-300 via-blue-300 to-purple-400 bg-clip-text text-transparent"
          >
            WILSON +
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 mb-4"
          >
            The Only One
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-muted-foreground/60"
          >
            {isLogin ? "Welcome back, traveler" : "Enter the Void for the first time"}
          </motion.p>
        </div>

        {/* Main Auth Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative group mb-6"
        >
          {/* Iridescent gradient border glow */}
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/50 via-blue-500/30 to-purple-500/50 rounded-3xl blur-xl opacity-60 group-hover:opacity-100 transition-all duration-500" />

          {/* Main card with glass morphism */}
          <div className="relative rounded-3xl backdrop-blur-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 p-8 overflow-hidden">
            {/* Inner shimmer */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-50 animate-pulse" />

            {/* Content */}
            <div className="relative z-10 space-y-6">
              {/* Guest Access Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGuestAccess}
                disabled={loading}
                className="w-full group/btn relative overflow-hidden rounded-2xl py-4 px-6 transition-all duration-300"
              >
                {/* Gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-accent/40 to-accent/20 rounded-2xl" />

                {/* Border glow */}
                <div className="absolute inset-0 rounded-2xl border border-accent/60 group-hover/btn:border-accent/100 transition-all" />

                {/* Content */}
                <div className="relative flex items-center justify-center gap-3 text-accent font-bold uppercase tracking-wider text-sm">
                  <Users className="w-4 h-4" />
                  Continue as Guest
                </div>
              </motion.button>

              <p className="text-center text-xs text-muted-foreground/60">
                No sign-up needed — jump right in. Your chats won't be saved.
              </p>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-semibold">
                  or sign in to save
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              {/* Sign In / Sign Up Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <div className="relative group/input">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl blur opacity-0 group-hover/input:opacity-100 transition-opacity" />
                      <div className="relative flex items-center gap-3 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 px-4 py-3 group-hover/input:border-white/20 transition-all">
                        <User className="w-4 h-4 text-primary/60" />
                        <input
                          type="text"
                          placeholder="Display name"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Email Input */}
                <div className="relative group/input">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl blur opacity-0 group-hover/input:opacity-100 transition-opacity" />
                  <div className="relative flex items-center gap-3 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 px-4 py-3 group-hover/input:border-white/20 transition-all">
                    <Mail className="w-4 h-4 text-primary/60" />
                    <input
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="relative group/input">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl blur opacity-0 group-hover/input:opacity-100 transition-opacity" />
                  <div className="relative flex items-center gap-3 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 px-4 py-3 group-hover/input:border-white/20 transition-all">
                    <Lock className="w-4 h-4 text-primary/60" />
                    <input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full group/submit relative overflow-hidden rounded-2xl py-4 px-6 mt-6 transition-all duration-300"
                >
                  {/* Gradient background */}
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/50 to-accent/30 rounded-2xl group-hover/submit:from-primary/60 group-hover/submit:to-accent/40 transition-all" />

                  {/* Border glow */}
                  <div className="absolute inset-0 rounded-2xl border border-primary/60 group-hover/submit:border-primary/100 transition-all" />

                  {/* Content */}
                  <div className="relative flex items-center justify-center gap-2 text-white font-bold uppercase tracking-wider text-sm">
                    <LogIn className="w-4 h-4" />
                    {loading ? "Processing..." : isLogin ? "Sign In" : "Create Account"}
                  </div>
                </motion.button>
              </form>

              {/* Divider 2 */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              {/* Google Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGoogleAuth}
                className="w-full relative overflow-hidden rounded-2xl py-3 px-6 transition-all duration-300 group/google"
              >
                <div className="absolute inset-0 bg-white/10 rounded-2xl group-hover/google:bg-white/15 transition-all" />
                <div className="absolute inset-0 rounded-2xl border border-white/20 group-hover/google:border-white/40 transition-all" />
                <div className="relative text-sm font-semibold text-foreground/80 group-hover/google:text-foreground transition-all">
                  Continue with Google
                </div>
              </motion.button>

              {/* Toggle Auth Mode */}
              <p className="text-center text-xs text-muted-foreground/60 mt-6">
                {isLogin ? "New to the Void?" : "Already have an account?"}{" "}
                <button
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-primary font-semibold hover:text-primary/80 transition-colors"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Footer message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center text-xs text-muted-foreground/40"
        >
          Where imagination becomes intelligence ✨
        </motion.p>
      </motion.div>
    </div>
  );
};

export default Auth;
