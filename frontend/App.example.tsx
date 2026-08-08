import { useEffect, useState } from 'react';
import LoginScreen from './LoginScreen';
import HomeScreen from './HomeScreen';
import { authenticateUser } from './api';
import { getStorageKey, APP_CONFIG } from './config';
import type { UserSession } from './types';

/** Ejemplo de integración: DNI + contraseña -> pantalla de inicio. */
export default function App() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => { try { const saved = localStorage.getItem(getStorageKey(APP_CONFIG.storage.keys.session)); if (saved) setSession(JSON.parse(saved)); } catch { /* ignore */ } }, []);

  const handleLogin = async (dni: string, password: string, apellidos: string, nombres: string) => {
    setIsRegistering(true);
    try {
      const user = await authenticateUser({ dni, password, apellidos, nombres });
      const newSession: UserSession = { dni: user.dni, apellidos: user.apellidos, nombres: user.nombres, inicio: new Date().toISOString() };
      setSession(newSession);
      localStorage.setItem(getStorageKey(APP_CONFIG.storage.keys.session), JSON.stringify(newSession));
    } finally { setIsRegistering(false); }
  };

  const handleLogout = () => { setSession(null); localStorage.removeItem(getStorageKey(APP_CONFIG.storage.keys.session)); };
  return !session ? <LoginScreen onLogin={handleLogin} isRegistering={isRegistering} /> : <HomeScreen session={session} onLogout={handleLogout} />;
}
