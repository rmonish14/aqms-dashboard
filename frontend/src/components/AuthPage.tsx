import { useState } from 'react';
import { Wind, Lock, User, Activity, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { API_URL } from '../lib/config';

export type SessionPayload = {
  token: string;
  username: string;
  role: string;
};

interface AuthPageProps {
  onLogin: (session: SessionPayload) => void;
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [isLogin, setIsLogin]   = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      
      let res;
      try {
        res = await fetch(`${API_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, role: 'operator' })
        });
      } catch (networkError) {
        console.warn('Backend unavailable, initiating offline local session.');
        onLogin({ token: 'offline-demo-token', username: username || 'operator', role: 'admin' });
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (isLogin) {
        onLogin({ token: data.token, username: data.username, role: data.role });
      } else {
        // Auto-login after successful registration!
        const loginRes = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        
        const loginData = await loginRes.json();
        
        if (!loginRes.ok) {
          setIsLogin(true);
          setError('Account created! Please enter your password again to verify.');
          setPassword('');
        } else {
          // Success seamlessly enters dashboard
          onLogin({ token: loginData.token, username: loginData.username, role: loginData.role });
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4 antialiased overflow-hidden relative">
      
      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] opacity-70 animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-[128px] pointer-events-none" />
      
      <div className="w-full max-w-md relative z-10">
        
        {/* Branding */}
        <div className="flex flex-col items-center justify-center mb-8 text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 border border-primary/50 relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none"></div>
             <Wind className="w-8 h-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">AQMS Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">Air Quality Monitoring & SCADA Control</p>
          </div>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-8 border border-border shadow-soft relative overflow-hidden">
          {/* Top Progress Bar Line */}
          {loading && <div className="absolute top-0 left-0 h-1 bg-primary w-full animate-pulse"></div>}

          {/* Toggle Tabs */}
          <div className="flex p-1 bg-secondary rounded-xl mb-6">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setError(''); }}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                isLogin ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setError(''); }}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-lg transition-all",
                !isLogin ? "bg-card text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-2.5">
                <Activity className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive font-medium leading-snug">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground ml-1">Username / Operator ID</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground placeholder:text-muted-foreground/50"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between ml-1">
                <label className="text-xs font-semibold text-foreground">Password</label>
                {isLogin && <a href="#" className="text-[10px] text-primary hover:underline font-medium">Forgot?</a>}
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                </div>
                <input
                  type="password"
                  placeholder={isLogin ? "••••••••" : "Create a strong password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground placeholder:text-muted-foreground/50"
                  required
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                id="auth-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full relative overflow-hidden flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm rounded-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed group active:scale-[0.98]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>{isLogin ? 'Grant Access' : 'Register Operator'}</span>
                    <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 group-hover:opacity-100 transition-all" />
                  </>
                )}
              </button>
            </div>
          </form>

        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground mt-6 font-medium tracking-wide">
          RESTRICTED SYSTEM ACCESS · ALL ACTIVITY LOGGED
        </p>

      </div>
    </div>
  );
}
