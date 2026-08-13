import { useOnlineStatus } from './shell';
import { runSync, useSyncState } from './sync';

/**
 * Indicador compacto: no abre paneles ni muestra avisos al pulsarlo. El color,
 * la insignia y la breve animación son todo el estado visible de sincronización.
 */
export default function SyncControl() {
  const online = useOnlineStatus();
  const sync = useSyncState();
  const syncing = sync.status === 'sincronizando';
  const pending = sync.pending.length;

  const visual = !online
    ? { icon: 'cloud_off', tone: 'offline', label: pending ? `Sin internet. ${pending} cambio${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} en este dispositivo.` : 'Sin internet. No hay cambios pendientes.' }
    : syncing
      ? { icon: 'sync', tone: 'syncing', label: pending ? `Sincronizando ${pending} cambio${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} con la nube.` : 'Sincronizando con la nube.' }
      : pending
        ? { icon: 'cloud_upload', tone: 'pending', label: `${pending} cambio${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} por sincronizar.` }
        : { icon: 'cloud_done', tone: 'ready', label: 'Conectado. No hay cambios pendientes.' };

  return <div className="global-sync">
    <button type="button" className={`global-sync-button is-${visual.tone}`} onClick={() => void runSync()}
            aria-label={`${visual.label} Sincronizar ahora.`} title={pending ? `${pending} cambio${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}` : 'Sincronizar'}>
      <span className={`material-symbols-outlined ${syncing ? 'is-spinning' : ''}`} aria-hidden="true">{visual.icon}</span>
      {pending > 0 && <span className="global-sync-badge" aria-hidden="true">{pending}</span>}
    </button>
  </div>;
}
