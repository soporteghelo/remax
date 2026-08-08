import { FormEvent, useEffect, useRef, useState } from 'react';
import { fetchSettings, isNetworkError, saveSettings, type User } from './api';
import { markSynced, reportQueued, reportSaved } from './sync';
import {
  applySettings, contrastRatio, DEFAULT_SETTINGS, readSettingsCache, SETTING_DEFS, SETTING_GROUPS,
  settingText, settingsEqual, type AppSettings as Settings, type SettingDef,
} from './settings';

/**
 * =========================================================================
 * CONFIGURACIÓN DE LA APP — módulo de administración
 * =========================================================================
 * Los ajustes viven en la pestaña CONFIGURACION de la misma hoja de cálculo.
 * Los colores del borrador se aplican en vivo a los tokens `--brand-*`, así que
 * se ven en toda la interfaz antes de guardarlos; salir sin guardar los
 * revierte. Los textos (título, mensajes) sí esperan a Guardar, porque el resto
 * de la app lee la configuración ya confirmada.
 */
export default function AppSettings({ user, settings, onSaved }: { user: User; settings: Settings; onSaved: (settings: Settings) => void }) {
  const [draft, setDraft] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState(() => readSettingsCache().lastSync);
  const savedRef = useRef(settings);

  const dirty = !settingsEqual(draft, settings);

  // Vista previa en vivo del borrador…
  useEffect(() => { applySettings(draft); }, [draft]);
  // …y vuelta a lo guardado si se abandona el módulo sin confirmar.
  useEffect(() => { savedRef.current = settings; }, [settings]);
  useEffect(() => () => { applySettings(savedRef.current); }, []);

  const set = (key: string, value: string) => { setDraft((current) => ({ ...current, [key]: value })); setError(''); setMessage(''); };

  const reload = async () => {
    setSyncing(true); setError(''); setMessage('Consultando la configuración guardada…');
    try {
      const fresh = await fetchSettings();
      onSaved(fresh); setDraft(fresh); setLastSync(new Date().toISOString());
      markSynced();
      setMessage('Configuración actualizada desde la hoja de cálculo.');
    } catch (cause) {
      setMessage(''); setError(cause instanceof Error ? cause.message : 'No se pudo consultar la configuración.');
    } finally { setSyncing(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    setSaving(true);
    try {
      const result = await saveSettings(user.dni, draft);
      onSaved(result.settings); setDraft(result.settings); setLastSync(new Date().toISOString());
      reportSaved('Configuración de la aplicación');
      setMessage(result.message);
    } catch (cause) {
      if (isNetworkError(cause)) {
        reportQueued({ kind: 'guardar-config', label: 'Configuración de la aplicación', payload: draft });
        onSaved(draft); setLastSync(new Date().toISOString());
        setMessage('Configuración guardada en este dispositivo. Se enviará al sincronizar.');
      } else setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración.');
    } finally { setSaving(false); }
  };

  const syncedAt = lastSync ? `Sincronizado: ${new Date(lastSync).toLocaleString('es-PE')}` : 'Aún no sincronizado con la hoja';
  const warnings = contrastWarnings(draft);

  return (
    <section className="page-content app-settings-page">
      <p className="eyebrow dark">ADMINISTRACIÓN</p>
      <h1>Configuración de la app</h1>
      <p className="subtitle">
        Título, colores y comportamiento general. Cada ajuste es una fila de la pestaña <b>CONFIGURACION</b> de
        la hoja de cálculo y aplica a todas las personas que usan el portal.
      </p>

      <form className="cfg" onSubmit={submit}>

        {/* Barra de acciones: acompaña al desplazamiento para guardar desde cualquier grupo */}
        <div className="cfg-bar">
          <p className="cfg-bar-state">
            <span className={`cfg-dot ${dirty ? 'is-dirty' : ''}`} aria-hidden="true" />
            {dirty ? 'Cambios sin guardar · los colores ya se ven en vista previa' : syncedAt}
          </p>
          <div className="cfg-bar-actions">
            <button type="button" className="sync-button" onClick={reload} disabled={syncing || saving}>
              {syncing ? 'Consultando…' : '↻ Recargar'}
            </button>
            <button type="button" className="back-button" onClick={() => setDraft(settings)} disabled={!dirty || saving}>
              Descartar
            </button>
            <button className="primary-button" disabled={!dirty || saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>

        {message && <p className="form-hint cfg-note" role="status">{message}</p>}
        {error && <p className="form-error cfg-note" role="alert">{error}</p>}

        {warnings.map((warning) => (
          <div className="ds-alert sev-med cfg-note" key={warning.key} role="status">
            <span className="material-symbols-outlined" aria-hidden="true">contrast</span>
            <span className="ds-alert-tx">{warning.text}</span>
            <span className="ds-sev-chip">Contraste</span>
          </div>
        ))}

        {SETTING_GROUPS.map((group) => (
          <section className="ds-panel cfg-group" key={group.id} aria-labelledby={`cfg-${group.id}`}>
            <div className="ds-panel-head">
              <h2 className="ds-panel-title" id={`cfg-${group.id}`}>
                <span className={`cfg-group-ico ${group.tone}`}>
                  <span className="material-symbols-outlined" aria-hidden="true">{group.icon}</span>
                </span>
                {group.title}
              </h2>
              <span className="cfg-group-hint">{group.hint}</span>
            </div>
            <div className="ds-panel-body cfg-fields">
              {SETTING_DEFS.filter((def) => def.group === group.id).map((def) => (
                <Field key={def.key} def={def} value={draft[def.key] ?? ''} onChange={(value) => set(def.key, value)} />
              ))}
            </div>
          </section>
        ))}

        <div className="cfg-foot">
          <button type="button" className="back-button" onClick={() => { setDraft({ ...DEFAULT_SETTINGS }); setMessage('Valores por defecto cargados. Pulsa Guardar para aplicarlos.'); }}>
            <span className="material-symbols-outlined" aria-hidden="true">restart_alt</span>
            Restablecer valores por defecto
          </button>
          <p className="cfg-group-hint">Los cambios se guardan en la hoja; el resto de dispositivos los recibe en su siguiente carga.</p>
        </div>
      </form>
    </section>
  );
}

/** Un campo por tipo declarado en el catálogo; la etiqueta siempre es visible. */
function Field({ def, value, onChange }: { def: SettingDef; value: string; onChange: (value: string) => void }) {
  const id = `cfg-field-${def.key}`;
  const hintId = `${id}-hint`;

  if (def.type === 'boolean') {
    const on = value === 'true';
    return (
      <div className="cfg-field cfg-field-switch">
        <label className="cfg-switch" htmlFor={id}>
          <input id={id} type="checkbox" role="switch" checked={on} aria-describedby={hintId}
                 onChange={(event) => onChange(event.target.checked ? 'true' : 'false')} />
          <span className="cfg-switch-track" aria-hidden="true"><span className="cfg-switch-knob" /></span>
          <span className="cfg-label">{def.label}</span>
        </label>
        <span className="cfg-hint" id={hintId}>{def.hint} Ahora: <b>{on ? 'activado' : 'desactivado'}</b>.</span>
      </div>
    );
  }

  if (def.type === 'color') {
    const valid = /^#[0-9a-f]{6}$/i.test(value);
    return (
      <div className="cfg-field">
        <label className="cfg-label" htmlFor={id}>{def.label}</label>
        <span className="cfg-color">
          <input className="cfg-swatch" type="color" value={valid ? value : def.def}
                 onChange={(event) => onChange(event.target.value)} aria-label={`${def.label}: selector de color`} />
          <input className="cfg-input cfg-hex" id={id} value={value} spellCheck={false} maxLength={7}
                 aria-describedby={hintId} onChange={(event) => onChange(normalizeHex(event.target.value))} />
        </span>
        <span className="cfg-hint" id={hintId}>{def.hint}{valid ? '' : ' Formato #rrggbb; se conserva el color actual hasta completarlo.'}</span>
      </div>
    );
  }

  if (def.type === 'select') {
    return (
      <div className="cfg-field">
        <label className="cfg-label" htmlFor={id}>{def.label}</label>
        <select className="cfg-input" id={id} value={value} aria-describedby={hintId} onChange={(event) => onChange(event.target.value)}>
          {def.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
        <span className="cfg-hint" id={hintId}>{def.hint}</span>
      </div>
    );
  }

  return (
    <div className="cfg-field">
      <label className="cfg-label" htmlFor={id}>{def.label}</label>
      <input className="cfg-input" id={id} value={value} maxLength={def.maxLength} aria-describedby={hintId}
             placeholder={def.placeholder ?? def.def} onChange={(event) => onChange(event.target.value)} />
      <span className="cfg-hint" id={hintId}>{def.hint}</span>
    </div>
  );
}

const normalizeHex = (value: string): string => {
  const hex = value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toLowerCase();
  return hex ? `#${hex}` : '';
};

/**
 * El sistema de diseño exige 4.5:1. El primario también se usa como texto sobre
 * la superficie de su tema, así que se avisa cuando la elección no llega.
 */
function contrastWarnings(settings: Settings): { key: string; text: string }[] {
  const checks = [
    { key: 'primaryColor', surface: '#ffffff', theme: 'claro' },
    { key: 'primaryColorDark', surface: '#1b1b21', theme: 'oscuro' },
  ];
  return checks
    .map(({ key, surface, theme }) => ({ key, theme, ratio: contrastRatio(settingText(settings, key), surface) }))
    .filter(({ ratio }) => ratio < 4.5)
    .map(({ key, theme, ratio }) => ({
      key,
      text: `El primario del tema ${theme} contrasta ${ratio.toFixed(1)}:1 con su superficie; el mínimo legible es 4.5:1. Elige un tono ${theme === 'claro' ? 'más oscuro' : 'más claro'}.`,
    }));
}
