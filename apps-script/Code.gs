/**
 * Apps Script - Login por DNI y contraseña.
 * Reemplaza SPREADSHEET_ID y PASSWORD_PEPPER antes de desplegar.
 */
const SPREADSHEET_ID = '1Tr-sOjOy4Iu58-NcH0SwQNBpPHHExDPNoyckMtHwcVk';
const PASSWORD_PEPPER = 'mIapp_7!Kq9#vL2@xR8$zP4';
// Agrega aquí los DNI que deben crearse como administradores. Los demás serán USUARIO.
const ADMIN_DNIS = ['76018787'];
const MIN_PASSWORD_LENGTH = 6;
// Cuenta temporal para pruebas. Se registra al ejecutar Actualizar() si no existe.
const TEST_USER = { DNI: '76018787', Pass: 'kirito', Apellidos: 'USUARIO', Nombres: 'TEST' };
const USERS_SHEET_NAME = 'USUARIOS';
// Correo y Celular son los canales por los que se entregan las credenciales al
// crear la cuenta; ambos son opcionales y Actualizar() los añade a hojas antiguas.
const USERS_HEADERS = ['DNI', 'Apellidos', 'Nombres', 'Estado', 'TipoUsuario', 'FechaRegistro', 'UltimoAcceso', 'Dispositivo', 'Correo', 'Celular', 'Categoria', 'Pass'];
const UPDATE_LOG_SHEET_NAME = 'LOG_ACTUALIZACIONES';
const UPDATE_LOG_HEADERS = ['Fecha', 'Función', 'Resultado', 'Detalle'];
const SETTINGS_SHEET_NAME = 'CONFIGURACION';
const SETTINGS_HEADERS = ['Clave', 'Valor', 'Tipo', 'Descripcion', 'Actualizado', 'ActualizadoPor'];
// Los datos que se completan al captar pertenecen al prospecto original.
const CRM_CAPTURE_FIELDS = ['FechaNacimiento', 'Profesion', 'Distrito', 'Direccion', 'Notas'];
const CRM_SHEETS = {
  prospects: { name: 'PROSPECTOS', headers: ['ID', 'Nombre', 'Documento', 'Telefono', 'Correo', 'Canal', 'AgenteDNI', 'FechaCreacion', 'FechaActualizacion', 'Observaciones', 'FechaNacimiento', 'Profesion', 'Distrito', 'Direccion', 'Notas', 'ClienteID', 'Captado', 'JSON'] },
  interactions: { name: 'INTERACCIONES', headers: ['ID', 'ProspectoID', 'AgenteDNI', 'FechaHoraContacto', 'FechaHora', 'Tipo', 'Resultado', 'Comentario', 'ProximoContacto', 'Captacion', 'EstadoCaptacion', 'Etapa'] },
  clients: { name: 'CLIENTES', headers: ['ID', 'ProspectoID', 'Nombre', 'Documento', 'Telefono', 'Correo', 'FechaCierre', 'Estado', 'AgenteDNI', 'EstadoCaptacion', 'CierreVenta'] },
  catalogs: { name: 'CATALOGOS', headers: ['Tipo', 'Etiqueta', 'Orden', 'Activo'] },
  audit: { name: 'AUDITORIA', headers: ['UsuarioDNI', 'Accion', 'Entidad', 'EntidadID', 'FechaHora', 'Descripcion'] }
};

/**
 * Formato único para cualquier columna de fecha de la aplicación. Las fechas
 * con una hora útil conservan `HH:mm`; la parte de fecha siempre es
 * `DD/MM/AAAA`. Se guardan como valores Date reales para que Sheets pueda
 * ordenar y filtrar cronológicamente, aunque visualmente ya no muestre ISO.
 */
const DATE_COLUMN_FORMATS = {
  Fecha: 'dd/MM/yyyy HH:mm',
  FechaRegistro: 'dd/MM/yyyy HH:mm',
  UltimoAcceso: 'dd/MM/yyyy HH:mm',
  Actualizado: 'dd/MM/yyyy HH:mm',
  FechaCreacion: 'dd/MM/yyyy HH:mm',
  FechaActualizacion: 'dd/MM/yyyy HH:mm',
  ProximoContacto: 'dd/MM/yyyy HH:mm',
  FechaHoraContacto: 'dd/MM/yyyy HH:mm',
  FechaHora: 'dd/MM/yyyy HH:mm',
  FechaNacimiento: 'dd/MM/yyyy',
  FechaCierre: 'dd/MM/yyyy HH:mm',
  CierreVenta: 'dd/MM/yyyy'
};

/**
 * Catálogo de la configuración general de la app: una fila por clave en la
 * pestaña CONFIGURACION. `def` es el valor con el que se crea la fila y al que
 * se vuelve si el valor guardado deja de ser válido.
 *
 * El frontend replica estas claves en `src/settings.ts` (con sus etiquetas en
 * español); al añadir un ajuste hay que declararlo en ambos lados.
 */
const APP_SETTINGS = [
  { key: 'appName', type: 'text', def: 'Sistema RX', max: 40, desc: 'Nombre visible en la barra superior y en la pestaña del navegador.' },
  { key: 'appShortName', type: 'text', def: 'RX', max: 4, desc: 'Sigla de 1 a 4 letras del distintivo de marca.' },
  { key: 'appVersion', type: 'text', def: 'RX v1.0.0', max: 24, desc: 'Versión mostrada en el pie del menú lateral.' },
  { key: 'organization', type: 'text', def: '', max: 60, desc: 'Organización mostrada en el pie del menú lateral y en el acceso.' },
  { key: 'supportContact', type: 'text', def: '', max: 80, desc: 'Contacto de soporte mostrado a quien no puede ingresar.' },
  // La clave conserva la mayúscula con la que se creó la fila en la hoja: readSettings_
  // busca coincidencia exacta y renombrarla dejaría el valor guardado sin dueño.
  { key: 'Link', type: 'url', def: '', max: 300, desc: 'Acceso a la plataforma: dirección completa del portal (http:// o https://). Se envía a cada cuenta nueva.' },
  { key: 'appPurpose', type: 'text', def: 'Registrar prospectos, dejar constancia de cada contacto y convertirlos en clientes.', max: 200, desc: 'Para qué sirve la app. Se explica en el mensaje de bienvenida de cada cuenta nueva.' },
  { key: 'loginEyebrow', type: 'text', def: 'PORTAL SEGURO', max: 30, desc: 'Etiqueta superior de la pantalla de acceso.' },
  { key: 'loginTitle', type: 'text', def: 'Bienvenido', max: 40, desc: 'Título de la pantalla de acceso.' },
  { key: 'loginSubtitle', type: 'text', def: 'Ingresa con tus credenciales para continuar.', max: 120, desc: 'Mensaje bajo el título de la pantalla de acceso.' },
  { key: 'primaryColor', type: 'color', def: '#000666', desc: 'Color primario del tema claro. Debe contrastar con el blanco.' },
  { key: 'primaryColorDark', type: 'color', def: '#bdc2ff', desc: 'Color primario del tema oscuro. Se aclara, no se invierte.' },
  { key: 'brandGradientStart', type: 'color', def: '#000666', desc: 'Inicio del degradado de marca (menú lateral y botón principal).' },
  { key: 'brandGradientEnd', type: 'color', def: '#283593', desc: 'Fin del degradado de marca.' },
  { key: 'defaultTheme', type: 'select', def: 'light', options: ['light', 'dark'], desc: 'Tema con el que abre un dispositivo que aún no eligió uno.' },
  { key: 'showConnectionStatus', type: 'boolean', def: 'true', desc: 'Muestra el indicador Online/Offline en la barra superior.' }
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    if (PASSWORD_PEPPER.indexOf('REEMPLAZA_') === 0) return createResponse({ status: 'error', message: 'Configura PASSWORD_PEPPER antes de usar el login.' });
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    if (data.action === 'authenticateUser') return authenticateUser_(ss, data);
    if (data.action === 'checkSession') return checkSession_(ss, data);
    if (data.action === 'createUser') return createUser_(ss, data);
    if (data.action === 'updateUser') return updateUser_(ss, data);
    if (data.action === 'resendInvite') return resendInvite_(ss, data);
    if (data.action === 'listUsers') return listUsers_(ss, data);
    if (data.action === 'getSettings') return getSettings_(ss);
    if (data.action === 'saveSettings') return saveSettings_(ss, data);
    if (data.action === 'crmListCatalogs') return crmListCatalogs_(ss, data);
    if (data.action === 'crmSaveCatalog') return crmSaveCatalog_(ss, data);
    if (data.action === 'crmDeleteCatalog') return crmDeleteCatalog_(ss, data);
    if (data.action === 'crmListProspects') return crmListProspects_(ss, data);
    if (data.action === 'crmGetProspect') return crmGetProspect_(ss, data);
    if (data.action === 'crmSaveProspect') return crmSaveProspect_(ss, data);
    if (data.action === 'crmAddInteraction') return crmAddInteraction_(ss, data);
    if (data.action === 'crmRescheduleInteraction') return crmRescheduleInteraction_(ss, data);
    if (data.action === 'crmConvertProspect') return crmConvertProspect_(ss, data);
    if (data.action === 'crmConvertProspectToClient') return crmConvertProspectToClient_(ss, data);
    if (data.action === 'crmMarkProspectNoContinue') return crmMarkProspectNoContinue_(ss, data);
    if (data.action === 'crmRestoreProspectStage') return crmRestoreProspectStage_(ss, data);
    if (data.action === 'crmReassignProspect') return crmReassignProspect_(ss, data);
    if (data.action === 'crmListClients') return crmListClients_(ss, data);
    if (data.action === 'crmGetClient') return crmGetClient_(ss, data);
    if (data.action === 'crmSaveClient') return crmSaveClient_(ss, data);
    if (data.action === 'crmDashboard') return crmDashboard_(ss, data);
    if (data.action === 'crmListAgents') return crmListAgents_(ss, data);
    if (data.action === 'crmExportProspects') return crmExportProspects_(ss, data);
    if (data.action === 'crmUpdateProfile') return crmUpdateProfile_(ss, data);
    return createResponse({ status: 'error', message: 'Acción no reconocida' });
  } catch (err) {
    return createResponse({ status: 'error', message: String(err) });
  }
}

function doGet() { return createResponse({ status: 'ok', message: 'Servicio de login activo' }); }
function createResponse(obj) {
  var result = obj || {};
  var successful = result.ok === undefined ? result.status === 'ok' : Boolean(result.ok);
  result.ok = successful;
  if (result.data === undefined) result.data = null;
  if (result.error === undefined) result.error = successful ? null : String(result.message || 'Error desconocido');
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function getDefaultUserType_(dni) {
  return ADMIN_DNIS.indexOf(dni) !== -1 ? 'ADMINISTRADOR' : 'USUARIO';
}

function getValidUserType_(type, dni) {
  var value = String(type || '').trim().toUpperCase();
  if (ADMIN_DNIS.indexOf(dni) !== -1) return 'ADMINISTRADOR';
  if (value === 'ADMINISTRADOR' || value === 'USUARIO') return value;
  return getDefaultUserType_(dni);
}

/** Solo CESADO bloquea el acceso; una celda vacía se trata como ACTIVO. */
function getValidEstado_(estado) {
  return String(estado || '').trim().toUpperCase() === 'CESADO' ? 'CESADO' : 'ACTIVO';
}

/** Crea la hoja y añade columnas nuevas sin alterar los registros existentes. */
function getOrCreateSheetWithHeaders(ss, name, headers) {
  return ensureSheetAndHeaders_(ss, name, headers, []);
}

/** Verifica una pestaña y sus cabeceras; registra en `actions` cada cambio aplicado. */
function ensureSheetAndHeaders_(ss, name, headers, actions) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    actions.push('Se creó la pestaña "' + name + '" con sus ' + headers.length + ' cabeceras.');
    return sheet;
  }
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  if (!currentHeaders[0] || String(currentHeaders[0]).trim() === '') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    actions.push('Se configuraron las cabeceras vacías de la pestaña "' + name + '".');
    return sheet;
  }
  // Conserva los datos creados por versiones anteriores: solo cambia el
  // encabezado de la columna, sin mover ni reescribir sus valores.
  if (name === 'INTERACCIONES' && currentHeaders.indexOf('FechaHoraContacto') === -1) {
    var legacyContactDateIndex = currentHeaders.indexOf('FechaHora');
    if (legacyContactDateIndex !== -1) {
      sheet.getRange(1, legacyContactDateIndex + 1).setValue('FechaHoraContacto');
      currentHeaders[legacyContactDateIndex] = 'FechaHoraContacto';
      actions.push('Se renombró la cabecera "FechaHora" a "FechaHoraContacto" en la pestaña "INTERACCIONES".');
    }
  }
  headers.forEach(function (header) {
    if (currentHeaders.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      currentHeaders.push(header);
      actions.push('Se añadió la cabecera "' + header + '" en la pestaña "' + name + '".');
    }
  });
  return sheet;
}

/** Completa los tipos de usuarios ya existentes sin reemplazar roles válidos. */
function completeUserTypes_(sheet, actions) {
  if (sheet.getLastRow() < 2) return;
  var headers = getHeaders_(sheet);
  var dniIndex = headers.indexOf('DNI');
  var typeIndex = headers.indexOf('TipoUsuario');
  if (dniIndex === -1 || typeIndex === -1) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var changes = 0;
  rows.forEach(function (row) {
    var dni = String(row[dniIndex] || '').trim();
    var previous = String(row[typeIndex] || '').trim().toUpperCase();
    var next = getValidUserType_(previous, dni);
    if (previous !== next) { row[typeIndex] = next; changes++; }
  });
  if (changes > 0) {
    sheet.getRange(2, typeIndex + 1, rows.length, 1).setValues(rows.map(function (row) { return [row[typeIndex]]; }));
    actions.push('Se asignó TipoUsuario a ' + changes + ' usuario(s) existente(s).');
  }
}

/** Deja en ACTIVO las cuentas cuyo Estado esté vacío; no toca las ya definidas. */
function completeEstados_(sheet, actions) {
  if (sheet.getLastRow() < 2) return;
  var headers = getHeaders_(sheet);
  var estadoIndex = headers.indexOf('Estado');
  if (estadoIndex === -1) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var changes = 0;
  rows.forEach(function (row) {
    var previous = String(row[estadoIndex] || '').trim().toUpperCase();
    var next = getValidEstado_(previous);
    if (previous !== next) { row[estadoIndex] = next; changes++; }
  });
  if (changes > 0) {
    sheet.getRange(2, estadoIndex + 1, rows.length, 1).setValues(rows.map(function (row) { return [row[estadoIndex]]; }));
    actions.push('Se asignó Estado ACTIVO a ' + changes + ' usuario(s) sin valor.');
  }
}

/** Crea la cuenta temporal de prueba una sola vez; no modifica una cuenta existente. */
function ensureTestUser_(sheet, actions) {
  var headers = getHeaders_(sheet);
  if (findRowByDni_(sheet, TEST_USER.DNI, headers)) {
    actions.push('El usuario de prueba ' + TEST_USER.DNI + ' ya existe; no se modificó.');
    return;
  }
  var now = new Date();
  var record = {
    DNI: TEST_USER.DNI,
    Apellidos: TEST_USER.Apellidos,
    Nombres: TEST_USER.Nombres,
    Estado: 'ACTIVO',
    TipoUsuario: getDefaultUserType_(TEST_USER.DNI),
    FechaRegistro: now,
    UltimoAcceso: now,
    Dispositivo: 'Cuenta de prueba',
    Pass: hashPassword_(TEST_USER.Pass)
  };
  writeSheetRecord_(sheet, 0, record);
  actions.push('Se creó el usuario de prueba ' + TEST_USER.DNI + ' como ' + record.TipoUsuario + '.');
}

function getHeaders_(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; }

/** Convierte ISO, valores de inputs HTML y fechas ya formateadas a Date. */
function parseSheetDate_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return null;
  var local = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (local) return new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4] || 0), Number(local[5] || 0), Number(local[6] || 0));
  var display = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (display) return new Date(Number(display[3]), Number(display[2]) - 1, Number(display[1]), Number(display[4] || 0), Number(display[5] || 0), Number(display[6] || 0));
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function sheetDateValue_(header, value) {
  if (!DATE_COLUMN_FORMATS[header] || value === '' || value === null || value === undefined) return value === null || value === undefined ? '' : value;
  return parseSheetDate_(value) || value;
}

/** Valor estable para la API; JSON y el frontend reciben siempre ISO 8601. */
function apiDateValue_(value) {
  if (value === '' || value === null || value === undefined) return '';
  var parsed = parseSheetDate_(value);
  return parsed ? parsed.toISOString() : String(value);
}

function dateMillis_(value) {
  var parsed = parseSheetDate_(value);
  return parsed ? parsed.getTime() : 0;
}

function dateKey_(value) {
  var parsed = parseSheetDate_(value);
  return parsed ? Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
}

/**
 * Escribe una fila en una sola llamada a Sheets. El formato de las columnas de
 * fecha se aplica de una vez desde `Actualizar()`; repetir `setNumberFormat`
 * por cada celda hacía que cualquier guardado necesitara varias llamadas RPC.
 */
function writeSheetValues_(sheet, row, headers, values) {
  var normalized = values.map(function (value, index) { return sheetDateValue_(headers[index], value); });
  var targetRow = row || sheet.getLastRow() + 1;
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([normalized]);
  return normalized;
}

function writeSheetRecord_(sheet, row, record) {
  var headers = getHeaders_(sheet);
  return writeSheetValues_(sheet, row, headers, headers.map(function (header) { return record[header] === undefined ? '' : record[header]; }));
}

/**
 * Migra textos ISO existentes a fechas reales y uniforma el formato de toda la
 * columna. Se ejecuta desde Actualizar(), sin borrar ni reinterpretar textos
 * que no sean fechas válidas.
 */
function normalizeSheetDateColumns_(sheet, actions) {
  var headers = getHeaders_(sheet);
  var dataRows = Math.max(sheet.getLastRow() - 1, 0);
  var converted = 0;
  var formatted = 0;
  headers.forEach(function (header, index) {
    var format = DATE_COLUMN_FORMATS[header];
    if (!format) return;
    var formatRows = Math.max(sheet.getMaxRows() - 1, 1);
    var formatRange = sheet.getRange(2, index + 1, formatRows, 1);
    if (formatRange.getCell(1, 1).getNumberFormat() !== format) formatted++;
    formatRange.setNumberFormat(format);
    if (!dataRows) return;
    var range = sheet.getRange(2, index + 1, dataRows, 1);
    var values = range.getValues();
    var changed = false;
    values.forEach(function (row) {
      if (!row[0] || row[0] instanceof Date) return;
      var parsed = parseSheetDate_(row[0]);
      if (!parsed) return;
      row[0] = parsed;
      converted++;
      changed = true;
    });
    if (changed) range.setValues(values);
  });
  if (converted) actions.push('Se convirtieron ' + converted + ' fecha(s) a DD/MM/AAAA en "' + sheet.getName() + '".');
  else if (formatted) actions.push('Se aplicó el formato DD/MM/AAAA a las fechas de "' + sheet.getName() + '".');
}

function findRowByDni_(sheet, dni, headers) {
  if (sheet.getLastRow() < 2) return null;
  var dniColumn = headers.indexOf('DNI') + 1;
  if (!dniColumn) return null;
  var matches = sheet.getRange(2, dniColumn, sheet.getLastRow() - 1, 1).createTextFinder(dni).matchEntireCell(true).findAll();
  return matches.length ? matches[0].getRow() : null;
}
function valueAt_(values, headers, header) { var index = headers.indexOf(header); return index === -1 ? '' : values[index]; }
/** Genera el valor protegido que se almacena exclusivamente en la columna Pass. */
function hashPassword_(password) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password + ':' + PASSWORD_PEPPER);
  return bytes.map(function (byte) { var value = byte < 0 ? byte + 256 : byte; return ('0' + value.toString(16)).slice(-2); }).join('');
}

/**
 * Compatibilidad: las cuentas antiguas pueden tener Pass en texto directo;
 * las cuentas creadas con esta versión guardan el valor protegido en la misma
 * columna. Ambas pueden iniciar sesión mientras se completa la migración.
 */
function passwordMatches_(password, storedPass) {
  return password === storedPass || hashPassword_(password) === storedPass;
}

/**
 * Huella de la sesión. Cambia en cuanto cambia la contraseña almacenada, pero es
 * una función de una sola vía sobre el hash: entregarla al navegador no revela
 * nada de la contraseña. El cliente la guarda al iniciar sesión y la reenvía en
 * cada carga; si ya no coincide, su sesión caducó.
 */
function sessionStamp_(storedPass) {
  return hashPassword_('sesion:' + storedPass).slice(0, 24);
}

/** Nunca entrega Pass al navegador. */
function publicRecord_(headers, values) {
  var record = {};
  headers.forEach(function (header, index) { if (header !== 'Pass') record[header] = DATE_COLUMN_FORMATS[header] ? apiDateValue_(values[index]) : values[index]; });
  return record;
}

/**
 * Puerta única de toda operación privilegiada: comprueba que el DNI exista, que
 * su contraseña coincida, que siga siendo ADMINISTRADOR y que no esté cesada.
 * Devuelve además la hoja y la fila leídas para que quien llama las reutilice.
 */
function verifyAdmin_(ss, adminDni, adminPassword) {
  if (!/^\d{8}$/.test(adminDni) || !adminPassword) return { ok: false, message: 'Confirma tus credenciales de administrador.' };
  var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS);
  var headers = getHeaders_(sheet);
  var row = findRowByDni_(sheet, adminDni, headers);
  if (!row) return { ok: false, message: 'Administrador no encontrado.' };
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  var type = getValidUserType_(valueAt_(values, headers, 'TipoUsuario'), adminDni);
  if (type !== 'ADMINISTRADOR' || !passwordMatches_(adminPassword, String(valueAt_(values, headers, 'Pass') || ''))) {
    return { ok: false, message: 'Credenciales de administrador incorrectas.' };
  }
  if (getValidEstado_(valueAt_(values, headers, 'Estado')) === 'CESADO') return { ok: false, message: 'Tu cuenta está cesada.' };
  return { ok: true, sheet: sheet, headers: headers, row: row, values: values };
}

/** Valida únicamente cuentas creadas previamente por un administrador. */
function authenticateUser_(ss, data) {
  var dni = String(data.dni || '').trim();
  var password = String(data.password || '');
  if (!/^\d{8}$/.test(dni)) return createResponse({ status: 'error', message: 'DNI inválido.' });
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) return createResponse({ status: 'error', message: 'La contraseña debe tener entre ' + MIN_PASSWORD_LENGTH + ' y 128 caracteres.' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS);
    var headers = getHeaders_(sheet);
    var row = findRowByDni_(sheet, dni, headers);
    if (!row) {
      return createResponse({ status: 'error', message: 'Tu cuenta no está registrada. Solicita su creación a un administrador.' });
    }

    var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    var storedPass = String(valueAt_(values, headers, 'Pass') || '');
    if (!storedPass) return createResponse({ status: 'error', message: 'Esta cuenta aún no tiene contraseña. Un administrador debe asignarla de forma segura.' });
    if (!passwordMatches_(password, storedPass)) return createResponse({ status: 'error', message: 'DNI o contraseña incorrectos.' });
    if (getValidEstado_(valueAt_(values, headers, 'Estado')) === 'CESADO') {
      return createResponse({ status: 'error', message: 'Tu cuenta está cesada. Comunícate con un administrador.' });
    }

    values[headers.indexOf('UltimoAcceso')] = new Date();
    values[headers.indexOf('Dispositivo')] = String(data.dispositivo || '');
    var typeIndex = headers.indexOf('TipoUsuario');
    values[typeIndex] = getValidUserType_(values[typeIndex], dni);
    var estadoIndex = headers.indexOf('Estado');
    if (estadoIndex !== -1) values[estadoIndex] = getValidEstado_(values[estadoIndex]);
    values = writeSheetValues_(sheet, row, headers, values);
    return createResponse({ status: 'ok', record: publicRecord_(headers, values), stamp: sessionStamp_(storedPass) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Revalida una sesión guardada en el navegador. Responde `valid: false` cuando
 * la contraseña cambió (huella distinta), cuando la cuenta pasó a CESADO o
 * cuando ya no existe, para que la app cierre la sesión en la siguiente carga.
 */
function checkSession_(ss, data) {
  var dni = String(data.dni || '').trim();
  var stamp = String(data.stamp || '');
  if (!/^\d{8}$/.test(dni)) return createResponse({ status: 'ok', valid: false, reason: 'desconocida' });

  var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS);
  var headers = getHeaders_(sheet);
  var row = findRowByDni_(sheet, dni, headers);
  if (!row) return createResponse({ status: 'ok', valid: false, reason: 'inexistente' });

  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  var storedPass = String(valueAt_(values, headers, 'Pass') || '');
  if (stamp && (!storedPass || stamp !== sessionStamp_(storedPass))) return createResponse({ status: 'ok', valid: false, reason: 'contrasena' });
  if (getValidEstado_(valueAt_(values, headers, 'Estado')) === 'CESADO') return createResponse({ status: 'ok', valid: false, reason: 'cesado' });

  /**
   * Sin huella no se puede comprobar la contraseña, pero sí que la cuenta exista
   * y siga activa: la sesión se conserva y se marca como no verificada. No se
   * devuelve el registro, porque quien pregunta no ha demostrado nada: bastaría
   * conocer un DNI para leer los datos de esa persona.
   */
  if (!stamp) return createResponse({ status: 'ok', valid: true, unverified: true });

  return createResponse({ status: 'ok', valid: true, record: publicRecord_(headers, values) });
}

/* ════════════ ENTREGA DEL ACCESO A UNA CUENTA NUEVA (correo y WhatsApp) ════════════ */

function isEmail_(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '')); }

/** Un celular se acepta con o sin prefijo internacional; se guarda tal como se escribió. */
function isPhone_(value) { return /^\+?[\d][\d\s\-()]{5,19}$/.test(String(value || '')); }

/**
 * Mismo criterio que la pantalla de acceso: un número de 9 dígitos sin prefijo
 * se entiende peruano (+51); con `+` delante manda lo que se escribió.
 */
function whatsappDigits_(phone) {
  var text = String(phone || '').trim();
  var digits = text.replace(/\D/g, '');
  if (text.charAt(0) === '+') return digits.length >= 8 ? digits : '';
  if (digits.length === 9) return '51' + digits;
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

function userRoleName_(tipoUsuario) { return tipoUsuario === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : 'AGENTE COMERCIAL'; }

/** Qué podrá hacer la persona con el rol que se le acaba de asignar. */
function userRoleDuties_(tipoUsuario) {
  return tipoUsuario === 'ADMINISTRADOR'
    ? 'Además de la gestión comercial, administras el equipo, los catálogos y la configuración de la aplicación.'
    : 'Registras prospectos, dejas constancia de cada contacto, agendas el siguiente y conviertes en clientes a quienes cierran.';
}

function htmlEscape_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Texto único de bienvenida: qué es la aplicación, con qué rol se creó la cuenta
 * y cómo entrar. Se usa igual en el correo y en el mensaje de WhatsApp, para que
 * quien recibe uno u otro lea exactamente lo mismo.
 */
function welcomeMessage_(settings, user, password, isResend) {
  var appName = String(settings.appName || '').trim() || 'la aplicación';
  var organization = String(settings.organization || '').trim();
  var link = String(settings.Link || '').trim();
  var support = String(settings.supportContact || '').trim();
  var purpose = String(settings.appPurpose || '').trim();
  var role = userRoleName_(user.tipoUsuario);
  var fullName = [user.nombres, user.apellidos].join(' ').replace(/\s+/g, ' ').trim();

  // Al reenviar, la contraseña guardada solo se conoce si sigue siendo la
  // inicial; en cualquier otro caso el mensaje remite a la que ya definió.
  var passwordText = password || 'la que ya definiste. Si la olvidaste, pide a un administrador que la restablezca.';
  var opening = isResend
    ? 'Te recordamos cómo entrar a ' + appName + (organization ? ' (' + organization + ')' : '') + '.'
    : 'Ya tienes tu cuenta en ' + appName + (organization ? ' (' + organization + ')' : '') + '.';

  var lines = ['Hola ' + (fullName || 'y bienvenido/a') + ':', ''];
  lines.push(opening);
  if (purpose) lines.push('Para qué sirve: ' + purpose);
  lines.push('');
  lines.push('TU TIPO DE USUARIO: ' + role);
  lines.push(userRoleDuties_(user.tipoUsuario));
  lines.push('');
  lines.push('CÓMO INGRESAR');
  if (link) lines.push('Enlace: ' + link);
  lines.push('Usuario (DNI): ' + user.dni);
  lines.push('Contraseña: ' + passwordText);
  lines.push('');
  if (password) lines.push('Guarda esta contraseña; solo un administrador puede cambiarla.');
  if (support) lines.push('¿Problemas para ingresar? Escribe a ' + support + '.');

  var html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1b1b21">'
    + '<p>Hola <b>' + htmlEscape_(fullName || 'y bienvenido/a') + '</b>:</p>'
    + '<p>' + htmlEscape_(opening)
    + (purpose ? '<br><span style="color:#4a4a55">' + htmlEscape_(purpose) + '</span>' : '') + '</p>'
    + '<p><b>Tu tipo de usuario: ' + htmlEscape_(role) + '</b><br>' + htmlEscape_(userRoleDuties_(user.tipoUsuario)) + '</p>'
    + '<table style="border-collapse:collapse;margin:18px 0"><tbody>'
    + (link ? '<tr><td style="padding:4px 12px 4px 0;color:#4a4a55">Enlace</td><td style="padding:4px 0"><a href="' + htmlEscape_(link) + '">' + htmlEscape_(link) + '</a></td></tr>' : '')
    + '<tr><td style="padding:4px 12px 4px 0;color:#4a4a55">Usuario (DNI)</td><td style="padding:4px 0"><b>' + htmlEscape_(user.dni) + '</b></td></tr>'
    + '<tr><td style="padding:4px 12px 4px 0;color:#4a4a55">Contraseña</td><td style="padding:4px 0">' + (password ? '<b>' + htmlEscape_(password) + '</b>' : htmlEscape_(passwordText)) + '</td></tr>'
    + '</tbody></table>'
    + '<p style="color:#4a4a55;font-size:13px">'
    + (password ? 'Guarda esta contraseña; solo un administrador puede cambiarla.' : '')
    + (support ? (password ? '<br>' : '') + '¿Problemas para ingresar? Escribe a ' + htmlEscape_(support) + '.' : '') + '</p>'
    + '</div>';

  return { subject: (isResend ? 'Recordatorio de tu acceso a ' : 'Tu acceso a ') + appName, text: lines.join('\n'), html: html, sender: appName };
}

/** El envío nunca debe tumbar el alta: la cuenta ya existe cuando se llega aquí. */
function sendCredentialsEmail_(message, email) {
  try {
    if (MailApp.getRemainingDailyQuota() <= 0) return { sent: false, error: 'Se agotó la cuota diaria de correos del script; comparte el acceso por WhatsApp.' };
    MailApp.sendEmail({ to: email, subject: message.subject, body: message.text, htmlBody: message.html, name: message.sender });
    return { sent: true, error: '' };
  } catch (err) {
    return { sent: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * Entrega las credenciales por los canales registrados. El correo lo envía el
 * propio script; para el celular se devuelve un enlace de WhatsApp con el
 * mensaje ya escrito, porque Apps Script no puede enviarlo por su cuenta y debe
 * pulsarlo quien administra.
 */
function deliverCredentials_(ss, user, password, options) {
  options = options || {};
  var settings = readSettings_(ensureSettingsSheet_(ss, []));
  var message = welcomeMessage_(settings, user, password, options.resend === true);
  // Reenviar por WhatsApp no debe disparar además un correo que nadie pidió.
  var sendEmail = options.sendEmail !== false;
  var delivery = { email: String(user.correo || ''), emailSent: false, emailError: '', emailSkipped: !sendEmail, whatsappUrl: '', text: message.text, link: String(settings.Link || ''), password: String(password || '') };
  if (sendEmail && delivery.email) {
    var result = sendCredentialsEmail_(message, delivery.email);
    delivery.emailSent = result.sent;
    delivery.emailError = result.error;
  }
  var digits = whatsappDigits_(user.celular);
  if (digits) delivery.whatsappUrl = 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message.text);
  return delivery;
}

/** Crea cuentas solo después de validar las credenciales de un administrador. */
function createUser_(ss, data) {
  var adminDni = String(data.adminDni || '').trim();
  var adminPassword = String(data.adminPassword || '');
  var usuario = data.usuario || {};
  var dni = String(usuario.dni || '').trim();
  var password = String(usuario.password || '');
  var apellidos = String(usuario.apellidos || '').trim().toUpperCase();
  var nombres = String(usuario.nombres || '').trim().toUpperCase();
  var tipoUsuario = String(usuario.tipoUsuario || 'USUARIO').trim().toUpperCase();
  var correo = String(usuario.correo || '').trim();
  var celular = String(usuario.celular || '').trim();
  var categoria = crmLabelText_(usuario.categoria);
  if (!/^\d{8}$/.test(adminDni) || !adminPassword) return createResponse({ status: 'error', message: 'Confirma tus credenciales de administrador.' });
  if (!/^\d{8}$/.test(dni)) return createResponse({ status: 'error', message: 'El DNI del nuevo usuario no es válido.' });
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) return createResponse({ status: 'error', message: 'La contraseña debe tener entre ' + MIN_PASSWORD_LENGTH + ' y 128 caracteres.' });
  if (!apellidos || !nombres) return createResponse({ status: 'error', message: 'Ingresa apellidos y nombres del nuevo usuario.' });
  if (tipoUsuario !== 'ADMINISTRADOR' && tipoUsuario !== 'USUARIO') return createResponse({ status: 'error', message: 'Tipo de usuario no válido.' });
  if (correo && !isEmail_(correo)) return createResponse({ status: 'error', message: 'El correo del nuevo usuario no es válido.' });
  if (celular && !isPhone_(celular)) return createResponse({ status: 'error', message: 'El celular del nuevo usuario no es válido.' });

  if (categoria) { categoria = crmCatalogLabel_(crmCatalogRows_(ss), 'CATEGORIA_AGENTE', categoria); if (!categoria) return createResponse({ status: 'error', message: 'La categoría seleccionada no está disponible.' }); }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var created = null;
  try {
    var admin = verifyAdmin_(ss, adminDni, adminPassword);
    if (!admin.ok) return createResponse({ status: 'error', message: admin.message });
    var sheet = admin.sheet;
    var headers = admin.headers;
    if (findRowByDni_(sheet, dni, headers)) return createResponse({ status: 'error', message: 'Ya existe un usuario con ese DNI.' });

    var now = new Date();
    var newRecord = { DNI: dni, Apellidos: apellidos, Nombres: nombres, Estado: 'ACTIVO', TipoUsuario: tipoUsuario, FechaRegistro: now, UltimoAcceso: '', Dispositivo: '', Correo: correo, Celular: celular, Categoria: categoria, Pass: hashPassword_(password) };
    created = { headers: headers, values: writeSheetRecord_(sheet, 0, newRecord) };
  } finally {
    lock.releaseLock();
  }

  // Fuera del bloqueo: la cuenta ya está escrita y el envío del acceso puede
  // tardar segundos, que nadie más debería esperar para iniciar sesión.
  crmAudit_(ss, { dni: adminDni }, 'CREAR', 'USUARIO', dni, nombres + ' ' + apellidos);
  var delivery = deliverCredentials_(ss, { dni: dni, nombres: nombres, apellidos: apellidos, tipoUsuario: tipoUsuario, correo: correo, celular: celular }, password);
  return createResponse({ status: 'ok', message: 'Usuario creado correctamente.', record: publicRecord_(created.headers, created.values), delivery: delivery });
}

/**
 * Genera un recordatorio de acceso para que el administrador lo abra desde
 * WhatsApp. Nunca revela una contraseña que la persona ya haya cambiado: si
 * sigue usando la inicial, esta es su DNI; de otro modo el texto indica cómo
 * solicitar el restablecimiento.
 */
function resendInvite_(ss, data) {
  var adminDni = String(data.adminDni || '').trim();
  var adminPassword = String(data.adminPassword || '');
  var dni = String(data.dni || '').trim();
  var canal = String(data.canal || 'whatsapp').toLowerCase();
  if (!/^\d{8}$/.test(dni)) return createResponse({ status: 'error', message: 'El DNI del usuario no es válido.' });
  if (canal !== 'whatsapp') return createResponse({ status: 'error', message: 'Este recordatorio se envía únicamente por WhatsApp.' });

  var admin = verifyAdmin_(ss, adminDni, adminPassword);
  if (!admin.ok) return createResponse({ status: 'error', message: admin.message });
  var row = findRowByDni_(admin.sheet, dni, admin.headers);
  if (!row) return createResponse({ status: 'error', message: 'No existe un usuario con ese DNI.' });
  var values = admin.sheet.getRange(row, 1, 1, admin.headers.length).getValues()[0];
  var user = publicRecord_(admin.headers, values);
  if (!String(user.Celular || '').trim()) return createResponse({ status: 'error', message: 'Este usuario no tiene un celular registrado.' });

  var storedPass = String(valueAt_(values, admin.headers, 'Pass') || '');
  var initialPassword = passwordMatches_(dni, storedPass) ? dni : '';
  var delivery = deliverCredentials_(ss, {
    dni: String(user.DNI || dni), apellidos: String(user.Apellidos || ''), nombres: String(user.Nombres || ''),
    tipoUsuario: getValidUserType_(user.TipoUsuario, dni), correo: String(user.Correo || ''), celular: String(user.Celular || ''),
  }, initialPassword, { resend: true, sendEmail: false });
  crmAudit_(ss, { dni: adminDni }, 'RECORDATORIO', 'USUARIO', dni, 'Recordatorio de credenciales preparado para WhatsApp.');
  return createResponse({ status: 'ok', message: 'Recordatorio preparado.', record: user, delivery: delivery });
}

/**
 * Edita una cuenta existente. Solo un administrador válido puede hacerlo.
 * `usuario.password` vacío deja la contraseña intacta; si trae valor, se
 * reemplaza y la huella de sesión cambia, por lo que esa persona quedará fuera
 * de la app en su siguiente carga. Lo mismo ocurre al marcarla como CESADO.
 */
function updateUser_(ss, data) {
  var adminDni = String(data.adminDni || '').trim();
  var adminPassword = String(data.adminPassword || '');
  var usuario = data.usuario || {};
  var dni = String(usuario.dni || '').trim();
  var apellidos = String(usuario.apellidos || '').trim().toUpperCase();
  var nombres = String(usuario.nombres || '').trim().toUpperCase();
  var tipoUsuario = String(usuario.tipoUsuario || '').trim().toUpperCase();
  var estado = String(usuario.estado || '').trim().toUpperCase();
  var password = String(usuario.password || '');
  // `null` significa "no se envió el campo": esa columna se deja intacta.
  var correo = usuario.correo === undefined ? null : String(usuario.correo || '').trim();
  var celular = usuario.celular === undefined ? null : String(usuario.celular || '').trim();
  var categoria = usuario.categoria === undefined ? null : crmLabelText_(usuario.categoria);
  if (categoria) { categoria = crmCatalogLabel_(crmCatalogRows_(ss), 'CATEGORIA_AGENTE', categoria); if (!categoria) return createResponse({ status: 'error', message: 'La categoría seleccionada no está disponible.' }); }
  if (!/^\d{8}$/.test(adminDni) || !adminPassword) return createResponse({ status: 'error', message: 'Confirma tus credenciales de administrador.' });
  if (!/^\d{8}$/.test(dni)) return createResponse({ status: 'error', message: 'El DNI del usuario no es válido.' });
  if (!apellidos || !nombres) return createResponse({ status: 'error', message: 'Ingresa apellidos y nombres del usuario.' });
  if (tipoUsuario !== 'ADMINISTRADOR' && tipoUsuario !== 'USUARIO') return createResponse({ status: 'error', message: 'Tipo de usuario no válido.' });
  if (estado !== 'ACTIVO' && estado !== 'CESADO') return createResponse({ status: 'error', message: 'Estado no válido.' });
  if (password && (password.length < MIN_PASSWORD_LENGTH || password.length > 128)) {
    return createResponse({ status: 'error', message: 'La contraseña debe tener entre ' + MIN_PASSWORD_LENGTH + ' y 128 caracteres.' });
  }
  if (correo && !isEmail_(correo)) return createResponse({ status: 'error', message: 'El correo del usuario no es válido.' });
  if (celular && !isPhone_(celular)) return createResponse({ status: 'error', message: 'El celular del usuario no es válido.' });
  // Evita que quien edita se deje sin acceso a la administración.
  if (dni === adminDni && tipoUsuario !== 'ADMINISTRADOR') return createResponse({ status: 'error', message: 'No puedes quitar el rol de administrador a tu propia cuenta.' });
  if (dni === adminDni && estado === 'CESADO') return createResponse({ status: 'error', message: 'No puedes cesar tu propia cuenta.' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var admin = verifyAdmin_(ss, adminDni, adminPassword);
    if (!admin.ok) return createResponse({ status: 'error', message: admin.message });
    var sheet = admin.sheet;
    var headers = admin.headers;

    var row = findRowByDni_(sheet, dni, headers);
    if (!row) return createResponse({ status: 'error', message: 'No existe un usuario con ese DNI.' });
    var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    values[headers.indexOf('Apellidos')] = apellidos;
    values[headers.indexOf('Nombres')] = nombres;
    values[headers.indexOf('TipoUsuario')] = getValidUserType_(tipoUsuario, dni);
    var estadoIndex = headers.indexOf('Estado');
    if (estadoIndex !== -1) values[estadoIndex] = estado;
    var correoIndex = headers.indexOf('Correo');
    if (correo !== null && correoIndex !== -1) values[correoIndex] = correo;
    var celularIndex = headers.indexOf('Celular');
    if (celular !== null && celularIndex !== -1) values[celularIndex] = celular;
    var categoriaIndex = headers.indexOf('Categoria');
    if (categoria !== null && categoriaIndex !== -1) values[categoriaIndex] = categoria;
    if (password) values[headers.indexOf('Pass')] = hashPassword_(password);
    values = writeSheetValues_(sheet, row, headers, values);
    crmAudit_(ss, { dni: adminDni }, estado === 'CESADO' ? 'DESACTIVAR' : 'EDITAR', 'USUARIO', dni, nombres + ' ' + apellidos);

    var storedPass = String(valueAt_(values, headers, 'Pass') || '');
    return createResponse({ status: 'ok', message: 'Usuario actualizado correctamente.', record: publicRecord_(headers, values), stamp: sessionStamp_(storedPass) });
  } finally {
    lock.releaseLock();
  }
}

/** Devuelve los usuarios sin Pass, únicamente después de validar a un administrador. */
function listUsers_(ss, data) {
  var admin = verifyAdmin_(ss, String(data.adminDni || '').trim(), String(data.adminPassword || ''));
  if (!admin.ok) return createResponse({ status: 'error', message: admin.message });
  var sheet = admin.sheet;
  var headers = admin.headers;
  if (sheet.getLastRow() < 2) return createResponse({ status: 'ok', users: [] });
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var users = rows.map(function (row) { return publicRecord_(headers, row); });
  return createResponse({ status: 'ok', users: users });
}

/* ═══════════════ CONFIGURACIÓN GENERAL DE LA APP (pestaña CONFIGURACION) ═══════════════ */

function settingDef_(key) {
  for (var index = 0; index < APP_SETTINGS.length; index++) {
    if (APP_SETTINGS[index].key === key) return APP_SETTINGS[index];
  }
  return null;
}

/**
 * Normaliza un valor según el tipo declarado. Un valor inválido —o una celda que
 * alguien vació a mano en la hoja— vuelve al valor por defecto, de modo que la
 * app nunca recibe un color roto ni un tema inexistente.
 */
function cleanSettingValue_(def, value) {
  var raw = String(value === null || value === undefined ? '' : value).trim();
  if (def.type === 'color') return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : def.def;
  if (def.type === 'boolean') {
    if (!raw) return def.def;
    var flag = raw.toLowerCase();
    return (flag === 'true' || flag === '1' || flag === 'sí' || flag === 'si') ? 'true' : 'false';
  }
  if (def.type === 'select') return def.options.indexOf(raw) !== -1 ? raw : def.def;
  // Una dirección sin esquema o con espacios no se guarda a medias: vuelve al
  // valor por defecto, igual que un color roto.
  if (def.type === 'url') return /^https?:\/\/\S+$/i.test(raw) ? raw.slice(0, def.max || 300) : def.def;
  return raw ? raw.slice(0, def.max || 120) : def.def;
}

/**
 * Verifica la pestaña de configuración: crea las claves que falten con su valor
 * por defecto y mantiene al día las columnas de documentación (Tipo y
 * Descripcion), sin tocar los valores que un administrador ya definió.
 */
function ensureSettingsSheet_(ss, actions) {
  var sheet = ensureSheetAndHeaders_(ss, SETTINGS_SHEET_NAME, SETTINGS_HEADERS, actions);
  var headers = getHeaders_(sheet);
  var claveIndex = headers.indexOf('Clave');
  var tipoIndex = headers.indexOf('Tipo');
  var descIndex = headers.indexOf('Descripcion');
  var rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var rowByKey = {};
  rows.forEach(function (row, index) {
    var key = String(row[claveIndex] || '').trim();
    if (key) rowByKey[key] = index;
  });

  var docChanges = 0;
  APP_SETTINGS.forEach(function (def) {
    var index = rowByKey[def.key];
    if (index === undefined) return;
    if (tipoIndex !== -1 && rows[index][tipoIndex] !== def.type) { rows[index][tipoIndex] = def.type; docChanges++; }
    if (descIndex !== -1 && rows[index][descIndex] !== def.desc) { rows[index][descIndex] = def.desc; docChanges++; }
  });
  if (docChanges > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  var now = new Date();
  var missing = APP_SETTINGS.filter(function (def) { return rowByKey[def.key] === undefined; });
  missing.forEach(function (def) {
    var record = { Clave: def.key, Valor: def.def, Tipo: def.type, Descripcion: def.desc, Actualizado: now, ActualizadoPor: 'Sistema' };
    writeSheetRecord_(sheet, 0, record);
  });
  if (missing.length) actions.push('Se añadieron ' + missing.length + ' ajuste(s) por defecto en la pestaña "' + SETTINGS_SHEET_NAME + '".');
  return sheet;
}

/** Mapa clave→valor con todas las claves del catálogo, ya normalizadas. */
function readSettings_(sheet) {
  var headers = getHeaders_(sheet);
  var claveIndex = headers.indexOf('Clave');
  var valorIndex = headers.indexOf('Valor');
  var stored = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().forEach(function (row) {
      var key = String(row[claveIndex] || '').trim();
      if (key) stored[key] = row[valorIndex];
    });
  }
  var settings = {};
  APP_SETTINGS.forEach(function (def) { settings[def.key] = cleanSettingValue_(def, stored[def.key]); });
  return settings;
}

/**
 * Lectura pública: la pantalla de acceso necesita el título y los colores antes
 * de que exista una sesión. Solo expone identidad y apariencia, nunca datos de
 * usuarios; escribir sigue exigiendo credenciales de administrador.
 */
function getSettings_(ss) {
  return createResponse({ status: 'ok', settings: readSettings_(ensureSettingsSheet_(ss, [])) });
}

/** Guarda solo las claves conocidas del catálogo y anota quién y cuándo las cambió. */
function saveSettings_(ss, data) {
  var adminDni = String(data.adminDni || '').trim();
  var admin = verifyAdmin_(ss, adminDni, String(data.adminPassword || ''));
  if (!admin.ok) return createResponse({ status: 'error', message: admin.message });
  var incoming = data.settings || {};

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = ensureSettingsSheet_(ss, []);
    var headers = getHeaders_(sheet);
    var claveIndex = headers.indexOf('Clave');
    var valorIndex = headers.indexOf('Valor');
    var actualizadoIndex = headers.indexOf('Actualizado');
    var porIndex = headers.indexOf('ActualizadoPor');
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    var now = new Date();
    var changes = 0;

    rows.forEach(function (row) {
      var def = settingDef_(String(row[claveIndex] || '').trim());
      if (!def || !Object.prototype.hasOwnProperty.call(incoming, def.key)) return;
      var next = cleanSettingValue_(def, incoming[def.key]);
      if (String(row[valorIndex]) === next) return;
      row[valorIndex] = next;
      if (actualizadoIndex !== -1) row[actualizadoIndex] = now;
      if (porIndex !== -1) row[porIndex] = adminDni;
      changes++;
    });
    if (changes > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
      if (actualizadoIndex !== -1) sheet.getRange(2, actualizadoIndex + 1, rows.length, 1).setNumberFormat(DATE_COLUMN_FORMATS.Actualizado);
      crmAudit_(ss, { dni: adminDni }, 'EDITAR', 'CONFIGURACION', 'GENERAL', changes + ' cambio(s)');
    }
    SpreadsheetApp.flush();

    return createResponse({
      status: 'ok',
      settings: readSettings_(sheet),
      message: changes ? 'Configuración guardada: ' + changes + ' cambio(s).' : 'No había cambios que guardar.'
    });
  } finally {
    lock.releaseLock();
  }
}

/* ═════════════════════════════════ CRM COMERCIAL RX ═════════════════════════════════ */

function crmResponse_(data) { return createResponse({ status: 'ok', ok: true, data: data, error: null }); }
function crmError_(message) { return createResponse({ status: 'error', ok: false, data: null, error: message, message: message }); }
function crmText_(value, max) { return String(value === null || value === undefined ? '' : value).trim().slice(0, max || 500); }
function crmId_(prefix) { return prefix + '-' + Utilities.getUuid().split('-')[0].toUpperCase(); }
function crmIsAdmin_(actor) { return actor.tipo === 'ADMINISTRADOR'; }

/**
 * Valida la colección editable antes de convertirla en texto para Sheets.
 * Una fila completamente vacía se ignora; una fila a medias se rechaza para
 * evitar guardar etiquetas sin contenido o valores imposibles de identificar.
 */
function crmCustomFieldsInput_(value) {
  if (value === undefined) return { ok: true, present: false, items: [] };
  if (!Array.isArray(value)) return { ok: false, message: 'Los campos adicionales no tienen un formato válido.' };
  if (value.length > 30) return { ok: false, message: 'Puedes guardar hasta 30 campos adicionales.' };
  var items = [];
  var labels = {};
  for (var index = 0; index < value.length; index++) {
    var source = value[index] || {};
    var label = crmText_(source.etiqueta, 80);
    var content = crmText_(source.valor, 500);
    if (!label && !content) continue;
    if (!label || !content) return { ok: false, message: 'Completa la etiqueta y el valor de cada campo adicional.' };
    var key = '$' + label.toLowerCase();
    if (labels[key]) return { ok: false, message: 'Cada campo adicional debe tener una etiqueta diferente.' };
    labels[key] = true;
    items.push({ etiqueta: label, valor: content });
  }
  return { ok: true, present: true, items: items };
}

/** Lee tanto el arreglo actual como un objeto JSON legado sin romper la ficha. */
function crmCustomFieldsFromCell_(value) {
  if (value === '' || value === null || value === undefined) return [];
  var parsed;
  try { parsed = typeof value === 'string' ? JSON.parse(value) : value; } catch (ignored) { return []; }
  if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') parsed = Object.keys(parsed).map(function (key) { return { etiqueta: key, valor: parsed[key] }; });
  if (!Array.isArray(parsed)) return [];
  var result = crmCustomFieldsInput_(parsed);
  return result.ok ? result.items : [];
}

/** Valida la huella de la sesión y resuelve el rol exclusivamente desde USUARIOS. */
function crmActor_(ss, data) {
  var dni = crmText_(data.actorDni, 12);
  var stamp = crmText_(data.stamp, 80);
  if (!/^\d{8}$/.test(dni) || !stamp) return { ok: false, message: 'La sesión no es válida. Vuelve a iniciar sesión.' };
  var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS);
  var headers = getHeaders_(sheet);
  var row = findRowByDni_(sheet, dni, headers);
  if (!row) return { ok: false, message: 'La cuenta ya no existe.' };
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  var storedPass = String(valueAt_(values, headers, 'Pass') || '');
  if (!storedPass || stamp !== sessionStamp_(storedPass)) return { ok: false, message: 'La sesión caducó. Vuelve a iniciar sesión.' };
  if (getValidEstado_(valueAt_(values, headers, 'Estado')) === 'CESADO') return { ok: false, message: 'La cuenta está cesada.' };
  return {
    ok: true,
    dni: dni,
    tipo: getValidUserType_(valueAt_(values, headers, 'TipoUsuario'), dni),
    nombre: [valueAt_(values, headers, 'Nombres'), valueAt_(values, headers, 'Apellidos')].join(' ').trim()
  };
}

function crmSheet_(ss, key) {
  var def = CRM_SHEETS[key];
  return getOrCreateSheetWithHeaders(ss, def.name, def.headers);
}

function crmObjects_(sheet) {
  var headers = getHeaders_(sheet);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function (values, index) {
    var record = { _row: index + 2 };
    headers.forEach(function (header, column) { record[header] = values[column]; });
    return record;
  });
}

function crmWriteRow_(sheet, row, record) {
  writeSheetRecord_(sheet, row, record);
}

function crmFind_(records, field, value) {
  value = String(value || '');
  for (var index = 0; index < records.length; index++) if (String(records[index][field] || '') === value) return records[index];
  return null;
}

function crmUserNames_(ss) {
  var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS);
  var names = {};
  crmObjects_(sheet).forEach(function (row) { names[String(row.DNI)] = [row.Nombres, row.Apellidos].join(' ').trim(); });
  return names;
}

function crmCanAccess_(actor, record) { return crmIsAdmin_(actor) || String(record.AgenteDNI || '') === actor.dni; }
function crmRequireAccess_(actor, record) { return record ? (crmCanAccess_(actor, record) ? '' : 'No tienes permiso sobre este registro.') : 'El registro solicitado no existe.'; }

function crmAudit_(ss, actor, action, entity, id, description) {
  crmWriteRow_(crmSheet_(ss, 'audit'), 0, { UsuarioDNI: actor.dni, Accion: action, Entidad: entity, EntidadID: id, FechaHora: new Date(), Descripcion: crmText_(description, 500) });
  if (['CREAR', 'EDITAR', 'REGISTRAR', 'REPROGRAMAR', 'CAPTAR', 'CONVERTIR', 'REASIGNAR', 'ELIMINAR'].indexOf(String(action || '').toUpperCase()) !== -1) crmInvalidateDashboardCache_();
}

function crmProspectPublic_(row, names, latestInteraction) {
  return {
    id: String(row.ID || ''), nombre: String(row.Nombre || ''), documento: String(row.Documento || ''), telefono: String(row.Telefono || ''), correo: String(row.Correo || ''),
    canal: String(row.Canal || ''), resultado: String((latestInteraction && latestInteraction.Resultado) || ''), etapa: row.ClienteID ? 'CLIENTE' : String((latestInteraction && latestInteraction.Etapa) || 'PROSPECTO').toUpperCase(), agenteDni: String(row.AgenteDNI || ''), agenteNombre: names[String(row.AgenteDNI || '')] || '',
    fechaCreacion: apiDateValue_(row.FechaCreacion), fechaActualizacion: apiDateValue_(row.FechaActualizacion), proximoContacto: apiDateValue_(latestInteraction && latestInteraction.ProximoContacto), observaciones: String(row.Observaciones || ''),
    fechaNacimiento: apiDateValue_(row.FechaNacimiento), profesion: String(row.Profesion || ''), distrito: String(row.Distrito || ''), direccion: String(row.Direccion || ''), notas: String(row.Notas || ''), camposPersonalizados: crmCustomFieldsFromCell_(row.JSON), clienteId: String(row.ClienteID || ''), captado: crmProspectCaptured_(row)
  };
}

/** ClienteID se conserva solo para registros históricos; las nuevas captaciones se identifican sin crear clientes. */
function crmProspectCaptured_(row) {
  return String(row.Captado || '').trim().toUpperCase() === 'SI' || Boolean(row.ClienteID);
}

/**
 * Una sola fuente para el próximo contacto: la interacción más reciente de cada
 * prospecto. Acepta filas ya leídas (`rows`) para no volver a golpear la hoja
 * cuando quien llama ya las tiene, como hace `crmDashboard_`.
 */
function crmLatestInteractionsByProspect_(ss, rows) {
  var latest = {};
  (rows || crmObjects_(crmSheet_(ss, 'interactions'))).forEach(function (row) {
    var prospectId = String(row.ProspectoID || '');
    if (!prospectId) return;
    if (!latest[prospectId] || dateMillis_(row.FechaHoraContacto || row.FechaHora) > dateMillis_(latest[prospectId].FechaHoraContacto || latest[prospectId].FechaHora)) latest[prospectId] = row;
  });
  return latest;
}

/** Fecha de la interacción que dejó constancia de la captación. */
function crmCaptureDateForProspect_(ss, prospectId) {
  var captures = crmObjects_(crmSheet_(ss, 'interactions')).filter(function (row) {
    return String(row.ProspectoID || '') === String(prospectId || '') &&
      (String(row.Captacion || '').toUpperCase() === 'SI' || crmLabelKey_(row.Resultado) === 'CAPTACION CERRADA');
  });
  if (!captures.length) return null;
  captures.sort(function (a, b) { return dateMillis_(b.FechaHoraContacto || b.FechaHora) - dateMillis_(a.FechaHoraContacto || a.FechaHora); });
  return parseSheetDate_(captures[0].FechaHoraContacto || captures[0].FechaHora);
}

/** Marca como captada la interacción más reciente que originó la conversión. */
function crmCaptureLatestInteraction_(ss, prospectId) {
  var sheet = crmSheet_(ss, 'interactions');
  var interactions = crmObjects_(sheet).filter(function (row) { return String(row.ProspectoID || '') === String(prospectId || ''); });
  if (!interactions.length) return null;
  interactions.sort(function (a, b) {
    var registrationDifference = dateMillis_(b.FechaHora) - dateMillis_(a.FechaHora);
    if (registrationDifference) return registrationDifference;
    var contactDifference = dateMillis_(b.FechaHoraContacto || b.FechaHora) - dateMillis_(a.FechaHoraContacto || a.FechaHora);
    return contactDifference || b._row - a._row;
  });
  var latest = interactions[0];
  var headers = getHeaders_(sheet);
  var captureColumn = headers.indexOf('Captacion') + 1;
  if (captureColumn && String(latest.Captacion || '').toUpperCase() !== 'SI') sheet.getRange(latest._row, captureColumn).setValue('SI');
  var stageColumn = headers.indexOf('Etapa') + 1;
  if (stageColumn && String(latest.Etapa || '').toUpperCase() !== 'PROSPECTO') sheet.getRange(latest._row, stageColumn).setValue('PROSPECTO');
  latest.Captacion = 'SI';
  latest.Etapa = 'PROSPECTO';
  return latest;
}

/** Al cerrar como cliente, la última negociación queda identificada en el historial. */
function crmMarkLatestInteractionAsClient_(ss, prospectId) {
  var sheet = crmSheet_(ss, 'interactions');
  var interactions = crmObjects_(sheet).filter(function (row) { return String(row.ProspectoID || '') === String(prospectId || ''); });
  if (!interactions.length) return null;
  interactions.sort(function (a, b) {
    var registrationDifference = dateMillis_(b.FechaHora) - dateMillis_(a.FechaHora);
    if (registrationDifference) return registrationDifference;
    var contactDifference = dateMillis_(b.FechaHoraContacto || b.FechaHora) - dateMillis_(a.FechaHoraContacto || a.FechaHora);
    return contactDifference || b._row - a._row;
  });
  var latest = interactions[0];
  var headers = getHeaders_(sheet);
  var stageColumn = headers.indexOf('Etapa') + 1;
  if (stageColumn && String(latest.Etapa || '').toUpperCase() !== 'CLIENTE') sheet.getRange(latest._row, stageColumn).setValue('CLIENTE');
  latest.Etapa = 'CLIENTE';
  return latest;
}

/**
 * Completa registros creados antes de incorporar Captacion. Para cada prospecto
 * ya convertido localiza la primera fila captada y mantiene en SI esa fila y
 * todas las interacciones registradas después. Las anteriores permanecen en NO.
 */
function completeInteractionCaptureFlags_(ss, actions) {
  var sheet = crmSheet_(ss, 'interactions');
  if (sheet.getLastRow() < 2) return;
  var headers = getHeaders_(sheet);
  var captureColumn = headers.indexOf('Captacion') + 1;
  if (!captureColumn) return;
  var interactions = crmObjects_(sheet);
  var capturedProspects = {};
  crmObjects_(crmSheet_(ss, 'prospects')).forEach(function (row) { if (crmProspectCaptured_(row)) capturedProspects[String(row.ID || '')] = true; });
  crmObjects_(crmSheet_(ss, 'clients')).forEach(function (row) { if (row.ProspectoID) capturedProspects[String(row.ProspectoID)] = true; });
  var grouped = {};
  interactions.forEach(function (row) {
    var prospectId = String(row.ProspectoID || '');
    if (!grouped[prospectId]) grouped[prospectId] = [];
    grouped[prospectId].push(row);
  });
  var range = sheet.getRange(2, captureColumn, sheet.getLastRow() - 1, 1);
  var values = range.getValues();
  var changes = 0;
  interactions.forEach(function (row) {
    var index = row._row - 2;
    var normalized = String(values[index][0] || '').trim().toUpperCase();
    if (normalized !== 'SI' && normalized !== 'NO') { values[index][0] = 'NO'; changes++; }
  });
  Object.keys(capturedProspects).forEach(function (prospectId) {
    var rows = grouped[prospectId] || [];
    if (!rows.length) return;
    var capturedRows = rows.filter(function (row) { return String(values[row._row - 2][0] || '').toUpperCase() === 'SI'; });
    capturedRows.sort(function (a, b) {
      var registrationDifference = dateMillis_(a.FechaHora) - dateMillis_(b.FechaHora);
      return registrationDifference || a._row - b._row;
    });
    var boundary = capturedRows[0] || null;
    if (!boundary) {
      rows.sort(function (a, b) {
        var registrationDifference = dateMillis_(b.FechaHora) - dateMillis_(a.FechaHora);
        if (registrationDifference) return registrationDifference;
        var contactDifference = dateMillis_(b.FechaHoraContacto || b.FechaHora) - dateMillis_(a.FechaHoraContacto || a.FechaHora);
        return contactDifference || b._row - a._row;
      });
      boundary = rows[0];
    }
    var boundaryAt = dateMillis_(boundary.FechaHora);
    rows.forEach(function (row) {
      var registeredAt = dateMillis_(row.FechaHora);
      var atOrAfterCapture = row._row === boundary._row || registeredAt > boundaryAt || (registeredAt === boundaryAt && row._row > boundary._row);
      if (!atOrAfterCapture || String(values[row._row - 2][0] || '').toUpperCase() === 'SI') return;
      values[row._row - 2][0] = 'SI';
      changes++;
    });
  });
  if (!changes) return;
  range.setValues(values);
  actions.push('Se actualizaron ' + changes + ' valor(es) de Captacion en INTERACCIONES.');
}

/** Clasifica filas antiguas usando la interacción de captación como frontera. */
function completeInteractionStages_(ss, actions) {
  var sheet = crmSheet_(ss, 'interactions');
  if (sheet.getLastRow() < 2) return;
  var headers = getHeaders_(sheet);
  var stageColumn = headers.indexOf('Etapa') + 1;
  if (!stageColumn) return;
  var interactions = crmObjects_(sheet);
  var grouped = {};
  interactions.forEach(function (row) {
    var prospectId = String(row.ProspectoID || '');
    if (!grouped[prospectId]) grouped[prospectId] = [];
    grouped[prospectId].push(row);
  });
  var range = sheet.getRange(2, stageColumn, sheet.getLastRow() - 1, 1);
  var values = range.getValues();
  var changes = 0;
  Object.keys(grouped).forEach(function (prospectId) {
    var rows = grouped[prospectId];
    var capturedRows = rows.filter(function (row) { return String(row.Captacion || '').toUpperCase() === 'SI'; });
    capturedRows.sort(function (a, b) { return dateMillis_(a.FechaHora) - dateMillis_(b.FechaHora) || a._row - b._row; });
    var captured = capturedRows[0] || null;
    var capturedAt = captured ? dateMillis_(captured.FechaHora) : 0;
    rows.forEach(function (row) {
      var index = row._row - 2;
      var current = String(values[index][0] || '').trim().toUpperCase();
      if (current === 'PROSPECTO' || current === 'NEGOCIACION' || current === 'CLIENTE') return;
      var registeredAt = dateMillis_(row.FechaHora);
      var afterCapture = captured && row._row !== captured._row && (registeredAt > capturedAt || (registeredAt === capturedAt && row._row > captured._row));
      values[index][0] = afterCapture ? 'NEGOCIACION' : 'PROSPECTO';
      changes++;
    });
  });
  if (!changes) return;
  range.setValues(values);
  actions.push('Se clasificaron ' + changes + ' interacción(es) entre HISTORIAL y NEGOCIACION.');
}

function crmInteractionPublic_(row, names) {
  return { id: String(row.ID || ''), prospectoId: String(row.ProspectoID || ''), agenteDni: String(row.AgenteDNI || ''), agenteNombre: names[String(row.AgenteDNI || '')] || '', fechaHoraContacto: apiDateValue_(row.FechaHoraContacto || row.FechaHora), fechaHora: apiDateValue_(row.FechaHora), tipo: String(row.Tipo || ''), resultado: String(row.Resultado || ''), comentario: String(row.Comentario || ''), proximoContacto: apiDateValue_(row.ProximoContacto), estadoCaptacion: String(row.EstadoCaptacion || ''), captacion: String(row.Captacion || 'NO').toUpperCase(), etapa: String(row.Etapa || 'PROSPECTO').toUpperCase() };
}

function crmClientPublic_(row, names, prospect) {
  prospect = prospect || {};
  // El módulo Clientes puede mostrar los datos, pero su fuente es PROSPECTOS.
  return { id: String(row.ID || ''), prospectoId: String(row.ProspectoID || ''), nombre: String(row.Nombre || ''), documento: String(row.Documento || ''), telefono: String(row.Telefono || ''), correo: String(row.Correo || ''), fechaNacimiento: apiDateValue_(prospect.FechaNacimiento || row.FechaNacimiento), profesion: String(prospect.Profesion || row.Profesion || ''), distrito: String(prospect.Distrito || row.Distrito || ''), direccion: String(prospect.Direccion || row.Direccion || ''), fechaCierre: apiDateValue_(row.FechaCierre), estado: String(row.Estado || ''), estadoCaptacion: String(row.EstadoCaptacion || ''), cierreVenta: apiDateValue_(row.CierreVenta), notas: String(prospect.Notas || row.Notas || ''), agenteDni: String(row.AgenteDNI || ''), agenteNombre: names[String(row.AgenteDNI || '')] || '' };
}

/**
 * CATALOGOS no tiene columna de código: la **Etiqueta** es a la vez lo que se ve
 * en los desplegables y lo que se guarda en PROSPECTOS o INTERACCIONES. Por eso
 * renombrar una opción arrastra los registros que la usaban (crmSaveCatalog_).
 *
 * La lista la mantiene la administración: a mano en la hoja o desde el módulo de
 * Catálogos. El código NUNCA siembra opciones de ejemplo ni "repara" la pestaña;
 * solo lee lo que hay y escribe cuando un administrador crea, edita o elimina
 * una opción desde la app.
 */
var CRM_CATALOG_TYPES = ['CANAL', 'ESTADO', 'RESULTADO', 'CAPTADO_RESULTADO', 'REUNION', 'CATEGORIA_AGENTE'];

/** Dónde vive cada tipo de catálogo dentro de los registros: lo usa el renombrado en cascada. */
var CRM_CATALOG_USAGE = {
  CANAL: [{ sheet: 'prospects', column: 'Canal' }],
  RESULTADO: [{ sheet: 'interactions', column: 'Resultado', stage: 'PROSPECTO' }],
  CAPTADO_RESULTADO: [{ sheet: 'interactions', column: 'Resultado', stage: 'NEGOCIACION' }],
  REUNION: [{ sheet: 'interactions', column: 'Tipo' }],
  CATEGORIA_AGENTE: [{ sheet: 'users', column: 'Categoria' }]
};

/**
 * Clave con la que se comparan dos etiquetas. Ignora mayúsculas, tildes, espacios
 * repetidos y guiones bajos, de modo que los registros guardados con la versión
 * anterior (`SIN_RESULTADO`, `PUERTA_PUERTA`) siguen encajando con su etiqueta
 * actual sin tener que tocar la hoja.
 */
function crmLabelKey_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Etiqueta lista para guardar: sin espacios sobrantes, pero respetando cómo la escribió el administrador. */
function crmLabelText_(value) { return crmText_(value, 80).replace(/\s+/g, ' '); }

/**
 * Acceso de solo lectura a la pestaña: no la crea, no añade cabeceras y no
 * escribe filas. Devuelve null si todavía no existe, y quien llama lo reporta.
 */
function crmCatalogSheet_(ss) {
  return ss.getSheetByName(CRM_SHEETS.catalogs.name);
}

/** Lee la pestaña CATALOGOS una sola vez; pásale el resultado a crmCatalogLabel_ para no repetir la lectura por cada campo. */
function crmCatalogRows_(ss) {
  var sheet = crmCatalogSheet_(ss);
  return sheet ? crmObjects_(sheet) : [];
}

/**
 * Resuelve un valor contra el catálogo y devuelve la etiqueta **tal como está en
 * la hoja**, que es la que se guarda. Devuelve '' si no existe o si está
 * desactivada, y quien llama lo trata como valor no válido.
 */
function crmCatalogLabel_(rows, type, value) {
  var key = crmLabelKey_(value);
  if (!key) return '';
  for (var index = 0; index < rows.length; index++) {
    var row = rows[index];
    if (String(row.Tipo).toUpperCase() !== type || String(row.Activo).toUpperCase() === 'NO') continue;
    if (crmLabelKey_(row.Etiqueta) === key) return crmLabelText_(row.Etiqueta);
  }
  return '';
}

/**
 * Valor con el que la app rellena un campo que llegó vacío: la etiqueta preferida
 * si el administrador la conserva y, si la renombró o la borró, la primera opción
 * activa de ese tipo por Orden.
 */
function crmDefaultLabel_(rows, type, preferred) {
  var preferredLabel = preferred ? crmCatalogLabel_(rows, type, preferred) : '';
  if (preferredLabel) return preferredLabel;
  var active = rows.filter(function (row) { return String(row.Tipo).toUpperCase() === type && String(row.Activo).toUpperCase() !== 'NO'; });
  active.sort(function (a, b) { return Number(a.Orden || 0) - Number(b.Orden || 0); });
  return active.length ? crmLabelText_(active[0].Etiqueta) : '';
}

/** Primera etiqueta viva de una lista de candidatas; '' si el catálogo no conserva ninguna. */
function crmAnyLabel_(rows, type, candidates) {
  for (var index = 0; index < candidates.length; index++) {
    var label = crmCatalogLabel_(rows, type, candidates[index]);
    if (label) return label;
  }
  return '';
}

function crmFindLabel_(rows, type, label) {
  var key = crmLabelKey_(label);
  for (var index = 0; index < rows.length; index++) {
    if (String(rows[index].Tipo).toUpperCase() === type && crmLabelKey_(rows[index].Etiqueta) === key) return rows[index];
  }
  return null;
}

/**
 * Renombrar una opción cambia el valor guardado en todos los registros que la
 * usaban: sin columna de código, la etiqueta es la única referencia, y dejarlos
 * atrás los sacaría de los filtros y del embudo. Devuelve cuántas celdas cambió.
 */
function crmRenameCatalogValue_(ss, type, before, after) {
  var key = crmLabelKey_(before);
  var updated = 0;
  (CRM_CATALOG_USAGE[type] || []).forEach(function (usage) {
    var sheet = usage.sheet === 'users' ? getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS) : crmSheet_(ss, usage.sheet);
    if (sheet.getLastRow() < 2) return;
    var column = getHeaders_(sheet).indexOf(usage.column) + 1;
    if (!column) return;
    var range = sheet.getRange(2, column, sheet.getLastRow() - 1, 1);
    var values = range.getValues();
    var stageColumn = getHeaders_(sheet).indexOf('Etapa') + 1;
    var stages = usage.stage && stageColumn ? sheet.getRange(2, stageColumn, sheet.getLastRow() - 1, 1).getValues() : [];
    var changed = false;
    values.forEach(function (row, index) {
      var stage = stages.length ? String(stages[index][0] || 'PROSPECTO').toUpperCase() : '';
      var correctStage = !usage.stage || (usage.stage === 'PROSPECTO' ? stage !== 'NEGOCIACION' : stage === usage.stage);
      if (correctStage && crmLabelKey_(row[0]) === key) { row[0] = after; changed = true; updated++; }
    });
    if (changed) range.setValues(values);
  });
  return updated;
}

function crmListCatalogs_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message);
  var rows = crmCatalogRows_(ss);
  if (!crmIsAdmin_(actor)) rows = rows.filter(function (row) { return String(row.Activo).toUpperCase() !== 'NO'; });
  // Una etiqueta por tipo: si la hoja trae la misma repetida, dos opciones idénticas serían indistinguibles en el desplegable y en la lista.
  var seen = {};
  var result = [];
  rows.forEach(function (row) {
    var tipo = String(row.Tipo).toUpperCase(); var key = crmLabelKey_(row.Etiqueta);
    if (!key || CRM_CATALOG_TYPES.indexOf(tipo) === -1 || seen[tipo + '|' + key]) return;
    seen[tipo + '|' + key] = true;
    result.push({ tipo: tipo, etiqueta: crmLabelText_(row.Etiqueta), orden: Number(row.Orden || 0), activo: String(row.Activo).toUpperCase() !== 'NO' });
  });
  result.sort(function (a, b) { return a.tipo.localeCompare(b.tipo) || a.orden - b.orden; });
  return crmResponse_(result);
}

/**
 * Alta y edición de una opción. `etiquetaAnterior` identifica la fila que se está
 * editando; si la etiqueta cambia, el nuevo texto se propaga a los registros
 * históricos antes de responder.
 */
function crmSaveCatalog_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); if (!crmIsAdmin_(actor)) return crmError_('Solo un administrador puede modificar catálogos.');
  var item = data.item || {}; var type = crmText_(item.tipo, 20).toUpperCase(); var label = crmLabelText_(item.etiqueta); var previous = crmLabelText_(item.etiquetaAnterior);
  if (CRM_CATALOG_TYPES.indexOf(type) === -1 || !crmLabelKey_(label)) return crmError_('Los datos del catálogo no son válidos.');
  var sheet = crmCatalogSheet_(ss); if (!sheet) return crmError_('La pestaña CATALOGOS no existe en la hoja de cálculo.');
  var rows = crmObjects_(sheet);
  var found = previous ? crmFindLabel_(rows, type, previous) : null;
  if (previous && !found) return crmError_('La opción que intentas editar ya no existe.');
  var duplicate = crmFindLabel_(rows, type, label);
  if (duplicate && (!found || duplicate._row !== found._row)) return crmError_('Ya existe una opción con esa etiqueta.');
  // Al editar se parte de la fila tal cual está para no vaciar columnas que la
  // administración haya añadido por su cuenta a la pestaña.
  var record = found ? found : {};
  var before = found ? crmLabelText_(found.Etiqueta) : '';
  record.Tipo = type; record.Etiqueta = label; record.Orden = Math.max(1, Number(item.orden || 1)); record.Activo = item.activo === false ? 'NO' : 'SI';
  crmWriteRow_(sheet, found ? found._row : 0, record);
  var renamed = found && crmLabelKey_(before) !== crmLabelKey_(label) ? crmRenameCatalogValue_(ss, type, before, label) : 0;
  crmAudit_(ss, actor, found ? 'EDITAR' : 'CREAR', 'CATALOGO', type + ':' + label, renamed ? 'Renombrada desde "' + before + '" en ' + renamed + ' registro(s)' : label);
  return crmResponse_({ tipo: type, etiqueta: label, orden: record.Orden, activo: record.Activo === 'SI', renombrados: renamed });
}

/** Cuántos registros vivos usan una etiqueta de catálogo. */
function crmCatalogUsage_(ss, type, label) {
  var key = crmLabelKey_(label);
  var total = 0;
  (CRM_CATALOG_USAGE[type] || []).forEach(function (usage) {
    var sheet = usage.sheet === 'users' ? getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS) : crmSheet_(ss, usage.sheet);
    if (sheet.getLastRow() < 2) return;
    var column = getHeaders_(sheet).indexOf(usage.column) + 1;
    if (!column) return;
    var values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();
    var stageColumn = getHeaders_(sheet).indexOf('Etapa') + 1;
    var stages = usage.stage && stageColumn ? sheet.getRange(2, stageColumn, sheet.getLastRow() - 1, 1).getValues() : [];
    values.forEach(function (row, index) {
      var stage = stages.length ? String(stages[index][0] || 'PROSPECTO').toUpperCase() : '';
      var correctStage = !usage.stage || (usage.stage === 'PROSPECTO' ? stage !== 'NEGOCIACION' : stage === usage.stage);
      if (correctStage && crmLabelKey_(row[0]) === key) total++;
    });
  });
  return total;
}

/**
 * Borra la fila de una opción. Si algún prospecto o interacción todavía la usa,
 * la primera llamada no borra nada: responde con `uso` para que la app avise de
 * cuántos registros quedarían con un valor fuera del catálogo. Solo se elimina
 * cuando el administrador insiste con `forzar`.
 */
function crmDeleteCatalog_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); if (!crmIsAdmin_(actor)) return crmError_('Solo un administrador puede modificar catálogos.');
  var type = crmText_(data.tipo, 20).toUpperCase(); var label = crmLabelText_(data.etiqueta);
  if (CRM_CATALOG_TYPES.indexOf(type) === -1 || !crmLabelKey_(label)) return crmError_('Los datos del catálogo no son válidos.');
  var sheet = crmCatalogSheet_(ss); if (!sheet) return crmError_('La pestaña CATALOGOS no existe en la hoja de cálculo.');
  var found = crmFindLabel_(crmObjects_(sheet), type, label);
  if (!found) return crmError_('La opción que intentas eliminar ya no existe.');
  var stored = crmLabelText_(found.Etiqueta);
  var usage = crmCatalogUsage_(ss, type, stored);
  if (usage && data.forzar !== true) return crmResponse_({ eliminado: false, uso: usage, tipo: type, etiqueta: stored });
  sheet.deleteRow(found._row);
  crmAudit_(ss, actor, 'ELIMINAR', 'CATALOGO', type + ':' + stored, usage ? 'Eliminada aunque la usaban ' + usage + ' registro(s)' : stored);
  return crmResponse_({ eliminado: true, uso: usage, tipo: type, etiqueta: stored });
}

function crmFilteredProspects_(ss, actor, filters, latestInteractions) {
  var rows = crmObjects_(crmSheet_(ss, 'prospects')).filter(function (row) { return crmCanAccess_(actor, row); });
  filters = filters || {};
  latestInteractions = latestInteractions || crmLatestInteractionsByProspect_(ss);
  if (filters.canal) rows = rows.filter(function (row) { return String(row.Canal) === String(filters.canal); });
  if (filters.etapa) rows = rows.filter(function (row) { var latest = latestInteractions[String(row.ID || '')]; var stage = row.ClienteID ? 'CLIENTE' : String((latest && latest.Etapa) || 'PROSPECTO').toUpperCase(); return stage === String(filters.etapa).toUpperCase(); });
  if (filters.resultado) rows = rows.filter(function (row) { var latest = latestInteractions[String(row.ID || '')]; return String((latest && latest.Resultado) || '') === String(filters.resultado); });
  if (filters.captado) rows = rows.filter(function (row) { return (crmProspectCaptured_(row) ? 'SI' : 'NO') === String(filters.captado).toUpperCase(); });
  if (filters.agente && crmIsAdmin_(actor)) rows = rows.filter(function (row) { return String(row.AgenteDNI) === String(filters.agente); });
  if (filters.from) rows = rows.filter(function (row) { return dateKey_(row.FechaCreacion) >= String(filters.from); });
  if (filters.to) rows = rows.filter(function (row) { return dateKey_(row.FechaCreacion) <= String(filters.to); });
  return rows;
}

function crmListProspects_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message);
  var names = crmUserNames_(ss); var latestInteractions = crmLatestInteractionsByProspect_(ss); var rows = crmFilteredProspects_(ss, actor, data.filters, latestInteractions);
  rows.sort(function (a, b) { return dateMillis_(b.FechaActualizacion) - dateMillis_(a.FechaActualizacion); });
  return crmResponse_(rows.map(function (row) { return crmProspectPublic_(row, names, latestInteractions[String(row.ID || '')]); }));
}

function crmGetProspect_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message);
  var prospect = crmFind_(crmObjects_(crmSheet_(ss, 'prospects')), 'ID', crmText_(data.id, 50)); var denied = crmRequireAccess_(actor, prospect); if (denied) return crmError_(denied);
  var names = crmUserNames_(ss); var interactions = crmObjects_(crmSheet_(ss, 'interactions')).filter(function (row) { return String(row.ProspectoID) === String(prospect.ID); });
  interactions.sort(function (a, b) { return dateMillis_(b.FechaHoraContacto || b.FechaHora) - dateMillis_(a.FechaHoraContacto || a.FechaHora); });
  return crmResponse_({ prospect: crmProspectPublic_(prospect, names, interactions[0]), interactions: interactions.map(function (row) { return crmInteractionPublic_(row, names); }) });
}

function crmActiveAgent_(ss, dni) {
  var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS); var headers = getHeaders_(sheet); var row = findRowByDni_(sheet, dni, headers); if (!row) return false;
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0]; return getValidEstado_(valueAt_(values, headers, 'Estado')) === 'ACTIVO';
}

function crmSaveProspect_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); var input = data.prospect || {};
  var name = crmText_(input.nombre, 120); var phone = crmText_(input.telefono, 30); var email = crmText_(input.correo, 120);
  if (!name || !phone) return crmError_('Nombre y teléfono son obligatorios.'); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return crmError_('El correo no es válido.');
  var customFields = crmCustomFieldsInput_(input.camposPersonalizados); if (!customFields.ok) return crmError_(customFields.message);
  var sheet = crmSheet_(ss, 'prospects'); var id = crmText_(input.id, 50); var found = id ? crmFind_(crmObjects_(sheet), 'ID', id) : null; if (id && !found) return crmError_('El prospecto ya no existe.');
  if (found && !crmCanAccess_(actor, found)) return crmError_('No tienes permiso para editar este prospecto.');
  var catalogRows = crmCatalogRows_(ss);
  var channel = crmCatalogLabel_(catalogRows, 'CANAL', input.canal);
  // Un catálogo desactivado no debe impedir guardar otros cambios de una ficha
  // antigua mientras el usuario conserve exactamente su canal actual.
  if (!channel && found && crmLabelKey_(input.canal) === crmLabelKey_(found.Canal)) channel = String(found.Canal || '');
  if (!channel) return crmError_('Selecciona un canal activo del catálogo.');
  var agent = found ? String(found.AgenteDNI) : actor.dni; if (crmIsAdmin_(actor) && crmText_(input.agenteDni, 12)) agent = crmText_(input.agenteDni, 12); if (!crmActiveAgent_(ss, agent)) return crmError_('El agente asignado no existe o está cesado.');
  var now = new Date(); var record = found || {};
  record.ID = found ? found.ID : crmId_('PRO'); record.Nombre = name; record.Documento = crmText_(input.documento, 20); record.Telefono = phone; record.Correo = email;
  record.Canal = channel; record.AgenteDNI = agent; record.Observaciones = crmText_(input.observaciones, 2000);
  if (found) {
    CRM_CAPTURE_FIELDS.forEach(function (field) {
      var key = field.charAt(0).toLowerCase() + field.slice(1);
      if (input[key] !== undefined) record[field] = crmText_(input[key], field === 'Notas' ? 2000 : field === 'Direccion' ? 300 : 150);
    });
    if (crmProspectCaptured_(found)) {
      var requiredCaptured = [record.FechaNacimiento, record.Profesion, record.Distrito, record.Direccion];
      if (requiredCaptured.some(function (value) { return !crmText_(value, 300); })) return crmError_('Completa todos los campos obligatorios del usuario captado.');
    }
  }
  if (!found || customFields.present) record.JSON = JSON.stringify(customFields.items);
  record.FechaCreacion = found ? found.FechaCreacion : now; record.FechaActualizacion = now;
  if (!found) { record.ClienteID = ''; record.Captado = 'NO'; }
  crmWriteRow_(sheet, found ? found._row : 0, record);
  // Si la captación ya se convirtió en cliente, conserva sincronizados los
  // datos compartidos para que ambas vistas muestren la misma información.
  if (record.ClienteID) {
    var clientSheet = crmSheet_(ss, 'clients'); var linkedClient = crmFind_(crmObjects_(clientSheet), 'ID', String(record.ClienteID));
    if (linkedClient) {
      linkedClient.Nombre = record.Nombre; linkedClient.Documento = record.Documento; linkedClient.Telefono = record.Telefono; linkedClient.Correo = record.Correo; linkedClient.AgenteDNI = record.AgenteDNI;
      crmWriteRow_(clientSheet, linkedClient._row, linkedClient);
    }
  }
  crmAudit_(ss, actor, found ? 'EDITAR' : 'CREAR', 'PROSPECTO', record.ID, record.Nombre);
  var latestInteraction = crmLatestInteractionsByProspect_(ss)[String(record.ID || '')];
  return crmResponse_(crmProspectPublic_(record, crmUserNames_(ss), latestInteraction));
}

function crmAddInteraction_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); var input = data.interaction || {};
  var prospectSheet = crmSheet_(ss, 'prospects'); var prospect = crmFind_(crmObjects_(prospectSheet), 'ID', crmText_(input.prospectoId, 50)); var denied = crmRequireAccess_(actor, prospect); if (denied) return crmError_(denied);
  var interactionId = crmText_(input.requestId, 50) || crmId_('INT');
  var interactionSheet = crmSheet_(ss, 'interactions');
  var operationLock = LockService.getScriptLock(); operationLock.waitLock(10000);
  try {
  // Si el navegador perdió la respuesta de una escritura ya completada,
  // devuelve esa misma fila. Así reintentar nunca crea una interacción doble.
  var interactionRows = crmObjects_(interactionSheet);
  var existing = crmFind_(interactionRows, 'ID', interactionId);
  if (existing) {
    if (String(existing.ProspectoID || '') !== String(prospect.ID || '')) return crmError_('El identificador de la interacción ya está en uso.');
    var existingNames = crmUserNames_(ss);
    var currentLatest = crmLatestInteractionsByProspect_(ss, interactionRows)[String(prospect.ID || '')] || existing;
    return crmResponse_({ prospect: crmProspectPublic_(prospect, existingNames, currentLatest), interaction: crmInteractionPublic_(existing, existingNames) });
  }
  if (prospect.ClienteID) return crmError_('El prospecto ya es cliente y su etapa comercial está cerrada.');
  var comment = crmText_(input.comentario, 2000); if (!comment) return crmError_('El comentario es obligatorio.');
  var catalogRows = crmCatalogRows_(ss);
  // Las captaciones quedan cerradas como CLIENTE; las interacciones solo
  // pertenecen a prospectos activos, por lo que no existe una etapa intermedia.
  var captured = false;
  var resultCatalog = 'RESULTADO';
  var type = input.tipoManual ? crmText_(input.tipo, 80).toUpperCase() : crmCatalogLabel_(catalogRows, 'REUNION', input.tipo); var result = crmCatalogLabel_(catalogRows, resultCatalog, input.resultado);
  if (input.tipoManual && (!type || type === 'OTRO')) return crmError_('Escribe un medio de contacto válido.');
  if (!type || !result) return crmError_('La interacción contiene valores de catálogo no válidos.');
  var captureClosed = crmLabelKey_(result) === 'CAPTACION CERRADA';
  var captureState = crmText_(input.estadoCaptacion, 80);
  var allowedCaptureStates = ['EN PRECIO', 'HASTA 20% SOBRE PRECIO', 'SOBREPRECIO', 'DESISTIÓ'];
  if (captureClosed) {
    var captureStateValid = allowedCaptureStates.some(function (item) { return crmLabelKey_(item) === crmLabelKey_(captureState); });
    if (!captureStateValid) return crmError_('Selecciona el estado de captación.');
    captureState = allowedCaptureStates.filter(function (item) { return crmLabelKey_(item) === crmLabelKey_(captureState); })[0];
  } else captureState = '';
  var now = new Date(); var contactDateText = crmText_(input.fechaHoraContacto, 40); var contactDate = contactDateText ? parseSheetDate_(contactDateText) : now;
  if (!contactDate) return crmError_('La fecha y hora de contacto no es válida.');
  // Desistió cierra el prospecto en la misma fila que registra el contacto.
  // No hay una segunda actualización de etapa, así ambas acciones quedan sincronizadas.
  var isCaptureWithdrawal = captureClosed && crmLabelKey_(captureState) === 'DESISTIO';
  var interaction = { ID: interactionId, ProspectoID: prospect.ID, AgenteDNI: actor.dni, FechaHoraContacto: contactDate, FechaHora: now, Tipo: type, Resultado: result, Comentario: comment, ProximoContacto: crmText_(input.proximoContacto, 40), Captacion: 'NO', EstadoCaptacion: captureState, Etapa: isCaptureWithdrawal ? 'NO CONTINUA' : 'PROSPECTO' };
  crmWriteRow_(interactionSheet, 0, interaction); prospect.FechaActualizacion = now; crmWriteRow_(prospectSheet, prospect._row, prospect);
  crmAudit_(ss, actor, 'REGISTRAR', 'INTERACCION', interaction.ID, 'Prospecto ' + prospect.ID + (isCaptureWithdrawal ? ': cerrado como NO CONTINUA por desistimiento.' : ''));
  // La interacción recién registrada ya está en memoria: no se fuerza flush ni
  // se vuelve a leer completa la pestaña INTERACCIONES antes de responder.
  var names = crmUserNames_(ss);
  return crmResponse_({ prospect: crmProspectPublic_(prospect, names, interaction), interaction: crmInteractionPublic_(interaction, names) });
  } finally { operationLock.releaseLock(); }
}

/** Reprograma solo la última interacción y conserva sin cambios el historial anterior. */
function crmRescheduleInteraction_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message);
  var interactionId = crmText_(data.interactionId, 50); var nextText = crmText_(data.proximoContacto, 40);
  if (!interactionId || !nextText) return crmError_('Indica la interacción y la nueva fecha de programación.');
  var interactionSheet = crmSheet_(ss, 'interactions'); var interaction = crmFind_(crmObjects_(interactionSheet), 'ID', interactionId);
  if (!interaction) return crmError_('La interacción ya no existe.');
  var prospectSheet = crmSheet_(ss, 'prospects'); var prospect = crmFind_(crmObjects_(prospectSheet), 'ID', String(interaction.ProspectoID || '')); var denied = crmRequireAccess_(actor, prospect); if (denied) return crmError_(denied);
  var interactions = crmObjects_(interactionSheet).filter(function (row) { return String(row.ProspectoID || '') === String(prospect.ID || ''); });
  interactions.sort(function (a, b) { return dateMillis_(b.FechaHoraContacto || b.FechaHora) - dateMillis_(a.FechaHoraContacto || a.FechaHora); });
  if (!interactions.length || String(interactions[0].ID || '') !== interactionId) return crmError_('Solo puedes cambiar la programación de la última interacción.');
  if (!crmText_(interaction.ProximoContacto, 40)) return crmError_('La última interacción no tiene una programación para modificar.');
  var next = parseSheetDate_(nextText); if (!next) return crmError_('La nueva fecha y hora no es válida.');
  interaction.ProximoContacto = next; crmWriteRow_(interactionSheet, interaction._row, interaction);
  prospect.FechaActualizacion = new Date(); crmWriteRow_(prospectSheet, prospect._row, prospect);
  crmAudit_(ss, actor, 'REPROGRAMAR', 'INTERACCION', interaction.ID, 'Prospecto ' + prospect.ID + ': ' + nextText);
  var names = crmUserNames_(ss);
  return crmResponse_({ prospect: crmProspectPublic_(prospect, names, interaction), interaction: crmInteractionPublic_(interaction, names) });
}

function crmConvertProspect_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); var prospectSheet = crmSheet_(ss, 'prospects'); var prospect = crmFind_(crmObjects_(prospectSheet), 'ID', crmText_(data.id, 50)); var denied = crmRequireAccess_(actor, prospect); if (denied) return crmError_(denied);
  var latestCaptureInteraction = crmLatestInteractionsByProspect_(ss)[String(prospect.ID || '')] || null;
  if (!latestCaptureInteraction) return crmError_('Registra al menos una interacción antes de captar al prospecto.');
  if (String(latestCaptureInteraction.Etapa || '').toUpperCase() === 'NO CONTINUA' || crmLabelKey_(latestCaptureInteraction.EstadoCaptacion) === 'DESISTIO') return crmError_('El prospecto desistió en la última interacción y no puede captarse.');
  var details = data.details || {};
  var customFields = crmCustomFieldsInput_(details.camposPersonalizados); if (!customFields.ok) return crmError_(customFields.message);
  var requiredCapture = [details.fechaNacimiento, details.profesion, details.distrito, details.direccion];
  if (requiredCapture.some(function (value) { return !crmText_(value, 300); })) return crmError_('Completa todos los campos obligatorios de la captación.');
  var now = new Date();
  // La información adicional del modal se guarda en la misma fila de PROSPECTOS.
  prospect.FechaNacimiento = crmText_(details.fechaNacimiento, 20) || prospect.FechaNacimiento;
  prospect.Profesion = crmText_(details.profesion, 150) || prospect.Profesion;
  prospect.Distrito = crmText_(details.distrito, 150) || prospect.Distrito;
  prospect.Direccion = crmText_(details.direccion, 300) || prospect.Direccion;
  prospect.Notas = crmText_(details.notas, 2000) || prospect.Notas;
  if (customFields.present) prospect.JSON = JSON.stringify(customFields.items);
  // Una captación es un cierre comercial: crea (o actualiza) su cliente en la
  // misma operación. La búsqueda por ProspectoID evita duplicados al reintentar.
  prospect.Captado = 'SI';
  var clientLock = LockService.getScriptLock();
  clientLock.waitLock(10000);
  try {
  var clientSheet = crmSheet_(ss, 'clients'); var clients = crmObjects_(clientSheet);
  var client = prospect.ClienteID ? crmFind_(clients, 'ID', prospect.ClienteID) : null;
  if (!client) client = crmFind_(clients, 'ProspectoID', prospect.ID);
  var sameDocument = !client && prospect.Documento ? crmFind_(clients, 'Documento', prospect.Documento) : null;
  if (sameDocument && String(sameDocument.ProspectoID || '') !== String(prospect.ID)) return crmError_('Ya existe otro cliente con el mismo documento.');
  if (sameDocument) client = sameDocument;
  var record = client || { ID: crmId_('CLI'), ProspectoID: prospect.ID, FechaCierre: now, Estado: 'ACTIVO' };
  record.ProspectoID = prospect.ID; record.Nombre = prospect.Nombre; record.Documento = prospect.Documento; record.Telefono = prospect.Telefono; record.Correo = prospect.Correo; record.AgenteDNI = prospect.AgenteDNI;
  record.EstadoCaptacion = crmText_(latestCaptureInteraction && latestCaptureInteraction.EstadoCaptacion, 80);
  if (!record.FechaCierre) record.FechaCierre = now; if (!record.Estado) record.Estado = 'ACTIVO';
  crmWriteRow_(clientSheet, client ? client._row : 0, record);
  prospect.ClienteID = record.ID;
  prospect.FechaActualizacion = now; crmWriteRow_(prospectSheet, prospect._row, prospect);
  } finally {
  clientLock.releaseLock();
  }
  var capturedInteraction = crmMarkLatestInteractionAsClient_(ss, prospect.ID);
  crmAudit_(ss, actor, 'CAPTAR', 'PROSPECTO', prospect.ID, prospect.Nombre); var names = crmUserNames_(ss);
  var latestInteraction = crmLatestInteractionsByProspect_(ss)[String(prospect.ID || '')];
  return crmResponse_({ prospect: crmProspectPublic_(prospect, names, latestInteraction), client: crmClientPublic_(record, names, prospect), capturedInteraction: capturedInteraction ? crmInteractionPublic_(capturedInteraction, names) : null });
}

/** Segunda etapa: solo un usuario ya captado puede generar una fila en CLIENTES. */
function crmConvertProspectToClient_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return crmError_('Hay otra conversión en proceso. Inténtalo nuevamente.');
  try {
    var prospectSheet = crmSheet_(ss, 'prospects'); var prospect = crmFind_(crmObjects_(prospectSheet), 'ID', crmText_(data.id, 50)); var denied = crmRequireAccess_(actor, prospect); if (denied) return crmError_(denied);
    if (!crmProspectCaptured_(prospect)) return crmError_('Primero debes convertir el prospecto en usuario captado.');
    var currentStage = String((crmLatestInteractionsByProspect_(ss)[String(prospect.ID || '')] || {}).Etapa || '').toUpperCase();
    if (currentStage === 'NO CONTINUA') return crmError_('El prospecto está cerrado como NO CONTINUA.');

    var clientSheet = crmSheet_(ss, 'clients'); var clients = crmObjects_(clientSheet);
    var client = prospect.ClienteID ? crmFind_(clients, 'ID', prospect.ClienteID) : null;
    if (!client) client = crmFind_(clients, 'ProspectoID', prospect.ID);
    var sameDocument = !client && prospect.Documento ? crmFind_(clients, 'Documento', prospect.Documento) : null;
    if (sameDocument && String(sameDocument.ProspectoID || '') !== String(prospect.ID)) return crmError_('Ya existe otro cliente con el mismo documento.');
    if (sameDocument) client = sameDocument;

    var now = new Date(); var latestCaptureInteraction = crmLatestInteractionsByProspect_(ss)[String(prospect.ID || '')] || null; var record = client || { ID: crmId_('CLI'), ProspectoID: prospect.ID, FechaCierre: now, Estado: 'ACTIVO' };
    record.ProspectoID = prospect.ID; record.Nombre = prospect.Nombre; record.Documento = prospect.Documento; record.Telefono = prospect.Telefono; record.Correo = prospect.Correo; record.AgenteDNI = prospect.AgenteDNI;
    record.EstadoCaptacion = crmText_(latestCaptureInteraction && latestCaptureInteraction.EstadoCaptacion, 80);
    if (!record.FechaCierre) record.FechaCierre = now; if (!record.Estado) record.Estado = 'ACTIVO';
    crmWriteRow_(clientSheet, client ? client._row : 0, record);
    prospect.ClienteID = record.ID; prospect.Captado = 'SI'; prospect.FechaActualizacion = now; crmWriteRow_(prospectSheet, prospect._row, prospect);

    var latestInteraction = crmMarkLatestInteractionAsClient_(ss, prospect.ID);
    crmAudit_(ss, actor, 'CONVERTIR', 'PROSPECTO', prospect.ID, 'Cliente ' + record.ID); var names = crmUserNames_(ss);
    return crmResponse_({ prospect: crmProspectPublic_(prospect, names, latestInteraction), client: crmClientPublic_(record, names, prospect), clientInteraction: latestInteraction ? crmInteractionPublic_(latestInteraction, names) : null });
  } finally {
    lock.releaseLock();
  }
}

function crmSetProspectStage_(ss, data, targetStage) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message);
  var prospectSheet = crmSheet_(ss, 'prospects');
  var prospect = crmFind_(crmObjects_(prospectSheet), 'ID', crmText_(data.id, 50));
  var denied = crmRequireAccess_(actor, prospect); if (denied) return crmError_(denied);
  if (prospect.ClienteID) return crmError_('El prospecto ya es cliente y su etapa comercial está cerrada.');

  var interactionSheet = crmSheet_(ss, 'interactions');
  var latest = crmLatestInteractionsByProspect_(ss)[String(prospect.ID || '')];
  if (!latest) return crmError_('El prospecto no tiene una interacción para actualizar.');
  var currentStage = String(latest.Etapa || '').toUpperCase();
  if (targetStage === 'PROSPECTO' && currentStage !== 'NO CONTINUA') return crmError_('Solo una etapa NO CONTINUA puede regresar a PROSPECTO.');
  var stageColumn = getHeaders_(interactionSheet).indexOf('Etapa') + 1;
  if (!stageColumn) return crmError_('La columna Etapa no existe en INTERACCIONES. Ejecuta Actualizar().');
  if (currentStage !== targetStage) interactionSheet.getRange(latest._row, stageColumn).setValue(targetStage);
  latest.Etapa = targetStage;
  prospect.FechaActualizacion = new Date(); crmWriteRow_(prospectSheet, prospect._row, prospect);
  crmAudit_(ss, actor, 'EDITAR', 'PROSPECTO', prospect.ID, 'Etapa ' + targetStage);
  var names = crmUserNames_(ss);
  return crmResponse_({ prospect: crmProspectPublic_(prospect, names, latest), interaction: crmInteractionPublic_(latest, names) });
}

/** Cierra el ciclo comercial de un usuario captado sin convertirlo en cliente. */
function crmMarkProspectNoContinue_(ss, data) { return crmSetProspectStage_(ss, data, 'NO CONTINUA'); }

/** Reabre como prospecto un ciclo comercial cerrado previamente. */
function crmRestoreProspectStage_(ss, data) { return crmSetProspectStage_(ss, data, 'PROSPECTO'); }

function crmReassignProspect_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); if (!crmIsAdmin_(actor)) return crmError_('Solo un administrador puede reasignar prospectos.');
  var sheet = crmSheet_(ss, 'prospects'); var prospect = crmFind_(crmObjects_(sheet), 'ID', crmText_(data.id, 50)); if (!prospect) return crmError_('El prospecto no existe.'); var target = crmText_(data.agentDni, 12); if (!crmActiveAgent_(ss, target)) return crmError_('El agente destino no existe o está cesado.');
  var previous = String(prospect.AgenteDNI); prospect.AgenteDNI = target; prospect.FechaActualizacion = new Date(); crmWriteRow_(sheet, prospect._row, prospect); crmAudit_(ss, actor, 'REASIGNAR', 'PROSPECTO', prospect.ID, previous + ' → ' + target);
  var latestInteraction = crmLatestInteractionsByProspect_(ss)[String(prospect.ID || '')];
  return crmResponse_(crmProspectPublic_(prospect, crmUserNames_(ss), latestInteraction));
}

function crmListClients_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); var names = crmUserNames_(ss); var rows = crmObjects_(crmSheet_(ss, 'clients')).filter(function (row) { return crmCanAccess_(actor, row); });
  var prospectsById = {}; crmObjects_(crmSheet_(ss, 'prospects')).forEach(function (row) { prospectsById[String(row.ID || '')] = row; });
  rows.sort(function (a, b) { return dateMillis_(b.FechaCierre) - dateMillis_(a.FechaCierre); }); return crmResponse_(rows.map(function (row) { return crmClientPublic_(row, names, prospectsById[String(row.ProspectoID || '')]); }));
}

function crmGetClient_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message);
  var client = crmFind_(crmObjects_(crmSheet_(ss, 'clients')), 'ID', crmText_(data.id, 50));
  var denied = crmRequireAccess_(actor, client); if (denied) return crmError_(denied);
  var prospect = client.ProspectoID ? crmFind_(crmObjects_(crmSheet_(ss, 'prospects')), 'ID', client.ProspectoID) : null;
  return crmResponse_(crmClientPublic_(client, crmUserNames_(ss), prospect));
}

function crmSaveClient_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); var input = data.client || {}; var sheet = crmSheet_(ss, 'clients'); var client = crmFind_(crmObjects_(sheet), 'ID', crmText_(input.id, 50)); var denied = crmRequireAccess_(actor, client); if (denied) return crmError_(denied);
  ['Nombre', 'Documento', 'Telefono', 'Correo', 'Estado'].forEach(function (field) { var key = field.charAt(0).toLowerCase() + field.slice(1); if (input[key] !== undefined) client[field] = crmText_(input[key], 150); });
  if (input.cierreVenta !== undefined) {
    var cierreVenta = crmText_(input.cierreVenta, 10);
    var fechaCierreVenta = parseSheetDate_(cierreVenta);
    if (cierreVenta && (!/^\d{4}-\d{2}-\d{2}$/.test(cierreVenta) || !fechaCierreVenta || Utilities.formatDate(fechaCierreVenta, Session.getScriptTimeZone(), 'yyyy-MM-dd') !== cierreVenta)) return crmError_('El cierre de venta debe ser una fecha válida.');
    var fechaCaptacion = crmCaptureDateForProspect_(ss, client.ProspectoID);
    if (fechaCierreVenta && fechaCaptacion && dateKey_(fechaCierreVenta) <= dateKey_(fechaCaptacion)) return crmError_('La fecha de cierre de venta debe ser posterior a la fecha de captación.');
    client.CierreVenta = fechaCierreVenta || '';
  }
  var prospectSheet = crmSheet_(ss, 'prospects'); var prospect = crmFind_(crmObjects_(prospectSheet), 'ID', client.ProspectoID);
  if (prospect) {
    CRM_CAPTURE_FIELDS.forEach(function (field) { var key = field.charAt(0).toLowerCase() + field.slice(1); if (input[key] !== undefined) prospect[field] = crmText_(input[key], field === 'Notas' ? 2000 : field === 'Direccion' ? 300 : 150); });
    prospect.FechaActualizacion = new Date(); crmWriteRow_(prospectSheet, prospect._row, prospect);
  }
  if (!client.Nombre || !client.Telefono) return crmError_('Nombre y teléfono son obligatorios.'); crmWriteRow_(sheet, client._row, client); crmAudit_(ss, actor, 'EDITAR', 'CLIENTE', client.ID, client.Nombre); return crmResponse_(crmClientPublic_(client, crmUserNames_(ss), prospect));
}

/** Cuántos días de la serie diaria de interacciones se devuelven como máximo, para que el gráfico siga siendo legible con historiales largos. */
var CRM_DASHBOARD_SERIES_DAYS = 30;
/** Evita recalcular y releer cinco pestañas al repetir un rango de fechas. */
// La versión cambia con cada escritura relevante, así que una vida mayor evita
// releer las hojas al alternar filtros sin sacrificar actualización de datos.
var CRM_DASHBOARD_CACHE_SECONDS = 1800;
var CRM_DASHBOARD_CACHE_VERSION_PROPERTY = 'CRM_DASHBOARD_CACHE_VERSION';
var CRM_DASHBOARD_CACHE_SCHEMA = 'v7-sales-by-client-close';

function crmDashboardCacheVersion_() {
  return PropertiesService.getScriptProperties().getProperty(CRM_DASHBOARD_CACHE_VERSION_PROPERTY) || '1';
}

function crmInvalidateDashboardCache_() {
  PropertiesService.getScriptProperties().setProperty(CRM_DASHBOARD_CACHE_VERSION_PROPERTY, String(new Date().getTime()) + '-' + Utilities.getUuid().slice(0, 8));
}

function crmDashboardCacheKey_(actor, filters) {
  return ['crm-dashboard', CRM_DASHBOARD_CACHE_SCHEMA, crmDashboardCacheVersion_(), actor.dni, actor.tipo, filters.from || '*', filters.to || '*', filters.agentDni || '*'].join('|');
}

function crmDashboardSource_(ss) {
  var version = crmDashboardCacheVersion_();
  var sourceKey = 'crm-dashboard-source|' + CRM_DASHBOARD_CACHE_SCHEMA + '|' + version;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(sourceKey);
  if (cached) {
    try {
      var bytes = Utilities.base64Decode(cached);
      return JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes)).getDataAsString());
    } catch (ignored) { /* reconstruir si Apps Script expulsó o truncó la entrada */ }
  }
  var source = {
    interactions: crmObjects_(crmSheet_(ss, 'interactions')).map(function (row) {
      return { ProspectoID: String(row.ProspectoID || ''), AgenteDNI: String(row.AgenteDNI || ''), FechaHoraContacto: apiDateValue_(row.FechaHoraContacto), FechaHora: apiDateValue_(row.FechaHora), Resultado: String(row.Resultado || ''), ProximoContacto: apiDateValue_(row.ProximoContacto), Etapa: String(row.Etapa || '') };
    }),
    prospects: crmObjects_(crmSheet_(ss, 'prospects')).map(function (row) {
      return { ID: String(row.ID || ''), Nombre: String(row.Nombre || ''), Telefono: String(row.Telefono || ''), Canal: String(row.Canal || ''), AgenteDNI: String(row.AgenteDNI || ''), FechaCreacion: apiDateValue_(row.FechaCreacion), FechaActualizacion: apiDateValue_(row.FechaActualizacion), ClienteID: String(row.ClienteID || ''), Captado: String(row.Captado || '') };
    }),
    clients: crmObjects_(crmSheet_(ss, 'clients')).map(function (row) {
      return { AgenteDNI: String(row.AgenteDNI || ''), FechaCierre: apiDateValue_(row.FechaCierre), CierreVenta: apiDateValue_(row.CierreVenta) };
    }),
    captures: crmObjects_(crmSheet_(ss, 'audit')).filter(function (row) {
      return String(row.Accion || '').toUpperCase() === 'CAPTAR' && String(row.Entidad || '').toUpperCase() === 'PROSPECTO';
    }).map(function (row) {
      return { EntidadID: String(row.EntidadID || ''), UsuarioDNI: String(row.UsuarioDNI || ''), FechaHora: apiDateValue_(row.FechaHora) };
    }),
    names: crmUserNames_(ss)
  };
  try {
    var compressed = Utilities.gzip(Utilities.newBlob(JSON.stringify(source))).getBytes();
    cache.put(sourceKey, Utilities.base64Encode(compressed), CRM_DASHBOARD_CACHE_SECONDS);
  } catch (ignored) { /* si excede el límite, el cálculo directo sigue funcionando */ }
  return source;
}

function crmDashboard_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); var filters = { from: crmText_(data.from, 12), to: crmText_(data.to, 12), agentDni: crmIsAdmin_(actor) ? crmText_(data.agentDni, 40) : actor.dni };
  var dashboardCache = CacheService.getScriptCache();
  var dashboardCacheKey = crmDashboardCacheKey_(actor, filters);
  var cachedDashboard = dashboardCache.get(dashboardCacheKey);
  if (cachedDashboard) {
    try { return crmResponse_(JSON.parse(cachedDashboard)); } catch (ignored) { /* recalcular si la entrada quedó incompleta */ }
  }
  // Una sola lectura de INTERACCIONES: de aquí salen la última interacción por
  // prospecto, el ranking de seguimientos, la primera interacción por agente y
  // la serie diaria; volver a leer la hoja por cada indicador duplicaría el
  // costo de red con Sheets sin necesidad.
  var source = crmDashboardSource_(ss);
  var interactionRows = source.interactions;
  var latestInteractions = crmLatestInteractionsByProspect_(ss, interactionRows);
  var prospects = source.prospects.filter(function (row) {
    if (!crmCanAccess_(actor, row)) return false;
    var key = dateKey_(row.FechaCreacion);
    return (!filters.agentDni || String(row.AgenteDNI || '') === filters.agentDni) && (!filters.from || key >= filters.from) && (!filters.to || key <= filters.to);
  });
  var now = new Date().getTime();
  // El rango del dashboard se cruza con la FechaCierre del cliente. CierreVenta
  // solo confirma que esa captación ya concretó una venta, sin limitarla a la
  // fecha exacta en que se registró el cierre de venta.
  var clients = source.clients.filter(function (row) { var key = dateKey_(row.FechaCierre); return Boolean(dateKey_(row.CierreVenta)) && Boolean(key) && crmCanAccess_(actor, row) && (!filters.agentDni || String(row.AgenteDNI || '') === filters.agentDni) && (!filters.from || key >= filters.from) && (!filters.to || key <= filters.to); });
  var funnelMap = {}; prospects.forEach(function (row) { var latest = latestInteractions[String(row.ID || '')]; var result = String((latest && latest.Resultado) || 'SIN RESULTADO'); funnelMap[result] = (funnelMap[result] || 0) + 1; });
  // Mismo alcance que el embudo (prospects ya filtrado por crmCanAccess_): un
  // agente ve la mezcla de canal de su propia cartera, un administrador la del equipo.
  var canalMap = {}; prospects.forEach(function (row) { var canal = String(row.Canal || '').trim() || 'SIN CANAL'; canalMap[canal] = (canalMap[canal] || 0) + 1; });
  var pending = prospects.filter(function (row) { var latest = latestInteractions[String(row.ID || '')]; return latest && latest.ProximoContacto && dateMillis_(latest.ProximoContacto) <= now + 7 * 86400000 && !crmProspectCaptured_(row); }); pending.sort(function (a, b) { return dateMillis_(latestInteractions[String(a.ID || '')].ProximoContacto) - dateMillis_(latestInteractions[String(b.ID || '')].ProximoContacto); });
  var agentMap = {}; var names = source.names;
  function dashboardAgent_(dniValue) {
    var dni = String(dniValue || '').trim(); if (!dni) return null;
    if (!agentMap[dni]) agentMap[dni] = { dni: dni, nombre: names[dni] || dni, prospectos: 0, gestionados: 0, prospectosContactados: 0, seguimientos: 0, primerasInteracciones: 0, captaciones: 0, captados: 0, pendientes: 0, conversiones: 0, _contacted: {} };
    return agentMap[dni];
  }
  // Serie diaria de interacciones: un administrador ve la actividad de todo el
  // equipo, un agente solo la suya. Se limita a los últimos
  // CRM_DASHBOARD_SERIES_DAYS con datos para que el gráfico no crezca sin límite.
  var scopedInteractions = crmIsAdmin_(actor) ? interactionRows : interactionRows.filter(function (row) { return String(row.AgenteDNI || '') === actor.dni; });
  if (filters.agentDni) scopedInteractions = scopedInteractions.filter(function (row) { return String(row.AgenteDNI || '') === filters.agentDni; });
  var dateSeriesMap = {};
  var negotiationStateMap = {};
  var interactionStageMap = {};
  scopedInteractions.forEach(function (row) {
    var key = dateKey_(row.FechaHoraContacto || row.FechaHora); if (!key) return;
    if ((filters.from && key < filters.from) || (filters.to && key > filters.to)) return;
    dateSeriesMap[key] = (dateSeriesMap[key] || 0) + 1;
    if (String(row.Etapa || '').trim().toUpperCase() === 'NEGOCIACION') {
      var negotiationState = String(row.Resultado || '').trim() || 'SIN RESULTADO';
      negotiationStateMap[negotiationState] = (negotiationStateMap[negotiationState] || 0) + 1;
    }
    var interactionStage = String(row.Etapa || '').trim().toUpperCase() || 'SIN ETAPA';
    interactionStageMap[interactionStage] = (interactionStageMap[interactionStage] || 0) + 1;
  });
  var dateKeys = Object.keys(dateSeriesMap).sort();
  if (dateKeys.length > CRM_DASHBOARD_SERIES_DAYS) dateKeys = dateKeys.slice(dateKeys.length - CRM_DASHBOARD_SERIES_DAYS);
  var interactionsByDate = dateKeys.map(function (key) { return { fecha: key, total: dateSeriesMap[key] }; });
  // Altas por día según FechaCreacion. `prospects` ya viene filtrado por alcance
  // y por el rango de fechas, así que basta con agrupar.
  var createdSeriesMap = {};
  prospects.forEach(function (row) {
    var key = dateKey_(row.FechaCreacion); if (!key) return;
    createdSeriesMap[key] = (createdSeriesMap[key] || 0) + 1;
  });
  var createdKeys = Object.keys(createdSeriesMap).sort();
  if (createdKeys.length > CRM_DASHBOARD_SERIES_DAYS) createdKeys = createdKeys.slice(createdKeys.length - CRM_DASHBOARD_SERIES_DAYS);
  var prospectsByDate = createdKeys.map(function (key) { return { fecha: key, total: createdSeriesMap[key] }; });
  if (crmIsAdmin_(actor)) {
    prospects.forEach(function (row) {
      var agent = dashboardAgent_(row.AgenteDNI); if (!agent) return;
      agent.prospectos++;
      if (latestInteractions[String(row.ID || '')]) agent.gestionados++;
      if (crmProspectCaptured_(row)) agent.captados++;
    });
    clients.forEach(function (row) { var agent = dashboardAgent_(row.AgenteDNI); if (agent) agent.conversiones++; });
    pending.forEach(function (row) { var agent = dashboardAgent_(row.AgenteDNI); if (agent) agent.pendientes++; });
    interactionRows.forEach(function (row) {
      if (filters.agentDni && String(row.AgenteDNI || '') !== filters.agentDni) return;
      var key = dateKey_(row.FechaHoraContacto || row.FechaHora);
      if (!key) return;
      if ((filters.from && key < filters.from) || (filters.to && key > filters.to)) return;
      var agent = dashboardAgent_(row.AgenteDNI); if (!agent) return;
      agent.seguimientos++;
      if (row.ProspectoID) agent._contacted[String(row.ProspectoID)] = true;
    });
    var firstCaptureByProspect = {};
    source.captures.forEach(function (row) {
      var prospectId = String(row.EntidadID || ''); if (!prospectId) return;
      var previous = firstCaptureByProspect[prospectId];
      if (!previous || dateMillis_(row.FechaHora) < dateMillis_(previous.FechaHora)) firstCaptureByProspect[prospectId] = row;
    });
    Object.keys(firstCaptureByProspect).forEach(function (prospectId) {
      var row = firstCaptureByProspect[prospectId]; var key = dateKey_(row.FechaHora); if (!key) return;
      if (filters.agentDni && String(row.UsuarioDNI || '') !== filters.agentDni) return;
      if ((filters.from && key < filters.from) || (filters.to && key > filters.to)) return;
      var agent = dashboardAgent_(row.UsuarioDNI); if (agent) agent.captaciones++;
    });
    // Quién abrió la conversación primero con cada prospecto: la interacción
    // más antigua de INTERACCIONES por ProspectoID, atribuida a su AgenteDNI.
    // Mide iniciativa de captación de contactos, no volumen total de gestión.
    var firstInteractionByProspect = {};
    interactionRows.forEach(function (row) {
      var prospectId = String(row.ProspectoID || ''); if (!prospectId) return;
      var ts = dateMillis_(row.FechaHoraContacto || row.FechaHora); if (!ts) return;
      var previous = firstInteractionByProspect[prospectId];
      if (!previous || ts < dateMillis_(previous.FechaHoraContacto || previous.FechaHora)) firstInteractionByProspect[prospectId] = row;
    });
    Object.keys(firstInteractionByProspect).forEach(function (prospectId) {
      var row = firstInteractionByProspect[prospectId]; var key = dateKey_(row.FechaHoraContacto || row.FechaHora); if (!key) return;
      if (filters.agentDni && String(row.AgenteDNI || '') !== filters.agentDni) return;
      if ((filters.from && key < filters.from) || (filters.to && key > filters.to)) return;
      var agent = dashboardAgent_(row.AgenteDNI); if (agent) agent.primerasInteracciones++;
    });
  }
  var nuevos = prospects.filter(function (row) { return !latestInteractions[String(row.ID || '')]; }).length;
  var contactados = prospects.filter(function (row) { return Boolean(latestInteractions[String(row.ID || '')]); }).length;
  var captados = prospects.filter(function (row) { return crmProspectCaptured_(row); }).length;
  var vencidos = pending.filter(function (row) { return dateMillis_(latestInteractions[String(row.ID || '')].ProximoContacto) < now; }).length;
  var total = prospects.length;
  var agentStats = Object.keys(agentMap).map(function (key) { var item = agentMap[key]; item.prospectosContactados = Object.keys(item._contacted).length; delete item._contacted; return item; });
  agentStats.sort(function (a, b) { return b.seguimientos - a.seguimientos || b.prospectosContactados - a.prospectosContactados || a.nombre.localeCompare(b.nombre); });
  var dashboardResult = { metrics: { total: total, nuevos: nuevos, contactados: contactados, captados: captados, pendientes: pending.length, vencidos: vencidos, conversiones: clients.length, tasaGestion: total ? Math.round(contactados / total * 1000) / 10 : 0, tasaCaptacion: total ? Math.round(captados / total * 1000) / 10 : 0, tasaConversion: total ? Math.round(clients.length / total * 1000) / 10 : 0 }, funnel: Object.keys(funnelMap).map(function (key) { return { estado: key, total: funnelMap[key] }; }), negotiationStates: Object.keys(negotiationStateMap).map(function (key) { return { estado: key, total: negotiationStateMap[key] }; }).sort(function (a, b) { return b.total - a.total; }), interactionStages: Object.keys(interactionStageMap).map(function (key) { return { etapa: key, total: interactionStageMap[key] }; }).sort(function (a, b) { return b.total - a.total; }), canal: Object.keys(canalMap).map(function (key) { return { canal: key, total: canalMap[key] }; }).sort(function (a, b) { return b.total - a.total; }), interactionsByDate: interactionsByDate, prospectsByDate: prospectsByDate, upcoming: pending.slice(0, 8).map(function (row) { return crmProspectPublic_(row, names, latestInteractions[String(row.ID || '')]); }), agents: agentStats };
  try { dashboardCache.put(dashboardCacheKey, JSON.stringify(dashboardResult), CRM_DASHBOARD_CACHE_SECONDS); } catch (ignored) { /* la caché es opcional */ }
  return crmResponse_(dashboardResult);
}

function crmListAgents_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); if (!crmIsAdmin_(actor)) return crmError_('Solo un administrador puede consultar el equipo.'); var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS);
  var result = crmObjects_(sheet).map(function (row) { return { dni: String(row.DNI), apellidos: String(row.Apellidos || ''), nombres: String(row.Nombres || ''), estado: getValidEstado_(row.Estado), tipoUsuario: getValidUserType_(row.TipoUsuario, String(row.DNI)), fechaRegistro: apiDateValue_(row.FechaRegistro), ultimoAcceso: apiDateValue_(row.UltimoAcceso), dispositivo: String(row.Dispositivo || ''), correo: String(row.Correo || ''), celular: String(row.Celular || ''), categoria: String(row.Categoria || '') }; }); return crmResponse_(result);
}

function crmUpdateProfile_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); var profile = data.profile || {}; var names = crmText_(profile.nombres, 80).toUpperCase(); var surnames = crmText_(profile.apellidos, 100).toUpperCase(); var hasEmail = profile.correo !== undefined; var hasPhone = profile.celular !== undefined; var email = crmText_(profile.correo, 160); var phone = hasPhone ? String(profile.celular || '').trim() : ''; if (!names || !surnames) return crmError_('Nombres y apellidos son obligatorios.');
  if (hasEmail && email && !isEmail_(email)) return crmError_('El correo no es válido.');
  if (hasPhone && phone && !/^\d{9}$/.test(phone)) return crmError_('El celular debe contener exactamente 9 dígitos.');
  var sheet = getOrCreateSheetWithHeaders(ss, USERS_SHEET_NAME, USERS_HEADERS); var headers = getHeaders_(sheet); var row = findRowByDni_(sheet, actor.dni, headers); if (!row) return crmError_('La cuenta ya no existe.'); var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0]; values[headers.indexOf('Nombres')] = names; values[headers.indexOf('Apellidos')] = surnames; if (hasEmail) values[headers.indexOf('Correo')] = email; if (hasPhone) values[headers.indexOf('Celular')] = phone; values = writeSheetValues_(sheet, row, headers, values); crmAudit_(ss, actor, 'EDITAR', 'PERFIL', actor.dni, names + ' ' + surnames);
  return crmResponse_({ dni: actor.dni, apellidos: surnames, nombres: names, estado: getValidEstado_(valueAt_(values, headers, 'Estado')), tipoUsuario: getValidUserType_(valueAt_(values, headers, 'TipoUsuario'), actor.dni), fechaRegistro: apiDateValue_(valueAt_(values, headers, 'FechaRegistro')), ultimoAcceso: apiDateValue_(valueAt_(values, headers, 'UltimoAcceso')), dispositivo: String(valueAt_(values, headers, 'Dispositivo') || ''), correo: String(valueAt_(values, headers, 'Correo') || ''), celular: String(valueAt_(values, headers, 'Celular') || ''), categoria: String(valueAt_(values, headers, 'Categoria') || '') });
}

function crmCsvCell_(value) { return '"' + String(value === null || value === undefined ? '' : value).replace(/"/g, '""') + '"'; }

/**
 * Las fechas salen del CSV en `DD/MM/AAAA HH:MM`, el mismo formato que muestran
 * la app y la hoja. En Sheets son valores Date reales, no texto, por lo que
 * ordenar y filtrar conserva el comportamiento cronológico correcto.
 */
var CRM_DATE_COLUMNS = { FechaCreacion: 1, FechaActualizacion: 1, ProximoContacto: 1, FechaHoraContacto: 1, FechaHora: 1, FechaCierre: 1 };

function crmCsvDate_(value) {
  if (value === '' || value === null || value === undefined) return '';
  var parsed = parseSheetDate_(value);
  return parsed ? Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : String(value);
}

function crmExportProspects_(ss, data) {
  var actor = crmActor_(ss, data); if (!actor.ok) return crmError_(actor.message); var latestInteractions = crmLatestInteractionsByProspect_(ss); var rows = crmFilteredProspects_(ss, actor, data.filters, latestInteractions); var headers = ['ID', 'Nombre', 'Documento', 'Telefono', 'Correo', 'Canal', 'Resultado', 'Etapa', 'AgenteDNI', 'FechaCreacion', 'ProximoContacto', 'JSON'];
  var csv = [headers.map(crmCsvCell_).join(',')].concat(rows.map(function (row) { var latest = latestInteractions[String(row.ID || '')] || {}; return headers.map(function (header) { var value = header === 'Resultado' ? latest.Resultado : header === 'Etapa' ? (row.ClienteID ? 'CLIENTE' : latest.Etapa || 'PROSPECTO') : header === 'ProximoContacto' ? latest.ProximoContacto : row[header]; return crmCsvCell_(CRM_DATE_COLUMNS[header] ? crmCsvDate_(value) : value); }).join(','); })).join('\r\n'); crmAudit_(ss, actor, 'EXPORTAR', 'PROSPECTOS', '', rows.length + ' registro(s)'); return crmResponse_({ filename: 'prospectos-fort-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmm') + '.csv', csv: csv });
}

/**
 * Traslada a PROSPECTOS la información de captación guardada por versiones
 * anteriores en CLIENTES. Las columnas antiguas solo se eliminan cuando toda
 * fila que contiene datos pudo vincularse con su prospecto, evitando pérdidas.
 */
function migrateCapturedDetailsToProspects_(ss, actions) {
  var clientSheet = ss.getSheetByName(CRM_SHEETS.clients.name);
  var prospectSheet = ss.getSheetByName(CRM_SHEETS.prospects.name);
  if (!clientSheet || !prospectSheet) return;

  var clientHeaders = getHeaders_(clientSheet);
  var legacyFields = CRM_CAPTURE_FIELDS.filter(function (field) { return clientHeaders.indexOf(field) !== -1; });
  if (!legacyFields.length) return;

  var prospects = crmObjects_(prospectSheet);
  var prospectsById = {};
  var prospectsByDocument = {};
  prospects.forEach(function (prospect) {
    prospectsById[String(prospect.ID || '')] = prospect;
    if (prospect.Documento && !prospectsByDocument[String(prospect.Documento)]) prospectsByDocument[String(prospect.Documento)] = prospect;
  });

  var migratedRows = 0;
  var unmatchedRows = 0;
  crmObjects_(clientSheet).forEach(function (client) {
    var hasCapturedData = legacyFields.some(function (field) { return client[field] !== '' && client[field] !== null && client[field] !== undefined; });
    if (!hasCapturedData) return;
    var prospect = prospectsById[String(client.ProspectoID || '')] || prospectsByDocument[String(client.Documento || '')];
    if (!prospect) { unmatchedRows++; return; }
    var changed = false;
    legacyFields.forEach(function (field) {
      if ((prospect[field] === '' || prospect[field] === null || prospect[field] === undefined) && client[field] !== '' && client[field] !== null && client[field] !== undefined) {
        prospect[field] = client[field]; changed = true;
      }
    });
    if (changed) { crmWriteRow_(prospectSheet, prospect._row, prospect); migratedRows++; }
  });

  if (unmatchedRows) {
    actions.push('Se migraron datos de captación de ' + migratedRows + ' cliente(s), pero se conservaron las columnas antiguas de CLIENTES porque ' + unmatchedRows + ' fila(s) no tienen prospecto relacionado.');
    return;
  }

  legacyFields.map(function (field) { return clientHeaders.indexOf(field) + 1; }).sort(function (a, b) { return b - a; }).forEach(function (column) { clientSheet.deleteColumn(column); });
  actions.push('Los datos de captación quedaron en PROSPECTOS' + (migratedRows ? ' y se migraron ' + migratedRows + ' fila(s)' : '') + '; se retiraron de CLIENTES las columnas ' + legacyFields.join(', ') + '.');
}

/**
 * Revisa la estructura que necesita el login y el CRM, sin borrar datos.
 * El resultado queda en el registro de ejecución y en LOG_ACTUALIZACIONES.
 */
function Actualizar() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var actions = [];
  var usersSheet = ensureSheetAndHeaders_(ss, USERS_SHEET_NAME, USERS_HEADERS, actions);
  completeUserTypes_(usersSheet, actions);
  completeEstados_(usersSheet, actions);
  ensureTestUser_(usersSheet, actions);
  normalizeSheetDateColumns_(usersSheet, actions);
  var settingsSheet = ensureSettingsSheet_(ss, actions);
  normalizeSheetDateColumns_(settingsSheet, actions);
  // CATALOGOS queda deliberadamente fuera: esa pestaña la mantiene la administración
  // a mano o desde el módulo de Catálogos. Actualizar no crea filas, ni cabeceras, ni columnas.
  Object.keys(CRM_SHEETS).forEach(function (key) {
    if (key === 'catalogs') return;
    var sheet = ensureSheetAndHeaders_(ss, CRM_SHEETS[key].name, CRM_SHEETS[key].headers, actions);
    normalizeSheetDateColumns_(sheet, actions);
  });
  migrateCapturedDetailsToProspects_(ss, actions);
  completeInteractionCaptureFlags_(ss, actions);
  completeInteractionStages_(ss, actions);
  if (!crmCatalogSheet_(ss)) actions.push('Falta la pestaña CATALOGOS: créala a mano con las cabeceras ' + CRM_SHEETS.catalogs.headers.join(', ') + '.');
  var logSheet = ensureSheetAndHeaders_(ss, UPDATE_LOG_SHEET_NAME, UPDATE_LOG_HEADERS, actions);
  normalizeSheetDateColumns_(logSheet, actions);

  if (actions.length === 0) actions.push('No se requirieron cambios: las pestañas y cabeceras ya están actualizadas.');
  var detail = actions.join(' | ');
  var now = new Date();
  writeSheetValues_(logSheet, 0, getHeaders_(logSheet), [now, 'Actualizar', 'Completado', detail]);
  SpreadsheetApp.flush();

  Logger.log('[Actualizar] ' + detail);
  var result = { status: 'ok', fecha: now.toISOString(), acciones: actions };
  try {
    SpreadsheetApp.getUi().alert('Actualización completada.\n\n' + actions.join('\n'));
  } catch (err) {
    // La función también puede ejecutarse desde un disparador, sin interfaz.
  }
  return result;
}

/** Alias conservado para instalaciones anteriores. */
function CrearHojaUsuarios() { return Actualizar(); }

function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙️ Login')
    .addItem('Actualizar estructura', 'Actualizar')
    .addItem('Crear / actualizar hoja USUARIOS', 'CrearHojaUsuarios')
    .addItem('Agregar usuarios del equipo (sin correo)', 'AgregarUsuariosEquipo')
    .addSeparator()
    .addItem('Generar demo completa (300 prospectos)', 'GenerarDatosPrueba')
    .addItem('Eliminar datos de prueba', 'EliminarDatosPrueba')
    .addToUi();
}
