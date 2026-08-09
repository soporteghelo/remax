---
name: portal-pwa-design
description: Diseña y mejora interfaces adaptables del Portal PWA con el sistema Data-Dense Dashboard, y propaga los cambios visuales compartidos a todas las vistas. Úsala al modificar disposición, tarjetas, tablas, drawer, footer de navegación, panel principal, comportamiento móvil, espaciado, tipografía, tokens de color, temas claro/oscuro o accesibilidad.
---

# Portal PWA: diseño

Lee `design-system/portal-pwa/MASTER.md` antes de cambios visuales relevantes.
Es la referencia canónica de diseño.

## Flujo de trabajo

1. Inspecciona primero la vista objetivo en el ancho práctico más estrecho (375px) y luego en escritorio.
2. Identifica todas las vistas que tengan el mismo patrón visual antes de editar: campos de entrada, barras de filtros, tarjetas, tablas, botones, navegación, tipografía o colores de estado.
3. Trata cada cambio de diseño como un estándar de toda la aplicación. Implémentalo en `src/design-system.css` o `src/shell.css` mediante tokens compartidos; solo si eso no es posible, aplica el cambio equivalente en cada componente afectado.
4. Prioriza la decisión operativa: identificador, estado principal, siguiente acción y luego contexto secundario.
5. Reutiliza los tokens `--ds-*`, `--color-*` y `--sev-*`. Actualiza conjuntamente los temas claro y oscuro.
6. En tablas móviles, conserva los datos pero agrupa los campos relacionados; no presentes todas las columnas como pares etiqueta/valor de igual importancia.
7. Mantén objetivos táctiles de al menos 44 px, etiquetas visibles de 12 px o más y foco de teclado visible.
8. Verifica con `npm run build` (compila TypeScript y genera `dist/`) y revisa el resultado con `npm run dev`.

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

- Las escrituras del módulo informan con `reportSaved` (llegó a la nube) o
  `reportQueued` (falló por conexión y espera en la cola); el estado de la cola lo
  pinta el propio botón con su color e insignia.
- Un fallo del servidor en un módulo no arrastra a los demás: cada uno se
  actualiza por separado dentro de la misma pulsación.
- La marca de frescura ("Actualizado 16:47", "Última sincronización…") es texto,
  nunca un botón. Los mensajes remiten a "la nube de la barra superior".

## Formularios: vistas, no ventanas flotantes

Crear y editar son **vistas del módulo** (`page-content`, botón "Volver…",
antetítulo, `h1`, subtítulo y `admin-form edit-form`), con el mismo ancho y los
mismos campos en ambas. No uses ventanas flotantes (`.modal-layer`) para altas ni
ediciones: en móvil quedan estrechas, con desplazamiento propio y sin sitio para
los mensajes de error. Reserva lo flotante para confirmaciones cortas.

## Reglas obligatorias

- No introduzcas colores hexadecimales directos en componentes; usa tokens semánticos.
- No crees tarjetas repetidas únicamente para enmarcar datos relacionados.
- Evita suposiciones de ancho de escritorio en filtros, controles, tarjetas y navegación.
- Usa un tamaño tipográfico compacto solo en controles breves y densos, como búsqueda o filtros; conserva un tamaño cómodo en campos normales de formularios.
- Todo destino de navegación lleva icono **y** texto; el activo se marca con `aria-current`.
- Un solo control de sincronización en toda la app: la nube de la barra superior.
- Los iconos vienen de Material Symbols Outlined. Nunca emojis como iconos.
- Replica cambios de tamaño de letra, colores, tarjetas, espaciado, controles y comportamiento responsivo en cada vista que use el mismo patrón. Adapta solo la jerarquía de contenido cuando una vista tenga datos operativos distintos; no dejes equivalentes visualmente inconsistentes.
- No edites `dist/`: es salida de compilación.
