# Prompt reutilizable · Generar un manual de usuario en HTML con capturas reales

Documento para reutilizar en **cualquier proyecto**. Contiene:

1. El **prompt** que se pega en el agente (sección 1).
2. La **metodología técnica** que el agente debe seguir (secciones 2 a 8).
3. La **lista de verificación** de aceptación (sección 9).
4. Los **errores conocidos** y cómo esquivarlos (sección 10).

El resultado es un único archivo `manual-usuario.html`, autocontenido (las imágenes
van incrustadas en base64), adaptable a PC y celular, con capturas **reales** de la
aplicación —nunca maquetas dibujadas con CSS.

---

## 1. El prompt (copiar y pegar)

> Rellena los `<<campos>>` antes de enviarlo. Si no sabes alguno, escribe
> «descúbrelo tú» y el agente lo investigará.

```text
Necesito un manual de usuario en HTML para esta aplicación.

CONTEXTO
- Proyecto: <<ruta o repositorio>>
- Cómo se levanta en local: <<npm run dev | docker compose up | ...>>
- Backend / origen de datos: <<API propia, Apps Script, Firebase, ninguno...>>
- Credenciales o datos de prueba disponibles: <<sí/no; cuáles>>
- Idioma del manual: <<español>>
- Público objetivo: <<personas sin conocimientos técnicos, personal de ventas...>>
- Roles o perfiles de usuario: <<agente y administrador | admin, editor, lector...>>

QUÉ QUIERO
Un archivo `manual-usuario.html` en la raíz del proyecto, con estas condiciones
INNEGOCIABLES:

1. CAPTURAS REALES. Ejecuta la aplicación y captura la pantalla de verdad con un
   navegador automatizado. Prohibido dibujar maquetas en HTML/CSS y llamarlas
   «captura ilustrativa».
2. CADA BOTÓN QUE MENCIONES DEBE VERSE. Si el texto dice «pulsa Guardar», al lado
   tiene que estar la captura recortada de ese botón. Igual para menús, filtros,
   pestañas, íconos y ventanas emergentes.
3. UN SOLO ARCHIVO. Las imágenes van incrustadas como data URI en base64, para
   poder enviar el manual por correo o WhatsApp sin que se rompa nada.
4. ADAPTABLE A PC Y CELULAR. El manual debe leerse bien en ambos, y además debe
   incluir una sección con capturas de la aplicación vista desde un celular.
5. LENGUAJE LLANO. Escribe para alguien que nunca usó el sistema. Sin jerga
   técnica, sin nombres de componentes ni de tablas internas.
6. PASO A PASO REAL. Recorre tú mismo cada flujo completo de la aplicación,
   ejecutándolo, y documenta lo que realmente ocurre en pantalla.
7. MÉTRICAS EXPLICADAS. Documenta cada indicador y cada gráfico: qué cuenta
   exactamente, cómo se calcula y cómo interpretarlo.
8. DICCIONARIO DE CAMPOS. Una tabla por cada formulario: campo, si es
   obligatorio, formato aceptado y para qué sirve ese dato.

CÓMO TRABAJAR
- Primero lee el código para entender módulos, roles, formularios y validaciones.
- Si la aplicación necesita un backend que no puedes usar, levanta un servidor
  de prueba local que lo imite y llénalo con datos de ejemplo verosímiles.
- No modifiques el código de la aplicación ni sus archivos de configuración.
  Todo lo auxiliar va en una carpeta temporal fuera del proyecto.
- Al terminar, deja el proyecto limpio: solo debe aparecer el manual.
- Dime explícitamente qué partes NO pudiste probar y por qué.
```

---

## 2. Fase 0 · Reconocimiento del código

Antes de abrir el navegador hay que saber qué se va a documentar.

| Qué buscar | Dónde suele estar |
|---|---|
| Módulos y navegación | El componente raíz, el enrutador, el menú o el *drawer* |
| Roles y permisos | Condicionales del tipo `isAdmin`, `role ===`, guardas de ruta |
| Formularios y validaciones | Los `required`, `maxLength`, expresiones regulares, mensajes de error |
| Listas desplegables | Catálogos, enumeraciones, constantes |
| Métricas y fórmulas | El endpoint del panel o dashboard; documentación existente (`FORMULAS.md`) |
| Mensajes al usuario | Textos de éxito, error y estados vacíos |
| Contratos de la API | La capa de servicios (`api.ts`, `services/`, `hooks/`) |

**Entregable de la fase:** un inventario de pantallas y, por cada una, sus botones,
campos y estados. Ese inventario es el índice del manual.

> **Aviso:** el código puede cambiar mientras trabajas (si alguien más edita el
> proyecto). Verifica con `git status` al inicio y al final, y documenta lo que
> viste en pantalla, no lo que leíste en el código hace una hora.

---

## 3. Fase 1 · Poner la aplicación en marcha con datos de ejemplo

Un manual con la base de datos vacía no sirve: las tablas salen sin filas y los
gráficos en cero.

### Caso A · La aplicación funciona sola

Levántala y crea los datos de ejemplo desde la propia interfaz.

### Caso B · Depende de un backend externo (lo más común)

Levanta un **servidor de imitación** en la carpeta temporal, sin tocar el proyecto:

```js
// mock-server.mjs — imita el backend real; NO forma parte de la aplicación
import { createServer } from 'node:http';

const respond = (payload) => ({ ok: true, status: 'ok', ...payload });

function handle(request) {
  switch (request.action) {           // adapta al contrato real de tu API
    case 'login':    return respond({ record: usuarios[0], stamp: 'demo' });
    case 'listar':   return respond({ data: registros });
    case 'panel':    return respond({ data: construirPanel() });
    default:         return respond({ data: [] });
  }
}

createServer((req, res) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    res.writeHead(200, headers);
    res.end(JSON.stringify(handle(JSON.parse(body || '{}'))));
  });
}).listen(5599);
```

Apunta la aplicación al servidor de imitación **por variable de entorno**, sin
editar el `.env` del proyecto:

```bash
VITE_API_URL=http://localhost:5599 npx vite --port 5174 --strictPort
```

### Reglas para los datos de ejemplo

- **Verosímiles y del país correcto**: nombres, documentos, teléfonos y direcciones
  coherentes. Nada de «Test 1», «aaa» o «Lorem ipsum».
- **Con variedad**: registros en todas las etapas del flujo, incluyendo los casos
  extremos (recién creado sin actividad, descartado, cerrado).
- **Fechas relativas a hoy**: genera todo con desplazamientos (`hoy - 9 días`) para
  que el calendario y los gráficos tengan contenido alrededor de la fecha actual.
- **Volumen suficiente**: entre 10 y 20 registros. Con 3 las gráficas parecen rotas.
- **Sin datos personales reales.**

---

## 4. Fase 2 · Protocolo de capturas

Se usa un navegador automatizado (Playwright). Tres resoluciones:

| Vista | Tamaño | Para qué |
|---|---|---|
| Escritorio | 1440 × 900 | Casi todas las capturas |
| Celular | 390 × 844 | La sección de uso móvil |
| Recorte | elemento | Botones, barras y controles sueltos |

### Qué capturar, sin excepción

1. **Una vista completa por pantalla**: acceso, panel, cada listado, cada ficha,
   cada formulario, cada módulo de administración.
2. **Un recorte por grupo de botones**: la barra de acciones, la de filtros, los
   botones de guardar/cancelar, los controles de la cabecera, las pestañas.
3. **Cada ventana emergente**: formularios, confirmaciones y avisos.
4. **Los estados que importan**: mensaje de éxito, lista vacía, aviso de bloqueo,
   confirmación de acción irreversible.
5. **El modo oscuro**, si la aplicación lo tiene.
6. **El recorrido móvil**: acceso, panel, menú, listado, ficha, filtros.

### Convención de nombres

Numera en el orden en que aparecen en el manual, con prefijo por bloque:

```
01-login.png            10-listado.png          40-catalogos.png
02-login-lleno.png      11-btn-acciones.png     45-configuracion.png
05-barra-superior.png   13-form-nuevo.png       53-perfil.png
07-menu-lateral.png     18-form-detalle.png     60-movil-panel.png
```

### Recomendaciones prácticas

- **Rellena los formularios antes de capturarlos.** Un formulario vacío no enseña
  nada; uno con datos reales enseña el formato esperado de cada campo.
- **Recorta los botones apuntando al elemento**, no a la pantalla completa.
- **Ejecuta el flujo de verdad**: guarda el registro, registra la interacción,
  abre la confirmación. Las capturas encadenadas cuentan una historia.
- **Revisa cada captura** después de tomarla. Media pantalla desplazada, un menú
  abierto por error o un texto cortado arruinan el manual.

---

## 5. Fase 3 · Optimización de las imágenes

Las capturas PNG a pantalla completa pesan entre 100 y 300 KB. Sesenta capturas
son unos 4 MB, y en base64 crecen un 33 %. Objetivo: **menos de 3 MB** de archivo.

Regla que da buen resultado:

- Capturas **grandes** (más de 30 KB) → redimensionar a **1200 px** de ancho y
  convertir a **JPEG con calidad 80**.
- Recortes **pequeños** (menos de 30 KB) → dejarlos en **PNG**, porque el texto
  diminuto de un botón se degrada con JPEG.

En Windows sirve `System.Drawing` sin instalar nada:

```powershell
Add-Type -AssemblyName System.Drawing
$codec  = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
          Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter `
                   ([System.Drawing.Imaging.Encoder]::Quality), 80
# redimensionar con InterpolationMode = HighQualityBicubic y guardar como .jpg
```

En Linux o macOS, el equivalente con `sharp`, `ImageMagick` o `sips`.

---

## 6. Fase 4 · Armado del archivo único

Se escribe una plantilla con marcadores y un script los sustituye por las imágenes
en base64. Así el HTML se puede seguir editando sin arrastrar megabytes.

```html
<!-- en la plantilla -->
<div class="shot"><img src="{{10-listado}}" alt="Listado de registros"></div>
```

```js
// build-manual.mjs
html = html.replace(/\{\{([\w-]+)\}\}/g, (_, clave) => {
  const archivo = imagenes.get(clave);
  if (!archivo) { faltantes.add(clave); return ''; }
  const tipo = archivo.endsWith('.png') ? 'image/png' : 'image/jpeg';
  return `data:${tipo};base64,${readFileSync(archivo).toString('base64')}`;
});
if (faltantes.size) { console.error('FALTAN:', [...faltantes]); process.exit(1); }
```

El script **debe fallar** si queda un marcador sin resolver: un manual con imágenes
rotas es peor que no tener manual.

### Requisitos de diseño del HTML

| Requisito | Cómo se resuelve |
|---|---|
| Índice lateral fijo | `position: sticky` en escritorio; `<details>` plegable en móvil |
| Buscador | Filtra secciones por texto, sin dependencias externas |
| Modo claro/oscuro | Variables CSS y un atributo en `<html>`; se recuerda la elección |
| Capturas ampliables | Visor a pantalla completa al pulsar una imagen; cierre con `Esc` |
| Progreso de lectura | Barra fija arriba que avanza con el desplazamiento |
| Imprimible / PDF | `@media print`: oculta índice y controles, evita cortar secciones |
| Tablas anchas | Contenedor con `overflow-x: auto`; el cuerpo nunca se desplaza en horizontal |
| Sin dependencias | Todo el CSS y el JS en línea. Sin CDN, sin tipografías remotas |

---

## 7. Fase 5 · Estructura del contenido

Plantilla de secciones que funciona para casi cualquier sistema de gestión.
Ajusta los nombres al dominio del proyecto.

```
01 · Qué es y quién lo usa .............. propósito, roles, cómo leer el manual
02 · Ingresar ........................... acceso, contraseña inicial, errores comunes
03 · Conocer la pantalla ................ barra superior, menú, navegación, tema
04 · El flujo de trabajo ................ diagrama de etapas + las reglas de oro
05..13 · Un capítulo por tarea ........... crear, buscar, editar, avanzar de etapa,
                                          cerrar, descartar
14 · Indicadores ........................ cada métrica, cada filtro, cada gráfico
15..17 · Administración ................. usuarios, catálogos, configuración
18 · Mi perfil .......................... datos de la cuenta
19 · Sin conexión ....................... estados de sincronización y qué hacer
20 · Diccionario de campos .............. una tabla por formulario
21 · Uso en el celular .................. capturas móviles y diferencias
22 · Problemas frecuentes ............... síntoma → solución, y buenas prácticas
```

### Cómo redactar cada capítulo

1. **Frase de entrada**: para qué sirve esta pantalla, en una línea.
2. **Pasos numerados**: una acción por paso, con el nombre exacto del botón.
3. **Captura de la pantalla completa**, con pie explicativo.
4. **Recorte del botón** mencionado, con una etiqueta corta.
5. **Tabla de campos**: campo · obligatorio · formato · para qué sirve.
6. **Aviso final** cuando aplique: consejo, advertencia o error habitual.

### Reglas de estilo

- Nombra los botones **con su texto literal**, entre negritas: **Guardar prospecto**.
- Escribe en presente y en segunda persona: «pulsa», «completa», «revisa».
- Nada de nombres de componentes, tablas ni endpoints.
- Marca de forma visible lo que es **exclusivo de administrador**.
- Explica **por qué** existe cada restricción, no solo que existe.
- Cuando una acción sea irreversible, dilo con un aviso destacado.
- Las métricas se explican con tres columnas: qué cuenta, cómo se calcula, cómo se
  interpreta. Si hay dos filtros de fecha distintos, aclara cuál manda sobre qué.

---

## 8. Fase 6 · Verificación y limpieza

```bash
# Ninguna imagen debe faltar: las dos cifras tienen que coincidir
grep -o 'data:image/[a-z]*;base64' manual-usuario.html | wc -l
grep -c '{{' manual-usuario.html          # tiene que dar 0

# Peso del archivo
ls -la manual-usuario.html                 # objetivo: < 3 MB
```

Además, abre el manual en el navegador y comprueba: índice, buscador, modo oscuro,
visor de imágenes, vista de impresión y lectura con la ventana estrecha.

**Limpieza final**

- Elimina del proyecto las capturas sueltas, las carpetas del navegador
  automatizado y los scripts auxiliares.
- Detén el servidor de imitación y el servidor de desarrollo.
- Comprueba con `git status` que el único archivo nuevo es el manual.

> Si el proyecto ya versionó por accidente archivos temporales, **no los borres por
> tu cuenta**: avisa y propón la limpieza.

---

## 9. Lista de verificación de aceptación

- [ ] Todas las capturas son reales, tomadas de la aplicación en ejecución.
- [ ] Cada botón nombrado en el texto tiene su captura visible.
- [ ] Se documentaron todos los módulos, incluidos los de administración.
- [ ] Cada formulario tiene su tabla de campos con obligatoriedad y formato.
- [ ] Cada indicador y cada gráfico está explicado (qué, cómo, para qué).
- [ ] Hay una sección de uso en celular con capturas propias.
- [ ] Hay una sección de problemas frecuentes con síntoma y solución.
- [ ] El archivo es único y se abre sin conexión a internet.
- [ ] Se lee bien en pantalla ancha y en pantalla de teléfono.
- [ ] Funcionan índice, buscador, modo oscuro, visor de imágenes e impresión.
- [ ] El proyecto quedó sin archivos temporales.
- [ ] Se informó qué quedó sin probar y por qué.

---

## 10. Errores conocidos y cómo esquivarlos

| Problema | Causa | Solución |
|---|---|---|
| `fullPage: true` recorta la pantalla | El desplazamiento ocurre dentro de un contenedor, no en la ventana | Capturar el elemento, o desplazar el contenedor y encadenar varias capturas |
| El recorte de un elemento agota el tiempo de espera | El elemento se mueve por una animación o una transición | Reintentar, capturar la ventana visible, o esperar a que termine la animación |
| El selector coincide con varios elementos | Modo estricto del navegador automatizado | Afinar el selector; apoyarse en `aria-label` o en el texto exacto |
| El `hover` no dispara nada en React | React implementa `onPointerEnter` sobre `pointerover` | Usar el `hover` real del navegador, no eventos sintéticos inyectados |
| Faltan opciones en un desplegable | Filtros de deduplicación o listas heredadas en el propio código | Ajustar los datos de ejemplo hasta que la lista se muestre completa |
| La aplicación abre en modo oscuro sin querer | Preferencia del sistema o caché previa | Fijar el tema antes de capturar y limpiar el almacenamiento local |
| El manual pesa demasiado | PNG a pantalla completa en base64 | Redimensionar a 1200 px y pasar a JPEG las capturas grandes |
| El texto de un botón se ve borroso | JPEG aplicado a un recorte pequeño | Dejar en PNG todo recorte de menos de 30 KB |
| El código cambió a mitad del trabajo | Alguien más está editando el proyecto | Documentar lo que se ve en pantalla y avisar de las diferencias |

---

## 11. Estructura de archivos de trabajo

Todo lo auxiliar vive **fuera del proyecto**, en una carpeta temporal:

```
<carpeta-temporal>/
├── mock-server.mjs        # servidor de imitación con los datos de ejemplo
├── to-jpeg.ps1            # conversión y redimensionado de las capturas
├── build-manual.mjs       # incrusta las imágenes y escribe el manual
├── manual-src.html        # plantilla con los marcadores {{nombre}}
├── img/                   # capturas ya optimizadas
└── png-originales/        # capturas originales, por si hay que rehacer algo

<proyecto>/
└── manual-usuario.html    # ← lo único que se entrega
```

Conservar la plantilla y las capturas permite **regenerar el manual** cuando la
aplicación cambie, sin repetir todo el recorrido desde cero.
