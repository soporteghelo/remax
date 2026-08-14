# Design System Master File

> **LÓGICA:** Al construir una vista concreta, revisa primero
> `design-system/pages/[nombre-vista].md`. Si ese archivo existe, sus reglas
> **anulan** este Master. Si no existe, sigue estrictamente lo de abajo.

---

**Proyecto:** Portal PWA (LoginApp_own)
**Origen:** portado desde MOTOR PWA · `design-system/motor-pwa/MASTER.md`
**Categoría:** Analytics Dashboard
**Stack:** React 18 + TypeScript + Vite, CSS plano con tokens (sin Tailwind)

---

## Dónde vive el sistema

| Archivo | Contenido |
|---|---|
| `src/design-system.css` | Tokens (`--ds-*`, `--color-*`, `--sev-*`) y componentes compartidos (`.ds-kpi`, `.ds-panel`, `.ds-alert`, `.ds-mod`, tonos, accesibilidad). |
| `src/shell.css` | Estructura persistente: barra superior, drawer de navegación, footer de navegación y panel principal. |
| `src/shell.ts` | Modelo de navegación (`MODULES`, `moduleList`, `footerItems`) y hooks `useTheme` / `useOnlineStatus`. |
| `src/styles.css` | Estilos heredados del login y de los módulos (tarjetas, tablas, modal, formularios). |

Un cambio visual compartido se hace en `src/design-system.css` o `src/shell.css`,
nunca duplicando reglas dentro de un componente.

---

## Reglas globales

### Paleta

Los dos temas se diseñan en pareja. Ningún componente usa hex crudo.

| Rol | Claro | Oscuro | Variable CSS |
|---|---|---|---|
| Primary | `#000666` | `#BDC2FF` | `--color-primary` |
| On Primary | `#FFFFFF` | `#000767` | `--color-on-primary` |
| Primary Fixed (contenedor suave) | `#E0E0FF` | `#343D96` | `--color-primary-fixed` |
| On Primary Fixed | `#000767` | `#E0E0FF` | `--color-on-primary-fixed` |
| Background | `#F8F9FA` | `#101014` | `--color-bg` |
| Surface (tarjeta / fila) | `#FFFFFF` | `#1B1B21` | `--ds-surface` |
| Surface hundida (cabeceras, zonas bajas) | `#F5F2FB` | `#24242B` | `--ds-surface-sunken` |
| Foreground | `#1B1B21` | `#E4E1E9` | `--ds-fg` |
| Foreground atenuado | `#454652` | `#C7C5D0` | `--ds-fg-muted` |
| Border | `#C6C5D4` | `#45464F` | `--ds-border` |
| Border suave | `rgba(198,197,212,.45)` | `rgba(199,197,208,.20)` | `--ds-border-soft` |
| Scrim (overlay) | `rgba(27,27,33,.55)` | `rgba(0,0,0,.68)` | `--ds-scrim` |

**Notas de color:** índigo corporativo + superficies neutras. `--ds-fg` da 15.8:1
sobre `--ds-surface` en claro y 13.4:1 en oscuro; `--ds-fg-muted` da 9.1:1 y 9.6:1.
En oscuro el primario **se aclara**, no se invierte.

#### Escala de severidad

| Nivel | Claro (fg) | Oscuro (fg) | Variables |
|---|---|---|---|
| Crítico | `#111827` | `#E5E7EB` | `--sev-crit-fg` / `-bg` / `-bd` |
| Alto | `#B91C1C` | `#FCA5A5` | `--sev-high-*` |
| Medio | `#B45309` | `#FCD34D` | `--sev-med-*` |
| Correcto | `#047857` | `#6EE7B7` | `--sev-ok-*` |

#### Tonos de icono

`.ds-tone-primary`, `.ds-tone-violet`, `.ds-tone-slate`, `.ds-tone-emerald`,
`.ds-tone-amber`, `.ds-tone-red`. Cada tono define fondo y texto emparejados en
ambos temas. Un módulo nuevo elige un tono, nunca un hex.

### Tipografía

- **Titulares y cuerpo:** Inter (400, 500, 600, 700, 900)
- **Iconos:** Material Symbols Outlined (ligaduras). Nunca emojis como iconos.
- **Mood:** material design 3, tonal, denso, accesible, adaptable

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" rel="stylesheet">
```

| Rol | Tamaño / interlineado / peso |
|---|---|
| h1 | 28px / 36px / 700 · `-0.02em` |
| h2 | 24px / 32px / 600 · `-0.01em` |
| h3 | 18px / 24px / 600 |
| body-lg | 16px / 24px / 400 |
| body-md | 13px / 18px / 400 |
| label-md | 11px / 14px / 500 · `0.01em` |
| button | 13px / 18px / 600 |

Etiquetas visibles: **12px como mínimo**. En campos de formulario móviles se usa
16px para evitar el auto-zoom de iOS.

### Espaciado y densidad

| Token | Valor | Uso |
|---|---|---|
| `--space-xs` … `--space-3xl` | 4 / 8 / 16 / 24 / 32 / 48 / 64px | Escala general |
| `--ds-gap` | `8px` | Separación entre tarjetas densas |
| `--ds-card-pad` | `12px` | Relleno de tarjeta densa |
| `--ds-row-h` | `36px` | Alto de fila y de control compacto |

### Sombras

| Nivel | Valor | Uso |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.05)` | Elevación sutil |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,.1)` | Tarjetas, botones |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,.1)` | Modales, desplegables |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,.15)` | Destacados |

### Movimiento

| Token | Valor |
|---|---|
| `--ds-dur-fast` | `150ms` |
| `--ds-dur` | `220ms` |
| `--ds-ease` | `cubic-bezier(.16, 1, .3, 1)` |

El drawer usa `0.32s cubic-bezier(.4, 0, .2, 1)` (entrada/salida de panel MD3).
Todo se anula bajo `prefers-reduced-motion: reduce`.

### Medidas de la estructura

| Token | Valor |
|---|---|
| `--topbar-height` | `60px` |
| `--footer-height` | `68px` |
| `--drawer-width` | `280px` |

---

## Especificación de componentes

### Indicador (`.ds-kpi`)

Tarjeta accionable: icono con tono, valor tabular de 26px, etiqueta de 10px en
mayúsculas y porcentaje opcional a la derecha. Toda la tarjeta es el área táctil
y navega **con el filtro ya aplicado**. `.is-critical` añade un borde izquierdo
rojo de 4px — el color nunca es el único indicador. Bajo 480px el porcentaje sube
a la esquina para que la etiqueta no se parta en dos líneas.

### Panel (`.ds-panel`)

Contenedor de sección: `--ds-surface`, borde `--ds-border`, radio 18px.
`.ds-panel-head` reparte título (`.ds-panel-title`, 13px/800) y acción.

### Alerta accionable (`.ds-alert`)

Fila pulsable con número, texto y chip de severidad (`.ds-sev-chip`). Variantes
`.sev-crit`, `.sev-high`, `.sev-med`, `.sev-ok`, `.sev-neutral`. Hover desplaza
3px en X — nunca escala, para no mover el layout.

### Acceso a módulo (`.ds-mod`)

Icono con tono + nombre + descripción de una línea. Hover eleva 2px y tiñe el
borde con el primario. Es navegación pura: **no repite métricas** que ya estén
en los indicadores.

### Barra apilada (`.ds-stack` + `.ds-legend`)

Toda la distribución de un módulo en una línea de 10px, con leyenda pulsable que
filtra. Cada segmento lleva su cifra en la leyenda, no solo el color.

### Drawer de navegación (`.nav-drawer`)

280px, fijo a la izquierda, `translateX(-100%) → 0`. Cabecera con degradado de
marca (`--drawer-gradient`), patrón de puntos al 7%, avatar, nombre, DNI y chip
de rol. Lista completa de destinos con icono **y** texto; el activo lleva
`aria-current`. Cerrar sesión va separado del resto por una línea. Pie con estado
del sistema y versión.

### Footer de navegación (`.main-footer`)

Barra inferior persistente, alto `--footer-height`, columnas centradas de
112–136px (a pantalla completa bajo 480px). Cada botón: icono + texto, mínimo
44px de alto, estado activo con fondo teñido al 12% del primario.

### Acciones al final de vistas y modales

Los contenedores desplazables reservan `--ds-bottom-action-clearance` debajo de
las acciones finales. El token nunca baja de 24px e incorpora
`env(safe-area-inset-bottom)`, de modo que botones como Guardar, Confirmar,
Registrar o Eliminar no queden ocultos por el navegador ni por el gesto del
sistema.

Las barras de acción `sticky` se anclan con `bottom: 0` y suman ese token a su
`padding-bottom`. Los modales largos usan una columna flex con cabecera de altura
natural y cuerpo desplazable (`flex: 1; min-height: 0`); no restan una altura de
cabecera fija al viewport.

### Sincronización global (`.global-sync-button`)

**Es el único control de sincronización de toda la aplicación.** Vive en la barra
superior (`src/SyncControl.tsx`, montado una sola vez en `App.tsx`) y su icono
resume el estado: verde `cloud_done` al día, ámbar `cloud_upload` con cambios en
cola (insignia con la cantidad), rojo `cloud_off` sin conexión, `sync` girando
mientras trabaja. Pulsarlo envía la cola y actualiza **todos** los módulos
registrados; no abre paneles ni exige confirmación.

Ningún módulo lleva botón propio de "Sincronizar", "Actualizar" o "Recargar".
Para que un módulo nuevo entre en esa pulsación:

1. Regístralo una vez, al importarse (no al montar un componente):
   `registerSyncModule({ id, label, appliesTo?, refresh })` en `src/sync.ts`.
   `refresh` trae los datos de la nube y los guarda en su caché local.
2. En la vista, relee esa caché reaccionando a `useSyncState().dataVersion`.
3. Las escrituras usan `markSaved()` cuando el cambio llegó a la nube, o
   `queueChange({ kind, label, payload })` cuando falló por conexión y espera en
   la cola. Ambas salen de `src/sync.ts`; distingue el fallo de red del error de
   servidor con `isNetworkError` (`src/api.ts`), porque solo el de red se encola.

Los textos de estado remiten siempre a "la nube de la barra superior"; el sello
de frescura (`.dash-updated`, resúmenes) es texto, nunca un botón.

### Botones e inputs heredados

`.primary-button`, `.secondary-button`, `.new-user-button`,
`.admin-form input|select` viven en `src/styles.css`. Al modificarlos, replica el
cambio en todos los módulos que usen el mismo patrón.

### Campo con sugerencias y texto libre

Úsalo cuando haya valores habituales que ayuden a completar un campo, pero no
deban limitar el valor que se guarda (distrito, profesión, empresa o referencia).
No lo sustituyas por un `<select>` cerrado.

- El input conserva siempre el texto escrito y filtra las sugerencias sin
  distinguir mayúsculas ni minúsculas. Nunca completa o reemplaza un
  valor por sí solo.
- La lista abre al enfocar o tocar el botón de despliegue; queda superpuesta,
  con altura máxima y scroll, para no mover el formulario. Elegir una sugerencia
  copia su texto y cierra la lista.
- Si no hay coincidencias, informa que el valor manual se guardará y acepta el
  envío tal como fue escrito.
- Expón `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`,
  `aria-controls` y un `role="listbox"` con IDs únicos. `Escape` cierra,
  `ArrowDown` abre y `Enter` selecciona solo cuando hay una coincidencia visible;
  de otro modo conserva el texto libre.
- Usa tokens de superficie, borde, foco y `--shadow-lg`; conserva 42 px de alto
  mínimo y 44 px en táctil, foco visible y contraste correcto en ambos temas.

La referencia implementada es `DistrictCombobox` y `ProfessionCombobox` en
`src/Prospects.tsx`, con `.district-combobox` y `.profession-combobox` en
`src/crm.css`. Ante un tercer uso, extrae un componente y estilo compartidos.

### Fechas y horas (`src/dates.ts`)

Formato único en toda la app: fecha **`DD/MM/AAAA`**, hora **`HH:MM` en 24
horas**, juntas `10/08/2026 08:18`.

| Uso | Función |
| --- | --- |
| Mostrar una fecha | `formatDate(valor)` → `10/08/2026` |
| Mostrar una hora | `formatTime(valor)` → `08:18` |
| Mostrar ambas | `formatDateTime(valor)` → `10/08/2026 08:18` |
| `value` de `<input type="date">` | `toDateInput(valor)` |
| `value` de `<input type="datetime-local">` | `toDateTimeInput(valor)` |

Nunca `toLocaleDateString`/`toLocaleString` en un componente: `es-PE` da la hora
en 12 horas y la fecha varía según navegador y sistema. Todo campo de fecha abre
su selector nativo al tocarlo con `onClick={(e) => e.currentTarget.showPicker?.()}`.

En la hoja de cálculo los valores se guardan en **ISO 8601**, no en
`DD/MM/AAAA`: el orden de las listas y los filtros por rango comparan texto, y
solo el ISO ordena igual como texto que como fecha.

---

## Guías de estilo

**Estilo:** Data-Dense Dashboard

**Palabras clave:** múltiples widgets, tablas de datos, tarjetas KPI, relleno
mínimo, layout en grid, máxima visibilidad de datos.

**Efectos clave:** resaltado de fila en hover, transiciones suaves de filtro,
tooltips, estados de carga con esqueleto.

### Orden de lectura del panel principal

1. **Contexto** — quién soy y qué tan fresco es el dato (franja delgada, no banner)
2. **Estado** — indicadores operativos; cada uno navega con filtro aplicado
3. **Atención** — lo accionable primero, arriba
4. **Análisis** — distribución y tasas, en segundo plano
5. **Accesos** — navegación pura

Cada dato aparece **una sola vez**.

---

## Anti-patrones (NO usar)

- ❌ Diseño ornamental
- ❌ Vistas sin filtrado
- ❌ **Emojis como iconos** — usa Material Symbols (o SVG de un set único)
- ❌ **Falta de `cursor:pointer`** en elementos pulsables
- ❌ **Hovers que desplazan el layout** (escalados que empujan a los vecinos)
- ❌ **Texto de bajo contraste** — mínimo 4.5:1
- ❌ **Cambios de estado instantáneos** — siempre 150–300ms
- ❌ **Foco invisible** — el anillo de foco es obligatorio
- ❌ **Hex crudos en componentes** — siempre tokens
- ❌ **Tarjeta repetida** solo para enmarcar datos relacionados
- ❌ **Botones de sincronizar o actualizar dentro de un módulo** — el único es la
  nube de la barra superior
- ❌ **Altas y ediciones en ventana flotante** — son vistas del módulo, con el
  mismo formulario y el mismo ancho
- ❌ **`toLocaleString` para fechas** — usa `src/dates.ts`: `DD/MM/AAAA` y `HH:MM`
- ❌ **Campos de fecha que obligan a teclear** — abre el selector con `showPicker()`

---

## Checklist previo a entregar

- [ ] Sin emojis como iconos; set de iconos único
- [ ] `cursor: pointer` en todo lo pulsable
- [ ] Hover con transición de 150–300ms
- [ ] Contraste de texto ≥ 4.5:1 en claro **y** oscuro
- [ ] Foco visible para navegación por teclado
- [ ] `prefers-reduced-motion` respetado
- [ ] Objetivos táctiles ≥ 44px en `pointer: coarse`
- [ ] Responsive verificado a 375px, 768px, 1024px y 1440px
- [ ] Sin contenido oculto tras la barra superior o el footer fijo
- [ ] Botones inferiores completos, con separación segura debajo
- [ ] Fechas en `DD/MM/AAAA` y horas en `HH:MM`, formateadas con `src/dates.ts`
- [ ] Sin scroll horizontal en móvil
- [ ] Ningún botón de sincronizar/actualizar fuera de la nube de la barra superior
- [ ] Módulo nuevo registrado con `registerSyncModule` y releyendo su caché con
      `useSyncState().dataVersion`
- [ ] Tokens claro y oscuro actualizados juntos
