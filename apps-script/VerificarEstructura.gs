/**
 * Verifica que todas las pestañas requeridas y sus cabeceras coincidan con el
 * esquema actual. Esta función es exclusivamente de lectura: no crea hojas,
 * no añade columnas, no cambia cabeceras y no escribe registros.
 *
 * Ejecútala manualmente desde Apps Script y revisa el Registro de ejecución.
 */
function VerificarEstructuraHojas() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var esquemas = [
    { nombre: USERS_SHEET_NAME, cabeceras: USERS_HEADERS },
    { nombre: SETTINGS_SHEET_NAME, cabeceras: SETTINGS_HEADERS },
    { nombre: UPDATE_LOG_SHEET_NAME, cabeceras: UPDATE_LOG_HEADERS }
  ];

  Object.keys(CRM_SHEETS).forEach(function (key) {
    esquemas.push({ nombre: CRM_SHEETS[key].name, cabeceras: CRM_SHEETS[key].headers });
  });

  var errores = [];
  esquemas.forEach(function (esquema) {
    verificarCabecerasDeHoja_(ss, esquema.nombre, esquema.cabeceras, errores);
  });

  if (!errores.length) {
    Logger.log('[VerificarEstructuraHojas] OK: todas las pestañas y cabeceras coinciden con el esquema esperado. No se modificó nada.');
    return { ok: true, errores: [] };
  }

  Logger.log('[VerificarEstructuraHojas] Se encontraron ' + errores.length + ' problema(s). No se modificó nada.');
  errores.forEach(function (error) {
    Logger.log('[VerificarEstructuraHojas] ' + error);
  });
  return { ok: false, errores: errores };
}

/** Compara una fila de cabeceras sin realizar ninguna escritura en la hoja. */
function verificarCabecerasDeHoja_(ss, nombreHoja, cabecerasEsperadas, errores) {
  var sheet = ss.getSheetByName(nombreHoja);
  if (!sheet) {
    errores.push('Falta la pestaña "' + nombreHoja + '". Se esperaban las cabeceras: ' + cabecerasEsperadas.join(', ') + '.');
    return;
  }

  var ultimaColumna = sheet.getLastColumn();
  if (!ultimaColumna) {
    errores.push('La pestaña "' + nombreHoja + '" no tiene cabeceras. Se esperaban: ' + cabecerasEsperadas.join(', ') + '.');
    return;
  }

  var cabecerasActuales = sheet.getRange(1, 1, 1, ultimaColumna).getDisplayValues()[0]
    .map(function (valor) { return String(valor || '').trim(); });
  var posiciones = {};
  cabecerasActuales.forEach(function (cabecera, indice) {
    if (!cabecera) {
      errores.push('Pestaña "' + nombreHoja + '": cabecera vacía en la columna ' + (indice + 1) + '.');
      return;
    }
    if (!posiciones[cabecera]) posiciones[cabecera] = [];
    posiciones[cabecera].push(indice + 1);
  });

  cabecerasEsperadas.forEach(function (esperada, indice) {
    var columnaEsperada = indice + 1;
    var actual = cabecerasActuales[indice] || '';
    var posicionesActuales = posiciones[esperada] || [];
    if (!posicionesActuales.length) {
      errores.push('Pestaña "' + nombreHoja + '": falta la cabecera "' + esperada + '" (columna esperada ' + columnaEsperada + ').');
    } else if (actual !== esperada) {
      errores.push('Pestaña "' + nombreHoja + '": la cabecera "' + esperada + '" está en la columna ' + posicionesActuales.join(', ') + ' y debería estar en la ' + columnaEsperada + '.');
    }
  });

  Object.keys(posiciones).forEach(function (cabecera) {
    if (posiciones[cabecera].length > 1) {
      errores.push('Pestaña "' + nombreHoja + '": la cabecera "' + cabecera + '" está duplicada en las columnas ' + posiciones[cabecera].join(', ') + '.');
    }
    if (cabecerasEsperadas.indexOf(cabecera) === -1) {
      errores.push('Pestaña "' + nombreHoja + '": cabecera no reconocida "' + cabecera + '" en la(s) columna(s) ' + posiciones[cabecera].join(', ') + '.');
    }
  });
}
