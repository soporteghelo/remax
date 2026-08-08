import type { UserRecord } from './types';
import { APPS_SCRIPT_CONFIG } from './config';

async function postToAppsScript(payload: object): Promise<{ status: string; message?: string; record?: Record<string, unknown> }> {
  if (!APPS_SCRIPT_CONFIG.url) throw new Error('URL de Apps Script no configurada. Define VITE_APPS_SCRIPT_URL en tu .env');
  const response = await fetch(APPS_SCRIPT_CONFIG.url, { method: 'POST', redirect: 'follow', body: JSON.stringify(payload) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.substring(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error('Apps Script devolvió una respuesta no válida. Verifica el despliegue de la aplicación web.'); }
}

function mapUserRow(row: Record<string, unknown>): UserRecord {
  return { id: String(row.DNI || ''), dni: String(row.DNI || ''), apellidos: String(row.Apellidos || ''), nombres: String(row.Nombres || ''), fechaRegistro: String(row.FechaRegistro || ''), ultimoAcceso: String(row.UltimoAcceso || ''), dispositivo: String(row.Dispositivo || '') };
}

function getDeviceInfo(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  return 'Otro';
}

/** Autentica un usuario existente o crea uno nuevo con una contraseña protegida en el servidor. */
export async function authenticateUser(data: { dni: string; password: string; apellidos: string; nombres: string }): Promise<UserRecord> {
  const result = await postToAppsScript({ action: 'authenticateUser', ...data, dispositivo: getDeviceInfo() });
  if (result.status !== 'ok' || !result.record) throw new Error(result.message || 'No se pudo iniciar sesión');
  return mapUserRow(result.record);
}
