import { FormEvent, useEffect, useRef, useState } from 'react';
import { checkSession, fetchSettings, forgetSession, normalizeUser, signIn, type SessionEndReason, type User } from './api';
import { resolveSection, useOnlineStatus, useTheme, type SectionId } from './shell';
import { applySettings, readSettingsCache, settingOn, settingText, writeSettingsCache, type AppSettings as Settings } from './settings';
import NavDrawer from './NavDrawer';
import AppFooter from './AppFooter';
import Dashboard from './Dashboard';
import Profile from './Profile';
import UserAdmin from './UserAdmin';
import AppSettings from './AppSettings';
import SyncControl from './SyncControl';
import { attachSync, detachSync } from './sync';

const SESSION_KEY = 'loginapp_session';

const SESSION_END_MESSAGE: Record<SessionEndReason, string> = {
  contrasena: 'Un administrador cambió tu contraseña. Vuelve a iniciar sesión.',
  cesado: 'Tu cuenta está cesada. Comunícate con un administrador.',
  inexistente: 'Tu cuenta ya no está registrada. Comunícate con un administrador.',
  desconocida: 'Tu sesión caducó. Vuelve a iniciar sesión.',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState('');
  // La caché pinta de inmediato con la última configuración conocida (también
  // sin conexión); el servidor la refresca en cuanto responde.
  const [settings, setSettings] = useState<Settings>(() => readSettingsCache().settings);

  useEffect(() => { applySettings(settings); }, [settings]);

  useEffect(() => {
    fetchSettings()
      .then((fresh) => { setSettings(fresh); writeSettingsCache(fresh); })
      .catch(() => { /* sin conexión: se conserva la configuración guardada */ });
  }, []);

  useEffect(() => {
    let saved: User | null = null;
    try { const raw = localStorage.getItem(SESSION_KEY); if (raw) saved = normalizeUser(JSON.parse(raw) as User); }
    catch { localStorage.removeItem(SESSION_KEY); }
    if (!saved) return;
    setUser(saved);
    // La sesión se revalida contra el servidor en cada carga: si el administrador
    // cambió la contraseña o cesó la cuenta, aquí es donde se cierra.
    //
    // Solo cierran la sesión los motivos POSITIVOS. `desconocida` significa que
    // el servidor no pudo comprobarla (p. ej. no hay huella en este
    // dispositivo): eso no es prueba de nada, así que la sesión se conserva
    // igual que cuando no hay conexión.
    checkSession(saved.dni)
      .then(({ valid, reason, user: fresh }) => {
        if (!valid && reason !== 'desconocida') { endSession(SESSION_END_MESSAGE[reason]); return; }
        if (fresh) { setUser(fresh); localStorage.setItem(SESSION_KEY, JSON.stringify(fresh)); }
      })
      .catch(() => { /* sin conexión: se conserva la sesión guardada */ });
  }, []);

  const endSession = (message: string) => {
    setUser(null); setNotice(message);
    localStorage.removeItem(SESSION_KEY); forgetSession();
  };
  const login = (session: User) => { setUser(session); setNotice(''); localStorage.setItem(SESSION_KEY, JSON.stringify(session)); };
  const updateSessionUser = (session: User) => { setUser(session); localStorage.setItem(SESSION_KEY, JSON.stringify(session)); };
  const updateSettings = (next: Settings) => { setSettings(next); writeSettingsCache(next); };
  useEffect(() => {
    if (user) attachSync(user.dni, user.tipoUsuario === 'ADMINISTRADOR');
    else detachSync();
  }, [user?.dni, user?.tipoUsuario]);
  return user
    ? <Home user={user} settings={settings} onLogout={() => endSession('')} onSessionUserChange={updateSessionUser} onSettingsChange={updateSettings} />
    : <Login onLogin={login} notice={notice} settings={settings} />;
}

function Login({ onLogin, notice, settings }: { onLogin: (user: User) => void; notice: string; settings: Settings }) {
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!/^\d{8}$/.test(dni)) return setError('Ingresa un DNI válido de 8 dígitos.');
    if (password.length < 6) return setError('La contraseña debe tener por lo menos 6 caracteres.');
    setLoading(true);
    try { onLogin(await signIn({ dni, password })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.'); }
    finally { setLoading(false); }
  };
  // Identidad y textos vienen de la configuración de la app (pestaña CONFIGURACION).
  const support = settings.supportContact?.trim();
  const organization = settings.organization?.trim();
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title"><div className="brand-mark">{settingText(settings, 'appShortName')}</div><p className="eyebrow">{settingText(settings, 'loginEyebrow')}</p><h1 id="login-title">{settingText(settings, 'loginTitle')}</h1><p className="login-copy">{settingText(settings, 'loginSubtitle')}</p>{notice && <p className="form-error" role="status">{notice}</p>}<form onSubmit={submit} className="login-form"><label>DNI<input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" maxLength={8} placeholder="DNI de 8 dígitos" autoFocus /></label><label>Contraseña<span className="password-field"><input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} minLength={6} autoComplete="current-password" placeholder="Tu contraseña" /><button type="button" className="show-password" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'} title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}><span className="material-symbols-outlined" aria-hidden="true">{showPassword ? 'visibility_off' : 'visibility'}</span></button></span></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={loading}>{loading ? 'Validando…' : 'Ingresar'}</button></form>{(support || organization) && <p className="login-foot">{support ? `¿Problemas para ingresar? Escribe a ${support}.` : organization}{support && organization ? ` · ${organization}` : ''}</p>}</section></main>;
}

/**
 * Estructura persistente portada de MOTOR PWA: barra superior con menú
 * sándwich y tema, drawer lateral, contenedor de vistas y footer de navegación.
 */
function Home({ user, settings, onLogout, onSessionUserChange, onSettingsChange }: {
  user: User; settings: Settings;
  onLogout: () => void; onSessionUserChange: (user: User) => void; onSettingsChange: (settings: Settings) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [section, setSection] = useState<SectionId>('home');
  const desktop = useDesktopNavigation();
  const [theme, toggleTheme] = useTheme();
  const online = useOnlineStatus();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isAdmin = user.tipoUsuario === 'ADMINISTRADOR';
  const active = resolveSection(section, isAdmin);
  const dark = theme === 'dark';

  return (
    <div className={`pwa-shell ${desktop ? 'desktop-shell' : ''}`}>
      <a href="#main-container" className="skip-link">Saltar al contenido principal</a>

      <NavDrawer
        open={drawerOpen}
        persistent={desktop}
        user={user}
        settings={settings}
        isAdmin={isAdmin}
        section={active}
        online={online}
        menuButtonRef={menuButtonRef}
        onClose={() => setDrawerOpen(false)}
        onNavigate={setSection}
        onLogout={onLogout}
      />

      <header className="top-bar">
        <div className="title-group">
          {!desktop && <button ref={menuButtonRef} type="button" className="icon-btn" onClick={() => setDrawerOpen(true)}
                  aria-label="Abrir menú de navegación" aria-expanded={drawerOpen} aria-controls="nav-drawer">
            <span className="material-symbols-outlined" aria-hidden="true">menu</span>
          </button>}
          <span className="app-title">{settingText(settings, 'appName')}</span>
        </div>
        <div className="controls">
          <SyncControl />
          <button type="button" className="icon-btn" onClick={toggleTheme} title="Cambiar tema"
                  aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'} aria-pressed={dark}>
            <span className="material-symbols-outlined" aria-hidden="true">{dark ? 'light_mode' : 'dark_mode'}</span>
          </button>
          {settingOn(settings, 'showConnectionStatus') && (
            <div className="sync-indicator" role="status" aria-live="polite" title="Estado de conexión">
              <span className={`sync-dot ${online ? '' : 'offline'}`} aria-hidden="true" />
              <span>{online ? 'Online' : 'Offline'}</span>
            </div>
          )}
        </div>
      </header>

      <main id="main-container" className="main-container" tabIndex={-1}>
        {active === 'home' && <Dashboard user={user} isAdmin={isAdmin} online={online} onNavigate={setSection} />}
        {active === 'admin' && <UserAdmin user={user} onSessionUserChange={onSessionUserChange} />}
        {active === 'settings' && <AppSettings user={user} settings={settings} onSaved={onSettingsChange} />}
        {active === 'profile' && <Profile user={user} isAdmin={isAdmin} onLogout={onLogout} />}
      </main>

      <AppFooter isAdmin={isAdmin} section={active} onNavigate={setSection} />
    </div>
  );
}

/** En escritorio la navegación es persistente; en móvil y tableta es un drawer modal. */
function useDesktopNavigation(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return desktop;
}
