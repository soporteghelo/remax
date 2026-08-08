/**
 * Apps Script - Login por DNI y contraseña.
 * Reemplaza SPREADSHEET_ID y PASSWORD_PEPPER antes de desplegar.
 */
const SPREADSHEET_ID = '1MjH6j9MZE_0mFpZ04DG539_pMYCqru4iVpNXvQdKSMw';
const PASSWORD_PEPPER = 'mIapp_7!Kq9#vL2@xR8$zP4';
// Agrega aquí los DNI que deben crearse como administradores. Los demás serán USUARIO.
const ADMIN_DNIS = ['76018787'];
const MIN_PASSWORD_LENGTH = 6;
// Cuenta temporal para pruebas. Se registra al ejecutar Actualizar() si no existe.
const TEST_USER = { DNI: '76018787', Pass: 'kirito', Apellidos: 'USUARIO', Nombres: 'TEST' };
const USERS_SHEET_NAME = 'USUARIOS';
const USERS_HEADERS = ['DNI', 'Apellidos', 'Nombres', 'Estado', 'TipoUsuario', 'FechaRegistro', 'UltimoAcceso', 'Dispositivo', 'Pass'];
const UPDATE_LOG_SHEET_NAME = 'LOG_ACTUALIZACIONES';
const UPDATE_LOG_HEADERS = ['Fecha', 'Función', 'Resultado', 'Detalle'];
const SETTINGS_SHEET_NAME = 'CONFIGURACION';
const SETTINGS_HEADERS = ['Clave', 'Valor', 'Tipo', 'Descripcion', 'Actualizado', 'ActualizadoPor'];

/**
 * Catálogo de la configuración general de la app: una fila por clave en la
 * pestaña CONFIGURACION. `def` es el valor con el que se crea la fila y al que
 * se vuelve si el valor guardado deja de ser válido.
 *
 * El frontend replica estas claves en `src/settings.ts` (con sus etiquetas en
 * español); al añadir un ajuste hay que declararlo en ambos lados.
 */
const APP_SETTINGS = [
  { key: 'appName', type: 'text', def: 'Portal Seguro', max: 40, desc: 'Nombre visible en la barra superior y en la pestaña del navegador.' },
  { key: 'appShortName', type: 'text', def: 'PS', max: 3, desc: 'Sigla de 1 a 3 letras del distintivo de marca.' },
  { key: 'appVersion', type: 'text', def: 'Portal v1.0.0', max: 24, desc: 'Versión mostrada en el pie del menú lateral.' },
  { key: 'organization', type: 'text', def: '', max: 60, desc: 'Organización mostrada en el pie del menú lateral y en el acceso.' },
  { key: 'supportContact', type: 'text', def: '', max: 80, desc: 'Contacto de soporte mostrado a quien no puede ingresar.' },
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
    if (data.action === 'listUsers') return listUsers_(ss, data);
    if (data.action === 'getSettings') return getSettings_(ss);
    if (data.action === 'saveSettings') return saveSettings_(ss, data);
    return createResponse({ status: 'error', message: 'Acción no reconocida' });
  } catch (err) {
    return createResponse({ status: 'error', message: String(err) });
  }
}

function doGet() { return createResponse({ status: 'ok', message: 'Servicio de login activo' }); }
function createResponse(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

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
  var now = new Date().toISOString();
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
  sheet.appendRow(headers.map(function (header) { return record[header] || ''; }));
  actions.push('Se creó el usuario de prueba ' + TEST_USER.DNI + ' como ' + record.TipoUsuario + '.');
}

function getHeaders_(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; }
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
  headers.forEach(function (header, index) { if (header !== 'Pass') record[header] = values[index]; });
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

    values[headers.indexOf('UltimoAcceso')] = new Date().toISOString();
    values[headers.indexOf('Dispositivo')] = String(data.dispositivo || '');
    var typeIndex = headers.indexOf('TipoUsuario');
    values[typeIndex] = getValidUserType_(values[typeIndex], dni);
    var estadoIndex = headers.indexOf('Estado');
    if (estadoIndex !== -1) values[estadoIndex] = getValidEstado_(values[estadoIndex]);
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    SpreadsheetApp.flush();
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
  if (!/^\d{8}$/.test(adminDni) || !adminPassword) return createResponse({ status: 'error', message: 'Confirma tus credenciales de administrador.' });
  if (!/^\d{8}$/.test(dni)) return createResponse({ status: 'error', message: 'El DNI del nuevo usuario no es válido.' });
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) return createResponse({ status: 'error', message: 'La contraseña debe tener entre ' + MIN_PASSWORD_LENGTH + ' y 128 caracteres.' });
  if (!apellidos || !nombres) return createResponse({ status: 'error', message: 'Ingresa apellidos y nombres del nuevo usuario.' });
  if (tipoUsuario !== 'ADMINISTRADOR' && tipoUsuario !== 'USUARIO') return createResponse({ status: 'error', message: 'Tipo de usuario no válido.' });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var admin = verifyAdmin_(ss, adminDni, adminPassword);
    if (!admin.ok) return createResponse({ status: 'error', message: admin.message });
    var sheet = admin.sheet;
    var headers = admin.headers;
    if (findRowByDni_(sheet, dni, headers)) return createResponse({ status: 'error', message: 'Ya existe un usuario con ese DNI.' });

    var now = new Date().toISOString();
    var newRecord = { DNI: dni, Apellidos: apellidos, Nombres: nombres, Estado: 'ACTIVO', TipoUsuario: tipoUsuario, FechaRegistro: now, UltimoAcceso: '', Dispositivo: '', Pass: hashPassword_(password) };
    var newRow = headers.map(function (header) { return newRecord[header] || ''; });
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();
    return createResponse({ status: 'ok', message: 'Usuario creado correctamente.', record: publicRecord_(headers, newRow) });
  } finally {
    lock.releaseLock();
  }
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
  if (!/^\d{8}$/.test(adminDni) || !adminPassword) return createResponse({ status: 'error', message: 'Confirma tus credenciales de administrador.' });
  if (!/^\d{8}$/.test(dni)) return createResponse({ status: 'error', message: 'El DNI del usuario no es válido.' });
  if (!apellidos || !nombres) return createResponse({ status: 'error', message: 'Ingresa apellidos y nombres del usuario.' });
  if (tipoUsuario !== 'ADMINISTRADOR' && tipoUsuario !== 'USUARIO') return createResponse({ status: 'error', message: 'Tipo de usuario no válido.' });
  if (estado !== 'ACTIVO' && estado !== 'CESADO') return createResponse({ status: 'error', message: 'Estado no válido.' });
  if (password && (password.length < MIN_PASSWORD_LENGTH || password.length > 128)) {
    return createResponse({ status: 'error', message: 'La contraseña debe tener entre ' + MIN_PASSWORD_LENGTH + ' y 128 caracteres.' });
  }
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
    if (password) values[headers.indexOf('Pass')] = hashPassword_(password);
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
    SpreadsheetApp.flush();

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

  var now = new Date().toISOString();
  var missing = APP_SETTINGS.filter(function (def) { return rowByKey[def.key] === undefined; });
  missing.forEach(function (def) {
    var record = { Clave: def.key, Valor: def.def, Tipo: def.type, Descripcion: def.desc, Actualizado: now, ActualizadoPor: 'Sistema' };
    sheet.appendRow(headers.map(function (header) { return record[header] === undefined ? '' : record[header]; }));
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
    var now = new Date().toISOString();
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
    if (changes > 0) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
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

/**
 * Revisa la estructura que necesita el login y la corrige sin borrar datos.
 * El resultado queda en el registro de ejecución y en LOG_ACTUALIZACIONES.
 */
function Actualizar() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var actions = [];
  var usersSheet = ensureSheetAndHeaders_(ss, USERS_SHEET_NAME, USERS_HEADERS, actions);
  completeUserTypes_(usersSheet, actions);
  completeEstados_(usersSheet, actions);
  ensureTestUser_(usersSheet, actions);
  ensureSettingsSheet_(ss, actions);
  var logSheet = ensureSheetAndHeaders_(ss, UPDATE_LOG_SHEET_NAME, UPDATE_LOG_HEADERS, actions);

  if (actions.length === 0) actions.push('No se requirieron cambios: las pestañas y cabeceras ya están actualizadas.');
  var detail = actions.join(' | ');
  var now = new Date();
  logSheet.appendRow([now, 'Actualizar', 'Completado', detail]);
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
    .addToUi();
}
