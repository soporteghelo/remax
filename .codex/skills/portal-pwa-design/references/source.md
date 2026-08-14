# Fuente de diseño

Lee `design-system/portal-pwa/MASTER.md` para consultar el sistema Data-Dense
Dashboard completo antes de implementar un cambio visual.

Los tokens del proyecto están en `src/design-system.css`:

- Superficies y texto: `--ds-surface`, `--ds-surface-sunken`, `--ds-fg`, `--ds-fg-muted`
- Bordes y capas: `--ds-border`, `--ds-border-soft`, `--ds-skeleton`, `--ds-scrim`
- Marca y estructura: `--color-primary`, `--color-on-primary`, `--color-primary-fixed`, `--color-bg`, `--color-surface`, `--color-text`, `--color-border`
- Marca configurable: `--brand-primary`, `--brand-primary-dark`, `--brand-on-primary`, `--brand-on-primary-dark`, `--brand-gradient`, `--brand-gradient-start`, `--brand-gradient-end`, `--brand-gradient-from`, `--brand-gradient-to`, `--brand-on-gradient`, `--brand-whatsapp`, `--brand-on-whatsapp`
- Densidad y movimiento: `--ds-gap`, `--ds-card-pad`, `--ds-row-h`, `--ds-dur-fast`, `--ds-dur`, `--ds-ease`
- Severidad: `--sev-crit-*`, `--sev-high-*`, `--sev-med-*`, `--sev-ok-*`
- Medidas de estructura: `--topbar-height`, `--footer-height`, `--drawer-width`, `--drawer-gradient`
- Holgura inferior: `--ds-bottom-action-clearance`

Los tokens `--brand-*` los alimenta la configuración de la app (pestaña
CONFIGURACION de la hoja, claves `primaryColor`, `primaryColorDark`,
`brandGradientStart` y `brandGradientEnd`): no los fijes a un valor literal en
un componente, porque la administración los cambia sin tocar código.

La estructura persistente (barra superior, drawer, footer de navegación y panel
principal) está en `src/shell.css`, y su modelo de navegación en `src/shell.ts`.
Añadir un módulo es añadir una entrada a `MODULES`: el drawer, el footer y el
panel principal lo recogen solos.

El sistema de diseño fuente gobierna la densidad de componentes, el
comportamiento responsivo, el contraste y el emparejamiento de temas claro/oscuro.

## Hojas de estilo vivas

No existe una copia de estos archivos dentro de la skill: la fuente única es
`src/`. Léelos directamente.

| Archivo | Cubre |
|---|---|
| `src/design-system.css` | Tokens, temas, patrones compartidos del panel, accesibilidad |
| `src/shell.css` | Barra superior, drawer, footer de navegación, panel principal |
| `src/styles.css` | Acceso, paneles, botones, tablas y formularios de administración |
| `src/crm.css` | Prospectos, clientes, agenda, catálogos y modales |
| `src/desktop-layout.css` | Anchos y columnas a partir de 1024px |
| `src/admin-compact.css`, `src/detail-compact.css`, `src/edit-compact.css` | Densidad de administración, detalle y edición |
| `src/password.css`, `src/sync-control.css`, `src/reschedule.css` | Contraseña, nube de sincronización y reprogramación |
| `index.html` | Fuente Inter, Material Symbols Outlined y color de la PWA |
