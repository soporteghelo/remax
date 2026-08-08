import { useSyncExternalStore } from 'react';

/**
 * =========================================================================
 * NOTIFICACIONES BREVES
 * =========================================================================
 * Aviso corto de resultado: qué pasó y, si no salió bien, por qué. Cualquier
 * módulo puede emitir uno sin conocer al componente que los pinta.
 *
 * Un aviso NUNCA es el único sitio donde vive un error importante: los
 * formularios siguen mostrando el suyo junto al campo. Esto es el acuse de
 * recibo de una acción, no el registro del problema.
 */
export type ToastTone = 'ok' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

/** Cuántos avisos se ven a la vez; el más viejo cede el sitio. */
const MAX_VISIBLE = 3;
const DURATION: Record<ToastTone, number> = { ok: 4000, info: 6000, error: 8000 };

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function dismissToast(id: number): void {
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function notify(tone: ToastTone, title: string, detail?: string): void {
  const toast: Toast = { id: nextId++, tone, title, detail };
  toasts = [...toasts, toast].slice(-MAX_VISIBLE);
  emit();
  setTimeout(() => dismissToast(toast.id), DURATION[tone]);
}

export const toastOk = (title: string, detail?: string) => notify('ok', title, detail);
export const toastError = (title: string, detail?: string) => notify('error', title, detail);
export const toastInfo = (title: string, detail?: string) => notify('info', title, detail);

export const useToasts = (): Toast[] => useSyncExternalStore(subscribe, () => toasts);
