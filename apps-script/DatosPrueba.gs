/**
 * Generador masivo de datos de demostracion para Sistema RX.
 *
 * Este archivo debe vivir en el mismo proyecto de Apps Script que Code.gs.
 * Usa las cabeceras y catalogos reales, escribe por lotes y reparte los
 * prospectos entre las cuentas del equipo comercial. Los prospectos, las
 * interacciones, los clientes y las auditorias quedan marcados, por lo que
 * EliminarDatosPrueba() puede retirarlos sin tocar datos reales. Las cuentas
 * del equipo NO se marcan y por eso nunca se borran con esa limpieza.
 */
var DEMO_DEFAULT_PROSPECTS = 300;
var DEMO_MAX_PROSPECTS = 1000;
var DEMO_ID_PREFIX = 'DEMO-';
var DEMO_NOTE_TAG = '[DATOS_DEMO]';

/**
 * Equipo comercial real. La clave inicial de cada cuenta es su propio DNI,
 * guardada con el mismo hash que usa el alta normal de usuarios.
 *
 * Correo y Celular quedan vacios a proposito: mientras no haya canal de
 * entrega, ninguna de estas altas dispara el correo de invitacion. Cuando toque
 * enviarlo, se completa el contacto y se usa el alta de usuarios de la app.
 *
 * El corte entre nombres y apellidos sigue la convencion peruana (los ultimos
 * dos terminos son los apellidos, respetando particulas como DE LA CRUZ,
 * SAL Y ROSAS o SANTA CRUZ). Conviene revisarlo con la persona interesada
 * antes de entregar los accesos.
 */
var EQUIPO_COMERCIAL = [
  { dni: '47720070', nombres: 'ALEXANDER', apellidos: 'DE LA CRUZ AYALA' },
  { dni: '73150289', nombres: 'ALEXANDER', apellidos: 'REYES' },
  { dni: '44544360', nombres: 'ALLAN JAVIER', apellidos: 'SUAREZ BARRIOS' },
  { dni: '43993306', nombres: 'CINTHYA', apellidos: 'ORDOÑEZ BUSTINZA' },
  { dni: '44048405', nombres: 'CINTIA', apellidos: 'BLAS RIOS' },
  { dni: '07736160', nombres: 'CLAUDIO', apellidos: 'GARCES CALDERON' },
  { dni: '42077508', nombres: 'DALIA', apellidos: 'CARRANZA HUARI' },
  { dni: '61007868', nombres: 'DANILHO', apellidos: 'CAMPOS' },
  { dni: '43766951', nombres: 'ERIKA', apellidos: 'CHIPANA CARPIO' },
  { dni: '10231919', nombres: 'FLORA SANDRA', apellidos: 'YARASCA EVANAN' },
  { dni: '08141536', nombres: 'GLORIA', apellidos: 'PRADO ANYOZA' },
  { dni: '72561524', nombres: 'JAIR', apellidos: 'RIVERA YNGUNZA' },
  { dni: '09969114', nombres: 'JESSICA', apellidos: 'SAL Y ROSAS TORRES' },
  { dni: '17433635', nombres: 'JOSE', apellidos: 'NIÑO RIOJAS' },
  { dni: '25704902', nombres: 'KARIM CLAUDIA', apellidos: 'MARRUFFO SAENZ' },
  { dni: '10290112', nombres: 'KARINA', apellidos: 'RIVERA AGUILAR' },
  { dni: '42195085', nombres: 'LISETH', apellidos: 'YUPANQUI NAVARRO' },
  { dni: '40399225', nombres: 'LIZ', apellidos: 'CERNA COLLANTES' },
  { dni: '10620377', nombres: 'LIZBETH', apellidos: 'PASTOR AGUILERA' },
  { dni: '09328187', nombres: 'LUIS ALBERTO', apellidos: 'HUAMAN VEGA' },
  { dni: '42523483', nombres: 'MARYURI', apellidos: 'BASURCO BOCANEGRA' },
  { dni: '40699456', nombres: 'MARIELLA', apellidos: 'ALARCON SOLDEVILLA' },
  { dni: '16783121', nombres: 'NANDRA', apellidos: 'PRECIADO MERINO' },
  { dni: '40011855', nombres: 'OMAR', apellidos: 'VALDIZAN' },
  { dni: '31653786', nombres: 'RAFAEL', apellidos: 'CASTILLO PALACIOS' },
  { dni: '10194640', nombres: 'ROXANA', apellidos: 'JIMENEZ CASTELO' },
  { dni: '09622534', nombres: 'SIMONA', apellidos: 'QUICAÑA CORDOVA' },
  { dni: '07129580', nombres: 'SONIA', apellidos: 'RIOS' },
  { dni: '42034489', nombres: 'VIVIANA LUJAN', apellidos: 'RIPOLL CORNEJO' },
  { dni: '01162499', nombres: 'YSABEL BERTHA', apellidos: 'NUÑEZ YSHUIZA' },
  { dni: '47678979', nombres: 'MIRIAN', apellidos: 'GARCIA ALBERCA' },
  { dni: '41273432', nombres: 'YSABEL MAGALI', apellidos: 'ROMERO CASQUINO' },
  { dni: '07194777', nombres: 'ANTONIO JOSE', apellidos: 'GOMEZ SANCHEZ HONORIO' },
  { dni: '09706339', nombres: 'PATRICIA FLOR', apellidos: 'COLLAZOS HUARICAPCHA' },
  { dni: '43810061', nombres: 'JANETTE MILAGROS', apellidos: 'DUEÑAS MENDOZA' },
  { dni: '77535045', nombres: 'RONALDO VLADIMIR', apellidos: 'MENDOZA NESTARES' },
  { dni: '10149750', nombres: 'MARICELLA ZOILA', apellidos: 'CARBAJAL RUIZ' },
  { dni: '06944830', nombres: 'CONSUELO IRIS', apellidos: 'MARRUJO ASTETE' },
  { dni: '44180378', nombres: 'HORTENCIA MILAGROS', apellidos: 'HUIZA AGUILAR' },
  { dni: '73684564', nombres: 'LUIS MARCELO LORENZO', apellidos: 'VARILLAS MARRUJO' },
  { dni: '75729547', nombres: 'BRITNEY GIANELLA', apellidos: 'LLAJA CHAVEZ' },
  { dni: '74090024', nombres: 'WILLIAM ROBERTO', apellidos: 'SANTA CRUZ SALDAÑA' },
  { dni: '09909085', nombres: 'LISSETTE EMILAR', apellidos: 'LOYOLA ESPINOZA' }
];

/**
 * Da de alta al equipo comercial sin generar prospectos y sin enviar ningun
 * correo de invitacion. Es idempotente: los DNI que ya existen se respetan tal
 * como estan, no se sobrescriben nombres, estado ni contraseña.
 */
function AgregarUsuariosEquipo() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ensureSheetAndHeaders_(ss, USERS_SHEET_NAME, USERS_HEADERS, []);
    var team = equipoEnsureUsers_(sheet, new Date());
    SpreadsheetApp.flush();
    var detail = 'Equipo comercial: ' + team.created.length + ' cuentas creadas y ' + team.existing.length + ' ya existentes de ' + EQUIPO_COMERCIAL.length + '. Clave inicial igual al DNI; no se envio correo de invitacion.';
    demoWriteLog_(ss, 'AgregarUsuariosEquipo', 'Completado', detail);
    ss.toast(detail, 'Usuarios del equipo', 8);
    Logger.log('[AgregarUsuariosEquipo] ' + detail);
    return {
      status: 'ok',
      total: EQUIPO_COMERCIAL.length,
      creados: team.created.length,
      existentes: team.existing.length,
      correoEnviado: false,
      nuevos: team.created.map(function (record) { return record.DNI; })
    };
  } finally {
    lock.releaseLock();
  }
}

/** Crea el equipo comercial y 300 prospectos con todo su flujo relacionado. */
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
    var demoTeam = demoEnsureUsers_(prepared.users, Math.min(EQUIPO_COMERCIAL.length, cantidad), now);
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

    var detail = 'Lote ' + batch + ': ' + agents.length + ' agentes del equipo (' + demoTeam.created + ' nuevos), ' + data.prospects.length + ' prospectos (' + data.newProspects + ' nuevos y ' + data.contacted + ' contactados), ' + data.interactions.length + ' interacciones, ' + data.negotiations + ' negociaciones, ' + data.scheduled + ' proximas citas, ' + data.captured + ' captados y ' + data.clients.length + ' clientes.';
    demoWriteLog_(ss, 'GenerarDatosPrueba', 'Completado', detail);
    ss.toast(detail, 'Datos de prueba listos', 8);
    Logger.log('[GenerarDatosPrueba] ' + detail);
    return {
      status: 'ok',
      lote: batch,
      usuariosEquipo: agents.length,
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
 * Da de alta a quien falte de EQUIPO_COMERCIAL y devuelve las cuentas activas
 * del equipo. Nunca modifica una fila existente: si el DNI ya esta en la hoja
 * se respeta su nombre, su estado y su contraseña actuales.
 *
 * No envia correos. `deliverCredentials_()` solo se dispara desde el alta de
 * usuarios de la app, y aqui no se invoca ni se guarda un correo de contacto.
 */
function equipoEnsureUsers_(sheet, now) {
  var byDni = {};
  crmObjects_(sheet).forEach(function (row) { byDni[equipoDni_(row.DNI)] = row; });
  var created = [];
  var existing = [];
  var agents = [];

  EQUIPO_COMERCIAL.forEach(function (member) {
    var current = byDni[member.dni];
    if (current) {
      existing.push(current);
      if (getValidEstado_(current.Estado) === 'ACTIVO') agents.push({ DNI: member.dni, Nombres: String(current.Nombres || member.nombres), Apellidos: String(current.Apellidos || member.apellidos) });
      return;
    }
    created.push({
      DNI: member.dni,
      Apellidos: member.apellidos,
      Nombres: member.nombres,
      Estado: 'ACTIVO',
      TipoUsuario: 'USUARIO',
      FechaRegistro: now,
      UltimoAcceso: '',
      Dispositivo: '',
      Correo: '',
      Celular: '',
      Pass: hashPassword_(member.dni)
    });
    agents.push({ DNI: member.dni, Nombres: member.nombres, Apellidos: member.apellidos });
  });

  demoAppendRecords_(sheet, created, ['DNI']);
  return { agents: agents, created: created, existing: existing };
}

/**
 * Los DNI que empiezan por cero se guardaron alguna vez como numero y perdieron
 * el cero inicial. Se recupera al comparar para no duplicar esas cuentas.
 */
function equipoDni_(value) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (!/^\d{1,8}$/.test(text)) return text;
  while (text.length < 8) text = '0' + text;
  return text;
}

/** Los prospectos del lote se reparten entre las cuentas reales del equipo. */
function demoEnsureUsers_(sheet, count, now) {
  var team = equipoEnsureUsers_(sheet, now);
  if (!team.agents.length) throw new Error('No hay cuentas activas del equipo comercial para asignar los prospectos.');
  count = Math.max(1, Math.min(team.agents.length, Math.floor(Number(count || team.agents.length))));
  return { agents: team.agents.slice(0, count), created: team.created.length };
}

/**
 * Identifica a los agentes ficticios de versiones anteriores del generador, los
 * unicos usuarios que EliminarDatosPrueba() puede retirar. Las cuentas de
 * EQUIPO_COMERCIAL son personas reales: no llevan marca y nunca se borran.
 */
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

/**
 * `textHeaders` fuerza el formato texto antes de escribir. Sin el, Sheets
 * interpreta '07736160' como el numero 7736160 y esa cuenta ya no supera la
 * validacion de ocho digitos al iniciar sesion.
 */
function demoAppendRecords_(sheet, records, textHeaders) {
  if (!records.length) return;
  var headers = getHeaders_(sheet);
  var startRow = sheet.getLastRow() + 1;
  var requiredLastRow = startRow + records.length - 1;
  if (requiredLastRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), requiredLastRow - sheet.getMaxRows());
  if (textHeaders && textHeaders.length) {
    textHeaders.forEach(function (header) {
      var column = headers.indexOf(header);
      if (column !== -1) sheet.getRange(startRow, column + 1, records.length, 1).setNumberFormat('@');
    });
    SpreadsheetApp.flush();
  }
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
