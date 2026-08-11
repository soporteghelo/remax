---
name: noely-design-system
description: Apply, review, document, or extend the complete visual design system of the Noely CRM/PWA. Use when creating or changing Noely screens, React components, CSS, responsive layouts, theming, navigation, forms, tables, dialogs, dashboard widgets, login, or accessibility behavior.
---

# Noely Design System

Use this skill as the source of truth for Noely's app UI. It includes a snapshot of every active stylesheet, the document head, and the existing design-system master. Preserve the product's dense, accessible dashboard character and the paired light/dark themes.

## Reference files

Read the smallest relevant reference before changing UI:

| Need | Read |
|---|---|
| Tokens, themes, shared dashboard patterns, accessibility | `references/app-design/design-system.css` |
| Intended rules, component specs, anti-patterns, delivery checklist | `references/app-design/MASTER.md` |
| App shell, navigation, profile and settings visuals | `references/app-design/shell.css` |
| Login, shared panels, buttons, tables and admin forms | `references/app-design/styles.css` |
| CRM, prospects, clients, agenda, catalog and modal styling | `references/app-design/crm.css` |
| Compact admin, detail, edit and desktop breakpoints | matching `*-compact.css` or `desktop-layout.css` |
| Password and cloud-sync controls | `password.css` or `sync-control.css` |
| Reprogramación de la última interacción | `references/app-design/reschedule.css` |
| Fonts, icon set and PWA color | `references/app-design/index.html` |

The CSS files are the exhaustive implementation snapshot. If the Master conflicts with them, preserve the live implementation unless the task explicitly asks to standardize or refactor it.

## Workflow

1. Identify the view and read its relevant stylesheet plus `design-system.css`.
2. Reuse semantic tokens (`--ds-*`, `--color-*`, `--sev-*`, `--brand-*`) and an existing shared pattern before creating a new visual primitive.
3. Match the existing responsive behavior at 375px, 768px, 1024px and 1440px, and maintain both themes.
4. Keep focus visible, respect reduced motion, ensure coarse-pointer targets are at least 44px, and avoid horizontal mobile overflow.
5. When the visual language changes, update the app CSS and the matching reference snapshot in this skill together, then update `MASTER.md` when the shared rule changes.

## Non-negotiable conventions

- Use Inter and Material Symbols Outlined; do not introduce emoji icons or a second icon library.
- Use the global cloud control only; do not add per-module sync or refresh controls.
- Use `DD/MM/AAAA` and 24-hour `HH:MM` for dates and times.
- Prefer tokenized colors. Legacy direct colors in the reference snapshot are existing compatibility exceptions; do not propagate them to new components.
- Use 150–300ms transitions and disable them under reduced motion.
- Do not hide final actions below mobile browser chrome or the safe area.

## Completion check

Confirm that the result has a visible keyboard focus state, correct clear/dark contrast, responsive layout, semantic color meaning beyond color alone, and no design rule is duplicated when a shared token or component can express it.
