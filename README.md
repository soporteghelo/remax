# Módulo de login

## Despliegue en Vercel

El frontend es una aplicación Vite estática. Ya incluye `vercel.json`, que
compila con `npm run build`, publica `dist/` y devuelve `index.html` para las
rutas internas de la SPA.

1. Sube esta carpeta a un repositorio Git e impórtalo desde Vercel.
2. En **Project Settings → Environment Variables**, agrega
   `VITE_APPS_SCRIPT_URL` con la URL de producción de tu Web App de Apps
   Script. Selecciona al menos **Production**; agrega Preview si quieres que
   las previsualizaciones funcionen también.
3. Despliega sin sobrescribir la configuración del repositorio: el comando de
   build es `npm run build` y el directorio de salida es `dist`.
4. Tras cambiar una variable `VITE_*`, vuelve a desplegar: Vite la incorpora
   durante la compilación. Esta URL es visible desde el navegador, por lo que
   no debe contener secretos. `PASSWORD_PEPPER` sigue exclusivamente en Apps
   Script.

Para desarrollo local, copia `.env.example` a `.env` y reemplaza el valor de
ejemplo. `.env` no se versiona.

Autenticación por DNI y contraseña sobre una Google Sheet, mediante una
aplicación web de Apps Script. La aplicación vive entera en `src/`.

## Cómo funciona

1. El usuario ingresa su DNI y contraseña. Las cuentas las crea un
   administrador desde el módulo de usuarios; la contraseña inicial es el DNI.
2. El frontend envía las credenciales por HTTPS al Web App de Apps Script.
3. Apps Script usa `DNI` como identificador y guarda el valor protegido de la
   contraseña únicamente en la columna `Pass`, usando un `PASSWORD_PEPPER`
   secreto del servidor. Nunca devuelve la contraseña al navegador.
4. En cada acceso válido se actualizan `UltimoAcceso` y `Dispositivo`, y la
   sesión queda guardada en el dispositivo hasta que el servidor la invalide.

## Contenido

```
apps-script/Code.gs       # backend de autenticación, hoja USUARIOS y CONFIGURACION
index.html                # tema y marca antes del primer pintado
src/                      # aplicación (ver "Interfaz" más abajo)
```

## Puesta en marcha

1. Crea una Google Sheet y toma su ID de la URL (`.../d/<ID>/edit`).
2. En **Extensiones → Apps Script**, pega `apps-script/Code.gs` y configura:
   - `SPREADSHEET_ID` con el ID de tu hoja.
   - `PASSWORD_PEPPER` con una cadena larga y aleatoria. Es un secreto del
     servidor: no lo copies al frontend ni lo publiques.
   - `ADMIN_DNIS` con los DNI que deben tener el tipo `ADMINISTRADOR`.
3. Ejecuta `Actualizar` una vez. Verifica o crea las pestañas `USUARIOS`,
   `CONFIGURACION` y `LOG_ACTUALIZACIONES`, añade las columnas necesarias
   (incluidas `Estado`, `TipoUsuario` y `Pass`) y los ajustes que falten, sin
   borrar datos, y registra cada acción.
   `Estado` admite `ACTIVO` o `CESADO`; una celda vacía se trata como `ACTIVO`.
4. Despliega como **Aplicación web** con acceso para los usuarios de tu app y
   copia la URL del despliegue.
5. Define la URL del despliegue en el frontend:

   ```env
   VITE_APPS_SCRIPT_URL=<URL del Web App>
   ```

6. `npm install` y `npm run dev` para desarrollo; `npm run build` para publicar.

## Sesiones y caducidad

Al iniciar sesión, el servidor devuelve una **huella** (`sessionStamp_`): una
función de una sola vía sobre la contraseña almacenada, que no revela nada de
ella. El navegador la guarda y en **cada carga** la reenvía con la acción
`checkSession`. El servidor responde `valid: false` y la app cierra la sesión
cuando:

- un administrador **cambió la contraseña** de esa cuenta (la huella ya no coincide);
- la cuenta pasó a **`CESADO`**;
- la cuenta ya no existe.

Si la petición falla por falta de conexión, la sesión guardada se conserva: solo
un `valid: false` explícito cierra la sesión.

## Configuración general de la app

Título, colores, textos del acceso y comportamiento de arranque se editan desde
el módulo **Configuración de la app** ([src/AppSettings.tsx](src/AppSettings.tsx),
visible solo para administradores) y se guardan en la pestaña `CONFIGURACION` de
la **misma hoja de cálculo**, una fila por ajuste:

| Columna | Contenido |
|---|---|
| `Clave` | Identificador del ajuste (`appName`, `primaryColor`, …) |
| `Valor` | Valor vigente; si queda vacío o inválido, se usa el valor por defecto |
| `Tipo` | `text`, `color`, `boolean` o `select` (documentación, la refresca `Actualizar`) |
| `Descripcion` | Para qué sirve el ajuste |
| `Actualizado` / `ActualizadoPor` | Cuándo y qué DNI hizo el último cambio |

El catálogo de ajustes se declara **en dos sitios que deben coincidir**:
`APP_SETTINGS` en [apps-script/Code.gs](apps-script/Code.gs) (validación y
valores por defecto del servidor) y `SETTING_DEFS` en
[src/settings.ts](src/settings.ts) (etiquetas en español y orden de la vista).
Añadir un ajuste es agregar una entrada en ambos y volver a ejecutar
`Actualizar`.

Notas de funcionamiento:

- `getSettings` es **público** (sin credenciales): la pantalla de acceso necesita
  el título y los colores antes de que exista una sesión. `saveSettings` exige
  credenciales de administrador, que el servidor revalida.
- Los colores se traducen a los tokens `--brand-*` sobre `<html>`
  (`applySettings`); `design-system.css` decide con ellos el valor de
  `--color-primary` en cada tema. Ningún componente usa hex crudos.
- El color de texto sobre el primario y sobre el degradado se **calcula** por
  contraste, y el módulo avisa si un primario no llega a 4.5:1 sobre su
  superficie.
- La configuración se cachea en `localStorage` (`loginapp_app_settings`): la app
  arranca con la última conocida aunque no haya conexión, y el script de
  [index.html](index.html) la aplica antes del primer pintado.

## Interfaz: sistema de diseño y estructura

La aplicación de `src/` usa el sistema **Data-Dense Dashboard** portado de MOTOR
PWA. La referencia canónica es `design-system/portal-pwa/MASTER.md`, y la skill
`.claude/skills/portal-pwa-design/` describe cómo aplicarla y mantenerla.

```
design-system/portal-pwa/MASTER.md   # tokens, componentes, anti-patrones, checklist
.claude/skills/portal-pwa-design/    # skill de diseño (flujo y reglas obligatorias)
src/design-system.css                # tokens --ds-*/--color-*/--sev-* y componentes .ds-*
src/shell.css                        # barra superior, drawer, footer y panel principal
src/shell.ts                         # modelo de navegación + useTheme / useOnlineStatus
src/settings.ts                      # catálogo de ajustes, caché y tokens --brand-*
src/sync.ts                          # centro de sincronización y registro de módulos
src/SyncControl.tsx                  # la nube de la barra superior (único control)
src/NavDrawer.tsx                    # menú sándwich (drawer lateral)
src/Dashboard.tsx                    # vista principal
src/AppFooter.tsx                    # footer de navegación
src/UserAdmin.tsx                    # administración de usuarios (listado, alta, edición)
src/AppSettings.tsx                  # configuración general (solo administradores)
src/Profile.tsx                      # ficha de la cuenta activa
```

## Sincronización

Un solo control en toda la aplicación: la nube de la barra superior. Envía los
cambios que quedaron en cola por falta de conexión y vuelve a traer los datos de
cada módulo registrado con `registerSyncModule` ([src/sync.ts](src/sync.ts)). Las
vistas releen su caché reaccionando a `useSyncState().dataVersion`; ningún módulo
lleva su propio botón de sincronizar o actualizar.

Para añadir un módulo basta con agregar una entrada a `MODULES` en
[shell.ts](src/shell.ts) y renderizarlo en el `switch` de vistas de
[App.tsx](src/App.tsx): el drawer, el footer y el panel principal lo recogen
solos. El tema claro/oscuro se guarda en `localStorage` bajo `pwa_theme` **solo
cuando alguien pulsa el botón de tema**; mientras nadie lo haga, el dispositivo
sigue el `defaultTheme` configurado. Se aplica antes del primer pintado desde
[index.html](index.html).

## Usuarios existentes

Al actualizar desde la versión anterior, `CrearHojaUsuarios` añadirá las dos
columnas de contraseña sin borrar datos. Las cuentas antiguas no tienen una
contraseña verificable, por lo que un administrador debe asignarles una de
forma segura antes de que puedan iniciar sesión.
