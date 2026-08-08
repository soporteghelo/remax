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

## Reglas obligatorias

- No introduzcas colores hexadecimales directos en componentes; usa tokens semánticos.
- No crees tarjetas repetidas únicamente para enmarcar datos relacionados.
- Evita suposiciones de ancho de escritorio en filtros, controles, tarjetas y navegación.
- Usa un tamaño tipográfico compacto solo en controles breves y densos, como búsqueda o filtros; conserva un tamaño cómodo en campos normales de formularios.
- Todo destino de navegación lleva icono **y** texto; el activo se marca con `aria-current`.
- Los iconos vienen de Material Symbols Outlined. Nunca emojis como iconos.
- Replica cambios de tamaño de letra, colores, tarjetas, espaciado, controles y comportamiento responsivo en cada vista que use el mismo patrón. Adapta solo la jerarquía de contenido cuando una vista tenga datos operativos distintos; no dejes equivalentes visualmente inconsistentes.
- No edites `dist/`: es salida de compilación.
