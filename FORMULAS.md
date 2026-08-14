# Fórmulas del panel principal (Dashboard)

Referencia exacta de cómo se calcula cada indicador del panel principal
(`src/Dashboard.tsx`). Todo se calcula en el backend, función `crmDashboard_`
de [apps-script/Code.gs](apps-script/Code.gs); el frontend solo pinta lo que
esa función devuelve. Si cambias una fórmula, cámbiala ahí y vuelve a
desplegar el Web App para que se refleje.

## Alcance de datos (aplica a casi todo el panel)

Todo indicador que involucra "prospectos" parte de un mismo conjunto base,
llamado `prospects` en el código:

1. **Tabla:** `PROSPECTOS`.
2. **Quién ve qué** (columna `AgenteDNI`): un administrador ve todas las
   filas; un agente solo las suyas (`AgenteDNI` = su DNI).
3. **Filtro de agente:** un administrador puede además limitar el cálculo a un
   solo agente (`agentDni`). Para un agente, ese filtro siempre es él mismo.
4. **Filtro de fecha** (los campos "Desde" / "Hasta"): sobre
   `PROSPECTOS.FechaCreacion`. Si "Desde" está vacío, no hay límite inferior;
   "Hasta" por defecto es la fecha de hoy. La interfaz permite elegir el rango
   por **días** o por **meses**; en ambos casos se envían dos fechas.

De aquí en adelante, cuando se lea **"prospects"**, es este conjunto ya
filtrado por rol, por agente y por rango de fechas.

También se usa una sola lectura completa de `INTERACCIONES` y de ahí se deriva
`latestInteractions`: la interacción **más reciente** de cada prospecto (por
`FechaHoraContacto`, o `FechaHora` si la primera está vacía en filas antiguas).

> El panel tiene **dos filtros independientes**: el superior alimenta las
> tarjetas KPI y los paneles de la mitad de arriba; el del tablero alimenta los
> paneles de abajo. Cada uno hace su propia llamada a `crmDashboard`.

---

## Tarjetas KPI (fila superior)

| Indicador | Fórmula | Tabla · columna(s) | Notas |
|---|---|---|---|
| **Prospectos** | `prospects.length` | `PROSPECTOS` | Cuenta de filas en el alcance descrito arriba. |
| **Nuevos** | prospectos **sin** ninguna fila propia en `INTERACCIONES` | `PROSPECTOS` × `INTERACCIONES.ProspectoID` | Prospecto para el que `latestInteractions[ID]` no existe. |
| **Contactados** | prospectos con **al menos una** fila en `INTERACCIONES` | `PROSPECTOS` × `INTERACCIONES.ProspectoID` | Complemento exacto de "Nuevos": `Contactados + Nuevos = Prospectos`. |
| **Captados** | `PROSPECTOS.Captado = "SI"` **O** `PROSPECTOS.ClienteID` no vacío | `PROSPECTOS.Captado`, `PROSPECTOS.ClienteID` | Función `crmProspectCaptured_`. Con el flujo actual, captar crea el cliente en la misma operación, así que ambas condiciones van juntas. |
| **Ventas** | filas de `CLIENTES` visibles para el actor **con `CierreVenta` registrado** y cuya `FechaCierre` cae en Desde/Hasta | `CLIENTES.CierreVenta`, `CLIENTES.FechaCierre`, `CLIENTES.AgenteDNI` | Campo interno `conversiones`. El rango se cruza contra `FechaCierre` (la captación); `CierreVenta` solo confirma que esa captación ya concretó una venta. |

### Los porcentajes que acompañan a las tarjetas

| Etiqueta mostrada | Campo interno | Fórmula | Denominador |
|---|---|---|---|
| "Contactados: X% de cobertura" | `tasaGestion` | `Contactados ÷ Prospectos × 100` | **Total de prospectos** (incluye los "Nuevos" sin trabajar). |
| "Captados: X% del total" | `tasaCaptacion` | `Captados ÷ Prospectos × 100` | **Total de prospectos**, no "Contactados". Leído como indicador suelto de efectividad castiga a los "Nuevos" que aún nadie trabajó. |

`tasaConversion` (`Ventas ÷ Prospectos × 100`) se sigue calculando en el
backend, pero **ya no se muestra** como tarjeta.

---

## Paneles del filtro superior

### Gestión de prospectos (dona)

- **% gestionados** (centro de la dona): mismo valor que `tasaGestion`.
- Leyenda "Contactados": `Contactados`. Leyenda "Sin gestionar": `Nuevos`.

### Prospectos por canal

- Se agrupan los `prospects` según `PROSPECTOS.Canal`.
- Canal vacío se agrupa bajo la etiqueta fija `"SIN CANAL"`.
- Ordenado de mayor a menor cantidad.

### Prospectos por fecha de creación (altas diarias)

- Se agrupan los `prospects` por día calendario de `FechaCreacion`.
- Se muestran como máximo los **últimos 30 días con datos** (constante
  `CRM_DASHBOARD_SERIES_DAYS`).

### Prospectos por agente · ¿Quién captó más clientes? · % de captación por agente

Solo administrador. Ver el bloque **Estadísticas por agente**.

---

## Paneles del filtro del tablero

### Resultados

- Se agrupan los `prospects` según `INTERACCIONES.Resultado` de su interacción
  **más reciente**.
- Un prospecto sin ninguna interacción se agrupa bajo la etiqueta fija
  `"SIN RESULTADO"`.
- Cada sector: cantidad de prospectos con ese resultado (cifra absoluta).

### Interacciones por etapa

- Se agrupan las interacciones del alcance según su columna `Etapa`.
- Con el flujo actual, una interacción nueva solo puede quedar en `PROSPECTO`,
  `NO CONTINUA` (cuando el estado de captación es `DESISTIÓ`) o `CLIENTE`
  (cuando la captación se cierra).

### Estado de negociaciones

- Agrupa por `Resultado` **solo** las interacciones cuya `Etapa` es
  `NEGOCIACION`.

> ⚠️ **Este panel ya no recibe datos nuevos.** `crmAddInteraction_` nunca
> escribe la etapa `NEGOCIACION`: la única función que la asigna es
> `completeInteractionStages_`, la migración que clasifica filas antiguas sin
> etapa. En una instalación nueva este panel aparecerá siempre vacío. Hay que
> decidir si se retira o si se reorienta a `INTERACCIONES.EstadoCaptacion`,
> que es donde hoy vive la información de la negociación (EN PRECIO, HASTA 20%
> SOBRE PRECIO, SOBREPRECIO, DESISTIÓ).

### Interacciones por día

- **Tabla:** `INTERACCIONES`. **Columna de fecha:** `FechaHoraContacto` (o
  `FechaHora` en filas antiguas).
- **Alcance:** administrador ve todas las interacciones; agente solo las suyas.
  Si hay filtro de agente, se limita a ese `AgenteDNI`. Es independiente del
  alcance por fecha de creación que usan los indicadores de prospectos.
- Se agrupa por día calendario dentro de Desde/Hasta y se muestran como máximo
  los **últimos 30 días con datos**.

---

## Estadísticas por agente

Solo se calculan cuando quien consulta es administrador.

### Prospectos por agente

Por cada agente, sobre `prospects` con `AgenteDNI` = ese agente:

- **prospectos:** cantidad de filas.
- **gestionados:** de esas, cuántas tienen al menos una interacción.
- **captados:** cuántas cumplen `crmProspectCaptured_`.
- **conversiones:** filas de `CLIENTES` del alcance a su nombre.

### ¿Quién hizo más interacciones?

- **seguimientos:** cantidad de **filas** de `INTERACCIONES` (sin deduplicar
  por prospecto) con `AgenteDNI` = ese agente, cuya fecha cae en Desde/Hasta.
- **prospectosContactados** (subtítulo "X prospectos únicos atendidos"):
  cantidad de `ProspectoID` distintos entre esas mismas interacciones.
- Orden: por `seguimientos` descendente; empate por prospectos únicos.

### ¿Quién captó más clientes?

- **Tabla:** `AUDITORIA`, filas con `Accion = "CAPTAR"` y
  `Entidad = "PROSPECTO"`.
- Para cada `EntidadID` se toma el registro **más antiguo** (la primera vez que
  se captó).
- **captaciones:** cuántos de esos "primeros CAPTAR" quedan a nombre de ese
  agente, con `FechaHora` dentro de Desde/Hasta.

### % de captación por agente

- Por agente: `captados ÷ prospectos × 100`, **ambos limitados a los
  prospectos asignados a ese agente**.
- A diferencia de la tarjeta KPI "Captados" (que usa el total de la empresa
  como denominador), aquí el denominador ya es la cartera propia de cada agente.

---

## Datos que el backend devuelve y ningún panel pinta

Conviene tenerlos presentes antes de "optimizar" la respuesta:

| Campo | Estado |
|---|---|
| `metrics.pendientes` / `metrics.vencidos` | Calculados; sin panel que los muestre. |
| `metrics.tasaConversion` | Calculado; la tarjeta que lo mostraba se retiró. |
| `upcoming` | Los 8 próximos seguimientos; sin panel. La Agenda se alimenta por su cuenta de `crmListProspects`. |
| `agents[].primerasInteracciones` | Calculado; sin panel. |
| `negotiationStates` | Ver la advertencia de "Estado de negociaciones". |

---

## Caché

- `crmDashboard_` guarda su resultado en `CacheService` durante
  `CRM_DASHBOARD_CACHE_SECONDS` (30 min), con clave por actor, rango y agente.
- Además cachea comprimida la lectura de las pestañas
  (`crmDashboardSource_`), para no releer Sheets al alternar filtros.
- Cualquier escritura relevante llama a `crmInvalidateDashboardCache_`, que
  cambia la versión de la clave y deja obsoletas todas las entradas.
- El frontend mantiene su propia caché por rango (`DASHBOARD_RANGE_CACHE_MS`)
  en `src/crm-api.ts`.
