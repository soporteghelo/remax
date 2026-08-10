import { FormEvent, useEffect, useState } from 'react';
import { isNetworkError, type User } from './api';
import { deleteCatalog, hasCatalogCache, listCatalogs, readCatalogCache, saveCatalog, type CatalogInput, type CatalogItem, type CatalogType } from './crm-api';
import { State } from './Prospects';
import { markSaved, queueChange, useSyncState } from './sync';

const TYPES: CatalogType[] = ['CANAL', 'ESTADO', 'RESULTADO', 'RESULTADO CITA', 'CAPTADO_RESULTADO', 'CAPTADO_CITA', 'REUNION'];

/** Opción en espera de confirmación: `uso` deja de ser null cuando el servidor avisa de cuántos registros la usan. */
interface Removal { item: CatalogItem; uso: number | null; error: string; working: boolean }

export default function Catalogs({ user }: { user: User }) {
  const [items, setItems] = useState<CatalogItem[]>(() => readCatalogCache(user.dni)); const [type, setType] = useState<CatalogType>('CANAL'); const [editing, setEditing] = useState<CatalogInput | null>(null); const [removing, setRemoving] = useState<Removal | null>(null); const [loading, setLoading] = useState(!hasCatalogCache(user.dni)); const [error, setError] = useState('');
  const syncState = useSyncState();
  useEffect(() => { listCatalogs(user.dni).then(setItems).catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los catálogos.')).finally(() => setLoading(false)); }, [user.dni]);
  useEffect(() => { if (syncState.dataVersion) setItems(readCatalogCache(user.dni)); }, [syncState.dataVersion, user.dni]);
  // La opción editada se localiza por su etiqueta anterior: al renombrarla, la que vuelve del servidor ya trae el texto nuevo.
  const save = async (item: CatalogInput) => { const previous = item.etiquetaAnterior || item.etiqueta; try { const saved = await saveCatalog(user.dni, item); setItems((current) => [...current.filter((row) => !(row.tipo === item.tipo && (row.etiqueta === previous || row.etiqueta === saved.etiqueta))), saved].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.orden - b.orden)); markSaved(); setEditing(null); } catch (cause) { if (isNetworkError(cause)) { queueChange({ kind: 'guardar-catalogo', label: `Catálogo ${item.tipo}: ${item.etiqueta}`, payload: item }); throw new Error('La opción quedó pendiente y se enviará al recuperar conexión.'); } throw cause; } };
  /**
   * Eliminar borra la fila de la hoja, así que no se encola sin conexión: hace
   * falta saber a cuántos registros afecta antes de confirmarlo.
   */
  const remove = async (target: Removal) => {
    setRemoving({ ...target, error: '', working: true });
    try {
      const result = await deleteCatalog(user.dni, target.item, target.uso !== null);
      if (!result.eliminado) return setRemoving({ ...target, uso: result.uso, error: '', working: false });
      setItems((current) => current.filter((row) => !(row.tipo === target.item.tipo && row.etiqueta === target.item.etiqueta)));
      markSaved(); setRemoving(null);
    } catch (cause) {
      setRemoving({ ...target, error: isNetworkError(cause) ? 'Sin conexión: vuelve a intentarlo cuando estés en línea.' : cause instanceof Error ? cause.message : 'No se pudo eliminar.', working: false });
    }
  };
  const visible = items.filter((item) => item.tipo === type);
  return <section className="page-content crm-page"><div className="crm-heading"><div><p className="eyebrow dark">ADMINISTRACIÓN</p><h1>Catálogos</h1><p className="subtitle">La etiqueta es lo que se ve y lo que queda guardado en cada registro.</p></div><button type="button" className="primary-button" onClick={() => { setRemoving(null); setEditing({ tipo: type, etiqueta: '', orden: visible.length + 1, activo: true }); }}><span className="material-symbols-outlined">add</span>Nueva opción</button></div><div className="catalog-tabs" role="tablist">{TYPES.map((value) => <button type="button" role="tab" aria-selected={type === value} className={type === value ? 'is-active' : ''} onClick={() => { setType(value); setEditing(null); setRemoving(null); }} key={value}>{value}</button>)}</div>{error && <p className="form-error">{error}</p>}{editing && <CatalogForm item={editing} onCancel={() => setEditing(null)} onSave={save} />}{removing && <CatalogRemoval removal={removing} onCancel={() => setRemoving(null)} onConfirm={() => remove(removing)} />}{loading ? <State icon="progress_activity" title="Cargando catálogos" text="Consultando opciones…" spin /> : <div className="catalog-list">{visible.map((item) => <article className="ds-panel" key={`${item.tipo}-${item.etiqueta}`}><span className="catalog-order">{item.orden}</span><div><b>{item.etiqueta}</b></div><span className={`crm-badge ${item.activo ? 'is-success' : 'is-neutral'}`}>{item.activo ? 'ACTIVO' : 'INACTIVO'}</span><button type="button" className="icon-btn" aria-label={`Editar ${item.etiqueta}`} onClick={() => { setRemoving(null); setEditing({ ...item, etiquetaAnterior: item.etiqueta }); }}><span className="material-symbols-outlined">edit</span></button><button type="button" className="icon-btn is-danger" aria-label={`Eliminar ${item.etiqueta}`} onClick={() => { setEditing(null); setRemoving({ item, uso: null, error: '', working: false }); }}><span className="material-symbols-outlined">delete</span></button></article>)}</div>}</section>;
}

/**
 * Confirmación en dos pasos: el primer intento pregunta y, si el servidor
 * responde que la opción está en uso, el segundo explica el alcance real antes
 * de borrarla.
 */
function CatalogRemoval({ removal, onCancel, onConfirm }: { removal: Removal; onCancel: () => void; onConfirm: () => void }) {
  const enUso = removal.uso !== null && removal.uso > 0;
  return <div className="catalog-confirm ds-panel"><p><b>¿Eliminar «{removal.item.etiqueta}»?</b></p>{enUso
    ? <p className="form-hint">La usan {removal.uso} registro(s). Si la eliminas, conservarán ese texto pero quedará fuera del catálogo: no podrás filtrarlos por esa opción ni volver a elegirla. Desactivarla en vez de borrarla mantiene el historial completo.</p>
    : <p className="form-hint">Se borra la fila de la pestaña CATALOGOS. Deja de aparecer en los formularios.</p>}{removal.error && <p className="form-error">{removal.error}</p>}<div className="form-buttons"><button type="button" className="back-button" onClick={onCancel}>Cancelar</button><button type="button" className="danger-button" disabled={removal.working} onClick={onConfirm}>{removal.working ? 'Eliminando…' : enUso ? 'Eliminar de todos modos' : 'Eliminar'}</button></div></div>;
}

function CatalogForm({ item, onCancel, onSave }: { item: CatalogInput; onCancel: () => void; onSave: (item: CatalogInput) => Promise<void> }) {
  const existing = Boolean(item.etiquetaAnterior); const [form, setForm] = useState(item); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!form.etiqueta.trim()) return setError('La etiqueta es obligatoria.'); setSaving(true); try { await onSave({ ...form, etiqueta: form.etiqueta.trim().replace(/\s+/g, ' ') }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar.'); } finally { setSaving(false); } };
  return <form className="catalog-form ds-panel" onSubmit={submit}><label>Tipo<input value={form.tipo} disabled /></label><label>Etiqueta *<input required value={form.etiqueta} onChange={(e) => setForm({ ...form, etiqueta: e.target.value })} placeholder="Ej. PUERTA PUERTA" autoFocus /></label><label>Orden<input type="number" min="1" value={form.orden} onChange={(e) => setForm({ ...form, orden: Number(e.target.value) })} /></label><label className="catalog-check"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />Disponible en formularios</label>{existing && <p className="form-hint">Si cambias la etiqueta, los prospectos e interacciones que la usaban se actualizan con el texto nuevo.</p>}{error && <p className="form-error">{error}</p>}<div className="form-buttons"><button type="button" className="back-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar opción'}</button></div></form>;
}
