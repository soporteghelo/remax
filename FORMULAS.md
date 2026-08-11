# Fórmulas del panel principal (Dashboard)

Referencia exacta de cómo se calcula cada indicador del panel principal
(`src/Dashboard.tsx`). Todo se calcula en el backend, función `crmDashboard_`
de [apps-script/Code.gs](apps-script/Code.gs); el frontend solo pinta lo que
esta función devuelve. Si cambias una fórmula, cámbiala ahí y vuelve a
desplegar el Web App para que se refleje.

## Alcance de datos (aplica a casi todo el panel)

Todo indicador que involucra "prospectos" parte de un mismo conjunto base,
llamado `prospects` en el código, construido por `crmFilteredProspects_`:

1. **Tabla:** `PROSPECTOS`.
2. **Quién ve qué** (columna `AgenteDNI`): un administrador ve todas las
   filas; un agente solo las suyas (`AgenteDNI` = su DNI).
3. **Filtro de fecha** (los campos "Desde" / "Hasta" del panel): sobre
   `PROSPECTOS.FechaCreacion`. Si "Desde" está vacío, no hay límite inferior;
   "Hasta" por defecto es la fecha de hoy.

De aquí en adelante, cuando se lea **"prospects"**, es este conjunto ya
filtrado por rol y por rango de fechas.

También se usa una sola lectura completa de `INTERACCIONES` (`interactionRows`)
para varios indicadores a la vez, y de ahí se deriva `latestInteractions`:
la interacción **más reciente** de cada prospecto (por
`FechaHoraContacto`, o `FechaHora` si la primera está vacía en filas
antiguas).

---

## Tarjetas KPI (fila superior)

| Indicador | Fórmula | Tabla · columna(s) | Notas |
|---|---|---|---|
| **Prospectos** | `prospects.length` | `PROSPECTOS` | Cuenta de filas en el alcance descrito arriba. |

| **Nuevos** | prospectos **sin** ninguna fila propia en `INTERACCIONES` | `PROSPECTOS` × `INTERACCIONES.ProspectoID` | Prospecto para el que `latestInteractions[ID]` no existe. |

| **Contactados** | prospectos con **al menos una** fila en `INTERACCIONES` | `PROSPECTOS` × `INTERACCIONES.ProspectoID` | 

Complemento exacto de "Nuevos": `Contactados + Nuevos = Prospectos`. |
| **Captados** | `PROSPECTOS.Captado = "SI"` **O** `PROSPECTOS.ClienteID` no vacío | `PROSPECTOS.Captado`, `PROSPECTOS.ClienteID` | Función `crmProspectCaptured_`. La segunda condición es defensiva: en el flujo normal, un prospecto nunca llega a tener `ClienteID` sin que `Captado` ya sea `SI` (`crmConvertProspectToClient_` lo exige). |


| **Seguimientos** | de `prospects`: tienen última interacción, esa interacción tiene `ProximoContacto`, `ProximoContacto ≤ ahora + 7 días`, y el prospecto **no** está captado | `INTERACCIONES.ProximoContacto` | Es el conjunto `pending`. Un prospecto ya captado deja de contar aquí (pasa a la etapa de negociación/cliente). |


| **Vencidos** | de "Seguimientos" (`pending`), los que tienen `ProximoContacto < ahora` | `INTERACCIONES.ProximoContacto` | Subconjunto de "Seguimientos", no una categoría aparte. |
| **Clientes** | filas de `CLIENTES` visibles para el actor con `FechaCierre` dentro de Desde/Hasta | `CLIENTES.FechaCierre`, `CLIENTES.AgenteDNI` | Cuenta filas de la tabla `CLIENTES` directamente, no prospectos con `ClienteID`. |
| **Conversión** | `Clientes ÷ Prospectos × 100` | — | `tasaConversion`. Redondeado a 1 decimal. |

### Los tres porcentajes que acompañan a las tarjetas

| Etiqueta mostrada | Campo interno | Fórmula | Denominador |
|---|---|---|---|
| "Contactados: X% de cobertura" | `tasaGestion` | `Contactados ÷ Prospectos × 100` | **Total de prospectos** (incluye los "Nuevos" sin trabajar). |
| "Captados: X% del total" | `tasaCaptacion` | `Captados ÷ Prospectos × 100` | **Total de prospectos**, no "Contactados". Por diseño: es el mismo valor que alimenta la barra "Captados" del embudo de abajo, donde cada etapa debe leerse como "% del total que llegó hasta aquí". Si se lee como indicador suelto de efectividad, castiga a los prospectos "Nuevos" que aún nadie trabajó — con 260 contactados de 299 y 70 captados, esto da 23.4% del total pero 26.9% sobre contactados. |
| "Conversión: X% prospecto a cliente" | `tasaConversion` | `Clientes ÷ Prospectos × 100` | **Total de prospectos**. |

---

## Gestión de prospectos (dona)

- **% gestionados** (centro de la dona): mismo valor que `tasaGestion` de arriba (`Contactados ÷ Prospectos`).
- Leyenda "Contactados": `Contactados`. Leyenda "Sin gestionar": `Nuevos`.

## Avance comercial (embudo / pipeline)

Cada barra es **% del total de prospectos** (no del paso anterior), para que la
secuencia sea siempre decreciente y comparable de un vistazo:

| Etapa | % mostrado | = |
|---|---|---|
| Prospectos | 100% | `Prospectos ÷ Prospectos` |
| Contactados | `tasaGestion` | `Contactados ÷ Prospectos` |
| Captados | `tasaCaptacion` | `Captados ÷ Prospectos` |
| Clientes | `tasaConversion` | `Clientes ÷ Prospectos` |

## Resultados (embudo por resultado)

- Se agrupan los `prospects` según `INTERACCIONES.Resultado` de su
  interacción **más reciente**.
- Un prospecto sin ninguna interacción se agrupa bajo la etiqueta fija
  `"SIN RESULTADO"`.
- Cada barra: cantidad de prospectos con ese estado (no % — cifra absoluta).

## Prospectos por canal

- Se agrupan los `prospects` según `PROSPECTOS.Canal`.
- Canal vacío se agrupa bajo la etiqueta fija `"SIN CANAL"`.
- Ordenado de mayor a menor cantidad.

## Interacciones por día

- **Tabla:** `INTERACCIONES`.
- **Columna de fecha:** `FechaHoraContacto` (o `FechaHora` en filas antiguas
  que no tengan la primera).
- **Alcance:** administrador ve todas las interacciones; agente solo las
  suyas (`INTERACCIONES.AgenteDNI` = su DNI). Independiente del alcance por
  fecha de creación que usan los indicadores de prospectos.
- Se agrupa por día calendario (`AAAA-MM-DD`) dentro de Desde/Hasta, y se
  muestran como máximo los **últimos 30 días con datos** (constante
  `CRM_DASHBOARD_SERIES_DAYS` en Code.gs), para que el gráfico no crezca sin
  límite con historiales largos.

## Seguimientos próximos

- Mismo conjunto `pending` que alimenta la tarjeta "Seguimientos".
- Se muestran hasta 8, ordenados por `ProximoContacto` ascendente (el más
  próximo primero).

---

## Solo administrador

### Prospectos asignados por agente

Por cada agente, sobre `prospects` con `AgenteDNI` = ese agente:

- **Prospectos:** cantidad de filas.
- **Cierres:** de esas filas, cuántas tienen `PROSPECTOS.ClienteID` no vacío.

### ¿Quién hizo más interacciones?

- **Seguimientos:** cantidad de **filas** de `INTERACCIONES` (sin
  deduplicar por prospecto) con `AgenteDNI` = ese agente, cuya fecha
  (`FechaHoraContacto`/`FechaHora`) cae dentro de Desde/Hasta. Es un conteo
  de interacciones registradas, no de prospectos distintos.
- **"X prospectos únicos atendidos"** (subtítulo de cada fila): cantidad de
  `ProspectoID` distintos entre esas mismas interacciones.
- Orden del ranking: por `Seguimientos` descendente; empate se rompe por
  prospectos únicos atendidos.

### ¿Quién captó más clientes?

- **Tabla:** `AUDITORIA`, filas con `Accion = "CAPTAR"` y
  `Entidad = "PROSPECTO"` (se registra una vez por cada prospecto que pasa
  a captado, ver `crmConvertProspect_`).
- Para cada `EntidadID` (= ID del prospecto), se toma el registro más
  antiguo — la primera vez que se captó.
- **Captaciones:** cuántos de esos "primeros CAPTAR" quedan a nombre de ese
  agente (`AUDITORIA.UsuarioDNI`), con `FechaHora` dentro de Desde/Hasta.

### % de captación por agente

- Por agente: `Captados ÷ Prospectos × 100`, **ambos limitados a los
  prospectos asignados a ese agente** (mismo criterio de "Captados" que la
  tarjeta KPI general, aplicado por agente en vez de al total del equipo).
- A diferencia de la tarjeta KPI "Captados" (que usa el total de la empresa
  como denominador), aquí el denominador ya es la cartera propia de cada
  agente — no hace falta cambiar nada para que sea "por agente".

---

## Resumen de los dos criterios de "Captados" que conviven hoy

| Dónde | Denominador |
|---|---|
| Tarjeta KPI "Captados" y barra "Captados" del embudo | Total de prospectos de la empresa/agente en el rango (incluye los que nadie ha contactado todavía) |
| "% de captación por agente" | Total de prospectos **de ese agente** |

Ninguno de los dos divide por "Contactados". Si se quiere un indicador de
**efectividad de captación entre la gente ya contactada**
(`Captados ÷ Contactados`), hoy no existe: habría que agregarlo como un
valor nuevo en `crmDashboard_` sin tocar `tasaCaptacion` (que debe seguir
siendo sobre el total para que el embudo tenga sentido).
