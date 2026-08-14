# Habilidades del Portal PWA

| Habilidad | Uso |
|---|---|
| `portal-pwa-design` | Diseño Data-Dense, tarjetas, tablas, formularios, diseño adaptable, navegación (drawer y footer), temas claro/oscuro y accesibilidad. |

Los tokens y componentes compartidos viven en `src/design-system.css` y
`src/shell.css`; la skill indica cómo usarlos y mantenerlos sin duplicarlos. La
referencia canónica de diseño es `design-system/portal-pwa/MASTER.md`.

## Estructura

Cada habilidad tiene la misma forma en los dos agentes, y `.claude/skills/` y
`.codex/skills/` se mantienen idénticos:

```
skills/
  CATALOGO.md                  este índice
  portal-pwa-design/
    SKILL.md                   reglas y flujo de trabajo
    agents/openai.yaml         nombre visible e invocación
    references/source.md       tokens y mapa de hojas de estilo
```

Las hojas de estilo **no se copian dentro de la skill**: la fuente única es
`src/`. Una copia dentro de la habilidad se desincroniza en cuanto alguien toca
el CSS de la app, así que `references/source.md` solo apunta a los archivos
vivos.

Al editar una habilidad, aplica el mismo cambio en las dos carpetas: son
espejos entre sí y `git diff` debe mostrarlos siempre iguales.

Portado desde `MOTOR/skills/` (`motor-pwa-design`), y fusionado con la
habilidad `noely-design-system` que vivía solo en `.codex/`. Las skills
`motor-pwa-runtime` y `motor-pwa-builder` de MOTOR no se copiaron: dependen de
`PWA_SKILLS` y de la estructura de módulos de Apps Script, que este proyecto no
tiene.
