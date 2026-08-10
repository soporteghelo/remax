/**
 * Generador masivo de datos de demostracion para Sistema FORT.
 *
 * Este archivo debe vivir en el mismo proyecto de Apps Script que Code.gs.
 * Usa las cabeceras y catalogos reales, escribe por lotes y crea agentes de
 * demostracion con relaciones completas. Todos los registros quedan marcados,
 * por lo que EliminarDatosPrueba() puede retirarlos sin tocar datos reales.
 */
var DEMO_DEFAULT_PROSPECTS = 300;
var DEMO_DEFAULT_USERS = 12;
var DEMO_MAX_PROSPECTS = 1000;
var DEMO_MAX_USERS = 40;
var DEMO_ID_PREFIX = 'DEMO-';
var DEMO_NOTE_TAG = '[DATOS_DEMO]';

/** Crea 12 agentes y 300 prospectos con todo su flujo relacionado. */
function GenerarDatosPrueba() {
  return generarDatosPrueba_(DEMO_DEFAULT_PROSPECTS);
}

/**
 * Variante configurable para ejecutar desde el editor, por ejemplo:
 * generarDatosPrueba_(500)
 */
function generarDatosPrueba_(cantidad) {
  cantidad = Math.floor(Number(cantidad || DEMO_DEFAULT_PROSPECTS));
  if (cantidad < 1 || cantidad > DEMO_MAX_PROSPECTS) {
    throw new Error('La cantidad debe estar entre 1 y ' + DEMO_MAX_PROSPECTS + '.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var prepared = demoPrepareSheets_(ss);
    var catalogRows = crmCatalogRows_(ss);
    var catalogs = demoRequiredCatalogs_(catalogRows);
    var now = new Date();
    var batch = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
    var demoTeam = demoEnsureUsers_(prepared.users, Math.min(DEMO_DEFAULT_USERS, cantidad), now);
    var agents = demoTeam.agents;
    var random = demoRandom_(now.getTime() + cantidad);
    var usedDocuments = demoUsedValues_(prepared.prospects, 'Documento');
    var usedPhones = demoUsedValues_(prepared.prospects, 'Telefono');
    var data = demoBuildData_(cantidad, batch, now, random, agents, catalogs, usedDocuments, usedPhones);

    demoAppendRecords_(prepared.prospects, data.prospects);
    demoAppendRecords_(prepared.interactions, data.interactions);
    demoAppendRecords_(prepared.clients, data.clients);
    demoAppendRecords_(prepared.audit, data.audits);
    SpreadsheetApp.flush();
    crmInvalidateDashboardCache_();

    var detail = 'Lote ' + batch + ': ' + agents.length + ' agentes demo (' + demoTeam.created + ' nuevos), ' + data.prospects.length + ' prospectos (' + data.newProspects + ' nuevos y ' + data.contacted + ' contactados), ' + data.interactions.length + ' interacciones, ' + data.negotiations + ' negociaciones, ' + data.scheduled + ' proximas citas, ' + data.captured + ' captados y ' + data.clients.length + ' clientes.';
    demoWriteLog_(ss, 'GenerarDatosPrueba', 'Completado', detail);
    ss.toast(detail, 'Datos de prueba listos', 8);
    Logger.log('[GenerarDatosPrueba] ' + detail);
    return {
      status: 'ok',
      lote: batch,
      usuariosDemo: agents.length,
      usuariosCreados: demoTeam.created,
      prospectos: data.prospects.length,
      nuevos: data.newProspects,
      contactados: data.contacted,
      interacciones: data.interactions.length,
      negociaciones: data.negotiations,
      proximasCitas: data.scheduled,
      captados: data.captured,
      clientes: data.clients.length,
      auditorias: data.audits.length
    };
  } finally {
    lock.releaseLock();
  }
}

/** Elimina exclusivamente las filas creadas por este generador. */
function EliminarDatosPrueba() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var removed = {
      interacciones: demoDeleteRows_(ss.getSheetByName(CRM_SHEETS.interactions.name), function (row) {
        return demoId_(row.ID) || demoId_(row.ProspectoID);
      }),
      clientes: demoDeleteRows_(ss.getSheetByName(CRM_SHEETS.clients.name), function (row) {
        return demoId_(row.ID) || demoId_(row.ProspectoID);
      }),
      prospectos: demoDeleteRows_(ss.getSheetByName(CRM_SHEETS.prospects.name), function (row) {
        return demoId_(row.ID);
      }),
      auditoria: demoDeleteRows_(ss.getSheetByName(CRM_SHEETS.audit.name), function (row) {
        return demoId_(row.EntidadID);
      }),
      usuarios: demoDeleteRows_(ss.getSheetByName(USERS_SHEET_NAME), function (row) {
        return demoUser_(row);
      })
    };
    SpreadsheetApp.flush();
    crmInvalidateDashboardCache_();
    var detail = 'Se retiraron ' + removed.prospectos + ' prospectos, ' + removed.interacciones + ' interacciones, ' + removed.clientes + ' clientes, ' + removed.auditoria + ' auditorias y ' + removed.usuarios + ' usuarios de demostracion.';
    demoWriteLog_(ss, 'EliminarDatosPrueba', 'Completado', detail);
    ss.toast(detail, 'Datos de prueba eliminados', 8);
    Logger.log('[EliminarDatosPrueba] ' + detail);
    removed.status = 'ok';
    return removed;
  } finally {
    lock.releaseLock();
  }
}

/** Alinea el esquema sin borrar ni reescribir los registros existentes. */
function demoPrepareSheets_(ss) {
  var actions = [];
  var result = {
    users: ensureSheetAndHeaders_(ss, USERS_SHEET_NAME, USERS_HEADERS, actions),
    prospects: ensureSheetAndHeaders_(ss, CRM_SHEETS.prospects.name, CRM_SHEETS.prospects.headers, actions),
    interactions: ensureSheetAndHeaders_(ss, CRM_SHEETS.interactions.name, CRM_SHEETS.interactions.headers, actions),
    clients: ensureSheetAndHeaders_(ss, CRM_SHEETS.clients.name, CRM_SHEETS.clients.headers, actions),
    audit: ensureSheetAndHeaders_(ss, CRM_SHEETS.audit.name, CRM_SHEETS.audit.headers, actions)
  };
  if (!crmCatalogSheet_(ss)) throw new Error('Falta la pestaña CATALOGOS con las cabeceras Tipo, Etiqueta, Orden y Activo.');
  completeInteractionCaptureFlags_(ss, actions);
  completeInteractionStages_(ss, actions);
  if (actions.length) demoWriteLog_(ss, 'PrepararDatosPrueba', 'Completado', actions.join(' | '));
  return result;
}

function demoRequiredCatalogs_(rows) {
  var required = ['CANAL', 'RESULTADO', 'RESULTADO CITA', 'CAPTADO_RESULTADO', 'CAPTADO_CITA', 'REUNION'];
  var result = {};
  var missing = [];
  required.forEach(function (type) {
    var seen = {};
    result[type] = rows.filter(function (row) {
      if (String(row.Tipo || '').toUpperCase() !== type || String(row.Activo || '').toUpperCase() === 'NO') return false;
      var key = crmLabelKey_(row.Etiqueta);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(function (row) { return crmLabelText_(row.Etiqueta); });
    if (!result[type].length) missing.push(type);
  });
  if (missing.length) throw new Error('Faltan opciones activas en CATALOGOS para: ' + missing.join(', ') + '.');
  return result;
}

function demoActiveAgents_(sheet) {
  var active = crmObjects_(sheet).filter(function (row) {
    return /^\d{8}$/.test(String(row.DNI || '')) && getValidEstado_(row.Estado) === 'ACTIVO';
  });
  var commercial = active.filter(function (row) {
    return getValidUserType_(row.TipoUsuario, String(row.DNI)) === 'USUARIO';
  });
  return commercial.length ? commercial : active;
}

/**
 * Crea o reutiliza agentes demo. Su clave inicial es su propio DNI, almacenada
 * con el mismo hash que usa el alta normal de usuarios.
 */
function demoEnsureUsers_(sheet, count, now) {
  count = Math.max(1, Math.min(DEMO_MAX_USERS, Math.floor(Number(count || DEMO_DEFAULT_USERS))));
  var templates = [
    ['ALEJANDRA', 'RIVERA MENDOZA'], ['BRUNO', 'SALAZAR TORRES'],
    ['CAMILA', 'ROJAS FLORES'], ['DIEGO', 'CASTILLO VARGAS'],
    ['ELENA', 'QUISPE RAMIREZ'], ['FABRICIO', 'MENDOZA CRUZ'],
    ['GABRIELA', 'PAREDES CHAVEZ'], ['HUGO', 'GARCIA HUAMAN'],
    ['INES', 'TORRES REYES'], ['JAVIER', 'FLORES ESPINOZA'],
    ['KARLA', 'VARGAS SALAZAR'], ['LEONARDO', 'RAMIREZ CASTILLO'],
    ['MARIANA', 'CHAVEZ PAREDES'], ['NICOLAS', 'HUAMAN GARCIA'],
    ['OLIVIA', 'REYES QUISPE'], ['PABLO', 'ESPINOZA ROJAS']
  ];
  var rows = crmObjects_(sheet);
  var used = {};
  rows.forEach(function (row) { used[String(row.DNI || '')] = true; });
  var agents = rows.filter(function (row) { return demoUser_(row) && getValidEstado_(row.Estado) === 'ACTIVO'; });
  var created = [];
  var candidate = 99000001;

  while (agents.length + created.length < count && candidate <= 99999999) {
    var dni = String(candidate++);
    if (used[dni]) continue;
    var position = agents.length + created.length;
    var template = templates[position % templates.length];
    var record = {
      DNI: dni,
      Apellidos: template[1],
      Nombres: template[0],
      Estado: 'ACTIVO',
      TipoUsuario: 'USUARIO',
      FechaRegistro: new Date(now.getTime() - (position + 20) * 86400000),
      UltimoAcceso: new Date(now.getTime() - (position + 1) * 3600000),
      Dispositivo: DEMO_NOTE_TAG + ' Agente comercial ' + demoPad_(position + 1, 2),
      Pass: hashPassword_(dni)
    };
    created.push(record);
    used[dni] = true;
  }
  if (agents.length + created.length < count) throw new Error('No se pudieron reservar suficientes DNI para los usuarios demo.');
  demoAppendRecords_(sheet, created);
  return { agents: agents.concat(created).slice(0, count), created: created.length };
}

function demoUser_(row) {
  return /^99\d{6}$/.test(String(row.DNI || ''))
    && String(row.Dispositivo || '').indexOf(DEMO_NOTE_TAG) === 0
    && getValidUserType_(row.TipoUsuario, String(row.DNI || '')) === 'USUARIO';
}

function demoBuildData_(count, batch, now, random, agents, catalogs, usedDocuments, usedPhones) {
  var firstNames = ['Andrea', 'Carlos', 'Valeria', 'Luis', 'Daniela', 'Jorge', 'Camila', 'Miguel', 'Lucia', 'Renato', 'Paola', 'Diego', 'Mariana', 'Jose', 'Fiorella', 'Alonso', 'Rosa', 'Marco', 'Natalia', 'Sergio'];
  var lastNames = ['Garcia', 'Quispe', 'Flores', 'Rojas', 'Torres', 'Vargas', 'Mendoza', 'Castillo', 'Ramirez', 'Chavez', 'Huaman', 'Salazar', 'Paredes', 'Espinoza', 'Reyes', 'Cruz'];
  var professions = ['Administracion', 'Arquitectura', 'Contabilidad', 'Derecho', 'Ingenieria', 'Marketing', 'Medicina', 'Docencia', 'Comercio', 'Diseño'];
  var locations = [
    { departamento: 'Lima', provincia: 'Lima', distrito: 'Miraflores' },
    { departamento: 'Lima', provincia: 'Lima', distrito: 'Santiago de Surco' },
    { departamento: 'Lima', provincia: 'Lima', distrito: 'San Miguel' },
    { departamento: 'Arequipa', provincia: 'Arequipa', distrito: 'Cayma' },
    { departamento: 'La Libertad', provincia: 'Trujillo', distrito: 'Victor Larco Herrera' },
    { departamento: 'Cusco', provincia: 'Cusco', distrito: 'Wanchaq' }
  ];
  var comments = [
    'Solicito informacion y se explico la propuesta comercial.',
    'Se confirmaron necesidades, presupuesto y plazo estimado.',
    'La persona pidio una llamada de seguimiento.',
    'Reunion realizada; se enviaron detalles por correo.',
    'Contacto efectivo y proximo paso coordinado.'
  ];
  var streetNames = ['Los Cedros', 'Las Palmeras', 'Arequipa', 'Javier Prado', 'Primavera', 'La Marina', 'El Sol'];
  var prospects = [];
  var interactions = [];
  var clients = [];
  var audits = [];
  var capturedTotal = 0;
  var contactedTotal = 0;
  var negotiations = 0;
  var scheduled = 0;
  var nowMs = now.getTime();
  var day = 86400000;
  var openResults = demoExcludeCatalog_(catalogs.RESULTADO, ['CAPTACION CERRADA', 'CONVERTIDO', 'CERRADO']);
  var openStates = demoExcludeCatalog_(catalogs['RESULTADO CITA'], ['CAPTACION CERRADA', 'CONVERTIDO', 'CERRADO']);

  for (var index = 0; index < count; index++) {
    var sequence = demoPad_(index + 1, 4);
    var prospectId = DEMO_ID_PREFIX + 'PRO-' + batch + '-' + sequence;
    var clientId = DEMO_ID_PREFIX + 'CLI-' + batch + '-' + sequence;
    var first = demoPick_(firstNames, random);
    var last1 = demoPick_(lastNames, random);
    var last2 = demoPick_(lastNames, random);
    var name = first + ' ' + last1 + ' ' + last2;
    var document = demoUniqueNumber_(usedDocuments, 8, random, '4');
    var phone = demoUniqueNumber_(usedPhones, 9, random, '9');
    var agent = agents[index % agents.length];
    var created = new Date(nowMs - Math.floor(random() * 180) * day - Math.floor(random() * 10) * 3600000);
    // Los primeros registros garantizan un flujo completo para cada agente:
    // seguimiento, captacion, negociacion, proxima cita y cliente.
    var mandatoryFlow = index < agents.length;
    var contacted = mandatoryFlow || random() >= 0.12;
    var captured = mandatoryFlow || (contacted && random() < 0.28);
    var hasClient = mandatoryFlow || (captured && random() < 0.72);
    var preCount = contacted ? (mandatoryFlow ? 2 : 1 + Math.floor(random() * 4)) : 0;
    var postCount = captured ? (mandatoryFlow ? 2 : Math.floor(random() * 3)) : 0;
    var location = demoPick_(locations, random);
    var latestDate = created;
    var captureDate = null;
    if (contacted) contactedTotal++;
    audits.push({ UsuarioDNI: String(agent.DNI), Accion: 'CREAR', Entidad: 'PROSPECTO', EntidadID: prospectId, FechaHora: created, Descripcion: DEMO_NOTE_TAG + ' Alta de ' + name });

    for (var pre = 0; pre < preCount; pre++) {
      var preDate = demoInteractionDate_(created, now, pre + 1, preCount + postCount + 1, random);
      latestDate = preDate;
      var isCaptureBoundary = captured && pre === preCount - 1;
      if (isCaptureBoundary) captureDate = preDate;
      var preNext = !captured && pre === preCount - 1 && random() < 0.72
        ? new Date(Math.max(preDate.getTime() + day, nowMs + Math.floor(random() * 15 - 3) * day))
        : '';
      var preInteraction = {
        ID: DEMO_ID_PREFIX + 'INT-' + batch + '-' + sequence + '-P' + demoPad_(pre + 1, 2),
        ProspectoID: prospectId,
        AgenteDNI: String(agent.DNI),
        FechaHoraContacto: preDate,
        FechaHora: preDate,
        Tipo: demoPick_(catalogs.REUNION, random),
        Resultado: isCaptureBoundary ? demoPreferred_(catalogs.RESULTADO, ['CAPTACION CERRADA', 'CONVERTIDO'], random) : demoPick_(openResults, random),
        Comentario: DEMO_NOTE_TAG + ' ' + demoPick_(comments, random),
        ProximoContacto: preNext,
        EstadoResultante: isCaptureBoundary ? demoPreferred_(catalogs['RESULTADO CITA'], ['CAPTACION CERRADA', 'CERRADO'], random) : demoPick_(openStates, random),
        Captacion: isCaptureBoundary ? 'SI' : 'NO',
        Etapa: 'PROSPECTO'
      };
      interactions.push(preInteraction);
      audits.push({ UsuarioDNI: String(agent.DNI), Accion: 'REGISTRAR', Entidad: 'INTERACCION', EntidadID: preInteraction.ID, FechaHora: preDate, Descripcion: DEMO_NOTE_TAG + ' Seguimiento de ' + name });
      if (preNext) scheduled++;
      if (isCaptureBoundary) audits.push({ UsuarioDNI: String(agent.DNI), Accion: 'CAPTAR', Entidad: 'PROSPECTO', EntidadID: prospectId, FechaHora: preDate, Descripcion: DEMO_NOTE_TAG + ' Captacion de ' + name });
    }

    for (var post = 0; post < postCount; post++) {
      var postDate = demoInteractionDate_(captureDate || created, now, post + 1, postCount + 1, random);
      if (postDate <= latestDate) postDate = new Date(Math.min(nowMs, latestDate.getTime() + (post + 1) * day));
      latestDate = postDate;
      var postNext = post === postCount - 1 && (mandatoryFlow || random() < 0.65)
        ? new Date(nowMs + Math.floor(random() * 20 + 1) * day + 11 * 3600000)
        : '';
      var postInteraction = {
        ID: DEMO_ID_PREFIX + 'INT-' + batch + '-' + sequence + '-N' + demoPad_(post + 1, 2),
        ProspectoID: prospectId,
        AgenteDNI: String(agent.DNI),
        FechaHoraContacto: postDate,
        FechaHora: postDate,
        Tipo: demoPick_(catalogs.REUNION, random),
        Resultado: demoPick_(catalogs.CAPTADO_RESULTADO, random),
        Comentario: DEMO_NOTE_TAG + ' Seguimiento posterior a la captacion.',
        ProximoContacto: postNext,
        EstadoResultante: demoPick_(catalogs.CAPTADO_CITA, random),
        Captacion: 'SI',
        Etapa: 'NEGOCIACION'
      };
      interactions.push(postInteraction);
      audits.push({ UsuarioDNI: String(agent.DNI), Accion: 'REGISTRAR', Entidad: 'INTERACCION', EntidadID: postInteraction.ID, FechaHora: postDate, Descripcion: DEMO_NOTE_TAG + ' Negociacion de ' + name });
      negotiations++;
      if (postNext) scheduled++;
    }

    if (captured) capturedTotal++;
    var birthYear = 1965 + Math.floor(random() * 34);
    var birthDate = new Date(birthYear, Math.floor(random() * 12), 1 + Math.floor(random() * 27));
    var emailSlug = demoSlug_(first + '.' + last1);
    var prospect = {
      ID: prospectId,
      Nombre: name,
      Documento: document,
      Telefono: phone,
      Correo: emailSlug + '.' + sequence + '@ejemplo.test',
      Canal: demoPick_(catalogs.CANAL, random),
      AgenteDNI: String(agent.DNI),
      FechaCreacion: created,
      FechaActualizacion: latestDate,
      Observaciones: DEMO_NOTE_TAG + ' Registro ficticio del lote ' + batch + '.',
      FechaNacimiento: captured ? birthDate : '',
      Profesion: captured ? demoPick_(professions, random) : '',
      Pais: captured ? 'PE' : '',
      Departamento: captured ? location.departamento : '',
      Provincia: captured ? location.provincia : '',
      Distrito: captured ? location.distrito : '',
      Direccion: captured ? 'Av. ' + demoPick_(streetNames, random) + ' ' + (100 + Math.floor(random() * 1800)) : '',
      Notas: captured ? DEMO_NOTE_TAG + ' Perfil completado para demostracion.' : '',
      ClienteID: hasClient ? clientId : '',
      Captado: captured ? 'SI' : 'NO'
    };
    prospects.push(prospect);

    if (hasClient) {
      for (var latestIndex = interactions.length - 1; latestIndex >= 0; latestIndex--) {
        if (String(interactions[latestIndex].ProspectoID) !== prospectId) continue;
        interactions[latestIndex].EstadoResultante = 'CLIENTE';
        interactions[latestIndex].Etapa = 'CLIENTE';
        break;
      }
      var client = {
        ID: clientId,
        ProspectoID: prospectId,
        Nombre: name,
        Documento: document,
        Telefono: phone,
        Correo: prospect.Correo,
        FechaCierre: captureDate || latestDate,
        Estado: 'ACTIVO',
        AgenteDNI: String(agent.DNI)
      };
      clients.push(client);
      audits.push({ UsuarioDNI: String(agent.DNI), Accion: 'CONVERTIR', Entidad: 'PROSPECTO', EntidadID: prospectId, FechaHora: client.FechaCierre, Descripcion: DEMO_NOTE_TAG + ' Cliente ' + clientId });
    }
  }

  return {
    prospects: prospects,
    interactions: interactions,
    clients: clients,
    audits: audits,
    captured: capturedTotal,
    contacted: contactedTotal,
    newProspects: count - contactedTotal,
    negotiations: negotiations,
    scheduled: scheduled
  };
}

function demoAppendRecords_(sheet, records) {
  if (!records.length) return;
  var headers = getHeaders_(sheet);
  var startRow = sheet.getLastRow() + 1;
  var requiredLastRow = startRow + records.length - 1;
  if (requiredLastRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  var values = records.map(function (record) {
    return headers.map(function (header) {
      return sheetDateValue_(header, record[header] === undefined ? '' : record[header]);
    });
  });
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
  headers.forEach(function (header, index) {
    if (DATE_COLUMN_FORMATS[header]) sheet.getRange(startRow, index + 1, values.length, 1).setNumberFormat(DATE_COLUMN_FORMATS[header]);
  });
}

function demoDeleteRows_(sheet, predicate) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var headers = getHeaders_(sheet);
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  var rows = [];
  values.forEach(function (valuesRow, index) {
    var record = {};
    headers.forEach(function (header, column) { record[header] = valuesRow[column]; });
    if (predicate(record)) rows.push(index + 2);
  });
  if (!rows.length) return 0;

  var groups = [];
  rows.forEach(function (row) {
    var last = groups[groups.length - 1];
    if (last && row === last.start + last.count) last.count++;
    else groups.push({ start: row, count: 1 });
  });
  for (var index = groups.length - 1; index >= 0; index--) sheet.deleteRows(groups[index].start, groups[index].count);
  return rows.length;
}

function demoWriteLog_(ss, fn, result, detail) {
  var actions = [];
  var sheet = ensureSheetAndHeaders_(ss, UPDATE_LOG_SHEET_NAME, UPDATE_LOG_HEADERS, actions);
  writeSheetRecord_(sheet, 0, { Fecha: new Date(), 'Función': fn, Resultado: result, Detalle: detail });
}

function demoUsedValues_(sheet, header) {
  var used = {};
  crmObjects_(sheet).forEach(function (row) {
    var value = String(row[header] || '').trim();
    if (value) used[value] = true;
  });
  return used;
}

function demoUniqueNumber_(used, length, random, firstDigit) {
  var value = '';
  do {
    value = firstDigit || String(1 + Math.floor(random() * 9));
    while (value.length < length) value += String(Math.floor(random() * 10));
  } while (used[value]);
  used[value] = true;
  return value;
}

function demoInteractionDate_(start, end, position, total, random) {
  var startMs = start.getTime();
  var available = Math.max(end.getTime() - startMs, 3600000);
  var fraction = Math.min(0.98, (position + random() * 0.35) / Math.max(total, 1));
  return new Date(startMs + Math.floor(available * fraction));
}

function demoPreferred_(values, preferred, random) {
  for (var p = 0; p < preferred.length; p++) {
    var key = crmLabelKey_(preferred[p]);
    for (var index = 0; index < values.length; index++) if (crmLabelKey_(values[index]) === key) return values[index];
  }
  return demoPick_(values, random);
}

function demoExcludeCatalog_(values, excluded) {
  var keys = {};
  excluded.forEach(function (value) { keys[crmLabelKey_(value)] = true; });
  var filtered = values.filter(function (value) { return !keys[crmLabelKey_(value)]; });
  return filtered.length ? filtered : values;
}

function demoPick_(values, random) { return values[Math.floor(random() * values.length)]; }
function demoPad_(value, size) { var text = String(value); while (text.length < size) text = '0' + text; return text; }
function demoId_(value) { return String(value || '').indexOf(DEMO_ID_PREFIX) === 0; }
function demoSlug_(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, ''); }

/** PRNG simple para que cada lote mantenga una distribucion coherente. */
function demoRandom_(seed) {
  var state = Number(seed || 1) >>> 0;
  return function () {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
