const SHEET_ID = '11DiE789WIVqIybKTPapayS5XEWHtcAXUiUA11KBQUQc';

/**
 * ============================================================================
 *  Co-desarrolladores-Yod  —  Backend (Google Apps Script)
 * ============================================================================
 *  Que es esto:
 *  Este archivo es el "cerebro" del portal de control financiero de
 *  co-desarrolladores (inversionistas) de YoDesarrollo SAPI de C.V.
 *
 *  Funciona como una pequena API (un servicio web) que:
 *    - Lee y escribe en un Google Sheet privado (la base de datos).
 *    - Hace de "portero": cada accion exige una credencial (contrasena de
 *      admin o clave de inversionista) y SOLO entrega lo que corresponde.
 *
 *  Reglas importantes (no tecnicas):
 *    - La contrasena de admin NO vive aqui en el codigo. Vive guardada en
 *      las "Propiedades del Script" (PropertiesService), bajo la clave
 *      'ADMIN_PASS'. Por eso el codigo se puede tener en un repo publico.
 *    - El inversionista entra con su propia "claveAcceso" (guardada en el
 *      Sheet) y solo ve SUS datos. Nunca ve los de otros.
 *    - Respondemos siempre en formato JSON, sin tocar encabezados HTTP
 *      (Apps Script no lo permite con ContentService).
 * ============================================================================
 */

// ---------------------------------------------------------------------------
//  ZONA HORARIA DEL NEGOCIO (Hermosillo, Sonora = America/Hermosillo)
// ---------------------------------------------------------------------------
//  La usamos para formatear las fechas como texto "yyyy-MM-dd" (sin hora),
//  asi el front las puede meter directo en los <input type="date"> y no se
//  rompen ni se borran al editar.
const TZ = 'America/Hermosillo';

// ---------------------------------------------------------------------------
//  URL DEL PORTAL (sitio publico en GitHub Pages)
// ---------------------------------------------------------------------------
//  La usamos en los correos (recuperar clave, avisar avance) y para armar el
//  link magico de acceso. Es una sola constante para no repetirla.
const PORTAL_URL = 'https://alexpueblag.github.io/Co-desarrolladores-Yod/';

// ---------------------------------------------------------------------------
//  CONFIGURACION DE LAS PESTANAS (HOJAS) DEL SHEET
// ---------------------------------------------------------------------------
//  Aqui definimos como se llama cada hoja, cual es su columna llave
//  (keyField) y que encabezados (columnas) lleva, en orden.
//  Si algun dia agregas una columna, agregala aqui y en setup().
const TABS = {
  Inversionistas: {
    keyField: 'id',
    headers: ['id', 'nombre', 'telefono', 'email', 'claveAcceso', 'notas', 'creado'],
    prefix: 'INV-'
  },
  Proyectos: {
    keyField: 'id',
    // 'plusvaliaKey'/'etapaPrecio' (al FINAL): para proyectos tipo terreno cuyo
    // valor sube por etapa de precio. plusvaliaKey mapea a la hoja de precios
    // (ej. 'real-miramar'); etapaPrecio es la etapa ACTUAL del proyecto (aplica
    // a TODOS sus codesarrolladores). Vacios = el proyecto no usa plusvalia.
    headers: ['id', 'nombre', 'tipo', 'etapaActual', 'banco', 'beneficiario', 'cuenta', 'clabe', 'conceptoBase', 'descripcion', 'estado', 'creado', 'plusvaliaKey', 'etapaPrecio'],
    prefix: 'PRY-'
  },
  Inversiones: {
    keyField: 'folio',
    // 'tramos' (al FINAL para no recorrer datos): JSON opcional con la tabla de
    // retorno por tramos segun el mes de venta (ej. [{"desde":1,"hasta":6,"pct":12.5}]).
    // Si esta vacio, la inversion usa la tasa anual normal (tasaAnual).
    // 'precioEntrada' (al FINAL): para inversiones en proyectos de plusvalia, es
    // el precio POR M2 al que entro ESTE codesarrollador (a mano, ej. Fundador I
    // que no esta en la hoja). El valor sube vs la etapa actual del proyecto.
    // 'precioSalida': precio POR M2 al que se LIQUIDO (cuando estado=Liquidada);
    // congela el valor para que no siga cambiando si el proyecto avanza de etapa.
    // (plusvaliaKey/etapaEntrada/etapaActual quedaron de una version previa; ya
    // no se usan: la config de plusvalia vive en el PROYECTO.)
    headers: ['folio', 'inversionistaId', 'proyectoId', 'montoTotal', 'fechaInicio', 'fechaSalida', 'tasaAnual', 'estado', 'notas', 'creado', 'tramos', 'plusvaliaKey', 'etapaEntrada', 'etapaActual', 'precioEntrada', 'precioSalida'],
    prefix: '' // el folio lo escribe el usuario (ej. CA-HM-2026-01); es obligatorio
  },
  Aportaciones: {
    keyField: 'id',
    // 'montoReportado' (al FINAL): lo que el codesarrollador dice que deposito
    // (puede diferir del 'monto' programado, ej. un pago parcial). El admin lo
    // ve al validar y decide. Si esta vacio, se asume el monto programado.
    headers: ['id', 'folio', 'numeroPago', 'totalPagos', 'concepto', 'fechaProgramada', 'monto', 'fechaRecibida', 'estado', 'comprobanteUrl', 'referencia', 'fechaReporte', 'creado', 'montoReportado'],
    prefix: 'AP-'
  },
  Documentos: {
    keyField: 'id',
    headers: ['id', 'folio', 'tipo', 'nombre', 'url', 'fecha', 'creado'],
    prefix: 'DOC-'
  },
  Avances: {
    keyField: 'id',
    headers: ['id', 'proyectoId', 'tipo', 'etapa', 'url', 'titulo', 'descripcion', 'fecha', 'creado'],
    prefix: 'AVN-'
  },
  Bitacora: {
    keyField: 'id',
    headers: ['id', 'proyectoId', 'fecha', 'autor', 'etiqueta', 'titulo', 'nota', 'creado'],
    prefix: 'BIT-'
  },
  // Asesores: personas del equipo (ej. ventas) con acceso PROPIO y limitado.
  // Entran con su 'claveAcceso' y solo gestionan avances/bitacora de los
  // proyectos que tengan asignados en 'proyectoIds' (lista separada por comas).
  // NUNCA ven nada financiero (montos, CLABE, codesarrolladores).
  Asesores: {
    keyField: 'id',
    headers: ['id', 'nombre', 'email', 'claveAcceso', 'proyectoIds', 'creado'],
    prefix: 'ASR-'
  },
  // Referidos: invitaciones que hace un codesarrollador. Si su invitado
  // participa, el referidor recibe +1% sobre su aportacion al devolver capital.
  // El portal solo CAPTURA y avisa; el +1% lo aplica el admin manualmente.
  Referidos: {
    keyField: 'id',
    headers: ['id', 'referidorId', 'referidorNombre', 'nombreProspecto', 'contacto', 'nota', 'estado', 'creado'],
    prefix: 'REF-'
  }
};

// ---------------------------------------------------------------------------
//  CORREO DEL ADMINISTRADOR (a donde llegan dudas y avisos de referidos)
// ---------------------------------------------------------------------------
//  Se puede sobre-escribir en Propiedades del Script con la clave 'ADMIN_EMAIL'.
//  Si no esta, usa el correo de la direccion (no es un secreto).
function correoAdmin() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || 'direccion@aurumarquitectos.com';
}

// ---------------------------------------------------------------------------
//  PRECIOS DE PLUSVALIA (se leen EN VIVO de la hoja de precios de Alejandro)
// ---------------------------------------------------------------------------
//  Para proyectos tipo terreno/lote (Real Miramar, Dunas), el valor del
//  codesarrollador sube segun la ETAPA de precio ($/m2). Esos precios viven en
//  OTRA hoja (la "carpeta de inversion"), para tener un solo lugar. Aqui la
//  leemos por su ID, buscamos la pestana de proyectos (la que trae 'pv_venta')
//  y devolvemos un mapa { 'real-miramar': { nombre, etapas:{fund2, preventa1,
//  preventa2, venta, mercado24} } }. Se cachea 10 min para no leerla en cada
//  request, y si algo falla devuelve {} (el front lo maneja sin romperse).
const PRECIOS_SHEET_ID = '11tkKgl4W3ugthjWh80ZxHfT_PXSH_rPbCVmwM9l3CeU';
const ETAPAS_PLUSVALIA = [
  { key: 'fund2', col: 'pv_fund2', label: 'Fundador II' },
  { key: 'preventa1', col: 'pv_preventa1', label: 'Preventa I' },
  { key: 'preventa2', col: 'pv_preventa2', label: 'Preventa II' },
  { key: 'venta', col: 'pv_venta', label: 'Venta' },
  { key: 'mercado24', col: 'pv_mercado24', label: 'Mercado (24m)' }
];

function leerPreciosPlusvalia() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('precios_plusvalia');
  if (hit) { try { return JSON.parse(hit); } catch (e) { /* sigue y relee */ } }

  // Convierte una celda a numero, tolerando que ya sea numero o un string con
  // formato "$4,290" (coma = separador de miles). Devuelve 0 si no es valido.
  function aNumero(raw) {
    if (typeof raw === 'number') return isFinite(raw) ? raw : 0;
    const n = Number(String(raw).replace(/,/g, '').replace(/[^0-9.]/g, ''));
    return isFinite(n) ? n : 0;
  }

  const out = {};
  try {
    const ss = SpreadsheetApp.openById(PRECIOS_SHEET_ID);
    const hojas = ss.getSheets();
    for (let h = 0; h < hojas.length; h++) {
      const rango = hojas[h].getDataRange().getValues();
      if (!rango.length) continue;
      // Encabezados en minusculas para tolerar 'ID', 'PV_VENTA', espacios, etc.
      const headers = rango[0].map(function (x) { return String(x).trim().toLowerCase(); });
      const idxId = headers.indexOf('id');
      if (idxId < 0) continue; // sin columna 'id' no es la pestana de proyectos
      // Aceptar la pestana si trae AL MENOS UNA columna de etapa pv_*.
      const tieneAlgunaEtapa = ETAPAS_PLUSVALIA.some(function (e) { return headers.indexOf(e.col) >= 0; });
      if (!tieneAlgunaEtapa) continue;
      const idxNombre = headers.indexOf('nombre');
      for (let r = 1; r < rango.length; r++) {
        const fila = rango[r];
        const id = String(fila[idxId] || '').trim();
        if (!id) continue;
        const etapas = {};
        let tiene = false;
        ETAPAS_PLUSVALIA.forEach(function (e) {
          const c = headers.indexOf(e.col);
          const v = c >= 0 ? aNumero(fila[c]) : 0;
          if (v > 0) { etapas[e.key] = v; tiene = true; }
        });
        if (tiene) {
          out[id] = { nombre: idxNombre >= 0 ? String(fila[idxNombre] || id) : id, etapas: etapas };
        }
      }
      break; // ya encontramos la pestana correcta
    }
  } catch (e) {
    console.error('leerPreciosPlusvalia: ' + String(e));
  }
  // No envenenar el cache 10 min si fallo: si hay datos cachea 10 min, si no, 1 min
  // (para reintentar pronto un fallo transitorio de permisos/acceso).
  cache.put('precios_plusvalia', JSON.stringify(out), Object.keys(out).length ? 600 : 60);
  return out;
}

// ---------------------------------------------------------------------------
//  SETUP — preparar el Google Sheet (correr UNA sola vez desde el editor)
// ---------------------------------------------------------------------------
//  Que hace esta funcion (la corres a mano desde el editor de Apps Script):
//    1. Crea cada pestana que falte con sus encabezados, y congela la fila 1.
//    2. Si la hoja por defecto "Hoja 1" / "Sheet1" quedo vacia, la borra.
//    3. Si todavia no existe la contrasena de admin, la deja en un valor
//       temporal ('cambia-esta-clave') para que la cambies de inmediato.
//  Al terminar te devuelve un texto de confirmacion.
function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const mensajes = [];

  // 1) Crear/verificar cada pestana con sus encabezados.
  Object.keys(TABS).forEach(function (nombreHoja) {
    const conf = TABS[nombreHoja];
    let hoja = ss.getSheetByName(nombreHoja);

    if (!hoja) {
      hoja = ss.insertSheet(nombreHoja);
      mensajes.push('Creada la hoja "' + nombreHoja + '".');
    } else {
      mensajes.push('Ya existia la hoja "' + nombreHoja + '".');
    }

    // Escribir/asegurar los encabezados en la fila 1.
    hoja.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);
    hoja.setFrozenRows(1);

    // Blindar las columnas de fecha como TEXTO PLANO, para que Google Sheets
    // NO auto-convierta "2026-06-03" en un objeto Date con hora (lo que rompia
    // el round-trip y vaciaba los <input type="date"> al editar).
    formatearColumnasDeFechaComoTexto(hoja, conf.headers);

    // Blindar tambien los identificadores (CLABE, cuenta, telefono...) como
    // TEXTO, para que una CLABE de 18 digitos no pierda el cero inicial.
    protegerColumnasDeTextoComoTexto(hoja, conf.headers);
  });

  // 2) Borrar la hoja por defecto si quedo vacia y sin uso.
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (nombreDefault) {
    const h = ss.getSheetByName(nombreDefault);
    // Solo la borramos si no es una de nuestras pestanas y si esta vacia.
    if (h && !TABS[nombreDefault] && h.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(h);
      mensajes.push('Borrada la hoja vacia por defecto "' + nombreDefault + '".');
    }
  });

  // 3) Inicializar la contrasena de admin si todavia no existe.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASS')) {
    props.setProperty('ADMIN_PASS', 'cambia-esta-clave');
    mensajes.push('Se creo ADMIN_PASS con valor temporal "cambia-esta-clave". CAMBIALA YA desde Configuracion del proyecto > Propiedades del script.');
  } else {
    mensajes.push('ADMIN_PASS ya estaba configurada (no se toco).');
  }

  // 4) Re-alinear filas viejas de Proyectos que hayan quedado recorridas por
  //    haber agregado columnas a media hoja (deja CLABE/Cuenta en su lugar).
  mensajes.push(repararProyectos());

  return mensajes.join('\n');
}

// --- formatearColumnasDeFechaComoTexto: blinda columnas de fecha -----------
//  Pone en formato de TEXTO PLANO ("@") las columnas que guardan fechas, para
//  que el Sheet no las convierta en Date con hora. Asi conservamos siempre
//  "yyyy-MM-dd" tal cual lo manda el front.
function formatearColumnasDeFechaComoTexto(hoja, headers) {
  const columnasFecha = ['fechaInicio', 'fechaSalida', 'fechaProgramada', 'fechaRecibida', 'fecha'];
  const maxFilas = Math.max(hoja.getMaxRows() - 1, 1); // todas menos el encabezado
  headers.forEach(function (col, idx) {
    if (columnasFecha.indexOf(col) !== -1) {
      hoja.getRange(2, idx + 1, maxFilas, 1).setNumberFormat('@');
    }
  });
}

// --- protegerColumnasDeTextoComoTexto: blinda identificadores como TEXTO -----
//  Igual que las fechas, pero para columnas que son IDENTIFICADORES (no numeros
//  con los que se haga aritmetica): CLABE (18 digitos), cuenta, telefono, etc.
//  Si Sheets las tratara como numero, perderia el cero inicial de una CLABE y,
//  por su longitud, hasta la precision. Forzandolas a TEXTO se guardan tal cual.
function protegerColumnasDeTextoComoTexto(hoja, headers) {
  const columnasTexto = ['banco', 'beneficiario', 'cuenta', 'clabe', 'telefono', 'claveAcceso', 'tramos'];
  const maxFilas = Math.max(hoja.getMaxRows() - 1, 1);
  headers.forEach(function (col, idx) {
    if (columnasTexto.indexOf(col) !== -1) {
      hoja.getRange(2, idx + 1, maxFilas, 1).setNumberFormat('@');
    }
  });
}

// ---------------------------------------------------------------------------
//  REPARAR — re-alinea filas viejas de Proyectos (correr UNA vez)
// ---------------------------------------------------------------------------
//  En la Fase A insertamos las columnas 'tipo' y 'etapaActual' despues de
//  'nombre'. setup() solo reescribe la fila de ENCABEZADOS; no mueve los datos
//  ya escritos. Por eso un proyecto creado ANTES de ese cambio quedo con sus
//  valores recorridos 2 columnas a la derecha (el banco real cayo en 'tipo',
//  la cuenta en 'banco', la CLABE en 'beneficiario', y las columnas reales de
//  cuenta/clabe quedaron vacias). Resultado visible: el "proximo pago" del
//  cliente salia sin CLABE ni Cuenta.
//
//  Esta funcion detecta esas filas y las re-alinea, SIN tocar las que ya estan
//  bien. Detector seguro: una fila NUEVA siempre trae 'creado' (col 12) con un
//  timestamp ISO; una fila VIEJA recorrida tiene 'creado' vacio y el timestamp
//  cayo en 'descripcion' (col 10). Es idempotente: si la corres dos veces, la
//  segunda ya no encuentra nada que arreglar.
function repararProyectos() {
  const conf = TABS['Proyectos'];
  const hoja = obtenerHojaConEncabezados('Proyectos');

  // Blindar como TEXTO las columnas de identificadores ANTES de reescribir,
  // para que la CLABE de 18 digitos no se convierta en numero al guardarla.
  protegerColumnasDeTextoComoTexto(hoja, conf.headers);

  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 'Proyectos: no hay filas que revisar.';

  const valores = hoja.getRange(2, 1, ultimaFila - 1, conf.headers.length).getValues();
  let arregladas = 0;

  for (let r = 0; r < valores.length; r++) {
    const fila = valores[r];
    const creado = String(fila[11] !== undefined && fila[11] !== null ? fila[11] : '').trim();      // 'creado'
    const enDescripcion = String(fila[9] !== undefined && fila[9] !== null ? fila[9] : '').trim();  // 'descripcion'
    const pareceISO = /^\d{4}-\d{2}-\d{2}T/.test(enDescripcion);

    // Solo re-alineamos si esta claramente recorrida (creado vacio + timestamp
    // en descripcion). Cualquier otra fila se deja intacta.
    if (creado === '' && pareceISO) {
      // Esquema VIEJO (10 columnas), orden fisico A..J:
      //   id, nombre, banco, beneficiario, cuenta, clabe, conceptoBase,
      //   descripcion, estado, creado
      const nueva = {
        id:           fila[0],
        nombre:       fila[1],
        tipo:         '',   // no existia antes; se llena luego desde el admin
        etapaActual:  '',   // idem
        banco:        fila[2],
        beneficiario: fila[3],
        cuenta:       fila[4],
        clabe:        fila[5],
        conceptoBase: fila[6],
        descripcion:  fila[7],
        estado:       fila[8],
        creado:       fila[9]
      };
      const fixed = conf.headers.map(function (col) {
        const v = (nueva[col] !== undefined && nueva[col] !== null) ? nueva[col] : '';
        return sanitizarValor(v);
      });
      hoja.getRange(r + 2, 1, 1, conf.headers.length).setValues([fixed]);
      arregladas++;
    }
  }

  return arregladas === 0
    ? 'Proyectos: todo en orden, no habia filas recorridas.'
    : ('Proyectos re-alineados: ' + arregladas + '. Ya deberian verse CLABE y Cuenta en el portal del cliente.');
}

// ---------------------------------------------------------------------------
//  CONFIG UNICA — Real Miramar (plusvalia) + entrada de Miguel, correr UNA vez
// ---------------------------------------------------------------------------
//  Deja el proyecto Real Miramar como plusvalia en su etapa ACTUAL (Fundador II)
//  y el precio de ENTRADA de Miguel (Fundador I = $3,750/m2). Idempotente.
function configurarRealMiramar() {
  const msgs = [];
  const proy = leerHoja('Proyectos').filter(function (p) {
    return String(p.nombre).trim() === 'Real Miramar' || String(p.id).trim() === 'PRY-mq4o80o62d5g';
  })[0];
  if (proy) {
    proy.plusvaliaKey = 'real-miramar';
    proy.etapaPrecio = 'fund2'; // etapa actual del proyecto: Fundador II
    reescribirFila('Proyectos', proy);
    msgs.push('Real Miramar: plusvalia=real-miramar, etapa actual=Fundador II.');
  } else {
    msgs.push('No encontre el proyecto Real Miramar.');
  }
  const inv = leerHoja('Inversiones').filter(function (i) {
    return String(i.folio).trim() === 'RM-ME-2025-01';
  })[0];
  if (inv) {
    inv.precioEntrada = 3750; // Fundador I, a mano (no esta en la hoja de precios)
    reescribirFila('Inversiones', inv);
    msgs.push('Miguel (RM-ME-2025-01): precio de entrada $3,750/m2.');
  } else {
    msgs.push('No encontre la inversion RM-ME-2025-01.');
  }
  return msgs.join(' ');
}

// --- sumarMesesISO: suma n meses a una fecha "yyyy-MM-dd" (ajusta el dia) ----
function sumarMesesISO(iso, n) {
  const p = String(iso).split('-');
  const y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1, d = parseInt(p[2], 10);
  const destino = new Date(y, m + n, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(d, ultimoDia));
  const mm = String(destino.getMonth() + 1).padStart(2, '0');
  const dd = String(destino.getDate()).padStart(2, '0');
  return destino.getFullYear() + '-' + mm + '-' + dd;
}

// ---------------------------------------------------------------------------
//  CARGA UNICA — pagos de Miguel Reina (RM-ME-2025-01), correr UNA vez
// ---------------------------------------------------------------------------
//  Borra las aportaciones mal cargadas de ese folio (las 4 de $175,000 del
//  "Generar plan" + la suelta) y deja el plan correcto: 8 recibidas (historial
//  real, $230,000) + 14 por venir desde octubre 2026 ($470,000). Es seguro
//  re-correrla: primero borra TODAS las de ese folio y vuelve a crearlas.
function cargarPagosMiguel() {
  const folio = 'RM-ME-2025-01';
  const conf = TABS['Aportaciones'];
  const hoja = obtenerHojaConEncabezados('Aportaciones');

  // 1) Borrar todo lo que haya hoy de ese folio (de abajo hacia arriba).
  const idsBorrar = leerHoja('Aportaciones')
    .filter(function (a) { return String(a.folio).trim() === folio; })
    .map(function (a) { return String(a.id).trim(); });
  let borradas = 0;
  idsBorrar.forEach(function (id) {
    const fila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, id);
    if (fila > 0) { hoja.deleteRow(fila); borradas++; }
  });

  // 2) Historial ya pagado (se marca como recibido con su fecha real).
  const recibidas = [
    { fecha: '2025-04-20', monto: 35000, ref: 'transferencia' },
    { fecha: '2025-05-30', monto: 35000, ref: 'efectivo' },
    { fecha: '2025-06-25', monto: 25000, ref: 'transferencia' },
    { fecha: '2025-07-11', monto: 10000, ref: 'transferencia' },
    { fecha: '2025-07-15', monto: 35000, ref: 'transferencia' },
    { fecha: '2025-08-18', monto: 35000, ref: 'transferencia' },
    { fecha: '2025-09-15', monto: 35000, ref: 'transferencia' },
    { fecha: '2026-04-10', monto: 20000, ref: '2 transferencias' }
  ];

  // 3) Por venir: 13 de $35,000 + 1 final de $15,000, dia 20 desde 2026-10.
  const futuras = [];
  for (let i = 0; i < 14; i++) {
    futuras.push({ fecha: sumarMesesISO('2026-10-20', i), monto: (i < 13) ? 35000 : 15000 });
  }

  const total = recibidas.length + futuras.length; // 22
  let n = 0;
  recibidas.forEach(function (r) {
    n++;
    guardarFilaInterna('Aportaciones', {
      folio: folio, numeroPago: n, totalPagos: total, concepto: 'Aportacion ' + n,
      fechaProgramada: r.fecha, monto: r.monto, fechaRecibida: r.fecha,
      comprobanteUrl: '', referencia: r.ref, fechaReporte: ''
    });
  });
  futuras.forEach(function (f) {
    n++;
    guardarFilaInterna('Aportaciones', {
      folio: folio, numeroPago: n, totalPagos: total, concepto: 'Aportacion ' + n,
      fechaProgramada: f.fecha, monto: f.monto, fechaRecibida: '',
      comprobanteUrl: '', referencia: '', fechaReporte: ''
    });
  });

  return 'Listo Miguel (' + folio + '): borradas ' + borradas + ' viejas, creadas ' + total +
    ' (8 recibidas = $230,000, 14 por venir = $470,000).';
}

// ---------------------------------------------------------------------------
//  HELPER — generar una clave aleatoria para inversionistas
// ---------------------------------------------------------------------------
//  Genera una clave legible y dificil de adivinar (sin caracteres confusos
//  como 0/O o 1/l). Subimos la longitud a 15 caracteres (alfabeto de 31) para
//  resistir intentos de fuerza bruta, ya que es la unica barrera del
//  inversionista. La puedes usar desde el editor o el front la genera solo.
function generarClaveInversionista() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O, 0, I, 1, l
  let clave = '';
  for (let i = 0; i < 15; i++) {
    clave += abc.charAt(Math.floor(Math.random() * abc.length));
  }
  // Formato agrupado para que sea facil de dictar: ABCDE-FGHJK-LMNPQ
  return clave.slice(0, 5) + '-' + clave.slice(5, 10) + '-' + clave.slice(10);
}

// ---------------------------------------------------------------------------
//  AUTORIZAR CORREO — correr UNA vez desde el editor
// ---------------------------------------------------------------------------
//  Corre esta funcion una sola vez para autorizar el envio de correos
//  (Google te pedira un permiso nuevo la primera vez). Te llega un correo de
//  prueba a ti mismo. Asi la recuperacion de clave podra enviar correos a los
//  inversionistas.
function autorizarCorreo() {
  const correo = Session.getActiveUser().getEmail();
  MailApp.sendEmail(correo, 'Prueba de correo - Co-desarrolladores-Yod',
    'Listo: el portal ya puede enviar correos (para la recuperacion de clave). Este es solo un correo de prueba.');
  return 'Correo de prueba enviado a ' + correo;
}

// ---------------------------------------------------------------------------
//  doGet — prueba de vida (abrir la URL del Web App en el navegador)
// ---------------------------------------------------------------------------
//  Si abres la URL del despliegue en el navegador, deberias ver {"ok":true}.
function doGet(e) {
  return jsonResponse({ ok: true, service: 'Co-desarrolladores-Yod', ts: Date.now() });
}

// ---------------------------------------------------------------------------
//  doPost — la puerta principal del API
// ---------------------------------------------------------------------------
//  El frontend manda aqui todas las peticiones, como texto JSON en el cuerpo.
//  Leemos la "action" y decidimos que hacer. Todo va envuelto en un try/catch
//  para que cualquier error se devuelva como JSON y no rompa el front.
function doPost(e) {
  try {
    // Leer y parsear el cuerpo de la peticion (texto JSON).
    let body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    const action = body.action || '';

    switch (action) {
      // --- Publicas (no requieren credencial) ---
      case 'ping':
        return jsonResponse({ ok: true, service: 'Co-desarrolladores-Yod', ts: Date.now() });

      case 'adminLogin':
        return adminLogin(body);

      case 'loginConToken':
        return loginConToken(body);

      // --- Solo admin (validan ADMIN_PASS) ---
      case 'getAll':
        return getAll(body);

      case 'save':
        return save(body);

      case 'delete':
        return remove(body);

      case 'notificarAvance':
        return notificarAvance(body);

      case 'generarLinkAcceso':
        return generarLinkAcceso(body);

      // --- Inversionista (validan claveAcceso) ---
      case 'investorLogin':
        return investorLogin(body);

      case 'getMine':
        return getMine(body);

      case 'reportarPago':
        return reportarPago(body);

      case 'recuperarClave':
        return recuperarClave(body);

      case 'subirArchivo':
        return subirArchivo(body);

      case 'verComprobante':
        return verComprobante(body);

      // --- Autoservicio del codesarrollador (validan su claveAcceso) ---
      case 'cambiarClave':
        return cambiarClave(body);

      case 'actualizarMisDatos':
        return actualizarMisDatos(body);

      case 'enviarMensaje':
        return enviarMensaje(body);

      case 'registrarReferido':
        return registrarReferido(body);

      // --- Rol asesor (validan su claveAcceso de asesor) ---
      case 'asesorLogin':
        return asesorLogin(body);

      case 'getMineAsesor':
        return getMineAsesor(body);

      case 'guardarComoAsesor':
        return guardarComoAsesor(body);

      case 'eliminarComoAsesor':
        return eliminarComoAsesor(body);

      default:
        return jsonResponse({ ok: false, error: 'Accion no reconocida: ' + action });
    }
  } catch (err) {
    // Registramos el error REAL solo del lado servidor (para depurar), pero
    // al cliente publico le devolvemos un mensaje generico, para no filtrar
    // detalles internos (nombres de hoja, permisos, limites de cuota, etc.).
    console.error('Error en doPost: ' + String(err && err.stack ? err.stack : err));
    return jsonResponse({ ok: false, error: 'Ocurrio un error procesando la solicitud.' });
  }
}

// ===========================================================================
//  ACCIONES DEL API
// ===========================================================================

// --- adminLogin: verifica la contrasena de admin ---------------------------
//  Compara la contrasena que tecleo el usuario contra la guardada en las
//  Propiedades del Script. Mensaje generico si falla (no decimos por que).
function adminLogin(body) {
  { const rech = rechazoAdmin_(body); if (rech) return rech; }
  return jsonResponse({ ok: true, role: 'admin' });
}

// --- getAll: devuelve TODAS las filas de TODAS las hojas (solo admin) -------
function getAll(body) {
  { const rech = rechazoAdmin_(body); if (rech) return rech; }
  const data = {};
  Object.keys(TABS).forEach(function (nombreHoja) {
    data[nombreHoja] = leerHoja(nombreHoja);
  });
  data.preciosPlusvalia = leerPreciosPlusvalia();
  return jsonResponse({ ok: true, data: data });
}

// --- save: alta o edicion (upsert) por la columna llave (solo admin) -------
//  Si la fila trae llave y ya existe, la reemplaza (updated=true).
//  Si no trae llave, la genera (o exige folio en Inversiones) e inserta
//  (updated=false). Tambien rellena 'creado' si falta.
function save(body) {
  { const rech = rechazoAdmin_(body); if (rech) return rech; }
  return jsonResponse(guardarFilaInterna(body.tab, body.row));
}

// --- guardarFilaInterna: la logica real del upsert (SIN checar admin) -------
//  Se separa de save() para poder reusarla desde acciones autenticadas de otra
//  forma (rol asesor, referidos del codesarrollador). Devuelve un OBJETO plano
//  { ok:true, key, updated } o { ok:false, error } (no un jsonResponse), para
//  que quien la llame decida que hacer con el resultado.
function guardarFilaInterna(tab, rowIn) {
  const conf = TABS[tab];
  if (!conf) {
    return { ok: false, error: 'Pestana invalida: ' + String(tab) };
  }

  // La fila que llega (objeto {columna: valor}).
  const row = rowIn || {};
  const keyField = conf.keyField;
  let key = row[keyField];

  // Si no viene la llave, la generamos.
  if (key === undefined || key === null || String(key).trim() === '') {
    if (tab === 'Inversiones') {
      // El folio es obligatorio y legible (ej. CA-HM-2026-01); no se inventa.
      return { ok: false, error: 'El folio es obligatorio para crear una inversion.' };
    }
    key = conf.prefix + nuevoId();
    row[keyField] = key;
  } else {
    key = String(key).trim();
    row[keyField] = key;
  }

  const hoja = obtenerHojaConEncabezados(tab);
  const headers = conf.headers;

  // Buscar si ya existe una fila con esa llave.
  const indiceFila = buscarFilaPorLlave(hoja, headers, keyField, key);

  // Validar unicidad de la claveAcceso en las hojas con login (Inversionistas y
  // Asesores): dos con la MISMA clave provocarian suplantacion silenciosa.
  // claveYaEnUso revisa AMBAS hojas (no solo la propia), para que una clave no
  // quede valida en dos roles distintos.
  if (tab === 'Inversionistas' || tab === 'Asesores') {
    const claveNueva = row.claveAcceso !== undefined && row.claveAcceso !== null ? String(row.claveAcceso).trim() : '';
    if (claveNueva !== '' && claveYaEnUso(claveNueva, key, tab)) {
      return { ok: false, error: 'Esa clave de acceso ya esta en uso, genera otra.' };
    }
  }

  // Si no trae fecha de creacion, se la ponemos ahora (ISO).
  if (!row.creado || String(row.creado).trim() === '') {
    row.creado = new Date().toISOString();
  }

  // Armar el arreglo de valores en el ORDEN de los encabezados, SANITIZANDO
  // cada texto para evitar inyeccion de formulas (CSV/Formula Injection):
  // un valor que empiece con = + - @ se interpretaria como formula viva en
  // la celda (ej. =HYPERLINK / =IMPORTRANGE) y podria filtrar datos.
  const valores = headers.map(function (col) {
    const v = (row[col] !== undefined && row[col] !== null) ? row[col] : '';
    return sanitizarValor(v);
  });

  let updated;
  if (indiceFila > 0) {
    // Reemplazar la fila existente.
    hoja.getRange(indiceFila, 1, 1, headers.length).setValues([valores]);
    updated = true;
  } else {
    // Insertar una fila nueva al final.
    hoja.appendRow(valores);
    updated = false;
  }

  return { ok: true, key: key, updated: updated };
}

// --- delete: borra la fila por su llave (solo admin, idempotente) ----------
//  Se llama remove() internamente porque "delete" es palabra reservada.
function remove(body) {
  { const rech = rechazoAdmin_(body); if (rech) return rech; }

  const tab = body.tab;
  const conf = TABS[tab];
  if (!conf) {
    return jsonResponse({ ok: false, error: 'Pestana invalida: ' + String(tab) });
  }

  const key = body.key !== undefined && body.key !== null ? String(body.key).trim() : '';
  const hoja = obtenerHojaConEncabezados(tab);
  const indiceFila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, key);

  if (indiceFila > 0) {
    hoja.deleteRow(indiceFila);
  }
  // Idempotente: aunque no exista, decimos ok.
  return jsonResponse({ ok: true });
}

// --- investorLogin: el inversionista entra con su claveAcceso ---------------
//  Busca la fila cuya claveAcceso coincida (exacta, sin espacios). Si existe,
//  devuelve su id y nombre. NUNCA devuelve la clave ni datos de contacto.
//  Antes de buscar, aplicamos un limite de intentos global (anti fuerza
//  bruta), ya que esta accion es publica y la URL del endpoint es conocida.
function investorLogin(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }

  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  return jsonResponse({
    ok: true,
    role: 'investor',
    inversionistaId: inv.id,
    nombre: inv.nombre
  });
}

// --- getMine: el inversionista ve SOLO sus datos ---------------------------
//  Re-valida la clave para obtener su id, y arma un paquete con:
//    - sus datos basicos (sin claveAcceso ni notas internas),
//    - sus inversiones, las aportaciones de esas inversiones,
//    - sus documentos, y los proyectos (con cuenta de deposito) ligados.
function getMine(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }

  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const miId = String(inv.id).trim();

  // 1) Datos basicos del inversionista (filtrados: sin clave ni notas).
  const inversionista = {
    id: inv.id,
    nombre: inv.nombre,
    email: inv.email,
    telefono: inv.telefono
  };

  // 2) Sus inversiones (las que apuntan a su inversionistaId).
  const todasInversiones = leerHoja('Inversiones');
  const misInversiones = todasInversiones.filter(function (i) {
    return String(i.inversionistaId).trim() === miId;
  });

  // Conjunto de folios y de proyectos referenciados por SUS inversiones.
  const misFolios = {};
  const misProyectoIds = {};
  misInversiones.forEach(function (i) {
    if (i.folio) misFolios[String(i.folio).trim()] = true;
    if (i.proyectoId) misProyectoIds[String(i.proyectoId).trim()] = true;
  });

  // 3) Aportaciones SOLO de esos folios.
  const todasAportaciones = leerHoja('Aportaciones');
  const misAportaciones = todasAportaciones.filter(function (a) {
    return misFolios[String(a.folio).trim()] === true;
  });

  // 4) Documentos SOLO de esos folios.
  const todosDocumentos = leerHoja('Documentos');
  const misDocumentos = todosDocumentos.filter(function (d) {
    return misFolios[String(d.folio).trim()] === true;
  });

  // 5) Proyectos SOLO los referenciados por sus inversiones (con cuenta).
  const todosProyectos = leerHoja('Proyectos');
  const misProyectos = todosProyectos.filter(function (p) {
    return misProyectoIds[String(p.id).trim()] === true;
  });

  // 6) Avances (fotos/videos) y bitacora (seguimiento del asesor): ahora viven
  //    a nivel PROYECTO, asi que se filtran por los proyectoId del codesarrollador.
  const misAvances = leerHoja('Avances').filter(function (a) {
    return misProyectoIds[String(a.proyectoId).trim()] === true;
  });
  const miBitacora = leerHoja('Bitacora').filter(function (b) {
    return misProyectoIds[String(b.proyectoId).trim()] === true;
  });

  return jsonResponse({
    ok: true,
    data: {
      inversionista: inversionista,
      inversiones: misInversiones,
      aportaciones: misAportaciones,
      documentos: misDocumentos,
      proyectos: misProyectos,
      avances: misAvances,
      bitacora: miBitacora,
      preciosPlusvalia: leerPreciosPlusvalia()
    }
  });
}

// --- reportarPago: el inversionista avisa que ya deposito ------------------
//  Guarda referencia y/o comprobante y deja el pago en "En aprobacion".
//  NO marca "Recibida" (eso solo lo hace el admin). Seguridad: solo permite
//  reportar un pago cuyo folio pertenezca a UNA de SUS inversiones.
function reportarPago(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const miId = String(inv.id).trim();

  const apId = (body.id !== undefined && body.id !== null) ? String(body.id).trim() : '';
  if (!apId) {
    return jsonResponse({ ok: false, error: 'Falta el identificador de la aportacion.' });
  }

  // Folios que le pertenecen a este inversionista.
  const misFolios = {};
  leerHoja('Inversiones').forEach(function (i) {
    if (String(i.inversionistaId).trim() === miId && i.folio) {
      misFolios[String(i.folio).trim()] = true;
    }
  });

  // Buscar la aportacion y validar que sea de uno de SUS folios.
  const aportaciones = leerHoja('Aportaciones');
  let ap = null;
  for (let k = 0; k < aportaciones.length; k++) {
    if (String(aportaciones[k].id).trim() === apId) { ap = aportaciones[k]; break; }
  }
  if (!ap || misFolios[String(ap.folio).trim()] !== true) {
    return jsonResponse({ ok: false, error: 'No autorizado para reportar este pago.' });
  }

  // No permitir re-reportar un pago que el equipo YA confirmo como recibido
  // (evita que se altere el rastro/monto de un pago cerrado).
  if (ap.fechaRecibida && String(ap.fechaRecibida).trim() !== '') {
    return jsonResponse({ ok: false, error: 'Este pago ya fue confirmado por el equipo. Si algo no cuadra, escribenos.' });
  }

  // Validar el monto reportado: debe ser > 0 y dentro de un rango sano (no
  // negativos, ceros ni cifras absurdas que descuadren el plan).
  let montoReportadoValido;
  if (body.montoReportado !== undefined && body.montoReportado !== null && String(body.montoReportado).trim() !== '') {
    const mr = Number(body.montoReportado);
    const tope = (Number(ap.monto) || 0) * 5 + 1000000; // tope generoso pero finito
    if (!isFinite(mr) || mr <= 0) {
      return jsonResponse({ ok: false, error: 'El monto depositado debe ser mayor a cero.' });
    }
    if (mr > tope) {
      return jsonResponse({ ok: false, error: 'El monto reportado parece incorrecto, revisalo.' });
    }
    montoReportadoValido = mr;
  }

  // Aplicar el reporte (sin tocar fechaRecibida; eso lo confirma el admin).
  if (body.referencia !== undefined) ap.referencia = String(body.referencia);
  if (body.comprobanteUrl !== undefined && String(body.comprobanteUrl).trim() !== '') {
    ap.comprobanteUrl = String(body.comprobanteUrl);
  }
  if (montoReportadoValido !== undefined) ap.montoReportado = montoReportadoValido;
  ap.fechaReporte = new Date().toISOString().slice(0, 10);

  const conf = TABS['Aportaciones'];
  const hoja = obtenerHojaConEncabezados('Aportaciones');
  const indiceFila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, apId);
  if (indiceFila <= 0) {
    return jsonResponse({ ok: false, error: 'No se encontro la aportacion.' });
  }
  const valores = conf.headers.map(function (col) {
    const v = (ap[col] !== undefined && ap[col] !== null) ? ap[col] : '';
    return sanitizarValor(v);
  });
  hoja.getRange(indiceFila, 1, 1, conf.headers.length).setValues([valores]);

  return jsonResponse({ ok: true });
}

// --- recuperarClave: el inversionista pide su acceso por correo ------------
//  Recibe un email. Si coincide con un inversionista registrado, le GENERA una
//  clave NUEVA (rota la anterior), la guarda y se la envia por correo (gratis,
//  con MailApp). Por privacidad, SIEMPRE responde igual (mensaje generico),
//  exista o no el correo, y NUNCA devuelve la clave en la respuesta: solo va
//  al correo registrado.
function recuperarClave(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const generico = { ok: true, msg: 'Si tu correo esta registrado, te enviamos tu acceso. Revisa tu bandeja (y spam).' };

  const email = (body.email !== undefined && body.email !== null) ? String(body.email).trim().toLowerCase() : '';
  if (email === '') return jsonResponse(generico);

  // Buscar inversionista por email (exacto, sin distinguir mayusculas).
  const inversionistas = leerHoja('Inversionistas');
  let inv = null;
  for (let i = 0; i < inversionistas.length; i++) {
    if (String(inversionistas[i].email).trim().toLowerCase() === email) { inv = inversionistas[i]; break; }
  }
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse(generico); // no revelamos que no existe
  }

  // Generar clave nueva y guardarla en su fila (rota la anterior).
  const nuevaClave = generarClaveInversionista();
  inv.claveAcceso = nuevaClave;
  const conf = TABS['Inversionistas'];
  const hoja = obtenerHojaConEncabezados('Inversionistas');
  const indiceFila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, String(inv.id).trim());
  if (indiceFila <= 0) return jsonResponse(generico);
  const valores = conf.headers.map(function (col) {
    const v = (inv[col] !== undefined && inv[col] !== null) ? inv[col] : '';
    return sanitizarValor(v);
  });
  hoja.getRange(indiceFila, 1, 1, conf.headers.length).setValues([valores]);

  // Enviar el correo con la clave nueva.
  const portalUrl = PORTAL_URL;
  const nombre = inv.nombre ? String(inv.nombre) : 'Codesarrollador';
  const asunto = 'Tu acceso al portal de YoDesarrollo';
  const cuerpo =
    'Hola ' + nombre + ',\n\n' +
    'Aqui esta tu clave de acceso al portal de Co-desarrolladores de YoDesarrollo:\n\n' +
    '    ' + nuevaClave + '\n\n' +
    'Entra aqui y elige "Soy Codesarrollador": ' + portalUrl + '\n\n' +
    'Por seguridad, esta clave reemplaza cualquier clave anterior que tuvieras.\n\n' +
    'YoDesarrollo SAPI de C.V.';
  try {
    MailApp.sendEmail(String(inv.email).trim(), asunto, cuerpo);
  } catch (e) {
    console.error('Error enviando correo de recuperacion: ' + String(e));
  }
  return jsonResponse(generico);
}

// --- notificarAvance: avisa por correo a los codesarrolladores -------------
//  Solo admin. Recibe un proyectoId (y opcionalmente un mensaje). Junta los
//  correos UNICOS de los codesarrolladores de ese proyecto (inversiones con
//  ese proyectoId -> inversionistas -> emails) y les manda un correo avisando
//  que hay un nuevo avance, con el link al portal. Es OPT-IN: solo se manda
//  cuando el admin aprieta el boton, no automatico (para no spamear).
//  Devuelve { ok, enviados:n }.
function notificarAvance(body) {
  { const rech = rechazoAdmin_(body); if (rech) return rech; }

  const proyectoId = (body.proyectoId !== undefined && body.proyectoId !== null) ? String(body.proyectoId).trim() : '';
  if (proyectoId === '') return jsonResponse({ ok: false, error: 'Falta el proyecto.' });

  // Buscar el proyecto para usar su nombre en el correo.
  const proyectos = leerHoja('Proyectos');
  let proyecto = null;
  for (let i = 0; i < proyectos.length; i++) {
    if (String(proyectos[i].id).trim() === proyectoId) { proyecto = proyectos[i]; break; }
  }
  if (!proyecto) return jsonResponse({ ok: false, error: 'Proyecto no encontrado' });
  const nombreProyecto = proyecto.nombre ? String(proyecto.nombre) : 'tu proyecto';

  // Inversionistas que aportan a este proyecto (via la hoja Inversiones).
  const inversiones = leerHoja('Inversiones');
  const idsCodes = {};
  for (let i = 0; i < inversiones.length; i++) {
    if (String(inversiones[i].proyectoId).trim() === proyectoId) {
      idsCodes[String(inversiones[i].inversionistaId).trim()] = true;
    }
  }

  // Resolver emails unicos de esos inversionistas.
  const inversionistas = leerHoja('Inversionistas');
  const emails = {};
  for (let i = 0; i < inversionistas.length; i++) {
    const id = String(inversionistas[i].id).trim();
    if (!idsCodes[id]) continue;
    const email = String(inversionistas[i].email || '').trim();
    if (email !== '') emails[email.toLowerCase()] = email;
  }

  // Armar y mandar el correo a cada email (uno por uno, sin abortar si falla).
  const asunto = 'Nuevo avance en ' + nombreProyecto;
  const cuerpo = (body.mensaje !== undefined && body.mensaje !== null && String(body.mensaje).trim() !== '')
    ? String(body.mensaje)
    : ('Hay un nuevo avance en tu proyecto ' + nombreProyecto + '. Entra a verlo: ' + PORTAL_URL);

  let enviados = 0;
  const claves = Object.keys(emails);
  for (let i = 0; i < claves.length; i++) {
    try {
      MailApp.sendEmail(emails[claves[i]], asunto, cuerpo);
      enviados++;
    } catch (e) {
      console.error('notificarAvance: error enviando a ' + emails[claves[i]] + ': ' + String(e));
    }
  }

  // Cuantos codesarrolladores del proyecto NO tienen correo (no se les pudo avisar).
  const totalCodes = Object.keys(idsCodes).length;
  const conCorreo = Object.keys(emails).length;
  const sinCorreo = Math.max(0, totalCodes - conCorreo);
  return jsonResponse({ ok: true, enviados: enviados, sinCorreo: sinCorreo });
}

// --- generarLinkAcceso: crea un "link magico" de acceso sin teclear clave ---
//  Solo admin. Recibe un inversionistaId, genera un token aleatorio con
//  expiracion (7 dias) y lo guarda en PropertiesService (NO toca el Sheet):
//    'tok_'+token = JSON { inversionistaId, exp }
//  Devuelve la URL del portal con el token en el query (?t=...). El admin se la
//  envia al cliente; al abrirla, el front canjea el token y entra solo.
function generarLinkAcceso(body) {
  { const rech = rechazoAdmin_(body); if (rech) return rech; }

  const inversionistaId = (body.inversionistaId !== undefined && body.inversionistaId !== null)
    ? String(body.inversionistaId).trim()
    : '';
  if (inversionistaId === '') return jsonResponse({ ok: false, error: 'Falta el codesarrollador.' });

  // Validar que el inversionista exista (no generamos links a fantasmas).
  const inversionistas = leerHoja('Inversionistas');
  let existe = false;
  for (let i = 0; i < inversionistas.length; i++) {
    if (String(inversionistas[i].id).trim() === inversionistaId) { existe = true; break; }
  }
  if (!existe) return jsonResponse({ ok: false, error: 'Codesarrollador no encontrado' });

  // Token aleatorio robusto (UUID) + expiracion a 48 horas (link de acceso rapido,
  // de un solo uso: se invalida al canjearlo en loginConToken).
  const token = Utilities.getUuid();
  const exp = Date.now() + 48 * 60 * 60 * 1000;
  PropertiesService.getScriptProperties()
    .setProperty('tok_' + token, JSON.stringify({ inversionistaId: inversionistaId, exp: exp }));

  return jsonResponse({ ok: true, url: PORTAL_URL + '?t=' + token });
}

// --- loginConToken: canjea un "link magico" por la clave del inversionista --
//  Publica (el usuario aun no tiene sesion). Recibe el token del query (?t=),
//  valida que exista y no este vencido en PropertiesService, busca al
//  inversionista y devuelve su claveAcceso para que el front la use como sesion
//  normal de inversionista (igual que investorLogin, pero sin teclear). El
//  token sigue valido hasta su expiracion para tolerar recargas del navegador.
function loginConToken(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }

  const token = (body.token !== undefined && body.token !== null) ? String(body.token).trim() : '';
  if (token === '') {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Enlace invalido o vencido' });
  }

  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('tok_' + token);
  if (!raw) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Enlace invalido o vencido' });
  }

  let datos = null;
  try {
    datos = JSON.parse(raw);
  } catch (e) {
    props.deleteProperty('tok_' + token);
    return jsonResponse({ ok: false, error: 'Enlace invalido o vencido' });
  }

  if (!datos || !datos.exp || Date.now() > Number(datos.exp)) {
    props.deleteProperty('tok_' + token); // limpiamos el token vencido
    return jsonResponse({ ok: false, error: 'Enlace vencido' });
  }

  // Buscar al inversionista para devolver su clave de acceso vigente.
  const inversionistaId = String(datos.inversionistaId).trim();
  const inversionistas = leerHoja('Inversionistas');
  let inv = null;
  for (let i = 0; i < inversionistas.length; i++) {
    if (String(inversionistas[i].id).trim() === inversionistaId) { inv = inversionistas[i]; break; }
  }
  if (!inv) {
    props.deleteProperty('tok_' + token);
    return jsonResponse({ ok: false, error: 'Enlace invalido o vencido' });
  }

  // De un solo uso: invalidamos el token tras canjearlo. El front ya guarda la
  // sesion, asi que las recargas no necesitan el token.
  props.deleteProperty('tok_' + token);
  return jsonResponse({ ok: true, clave: inv.claveAcceso });
}

// --- subirArchivo: sube un archivo (foto/comprobante) a Drive --------------
//  Recibe el archivo en base64 y lo guarda en una carpeta de Drive del
//  proyecto, con permiso "cualquiera con el enlace puede ver", y devuelve la
//  URL. Lo puede usar el admin (pass) o un inversionista (clave). Asi el front
//  solo guarda la URL en la celda, manteniendo el mismo sistema de enlaces.
function subirArchivo(body) {
  // Autorizacion: admin O inversionista valido O asesor valido.
  let autorizado = esAdmin(body.pass);
  if (!autorizado) {
    if (demasiadosIntentos()) {
      return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
    }
    const inv = buscarInversionistaPorClave(body.clave);
    const asr = inv ? null : buscarAsesorPorClave(body.clave);
    if (!inv && !asr) { registrarIntentoFallido(); return jsonResponse({ ok: false, error: 'No autorizado' }); }
    autorizado = true;
    // Tope anti-abuso de almacenamiento/cuota: max 30 subidas por hora por usuario.
    const uploaderId = inv ? ('inv_' + inv.id) : ('asr_' + asr.id);
    if (!dentroDeLimitePorUsuario('upl_', uploaderId, 30, 3600)) {
      return jsonResponse({ ok: false, error: 'Has subido varios archivos; espera un poco e intenta de nuevo.' });
    }
  }

  const b64 = body.base64 || '';
  if (!b64) return jsonResponse({ ok: false, error: 'No llego ningun archivo.' });
  // Limite ~10 MB (base64 ocupa ~4/3 de los bytes reales).
  if (b64.length > 14000000) return jsonResponse({ ok: false, error: 'El archivo es muy grande (max ~10 MB). Usa una foto mas ligera.' });

  const nombre = String(body.filename || 'archivo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  const mime = body.mime || 'application/octet-stream';

  try {
    const bytes = Utilities.base64Decode(b64);
    const blob = Utilities.newBlob(bytes, mime, nombre);

    // PRIVADO (comprobantes de pago): se guardan en una carpeta SIN compartir.
    //  No se devuelve URL publica; solo el fileId. Se muestran despues via
    //  verComprobante(), que valida quien puede verlo. Asi un comprobante de pago
    //  no queda accesible con solo tener el enlace.
    if (body.privado === true) {
      const carpetaPriv = obtenerCarpetaComprobantesPrivados();
      const archivoPriv = carpetaPriv.createFile(blob);
      return jsonResponse({ ok: true, fileId: archivoPriv.getId(), privado: true });
    }

    // PUBLICO (fotos de avance, documentos): "cualquiera con el enlace puede ver",
    //  porque el front los muestra directo (galeria/<img>).
    const carpeta = obtenerCarpetaArchivos();
    const archivo = carpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return jsonResponse({ ok: true, url: archivo.getUrl(), id: archivo.getId() });
  } catch (e) {
    console.error('subirArchivo: ' + String(e));
    return jsonResponse({ ok: false, error: 'No se pudo subir el archivo.' });
  }
}

// --- verComprobante: entrega un comprobante PRIVADO solo a quien tiene permiso
//  Autoriza en tres vias: admin (pass), el codesarrollador DUENO del folio de la
//  aportacion (clave), o el asesor que tiene asignado el proyecto de ese folio
//  (clave). Compatibilidad hacia atras: si el valor guardado es una URL http
//  vieja (publica), la devuelve como enlace; si es un fileId privado, lee el
//  archivo de Drive y lo devuelve en base64 (dataUrl) para mostrarlo/descargarlo.
function verComprobante(body) {
  const apId = (body.id !== undefined && body.id !== null) ? String(body.id).trim() : '';
  if (!apId) return jsonResponse({ ok: false, error: 'Falta el identificador de la aportacion.' });

  const esAdministrador = esAdmin(body.pass);

  // Localizar la aportacion.
  const aportaciones = leerHoja('Aportaciones');
  let ap = null;
  for (let k = 0; k < aportaciones.length; k++) {
    if (String(aportaciones[k].id).trim() === apId) { ap = aportaciones[k]; break; }
  }

  // Autorizacion. Para un NO-admin, cualquier fallo (la aportacion no existe O no
  // es suya) responde EXACTAMENTE igual ("No autorizado."), para no revelar que
  // ids de aportacion existen (evita enumeracion). El admin (de confianza) si
  // puede saber que una aportacion no existe.
  if (!esAdministrador) {
    if (demasiadosIntentos()) {
      return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
    }
    let autorizado = false;
    if (ap) {
      const folioAp = String(ap.folio).trim();
      const inversionesAll = leerHoja('Inversiones');

      // ¿es el codesarrollador dueno del folio de esta aportacion?
      const invUser = buscarInversionistaPorClave(body.clave);
      if (invUser) {
        const miId = String(invUser.id).trim();
        autorizado = inversionesAll.some(function (i) {
          return String(i.inversionistaId).trim() === miId && String(i.folio).trim() === folioAp;
        });
      }

      // ¿es un asesor con el proyecto de ese folio asignado?
      if (!autorizado) {
        const asrUser = buscarAsesorPorClave(body.clave);
        if (asrUser) {
          const sus = setDeProyectoIds(asrUser.proyectoIds);
          autorizado = inversionesAll.some(function (i) {
            return String(i.folio).trim() === folioAp && sus[String(i.proyectoId).trim()] === true;
          });
        }
      }
    }
    if (!autorizado) { registrarIntentoFallido(); return jsonResponse({ ok: false, error: 'No autorizado.' }); }
  } else if (!ap) {
    return jsonResponse({ ok: false, error: 'No se encontro la aportacion.' });
  }

  const valor = (ap.comprobanteUrl !== undefined && ap.comprobanteUrl !== null) ? String(ap.comprobanteUrl).trim() : '';
  if (!valor) return jsonResponse({ ok: true, vacio: true });

  // Compatibilidad: comprobantes viejos son URLs http publicas -> devolver enlace.
  if (/^https?:\/\//i.test(valor)) {
    return jsonResponse({ ok: true, url: valor });
  }

  // Nuevo: es un fileId privado de Drive -> leer y devolver en base64.
  try {
    const archivo = DriveApp.getFileById(valor);
    const blob = archivo.getBlob();
    const bytes = blob.getBytes();
    // Tope de seguridad: ~12 MB reales (no deberia pasar por el limite de subida).
    if (bytes.length > 12 * 1024 * 1024) {
      return jsonResponse({ ok: false, error: 'El comprobante es muy grande para mostrarlo aqui.' });
    }
    const b64 = Utilities.base64Encode(bytes);
    const mime = blob.getContentType() || 'application/octet-stream';
    return jsonResponse({ ok: true, dataUrl: 'data:' + mime + ';base64,' + b64, mime: mime, filename: archivo.getName() });
  } catch (e) {
    console.error('verComprobante: ' + String(e));
    return jsonResponse({ ok: false, error: 'No se pudo abrir el comprobante.' });
  }
}

// --- obtenerCarpetaArchivos: carpeta de Drive donde viven los archivos ------
function obtenerCarpetaArchivos() {
  const nombre = 'Co-desarrolladores-Yod - Archivos';
  const it = DriveApp.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(nombre);
}

// --- obtenerCarpetaComprobantesPrivados: carpeta PRIVADA para comprobantes ---
//  Se crea SIN compartir: solo la cuenta dueña del script (la que ejecuta el
//  Web App) puede leer su contenido. Los comprobantes se entregan despues con
//  autorizacion via verComprobante(), nunca con un enlace publico.
function obtenerCarpetaComprobantesPrivados() {
  const nombre = 'Co-desarrolladores-Yod - Comprobantes (privado)';
  const it = DriveApp.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(nombre);
}

// --- autorizarDrive: correr UNA vez desde el editor para autorizar Drive ----
//  Crea (si no existe) la carpeta de archivos. Google pedira el permiso nuevo
//  de Drive la primera vez. Despues, la subida de fotos/comprobantes ya jala.
function autorizarDrive() {
  const c = obtenerCarpetaArchivos();
  return 'Carpeta lista: ' + c.getName() + ' (' + c.getId() + ')';
}

// ===========================================================================
//  AUTOSERVICIO DEL CODESARROLLADOR (cambiar clave / editar sus datos)
// ===========================================================================

// --- cambiarClave: el codesarrollador elige su propia contrasena -----------
//  Se autentica con su clave ACTUAL. Valida largo minimo y que la nueva clave
//  no choque con la de otro. Guarda en el Sheet y NO devuelve la clave.
function cambiarClave(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const nueva = (body.nuevaClave !== undefined && body.nuevaClave !== null) ? String(body.nuevaClave).trim() : '';
  if (nueva.length < 6) return jsonResponse({ ok: false, error: 'La nueva contrasena debe tener al menos 6 caracteres.' });
  if (nueva.length > 60) return jsonResponse({ ok: false, error: 'La contrasena es demasiado larga.' });

  // No permitir que choque con la clave de OTRO codesarrollador NI de un asesor.
  if (claveYaEnUso(nueva, inv.id, 'Inversionistas')) {
    return jsonResponse({ ok: false, error: 'Esa contrasena ya esta en uso, elige otra.' });
  }

  inv.claveAcceso = nueva;
  if (!reescribirFila('Inversionistas', inv)) {
    return jsonResponse({ ok: false, error: 'No se pudo guardar la nueva contrasena.' });
  }
  return jsonResponse({ ok: true });
}

// --- actualizarMisDatos: el codesarrollador corrige su correo/telefono ------
//  Solo deja tocar email y telefono (jamas id, clave, folios ni nada financiero).
function actualizarMisDatos(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  if (body.email !== undefined && body.email !== null) {
    const email = String(body.email).trim();
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ ok: false, error: 'El correo no parece valido.' });
    }
    inv.email = email;
  }
  if (body.telefono !== undefined && body.telefono !== null) {
    inv.telefono = String(body.telefono).trim().slice(0, 40);
  }
  if (!reescribirFila('Inversionistas', inv)) {
    return jsonResponse({ ok: false, error: 'No se pudieron guardar tus datos.' });
  }
  return jsonResponse({ ok: true, data: { email: inv.email, telefono: inv.telefono } });
}

// --- enviarMensaje: el codesarrollador nos escribe una duda ----------------
//  Se autentica con su clave. Manda un correo al admin con su mensaje y el
//  contexto (nombre, correo, folios). Pone reply-to a su correo si lo tiene.
function enviarMensaje(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const mensaje = String(body.mensaje || '').trim();
  if (mensaje === '') return jsonResponse({ ok: false, error: 'Escribe tu mensaje.' });
  if (mensaje.length > 4000) return jsonResponse({ ok: false, error: 'El mensaje es muy largo (max 4000 caracteres).' });

  // Tope anti-abuso: max 8 mensajes por hora por usuario (protege la cuota de correo).
  if (!dentroDeLimitePorUsuario('msg_', inv.id, 8, 3600)) {
    return jsonResponse({ ok: false, error: 'Has enviado varios mensajes; espera un poco e intenta de nuevo.' });
  }

  const miId = String(inv.id).trim();
  const folios = leerHoja('Inversiones')
    .filter(function (i) { return String(i.inversionistaId).trim() === miId; })
    .map(function (i) { return i.folio; })
    .filter(Boolean).join(', ');

  const asunto = 'Duda de ' + (inv.nombre || 'un codesarrollador') + (folios ? ' (' + folios + ')' : '');
  const cuerpo =
    'Mensaje de: ' + (inv.nombre || '(sin nombre)') + '\n' +
    'Correo: ' + (inv.email || '(sin correo)') + '\n' +
    'Telefono: ' + (inv.telefono || '(sin telefono)') + '\n' +
    'Folios: ' + (folios || '(ninguno)') + '\n\n' +
    '----- Mensaje -----\n' + mensaje;
  try {
    const opciones = {};
    if (inv.email && String(inv.email).trim() !== '') opciones.replyTo = String(inv.email).trim();
    MailApp.sendEmail(correoAdmin(), asunto, cuerpo, opciones);
  } catch (e) {
    console.error('enviarMensaje: ' + String(e));
    return jsonResponse({ ok: false, error: 'No se pudo enviar tu mensaje, intenta mas tarde.' });
  }
  return jsonResponse({ ok: true });
}

// --- registrarReferido: el codesarrollador invita a alguien (+1%) ----------
//  Se autentica con su clave. Guarda el referido en la hoja Referidos (estado
//  Pendiente) y avisa al admin por correo. El +1% lo aplica el admin a mano.
function registrarReferido(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const nombreProspecto = String(body.nombreProspecto || '').trim();
  if (nombreProspecto === '') return jsonResponse({ ok: false, error: 'Pon el nombre de quien quieres invitar.' });

  // Tope anti-abuso: max 15 invitaciones por hora por usuario.
  if (!dentroDeLimitePorUsuario('ref_', inv.id, 15, 3600)) {
    return jsonResponse({ ok: false, error: 'Has enviado varias invitaciones; espera un poco e intenta de nuevo.' });
  }

  const contacto = String(body.contacto || '').trim().slice(0, 200);
  const nota = String(body.nota || '').trim().slice(0, 1000);

  const resultado = guardarFilaInterna('Referidos', {
    referidorId: inv.id,
    referidorNombre: inv.nombre || '',
    nombreProspecto: nombreProspecto.slice(0, 120),
    contacto: contacto,
    nota: nota,
    estado: 'Pendiente'
  });
  if (!resultado.ok) return jsonResponse(resultado);

  // Avisar al admin (no abortamos si el correo falla; el registro ya quedo).
  try {
    const asunto = 'Nuevo referido de ' + (inv.nombre || 'un codesarrollador');
    const cuerpo =
      (inv.nombre || 'Un codesarrollador') + ' quiere invitar a:\n\n' +
      'Nombre: ' + nombreProspecto + '\n' +
      'Contacto: ' + (contacto || '(no proporcionado)') + '\n' +
      'Nota: ' + (nota || '(sin nota)') + '\n\n' +
      'Beneficio prometido: +1% sobre la aportacion de ' + (inv.nombre || 'el referidor') +
      ' al momento de la devolucion de capital, si el invitado participa.\n\n' +
      'Dale seguimiento en la hoja Referidos del panel.';
    MailApp.sendEmail(correoAdmin(), asunto, cuerpo);
  } catch (e) {
    console.error('registrarReferido (correo): ' + String(e));
  }
  return jsonResponse(resultado);
}

// ===========================================================================
//  ROL ASESOR (acceso propio, solo avances/bitacora de SUS proyectos)
// ===========================================================================

// --- asesorLogin: el asesor entra con su claveAcceso -----------------------
function asesorLogin(body) {
  if (demasiadosIntentos('asr')) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const asr = buscarAsesorPorClave(body.clave);
  if (!asr) {
    registrarIntentoFallido('asr');
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  return jsonResponse({ ok: true, role: 'asesor', asesorId: asr.id, nombre: asr.nombre });
}

// --- getMineAsesor: el asesor ve SOLO sus proyectos (sin nada financiero) ---
//  Devuelve los proyectos asignados (recortados: sin banco/cuenta/clabe) y los
//  avances/bitacora de esos proyectos. Nunca inversiones, aportaciones ni
//  codesarrolladores.
function getMineAsesor(body) {
  if (demasiadosIntentos('asr')) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const asr = buscarAsesorPorClave(body.clave);
  if (!asr) {
    registrarIntentoFallido('asr');
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const permitidos = setDeProyectoIds(asr.proyectoIds);

  const proyectos = leerHoja('Proyectos')
    .filter(function (p) { return permitidos[String(p.id).trim()] === true; })
    .map(camposPublicosProyecto);
  const avances = leerHoja('Avances').filter(function (a) {
    return permitidos[String(a.proyectoId).trim()] === true;
  });
  const bitacora = leerHoja('Bitacora').filter(function (b) {
    return permitidos[String(b.proyectoId).trim()] === true;
  });

  return jsonResponse({
    ok: true,
    data: {
      asesor: { id: asr.id, nombre: asr.nombre },
      proyectos: proyectos,
      avances: avances,
      bitacora: bitacora
    }
  });
}

// --- guardarComoAsesor: el asesor crea/edita un Avance o una Nota ----------
//  Solo en Avances o Bitacora, y solo de proyectos que tenga asignados. Si es
//  edicion (trae id), tambien valida que el registro EXISTENTE sea de uno de
//  sus proyectos (para que no pueda "secuestrar" un registro ajeno por id).
function guardarComoAsesor(body) {
  if (demasiadosIntentos('asr')) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const asr = buscarAsesorPorClave(body.clave);
  if (!asr) {
    registrarIntentoFallido('asr');
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const tab = body.tab;
  if (tab !== 'Avances' && tab !== 'Bitacora') {
    return jsonResponse({ ok: false, error: 'No autorizado para esa seccion.' });
  }
  const row = body.row || {};
  const permitidos = setDeProyectoIds(asr.proyectoIds);
  const proyectoId = String(row.proyectoId || '').trim();
  if (!proyectoId || permitidos[proyectoId] !== true) {
    return jsonResponse({ ok: false, error: 'No autorizado para este proyecto.' });
  }

  // Si es edicion, el registro existente tambien debe ser de un proyecto suyo.
  const conf = TABS[tab];
  const llave = row[conf.keyField];
  if (llave !== undefined && llave !== null && String(llave).trim() !== '') {
    const existente = leerHoja(tab).filter(function (x) {
      return String(x[conf.keyField]).trim() === String(llave).trim();
    })[0];
    if (existente && permitidos[String(existente.proyectoId || '').trim()] !== true) {
      return jsonResponse({ ok: false, error: 'No autorizado para editar este registro.' });
    }
  }

  return jsonResponse(guardarFilaInterna(tab, row));
}

// --- eliminarComoAsesor: el asesor borra un Avance o Nota de sus proyectos --
function eliminarComoAsesor(body) {
  if (demasiadosIntentos('asr')) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const asr = buscarAsesorPorClave(body.clave);
  if (!asr) {
    registrarIntentoFallido('asr');
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const tab = body.tab;
  if (tab !== 'Avances' && tab !== 'Bitacora') {
    return jsonResponse({ ok: false, error: 'No autorizado para esa seccion.' });
  }
  const key = String(body.key || '').trim();
  if (!key) return jsonResponse({ ok: false, error: 'Falta el identificador.' });

  const permitidos = setDeProyectoIds(asr.proyectoIds);
  const existente = leerHoja(tab).filter(function (x) { return String(x.id).trim() === key; })[0];
  if (!existente || permitidos[String(existente.proyectoId || '').trim()] !== true) {
    return jsonResponse({ ok: false, error: 'No autorizado para borrar este registro.' });
  }

  const conf = TABS[tab];
  const hoja = obtenerHojaConEncabezados(tab);
  const indiceFila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, key);
  if (indiceFila > 0) hoja.deleteRow(indiceFila);
  return jsonResponse({ ok: true });
}

// ===========================================================================
//  FUNCIONES DE APOYO (helpers internos)
// ===========================================================================

// --- esAdmin: compara la contrasena recibida contra ADMIN_PASS -------------
//  Usa comparacion de tiempo constante para no filtrar informacion por el
//  tiempo de respuesta (timing attack).
function esAdmin(pass) {
  const guardada = PropertiesService.getScriptProperties().getProperty('ADMIN_PASS');
  if (!guardada) return false; // si no esta configurada, nadie entra como admin
  return comparacionConstante(String(pass), String(guardada));
}

// --- rechazoAdmin_: guard de admin CON anti fuerza bruta -------------------
//  Antes las rutas admin (adminLogin, getAll, save, delete, notificarAvance,
//  generarLinkAcceso) solo hacian esAdmin(pass) SIN throttle: una sola clave
//  protegia TODO (getAll vuelca CLABEs, montos, correos) y era adivinable sin
//  limite. Este guard aplica el mismo candado que ya tenian inversionista/asesor,
//  en su propio espacio 'admin', y registra cada fallo. Devuelve un jsonResponse
//  de rechazo si esta bloqueado o la clave es invalida; o null si el admin es
//  valido (la funcion sigue su curso). Reemplaza el viejo bloque esAdmin.
function rechazoAdmin_(body) {
  if (demasiadosIntentos('admin')) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' });
  }
  if (!esAdmin(body && body.pass)) {
    registrarIntentoFallido('admin');
    return jsonResponse({ ok: false, error: 'Credenciales invalidas' });
  }
  return null;
}

// --- comparacionConstante: compara dos textos en tiempo constante ----------
//  Recorre SIEMPRE el mismo numero de caracteres, sin cortar antes al primer
//  desajuste, para que el tiempo de respuesta no revele cuanto coincidio.
function comparacionConstante(a, b) {
  const sa = String(a);
  const sb = String(b);
  const len = Math.max(sa.length, sb.length);
  let diff = sa.length === sb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const ca = i < sa.length ? sa.charCodeAt(i) : 0;
    const cb = i < sb.length ? sb.charCodeAt(i) : 0;
    diff |= (ca ^ cb);
  }
  return diff === 0;
}

// --- demasiadosIntentos / registrarIntentoFallido: anti fuerza bruta -------
//  Como Apps Script no expone la IP del cliente, llevamos un contador GLOBAL
//  de intentos fallidos de clave de inversionista dentro de una ventana de
//  tiempo, usando CacheService. Si se exceden, bloqueamos temporalmente los
//  intentos. Es una barrera basica (no perfecta) pero encarece la fuerza
//  bruta sobre la claveAcceso, que es la unica credencial del inversionista.
const MAX_INTENTOS = 20;          // intentos fallidos permitidos por ventana
const VENTANA_SEGUNDOS = 300;     // ventana de 5 minutos

//  El contador se SEGMENTA por 'espacio' (rol): 'inv' para inversionistas y
//  'asr' para asesores. Asi un ataque de fuerza bruta a un rol no bloquea al
//  otro (antes compartian un solo contador global y se bloqueaban entre si).
function demasiadosIntentos(espacio) {
  const cache = CacheService.getScriptCache();
  const k = 'intentos_login_' + (espacio || 'inv');
  const n = parseInt(cache.get(k) || '0', 10);
  return n >= MAX_INTENTOS;
}

function registrarIntentoFallido(espacio) {
  const cache = CacheService.getScriptCache();
  const k = 'intentos_login_' + (espacio || 'inv');
  const n = parseInt(cache.get(k) || '0', 10) + 1;
  cache.put(k, String(n), VENTANA_SEGUNDOS);
}

// --- dentroDeLimitePorUsuario: tope de frecuencia por usuario (anti-abuso) --
//  Para acciones YA autenticadas que disparan correo o escritura (enviarMensaje,
//  registrarReferido). Cuenta por usuario en una ventana con CacheService y
//  devuelve false si ya excedio el maximo (entonces NO se ejecuta la accion).
//  Evita que un usuario con clave valida agote la cuota de correo o llene hojas.
function dentroDeLimitePorUsuario(prefijo, id, maximo, ventanaSeg) {
  const cache = CacheService.getScriptCache();
  const k = prefijo + String(id);
  const n = parseInt(cache.get(k) || '0', 10);
  if (n >= maximo) return false;
  cache.put(k, String(n + 1), ventanaSeg);
  return true;
}

// --- buscarInversionistaPorClave: encuentra al inversionista por su clave --
//  Compara la claveAcceso de forma exacta (recortando espacios). Devuelve el
//  objeto de la fila completa (incluye la clave) SOLO para uso interno;
//  las funciones que responden al inversionista filtran lo que exponen.
function buscarInversionistaPorClave(clave) {
  const claveLimpia = clave !== undefined && clave !== null ? String(clave).trim() : '';
  if (claveLimpia === '') return null;

  const inversionistas = leerHoja('Inversionistas');
  for (let i = 0; i < inversionistas.length; i++) {
    const fila = inversionistas[i];
    if (String(fila.claveAcceso).trim() === claveLimpia) {
      return fila;
    }
  }
  return null;
}

// --- buscarAsesorPorClave: encuentra al asesor por su claveAcceso -----------
function buscarAsesorPorClave(clave) {
  const claveLimpia = clave !== undefined && clave !== null ? String(clave).trim() : '';
  if (claveLimpia === '') return null;
  const asesores = leerHoja('Asesores');
  for (let i = 0; i < asesores.length; i++) {
    if (String(asesores[i].claveAcceso).trim() === claveLimpia) {
      return asesores[i];
    }
  }
  return null;
}

// --- claveYaEnUso: ¿la clave ya la usa OTRO registro con login? -------------
//  Revisa AMBAS hojas con login (Inversionistas y Asesores) para que una misma
//  clave no quede valida en dos identidades distintas ("suplantacion
//  silenciosa"). idActual/tabActual identifican el registro que se esta
//  guardando, para no contarse a si mismo. Lo usan guardarFilaInterna (alta/
//  edicion desde admin) y cambiarClave (autoservicio del codesarrollador).
function claveYaEnUso(clave, idActual, tabActual) {
  const limpia = String(clave || '').trim();
  if (limpia === '') return false;
  const hojas = ['Inversionistas', 'Asesores'];
  for (let h = 0; h < hojas.length; h++) {
    const tab = hojas[h];
    const keyField = TABS[tab].keyField;
    const filas = leerHoja(tab);
    for (let i = 0; i < filas.length; i++) {
      if (String(filas[i].claveAcceso).trim() !== limpia) continue;
      // No contarse a si mismo (misma hoja + misma llave).
      if (tab === tabActual && String(filas[i][keyField]).trim() === String(idActual).trim()) continue;
      return true;
    }
  }
  return false;
}

// --- setDeProyectoIds: convierte "PRY-1, PRY-2" en {PRY-1:true, PRY-2:true} -
//  Tolera comas, espacios y saltos de linea. Se usa para checar de forma
//  rapida si un asesor tiene asignado cierto proyecto.
function setDeProyectoIds(texto) {
  const out = {};
  String(texto || '').split(/[,\n;]+/).forEach(function (x) {
    const id = String(x).trim();
    if (id !== '') out[id] = true;
  });
  return out;
}

// --- camposPublicosProyecto: recorta un proyecto para el asesor ------------
//  Devuelve SOLO lo no-financiero (nada de banco, cuenta, clabe, concepto).
function camposPublicosProyecto(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    tipo: p.tipo,
    etapaActual: p.etapaActual,
    descripcion: p.descripcion,
    estado: p.estado
  };
}

// --- reescribirFila: reescribe la fila completa de un registro existente ----
//  Busca la fila por su llave y la sobre-escribe con el objeto dado (en el
//  orden de los encabezados, sanitizando). Devuelve true si la encontro.
function reescribirFila(tab, obj) {
  const conf = TABS[tab];
  if (!conf) return false;
  const hoja = obtenerHojaConEncabezados(tab);
  const llave = String(obj[conf.keyField] !== undefined && obj[conf.keyField] !== null ? obj[conf.keyField] : '').trim();
  if (llave === '') return false;
  const indiceFila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, llave);
  if (indiceFila <= 0) return false;
  const valores = conf.headers.map(function (col) {
    const v = (obj[col] !== undefined && obj[col] !== null) ? obj[col] : '';
    return sanitizarValor(v);
  });
  hoja.getRange(indiceFila, 1, 1, conf.headers.length).setValues([valores]);
  return true;
}

// --- leerHoja: lee toda una hoja como arreglo de objetos {columna: valor} --
//  Usa la fila 1 como encabezados. Salta filas totalmente vacias.
function leerHoja(nombreHoja) {
  const hoja = obtenerHojaConEncabezados(nombreHoja);
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();

  // Si solo hay encabezados (o nada), devolvemos arreglo vacio.
  if (ultimaFila < 2 || ultimaCol < 1) return [];

  const rango = hoja.getRange(1, 1, ultimaFila, ultimaCol).getValues();
  const headers = rango[0];
  const filas = [];

  for (let r = 1; r < rango.length; r++) {
    const fila = rango[r];
    // Saltar filas completamente vacias.
    const vacia = fila.every(function (c) { return c === '' || c === null; });
    if (vacia) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const nombreCol = headers[c];
      if (nombreCol === '' || nombreCol === null) continue;
      obj[nombreCol] = normalizarValor(fila[c]);
    }
    filas.push(obj);
  }
  return filas;
}

// --- normalizarValor: deja todo "limpio" para el front ---------------------
//  Las fechas que el Sheet haya guardado como objeto Date las devolvemos como
//  texto "yyyy-MM-dd" (SOLO fecha, sin hora) en la zona horaria del negocio.
//  Esto es clave: el front las mete directo en <input type="date">, que solo
//  acepta "yyyy-MM-dd"; si devolvieramos un ISO con hora, el campo se veria
//  VACIO al editar y la fecha se borraria al guardar.
function normalizarValor(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, TZ, 'yyyy-MM-dd');
  }
  return valor;
}

// --- sanitizarValor: previene inyeccion de formulas en el Sheet ------------
//  Si un texto empieza con = + - @ (o un par de caracteres que Sheets tambien
//  trata como inicio de formula), le anteponemos un apostrofe para que la
//  celda lo guarde como TEXTO y nunca lo ejecute como formula viva.
function sanitizarValor(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) {
    return "'" + v;
  }
  return v;
}

// --- obtenerHojaConEncabezados: trae la hoja y la crea si no existe --------
//  Si la hoja no existe (por si setup() no se corrio), la crea con sus
//  encabezados para no romper. Asi save() funciona "en caliente".
function obtenerHojaConEncabezados(nombreHoja) {
  const conf = TABS[nombreHoja];
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let hoja = ss.getSheetByName(nombreHoja);

  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja);
    if (conf) {
      hoja.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);
      hoja.setFrozenRows(1);
      formatearColumnasDeFechaComoTexto(hoja, conf.headers);
    }
    return hoja;
  }

  // Si la hoja existe pero esta vacia (sin encabezados), los escribimos.
  if (conf && hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);
    hoja.setFrozenRows(1);
    formatearColumnasDeFechaComoTexto(hoja, conf.headers);
    protegerColumnasDeTextoComoTexto(hoja, conf.headers);
    return hoja;
  }

  // Si la hoja YA tiene datos pero le faltan columnas nuevas (porque se
  // agregaron al final de TABS y no se ha corrido setup()), extendemos la fila
  // de encabezados EN CALIENTE. Asi columnas nuevas al final funcionan sin
  // depender de correr setup() a mano. Solo reescribe si detecta diferencia, y
  // como las columnas nuevas van al FINAL, no recorre datos existentes.
  if (conf) {
    const ultCol = hoja.getLastColumn();
    const actuales = ultCol > 0 ? hoja.getRange(1, 1, 1, Math.max(ultCol, conf.headers.length)).getValues()[0] : [];
    let faltan = false;
    for (let i = 0; i < conf.headers.length; i++) {
      if (String(actuales[i] || '').trim() !== conf.headers[i]) { faltan = true; break; }
    }
    if (faltan) {
      hoja.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);
      hoja.setFrozenRows(1);
      formatearColumnasDeFechaComoTexto(hoja, conf.headers);
      protegerColumnasDeTextoComoTexto(hoja, conf.headers);
    }
  }
  return hoja;
}

// --- buscarFilaPorLlave: devuelve el numero de fila (1-based) o -1 ---------
//  Recorre la columna llave buscando una coincidencia exacta (como texto).
function buscarFilaPorLlave(hoja, headers, keyField, key) {
  const colLlave = headers.indexOf(keyField); // 0-based dentro de headers
  if (colLlave < 0) return -1;

  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return -1; // solo encabezados o vacia

  const valores = hoja.getRange(2, colLlave + 1, ultimaFila - 1, 1).getValues();
  const objetivo = String(key).trim();

  for (let i = 0; i < valores.length; i++) {
    const v = valores[i][0];
    if (v !== '' && v !== null && String(v).trim() === objetivo) {
      return i + 2; // +2 porque empezamos en la fila 2 (1-based)
    }
  }
  return -1;
}

// --- nuevoId: genera un identificador unico (timestamp + aleatorio) --------
//  Combina la marca de tiempo con un pedacito aleatorio para evitar choques
//  si se crean dos registros en el mismo milisegundo.
function nuevoId() {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1e6).toString(36);
  return t + r;
}

// --- jsonResponse: arma la respuesta SIEMPRE como JSON ---------------------
//  Usamos ContentService (lo unico permitido en Apps Script para esto).
//  NO se usan encabezados HTTP manuales: Apps Script no lo permite aqui.
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
