import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, CircleAlert,
  Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, Mail, RefreshCw,
  ShieldCheck, Sparkles, UserRound, X
} from 'lucide-react';
import { searchAnime } from './api';
import { isSupabaseConfigured, setAuthPersistence, supabase } from './storage';
import { KATARU_MARK, KATARU_WORDMARK } from './brand-assets';
import './AuthGate.css';

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const DEMO_QUERIES = ['Frieren', 'Violet Evergarden', 'Vinland Saga'];

function passwordChecks(value) {
  return {
    length: value.length >= 8,
    letters: /[A-Za-z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value)
  };
}

function maskEmail(value) {
  const [name, domain] = String(value || '').split('@');
  if (!name || !domain) return value;
  return (name.length > 2 ? name.slice(0, 2) : name.slice(0, 1)) + '***@' + domain;
}

function mailboxUrl(email) {
  const domain = String(email || '').split('@')[1]?.toLowerCase() || '';
  if (domain.includes('gmail.')) return 'https://mail.google.com/';
  if (/outlook|hotmail|live\./.test(domain)) return 'https://outlook.live.com/mail/';
  if (domain.includes('yahoo.')) return 'https://mail.yahoo.com/';
  if (domain.includes('icloud.')) return 'https://www.icloud.com/mail/';
  return 'mailto:' + (email || '');
}

function Brand({ compact = false }) {
  return (
    <span className={compact ? 'auth-brand auth-brand-compact' : 'auth-brand'}>
      <img className="auth-brand-mark" src={KATARU_MARK} alt="" />
      <img className="auth-brand-word" src={KATARU_WORDMARK} alt="Kataru" />
    </span>
  );
}

function Showcase({ mode, posters, onMarkEpisode }) {
  const frieren = posters[0] || null;
  return (
    <section className={'auth-showcase auth-showcase-' + mode} aria-label="Prévia do Kataru">
      <div className="auth-showcase-glow" />
      <div className="auth-showcase-halo" />
      <div className="auth-poster-stack" aria-hidden="true">
        <div className="auth-poster auth-poster-back auth-poster-back-one">
          {posters[1]?.image_url && <img src={posters[1].image_url} alt="" />}
        </div>
        <div className="auth-poster auth-poster-back auth-poster-back-two">
          {posters[2]?.image_url && <img src={posters[2].image_url} alt="" />}
        </div>
        <div className="auth-poster auth-poster-front">
          {frieren?.image_url ? <img src={frieren.image_url} alt="" /> : <div className="auth-poster-fallback">FRIEREN</div>}
          <div className="auth-poster-caption">
            <strong>{frieren?.title || 'Frieren'}</strong>
            <div className="auth-poster-progress"><i /></div>
            <small>Ep 8 de 28</small>
          </div>
        </div>
      </div>
      <div className="auth-showcase-card">
        <span className="auth-showcase-label">Continue de onde parou</span>
        <strong>Frieren</strong>
        <span className="auth-showcase-meta">Episódio 8 de 28 · 29%</span>
        <div className="auth-showcase-progress"><i /></div>
        <button type="button" onClick={onMarkEpisode}>Marcar ep. 9 como visto <ChevronRight size={15} /></button>
      </div>
      <div className="auth-showcase-footnote"><Sparkles size={13} /> Sua coleção, no seu ritmo.</div>
    </section>
  );
}

function AuthInput({ icon: Icon, label, value, onChange, placeholder, type = 'text', autoComplete, right, onKeyState, invalid, ...props }) {
  return (
    <label className={'auth-label' + (invalid ? ' is-invalid' : '')}>
      <span className="auth-label-text">{label}</span>
      <span className="auth-input-wrap">
        {Icon && <Icon size={17} />}
        <input
          type={type}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyState}
          onKeyUp={onKeyState}
          placeholder={placeholder}
          autoComplete={autoComplete}
          {...props}
        />
        {right}
      </span>
    </label>
  );
}

function GoogleMark() {
  return <span className="auth-google-mark" aria-hidden="true">G</span>;
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [usernameState, setUsernameState] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [attempts, setAttempts] = useState(() => Number(sessionStorage.getItem('kataru.login.attempts') || 0));
  const [cooldown, setCooldown] = useState(() => Math.max(0, Math.ceil((Number(sessionStorage.getItem('kataru.login.lock') || 0) - Date.now()) / 1000)));
  const [posters, setPosters] = useState([]);
  const checks = useMemo(() => passwordChecks(password), [password]);
  const passwordStrong = checks.length && checks.letters && checks.number && checks.symbol;

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let mounted = true;
    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) return;
        if (sessionError) setError(sessionError.message || 'Não foi possível recuperar sua sessão.');
        setSession(data?.session ?? null);
        setLoading(false);
      })
      .catch(() => { if (mounted) setLoading(false); });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession || null);
      if (event === 'PASSWORD_RECOVERY') {
        setMode('new-password');
        setError('');
        setNotice('');
      }
      if (event === 'SIGNED_IN') {
        setAttempts(0);
        sessionStorage.removeItem('kataru.login.attempts');
        sessionStorage.removeItem('kataru.login.lock');
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all(DEMO_QUERIES.map(query => searchAnime(query).catch(() => [])))
      .then(groups => {
        if (!active) return;
        const unique = [];
        groups.forEach((group, index) => {
          const query = DEMO_QUERIES[index].toLowerCase();
          const best = (group || []).find(anime => (anime.title || '').toLowerCase().includes(query.split(' ')[0])) || group?.[0];
          if (best && best.image_url && !unique.some(item => String(item.mal_id) === String(best.mal_id))) unique.push(best);
        });
        setPosters(unique);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (mode !== 'signup' || !username.trim()) {
      setUsernameState('idle');
      return undefined;
    }
    if (!USERNAME_PATTERN.test(username.trim())) {
      setUsernameState('invalid');
      return undefined;
    }
    setUsernameState('checking');
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const { data, error: rpcError } = await supabase.rpc('is_kataru_username_available', { candidate: username.trim() });
        if (!active) return;
        setUsernameState(rpcError ? 'unavailable' : data ? 'available' : 'taken');
      } catch {
        if (active) setUsernameState('unavailable');
      }
    }, 420);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [username, mode]);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setInterval(() => {
      setCooldown(current => {
        const next = Math.max(0, current - 1);
        if (!next) sessionStorage.removeItem('kataru.login.lock');
        else sessionStorage.setItem('kataru.login.lock', String(Date.now() + next * 1000));
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown > 0]);

  useEffect(() => {
    if (!resendSeconds) return undefined;
    const timer = window.setInterval(() => setResendSeconds(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds > 0]);

  function clearFeedback() {
    setError('');
    setNotice('');
  }

  function changeMode(next) {
    clearFeedback();
    setMode(next);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setCapsLock(false);
    setAcceptedLegal(false);
  }

  function trackCapsLock(event) {
    if (event?.getModifierState) setCapsLock(event.getModifierState('CapsLock'));
  }

  function lockoutMessage(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = String(seconds % 60).padStart(2, '0');
    return minutes + ':' + remainder;
  }

  async function submitLogin(event) {
    event.preventDefault();
    if (cooldown > 0) return;
    setBusy(true);
    clearFeedback();
    try {
      setAuthPersistence(rememberMe);
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) throw loginError;
      setAttempts(0);
      sessionStorage.removeItem('kataru.login.attempts');
      sessionStorage.removeItem('kataru.login.lock');
    } catch (err) {
      if (/email not confirmed/i.test(err.message || '')) {
        setMode('unconfirmed');
        setError('Falta confirmar seu e-mail. Verifique a caixa de entrada.');
      } else {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        sessionStorage.setItem('kataru.login.attempts', String(nextAttempts));
        if (nextAttempts >= 5) {
          const seconds = 5 * 60;
          setCooldown(seconds);
          sessionStorage.setItem('kataru.login.lock', String(Date.now() + seconds * 1000));
          setError('Por segurança, o acesso foi pausado temporariamente. Você pode recuperar sua senha.');
        } else {
          setError('E-mail ou senha incorretos. Restam ' + (5 - nextAttempts) + ' tentativas.');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitSignup(event) {
    event.preventDefault();
    clearFeedback();
    if (!USERNAME_PATTERN.test(username.trim())) {
      setError('Use de 3 a 20 caracteres: letras, números ou _.');
      return;
    }
    if (usernameState !== 'available') {
      setError(usernameState === 'taken' ? 'Esse nome de usuário já está em uso.' : 'Aguarde a verificação do nome de usuário.');
      return;
    }
    if (!passwordStrong) {
      setError('Sua senha precisa ter 8 caracteres, letras, números e um símbolo.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (!acceptedLegal) {
      setError('Aceite os Termos e a Política de Privacidade para continuar.');
      return;
    }
    setBusy(true);
    try {
      setAuthPersistence(true);
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username: username.trim() }
        }
      });
      if (signupError) throw signupError;
      setRecoveryEmail(email.trim());
      if (data.session) {
        setNotice('Sua conta foi criada. Bem-vindo ao Kataru!');
        setMode('login');
        setPassword('');
      } else {
        setMode('signup-sent');
        setResendSeconds(42);
      }
    } catch (err) {
      const message = err.message || '';
      if (/duplicate key|unique constraint|kataru_profiles_username/i.test(message)) {
        setUsernameState('taken');
        setError('Esse nome de usuário acabou de ser escolhido. Tente outro.');
      } else {
        setError(message || 'Não foi possível criar sua conta.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitRecovery(event) {
    event.preventDefault();
    setBusy(true);
    clearFeedback();
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + '/?auth=recovery'
      });
      if (resetError) throw resetError;
      setRecoveryEmail(email.trim());
      setResendSeconds(42);
      setMode('email-sent');
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o link de recuperação.');
    } finally {
      setBusy(false);
    }
  }

  async function resendRecovery() {
    if (resendSeconds > 0 || !recoveryEmail) return;
    setBusy(true);
    clearFeedback();
    try {
      const { error: resendError } = await supabase.auth.resetPasswordForEmail(recoveryEmail, {
        redirectTo: window.location.origin + '/?auth=recovery'
      });
      if (resendError) throw resendError;
      setResendSeconds(42);
      setNotice('Enviamos um novo link para seu e-mail.');
    } catch (err) {
      setError(err.message || 'Não foi possível reenviar o link.');
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (busy || !email.trim()) return;
    setBusy(true);
    clearFeedback();
    try {
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: window.location.origin } });
      if (resendError) throw resendError;
      setResendSeconds(42);
      setNotice('Novo link de confirmação enviado.');
    } catch (err) {
      setError(err.message || 'Não foi possível reenviar o link de confirmação.');
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event) {
    event.preventDefault();
    clearFeedback();
    if (!passwordStrong) {
      setError('Use ao menos 8 caracteres, letras, números e um símbolo.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut({ scope: 'global' });
      setSession(null);
      setPassword('');
      setConfirmPassword('');
      setMode('password-updated');
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar sua senha.');
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    setBusy(true);
    clearFeedback();
    try {
      setAuthPersistence(rememberMe);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(/provider is not enabled|unsupported provider/i.test(err.message || '')
        ? 'O acesso com Google ainda não está habilitado no Supabase.'
        : err.message || 'Não foi possível iniciar o acesso com Google.');
      setBusy(false);
    }
  }

  function openShowcase() {
    setNotice('O progresso exibido é uma prévia de como sua biblioteca aparece no Kataru.');
  }

  if (loading) return <div className="auth-loading"><LoaderCircle size={22} className="spin" /><span>Preparando seu Kataru...</span></div>;
  if (session && !['new-password', 'password-updated'].includes(mode)) return <>{React.cloneElement(children, { key: session.user.id })}</>;
  if (!isSupabaseConfigured) {
    return (
      <main className="auth-loading">
        <Brand compact />
        <section className="auth-config-card">
          <h1>Configure sua nuvem</h1>
          <p>Para ativar contas individuais e sincronização, configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no ambiente de implantação.</p>
        </section>
      </main>
    );
  }

  const isAuthForm = ['login', 'signup', 'reset'].includes(mode);
  const stageMode = mode === 'email-sent' || mode === 'new-password' || mode === 'password-updated';
  const displayPosters = posters.slice(0, 3);

  return (
    <main className="auth-screen">
      <div className="auth-ambient auth-ambient-one" />
      <div className="auth-ambient auth-ambient-two" />
      <div className="auth-ambient auth-ambient-three" />
      <div className="auth-grain" />
      <div className="auth-background-stream" aria-hidden="true">
        {[0, 1, 2, 3].map((column, index) => (
          <div className={'auth-stream-column auth-stream-column-' + index} key={column}>
            {Array.from({ length: 12 }, (_, card) => <i className={'auth-stream-card auth-stream-card-' + ((card + column * 3) % 8)} key={card} />)}
          </div>
        ))}
      </div>

      <div className="auth-layout">
        <section className="auth-left">
          <div className="auth-left-brand"><Brand /></div>
          <Showcase mode={mode} posters={displayPosters} onMarkEpisode={openShowcase} />
          <div className="auth-bottom-note">Um universo de histórias. Uma biblioteca só sua.</div>
        </section>

        <section className="auth-right">
          <div className="auth-form-card">
            {mode === 'login' && (
              <>
                <div className="auth-kicker">BEM-VINDO DE VOLTA</div>
                <h1>Entrar no Kataru</h1>
                <p className="auth-subtitle">Continue de onde parou.</p>
                <button className="auth-google-button" type="button" onClick={signInGoogle} disabled={busy}>
                  <GoogleMark /> Continuar com Google
                </button>
                <div className="auth-divider"><i />ou com e-mail<i /></div>
                <form onSubmit={submitLogin}>
                  <AuthInput icon={Mail} label="E-mail" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" type="email" autoComplete="email" required />
                  <div className="auth-password-heading">
                    <span>Senha</span>
                    <button type="button" onClick={() => changeMode('reset')}>Esqueci minha senha</button>
                  </div>
                  <AuthInput
                    icon={LockKeyhole}
                    label=""
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Sua senha"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    onKeyState={trackCapsLock}
                    right={<button className="auth-visibility" type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
                    required
                  />
                  {capsLock && <p className="auth-inline-warning"><CircleAlert size={14} /> Caps Lock está ativado.</p>}
                  <label className="auth-check-row"><input type="checkbox" checked={rememberMe} onChange={event => setRememberMe(event.target.checked)} /><span>Manter conectado neste dispositivo</span></label>
                  {error && <AuthFeedback tone="error">{error}</AuthFeedback>}
                  {notice && <AuthFeedback tone="success">{notice}</AuthFeedback>}
                  {cooldown > 0 && <div className="auth-lock-panel"><ShieldCheck size={20} /><div><strong>Acesso pausado · {lockoutMessage(cooldown)}</strong><span>Por segurança, aguarde ou recupere sua senha.</span></div></div>}
                  <button className="auth-primary-button" disabled={busy || cooldown > 0}>{busy ? <><LoaderCircle size={17} className="spin" />Entrando...</> : 'Entrar'}</button>
                </form>
                <div className="auth-switch">Novo por aqui? <button type="button" onClick={() => changeMode('signup')}>Criar conta</button></div>
              </>
            )}

            {mode === 'signup' && (
              <>
                <div className="auth-kicker">COMECE AGORA</div>
                <h1>Crie sua biblioteca</h1>
                <p className="auth-subtitle">Leva menos de um minuto.</p>
                <form onSubmit={submitSignup}>
                  <AuthInput icon={UserRound} label="Nome de usuário" value={username} onChange={event => setUsername(event.target.value.replace(/\s/g, ''))} placeholder="Como quer ser chamado" autoComplete="username" maxLength={20} required />
                  {username && <div className={'auth-field-hint ' + (usernameState === 'available' ? 'is-good' : usernameState === 'taken' || usernameState === 'invalid' ? 'is-bad' : '')}>
                    {usernameState === 'checking' ? <><LoaderCircle size={12} className="spin" /> Verificando disponibilidade...</>
                      : usernameState === 'available' ? <><CheckCircle2 size={12} /> Nome disponível</>
                        : usernameState === 'taken' ? <><X size={12} /> Nome já está em uso</>
                          : usernameState === 'invalid' ? <><CircleAlert size={12} /> 3 a 20 caracteres: letras, números ou _</>
                            : usernameState === 'unavailable' ? <><CircleAlert size={12} /> Não foi possível verificar agora</>
                              : null}
                  </div>}
                  <AuthInput icon={Mail} label="E-mail" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" type="email" autoComplete="email" required />
                  <AuthInput
                    icon={LockKeyhole}
                    label="Senha"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Crie uma senha"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    onKeyState={trackCapsLock}
                    right={<button className="auth-visibility" type="button" aria-label="Mostrar senha" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
                    required
                  />
                  <div className="auth-password-rules">
                    <PasswordRule ok={checks.length}>8+ caracteres</PasswordRule>
                    <PasswordRule ok={checks.letters && checks.number}>Letra e número</PasswordRule>
                    <PasswordRule ok={checks.symbol}>Um símbolo</PasswordRule>
                  </div>
                  <AuthInput
                    icon={LockKeyhole}
                    label="Confirmar senha"
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    placeholder="Digite sua senha novamente"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    right={<button className="auth-visibility" type="button" aria-label="Mostrar confirmação" onClick={() => setShowConfirmPassword(value => !value)}>{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}
                    required
                  />
                  {confirmPassword && <div className={'auth-field-hint ' + (password === confirmPassword ? 'is-good' : 'is-bad')}>{password === confirmPassword ? <><CheckCircle2 size={12} /> As senhas coincidem</> : <><CircleAlert size={12} /> As senhas não coincidem</>}</div>}
                  {capsLock && <p className="auth-inline-warning"><CircleAlert size={14} /> Caps Lock está ativado.</p>}
                  <label className="auth-check-row auth-legal-check"><input type="checkbox" checked={acceptedLegal} onChange={event => setAcceptedLegal(event.target.checked)} /><span>Li e aceito os <a href="#termos" onClick={event => { event.preventDefault(); setNotice('Os Termos e a Política de Privacidade do Kataru precisam ser publicados antes do lançamento.'); }}>Termos</a> e a <a href="#privacidade" onClick={event => { event.preventDefault(); setNotice('Os Termos e a Política de Privacidade do Kataru precisam ser publicados antes do lançamento.'); }}>Privacidade</a></span></label>
                  {error && <AuthFeedback tone="error">{error}</AuthFeedback>}
                  {notice && <AuthFeedback tone="info">{notice}</AuthFeedback>}
                  <button className="auth-primary-button" disabled={busy || usernameState !== 'available' || !passwordStrong || password !== confirmPassword || !acceptedLegal}>{busy ? <><LoaderCircle size={17} className="spin" />Criando conta...</> : 'Criar conta'}</button>
                </form>
                <div className="auth-switch">Já tem conta? <button type="button" onClick={() => changeMode('login')}>Entrar</button></div>
              </>
            )}

            {mode === 'reset' && (
              <>
                <button className="auth-back-link" type="button" onClick={() => changeMode('login')}><ArrowLeft size={15} /> Voltar para entrar</button>
                <div className="auth-kicker">RECUPERAR ACESSO</div>
                <h1>Esqueceu a senha?</h1>
                <p className="auth-subtitle">Informe seu e-mail e enviaremos um link para criar uma nova senha. O link vale por 30 minutos.</p>
                <form onSubmit={submitRecovery}>
                  <AuthInput icon={Mail} label="E-mail" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" type="email" autoComplete="email" required />
                  {error && <AuthFeedback tone="error">{error}</AuthFeedback>}
                  <button className="auth-primary-button" disabled={busy}>{busy ? <><LoaderCircle size={17} className="spin" />Enviando...</> : 'Enviar link'}</button>
                </form>
                <p className="auth-privacy-note">Por segurança, a mensagem é a mesma exista ou não uma conta com esse e-mail.</p>
              </>
            )}

            {mode === 'signup-sent' && (
              <AuthMessagePanel
                step="CADASTRO · VERIFIQUE SEU E-MAIL"
                title="Confirme seu endereço"
                text={<>Enviamos um link de confirmação para <strong>{maskEmail(recoveryEmail)}</strong>. Abra a mensagem para ativar sua conta.</>}
                primary={resendSeconds > 0 ? 'Reenviar em ' + lockoutMessage(resendSeconds) : 'Reenviar confirmação'}
                disabled={busy || resendSeconds > 0}
                onPrimary={resendConfirmation}
                onSecondary={() => changeMode('login')}
                secondary="Voltar para entrar"
                notice={notice}
                error={error}
              />
            )}

            {mode === 'unconfirmed' && (
              <AuthMessagePanel
                step="CONFIRMAÇÃO PENDENTE"
                title="Falta confirmar seu e-mail"
                text="Verifique sua caixa de entrada e a pasta de spam. Você precisa confirmar o endereço antes de entrar."
                primary={resendSeconds > 0 ? 'Reenviar em ' + lockoutMessage(resendSeconds) : 'Reenviar link de confirmação'}
                disabled={busy || resendSeconds > 0}
                onPrimary={resendConfirmation}
                onSecondary={() => changeMode('login')}
                secondary="Voltar para entrar"
                notice={notice}
                error={error}
              />
            )}

            {mode === 'email-sent' && (
              <AuthMessagePanel
                step="ETAPA 2 · VERIFIQUE SEU E-MAIL"
                title="Link enviado"
                text={<>Enviamos as instruções para <strong>{maskEmail(recoveryEmail)}</strong>. Confira também a caixa de spam.</>}
                primary={<><Mail size={16} />Abrir meu e-mail</>}
                onPrimary={() => window.open(mailboxUrl(recoveryEmail), '_blank', 'noopener,noreferrer')}
                secondary="Usar outro e-mail"
                onSecondary={() => changeMode('reset')}
                footer={resendSeconds > 0 ? 'Reenviar link em ' + lockoutMessage(resendSeconds) : 'Você já pode solicitar um novo link.'}
                onFooter={resendRecovery}
                notice={notice}
                error={error}
              />
            )}

            {mode === 'new-password' && (
              <>
                <div className="auth-kicker">ETAPA 3 · LINK VÁLIDO POR 30 MIN</div>
                <h1>Quase lá</h1>
                <p className="auth-subtitle">Crie uma nova senha que você não usa em outros sites.</p>
                <form onSubmit={submitNewPassword}>
                  <AuthInput icon={LockKeyhole} label="Nova senha" value={password} onChange={event => setPassword(event.target.value)} placeholder="Nova senha" type={showPassword ? 'text' : 'password'} autoComplete="new-password" right={<button className="auth-visibility" type="button" onClick={() => setShowPassword(value => !value)} aria-label="Mostrar senha">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>} required />
                  <div className="auth-password-rules">
                    <PasswordRule ok={checks.length}>8+ caracteres</PasswordRule>
                    <PasswordRule ok={checks.letters && checks.number}>Letra e número</PasswordRule>
                    <PasswordRule ok={checks.symbol}>Um símbolo</PasswordRule>
                  </div>
                  <AuthInput icon={LockKeyhole} label="Confirmar nova senha" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Repita a nova senha" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" right={<button className="auth-visibility" type="button" onClick={() => setShowConfirmPassword(value => !value)} aria-label="Mostrar confirmação">{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>} required />
                  {confirmPassword && <div className={'auth-field-hint ' + (password === confirmPassword ? 'is-good' : 'is-bad')}>{password === confirmPassword ? <><CheckCircle2 size={12} /> As senhas coincidem</> : 'As senhas não coincidem'}</div>}
                  {error && <AuthFeedback tone="error">{error}</AuthFeedback>}
                  <button className="auth-primary-button" disabled={busy || !passwordStrong || password !== confirmPassword}>{busy ? <><LoaderCircle size={17} className="spin" />Salvando...</> : 'Salvar nova senha'}</button>
                </form>
                <p className="auth-privacy-note">Ao salvar, os outros dispositivos serão desconectados.</p>
              </>
            )}

            {mode === 'password-updated' && (
              <AuthMessagePanel
                step="SEGURANÇA DA CONTA"
                title="Senha alterada"
                text="Sua senha foi atualizada com sucesso. Entre novamente com a nova senha."
                primary="Ir para o login"
                onPrimary={() => changeMode('login')}
              />
            )}

            {notice && isAuthForm && mode !== 'login' && mode !== 'signup' && <AuthFeedback tone="success">{notice}</AuthFeedback>}
          </div>
          <div className="auth-right-footer"><span>Protegido e sincronizado com segurança.</span><span>© Kataru</span></div>
        </section>
      </div>
      {notice && mode === 'login' && <div className="auth-toast"><CheckCircle2 size={16} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Fechar"><X size={14} /></button></div>}
    </main>
  );
}

function PasswordRule({ ok, children }) {
  return <span className={ok ? 'auth-rule is-good' : 'auth-rule'}><i>{ok ? <Check size={10} /> : null}</i>{children}</span>;
}

function AuthFeedback({ tone, children }) {
  return <div className={'auth-feedback auth-feedback-' + tone}>{tone === 'error' ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}{children}</div>;
}

function AuthMessagePanel({ step, title, text, primary, onPrimary, disabled, secondary, onSecondary, footer, onFooter, notice, error }) {
  return (
    <div className="auth-message-panel">
      <div className="auth-success-icon">{title === 'Link enviado' ? <Mail size={28} /> : <ShieldCheck size={28} />}</div>
      <div className="auth-kicker">{step}</div>
      <h1>{title}</h1>
      <p className="auth-subtitle">{text}</p>
      {error && <AuthFeedback tone="error">{error}</AuthFeedback>}
      {notice && <AuthFeedback tone="success">{notice}</AuthFeedback>}
      {primary && <button className="auth-primary-button" type="button" disabled={disabled} onClick={onPrimary}>{primary}</button>}
      {footer && <button className="auth-resend-link" type="button" disabled={disabled} onClick={onFooter}>{footer}</button>}
      {secondary && <button className="auth-secondary-button" type="button" onClick={onSecondary}><ArrowLeft size={14} />{secondary}</button>}
    </div>
  );
}
