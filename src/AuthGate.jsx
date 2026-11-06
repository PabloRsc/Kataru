import React, { useEffect, useState } from 'react';
import { Check, Clapperboard, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';
import { isSupabaseConfigured, supabase } from './storage';

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data?.session ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session) setMessage('Conta criada. Bem-vindo ao AnimeLog!');
        else setMessage('Cadastro iniciado! Confira seu e-mail para confirmar a conta antes de entrar.');
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setMessage('Se o endereço estiver cadastrado, você receberá um link para redefinir a senha.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) { setError(err.message || 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="auth-screen"><LoaderCircle className="spin"/> Carregando sua conta...</div>;
  if (session) return <>{React.cloneElement(children, { key: session.user.id })}</>;
  if (!isSupabaseConfigured) return <div className="auth-screen"><section className="auth-card"><div className="auth-brand"><Clapperboard/> animelog</div><h1>Configure sua nuvem</h1><p>Para ativar contas individuais e sincronização, configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no ambiente de implantação. Consulte o README.</p></section></div>;

  return <div className="auth-screen"><form className="auth-card" onSubmit={submit}>
    <div className="auth-brand"><Clapperboard/> animelog</div>
    <p className="eyebrow">SUA BIBLIOTECA PESSOAL</p>
    <h1>{mode === 'signup' ? 'Crie sua conta' : mode === 'reset' ? 'Redefinir senha' : 'Bem-vindo de volta'}</h1>
    <p className="auth-description">Sua coleção de animes, privada e sincronizada.</p>
    <label className="auth-field"><span><Mail size={14}/> E-mail</span><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com"/></label>
    {mode !== 'reset' && <label className="auth-field"><span><LockKeyhole size={14}/> Senha</span><input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength="6" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo de 6 caracteres"/></label>}
    {error && <p className="auth-error">{error}</p>}
    {message && <p className="auth-message"><Check size={15}/>{message}</p>}
    <button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : mode === 'signup' ? 'Criar conta' : mode === 'reset' ? 'Enviar link' : 'Entrar'}</button>
    <div className="auth-links">
      {mode === 'login' && <><button type="button" onClick={() => {setMode('signup');setError('');setMessage('');}}>Criar conta</button><button type="button" onClick={() => {setMode('reset');setError('');setMessage('');}}>Esqueci minha senha</button></>}
      {mode !== 'login' && <button type="button" onClick={() => {setMode('login');setError('');setMessage('');}}>Voltar para entrar</button>}
    </div>
  </form></div>;
}
