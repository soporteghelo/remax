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

/**
 * El contacto de soporte es texto libre: puede ser un correo o un teléfono. Solo
 * cuando es un teléfono se ofrece WhatsApp, con el número en formato
 * internacional. Un número de 9 dígitos sin prefijo se entiende peruano (+51),
 * que es el país de la aplicación; con `+` delante manda lo que se escribió.
 */
function whatsappNumber(contact: string): string {
  const digits = contact.replace(/\D/g, '');
  if (contact.trim().startsWith('+')) return digits.length >= 8 ? digits : '';
  if (digits.length === 9) return `51${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

/** Logotipo de WhatsApp: Material Symbols no trae marcas, así que va como SVG. */
function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
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
  const whatsapp = support ? whatsappNumber(support) : '';
  // El DNI ya escrito viaja en el mensaje: quien atiende sabe de qué cuenta se habla.
  const whatsappUrl = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(
        `Hola, necesito ayuda para ingresar a ${settingText(settings, 'appName')}.${/^\d{8}$/.test(dni) ? ` Mi DNI es ${dni}.` : ''}`,
      )}`
    : '';
  return <main className="login-page"><section className="login-card" aria-labelledby="login-title"><div className="brand-mark">{settingText(settings, 'appShortName')}</div><p className="eyebrow">{settingText(settings, 'loginEyebrow')}</p><h1 id="login-title">{settingText(settings, 'loginTitle')}</h1><p className="login-copy">{settingText(settings, 'loginSubtitle')}</p>{notice && <p className="form-error" role="status">{notice}</p>}<form onSubmit={submit} className="login-form"><label>DNI<input value={dni} onChange={(e) => setDni(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" maxLength={8} placeholder="DNI de 8 dígitos" autoFocus /></label><label>Contraseña<span className="password-field"><input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} minLength={6} autoComplete="current-password" placeholder="Tu contraseña" /><button type="button" className="show-password" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'} title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}><span className="material-symbols-outlined" aria-hidden="true">{showPassword ? 'visibility_off' : 'visibility'}</span></button></span></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={loading}>{loading ? 'Validando…' : 'Ingresar'}</button></form>{whatsappUrl && <a className="whatsapp-button" href={whatsappUrl} target="_blank" rel="noopener noreferrer"><WhatsAppGlyph />¿Problemas para ingresar? Escríbenos por WhatsApp</a>}{(support || organization) && <p className="login-foot">{support && !whatsappUrl ? `¿Problemas para ingresar? Escribe a ${support}.` : ''}{support && !whatsappUrl && organization ? ' · ' : ''}{organization}</p>}</section></main>;
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
  const [theme, toggleTheme] = useTheme();
  const online = useOnlineStatus();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isAdmin = user.tipoUsuario === 'ADMINISTRADOR';
  const active = resolveSection(section, isAdmin);
  const dark = theme === 'dark';

  return (
    <div className="pwa-shell">
      <a href="#main-container" className="skip-link">Saltar al contenido principal</a>

      <NavDrawer
        open={drawerOpen}
        user={user}
        settings={settings}
        isAdmin={isAdmin}
        section={active}
        menuButtonRef={menuButtonRef}
        onClose={() => setDrawerOpen(false)}
        onNavigate={setSection}
        onLogout={onLogout}
      />

      <header className="top-bar">
        <div className="title-group">
          <button ref={menuButtonRef} type="button" className="icon-btn" onClick={() => setDrawerOpen(true)}
                  aria-label="Abrir menú de navegación" aria-expanded={drawerOpen} aria-controls="nav-drawer">
            <span className="material-symbols-outlined" aria-hidden="true">menu</span>
          </button>
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
        <div className="page-transition" key={active}>
        {active === 'home' && <Dashboard user={user} isAdmin={isAdmin} onNavigate={setSection} />}
          {active === 'admin' && <UserAdmin user={user} onSessionUserChange={onSessionUserChange} />}
          {active === 'settings' && <AppSettings user={user} settings={settings} onSaved={onSettingsChange} />}
          {active === 'profile' && <Profile user={user} isAdmin={isAdmin} onLogout={onLogout} />}
        </div>
      </main>

      <AppFooter isAdmin={isAdmin} section={active} onNavigate={setSection} />
    </div>
  );
}
