# Fuente de diseño

Lee `design-system/portal-pwa/MASTER.md` para consultar el sistema Data-Dense
Dashboard completo antes de implementar un cambio visual.

Los tokens del proyecto están en `src/design-system.css`:

- Superficies y texto: `--ds-surface`, `--ds-surface-sunken`, `--ds-fg`, `--ds-fg-muted`
- Bordes y capas: `--ds-border`, `--ds-border-soft`, `--ds-skeleton`, `--ds-scrim`
- Marca y estructura: `--color-primary`, `--color-on-primary`, `--color-primary-fixed`, `--color-bg`, `--color-surface`, `--color-text`, `--color-border`
- Densidad y movimiento: `--ds-gap`, `--ds-card-pad`, `--ds-row-h`, `--ds-dur-fast`, `--ds-dur`, `--ds-ease`
- Severidad: `--sev-crit-*`, `--sev-high-*`, `--sev-med-*`, `--sev-ok-*`
- Medidas de estructura: `--topbar-height`, `--footer-height`, `--drawer-width`, `--drawer-gradient`

La estructura persistente (barra superior, drawer, footer de navegación y panel
principal) está en `src/shell.css`, y su modelo de navegación en `src/shell.ts`.
Añadir un módulo es añadir una entrada a `MODULES`: el drawer, el footer y el
panel principal lo recogen solos.

El sistema de diseño fuente gobierna la densidad de componentes, el
comportamiento responsivo, el contraste y el emparejamiento de temas claro/oscuro.
