---
name: portal-pwa-design
description: Aplica, revisa y extiende el sistema de diseño Data-Dense Dashboard del Portal PWA, y propaga los cambios visuales compartidos a todas las vistas. Úsala al crear o modificar pantallas, componentes React, CSS, disposición, tarjetas, tablas, formularios, ventanas de confirmación, widgets del panel, pantalla de acceso, drawer, footer de navegación, comportamiento móvil, espaciado, tipografía, tokens de color, temas claro/oscuro o accesibilidad.
---

# Portal PWA: diseño

Lee `design-system/portal-pwa/MASTER.md` antes de cambios visuales relevantes.
Es la referencia canónica de diseño.

## Archivos de referencia

Lee la referencia más pequeña que cubra el cambio antes de tocar la interfaz:

| Necesidad | Lee |
|---|---|
| Tokens, temas, patrones compartidos del panel, accesibilidad | `src/design-system.css` |
| Reglas previstas, especificaciones de componentes, antipatrones y checklist de entrega | `design-system/portal-pwa/MASTER.md` |
| Estructura persistente, navegación, perfil y ajustes | `src/shell.css` (modelo de módulos en `src/shell.ts`) |
| Acceso, paneles compartidos, botones, tablas y formularios de administración | `src/styles.css` |
| CRM: prospectos, clientes, agenda, catálogos y modales | `src/crm.css` |
| Admin compacto, detalle, edición y cortes de escritorio | `src/admin-compact.css`, `src/detail-compact.css`, `src/edit-compact.css`, `src/desktop-layout.css` |
| Contraseña y control de sincronización | `src/password.css`, `src/sync-control.css` |
| Reprogramación de la última interacción | `src/reschedule.css` |
| Fuentes, iconos y color de la PWA | `index.html` |

Los archivos de `src/` son la implementación viva y exhaustiva. Si `MASTER.md`
contradice al CSS, manda el CSS, salvo que la tarea pida explícitamente
estandarizar o refactorizar esa regla.

## Flujo de trabajo

1. Inspecciona primero la vista objetivo en el ancho práctico más estrecho (375px) y luego en escritorio.
2. Identifica todas las vistas que tengan el mismo patrón visual antes de editar: campos de entrada, barras de filtros, tarjetas, tablas, botones, navegación, tipografía o colores de estado.
3. Trata cada cambio de diseño como un estándar de toda la aplicación. Implémentalo en `src/design-system.css` o `src/shell.css` mediante tokens compartidos; solo si eso no es posible, aplica el cambio equivalente en cada componente afectado.
4. Prioriza la decisión operativa: identificador, estado principal, siguiente acción y luego contexto secundario.
5. Reutiliza los tokens `--ds-*`, `--color-*`, `--brand-*` y `--sev-*`. Actualiza conjuntamente los temas claro y oscuro.
6. Respeta el comportamiento adaptable ya existente en los cortes reales del proyecto: 430px, 760/761px (el salto móvil/escritorio dominante), 1024px y el tope de 1440px.
7. En tablas móviles, conserva los datos pero agrupa los campos relacionados; no presentes todas las columnas como pares etiqueta/valor de igual importancia.
8. Mantén objetivos táctiles de al menos 44 px, etiquetas visibles de 12 px o más y foco de teclado visible.
9. Cuando cambie el lenguaje visual compartido, actualiza `design-system/portal-pwa/MASTER.md` en la misma entrega; una regla nueva que solo viva en el CSS se pierde.
10. Verifica con `npm run build` (compila TypeScript y genera `dist/`) y revisa el resultado con `npm run dev`.

## Sincronización: un único botón para toda la app

La nube de la barra superior (`src/SyncControl.tsx`, montada una sola vez en
`App.tsx`) es **el único control de sincronización de la aplicación**, presente y
futura. Vale también para los módulos que aún no existen.

- **Nunca** añadas botones de "Sincronizar", "Actualizar" o "Recargar" en un
  módulo, panel, tabla, cabecera o barra de acciones. Si encuentras uno, elimínalo
  y traslada su función al registro de abajo.
- Una vista **no** se actualiza sola ni con un botón propio: relee su caché
  reaccionando a `useSyncState().dataVersion`, que sube al terminar cada
  sincronización.
- Un módulo nuevo entra en esa misma pulsación registrándose **una vez al
  importarse** (nunca al montar un componente, porque el botón debe actualizarlo
  aunque la persona esté en otra pantalla):

  ```ts
  registerSyncModule({
    id: 'contratos',
    label: 'Contratos',                       // encabeza el aviso si ese módulo falla
    appliesTo: ({ isAdmin }) => isAdmin,      // opcional: se omite si no aplica
    refresh: async ({ dni }) => { /* trae de la nube y escribe su caché local */ },
  });
  ```

- Las escrituras del módulo informan con `markSaved()` cuando el cambio llegó a
  la nube, o con `queueChange({ kind, label, payload })` cuando falló por
  conexión y queda esperando en la cola. Ambas se importan de `src/sync.ts`; el
  estado de la cola lo pinta el propio botón con su color e insignia. Distingue
  el fallo de red de un error del servidor con `isNetworkError` (`src/api.ts`):
  solo el de red se encola. Ejemplo vivo: `ClientDetail` en `src/Clients.tsx`.
- Un fallo del servidor en un módulo no arrastra a los demás: cada uno se
  actualiza por separado dentro de la misma pulsación.
- La marca de frescura ("Actualizado 16:47", "Última sincronización…") es texto,
  nunca un botón. Los mensajes remiten a "la nube de la barra superior".

## Fechas y horas: un único formato

Toda fecha visible en la aplicación se muestra como **`DD/MM/AAAA`** y toda
hora como **`HH:MM` en 24 horas** (juntas: `10/08/2026 08:18`). Vale para
tablas, detalles, agendas, marcas de sincronización, exportaciones y cualquier
módulo futuro.

- Formatea **siempre** con `src/dates.ts`: `formatDate` (`DD/MM/AAAA`),
  `formatTime` (`HH:MM`) y `formatDateTime` (ambas). Nunca llames a
  `toLocaleDateString`, `toLocaleTimeString` ni `toLocaleString` en un
  componente: `es-PE` devuelve la hora en 12 horas ("6:17 p. m.") y el formato
  de fecha cambia según el navegador y el sistema operativo.
- Para el atributo `value` de un `<input type="date">` o `datetime-local`, usa
  `toDateInput` / `toDateTimeInput`, no `slice(0, 10)` / `slice(0, 16)`. Esos
  campos exigen `AAAA-MM-DD` internamente sea cual sea el idioma —el navegador
  ya los pinta como dd/mm/aaaa—, y recortar un ISO con zona devuelve el día
  equivocado en Perú (UTC-5) cuando la hora UTC ya pasó de medianoche.
- Todo campo de fecha u hora abre su selector nativo al tocarlo:
  `onClick={(e) => e.currentTarget.showPicker?.()}`. Nadie debe teclear una
  fecha dígito a dígito.
- **En la hoja de cálculo los valores siguen guardándose en ISO 8601**
  (`2026-08-10T08:18:45.455Z`). No los conviertas a `DD/MM/AAAA` al escribir:
  el orden de las listas y los filtros por rango comparan texto, y solo el ISO
  ordena igual como texto que como fecha. `DD/MM/AAAA` es formato de
  presentación, nunca de almacenamiento.

## Formularios: vistas, no ventanas flotantes

Crear y editar son **vistas del módulo** (`page-content`, botón "Volver…",
antetítulo, `h1`, subtítulo y `admin-form edit-form`), con el mismo ancho y los
mismos campos en ambas. No uses ventanas flotantes (`.modal-layer`) para altas ni
ediciones: en móvil quedan estrechas, con desplazamiento propio y sin sitio para
los mensajes de error. Reserva lo flotante para confirmaciones cortas.

## Campos con sugerencias y texto libre

Cuando un dato tenga opciones frecuentes pero la persona pueda registrar un valor
no listado (por ejemplo distrito, profesión, empresa o referencia), usa un
**campo con sugerencias filtrables**, no un `<select>` cerrado.

- Conserva un `<input>` editable: al escribir filtra la lista sin distinguir
  mayúsculas ni minúsculas. Nunca borres ni sustituyas el texto escrito por una
  coincidencia automática.
- Abre las sugerencias al enfocar el campo y mediante un botón de despliegue;
  la lista se posiciona sobre el contenido, tiene altura máxima y scroll para no
  desplazar el formulario.
- Al pulsar una sugerencia, copia su texto al input y cierra la lista. Si no hay
  coincidencias, muestra que el valor escrito se conservará y permite guardar el
  formulario con ese valor.
- Expón el patrón como `role="combobox"`, `aria-autocomplete="list"`,
  `aria-expanded`, `aria-controls` y un `role="listbox"` con identificadores
  únicos. `Escape` cierra la lista, `ArrowDown` la abre y `Enter` solo selecciona
  la opción cuando existe una única coincidencia visible; en los demás casos
  conserva el texto libre.
- Reutiliza los tokens de superficie, borde, foco y `--shadow-lg`; el control
  mantiene 42 px como mínimo y 44 px en interacción táctil. Mantén foco visible,
  contraste en ambos temas y `z-index` suficiente para los modales.
- En CRM, toma como referencia `DistrictCombobox` y `ProfessionCombobox` de
  `src/Prospects.tsx` y sus estilos en `src/crm.css`. Si aparece un tercer caso,
  extrae un componente compartido en vez de duplicar comportamiento o CSS.

## Formularios y detalle: doble columna y ancho de escritorio

Ningún formulario ni vista de detalle nuevos deben quedar en una sola columna
angosta si el módulo ya tiene ancho disponible. Reutiliza los patrones que ya
existen en vez de crear uno nuevo:

- **Formulario de alta/edición** → clase `crm-form` (`src/crm.css`) o
  `admin-form edit-form` (`src/styles.css` + `src/edit-compact.css`) para el
  estilo heredado de Equipo. Ambas son grids de **2 columnas**; los campos que
  deben ocupar toda la fila (textareas largas, avisos, botones) llevan
  `span-2`. Nunca dejes un `<form>` nuevo sin una de estas clases: por defecto
  los campos se apilan en una sola columna y desperdician la mitad del ancho.
- **Detalle de solo lectura con un único grupo de campos** → lista de
  definición en grid: `profile-grid`/`profile-field` (tarjetas, `auto-fit`) o
  `crm-info dl` dentro de un `ds-panel` (2 columnas fijas, para pares
  etiqueta/valor más densos). No inventes una tabla o una lista vertical para
  esto.
- **Detalle con dos grupos de contenido** (datos principales + una lista,
  historial o notas) → `crm-detail-grid` con dos paneles `ds-panel`
  (`crm-info` a la izquierda, `crm-history` a la derecha). **No** metas ambos
  grupos en una sola tarjeta angosta apilada verticalmente: si hay dos bloques
  de contenido distintos, van uno junto al otro, no uno sobre otro. Ejemplo:
  `ProspectDetail` (`src/Prospects.tsx`) y `ClientDetail`
  (`src/Clients.tsx`).
- **El contenedor del módulo puede tener ancho libre y el formulario seguir
  angosto igual** — son dos reglas CSS distintas. `page-content`/`crm-page` ya
  se estiran en escritorio (`src/desktop-layout.css`, tope 1440px en
  `crm.css`), pero cada `crm-form` o `admin-form` trae su propio `max-width`
  base pensado para móvil (960px / 640px) que se queda corto aunque el
  contenedor sea más ancho. La corrección para escritorio vive en
  `src/desktop-layout.css`, dentro de `@media (min-width: 1024px)`:
  `.crm-page .crm-form` (1440px, `grid-template-columns:
  repeat(auto-fit, minmax(240px, 1fr))`) y `.user-edit-page .admin-form`
  (1440px, 2 columnas). Todo formulario nuevo reutiliza uno de estos dos
  bloques en vez de inventar valores nuevos.
  - **Ojo con la especificidad al agregar una regla ahí**: en
    `src/main.tsx`, `desktop-layout.css` se importa *antes* que `crm.css` (y
    antes que `styles.css` para `.admin-form`). Si la regla de escritorio usa
    el mismo selector de una sola clase que la regla base (`.crm-form` contra
    `.crm-form`), pierde por orden de importación aunque esté dentro de un
    `@media` que sí aplica — el navegador no prioriza medias queries por
    especificidad. Hay que calificar con la clase del contenedor
    (`.crm-page .crm-form`, `.user-edit-page .admin-form`) para que la regla
    de escritorio gane siempre, sin depender del orden de los `<link>`/`import`.
- El mismo desperdicio de espacio pasa al revés con **barras de filtro de un
  solo campo**: si el contenedor de filtros (`.crm-filters`) no tiene su
  propio `max-width`, se estira al ancho completo de la página aunque el
  campo interno esté limitado a unos cientos de px (`grid-template-columns:
  minmax(240px,520px)`), dejando una tarjeta con fondo/borde vacíos a la
  derecha del campo. Ejemplo ya corregido: `.crm-client-filter` en
  `src/crm.css` lleva `max-width: max-content` para que la tarjeta se ajuste
  al campo en vez de ocupar el ancho del contenedor.
- Antes de dar por terminada una vista nueva, ábrela en el ancho más estrecho
  (375px, una columna) **y** en escritorio (≥1024px): si en escritorio un
  formulario o un detalle deja un bloque angosto pegado a la izquierda con
  espacio vacío a la derecha —o, al revés, una tarjeta ancha con un solo
  campo angosto perdido adentro— falta aplicar uno de los puntos anteriores.

## Reglas obligatorias

### Acciones inferiores siempre visibles

- Toda vista con botones de acción al final debe dejar una separación inferior
  adicional mediante `--ds-bottom-action-clearance`. La regla vive en el
  contenedor desplazable compartido, no duplicada por módulo.
- Una barra inferior fija o `sticky` usa `bottom: 0` y suma el token a su
  `padding-bottom`; nunca emplea un `bottom` negativo, porque puede ocultar
  botones tras la barra del navegador o el gesto del sistema.
- Los modales largos se estructuran como columna flex: cabecera de altura real y
  cuerpo `flex: 1; min-height: 0; overflow-y: auto`. Nunca calcules el alto del
  cuerpo restando una altura fija de cabecera, ya que los títulos pueden envolver.
- Verifica a 375 px que el último botón se vea completo, tenga espacio debajo y
  siga accesible con contenido largo y con `env(safe-area-inset-bottom)`.

- No introduzcas colores hexadecimales directos en componentes; usa tokens semánticos.
  Los colores directos que aún quedan en el CSS son excepciones heredadas de
  compatibilidad: no los propagues a componentes nuevos.
- No crees tarjetas repetidas únicamente para enmarcar datos relacionados.
- Evita suposiciones de ancho de escritorio en filtros, controles, tarjetas y navegación.
- Usa un tamaño tipográfico compacto solo en controles breves y densos, como búsqueda o filtros; conserva un tamaño cómodo en campos normales de formularios.
- Todo destino de navegación lleva icono **y** texto; el activo se marca con `aria-current`.
- Un solo control de sincronización en toda la app: la nube de la barra superior.
- La tipografía es **Inter** (cargada en `index.html`) y los iconos vienen de
  **Material Symbols Outlined**. Nunca emojis como iconos ni una segunda
  librería de iconos.
- Las transiciones duran entre 150 y 300 ms con los tokens `--ds-dur-fast`
  (150ms) o `--ds-dur` (220ms) y `--ds-ease`, y se desactivan bajo
  `prefers-reduced-motion`.
- Replica cambios de tamaño de letra, colores, tarjetas, espaciado, controles y comportamiento responsivo en cada vista que use el mismo patrón. Adapta solo la jerarquía de contenido cuando una vista tenga datos operativos distintos; no dejes equivalentes visualmente inconsistentes.
- No edites `dist/`: es salida de compilación.

## Comprobación final

Antes de entregar, confirma que:

- Todo control nuevo tiene un estado de foco de teclado visible.
- El contraste es correcto en tema claro **y** oscuro.
- La disposición responde bien a 375px, 430px, 760px, 1024px y 1440px, sin
  desbordamiento horizontal en móvil.
- El significado no depende solo del color: lo acompaña un icono, un texto o
  una forma.
- Las acciones inferiores se ven completas y conservan
  `--ds-bottom-action-clearance` bajo el último botón.
- Ninguna regla quedó duplicada donde un token o un componente compartido ya
  podía expresarla.
- `npm run build` compila sin errores.
