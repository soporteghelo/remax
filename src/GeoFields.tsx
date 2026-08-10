import { useEffect, useMemo, useState } from 'react';
import {
  COUNTRIES, DEFAULT_COUNTRY, levelsFor, loadDistricts, loadProvinces, loadRegions,
} from './geo';

export interface GeoValue {
  pais: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

type GeoFieldProps = {
  value: GeoValue;
  onChange: (value: GeoValue) => void;
  disabled?: boolean;
  required?: boolean;
};

function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options;
}

export default function GeoFields({ value, onChange, disabled = false, required = false }: GeoFieldProps) {
  const country = value.pais || DEFAULT_COUNTRY;
  const levels = levelsFor(country);
  const [regions, setRegions] = useState<string[]>([]);
  const [provinces, setProvinces] = useState<string[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [loading, setLoading] = useState<'region' | 'province' | 'district' | ''>('');
  const [geoError, setGeoError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading('region'); setGeoError(''); setRegions([]); setProvinces([]); setDistricts([]);
    loadRegions(country)
      .then((items) => { if (active) setRegions(items); })
      .catch(() => { if (active) setGeoError('No se pudieron cargar las ubicaciones. Revisa tu conexión e inténtalo otra vez.'); })
      .finally(() => { if (active) setLoading(''); });
    return () => { active = false; };
  }, [country, retry]);

  useEffect(() => {
    if (!value.departamento || !levels.hasProvince) { setProvinces([]); return; }
    let active = true;
    setLoading('province'); setGeoError(''); setProvinces([]); setDistricts([]);
    loadProvinces(country, value.departamento)
      .then((items) => { if (active) setProvinces(items); })
      .catch(() => { if (active) setGeoError('No se pudieron cargar las provincias. Inténtalo otra vez.'); })
      .finally(() => { if (active) setLoading(''); });
    return () => { active = false; };
  }, [country, value.departamento, levels.hasProvince, retry]);

  useEffect(() => {
    const parentReady = value.departamento && (!levels.hasProvince || value.provincia);
    if (!parentReady) { setDistricts([]); return; }
    let active = true;
    setLoading('district'); setGeoError(''); setDistricts([]);
    loadDistricts(country, value.departamento, value.provincia)
      .then((items) => { if (active) setDistricts(items); })
      .catch(() => { if (active) setGeoError('No se pudieron cargar los distritos o ciudades. Inténtalo otra vez.'); })
      .finally(() => { if (active) setLoading(''); });
    return () => { active = false; };
  }, [country, value.departamento, value.provincia, levels.hasProvince, retry]);

  const regionOptions = useMemo(() => withCurrent(regions, value.departamento), [regions, value.departamento]);
  const provinceOptions = useMemo(() => withCurrent(provinces, value.provincia), [provinces, value.provincia]);
  const districtOptions = useMemo(() => withCurrent(districts, value.distrito), [districts, value.distrito]);
  const change = (next: GeoValue) => onChange({ ...next, pais: next.pais || DEFAULT_COUNTRY });

  return <>
    <label>País{required ? ' *' : ''}
      <select required={required} value={country} disabled={disabled} onChange={(event) => change({ pais: event.target.value, departamento: '', provincia: '', distrito: '' })}>
        {COUNTRIES.map((item) => <option value={item.code} key={item.code}>{item.nombre}</option>)}
      </select>
    </label>
    <label>{levels.region}{required ? ' *' : ''}
      <select required={required} value={value.departamento} disabled={disabled || loading === 'region'} aria-busy={loading === 'region'} onChange={(event) => change({ ...value, pais: country, departamento: event.target.value, provincia: '', distrito: '' })}>
        <option value="">{loading === 'region' ? 'Cargando…' : `Selecciona ${levels.region.toLowerCase()}`}</option>
        {regionOptions.map((item) => <option value={item} key={item}>{item}</option>)}
      </select>
    </label>
    {levels.hasProvince && <label>{levels.province}{required ? ' *' : ''}
      <select required={required} value={value.provincia} disabled={disabled || !value.departamento || loading === 'province'} aria-busy={loading === 'province'} onChange={(event) => change({ ...value, pais: country, provincia: event.target.value, distrito: '' })}>
        <option value="">{loading === 'province' ? 'Cargando…' : 'Selecciona provincia'}</option>
        {provinceOptions.map((item) => <option value={item} key={item}>{item}</option>)}
      </select>
    </label>}
    <label>{levels.district}{required ? ' *' : ''}
      <select required={required} value={value.distrito} disabled={disabled || !value.departamento || (levels.hasProvince && !value.provincia) || loading === 'district'} aria-busy={loading === 'district'} onChange={(event) => change({ ...value, pais: country, distrito: event.target.value })}>
        <option value="">{loading === 'district' ? 'Cargando…' : `Selecciona ${levels.district.toLowerCase()}`}</option>
        {districtOptions.map((item) => <option value={item} key={item}>{item}</option>)}
      </select>
    </label>
    {geoError && <div className="geo-error span-2" role="status"><span>{geoError}</span><button type="button" onClick={() => setRetry((current) => current + 1)}>Reintentar</button></div>}
  </>;
}
