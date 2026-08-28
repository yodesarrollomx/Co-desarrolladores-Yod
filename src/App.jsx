import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Building2, Users, Wallet, Calendar, FileText, Calculator, LayoutDashboard,
  Plus, Pencil, Trash2, X, Save, RefreshCw, LogOut, Lock, Eye, EyeOff,
  Copy, Check, AlertTriangle, CheckCircle2, Clock, ChevronRight, ChevronDown,
  TrendingUp, ShieldCheck, KeyRound, Link2, ArrowLeft, Banknote, CircleDollarSign,
  AlertCircle, Loader2, Sparkles, ExternalLink, BadgeCheck, CalendarClock,
  Image as ImageIcon, PlayCircle, MessageCircle, HardHat, Upload, Printer
} from 'lucide-react';
import logoWhite from './assets/logo_white.png';

// ===================================================================
// CONFIGURACION
// ===================================================================
// PEGA AQUI la URL del Web App del Apps Script (termina en /exec).
// Mientras siga el placeholder, la app muestra un aviso de "Falta conectar el backend".
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxoW0hz0nInT208B8L_WNEpYNW0iPTMNWosl3m3TG9VO6WVRVqh90xKLLSLRQCTEB9O3A/exec";
// URL publica del portal (para compartir / invitar).
const SITIO_URL = "https://alexpueblag.github.io/Co-desarrolladores-Yod/";

const ADMIN_KEY = "codeyod-admin-v1";       // bandera de sesion admin + pass tecleada (solo en este navegador)
const INVESTOR_KEY = "codeyod-investor-v1"; // bandera de sesion inversionista + clave tecleada
const ASESOR_KEY = "codeyod-asesor-v1";     // bandera de sesion asesor + clave tecleada
const CACHE_KEY = "codeyod-cache-v1";       // respaldo de getAll para arranque offline

const TABS = ["Inversionistas", "Proyectos", "Inversiones", "Aportaciones", "Documentos", "Avances", "Bitacora", "Asesores", "Referidos"];
// Singular legible de cada pestana para los titulos de los modales.
const SINGULAR_TAB = { Inversionistas: "Codesarrollador", Proyectos: "proyecto", Inversiones: "inversion", Aportaciones: "aportacion", Documentos: "documento", Avances: "avance", Bitacora: "nota", Asesores: "asesor", Referidos: "referido" };

// Tipos de proyecto y etapas sugeridas (flexibles: sirven para obra y desarrollo urbano).
const TIPOS_PROYECTO = ["Obra", "Desarrollo urbano", "Lotificacion", "Otro"];
// Etapas de precio para proyectos de PLUSVALIA (terreno/lote). Las claves
// coinciden con las que devuelve el backend (leidas en vivo de la hoja de precios).
const ETAPAS_PLUSVALIA = [
  { key: "fund2", label: "Fundador II" },
  { key: "preventa1", label: "Preventa I" },
  { key: "preventa2", label: "Preventa II" },
  { key: "venta", label: "Venta" },
  { key: "mercado24", label: "Mercado (24m)" },
];
const etiquetaEtapaPlusvalia = (k) => (ETAPAS_PLUSVALIA.find((e) => e.key === k) || {}).label || k || "—";
const ETAPAS_SUGERIDAS = ["Permisos", "Urbanizacion", "Cimentacion", "Estructura", "Acabados", "Comercializacion", "Entrega"];
const TASA_DEFAULT = 25;

// ===================================================================
// UTILIDADES
// ===================================================================
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
function money(n) { const v = Number(n); return isFinite(v) ? mxn.format(v) : mxn.format(0); }
function pct(n) { const v = Number(n); return (isFinite(v) ? v : 0).toFixed(2) + "%"; }

// Comparte un texto: usa el menu nativo del celular (WhatsApp, etc.) si existe;
// si no (escritorio), abre WhatsApp Web/app con el mensaje listo.
function compartirTexto(texto) {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ text: texto }).catch(() => {});
      return;
    }
  } catch (e) { /* cae a WhatsApp */ }
  try { window.open("https://wa.me/?text=" + encodeURIComponent(texto), "_blank"); } catch (e) { /* noop */ }
}

// Normaliza un telefono a digitos con lada de pais para wa.me (Mexico = 52).
// Acepta "(662) 123-4567", "662 1234567", "+52 662...", "0662...", "521662...".
function telefonoWA(tel) {
  let d = String(tel || "").replace(/\D+/g, "");
  if (!d) return "";
  // Quita prefijos nacionales viejos de Mexico: 044/045 (celular) y 01 (larga
  // distancia), que quedan como basura delante del numero de 10 digitos.
  if (d.length === 13 && (d.slice(0, 3) === "044" || d.slice(0, 3) === "045")) d = d.slice(3);
  else if (d.length === 12 && d.slice(0, 2) === "01") d = d.slice(2);
  if (d.length === 10) return "52" + d;                            // local MX -> +52
  if (d.length === 12 && d.slice(0, 2) === "52") return d;         // ya trae 52
  if (d.length === 13 && d.slice(0, 3) === "521") return "52" + d.slice(3); // viejo 521...
  if (d.length === 11 && d[0] === "1") return d;                   // US/CA con 1
  // Si no encaja en ningun patron conocido, solo aceptamos algo con pinta de
  // numero internacional (11-15 digitos); si no, devolvemos "" para no abrir
  // un wa.me roto (ej. una extension suelta "ext 500" -> "500").
  return (d.length >= 11 && d.length <= 15) ? d : "";
}

// Abre WhatsApp dirigido a UN numero con el mensaje ya escrito (el admin solo da
// "enviar"). No usa navigator.share porque ese no permite fijar el destinatario.
function recordarPorWhatsApp(tel, mensaje) {
  const num = telefonoWA(tel);
  const base = num ? ("https://wa.me/" + num) : "https://wa.me/";
  try { window.open(base + "?text=" + encodeURIComponent(mensaje), "_blank"); } catch (e) { /* noop */ }
}

// Arma el texto del recordatorio de un pago (monto, fecha, proyecto + datos de
// deposito). Usa el primer nombre del codesarrollador para un tono cercano.
function mensajeRecordatorioPago(ap, inversionista, proyecto) {
  const est = estadoAportacion(ap);
  const nombre = (String(inversionista?.nombre || "").trim().split(/\s+/)[0]) || "";
  const lineas = [];
  lineas.push("Hola" + (nombre ? " " + nombre : "") + ", te recordamos tu aportacion" + (proyecto?.nombre ? " del proyecto " + proyecto.nombre : "") + ":");
  lineas.push("- Monto: " + money(ap.monto));
  lineas.push("- " + (est === "Vencida" ? "Vencio el " : "Programada para el ") + fmtFecha(ap.fechaProgramada));
  if (ap.concepto) lineas.push("- Concepto: " + ap.concepto);
  const banco = [];
  if (proyecto?.banco) banco.push("Banco: " + proyecto.banco);
  if (proyecto?.beneficiario) banco.push("Beneficiario: " + proyecto.beneficiario);
  if (proyecto?.cuenta) banco.push("Cuenta: " + proyecto.cuenta);
  if (proyecto?.clabe) banco.push("CLABE: " + proyecto.clabe);
  if (banco.length) { lineas.push(""); lineas.push("Datos para depositar:"); banco.forEach((b) => lineas.push(b)); }
  if (proyecto?.conceptoBase) lineas.push("Concepto sugerido: " + proyecto.conceptoBase);
  lineas.push("");
  lineas.push("Gracias. — YODESARROLLO");
  return lineas.join("\n");
}

// Convierte un dataUrl (base64) en un Blob y lo abre en una pestana nueva
// (robusto para imagen y PDF; evita el bloqueo de navegar a "data:" directo).
function abrirDataUrl(dataUrl, filename) {
  try {
    const partes = String(dataUrl).split(",");
    const mime = (partes[0].match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
    const bin = atob(partes[1] || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      const a = document.createElement("a");
      a.href = url; a.download = filename || "comprobante";
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { /* noop */ }
}

// Genera y descarga el estado de cuenta como PDF de verdad (no el dialogo de
// imprimir). Carga jsPDF bajo demanda (dynamic import) para no engordar el
// arranque de la app. Replica el contenido del componente EstadoCuenta.
async function descargarEstadoCuentaPDF({ inv, inversionista, proyecto, aportaciones, precios }) {
  if (!inv) return;
  try {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const aps = arr(aportaciones).slice().sort((a, b) => num(a.numeroPago) - num(b.numeroPago));
    const monto = num(inv.montoTotal);
    const recibido = aps.filter((a) => estadoAportacion(a) === "Recibida").reduce((s, a) => s + num(a.monto), 0);
    const programado = aps.reduce((s, a) => s + num(a.monto), 0);
    const comprometido = monto || programado;
    const porRecibir = Math.max(0, comprometido - recibido);
    const liquidada = (inv.estado || "Activa") === "Liquidada";
    const rend = calcularRendimientoInversion(inv, recibido, precios, proyecto);

    const GOLD = [201, 169, 110], INK = [26, 20, 9], GREEN = [15, 122, 61], RED = [180, 35, 24], BLUE = [29, 78, 216], MUTED = [120, 120, 120], LABEL = [138, 109, 30];
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const M = 40, gap = 10;
    let y = 0;
    const ensure = (need) => { if (y + need > PH - 40) { doc.addPage(); y = 50; } };

    // Encabezado de marca
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.rect(0, 0, W, 70, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text("YODESARROLLO", M, 40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text("ESTADO DE CUENTA", W - M, 30, { align: "right" });
    doc.setFontSize(8); doc.setTextColor(180, 180, 180);
    doc.text("Folio " + (inv.folio || "-") + "  -  Emitido " + fmtFecha(todayISO()), W - M, 45, { align: "right" });

    // Datos del codesarrollador y del proyecto
    y = 95;
    doc.setFontSize(8); doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]);
    doc.text("CODESARROLLADOR", M, y);
    doc.text("PROYECTO", W / 2, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(String(inversionista?.nombre || "-"), M, y + 16);
    doc.text(String(proyecto?.nombre || "-"), W / 2, y + 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
    let yc = y + 30;
    if (inversionista?.email) { doc.text(String(inversionista.email), M, yc); yc += 12; }
    if (inversionista?.telefono) { doc.text(String(inversionista.telefono), M, yc); yc += 12; }
    let yp = y + 30;
    const tipoLine = (proyecto?.tipo ? proyecto.tipo : "") + (proyecto?.etapaActual ? " - Etapa: " + proyecto.etapaActual : "");
    if (tipoLine.trim()) { doc.text(tipoLine.trim(), W / 2, yp); yp += 12; }
    doc.text("Inicio: " + fmtFecha(inv.fechaInicio) + (liquidada ? " - Salida: " + fmtFecha(inv.fechaSalida) : ""), W / 2, yp); yp += 12;
    y = Math.max(yc, yp) + 8;

    // Totales (3 cajas)
    const cajas = [
      { l: "COMPROMETIDO", v: money(comprometido), c: INK },
      { l: "RECIBIDO", v: money(recibido), c: GREEN },
      { l: "POR RECIBIR", v: money(porRecibir), c: porRecibir > 0 ? RED : INK },
    ];
    const cw = (W - M * 2 - gap * 2) / 3;
    cajas.forEach((b, i) => {
      const x = M + i * (cw + gap);
      doc.setDrawColor(230, 214, 176); doc.setFillColor(250, 247, 240);
      doc.roundedRect(x, y, cw, 46, 6, 6, "FD");
      doc.setFontSize(7.5); doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]); doc.text(b.l, x + 10, y + 16);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(b.c[0], b.c[1], b.c[2]);
      doc.text(b.v, x + 10, y + 35); doc.setFont("helvetica", "normal");
    });
    y += 62;

    // Tabla de aportaciones
    const filas = aps.length ? aps.map((a, idx) => [
      // Ordinal REAL de la fila. `numeroPago` puede venir fraccionario (2.5) por el
      // parche de pago parcial, y entonces el PDF imprimia "2.5/4" en un plan que ya
      // tiene 5 renglones. El documento que se manda no puede decir eso.
      String(idx + 1) + "/" + aps.length,
      a.concepto || ("Aportacion " + a.numeroPago),
      fmtFecha(a.fechaProgramada),
      a.fechaRecibida ? fmtFecha(a.fechaRecibida) : "-",
      money(a.monto),
      estadoAportacion(a),
    ]) : [["", "Sin aportaciones registradas.", "", "", "", ""]];
    autoTable(doc, {
      startY: y,
      head: [["#", "Concepto", "Programada", "Recibida", "Monto", "Estado"]],
      body: filas,
      foot: [["", "", "", "Total recibido", money(recibido), ""]],
      margin: { left: M, right: M },
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4, textColor: [40, 40, 40] },
      headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
      footStyles: { fillColor: [245, 245, 245], textColor: INK, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 34 }, 4: { halign: "right" } },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 5) {
          const e = d.cell.raw;
          d.cell.styles.textColor = e === "Recibida" ? GREEN : e === "Vencida" ? RED : e === "En aprobacion" ? BLUE : LABEL;
          d.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 18;

    // Rendimiento estimado (KPIs segun modo)
    let kpis;
    if (rend.modo === "plusvalia") {
      kpis = rend.sinPrecios ? [
        { l: "Plusvalia por etapa", v: "Datos de precio pendientes" },
        { l: liquidada ? "Total recibido (salida)" : "Valor hoy (capital aportado)", v: money(rend.totalARecibir) },
      ] : rend.conAnual ? [
        // Modelo combinado: el estado de cuenta desglosa las dos fuentes para que el
        // codesarrollador vea de donde sale cada peso y pueda cuadrarlo con su contrato.
        { l: "Plusvalia (" + rend.etapaActualLabel + ", " + pct(rend.pctPlusHoy) + ")", v: money(rend.gananciaPlus) },
        { l: "Rendimiento anual (" + pct(rend.tasa) + ", " + rend.dias + " dias)", v: money(rend.gananciaAnual) },
        { l: "Ganancia a hoy (suma)", v: money(rend.ganancia) },
        { l: "Precio de entrada", v: money(rend.precioEntrada) + "/m²" },
        { l: liquidada ? "Total recibido (salida)" : "Valor hoy (sobre lo aportado)", v: money(rend.totalARecibir) },
        { l: rend.hayUpside ? ("Total al vender (" + rend.etapaProyLabel + ", " + pct(rend.rendPctFinal) + ")") : "Valor estimado actual", v: money(rend.totalFinal) },
      ] : [
        { l: "Plusvalia (" + rend.etapaActualLabel + ")", v: pct(rend.rendimientoPct) },
        { l: "Precio de entrada", v: money(rend.precioEntrada) + "/m²" },
        { l: liquidada ? "Total recibido (salida)" : "Valor hoy (sobre lo aportado)", v: money(rend.totalARecibir) },
        { l: "Ganancia a hoy", v: money(rend.ganancia) },
        { l: rend.hayUpside ? ("Total al vender (" + rend.etapaProyLabel + ", " + pct(rend.rendPctFinal) + ")") : "Valor estimado actual", v: money(rend.totalFinal) },
      ];
    } else if (rend.modo === "tramos") {
      kpis = [
        { l: (liquidada ? "Retorno al vender (mes " : "Retorno si se vende hoy (mes ") + rend.mesHoy + ")", v: pct(rend.rendimientoPct) },
        { l: liquidada ? "Total recibido (salida)" : "Valor hoy (sobre lo aportado)", v: money(rend.totalARecibir) },
        { l: "Ganancia a hoy", v: money(rend.ganancia) },
        { l: "Total al vender (mes " + rend.mesFin + ", " + pct(rend.rendPctFinal) + ")", v: money(rend.totalFinal) },
      ];
    } else {
      kpis = [
        { l: "Periodo (" + rend.dias + " dias)", v: pct(rend.rendimientoPct) },
        { l: "Tasa anual", v: pct(rend.tasa) },
        { l: liquidada ? "Total recibido (salida)" : "Valor hoy (sobre lo aportado)", v: money(rend.totalARecibir) },
        { l: "Ganancia a hoy", v: money(rend.ganancia) },
        { l: "Total al final (si completa)", v: money(rend.totalFinal) },
      ];
    }
    ensure(26);
    doc.setFontSize(8); doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]);
    doc.text("RENDIMIENTO ESTIMADO", M, y); y += 12;
    const per = 3, kw = (W - M * 2 - gap * 2) / per, kh = 44;
    for (let i = 0; i < kpis.length; i += per) {
      ensure(kh + 8);
      for (let j = 0; j < per && i + j < kpis.length; j++) {
        const k = kpis[i + j];
        const x = M + j * (kw + gap);
        doc.setDrawColor(221, 221, 221); doc.roundedRect(x, y, kw, kh, 6, 6, "S");
        doc.setFontSize(7); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text(doc.splitTextToSize(String(k.l), kw - 16), x + 8, y + 13);
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text(String(k.v), x + 8, y + 33); doc.setFont("helvetica", "normal");
      }
      y += kh + 8;
    }

    // Cuenta de deposito
    if (proyecto && (proyecto.banco || proyecto.clabe)) {
      const partes = [];
      if (proyecto.banco) partes.push("Banco: " + proyecto.banco);
      if (proyecto.beneficiario) partes.push("Beneficiario: " + proyecto.beneficiario);
      if (proyecto.cuenta) partes.push("Cuenta: " + proyecto.cuenta);
      if (proyecto.clabe) partes.push("CLABE: " + proyecto.clabe);
      const txt = doc.splitTextToSize(partes.join("     "), W - M * 2 - 20);
      const bh = 26 + txt.length * 12;
      ensure(bh + 10);
      doc.setDrawColor(230, 214, 176); doc.setFillColor(250, 247, 240);
      doc.roundedRect(M, y, W - M * 2, bh, 6, 6, "FD");
      doc.setFontSize(7.5); doc.setTextColor(LABEL[0], LABEL[1], LABEL[2]); doc.text("CUENTA DE DEPOSITO", M + 10, y + 15);
      doc.setFontSize(9); doc.setTextColor(40, 40, 40); doc.text(txt, M + 10, y + 30);
      y += bh + 12;
    }

    // Pie / disclaimer
    const disc = rend.modo === "plusvalia"
      ? "Los valores son estimados y se calculan con la escalera de precios comercial vigente del proyecto; no representan m2 escriturados."
      : rend.modo === "tramos"
        ? "Los rendimientos son estimados y corresponden al retorno fijo segun el mes de venta de la propiedad."
        : "Los rendimientos son estimados y se prorratean por dia conforme a la tasa preferente vigente.";
    // La pantalla si trae la advertencia de que el numero grande NO es retirable, pero el
    // PDF -que es el documento que circula- la perdia. Va en los tres modos.
    const noRetirable = liquidada
      ? ""
      : " Estimacion al dia de hoy: no es dinero disponible para retirar; se realiza al vender o devolver el capital.";
    const vencidasPDF = aps.filter((a) => estadoAportacion(a) === "Vencida");
    const avisoVencidas = vencidasPDF.length
      ? " Las proyecciones suponen que se completan las aportaciones pendientes; a la fecha hay " +
        vencidasPDF.length + " aportacion" + (vencidasPDF.length > 1 ? "es" : "") + " vencida" +
        (vencidasPDF.length > 1 ? "s" : "") + " por " +
        money(vencidasPDF.reduce((s, a) => s + num(a.monto), 0)) + "."
      : "";
    ensure(46);
    doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text(doc.splitTextToSize("Documento informativo. No es un comprobante fiscal. " + disc + noRetirable + avisoVencidas + "  YODESARROLLO - Emitido el " + fmtFecha(todayISO()), W - M * 2), M, Math.min(y + 6, PH - 30));

    const safe = String(inversionista?.nombre || inv.folio || "estado")
      .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita acentos -> ASCII puro
      .replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "estado";
    doc.save("Estado-de-cuenta-" + safe + ".pdf");
  } catch (e) {
    try {
      console.error("descargarEstadoCuentaPDF:", String(e && e.stack ? e.stack : e));
      window.alert("No se pudo generar el PDF: " + (e?.message || "error desconocido") + ". Intenta de nuevo.");
    } catch (e2) { /* noop */ }
  }
}

// "Hoy" en hora LOCAL (no UTC), para que sea coherente con parseDate(),
// que construye la medianoche local. En Hermosillo (UTC-7), usar UTC haria
// que de noche "hoy" salte a la fecha de manana y rompa estados/fechas.
function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function makeId(prefix) {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${t}${r}`.toUpperCase();
}

// Parseo robusto de fechas (acepta "2026-06-03" o ISO con hora)
function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  // YYYY-MM-DD
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Convierte cualquier valor de fecha (incluido un ISO con hora que regresa el
// backend, ej. "2026-06-03T07:00:00.000Z") al formato "yyyy-MM-dd" en hora LOCAL,
// que es el unico que acepta <input type="date">. Sin esto, al editar un registro
// existente el campo de fecha aparece VACIO y, al guardar, la fecha se borra.
function toDateInput(s) {
  if (!s) return "";
  const str = String(s).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return str; // ya viene como yyyy-MM-dd puro
  const d = parseDate(str);
  if (!d) return "";
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtFecha(s) {
  const d = parseDate(s);
  if (!d) return "—";
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Dias completos entre dos fechas (fin - inicio), piso a 0
function diasEntre(inicio, fin) {
  const a = parseDate(inicio);
  const b = parseDate(fin);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  const dias = Math.floor(ms / (1000 * 60 * 60 * 24));
  return dias > 0 ? dias : 0;
}

// FORMULA OFICIAL DE RENDIMIENTO (preferente, prorrateado por dia)
function calcularRendimiento(capital, fechaInicio, fechaSalida, tasaAnual) {
  const cap = Number(capital) || 0;
  const tasa = (tasaAnual === "" || tasaAnual == null) ? TASA_DEFAULT : Number(tasaAnual);
  const dias = diasEntre(fechaInicio, fechaSalida);
  const rendimientoPct = dias * (tasa / 365);
  const totalARecibir = cap * (1 + rendimientoPct / 100);
  const ganancia = totalARecibir - cap;
  return { dias, rendimientoPct, totalARecibir, ganancia, tasa };
}

// fechaCorteRendimiento: hasta que fecha se acumula el rendimiento "al dia de HOY".
//  - Liquidada (estado === "Liquidada"): hasta su fecha de salida (valor final real).
//  - Activa: hasta HOY, SIN pasar de la fecha de salida (= dias transcurridos).
//  IMPORTANTE: antes el codigo usaba la fecha de salida (futura) aunque la
//  inversion siguiera ACTIVA, contando dias de mas e inflando el rendimiento.
//  Tener una fecha de salida planeada NO significa que ya este liquidada.
function fechaCorteRendimiento(inv) {
  const hoy = todayISO();
  const salida = inv && inv.fechaSalida && String(inv.fechaSalida).trim() ? String(inv.fechaSalida).trim() : "";
  const liquidada = ((inv && inv.estado) || "Activa") === "Liquidada";
  if (liquidada) return salida || hoy;
  if (salida) return hoy < salida ? hoy : salida; // min(hoy, salida)
  return hoy;
}

// calcularRendimientoInversion: rendimiento REAL de una inversion del portal.
//  Regla de negocio (definida con Alejandro):
//   - VALOR HOY: el rendimiento se gana sobre el CAPITAL YA APORTADO (no sobre
//     el monto comprometido), contando desde la FECHA DE INICIO hasta el corte
//     (hoy si esta activa; su fecha de salida si ya esta liquidada).
//   - TOTAL AL FINAL (proyeccion): sobre el monto COMPROMETIDO completo, por
//     todo el plazo (inicio -> fecha de salida), suponiendo que complete sus
//     aportaciones. Es solo una estimacion informativa.
//  Soporta DOS modos:
//   - "anual": tasa anual sobre lo aportado (prorrateada por dia). Lo normal.
//   - "tramos": retorno FIJO (no anualizado) segun el MES DE VENTA, por tabla de
//     tramos (ej. vender en mes 1-6 => 12.5% del capital; 6-8 => 16.67%...).
//  El modo "tramos" se activa cuando la inversion trae 'tramos' (JSON no vacio).
//  Devuelve campos compatibles (dias/rendimientoPct/ganancia/totalARecibir +
//  rendPctFinal/gananciaFinal/totalFinal) + 'modo' y, en tramos, mesHoy/mesFin.
function parseTramos(raw) {
  if (!raw) return [];
  try {
    const t = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(t)) return [];
    // Solo tramos COMPLETOS y validos: si una fila esta a medio capturar (sin %
    // o sin 'hasta'), se IGNORA. Si no queda ninguna valida, devuelve [] y la
    // inversion sigue en MODO ANUAL (no se pisa la tasa normal con 0%). Se
    // normaliza a numeros y se ORDENA por mes, para que la busqueda y el tope
    // no dependan del orden en que se capturaron.
    return t
      .filter((x) => x
        && String(x.desde).trim() !== "" && Number.isFinite(Number(x.desde)) && Number(x.desde) >= 1
        && String(x.hasta).trim() !== "" && Number.isFinite(Number(x.hasta)) && Number(x.hasta) >= Number(x.desde)
        && String(x.pct).trim() !== "" && Number.isFinite(Number(x.pct)) && Number(x.pct) >= 0)
      .map((x) => ({ desde: Number(x.desde), hasta: Number(x.hasta), pct: Number(x.pct) }))
      .sort((a, b) => (a.desde - b.desde) || (a.hasta - b.hasta));
  } catch (e) { return []; }
}
// Mes-etiqueta para tramos (1-based). Dia 0 -> mes 1; aniversario EXACTO de N
// meses -> mes N (cierra el mes recien cumplido, no salta al siguiente); parcial
// -> mes en curso (N+1). Sin fecha valida -> 0 (no rinde). Esto evita el
// off-by-one en la frontera (vender justo a los 6 meses = mes 6, no mes 7).
function mesParaTramo(inicio, fin) {
  const a = parseDate(inicio), b = parseDate(fin);
  if (!a || !b) return 0;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1; // aun no cumple el mes
  m = Math.max(0, m);
  const esAniversario = b.getDate() === a.getDate();
  return Math.max(1, esAniversario ? m : m + 1);
}
// % del tramo segun el mes. Match directo por rango [desde,hasta]; si cae en un
// HUECO o despues del ultimo tramo, hereda el % del tramo inferior mas cercano
// (retorno monotono, no "baja" a 0); antes del primer tramo (o sin mes) -> 0.
function pctTramo(tramos, mesEnCurso) {
  if (!tramos.length || !mesEnCurso) return 0;
  for (let i = 0; i < tramos.length; i++) {
    if (mesEnCurso >= tramos[i].desde && mesEnCurso <= tramos[i].hasta) return tramos[i].pct;
  }
  let mejor = null;
  for (let i = 0; i < tramos.length; i++) {
    if (tramos[i].hasta < mesEnCurso && (mejor === null || tramos[i].hasta > mejor.hasta)) mejor = tramos[i];
  }
  return mejor ? mejor.pct : 0;
}

function calcularRendimientoInversion(inv, capitalRecibido, precios, proyecto) {
  const monto = num(inv.montoTotal);
  const recibido = num(capitalRecibido);

  // ----- MODO PLUSVALIA: el valor sube por ETAPA de precio del terreno -----
  //  Se activa cuando el PROYECTO esta marcado como plusvalia (proyecto.plusvaliaKey).
  //  - precio ACTUAL = precio de la etapa actual del PROYECTO (proyecto.etapaPrecio),
  //    leido en vivo de la hoja. Aplica a TODOS los codesarrolladores del proyecto.
  //  - precio de ENTRADA = el capturado a mano en la inversion (inv.precioEntrada),
  //    por si entro en una etapa que no esta en la hoja (ej. Fundador I).
  //  valor hoy = capital aportado x (precioActual / precioEntrada). Proyeccion a
  //  la etapa "Venta", sobre el monto comprometido. Si faltan datos, avisa (sinPrecios)
  //  y NUNCA cae a tasa anual (mostraria un % que no corresponde a un terreno).
  const claveP = proyecto && proyecto.plusvaliaKey && String(proyecto.plusvaliaKey).trim() ? String(proyecto.plusvaliaKey).trim() : "";
  if (claveP) {
    const tablaP = precios && precios[claveP] && precios[claveP].etapas ? precios[claveP].etapas : null;
    const etapaAct = (proyecto.etapaPrecio || "").trim();
    const liq = (inv.estado || "Activa") === "Liquidada";
    const pSalida = Number(inv.precioSalida) || 0;
    const pActualStage = tablaP ? (Number(tablaP[etapaAct]) || 0) : 0;
    // Al LIQUIDAR se congela el valor en el precio de salida capturado; ya no
    // sigue la etapa del proyecto. Si no se capturo, cae a la etapa actual.
    const pActual = (liq && pSalida > 0) ? pSalida : pActualStage;
    const pEntrada = Number(inv.precioEntrada) || 0;
    const baseP = {
      modo: "plusvalia", monto, recibido, precioEntrada: pEntrada,
      etapaActualLabel: liq ? "Salida" : etiquetaEtapaPlusvalia(etapaAct),
    };
    if (pEntrada > 0 && pActual > 0) {
      // Liquidada: no hay proyeccion futura (ya se cerro). Activa: proyecta a "Venta".
      const pVentaRaw = liq ? 0 : (tablaP ? (Number(tablaP.venta) || 0) : 0);
      const hayVenta = pVentaRaw > 0;
      const pProy = liq ? pActual : Math.max(pVentaRaw, pActual);
      const etapaProyLabel = liq ? "Salida" : ((pVentaRaw > 0 && pVentaRaw > pActual) ? "Venta" : etiquetaEtapaPlusvalia(etapaAct));
      const factorHoy = pActual / pEntrada;
      const factorFin = pProy / pEntrada;

      // MODELO COMBINADO (decision de Alejandro, 27-ago-2026): en Real Miramar el
      // codesarrollador gana las DOS cosas juntas: la plusvalia por etapa del terreno
      // MAS el rendimiento anual pactado sobre su capital. Antes la rama de plusvalia
      // retornaba aqui e IGNORABA en silencio la tasa capturada (17.6% en
      // RM-ME-2025-01), asi que el portal mostraba solo una de las dos.
      // Si la inversion no trae tasa, el resultado es identico al de antes.
      const tasaMix = Math.max(0, Number(inv.tasaAnual) || 0);
      const corteMix = fechaCorteRendimiento(inv);
      const finMix = inv.fechaSalida && String(inv.fechaSalida).trim() ? String(inv.fechaSalida).trim() : corteMix;
      const diasMix = diasEntre(inv.fechaInicio, corteMix);
      const diasMixTotal = diasEntre(inv.fechaInicio, finMix);
      const pctAnualHoy = tasaMix > 0 ? diasMix * (tasaMix / 365) : 0;
      const pctAnualFin = tasaMix > 0 ? diasMixTotal * (tasaMix / 365) : 0;

      const gananciaPlus = recibido * (factorHoy - 1);
      const gananciaAnual = recibido * (pctAnualHoy / 100);
      const ganancia = gananciaPlus + gananciaAnual;
      const totalARecibir = recibido + ganancia;

      const gananciaPlusFin = monto * (factorFin - 1);
      const gananciaAnualFin = monto * (pctAnualFin / 100);
      const gananciaFinal = gananciaPlusFin + gananciaAnualFin;
      const totalFinal = monto + gananciaFinal;

      return {
        ...baseP, sinPrecios: false, hayVenta, etapaProyLabel,
        hayUpside: !liq && totalFinal > totalARecibir + 0.5,
        precioActual: pActual, precioVenta: pProy,
        // Desglose para que el portal pueda explicar de donde sale cada peso.
        conAnual: tasaMix > 0, tasa: tasaMix, dias: diasMix, diasTotal: diasMixTotal,
        pctPlusHoy: (factorHoy - 1) * 100, pctAnualHoy,
        pctPlusFin: (factorFin - 1) * 100, pctAnualFin,
        gananciaPlus, gananciaAnual, gananciaPlusFin, gananciaAnualFin,
        rendimientoPct: recibido > 0 ? (ganancia / recibido) * 100 : (factorHoy - 1) * 100,
        ganancia, totalARecibir,
        rendPctFinal: monto > 0 ? (gananciaFinal / monto) * 100 : (factorFin - 1) * 100,
        gananciaFinal, totalFinal,
      };
    }
    // Falta el precio de entrada (a mano) o el precio de la etapa actual: avisar.
    return {
      ...baseP, sinPrecios: true, hayVenta: false, precioActual: 0, precioVenta: 0,
      rendimientoPct: 0, ganancia: 0, totalARecibir: recibido,
      rendPctFinal: 0, gananciaFinal: 0, totalFinal: monto,
    };
  }

  const corte = fechaCorteRendimiento(inv);
  const finProy = inv.fechaSalida && String(inv.fechaSalida).trim() ? String(inv.fechaSalida).trim() : corte;
  const tramos = parseTramos(inv.tramos);

  // ----- MODO TRAMOS: retorno fijo segun el mes de venta (no anualizado) -----
  if (tramos.length) {
    const mesHoy = mesParaTramo(inv.fechaInicio, corte);     // mes en curso hoy (0 si falta fecha)
    const mesFin = mesParaTramo(inv.fechaInicio, finProy);   // mes de venta esperado
    const pctHoy = pctTramo(tramos, mesHoy);
    const pctFin = pctTramo(tramos, mesFin);
    const ganancia = recibido * (pctHoy / 100);        // si se vende hoy: sobre lo aportado
    const totalARecibir = recibido + ganancia;
    const gananciaFinal = monto * (pctFin / 100);      // proyeccion: sobre el comprometido
    const totalFinal = monto + gananciaFinal;
    return {
      modo: "tramos", monto, recibido, tramos,
      mesHoy, mesFin, dias: diasEntre(inv.fechaInicio, corte),
      rendimientoPct: pctHoy, ganancia, totalARecibir,
      rendPctFinal: pctFin, gananciaFinal, totalFinal,
    };
  }

  // ----- MODO ANUAL: tasa anual sobre lo aportado, desde el inicio -----
  // Tasa vacia -> default; negativa o basura -> 0 (este producto no tiene
  // rendimientos negativos; un - por error de captura no debe mostrar perdidas).
  const tasa = (inv.tasaAnual === "" || inv.tasaAnual == null) ? TASA_DEFAULT : Math.max(0, num(inv.tasaAnual));
  const dias = diasEntre(inv.fechaInicio, corte);
  const rendimientoPct = dias * (tasa / 365);
  const ganancia = recibido * (rendimientoPct / 100);
  const totalARecibir = recibido + ganancia;
  const diasTotal = diasEntre(inv.fechaInicio, finProy);
  const rendPctFinal = diasTotal * (tasa / 365);
  const gananciaFinal = monto * (rendPctFinal / 100);
  const totalFinal = monto + gananciaFinal;
  return { modo: "anual", tasa, monto, recibido, dias, rendimientoPct, ganancia, totalARecibir, diasTotal, rendPctFinal, gananciaFinal, totalFinal };
}

// Estado derivado de una aportacion (la fuente de verdad es fechaRecibida;
// la columna 'estado' del Sheet no se usa para derivar, por eso no se persiste)
function estadoAportacion(ap) {
  if (ap.fechaRecibida && String(ap.fechaRecibida).trim()) return "Recibida";
  // El inversionista ya reporto su pago (referencia/comprobante) pero el equipo aun no lo valida.
  if (ap.fechaReporte && String(ap.fechaReporte).trim()) return "En aprobacion";
  const prog = parseDate(ap.fechaProgramada);
  if (prog) {
    const hoy = parseDate(todayISO());
    if (prog < hoy) return "Vencida";
  }
  return "Pendiente";
}

function arr(x) { return Array.isArray(x) ? x : []; }
function num(x) { const v = Number(x); return isFinite(v) ? v : 0; }

// Genera una clave de acceso legible (mismo formato que el backend).
function generarClaveAcceso() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 15; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s.slice(0, 5) + "-" + s.slice(5, 10) + "-" + s.slice(10);
}

// Convierte un enlace de Drive (file/d/ID) en una URL apta para <img> (miniatura).
function driveImg(url) {
  const s = String(url || "");
  const m = s.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
  return url;
}

// Suma n meses a una fecha "yyyy-MM-dd" (ajustando el dia si el mes es mas corto).
function sumarMeses(iso, n) {
  const d = parseDate(iso);
  if (!d) return iso;
  const dia = d.getDate();
  const destino = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimoDia));
  return `${destino.getFullYear()}-${String(destino.getMonth() + 1).padStart(2, "0")}-${String(destino.getDate()).padStart(2, "0")}`;
}

// Quita campos sensibles (claveAcceso, notas) de los inversionistas antes de
// persistir el cache en localStorage. El cache es solo para arranque/offline de
// la UI; no necesita las claves de acceso ni notas internas, que en una Mac
// compartida o con una extension maliciosa quedarian expuestas en texto plano.
function sanitizarParaCache(data) {
  const d = data || {};
  const inversionistas = arr(d.Inversionistas).map((i) => {
    const { claveAcceso, notas, ...resto } = i || {};
    return resto;
  });
  // Tampoco persistimos la claveAcceso de los asesores en el cache local.
  const asesores = arr(d.Asesores).map((a) => {
    const { claveAcceso, ...resto } = a || {};
    return resto;
  });
  return { ...d, Inversionistas: inversionistas, Asesores: asesores };
}

// ===================================================================
// API
// ===================================================================
const BACKEND_LISTO = APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("PEGA_AQUI");

// Datos de EJEMPLO para vista previa local (solo cuando el backend no esta conectado).
// En cuanto pegues la URL real del Apps Script, esto se ignora por completo.
const DEMO_DATA = {
  inversionista: { id: "demo", nombre: "Juan Perez", email: "juan@ejemplo.mx", telefono: "" },
  proyectos: [{ id: "proy-demo", nombre: "Residencial Demo", tipo: "Obra", etapaActual: "Construccion", banco: "Banco (ejemplo)", beneficiario: "YODESARROLLO SAPI DE CV", cuenta: "000000000", clabe: "000000000000000000", conceptoBase: "Aportacion Residencial Demo - <Codesarrollador> - <Folio>", estado: "Abierto" }],
  inversiones: [{ folio: "DEMO-2026-01", inversionistaId: "demo", proyectoId: "proy-demo", montoTotal: 1000000, fechaInicio: "2026-03-06", fechaSalida: "", tasaAnual: 25, estado: "Activa" }],
  aportaciones: [
    { id: "d-a1", folio: "DEMO-2026-01", numeroPago: 1, totalPagos: 4, concepto: "Aportacion inicial", fechaProgramada: "2026-03-06", monto: 350000, fechaRecibida: "2026-03-06", comprobanteUrl: "" },
    { id: "d-a2", folio: "DEMO-2026-01", numeroPago: 2, totalPagos: 4, concepto: "Aportacion 2 de 4", fechaProgramada: "2026-04-06", monto: 216667, fechaRecibida: "2026-04-08", comprobanteUrl: "" },
    { id: "d-a3", folio: "DEMO-2026-01", numeroPago: 3, totalPagos: 4, concepto: "Aportacion 3 de 4", fechaProgramada: "2026-05-06", monto: 216667, fechaRecibida: "2026-05-06", comprobanteUrl: "" },
    { id: "d-a4", folio: "DEMO-2026-01", numeroPago: 4, totalPagos: 4, concepto: "Aportacion final", fechaProgramada: "2026-06-06", monto: 216666, fechaRecibida: "", comprobanteUrl: "" },
  ],
  documentos: [{ id: "d-doc1", folio: "DEMO-2026-01", tipo: "Contrato", nombre: "Promesa de Pago (ejemplo)", url: "", fecha: "2026-03-06" }],
  avances: [
    { id: "av1", proyectoId: "proy-demo", tipo: "foto", etapa: "Cimentacion", url: "https://picsum.photos/seed/obra-cimentacion/600/450", titulo: "Cimentacion terminada", fecha: "2026-03-20" },
    { id: "av2", proyectoId: "proy-demo", tipo: "foto", etapa: "Estructura", url: "https://picsum.photos/seed/obra-estructura/600/450", titulo: "Estructura nivel 1", fecha: "2026-04-18" },
    { id: "av3", proyectoId: "proy-demo", tipo: "video", etapa: "Estructura", url: "https://youtu.be/ejemplo", titulo: "Recorrido en obra", fecha: "2026-05-10" },
    { id: "av4", proyectoId: "proy-demo", tipo: "foto", etapa: "Estructura", url: "https://picsum.photos/seed/obra-losa/600/450", titulo: "Colado de losa nivel 2", fecha: "2026-05-28" },
  ],
  bitacora: [
    { id: "b1", proyectoId: "proy-demo", fecha: "2026-05-28", autor: "Sayri", etiqueta: "Avance", titulo: "Losa del nivel 2 colada", nota: "Esta semana completamos el colado de la losa del segundo nivel. Vamos en tiempo con el plan de obra." },
    { id: "b2", proyectoId: "proy-demo", fecha: "2026-05-12", autor: "Sayri", etiqueta: "Respuesta", titulo: "", nota: "Juan, sobre tu pregunta de los acabados: la seleccion de pisos la vemos juntos en la visita del proximo mes." },
    { id: "b3", proyectoId: "proy-demo", fecha: "2026-04-18", autor: "Sayri", etiqueta: "Avance", titulo: "Estructura del nivel 1 lista", nota: "Terminamos la estructura del primer nivel. Te subimos fotos nuevas a tu galeria de avance." },
  ],
};

// Detecta si un error del backend es por credenciales de admin invalidas,
// para poder forzar un re-login en vez de dejar la sesion atorada.
function esErrorCredenciales(msg) {
  return /credencial|clave invalida/i.test(String(msg || ""));
}

async function apiCall(action, payload = {}) {
  if (!BACKEND_LISTO) {
    throw new Error("Falta conectar el backend: pega la URL del Apps Script en APPS_SCRIPT_URL.");
  }
  const body = JSON.stringify({ action, ...payload });
  let res;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
    });
  } catch (e) {
    throw new Error("No se pudo conectar con el servidor. Revisa tu internet o la URL del Apps Script.");
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error("El servidor respondio algo inesperado. Si re-desplegaste el Apps Script, actualiza la URL.");
  }
  if (!data || data.ok !== true) {
    throw new Error((data && data.error) || "Ocurrio un error en el servidor.");
  }
  return data;
}

// ===================================================================
// ERROR BOUNDARY
// ===================================================================
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-800 flex items-center gap-2">
              <AlertTriangle size={20} /> Algo salio mal
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Hubo un error al mostrar esta parte del portal. Recarga la pagina con Cmd+Shift+R.
              Si sigue igual, abre la consola (F12) y comparte el mensaje.
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===================================================================
// COMPONENTES UI BASE
// ===================================================================
function Spinner({ size = 16, className = "" }) {
  return <Loader2 size={size} className={"animate-spin " + className} />;
}

function Toast({ toast }) {
  if (!toast) return null;
  const tone = toast.tipo === "error"
    ? "bg-red-600"
    : toast.tipo === "ok" ? "bg-emerald-600" : "bg-slate-800";
  const Icon = toast.tipo === "error" ? AlertCircle : toast.tipo === "ok" ? CheckCircle2 : Sparkles;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] px-4">
      <div className={`${tone} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm max-w-md`}>
        <Icon size={18} className="shrink-0" />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

function CopyButton({ value, label = "Copiar" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (e) { /* noop */ }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
      title={label}
    >
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {done ? "Copiado" : label}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="text-[11px] text-slate-500 mt-1 block">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 sm:py-2 text-base sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 bg-white";

function Input(props) { return <input {...props} className={inputCls + " " + (props.className || "")} />; }
function Select(props) { return <select {...props} className={inputCls + " " + (props.className || "")} />; }
function Textarea(props) { return <textarea {...props} className={inputCls + " resize-y " + (props.className || "")} />; }

// Subida de archivos: arrastra o busca un archivo -> se sube a Drive (accion
// subirArchivo) -> devuelve la URL via onSubido. 'auth' es {pass} (admin) o
// {clave} (inversionista). Mantiene el sistema de enlaces: solo llena la URL.
function FileUpload({ auth, onSubido, accept = "image/*,application/pdf", nota, privado = false }) {
  const [estado, setEstado] = useState("idle"); // idle | subiendo | ok | error
  const [error, setError] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const subir = async (file) => {
    if (!file) return;
    setError(""); setEstado("subiendo");
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error("No se pudo leer el archivo."));
        r.readAsDataURL(file);
      });
      const base64 = String(dataUrl).split(",")[1] || "";
      const res = await apiCall("subirArchivo", { ...(auth || {}), filename: file.name, mime: file.type || "application/octet-stream", base64, privado });
      // Privado (comprobantes): se guarda el fileId; se ve despues via verComprobante.
      // Publico (avances/documentos): se guarda la URL para mostrarla directo.
      onSubido(privado ? (res.fileId || "") : (res.url || ""));
      setEstado("ok");
    } catch (e) {
      setError(e?.message || "No se pudo subir el archivo."); setEstado("error");
    }
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current && inputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files && e.dataTransfer.files[0]) subir(e.dataTransfer.files[0]); }}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-3 text-center text-xs transition ${drag ? "border-[#c9a96e] bg-[#f5efdf]" : "border-slate-200 hover:border-[#c9a96e]"}`}
      >
        {estado === "subiendo" ? (
          <span className="inline-flex items-center gap-2 text-slate-500"><Spinner size={14} /> Subiendo a Drive...</span>
        ) : estado === "ok" ? (
          <span className="inline-flex items-center gap-2 text-emerald-600"><Check size={14} /> {privado ? "Subido y guardado de forma segura." : "Subido. El enlace quedo guardado abajo."}</span>
        ) : (
          <span className="inline-flex items-center gap-2 text-slate-500"><Upload size={14} /> Arrastra una foto/archivo aqui, o haz clic para buscarlo</span>
        )}
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => subir(e.target.files && e.target.files[0])} />
      </div>
      {nota && estado === "idle" ? <p className="text-[11px] text-slate-400 mt-1">{nota}</p> : null}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// Muestra un comprobante respetando la privacidad. Si el valor guardado es un
// enlace http (comprobante viejo, publico), lo abre directo. Si es un fileId
// privado, lo pide al backend (verComprobante) con la credencial y lo abre.
// 'auth' = {pass} (admin) o {clave} (codesarrollador/asesor). 'id' = id de la aportacion.
function VerComprobante({ comprobante, id, auth, label = "Comprobante", soloIcono = false }) {
  const val = comprobante ? String(comprobante).trim() : "";
  const [estado, setEstado] = useState("idle"); // idle | cargando | error
  const [error, setError] = useState("");
  if (!val) return null;

  const cls = "text-slate-400 hover:text-[#b8965a] inline-flex items-center gap-1 text-xs";

  // Compatibilidad: comprobante viejo (URL publica) -> enlace directo.
  if (/^https?:\/\//i.test(val)) {
    return (
      <a href={val} target="_blank" rel="noreferrer" className={cls}>
        <ExternalLink size={14} />{soloIcono ? null : <span>{label}</span>}
      </a>
    );
  }

  const abrir = async () => {
    setError(""); setEstado("cargando");
    try {
      const res = await apiCall("verComprobante", { ...(auth || {}), id });
      if (res.vacio) { setEstado("idle"); setError("Sin comprobante."); return; }
      if (res.url) { window.open(res.url, "_blank"); setEstado("idle"); return; }
      if (res.dataUrl) { abrirDataUrl(res.dataUrl, res.filename); setEstado("idle"); return; }
      setEstado("idle");
    } catch (e) {
      setError(e?.message || "No se pudo abrir."); setEstado("error");
    }
  };

  return (
    <button type="button" onClick={abrir} title="Ver comprobante" className={cls}>
      {estado === "cargando" ? <Spinner size={14} /> : <ExternalLink size={14} />}
      {soloIcono ? null : <span>{label}</span>}
      {error ? <span className="text-red-500 ml-1">{error}</span> : null}
    </button>
  );
}

// Boton "Recordar por WhatsApp" para una aportacion (admin). Solo aparece si el
// pago esta Vencido o Pendiente y el codesarrollador tiene telefono registrado.
function BotonRecordarWA({ ap, inversionista, proyecto, soloIcono = false }) {
  const est = estadoAportacion(ap);
  if (est === "Recibida" || est === "En aprobacion") return null;
  const tel = inversionista?.telefono;
  if (!tel || !String(tel).trim()) return null;
  return (
    <button
      type="button"
      title="Recordar por WhatsApp"
      onClick={() => recordarPorWhatsApp(tel, mensajeRecordatorioPago(ap, inversionista, proyecto))}
      className="text-emerald-600 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50 inline-flex items-center gap-1"
    >
      <MessageCircle size={16} />{soloIcono ? null : <span className="text-xs">WhatsApp</span>}
    </button>
  );
}

function Btn({ children, variant = "primary", className = "", ...rest }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium px-3.5 py-2.5 sm:py-2 min-h-[44px] sm:min-h-0 transition disabled:opacity-65 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50 bg-white",
    danger: "bg-red-600 text-white hover:bg-red-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
    gold: "bg-[#c9a96e] text-[#1a1409] hover:bg-[#d4be8a]",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest}>{children}</button>;
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    gray: "bg-slate-100 text-slate-500",
  };
  return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tones[tone] || tones.slate}`}>{children}</span>;
}

function EstadoAportacionBadge({ ap }) {
  const e = estadoAportacion(ap);
  if (e === "Recibida") return <Badge tone="green"><CheckCircle2 size={12} /> Recibida</Badge>;
  if (e === "En aprobacion") return <Badge tone="blue"><Clock size={12} /> En aprobacion</Badge>;
  if (e === "Vencida") return <Badge tone="red"><AlertTriangle size={12} /> Vencida</Badge>;
  return <Badge tone="amber"><Clock size={12} /> Pendiente</Badge>;
}

function EstadoInversionBadge({ estado }) {
  if (estado === "Liquidada") return <Badge tone="blue"><BadgeCheck size={12} /> Liquidada</Badge>;
  if (estado === "Cancelada") return <Badge tone="gray"><X size={12} /> Cancelada</Badge>;
  return <Badge tone="green"><TrendingUp size={12} /> Activa</Badge>;
}

function Modal({ open, onClose, title, children, width = "max-w-2xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${width} my-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-2.5 -mr-1.5 rounded-lg hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = "Eliminar" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" /> {title}
        </h3>
        <p className="text-sm text-slate-600 mt-2">{message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={onCancel}>Cancelar</Btn>
          <Btn variant="danger" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// LOGIN GATE
// ===================================================================
function LoginGate({ onAdmin, onInvestor, onAsesor }) {
  const [modo, setModo] = useState(null); // null | "admin" | "investor" | "recuperar"
  const [pass, setPass] = useState("");
  const [clave, setClave] = useState("");
  const [email, setEmail] = useState("");
  const [recOk, setRecOk] = useState(false);
  const [verPass, setVerPass] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const recuperar = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    if (!BACKEND_LISTO) { setRecOk(true); setCargando(false); return; }
    try {
      await apiCall("recuperarClave", { email });
      setRecOk(true);
    } catch (err) {
      setError(err.message || "No se pudo enviar. Intenta de nuevo.");
    } finally { setCargando(false); }
  };

  const entrarAdmin = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    try {
      await apiCall("adminLogin", { pass });
      onAdmin(pass);
    } catch (err) {
      setError(err.message || "Credenciales invalidas");
    } finally { setCargando(false); }
  };

  const entrarInversionista = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    if (!BACKEND_LISTO) { onInvestor("demo", {}); setCargando(false); return; }
    try {
      const res = await apiCall("investorLogin", { clave });
      onInvestor(clave, res);
    } catch (err) {
      setError(err.message || "Clave invalida");
    } finally { setCargando(false); }
  };

  const entrarAsesor = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    try {
      await apiCall("asesorLogin", { clave });
      onAsesor(clave);
    } catch (err) {
      setError(err.message || "Clave invalida");
    } finally { setCargando(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0a0c" }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logoWhite} alt="YODESARROLLO.MX" className="h-8 md:h-9 w-auto mb-3.5" style={{ mixBlendMode: "screen" }} />
          <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "#c9a96e" }}>Portal de Co-desarrolladores</div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {!BACKEND_LISTO && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-amber-800 text-xs">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Falta conectar el backend. Pega la URL del Apps Script en <b>APPS_SCRIPT_URL</b> dentro de App.jsx y vuelve a publicar.</span>
            </div>
          )}

          {modo === null && (
            <div>
              {/* HERO: el Codesarrollador es el protagonista */}
              <button
                onClick={() => { setModo("investor"); setError(""); }}
                className="group w-full text-left rounded-2xl shadow-lg transition p-5 hover:brightness-105"
                style={{ background: "linear-gradient(135deg, #d4be8a 0%, #c9a96e 100%)", boxShadow: "0 10px 30px -8px rgba(201,169,110,0.45)" }}
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0" style={{ background: "rgba(26,20,9,0.14)" }}>
                    <Wallet size={26} style={{ color: "#1a1409" }} />
                  </div>
                  <div>
                    <div className="font-display text-2xl leading-none" style={{ color: "#1a1409" }}>Soy Codesarrollador</div>
                    <div className="text-xs mt-1" style={{ color: "#5c4a24" }}>Consulta tu inversion, aportaciones y documentos</div>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 font-semibold text-sm rounded-lg px-3.5 py-2.5 transition group-hover:gap-3" style={{ background: "rgba(26,20,9,0.18)", border: "1px solid rgba(26,20,9,0.28)", color: "#1a1409" }}>
                  Entrar a mi portal <ChevronRight size={16} />
                </div>
              </button>

              {/* Acceso del equipo: discreto, sin jerarquia */}
              <div className="mt-5 pt-4 border-t border-slate-100 text-center space-y-2">
                <button
                  onClick={() => { setModo("admin"); setError(""); }}
                  className="text-xs text-slate-600 hover:text-slate-800 transition inline-flex items-center gap-1.5 px-3 py-2.5"
                >
                  <ShieldCheck size={13} /> ¿Eres del equipo? Acceso administrador
                </button>
                <div>
                  <button
                    onClick={() => { setModo("asesor"); setError(""); setClave(""); }}
                    className="text-xs text-slate-600 hover:text-slate-800 transition inline-flex items-center gap-1.5 px-3 py-2.5"
                  >
                    <HardHat size={13} /> ¿Eres asesor? Acceso asesor
                  </button>
                </div>
              </div>
            </div>
          )}

          {modo === "admin" && (
            <form onSubmit={entrarAdmin} className="space-y-4">
              <button type="button" onClick={() => { setModo(null); setError(""); }} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 -ml-2 px-2 py-2">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><ShieldCheck size={18} /> Acceso administrador</h2>
              <Field label="Contrasena de administrador">
                <div className="relative">
                  <input
                    type={verPass ? "text" : "password"}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    autoFocus
                    className={inputCls + " pr-10"}
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setVerPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    {verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
              <Btn type="submit" disabled={cargando || !pass} className="w-full">
                {cargando ? <Spinner /> : <Lock size={16} />} Entrar
              </Btn>
            </form>
          )}

          {modo === "investor" && (
            <form onSubmit={entrarInversionista} className="space-y-4">
              <button type="button" onClick={() => { setModo(null); setError(""); }} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 -ml-2 px-2 py-2">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Wallet size={18} className="text-amber-600" /> Acceso Codesarrollador</h2>
              <Field label="Tu contraseña" hint="Te la proporciona el equipo de YoDesarrollo (o la que tu pusiste en 'Mi cuenta').">
                <div className="relative">
                  <input
                    type={verPass ? "text" : "password"}
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    autoFocus
                    className={inputCls + " pr-10"}
                    placeholder="Tu contraseña"
                  />
                  <button type="button" onClick={() => setVerPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    {verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
              {!BACKEND_LISTO && <p className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(201,169,110,0.12)", color: "#7a5e1e" }}>Vista previa: pulsa el boton para ver un ejemplo (datos de muestra).</p>}
              <Btn type="submit" variant="gold" disabled={cargando || (BACKEND_LISTO && !clave)} className="w-full">
                {cargando ? <Spinner /> : <KeyRound size={16} />} Ver mi cartera
              </Btn>
              <button type="button" onClick={() => { setModo("recuperar"); setError(""); setRecOk(false); setEmail(""); }} className="w-full text-center text-xs text-slate-500 hover:text-[#b8965a] transition">¿Olvidaste tu contraseña?</button>
            </form>
          )}

          {modo === "asesor" && (
            <form onSubmit={entrarAsesor} className="space-y-4">
              <button type="button" onClick={() => { setModo(null); setError(""); }} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 -ml-2 px-2 py-2">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><HardHat size={18} className="text-amber-600" /> Acceso asesor</h2>
              <Field label="Tu contraseña de asesor" hint="Te la proporciona el equipo de YoDesarrollo.">
                <div className="relative">
                  <input
                    type={verPass ? "text" : "password"}
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    autoFocus
                    className={inputCls + " pr-10"}
                    placeholder="Tu contraseña de asesor"
                  />
                  <button type="button" onClick={() => setVerPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    {verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
              <Btn type="submit" variant="gold" disabled={cargando || !clave} className="w-full">
                {cargando ? <Spinner /> : <KeyRound size={16} />} Entrar
              </Btn>
            </form>
          )}

          {modo === "recuperar" && (
            <form onSubmit={recuperar} className="space-y-4">
              <button type="button" onClick={() => { setModo("investor"); setError(""); setRecOk(false); }} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 -ml-2 px-2 py-2">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><KeyRound size={18} className="text-amber-600" /> Recuperar mi acceso</h2>
              {recOk ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <span>Si tu correo esta registrado, te enviamos tu acceso. Revisa tu bandeja (y la carpeta de spam).</span>
                </div>
              ) : (
                <>
                  <Field label="Tu correo registrado" hint="Te enviaremos tu clave de acceso a ese correo.">
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="correo@ejemplo.com" />
                  </Field>
                  {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
                  <Btn type="submit" variant="gold" disabled={cargando || !email} className="w-full">
                    {cargando ? <Spinner /> : <KeyRound size={16} />} Enviarme mi acceso
                  </Btn>
                </>
              )}
            </form>
          )}
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-4">
          Portal interno de control financiero. Tus datos viven solo en una hoja privada de Google.
        </p>
      </div>
    </div>
  );
}

// ===================================================================
// KPI CARD
// ===================================================================
function KpiCard({ icon: Icon, label, value, sub, tone = "slate", alert = false }) {
  const tones = {
    slate: "from-slate-50 to-white border-slate-200 text-slate-700",
    green: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
    amber: "from-amber-50 to-white border-amber-200 text-amber-700",
    gold: "from-[#f5efdf] to-white border-[#e6d6b0] text-[#7a5e1e]",
    blue: "from-blue-50 to-white border-blue-200 text-blue-700",
    red: "from-red-50 to-white border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-3 sm:p-4 min-w-0 ${tones[tone]} ${alert ? "ring-2 ring-red-300" : ""}`}>
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
          <Icon size={17} />
        </div>
        <span className="text-xs font-medium text-slate-500 leading-tight">{label}</span>
      </div>
      <div className="mt-2 text-lg sm:text-2xl font-semibold text-slate-900 tabular-nums break-words leading-tight">{value}</div>
      {sub ? <div className="text-xs text-slate-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

// ===================================================================
// CALCULADORA DE RENDIMIENTO
// ===================================================================
const REFERENCIAS = [
  { meses: 6, dias: 182 },
  { meses: 12, dias: 365 },
  { meses: 18, dias: 547 },
  { meses: 24, dias: 730 },
];

function Calculadora({ capitalInicial = 1000000, fechaInicio = todayISO(), tasaInicial = TASA_DEFAULT }) {
  const [capital, setCapital] = useState(capitalInicial);
  const [tasa, setTasa] = useState(tasaInicial);
  const [modo, setModo] = useState("meses"); // "meses" | "fecha"
  const [meses, setMeses] = useState(12);
  const [inicio, setInicio] = useState(toDateInput(fechaInicio));
  const [salida, setSalida] = useState("");

  useEffect(() => { setCapital(capitalInicial); }, [capitalInicial]);
  useEffect(() => { setInicio(toDateInput(fechaInicio) || todayISO()); }, [fechaInicio]);
  useEffect(() => { setTasa(tasaInicial); }, [tasaInicial]);

  // Calculo: por dias siempre es la fuente de verdad
  const resultado = useMemo(() => {
    if (modo === "fecha" && salida) {
      return calcularRendimiento(capital, inicio, salida, tasa);
    }
    // Por meses: convertimos meses a dias con 365/12 = 30.4167
    const dias = Math.round(Number(meses) * (365 / 12));
    // Una tasa de 0 es un dato valido, no "vacio": con `Number(tasa) || TASA_DEFAULT`
    // el 0 se convertia en 25% y la calculadora contradecia a la tabla de referencia,
    // que si respeta el 0.
    const tasaN = (tasa === "" || tasa == null) ? TASA_DEFAULT : Math.max(0, Number(tasa) || 0);
    const rendimientoPct = dias * (tasaN / 365);
    const cap = Number(capital) || 0;
    const totalARecibir = cap * (1 + rendimientoPct / 100);
    return { dias, rendimientoPct, totalARecibir, ganancia: totalARecibir - cap, tasa: tasaN };
  }, [modo, salida, inicio, meses, capital, tasa]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Capital invertido">
          <Input type="number" value={capital} onChange={(e) => setCapital(e.target.value)} min={0} />
        </Field>
        <Field label="Tasa anual (%)" hint="Preferente, por defecto 25%.">
          <Input type="number" value={tasa} onChange={(e) => setTasa(e.target.value)} min={0} step="0.1" />
        </Field>
        <Field label="Simular por">
          <Select value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="meses">Numero de meses</option>
            <option value="fecha">Fecha de salida</option>
          </Select>
        </Field>
      </div>

      {modo === "meses" ? (
        <Field label={`Meses transcurridos: ${meses}`}>
          <input
            type="range" min={1} max={24} value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>1 mes</span><span>12 meses</span><span>24 meses</span>
          </div>
        </Field>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Fecha de inicio">
            <Input type="date" value={toDateInput(inicio)} onChange={(e) => setInicio(e.target.value)} />
          </Field>
          <Field label="Fecha de salida (venta)">
            <Input type="date" value={toDateInput(salida)} onChange={(e) => setSalida(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Dias</div>
          <div className="text-lg font-semibold text-slate-800 tabular-nums">{resultado.dias}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Rendimiento</div>
          <div className="text-lg font-semibold text-amber-600 tabular-nums">{pct(resultado.rendimientoPct)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[11px] text-emerald-600">Total a recibir</div>
          <div className="text-lg font-semibold text-emerald-700 tabular-nums">{money(resultado.totalARecibir)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Ganancia</div>
          <div className="text-lg font-semibold text-slate-800 tabular-nums">{money(resultado.ganancia)}</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1.5">Tabla de referencia (con el capital y tasa actuales)</div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Plazo</th>
                <th className="text-right px-3 py-2 font-medium">Dias</th>
                <th className="text-right px-3 py-2 font-medium">Rendimiento</th>
                <th className="text-right px-3 py-2 font-medium">Total a recibir</th>
              </tr>
            </thead>
            <tbody>
              {REFERENCIAS.map((r) => {
                const tasaN = Number(tasa) || TASA_DEFAULT;
                const rp = r.dias * (tasaN / 365);
                const total = (Number(capital) || 0) * (1 + rp / 100);
                return (
                  <tr key={r.meses} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{r.meses} meses</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.dias}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-600">{pct(rp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{money(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          El calculo oficial siempre es por dias (tasa/365). Las pequenas diferencias contra los porcentajes redondeados del contrato son por el prorrateo diario real.
        </p>
      </div>
    </div>
  );
}

// ===================================================================
// FORMULARIOS POR PESTANA
// ===================================================================
function InversionistaForm({ value, onChange }) {
  const [verClave, setVerClave] = useState(false);
  const set = (k, v) => onChange({ ...value, [k]: v });
  // Reutiliza el generador global (formato XXXXX-XXXXX-XXXXX, igual que el asistente y el backend).
  const generarClave = () => set("claveAcceso", generarClaveAcceso());
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre completo">
          <Input value={value.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Hugo Meave" />
        </Field>
        <Field label="Telefono">
          <Input value={value.telefono || ""} onChange={(e) => set("telefono", e.target.value)} placeholder="(opcional)" />
        </Field>
      </div>
      <Field label="Correo electronico">
        <Input type="email" value={value.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="(opcional)" />
      </Field>
      <Field label="Clave de acceso del Codesarrollador" hint="Con esta clave el Codesarrollador entra a ver SU cartera. Solo tu (admin) la ves aqui.">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              type={verClave ? "text" : "password"}
              value={value.claveAcceso || ""}
              onChange={(e) => set("claveAcceso", e.target.value)}
              className={inputCls + " pr-10"}
              placeholder="Genera o escribe una clave"
            />
            <button type="button" onClick={() => setVerClave(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <Btn type="button" variant="outline" className="w-full sm:w-auto" onClick={generarClave}><KeyRound size={15} /> Generar</Btn>
        </div>
      </Field>
      <Field label="Notas internas">
        <Textarea rows={2} value={value.notas || ""} onChange={(e) => set("notas", e.target.value)} placeholder="(opcional, solo visible para el equipo)" />
      </Field>
    </div>
  );
}

// Plantilla de ejemplo para el boton "rellenar" del formulario de proyecto.
// Datos bancarios FICTICIOS a proposito: el repo es publico, los reales se
// capturan a mano en el admin (viven solo en el Sheet privado).
const EJEMPLO_PROYECTO = {
  nombre: "Casa Alysa",
  tipo: "Obra",
  etapaActual: "Construccion",
  banco: "BBVA",
  beneficiario: "YODESARROLLO SAPI DE CV",
  cuenta: "000000000",
  clabe: "000000000000000000",
  conceptoBase: "Aportacion Casa Alysa - <Codesarrollador> - <Folio>",
  descripcion: "Coinversion inmobiliaria.",
  estado: "Abierto",
};

function ProyectoForm({ value, onChange, precios }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const clavesP = Object.keys(precios || {});
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre del proyecto">
          <Input value={value.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Casa Alysa" />
        </Field>
        <Field label="Estado">
          <Select value={value.estado || "Abierto"} onChange={(e) => set("estado", e.target.value)}>
            <option>Abierto</option>
            <option>Cerrado</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tipo de proyecto">
          <Select value={value.tipo || "Obra"} onChange={(e) => set("tipo", e.target.value)}>
            {TIPOS_PROYECTO.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Etapa actual" hint="Permisos, urbanizacion, construccion...">
          <Input list="dl-etapas-proy" value={value.etapaActual || ""} onChange={(e) => set("etapaActual", e.target.value)} placeholder="Etapa actual" />
          <datalist id="dl-etapas-proy">{ETAPAS_SUGERIDAS.map((et) => <option key={et} value={et} />)}</datalist>
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700 flex items-center gap-2"><Banknote size={16} /> Cuenta de deposito</div>
          <Btn type="button" variant="ghost" className="text-xs" onClick={() => onChange({ ...value, ...EJEMPLO_PROYECTO, nombre: value.nombre || EJEMPLO_PROYECTO.nombre })}>
            <Sparkles size={13} /> Precargar ejemplo Casa Alysa
          </Btn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Banco">
            <Input value={value.banco || ""} onChange={(e) => set("banco", e.target.value)} placeholder="BBVA" />
          </Field>
          <Field label="Beneficiario">
            <Input value={value.beneficiario || ""} onChange={(e) => set("beneficiario", e.target.value)} placeholder="YODESARROLLO SAPI DE CV" />
          </Field>
          <Field label="Numero de cuenta">
            <Input value={value.cuenta || ""} onChange={(e) => set("cuenta", e.target.value)} placeholder="Numero de cuenta" />
          </Field>
          <Field label="CLABE">
            <Input value={value.clabe || ""} onChange={(e) => set("clabe", e.target.value)} placeholder="CLABE de 18 digitos" />
          </Field>
        </div>
        <Field label="Concepto base sugerido" hint="Lo que el Codesarrollador pone al transferir.">
          <Input value={value.conceptoBase || ""} onChange={(e) => set("conceptoBase", e.target.value)} placeholder="Aportacion <Proyecto> - <Codesarrollador> - <Folio>" />
        </Field>
      </div>

      <Field label="Descripcion">
        <Textarea rows={2} value={value.descripcion || ""} onChange={(e) => set("descripcion", e.target.value)} />
      </Field>

      {/* Plusvalia por etapa: marca el proyecto como terreno y fija la etapa de
          precio ACTUAL (aplica a TODOS sus codesarrolladores). */}
      <div className="rounded-xl border border-slate-200 p-3 space-y-3">
        <div>
          <div className="text-sm font-medium text-slate-700">Plusvalia por etapa (terreno)</div>
          <div className="text-xs text-slate-400">Opcional. Si este proyecto sube de valor por etapa (Real Miramar, Dunas), elige su hoja de precios y la etapa ACTUAL. Aplica a TODOS sus codesarrolladores. Vacio = proyecto normal (tasa/tramos).</div>
        </div>
        {clavesP.length === 0 ? (
          <p className="text-xs text-amber-600">No se pudieron leer precios de tu hoja (revisa que la cuenta del portal tenga acceso y que existan columnas pv_*).</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Hoja de precios">
              <Select value={value.plusvaliaKey || ""} onChange={(e) => set("plusvaliaKey", e.target.value)}>
                <option value="">— Ninguno (proyecto normal) —</option>
                {clavesP.map((k) => <option key={k} value={k}>{precios[k].nombre || k}</option>)}
              </Select>
            </Field>
            {value.plusvaliaKey ? (
              <Field label="Etapa de precio ACTUAL" hint="Muevela aqui cuando avance el proyecto; cambia para todos.">
                <Select value={value.etapaPrecio || ""} onChange={(e) => set("etapaPrecio", e.target.value)}>
                  <option value="">— Elige —</option>
                  {ETAPAS_PLUSVALIA.filter((e) => ((precios[value.plusvaliaKey] || {}).etapas || {})[e.key]).map((e) => <option key={e.key} value={e.key}>{e.label} · {money(precios[value.plusvaliaKey].etapas[e.key])}/m²</option>)}
                </Select>
              </Field>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function InversionForm({ value, onChange, inversionistas, proyectos, precios, esNuevo = true }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  // Plusvalia: si el PROYECTO elegido la tiene activada, mostramos el campo de
  // precio de entrada (a mano). La etapa actual la trae el proyecto.
  const proyectoSel = arr(proyectos).find((p) => String(p.id) === String(value.proyectoId));
  const esPlusvalia = !!(proyectoSel && proyectoSel.plusvaliaKey && String(proyectoSel.plusvaliaKey).trim());
  const tablaSel = esPlusvalia && precios && precios[proyectoSel.plusvaliaKey] ? (precios[proyectoSel.plusvaliaKey].etapas || {}) : {};
  const etapaActSel = esPlusvalia ? String(proyectoSel.etapaPrecio || "").trim() : "";
  const etapaActLabel = etapaActSel ? etiquetaEtapaPlusvalia(etapaActSel) : "";
  const precioActSel = etapaActSel ? (Number(tablaSel[etapaActSel]) || 0) : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Folio" hint={esNuevo ? "Llave unica legible, ej. CA-HM-2026-01." : "El folio es la llave; no se puede cambiar al editar."}>
          <Input
            value={value.folio || ""}
            onChange={(e) => set("folio", e.target.value)}
            placeholder="CA-HM-2026-01"
            readOnly={!esNuevo}
            className={!esNuevo ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}
          />
        </Field>
        <Field label="Estado">
          <Select value={value.estado || "Activa"} onChange={(e) => set("estado", e.target.value)}>
            <option>Activa</option>
            <option>Liquidada</option>
            <option>Cancelada</option>
          </Select>
        </Field>
        <Field label="Codesarrollador">
          <Select value={value.inversionistaId || ""} onChange={(e) => set("inversionistaId", e.target.value)}>
            <option value="">— Selecciona —</option>
            {arr(inversionistas).map((i) => <option key={i.id} value={i.id}>{i.nombre || i.id}</option>)}
          </Select>
        </Field>
        <Field label="Proyecto">
          <Select value={value.proyectoId || ""} onChange={(e) => set("proyectoId", e.target.value)}>
            <option value="">— Selecciona —</option>
            {arr(proyectos).map((p) => <option key={p.id} value={p.id}>{p.nombre || p.id}</option>)}
          </Select>
        </Field>
        <Field label="Monto total comprometido">
          <Input type="number" min="0" value={value.montoTotal || ""} onChange={(e) => set("montoTotal", e.target.value)} placeholder="1000000" />
        </Field>
        {/* En proyectos de plusvalia la tasa SI cuenta: el codesarrollador gana las dos
            cosas juntas (plusvalia de etapa + rendimiento anual). Deja la tasa en 0 si
            esta inversion solo va por plusvalia. Los TRAMOS, en cambio, no aplican aqui. */}
        <Field label="Tasa anual (%)" hint={esPlusvalia ? "Se SUMA a la plusvalia de etapa. Pon 0 si esta inversion solo gana plusvalia." : undefined}>
          <Input type="number" min="0" value={value.tasaAnual ?? TASA_DEFAULT} onChange={(e) => set("tasaAnual", e.target.value)} step="0.1" />
        </Field>
        <Field label="Fecha de inicio" hint="Arranca el conteo de dias del rendimiento.">
          <Input type="date" value={toDateInput(value.fechaInicio)} onChange={(e) => set("fechaInicio", e.target.value)} />
        </Field>
        <Field label="Fecha de salida" hint="Solo al liquidar (fecha real de venta).">
          <Input type="date" value={toDateInput(value.fechaSalida)} onChange={(e) => set("fechaSalida", e.target.value)} />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea rows={2} value={value.notas || ""} onChange={(e) => set("notas", e.target.value)} />
      </Field>
      {!esPlusvalia ? <TramosEditor value={value.tramos || ""} onChange={(v) => set("tramos", v)} /> : null}

      {/* Los TRAMOS si quedan ignorados en un proyecto de plusvalia: el retorno por mes
          de venta y la plusvalia por etapa son dos formas distintas de contar lo mismo. */}
      {esPlusvalia && String(value.tramos || "").trim() ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-900">
            <b>Esta inversion trae tramos capturados y el proyecto es de plusvalia.</b> Los tramos
            se <b>ignoran</b>: aqui el valor sale de la plusvalia de etapa mas la tasa anual.
            Borra los tramos para que la fila diga lo mismo que el contrato.
          </div>
        </div>
      ) : null}

      {/* Resumen de lo que va a ver el codesarrollador con lo capturado. */}
      {esPlusvalia ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Este codesarrollador gana <b>plusvalia de etapa</b>
          {num(value.tasaAnual) > 0 ? <> <b>mas</b> el <b>{value.tasaAnual}% anual</b> sobre su capital. Las dos cosas se suman.</> : <> unicamente (tasa anual en 0).</>}
        </div>
      ) : null}

      {/* Plusvalia: si el PROYECTO elegido es de plusvalia, solo se captura el
          precio de ENTRADA a mano (la etapa actual vive en el proyecto). */}
      {esPlusvalia ? (
        <div className="rounded-xl border border-slate-200 p-3 space-y-3">
          <div>
            <div className="text-sm font-medium text-slate-700">Plusvalia · {proyectoSel.nombre}</div>
            <div className="text-xs text-slate-400">Este proyecto sube por etapa. Etapa ACTUAL: <b>{etapaActLabel || "(sin definir)"}</b>{precioActSel ? ` · ${money(precioActSel)}/m²` : ""} (se cambia en el proyecto, aplica a todos). Aqui solo pon el precio al que ENTRO este codesarrollador.</div>
          </div>
          <Field label="Precio de entrada ($/m²)" hint="Lo que pago por m² al entrar (ej. su etapa Fundador, aunque no este en la hoja). Si lo dejas vacio, su valor queda 'en configuracion'.">
            <Input type="number" value={value.precioEntrada || ""} onChange={(e) => set("precioEntrada", e.target.value)} placeholder="Ej. 3900" />
          </Field>
          {(value.estado || "Activa") === "Liquidada" ? (
            <Field label="Precio de salida ($/m²)" hint="Precio al que se liquido/vendio. Congela el valor para que no siga cambiando si el proyecto avanza de etapa.">
              <Input type="number" value={value.precioSalida || ""} onChange={(e) => set("precioSalida", e.target.value)} placeholder="Ej. 6067" />
            </Field>
          ) : null}
          {Object.keys(tablaSel).length ? (
            <div className="text-[11px] text-slate-400">Referencia de precios de la hoja: {ETAPAS_PLUSVALIA.filter((e) => tablaSel[e.key]).map((e) => `${e.label} ${money(tablaSel[e.key])}`).join(" · ")} /m²</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Editor de tramos (brackets): retorno FIJO por mes de venta. Guarda un JSON
// [{desde,hasta,pct}] en value.tramos. Si queda vacio, la inversion usa su tasa anual.
function TramosEditor({ value, onChange }) {
  let tramos = [];
  try { const t = JSON.parse(value || "[]"); if (Array.isArray(t)) tramos = t; } catch (e) { tramos = []; }
  const guardar = (arrT) => onChange(arrT.length ? JSON.stringify(arrT) : "");
  const setRow = (i, k, v) => guardar(tramos.map((t, idx) => idx === i ? { ...t, [k]: v } : t));
  const agregar = () => {
    const ultimo = tramos[tramos.length - 1];
    const desde = ultimo ? (Number(ultimo.hasta) || 0) + 1 : 1;
    guardar([...tramos, { desde, hasta: desde + 1, pct: "" }]);
  };
  const quitar = (i) => guardar(tramos.filter((_, idx) => idx !== i));
  // Avisos suaves: huecos, traslapes, orden o filas incompletas (no bloquean, solo advierten).
  const avisos = [];
  const completos = tramos.filter((t) => String(t.desde).trim() !== "" && String(t.hasta).trim() !== "" && String(t.pct).trim() !== "");
  if (tramos.length && completos.length < tramos.length) avisos.push("Hay tramos sin completar (desde/hasta/%); esos no cuentan.");
  const ord = completos.map((t) => ({ d: Number(t.desde), h: Number(t.hasta) })).sort((a, b) => a.d - b.d);
  for (let i = 0; i < ord.length; i++) {
    if (ord[i].h < ord[i].d) avisos.push(`Un tramo tiene 'hasta' (${ord[i].h}) menor que 'desde' (${ord[i].d}).`);
    if (i === 0 && ord[0].d > 1) avisos.push(`Empieza en el mes ${ord[0].d}: el mes 1 a ${ord[0].d - 1} no rinde.`);
    if (i > 0) {
      if (ord[i].d > ord[i - 1].h + 1) avisos.push(`Hueco entre el mes ${ord[i - 1].h} y el ${ord[i].d}.`);
      if (ord[i].d <= ord[i - 1].h) avisos.push(`Traslape en el mes ${ord[i].d} (gana el tramo de arriba).`);
    }
  }
  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-700">Rendimiento por tramos (brackets)</div>
          <div className="text-xs text-slate-400">Opcional. Retorno FIJO segun el mes de venta. Si lo dejas vacio, se usa la tasa anual de arriba.</div>
        </div>
        <Btn type="button" variant="outline" className="shrink-0" onClick={agregar}><Plus size={15} /> Tramo</Btn>
      </div>
      {tramos.length === 0 ? (
        <p className="text-xs text-slate-400">Sin tramos. (Esta inversion usa la tasa anual.)</p>
      ) : (
        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-[11px] text-slate-400 px-1">
            <span>Desde (mes)</span><span>Hasta (mes)</span><span>% retorno</span><span></span>
          </div>
          {tramos.map((t, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <Input type="number" min={1} value={t.desde ?? ""} onChange={(e) => setRow(i, "desde", e.target.value)} placeholder="Desde" />
              <Input type="number" min={1} value={t.hasta ?? ""} onChange={(e) => setRow(i, "hasta", e.target.value)} placeholder="Hasta" />
              <Input type="number" min="0" step="0.01" value={t.pct ?? ""} onChange={(e) => setRow(i, "pct", e.target.value)} placeholder="%" />
              <IconBtn onClick={() => quitar(i)} icon={Trash2} title="Quitar" danger />
            </div>
          ))}
          <div className="text-[11px] text-slate-400">Ej.: mes 1 a 6 = 12.5% · mes 7 a 8 = 16.67%. Es % fijo del capital (no anual). Usa rangos seguidos (sin huecos).</div>
        </div>
      )}
      {avisos.length > 0 ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800">
          <div className="font-medium flex items-center gap-1"><AlertTriangle size={12} /> Revisa la tabla:</div>
          <ul className="list-disc ml-4 mt-0.5">{avisos.slice(0, 5).map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

function DocumentoForm({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select value={value.tipo || "Contrato"} onChange={(e) => set("tipo", e.target.value)}>
            <option>Contrato</option>
            <option>Pagare</option>
            <option>Comprobante</option>
            <option>Identificacion</option>
            <option>Otro</option>
          </Select>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={toDateInput(value.fecha) || todayISO()} onChange={(e) => set("fecha", e.target.value)} />
        </Field>
      </div>
      <Field label="Nombre del documento">
        <Input value={value.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Contrato Casa Alysa firmado" />
      </Field>
      <Field label="Enlace (Drive u otro)" hint="Pega el link para compartir del archivo.">
        <Input value={value.url || ""} onChange={(e) => set("url", e.target.value)} placeholder="https://drive.google.com/..." />
      </Field>
    </div>
  );
}

function AvanceForm({ value, onChange, auth }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const esDoc = value.tipo === "documento";
  const esVideo = value.tipo === "video";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Tipo">
          <Select value={value.tipo || "foto"} onChange={(e) => set("tipo", e.target.value)}>
            <option value="foto">Foto</option>
            <option value="video">Video</option>
            <option value="documento">Documento</option>
          </Select>
        </Field>
        <Field label="Etapa" hint="Permisos, urbanizacion...">
          <Input list="dl-etapas" value={value.etapa || ""} onChange={(e) => set("etapa", e.target.value)} placeholder="Etapa del proyecto" />
          <datalist id="dl-etapas">{ETAPAS_SUGERIDAS.map((et) => <option key={et} value={et} />)}</datalist>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={toDateInput(value.fecha) || todayISO()} onChange={(e) => set("fecha", e.target.value)} />
        </Field>
      </div>
      <Field label="Titulo" hint="Ej. Colado de losa / Permiso de uso de suelo">
        <Input value={value.titulo || ""} onChange={(e) => set("titulo", e.target.value)} placeholder="Que se ve / que documento es" />
      </Field>
      <Field label={esVideo ? "Enlace del video" : esDoc ? "Documento" : "Foto"} hint={esVideo ? "Pega el enlace de YouTube." : "Sube el archivo (arrastra o busca) o pega un enlace."}>
        {!esVideo ? <FileUpload auth={auth} onSubido={(url) => set("url", url)} accept={esDoc ? "image/*,application/pdf" : "image/*"} nota={esDoc ? "Foto o PDF, se guarda en tu Drive." : "Foto, se guarda en tu Drive."} /> : null}
        <Input value={value.url || ""} onChange={(e) => set("url", e.target.value)} placeholder="https://... (se llena solo al subir)" className="mt-2" />
      </Field>
      <Field label="Descripcion (opcional)">
        <Textarea rows={2} value={value.descripcion || ""} onChange={(e) => set("descripcion", e.target.value)} />
      </Field>
    </div>
  );
}

function BitacoraForm({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Fecha">
          <Input type="date" value={toDateInput(value.fecha) || todayISO()} onChange={(e) => set("fecha", e.target.value)} />
        </Field>
        <Field label="Autor">
          <Input value={value.autor || ""} onChange={(e) => set("autor", e.target.value)} placeholder="Ej. Sayri" />
        </Field>
        <Field label="Etiqueta">
          <Select value={value.etiqueta || "Avance"} onChange={(e) => set("etiqueta", e.target.value)}>
            <option>Avance</option>
            <option>Respuesta</option>
            <option>Alerta</option>
          </Select>
        </Field>
      </div>
      <Field label="Titulo (opcional)">
        <Input value={value.titulo || ""} onChange={(e) => set("titulo", e.target.value)} placeholder="Resumen corto" />
      </Field>
      <Field label="Nota">
        <Textarea rows={3} value={value.nota || ""} onChange={(e) => set("nota", e.target.value)} />
      </Field>
      {/* Antes no existia esta separacion: una sola columna, publicacion automatica
          y sin aprobacion. Lo que el asesor escribiera se le pintaba tal cual al
          codesarrollador. Ahora toda nota nace INTERNA y publicarla es un acto
          deliberado del admin. */}
      <Field label="¿Quien puede ver esta nota?">
        <Select value={String(value.visibilidad || "interna").toLowerCase() === "cliente" ? "cliente" : "interna"} onChange={(e) => set("visibilidad", e.target.value)}>
          <option value="interna">Solo el equipo (interna)</option>
          <option value="cliente">Tambien el codesarrollador (se publica en su portal)</option>
        </Select>
      </Field>
      {String(value.visibilidad || "").toLowerCase() === "cliente" ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <b>Esto lo va a leer el codesarrollador.</b> La bitacora es por proyecto: la veran
              <b> todos</b> los codesarrolladores de este proyecto, no solo uno. Asi se vera:
              <div className="mt-2 rounded-lg bg-white border border-amber-200 p-2.5">
                <div className="text-xs text-slate-400">{fmtFecha(value.fecha) || "hoy"}{value.etiqueta ? ` · ${value.etiqueta}` : ""}</div>
                {value.titulo ? <div className="text-sm font-semibold text-slate-800 mt-0.5">{value.titulo}</div> : null}
                <div className="text-sm text-slate-600 mt-0.5">{value.nota || <span className="text-slate-300">(sin texto)</span>}</div>
                {value.autor ? <div className="text-xs text-slate-400 mt-1">— {value.autor}</div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ----- Formulario de Asesor (admin: alta/edicion + asignacion de proyectos) -----
function AsesorForm({ value, onChange, proyectos }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  const seleccion = String(value.proyectoIds || "").split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
  const toggle = (id) => {
    const ya = seleccion.includes(id);
    const nueva = ya ? seleccion.filter(x => x !== id) : [...seleccion, id];
    set("proyectoIds", nueva.join(", "));
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre del asesor"><Input value={value.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Miriam Duarte" /></Field>
        <Field label="Correo (opcional)"><Input type="email" value={value.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="correo@ejemplo.com" /></Field>
      </div>
      <Field label="Clave de acceso del asesor" hint="Compartesela; con ella entra a su panel de avances.">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input value={value.claveAcceso || ""} onChange={(e) => set("claveAcceso", e.target.value)} placeholder="Genera o escribe una clave" />
          <Btn type="button" variant="outline" className="w-full sm:w-auto" onClick={() => set("claveAcceso", generarClaveAcceso())}><RefreshCw size={15} /> Generar</Btn>
        </div>
      </Field>
      <div>
        <div className="text-sm font-medium text-slate-700 mb-1.5">Proyectos que puede gestionar</div>
        {arr(proyectos).length === 0 ? (
          <p className="text-xs text-slate-400">No hay proyectos todavia.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {arr(proyectos).map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 px-1.5 py-1 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={seleccion.includes(String(p.id))} onChange={() => toggle(String(p.id))} />
                <span className="truncate">{p.nombre || p.id}</span>
              </label>
            ))}
          </div>
        )}
        <div className="text-xs text-slate-400 mt-1">El asesor solo vera y gestionara avances/bitacora de estos proyectos. Nunca datos financieros.</div>
      </div>
    </div>
  );
}

// ----- Formulario de Referido (admin: dar seguimiento al estado) -----
function ReferidoForm({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      {value.referidorNombre ? <div className="text-xs text-slate-500 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">Invitado por: <b className="text-slate-700">{value.referidorNombre}</b> · beneficio prometido: <b>+1%</b> sobre su aportacion al devolver capital (si participa).</div> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre del invitado"><Input value={value.nombreProspecto || ""} onChange={(e) => set("nombreProspecto", e.target.value)} /></Field>
        <Field label="Contacto"><Input value={value.contacto || ""} onChange={(e) => set("contacto", e.target.value)} placeholder="WhatsApp o correo" /></Field>
      </div>
      <Field label="Estado del seguimiento">
        <Select value={value.estado || "Pendiente"} onChange={(e) => set("estado", e.target.value)}>
          <option>Pendiente</option>
          <option>Contactado</option>
          <option>Participo</option>
          <option>Descartado</option>
        </Select>
      </Field>
      <Field label="Nota interna"><Textarea rows={2} value={value.nota || ""} onChange={(e) => set("nota", e.target.value)} /></Field>
    </div>
  );
}

function AportacionForm({ value, onChange, pass }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Field label="Pago #">
          <Input type="number" value={value.numeroPago || ""} onChange={(e) => set("numeroPago", e.target.value)} min={1} />
        </Field>
        <Field label="De (total)">
          <Input type="number" value={value.totalPagos || ""} onChange={(e) => set("totalPagos", e.target.value)} min={1} />
        </Field>
        <Field label="Monto">
          <Input type="number" min="0" value={value.monto || ""} onChange={(e) => set("monto", e.target.value)} />
        </Field>
        <Field label="Fecha comprometida" hint="Cuando toca pagar.">
          <Input type="date" value={toDateInput(value.fechaProgramada)} onChange={(e) => set("fechaProgramada", e.target.value)} />
        </Field>
      </div>
      <Field label="Concepto">
        <Input value={value.concepto || ""} onChange={(e) => set("concepto", e.target.value)} placeholder="Ej. Aportacion inicial" />
      </Field>
      <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-3">
        <div className="text-xs font-medium text-slate-500">Registro del pago (cuando lo recibas y lo verifiques)</div>
        {value.fechaReporte ? (
          <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5">
            El cliente reporto este pago el {fmtFecha(value.fechaReporte)}{value.referencia ? ` · folio: ${value.referencia}` : ""}.
            {value.montoReportado && Number(value.montoReportado) !== Number(value.monto)
              ? <> Reporto <b>{money(value.montoReportado)}</b> (programado {money(value.monto)}).</>
              : (value.montoReportado ? <> Reporto <b>{money(value.montoReportado)}</b>.</> : null)}
            {" "}Verifica contra tu cuenta, ajusta el monto si hace falta y pon la fecha recibida.
            {value.montoReportado && Number(value.montoReportado) !== Number(value.monto)
              ? <button type="button" onClick={() => set("monto", value.montoReportado)} className="ml-1 underline font-medium">Usar {money(value.montoReportado)}</button>
              : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Fecha recibida" hint="Ponla cuando confirmes el deposito (vacio = aun no llega).">
            <Input type="date" value={toDateInput(value.fechaRecibida)} onChange={(e) => set("fechaRecibida", e.target.value)} />
          </Field>
          <Field label="Folio / referencia del deposito">
            <Input value={value.referencia || ""} onChange={(e) => set("referencia", e.target.value)} placeholder="Clave de rastreo / referencia" />
          </Field>
        </div>
        <Field label="Comprobante / ticket" hint="Sube el archivo (arrastra o busca) o pega un enlace.">
          <FileUpload auth={{ pass }} privado onSubido={(fileId) => set("comprobanteUrl", fileId)} nota="Foto (JPG/PNG) o PDF, max ~10 MB. Se guarda PRIVADO (solo visible con permiso)." />
          <Input value={value.comprobanteUrl || ""} onChange={(e) => set("comprobanteUrl", e.target.value)} placeholder="Se llena solo al subir (o pega un enlace)" className="mt-2" />
        </Field>
      </div>
    </div>
  );
}

// ===================================================================
// VISTA ADMIN
// ===================================================================
// ===================================================================
// ASISTENTE: NUEVO CODESARROLLADOR (crea inversionista + inversion +
// aportaciones + clave, todo de un jalon)
// ===================================================================
function WizardAlta({ proyectos, onCrear, onClose }) {
  const [d, setD] = useState({ nombre: "", email: "", telefono: "", proyectoId: "", folio: "", montoTotal: "", fechaInicio: todayISO(), numPagos: 4, primerPago: "", tasaAnual: 25 });
  const [nuevoProy, setNuevoProy] = useState({ nombre: "", tipo: "Obra", etapaActual: "", banco: "", beneficiario: "YODESARROLLO SAPI DE CV", cuenta: "", clabe: "", conceptoBase: "" });
  const [usarNuevoProy, setUsarNuevoProy] = useState(arr(proyectos).length === 0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const setNP = (k, v) => setNuevoProy(p => ({ ...p, [k]: v }));
  const nPagos = Math.max(1, parseInt(d.numPagos, 10) || 1);

  const crear = async () => {
    setError("");
    if (!d.nombre.trim()) { setError("Pon al menos el nombre del Codesarrollador."); return; }
    if (!d.folio.trim()) { setError("Escribe el folio (ej. CA-HM-2026-01)."); return; }
    if (usarNuevoProy && !nuevoProy.nombre.trim()) { setError("Ponle nombre al proyecto nuevo."); return; }
    if (!usarNuevoProy && !d.proyectoId) { setError("Elige un proyecto (o crea uno nuevo)."); return; }
    if (num(d.montoTotal) <= 0) { setError("Pon el monto total de la inversion."); return; }
    setCargando(true);
    try {
      const r = await onCrear({ ...d, numPagos: nPagos, nuevoProyecto: usarNuevoProy ? nuevoProy : null, proyectoId: usarNuevoProy ? "" : d.proyectoId });
      setResultado(r);
    } catch (e) {
      setError(e?.message || "No se pudo crear. Revisa los datos e intenta de nuevo.");
    } finally { setCargando(false); }
  };

  return (
    <Modal open onClose={onClose} title="Nuevo Codesarrollador" width="max-w-2xl">
      {resultado ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 flex items-start gap-2">
            <BadgeCheck size={20} className="shrink-0 mt-0.5" />
            <span>¡Listo! Se creo <b>{d.nombre}</b> con su inversion (<b>{d.folio}</b>) y <b>{nPagos} aportaciones</b>.</span>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Clave de acceso del Codesarrollador (compartesela):</div>
            <div className="text-xl font-mono font-bold tracking-wide text-slate-800 select-all">{resultado.clave}</div>
            <div className="text-xs text-slate-500 mt-2">{d.email.trim() ? 'Tambien podra recuperarla solo, por correo, con "¿Olvidaste tu contraseña?".' : "Sin correo registrado: no podra recuperarla solo. Compartesela tu, o agrega su correo despues para que pueda recuperarla."}</div>
          </div>
          <div className="flex justify-end"><Btn onClick={onClose}>Cerrar</Btn></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Nombre"><Input value={d.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Hugo Meave" /></Field>
            <Field label="Correo (opcional)" hint="Para que pueda recuperar su contraseña solo. Si no tiene, dejalo vacio."><Input type="email" value={d.email} onChange={e => set("email", e.target.value)} placeholder="correo@ejemplo.com" /></Field>
            <Field label="Telefono (opcional)"><Input value={d.telefono} onChange={e => set("telefono", e.target.value)} /></Field>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">Proyecto</div>
              <label className="text-xs flex items-center gap-1.5 text-slate-500"><input type="checkbox" checked={usarNuevoProy} onChange={e => setUsarNuevoProy(e.target.checked)} /> Crear proyecto nuevo</label>
            </div>
            {usarNuevoProy ? (
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Nombre del proyecto"><Input value={nuevoProy.nombre} onChange={e => setNP("nombre", e.target.value)} placeholder="Casa Alysa" /></Field>
                <Field label="Banco"><Input value={nuevoProy.banco} onChange={e => setNP("banco", e.target.value)} placeholder="BBVA" /></Field>
                <Field label="Beneficiario"><Input value={nuevoProy.beneficiario} onChange={e => setNP("beneficiario", e.target.value)} /></Field>
                <Field label="Cuenta"><Input value={nuevoProy.cuenta} onChange={e => setNP("cuenta", e.target.value)} /></Field>
                <Field label="CLABE"><Input value={nuevoProy.clabe} onChange={e => setNP("clabe", e.target.value)} /></Field>
                <Field label="Concepto base"><Input value={nuevoProy.conceptoBase} onChange={e => setNP("conceptoBase", e.target.value)} placeholder="Aportacion <proyecto> - <Codesarrollador> - <Folio>" /></Field>
              </div>
            ) : (
              <Field label="Elige proyecto"><Select value={d.proyectoId} onChange={e => set("proyectoId", e.target.value)}><option value="">— Elige —</option>{arr(proyectos).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Folio" hint="Ej. CA-HM-2026-01"><Input value={d.folio} onChange={e => set("folio", e.target.value)} placeholder="CA-HM-2026-01" /></Field>
            <Field label="Monto total (MXN)"><Input type="number" min="0" value={d.montoTotal} onChange={e => set("montoTotal", e.target.value)} placeholder="1000000" /></Field>
            <Field label="Tasa anual (%)"><Input type="number" min="0" value={d.tasaAnual} onChange={e => set("tasaAnual", e.target.value)} /></Field>
            <Field label="Fecha de inicio"><Input type="date" value={d.fechaInicio} onChange={e => set("fechaInicio", e.target.value)} /></Field>
            <Field label="Numero de pagos"><Input type="number" value={d.numPagos} onChange={e => set("numPagos", e.target.value)} /></Field>
            <Field label="Primer pago (opcional)" hint="Si el 1er pago es distinto"><Input type="number" value={d.primerPago} onChange={e => set("primerPago", e.target.value)} placeholder="ej. 350000" /></Field>
          </div>

          <div className="text-xs text-slate-500">Se generaran <b>{nPagos} aportaciones</b> mensuales desde la fecha de inicio, y una <b>clave de acceso</b> para el Codesarrollador.</div>

          {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-sm text-slate-500 px-3">Cancelar</button>
            <Btn onClick={crear} disabled={cargando}>{cargando ? <Spinner /> : <Plus size={15} />} Crear Codesarrollador</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AdminApp({ pass, onLogout }) {
  const [data, setData] = useState(() => {
    try {
      const c = localStorage.getItem(CACHE_KEY);
      return c ? JSON.parse(c) : { Inversionistas: [], Proyectos: [], Inversiones: [], Aportaciones: [], Documentos: [], Avances: [], Bitacora: [], Asesores: [], Referidos: [] };
    } catch (e) {
      return { Inversionistas: [], Proyectos: [], Inversiones: [], Aportaciones: [], Documentos: [], Avances: [], Bitacora: [], Asesores: [], Referidos: [] };
    }
  });
  const [vista, setVista] = useState("dashboard"); // dashboard | inversionistas | proyectos | inversiones | calculadora
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [inversionAbierta, setInversionAbierta] = useState(null); // folio
  const [proyectoAbierto, setProyectoAbierto] = useState(null); // proyectoId
  const [modal, setModal] = useState(null); // { tab, row } para crear/editar
  const [confirm, setConfirm] = useState(null); // { tab, key, msg }
  const [wizard, setWizard] = useState(false); // asistente "Nuevo Codesarrollador"
  const toastTimer = useRef(null);

  const notificar = useCallback((msg, tipo = "info") => {
    setToast({ msg, tipo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Si una llamada admin falla por credenciales invalidas (ej. se cambio
  // ADMIN_PASS en ScriptProperties), cerramos la sesion para que el LoginGate
  // vuelva a pedir la contrasena en vez de dejar al usuario atorado.
  const manejarError = useCallback((err) => {
    const msg = err?.message || "Ocurrio un error.";
    if (esErrorCredenciales(msg)) {
      notificar("Tu sesion ya no es valida. Vuelve a iniciar sesion.", "error");
      setTimeout(() => onLogout(), 1200);
    }
    return msg;
  }, [notificar, onLogout]);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setError("");
    try {
      const res = await apiCall("getAll", { pass });
      const limpia = {
        Inversionistas: arr(res.data?.Inversionistas),
        Proyectos: arr(res.data?.Proyectos),
        Inversiones: arr(res.data?.Inversiones),
        Aportaciones: arr(res.data?.Aportaciones),
        Documentos: arr(res.data?.Documentos),
        Avances: arr(res.data?.Avances),
        Bitacora: arr(res.data?.Bitacora),
        Asesores: arr(res.data?.Asesores),
        Referidos: arr(res.data?.Referidos),
        preciosPlusvalia: res.data?.preciosPlusvalia || {},
      };
      setData(limpia);
      // No persistimos claveAcceso ni notas en el cache local (datos sensibles).
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(sanitizarParaCache(limpia))); } catch (e) { /* noop */ }
    } catch (err) {
      setError(manejarError(err));
    } finally {
      setCargando(false);
    }
  }, [pass, manejarError]);

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  // ----- helpers de resolucion -----
  const inversionistaPorId = useCallback((id) => arr(data.Inversionistas).find(i => String(i.id) === String(id)), [data]);
  const proyectoPorId = useCallback((id) => arr(data.Proyectos).find(p => String(p.id) === String(id)), [data]);
  const aportacionesDeFolio = useCallback((folio) =>
    arr(data.Aportaciones).filter(a => String(a.folio) === String(folio))
      .sort((a, b) => num(a.numeroPago) - num(b.numeroPago)), [data]);
  const documentosDeFolio = useCallback((folio) =>
    arr(data.Documentos).filter(d => String(d.folio) === String(folio)), [data]);
  const capitalRecibido = useCallback((folio) =>
    aportacionesDeFolio(folio).filter(a => estadoAportacion(a) === "Recibida").reduce((s, a) => s + num(a.monto), 0),
    [aportacionesDeFolio]);

  // ----- guardar (save) con UI optimista -----
  const guardarFila = useCallback(async (tab, row) => {
    setGuardando(true);
    setError("");
    try {
      const res = await apiCall("save", { pass, tab, row });
      const key = res.key;
      // refresca esa fila en memoria
      setData(prev => {
        const keyField = tab === "Inversiones" ? "folio" : "id";
        const filaFinal = { ...row, [keyField]: key };
        const lista = arr(prev[tab]);
        const idx = lista.findIndex(r => String(r[keyField]) === String(key));
        const nueva = idx >= 0
          ? lista.map((r, i) => i === idx ? { ...r, ...filaFinal } : r)
          : [...lista, filaFinal];
        const out = { ...prev, [tab]: nueva };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(sanitizarParaCache(out))); } catch (e) { /* noop */ }
        return out;
      });
      notificar(res.updated ? "Cambios guardados." : "Registro creado.", "ok");
      return key;
    } catch (err) {
      const msg = manejarError(err);
      setError(msg);
      notificar(msg, "error");
      throw err;
    } finally {
      setGuardando(false);
    }
  }, [pass, notificar, manejarError]);

  // ----- asistente: alta completa de un Codesarrollador -----
  const altaCodesarrollador = useCallback(async (d) => {
    // 0) Proteger el folio: si ya existe una inversion con ese folio, NO crear
    //    (un guardado lo sobre-escribiria). Mejor avisar y parar.
    const folioNuevo = String(d.folio || "").trim();
    if (folioNuevo && arr(data.Inversiones).some((i) => String(i.folio).trim() === folioNuevo)) {
      throw new Error(`Ya existe una inversion con el folio "${folioNuevo}". Usa un folio distinto.`);
    }
    // 1) Inversionista (con clave generada).
    const clave = generarClaveAcceso();
    const invId = await guardarFila("Inversionistas", { nombre: d.nombre.trim(), email: d.email.trim(), telefono: d.telefono || "", claveAcceso: clave, notas: "" });
    // 2) Proyecto (nuevo o existente).
    let proyectoId = d.proyectoId;
    if (!proyectoId && d.nuevoProyecto) {
      proyectoId = await guardarFila("Proyectos", { ...d.nuevoProyecto, estado: "Abierto" });
    }
    // 3) Inversion.
    await guardarFila("Inversiones", { folio: d.folio.trim(), inversionistaId: invId, proyectoId: proyectoId, montoTotal: num(d.montoTotal), fechaInicio: d.fechaInicio, fechaSalida: "", tasaAnual: num(d.tasaAnual) || 25, estado: "Activa", notas: "" });
    // 4) Aportaciones (reparto del monto + fechas mensuales).
    const n = Math.max(1, parseInt(d.numPagos, 10) || 1);
    const total = num(d.montoTotal);
    const primero = num(d.primerPago);
    const montos = [];
    if (primero > 0 && n > 1) {
      const cada = Math.round((total - primero) / (n - 1));
      for (let i = 0; i < n; i++) {
        if (i === 0) montos.push(primero);
        else if (i === n - 1) montos.push(total - primero - cada * (n - 2));
        else montos.push(cada);
      }
    } else {
      const cada = Math.round(total / n);
      for (let i = 0; i < n; i++) montos.push(i === n - 1 ? total - cada * (n - 1) : cada);
    }
    for (let i = 0; i < n; i++) {
      const concepto = i === 0 ? "Aportacion inicial" : (i === n - 1 ? "Aportacion final" : `Aportacion ${i + 1} de ${n}`);
      await guardarFila("Aportaciones", { folio: d.folio.trim(), numeroPago: i + 1, totalPagos: n, concepto, fechaProgramada: sumarMeses(d.fechaInicio, i), monto: montos[i], fechaRecibida: "", comprobanteUrl: "", referencia: "", fechaReporte: "" });
    }
    return { clave, folio: d.folio.trim() };
  }, [guardarFila, data]);

  // ----- eliminar (delete) -----
  const eliminarFila = useCallback(async (tab, key) => {
    setGuardando(true);
    try {
      await apiCall("delete", { pass, tab, key });
      setData(prev => {
        const keyField = tab === "Inversiones" ? "folio" : "id";
        const out = { ...prev, [tab]: arr(prev[tab]).filter(r => String(r[keyField]) !== String(key)) };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(sanitizarParaCache(out))); } catch (e) { /* noop */ }
        return out;
      });
      notificar("Eliminado.", "ok");
    } catch (err) {
      notificar(manejarError(err), "error");
    } finally {
      setGuardando(false);
      setConfirm(null);
    }
  }, [pass, notificar, manejarError]);

  // ----- Confirmar un pago reportado por el cliente -----
  //  Marca la aportacion como recibida por el monto REAL reportado. Si fue
  //  PARCIAL (entro menos que lo programado), crea automaticamente otra
  //  aportacion por el saldo restante, para que el plan siga cuadrando.
  const confirmarPagoReportado = useCallback(async (a, reportado) => {
    const programado = num(a.monto);
    const real = num(reportado);
    try {
      await guardarFila("Aportaciones", { ...a, monto: real, fechaRecibida: todayISO() });
      const resto = Math.round((programado - real) * 100) / 100;
      if (resto > 0.5) {
        await guardarFila("Aportaciones", {
          folio: a.folio,
          // El resto va justo despues del pago original y con numero propio
          // (no duplica el numeroPago de la aportacion original).
          numeroPago: num(a.numeroPago) + 0.5,
          totalPagos: a.totalPagos,
          concepto: `Resto de ${a.concepto || ("Aportacion " + a.numeroPago)}`,
          fechaProgramada: a.fechaProgramada || todayISO(),
          monto: resto,
          fechaRecibida: "", comprobanteUrl: "", referencia: "", fechaReporte: "", montoReportado: "",
        });
        notificar(`Recibido ${money(real)}. Se creo una aportacion por el resto: ${money(resto)}.`, "ok");
      } else if (real - programado > 0.5) {
        // Sobrepago: entro mas de lo programado. Avisar para que el admin ajuste.
        notificar(`Recibido ${money(real)} (${money(real - programado)} mas de lo programado). Revisa si aplicas el excedente a otra aportacion o ajustas el compromiso.`, "info");
      } else {
        notificar(`Pago confirmado: ${money(real)} recibido.`, "ok");
      }
    } catch (e) { /* el error ya se muestra */ }
  }, [guardarFila, notificar]);

  // ----- KPIs -----
  const kpis = useMemo(() => {
    const inversionesActivas = arr(data.Inversiones).filter(i => (i.estado || "Activa") === "Activa");
    const totalComprometido = inversionesActivas.reduce((s, i) => s + num(i.montoTotal), 0);
    const recibidas = arr(data.Aportaciones).filter(a => estadoAportacion(a) === "Recibida");
    const totalRecibido = recibidas.reduce((s, a) => s + num(a.monto), 0);
    const totalProgramado = arr(data.Aportaciones).reduce((s, a) => s + num(a.monto), 0);
    const vencidas = arr(data.Aportaciones).filter(a => estadoAportacion(a) === "Vencida");
    const proyectosAbiertos = arr(data.Proyectos).filter(p => (p.estado || "Abierto") === "Abierto");
    return {
      totalComprometido,
      totalRecibido,
      porRecibir: Math.max(0, totalProgramado - totalRecibido),
      numInversionistas: arr(data.Inversionistas).length,
      numProyectos: proyectosAbiertos.length,
      vencidas,
      recibidasCount: recibidas.length,
      pendientesCount: arr(data.Aportaciones).filter(a => estadoAportacion(a) === "Pendiente").length,
    };
  }, [data]);

  // proximas aportaciones por vencer (pendientes ordenadas por fecha)
  const proximas = useMemo(() => {
    return arr(data.Aportaciones)
      .filter(a => estadoAportacion(a) === "Pendiente")
      .sort((a, b) => (parseDate(a.fechaProgramada)?.getTime() || Infinity) - (parseDate(b.fechaProgramada)?.getTime() || Infinity))
      .slice(0, 6);
  }, [data]);

  const NAV = [
    { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
    { id: "inversionistas", label: "Codesarrolladores", icon: Users },
    { id: "proyectos", label: "Proyectos", icon: Building2 },
    { id: "inversiones", label: "Inversiones", icon: Wallet },
    { id: "pagos", label: "Pagos", icon: CircleDollarSign },
    { id: "asesores", label: "Asesores", icon: HardHat },
    { id: "referidos", label: "Referidos", icon: Sparkles },
    { id: "calculadora", label: "Calculadora", icon: Calculator },
  ];

  // Abrir modal de creacion con valores por defecto
  const nuevoRegistro = (tab, base = {}) => {
    const bases = {
      Inversionistas: { nombre: "", telefono: "", email: "", claveAcceso: "", notas: "" },
      Proyectos: { nombre: "", tipo: "Obra", etapaActual: "", banco: "", beneficiario: "", cuenta: "", clabe: "", conceptoBase: "", descripcion: "", estado: "Abierto", plusvaliaKey: "", etapaPrecio: "" },
      Inversiones: { folio: "", inversionistaId: "", proyectoId: "", montoTotal: "", fechaInicio: todayISO(), fechaSalida: "", tasaAnual: TASA_DEFAULT, estado: "Activa", notas: "", tramos: "", precioEntrada: "", precioSalida: "" },
      Aportaciones: { folio: "", numeroPago: "", totalPagos: "", concepto: "", fechaProgramada: "", monto: "", fechaRecibida: "", comprobanteUrl: "", referencia: "", fechaReporte: "", montoReportado: "" },
      Documentos: { folio: "", tipo: "Contrato", nombre: "", url: "", fecha: todayISO() },
      Avances: { proyectoId: "", tipo: "foto", etapa: "", url: "", titulo: "", descripcion: "", fecha: todayISO() },
      Bitacora: { proyectoId: "", fecha: todayISO(), autor: "", etiqueta: "Avance", titulo: "", nota: "", visibilidad: "interna" },
      Asesores: { nombre: "", email: "", claveAcceso: generarClaveAcceso(), proyectoIds: "" },
      Referidos: { referidorNombre: "", nombreProspecto: "", contacto: "", nota: "", estado: "Pendiente" },
    };
    setModal({ tab, row: { ...bases[tab], ...base }, esNuevo: true });
  };

  return (
    <div className="min-h-screen bg-[#f5f1ea]">
      <Toast toast={toast} />

      {/* Header */}
      <header className="text-white sticky top-0 z-30" style={{ background: "#1a1409" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logoWhite} alt="YODESARROLLO.MX" className="h-6 w-auto shrink-0" style={{ mixBlendMode: "screen" }} />
          <div className="min-w-0 hidden sm:block">
            <div className="text-[11px] leading-tight tracking-[0.18em] uppercase" style={{ color: "#c9a96e" }}>Panel de administracion</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setWizard(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: "#c9a96e", color: "#1a1409" }}
            >
              <Plus size={14} /> <span className="hidden sm:inline">Nuevo Codesarrollador</span><span className="sm:hidden">Nuevo</span>
            </button>
            <button
              onClick={() => cargar()}
              disabled={cargando}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700"
            >
              <LogOut size={14} /> <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
        {/* Nav */}
        <div className="border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-2 flex gap-1 overflow-x-auto">
            {NAV.map((n) => {
              const Icon = n.icon;
              const activo = vista === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => { setVista(n.id); setInversionAbierta(null); setProyectoAbierto(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition ${
                    activo ? "border-[#c9a96e] text-white" : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <Icon size={16} /> {n.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {!BACKEND_LISTO && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>Falta conectar el backend. Pega la URL del Apps Script en <b>APPS_SCRIPT_URL</b> (dentro de App.jsx) y vuelve a publicar para guardar datos reales.</span>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {/* ---------- DASHBOARD ---------- */}
        {vista === "dashboard" && (
          <div className="space-y-6">
            {/* Pagos reportados por el cliente, pendientes de validar */}
            {(() => {
              const porValidar = arr(data.Aportaciones).filter((a) => estadoAportacion(a) === "En aprobacion")
                .sort((a, b) => String(b.fechaReporte || "").localeCompare(String(a.fechaReporte || "")));
              if (porValidar.length === 0) return null;
              return (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="font-semibold text-blue-800 flex items-center gap-2 mb-3"><Clock size={18} /> Pagos por validar <span className="text-sm font-normal text-blue-600">({porValidar.length})</span></h3>
                  <div className="space-y-2">
                    {porValidar.map((a) => {
                      const invn = arr(data.Inversiones).find((i) => String(i.folio) === String(a.folio));
                      const nombre = invn ? (inversionistaPorId(invn.inversionistaId)?.nombre || "—") : "—";
                      const reportado = a.montoReportado && Number(a.montoReportado) > 0 ? num(a.montoReportado) : num(a.monto);
                      const difiere = a.montoReportado && Number(a.montoReportado) !== Number(a.monto);
                      return (
                        <div key={a.id} className="bg-white rounded-xl border border-blue-100 p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-800">{nombre} · <span className="font-mono text-xs text-slate-500">{a.folio}</span></div>
                            <div className="text-xs text-slate-500">{a.concepto || `Aportacion ${a.numeroPago}`} · reportado {fmtFecha(a.fechaReporte)}{a.referencia ? ` · ref ${a.referencia}` : ""}</div>
                            <div className="text-sm mt-0.5">Reporto <b className="tabular-nums">{money(reportado)}</b>{difiere ? <span className="text-amber-700"> (programado {money(a.monto)})</span> : null}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <VerComprobante comprobante={a.comprobanteUrl} id={a.id} auth={{ pass }} />
                            <Btn variant="outline" onClick={() => setModal({ tab: "Aportaciones", row: { ...a }, esNuevo: false })}><Pencil size={14} /> Revisar</Btn>
                            <Btn variant="success" onClick={() => confirmarPagoReportado(a, reportado)}><Check size={15} /> Confirmar recibido</Btn>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-[11px] text-blue-700/70 mt-2">"Confirmar recibido" marca el pago por el monto reportado. Si fue parcial (entro menos), se crea sola una aportacion por el resto.</div>
                </div>
              );
            })()}

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard icon={TrendingUp} label="Capital comprometido (activo)" value={money(kpis.totalComprometido)} tone="slate" />
              <KpiCard icon={CheckCircle2} label="Capital recibido" value={money(kpis.totalRecibido)} sub={`${kpis.recibidasCount} aportaciones`} tone="green" />
              <KpiCard icon={Clock} label="Por recibir" value={money(kpis.porRecibir)} sub={`${kpis.pendientesCount} pendientes`} tone="gold" />
              <KpiCard icon={Users} label="Codesarrolladores" value={kpis.numInversionistas} tone="blue" />
              <KpiCard icon={Building2} label="Proyectos abiertos" value={kpis.numProyectos} tone="slate" />
              <KpiCard icon={AlertTriangle} label="Aportaciones vencidas" value={kpis.vencidas.length} tone="red" alert={kpis.vencidas.length > 0} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Proximas a vencer */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><CalendarClock size={18} /> Proximas aportaciones</h3>
                {proximas.length === 0 ? (
                  <p className="text-sm text-slate-400">No hay aportaciones pendientes.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {proximas.map((a) => {
                      const inv = arr(data.Inversiones).find(i => String(i.folio) === String(a.folio));
                      const nom = inv ? (inversionistaPorId(inv.inversionistaId)?.nombre || a.folio) : a.folio;
                      return (
                        <li key={a.id} className="py-2.5 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-700 truncate">{nom}</div>
                            <div className="text-xs text-slate-400">{a.concepto || `Pago ${a.numeroPago}`} · {fmtFecha(a.fechaProgramada)}</div>
                          </div>
                          <div className="text-sm font-semibold text-slate-700 tabular-nums">{money(a.monto)}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Vencidas */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><AlertTriangle size={18} className="text-red-500" /> Aportaciones vencidas</h3>
                {kpis.vencidas.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin aportaciones vencidas. Todo al dia.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {kpis.vencidas.map((a) => {
                      const inv = arr(data.Inversiones).find(i => String(i.folio) === String(a.folio));
                      const nom = inv ? (inversionistaPorId(inv.inversionistaId)?.nombre || a.folio) : a.folio;
                      return (
                        <li key={a.id} className="py-2.5 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-700 truncate">{nom}</div>
                            <div className="text-xs text-red-500">{a.concepto || `Pago ${a.numeroPago}`} · vencio {fmtFecha(a.fechaProgramada)}</div>
                          </div>
                          <div className="text-sm font-semibold text-red-600 tabular-nums">{money(a.monto)}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------- INVERSIONISTAS ---------- */}
        {vista === "inversionistas" && (
          <ListaInversionistas
            data={data}
            onNuevo={() => nuevoRegistro("Inversionistas")}
            onEditar={(row) => setModal({ tab: "Inversionistas", row: { ...row }, esNuevo: false })}
            onEliminar={(row) => setConfirm({ tab: "Inversionistas", key: row.id, msg: `Se eliminara a "${row.nombre}". Sus inversiones quedaran sin titular.` })}
          />
        )}

        {/* ---------- PROYECTOS ---------- */}
        {vista === "proyectos" && !proyectoAbierto && (
          <ListaProyectos
            data={data}
            onNuevo={() => nuevoRegistro("Proyectos")}
            onAbrir={(id) => setProyectoAbierto(id)}
            onEditar={(row) => setModal({ tab: "Proyectos", row: { ...row }, esNuevo: false })}
            onEliminar={(row) => setConfirm({ tab: "Proyectos", key: row.id, msg: `Se eliminara el proyecto "${row.nombre}".` })}
          />
        )}
        {vista === "proyectos" && proyectoAbierto && (
          <ProyectoDetalle
            proyectoId={proyectoAbierto}
            data={data}
            inversionistaPorId={inversionistaPorId}
            onVolver={() => setProyectoAbierto(null)}
            onEditarProyecto={(row) => setModal({ tab: "Proyectos", row: { ...row }, esNuevo: false })}
            onAbrirInversion={(folio) => { setProyectoAbierto(null); setVista("inversiones"); setInversionAbierta(folio); }}
            onNuevoAvance={(proyectoId) => nuevoRegistro("Avances", { proyectoId })}
            onEditarAvance={(row) => setModal({ tab: "Avances", row: { ...row }, esNuevo: false })}
            onEliminarAvance={(row) => setConfirm({ tab: "Avances", key: row.id, msg: `Se eliminara el avance "${row.titulo || row.tipo}".` })}
            onNuevaNota={(proyectoId) => nuevoRegistro("Bitacora", { proyectoId })}
            onEditarNota={(row) => setModal({ tab: "Bitacora", row: { ...row }, esNuevo: false })}
            onEliminarNota={(row) => setConfirm({ tab: "Bitacora", key: row.id, msg: `Se eliminara la nota de bitacora.` })}
            onNotificar={async (proyectoId) => {
              try {
                const r = await apiCall("notificarAvance", { pass, proyectoId });
                const sin = Number(r.sinCorreo) || 0;
                if (r.enviados === 0) {
                  notificar(sin > 0 ? `Nadie recibio el aviso: ${sin} codesarrollador(es) sin correo registrado.` : "No habia a quien avisar.", "error");
                } else {
                  notificar(`Aviso enviado a ${r.enviados} codesarrollador(es).${sin > 0 ? ` (${sin} sin correo, no recibieron.)` : ""}`, sin > 0 ? "info" : "ok");
                }
              } catch (e) {
                notificar(manejarError(e), "error");
              }
            }}
            onGenerarLink={async (inversionistaId) => {
              try {
                const r = await apiCall("generarLinkAcceso", { pass, inversionistaId });
                notificar("Link generado. Copialo y enviaselo al cliente.", "ok");
                return r.url;
              } catch (e) {
                notificar(manejarError(e), "error");
                return null;
              }
            }}
          />
        )}

        {/* ---------- INVERSIONES ---------- */}
        {vista === "inversiones" && !inversionAbierta && (
          <ListaInversiones
            data={data}
            inversionistaPorId={inversionistaPorId}
            proyectoPorId={proyectoPorId}
            capitalRecibido={capitalRecibido}
            onNuevo={() => nuevoRegistro("Inversiones")}
            onEditar={(row) => setModal({ tab: "Inversiones", row: { ...row }, esNuevo: false })}
            onEliminar={(row) => setConfirm({ tab: "Inversiones", key: row.folio, msg: `Se eliminara la inversion ${row.folio}. (Sus aportaciones/documentos no se borran solos.)` })}
            onAbrir={(folio) => setInversionAbierta(folio)}
          />
        )}

        {vista === "inversiones" && inversionAbierta && (
          <DetalleInversion
            folio={inversionAbierta}
            data={data}
            pass={pass}
            inversionistaPorId={inversionistaPorId}
            proyectoPorId={proyectoPorId}
            aportacionesDeFolio={aportacionesDeFolio}
            documentosDeFolio={documentosDeFolio}
            capitalRecibido={capitalRecibido}
            onVolver={() => setInversionAbierta(null)}
            onEditarInversion={(row) => setModal({ tab: "Inversiones", row: { ...row }, esNuevo: false })}
            onNuevaAportacion={(folio) => nuevoRegistro("Aportaciones", { folio })}
            onEditarAportacion={(row) => setModal({ tab: "Aportaciones", row: { ...row }, esNuevo: false })}
            onEliminarAportacion={(row) => setConfirm({ tab: "Aportaciones", key: row.id, msg: `Se eliminara el pago "${row.concepto || row.numeroPago}".` })}
            onMarcarRecibida={(row) => confirmarPagoReportado(row, (row.montoReportado && Number(row.montoReportado) > 0) ? Number(row.montoReportado) : num(row.monto))}
            onGuardarComprobante={(row, url) => guardarFila("Aportaciones", { ...row, comprobanteUrl: url })}
            onGenerarPlan={(folio) => generarPlanPagos(folio)}
            onNuevoDocumento={(folio) => nuevoRegistro("Documentos", { folio })}
            onEliminarDocumento={(row) => setConfirm({ tab: "Documentos", key: row.id, msg: `Se eliminara el documento "${row.nombre || row.tipo}".` })}
            onAbrirProyecto={(proyectoId) => { setInversionAbierta(null); setVista("proyectos"); setProyectoAbierto(proyectoId); }}
          />
        )}

        {/* ---------- ASESORES ---------- */}
        {vista === "asesores" && (
          <ListaAsesores
            data={data}
            proyectoPorId={proyectoPorId}
            onNuevo={() => nuevoRegistro("Asesores")}
            onEditar={(row) => setModal({ tab: "Asesores", row: { ...row }, esNuevo: false })}
            onEliminar={(row) => setConfirm({ tab: "Asesores", key: row.id, msg: `Se eliminara el asesor "${row.nombre || row.id}" y su acceso.` })}
          />
        )}

        {/* ---------- REFERIDOS ---------- */}
        {vista === "referidos" && (
          <ListaReferidos
            data={data}
            onEditar={(row) => setModal({ tab: "Referidos", row: { ...row }, esNuevo: false })}
            onEliminar={(row) => setConfirm({ tab: "Referidos", key: row.id, msg: `Se eliminara el referido "${row.nombreProspecto || row.id}".` })}
            onCambiarEstado={(row, estado) => guardarFila("Referidos", { ...row, estado })}
          />
        )}

        {/* ---------- PAGOS (global) ---------- */}
        {vista === "pagos" && (
          <ListaPagos
            data={data}
            inversionistaPorId={inversionistaPorId}
            onAbrir={(folio) => { setVista("inversiones"); setInversionAbierta(folio); }}
            onEditar={(row) => setModal({ tab: "Aportaciones", row: { ...row }, esNuevo: false })}
          />
        )}

        {/* ---------- CALCULADORA ---------- */}
        {vista === "calculadora" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-1"><Calculator size={18} /> Calculadora de rendimiento</h2>
            <p className="text-sm text-slate-500 mb-4">Simulador de rendimiento anual con la tasa que elijas, prorrateado por dia. Solo simula (no aplica a tramos ni plusvalia) y no guarda nada.</p>
            <Calculadora />
          </div>
        )}
      </main>

      {/* Indicador de guardado */}
      {guardando && (
        <div className="fixed bottom-5 right-5 z-[90] bg-slate-900 text-white px-3 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg">
          <Spinner size={14} /> Guardando...
        </div>
      )}

      {/* Modal de formulario */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal ? `${modal.esNuevo ? "Nuevo" : "Editar"} · ${SINGULAR_TAB[modal.tab] || modal.tab}` : ""}
      >
        {modal && (
          <FormularioModal
            tab={modal.tab}
            rowInicial={modal.row}
            esNuevo={modal.esNuevo}
            data={data}
            pass={pass}
            onCancelar={() => setModal(null)}
            onGuardar={async (row) => {
              try { await guardarFila(modal.tab, row); setModal(null); } catch (e) { /* el error ya se muestra */ }
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title="Confirmar eliminacion"
        message={confirm?.msg}
        onCancel={() => setConfirm(null)}
        onConfirm={() => eliminarFila(confirm.tab, confirm.key)}
      />

      {wizard && (
        <WizardAlta
          proyectos={data.Proyectos}
          onCrear={altaCodesarrollador}
          onClose={() => { setWizard(false); cargar(true); }}
        />
      )}
    </div>
  );

  // Generador rapido de las 4 aportaciones del ejemplo Casa Alysa
  async function generarPlanPagos(folio, n = 4) {
    const inv = arr(data.Inversiones).find(i => String(i.folio) === String(folio));
    if (!inv) return;
    const total = num(inv.montoTotal);
    const inicio = inv.fechaInicio || todayISO();
    const cada = Math.round(total / n);
    try {
      for (let i = 0; i < n; i++) {
        const monto = i === n - 1 ? total - cada * (n - 1) : cada;
        const concepto = i === 0 ? "Aportacion inicial" : (i === n - 1 ? "Aportacion final" : `Aportacion ${i + 1} de ${n}`);
        await guardarFila("Aportaciones", { folio, numeroPago: i + 1, totalPagos: n, concepto, monto, fechaProgramada: sumarMeses(inicio, i), fechaRecibida: "", comprobanteUrl: "", referencia: "", fechaReporte: "" });
      }
      notificar(`Plan de ${n} aportaciones generado.`, "ok");
    } catch (e) { /* error ya notificado */ }
  }
}

// ----- Formulario dentro del modal (decide que form mostrar) -----
function FormularioModal({ tab, rowInicial, data, pass, onCancelar, onGuardar, esNuevo = true }) {
  const [row, setRow] = useState(rowInicial);
  const [enviando, setEnviando] = useState(false);

  // Al CREAR una inversion, el folio no debe existir ya (un guardado lo pisaria).
  const folioDuplicado = useMemo(() => {
    if (tab !== "Inversiones" || !esNuevo) return false;
    const f = String(row.folio || "").trim();
    return !!f && arr(data.Inversiones).some((i) => String(i.folio).trim() === f);
  }, [tab, esNuevo, row.folio, data]);

  const valido = useMemo(() => {
    if (tab === "Inversiones") return !!(row.folio && String(row.folio).trim()) && !folioDuplicado;
    if (tab === "Inversionistas") return !!(row.nombre && String(row.nombre).trim());
    if (tab === "Proyectos") return !!(row.nombre && String(row.nombre).trim());
    if (tab === "Aportaciones") return !!(row.folio && row.monto);
    if (tab === "Documentos") return !!(row.folio && (row.nombre || row.url));
    if (tab === "Avances") return !!(row.proyectoId && row.url && (row.titulo || row.tipo));
    if (tab === "Bitacora") return !!(row.proyectoId && row.nota);
    if (tab === "Asesores") return !!(row.nombre && String(row.nombre).trim() && row.claveAcceso && String(row.claveAcceso).trim());
    if (tab === "Referidos") return !!(row.nombreProspecto && String(row.nombreProspecto).trim());
    return true;
  }, [tab, row, folioDuplicado]);

  const submit = async () => {
    setEnviando(true);
    await onGuardar(row);
    setEnviando(false);
  };

  return (
    <div>
      {tab === "Inversionistas" && <InversionistaForm value={row} onChange={setRow} />}
      {tab === "Proyectos" && <ProyectoForm value={row} onChange={setRow} precios={data.preciosPlusvalia} />}
      {tab === "Inversiones" && <InversionForm value={row} onChange={setRow} inversionistas={data.Inversionistas} proyectos={data.Proyectos} precios={data.preciosPlusvalia} esNuevo={esNuevo} />}
      {tab === "Aportaciones" && <AportacionForm value={row} onChange={setRow} pass={pass} />}
      {tab === "Documentos" && <DocumentoForm value={row} onChange={setRow} />}
      {tab === "Avances" && <AvanceForm value={row} onChange={setRow} auth={{ pass }} />}
      {tab === "Bitacora" && <BitacoraForm value={row} onChange={setRow} />}
      {tab === "Asesores" && <AsesorForm value={row} onChange={setRow} proyectos={data.Proyectos} />}
      {tab === "Referidos" && <ReferidoForm value={row} onChange={setRow} />}

      {folioDuplicado ? <p className="mt-4 text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> Ya existe una inversion con ese folio. Usa uno distinto para no sobre-escribirla.</p> : null}
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
        <Btn variant="outline" onClick={onCancelar}>Cancelar</Btn>
        <Btn onClick={submit} disabled={!valido || enviando}>
          {enviando ? <Spinner /> : <Save size={16} />} Guardar
        </Btn>
      </div>
    </div>
  );
}

// ----- Lista de inversionistas -----
function ListaInversionistas({ data, onNuevo, onEditar, onEliminar }) {
  const [verClaves, setVerClaves] = useState({});
  const lista = arr(data.Inversionistas);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Users size={20} /> Codesarrolladores <span className="text-sm font-normal text-slate-400">({lista.length})</span></h2>
        <Btn onClick={onNuevo}><Plus size={16} /> Nuevo</Btn>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={Users} texto="Aun no hay codesarrolladores. Crea el primero." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lista.map((i) => {
            const numInv = arr(data.Inversiones).filter(x => String(x.inversionistaId) === String(i.id)).length;
            const tieneClave = !!(i.claveAcceso && String(i.claveAcceso).trim());
            return (
              <div key={i.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{i.nombre || "(sin nombre)"}</div>
                    <div className="text-xs text-slate-400">{i.email || "sin correo"} · {i.telefono || "sin tel."}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <IconBtn onClick={() => onEditar(i)} icon={Pencil} title="Editar" />
                    <IconBtn onClick={() => onEliminar(i)} icon={Trash2} title="Eliminar" danger />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
                    <KeyRound size={13} className="shrink-0" />
                    {tieneClave
                      ? <span className="font-mono truncate">{verClaves[i.id] ? i.claveAcceso : "••••••••"}</span>
                      : <span className="italic text-slate-400 truncate">Editar para ver/asignar clave</span>}
                  </div>
                  {tieneClave ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setVerClaves(v => ({ ...v, [i.id]: !v[i.id] }))} className="text-slate-400 hover:text-slate-700">
                        {verClaves[i.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <CopyButton value={i.claveAcceso} label="Copiar" />
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-slate-400">{numInv} inversion{numInv === 1 ? "" : "es"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----- Lista de proyectos -----
function ListaProyectos({ data, onNuevo, onAbrir, onEditar, onEliminar }) {
  const lista = arr(data.Proyectos);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Building2 size={20} /> Proyectos <span className="text-sm font-normal text-slate-400">({lista.length})</span></h2>
        <Btn onClick={onNuevo}><Plus size={16} /> Nuevo</Btn>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={Building2} texto="Aun no hay proyectos. Crea el primero (puedes precargar Casa Alysa)." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {lista.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 flex items-center gap-2">
                    {p.nombre || "(sin nombre)"}
                    {(p.estado || "Abierto") === "Abierto"
                      ? <Badge tone="green">Abierto</Badge>
                      : <Badge tone="gray">Cerrado</Badge>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{p.tipo || "Obra"}{p.etapaActual ? ` · etapa: ${p.etapaActual}` : ""}</div>
                  {p.descripcion ? <div className="text-xs text-slate-400 mt-0.5">{p.descripcion}</div> : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  <IconBtn onClick={() => onEditar(p)} icon={Pencil} title="Editar" />
                  <IconBtn onClick={() => onEliminar(p)} icon={Trash2} title="Eliminar" danger />
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm">
                <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5"><Banknote size={14} /> Cuenta de deposito</div>
                <DatoBanco label="Banco" valor={p.banco} />
                <DatoBanco label="Beneficiario" valor={p.beneficiario} />
                <DatoBanco label="Cuenta" valor={p.cuenta} copiable />
                <DatoBanco label="CLABE" valor={p.clabe} copiable mono />
                {p.conceptoBase ? <DatoBanco label="Concepto" valor={p.conceptoBase} /> : null}
              </div>
              <Btn variant="outline" className="w-full mt-3" onClick={() => onAbrir(p.id)}><HardHat size={15} /> Abrir tablero (avances, bitacora, codesarrolladores)</Btn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DatoBanco({ label, valor, copiable, mono }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <div className="flex items-start gap-1.5 min-w-0">
        <span className={`text-xs text-slate-700 text-right break-all leading-snug ${mono ? "font-mono" : ""}`}>{valor || "—"}</span>
        {copiable && valor ? <span className="shrink-0"><CopyButton value={valor} label="" /></span> : null}
      </div>
    </div>
  );
}

// ----- Lista de inversiones -----
function ListaInversiones({ data, inversionistaPorId, proyectoPorId, capitalRecibido, onNuevo, onEditar, onEliminar, onAbrir }) {
  const lista = arr(data.Inversiones);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Wallet size={20} /> Inversiones <span className="text-sm font-normal text-slate-400">({lista.length})</span></h2>
        <Btn onClick={onNuevo}><Plus size={16} /> Nueva</Btn>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={Wallet} texto="Aun no hay inversiones. Crea la primera (recuerda el folio, ej. CA-HM-2026-01)." />
      ) : (
        <>
        {/* Movil: tarjetas apiladas (sin scroll lateral) */}
        <div className="sm:hidden space-y-2">
          {lista.map((inv) => {
            const recibido = capitalRecibido(inv.folio);
            const monto = num(inv.montoTotal);
            const progreso = monto > 0 ? Math.min(100, Math.round((recibido / monto) * 100)) : 0;
            return (
              <div key={inv.folio} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => onAbrir(inv.folio)} className="font-mono font-medium text-slate-800 hover:text-[#b8965a] inline-flex items-center gap-1 min-h-[40px]">
                    {inv.folio} <ChevronRight size={14} />
                  </button>
                  <EstadoInversionBadge estado={inv.estado || "Activa"} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{inversionistaPorId(inv.inversionistaId)?.nombre || "—"} · {proyectoPorId(inv.proyectoId)?.nombre || "—"}</div>
                <div className="flex items-end justify-between gap-2 mt-3">
                  <div><div className="text-[11px] text-slate-400">Monto</div><div className="tabular-nums font-medium text-slate-800">{money(monto)}</div></div>
                  <div className="text-right"><div className="text-[11px] text-slate-400">Recibido</div><div className="tabular-nums font-medium text-emerald-700">{money(recibido)}</div></div>
                </div>
                <div className="w-full mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: progreso + "%" }} /></div>
                <div className="flex gap-1 justify-end mt-2">
                  <IconBtn onClick={() => onEditar(inv)} icon={Pencil} title="Editar" />
                  <IconBtn onClick={() => onEliminar(inv)} icon={Trash2} title="Eliminar" danger />
                </div>
              </div>
            );
          })}
        </div>
        {/* Escritorio: tabla */}
        <div className="hidden sm:block overflow-x-auto bg-white rounded-2xl border border-slate-200">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Folio</th>
                <th className="text-left px-4 py-3 font-medium">Codesarrollador</th>
                <th className="text-left px-4 py-3 font-medium">Proyecto</th>
                <th className="text-right px-4 py-3 font-medium">Monto</th>
                <th className="text-right px-4 py-3 font-medium">Recibido</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((inv) => {
                const recibido = capitalRecibido(inv.folio);
                const monto = num(inv.montoTotal);
                const progreso = monto > 0 ? Math.min(100, Math.round((recibido / monto) * 100)) : 0;
                return (
                  <tr key={inv.folio} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button onClick={() => onAbrir(inv.folio)} className="font-mono font-medium text-slate-800 hover:text-[#b8965a] inline-flex items-center gap-1">
                        {inv.folio} <ChevronRight size={14} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{inversionistaPorId(inv.inversionistaId)?.nombre || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{proyectoPorId(inv.proyectoId)?.nombre || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">{money(monto)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="text-emerald-700 font-medium">{money(recibido)}</div>
                      <div className="w-20 ml-auto mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: progreso + "%" }} />
                      </div>
                    </td>
                    <td className="px-4 py-3"><EstadoInversionBadge estado={inv.estado || "Activa"} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <IconBtn onClick={() => onEditar(inv)} icon={Pencil} title="Editar" />
                        <IconBtn onClick={() => onEliminar(inv)} icon={Trash2} title="Eliminar" danger />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

// ----- Detalle de una inversion -----
// ===================================================================
// TABLERO DE PROYECTO — gestiona avances y bitacora a NIVEL PROYECTO
// (los comparten todos los codesarrolladores de ese proyecto)
// ===================================================================
function ProyectoDetalle({ proyectoId, data, inversionistaPorId, onVolver, onEditarProyecto, onAbrirInversion, onNuevoAvance, onEditarAvance, onEliminarAvance, onNuevaNota, onEditarNota, onEliminarNota, onNotificar, onGenerarLink }) {
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [generandoLink, setGenerandoLink] = useState("");  // inversionistaId en proceso
  const [linksGenerados, setLinksGenerados] = useState({}); // { inversionistaId: url }
  const p = arr(data.Proyectos).find(x => String(x.id) === String(proyectoId));
  if (!p) {
    return (<div><Btn variant="outline" onClick={onVolver}><ArrowLeft size={16} /> Proyectos</Btn><p className="text-sm text-slate-500 mt-4">No se encontro el proyecto.</p></div>);
  }
  const inversiones = arr(data.Inversiones).filter(i => String(i.proyectoId) === String(proyectoId));
  const avances = arr(data.Avances).filter(a => String(a.proyectoId) === String(proyectoId)).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
  const bitacora = arr(data.Bitacora).filter(b => String(b.proyectoId) === String(proyectoId)).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));

  // ----- KPIs del proyecto (solo frontend, reutiliza estadoAportacion) -----
  const kpisProyecto = useMemo(() => {
    // Base UNICA para los KPIs financieros: inversiones ACTIVAS del proyecto, para
    // que "comprometido" y "recibido/por recibir/vencidas" cuenten lo mismo (antes
    // recibido contaba aportaciones de TODAS las inversiones y comprometido solo las activas).
    const inversionesActivas = inversiones.filter(i => (i.estado || "Activa") === "Activa");
    const foliosProyecto = new Set(inversionesActivas.map(i => String(i.folio)));
    const capitalComprometido = inversionesActivas.reduce((s, i) => s + num(i.montoTotal), 0);
    // Aportaciones de las inversiones activas de este proyecto (por folio).
    const aportacionesProyecto = arr(data.Aportaciones).filter(a => foliosProyecto.has(String(a.folio)));
    const recibidas = aportacionesProyecto.filter(a => estadoAportacion(a) === "Recibida");
    const capitalRecibido = recibidas.reduce((s, a) => s + num(a.monto), 0);
    const porRecibir = Math.max(0, capitalComprometido - capitalRecibido);
    const avancePct = capitalComprometido > 0 ? Math.min(100, (capitalRecibido / capitalComprometido) * 100) : 0;
    const vencidas = aportacionesProyecto.filter(a => estadoAportacion(a) === "Vencida");
    // Proxima aportacion por cobrar (pendiente o vencida) mas cercana por fecha programada.
    const proxima = aportacionesProyecto
      .filter(a => { const e = estadoAportacion(a); return e === "Pendiente" || e === "Vencida"; })
      .sort((a, b) => (parseDate(a.fechaProgramada)?.getTime() || Infinity) - (parseDate(b.fechaProgramada)?.getTime() || Infinity))[0] || null;
    // Conteo de avances por etapa (para el sub del KPI de avances).
    const porEtapa = {};
    avances.forEach(av => { const k = (av.etapa || "Sin etapa").trim() || "Sin etapa"; porEtapa[k] = (porEtapa[k] || 0) + 1; });
    const etapasConAvance = Object.keys(porEtapa).length;
    return {
      capitalComprometido, capitalRecibido, porRecibir, avancePct,
      vencidasCount: vencidas.length, proxima,
      numCodesarrolladores: inversiones.length,
      numAvances: avances.length, etapasConAvance,
    };
  }, [inversiones, avances, data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Btn variant="outline" onClick={onVolver}><ArrowLeft size={16} /> Proyectos</Btn>
        <Btn variant="outline" onClick={() => onEditarProyecto(p)}><Pencil size={15} /> Editar proyecto</Btn>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl font-semibold text-slate-800">{p.nombre || "(sin nombre)"}</h2>
          {(p.estado || "Abierto") === "Abierto" ? <Badge tone="green">Abierto</Badge> : <Badge tone="gray">Cerrado</Badge>}
          <Badge tone="slate">{p.tipo || "Obra"}</Badge>
          {p.etapaActual ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#7a5e1e" }}>Etapa: {p.etapaActual}</span> : null}
        </div>
        {p.descripcion ? <div className="text-sm text-slate-500 mt-1">{p.descripcion}</div> : null}
        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm">
          <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5"><Banknote size={14} /> Cuenta de deposito</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            <DatoBanco label="Banco" valor={p.banco} />
            <DatoBanco label="Beneficiario" valor={p.beneficiario} />
            <DatoBanco label="Cuenta" valor={p.cuenta} copiable />
            <DatoBanco label="CLABE" valor={p.clabe} copiable mono />
          </div>
        </div>
      </div>

      {/* KPIs del proyecto (salud financiera, sin entrar inversion por inversion) */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard icon={TrendingUp} label="Capital comprometido" value={money(kpisProyecto.capitalComprometido)} sub="inversiones activas" tone="slate" />
          <KpiCard icon={CheckCircle2} label="Capital recibido" value={money(kpisProyecto.capitalRecibido)} sub={pct(kpisProyecto.avancePct) + " de la captacion"} tone="green" />
          <KpiCard icon={Clock} label="Por recibir" value={money(kpisProyecto.porRecibir)} tone="gold" />
          <KpiCard icon={Users} label="Codesarrolladores" value={kpisProyecto.numCodesarrolladores} tone="blue" />
          <KpiCard icon={HardHat} label="Avances" value={kpisProyecto.numAvances} sub={kpisProyecto.etapasConAvance > 0 ? `${kpisProyecto.etapasConAvance} etapa(s)` : (p.etapaActual ? `Etapa: ${p.etapaActual}` : "sin avances")} tone="slate" />
          <KpiCard icon={AlertTriangle} label="Aportaciones vencidas" value={kpisProyecto.vencidasCount} tone="red" alert={kpisProyecto.vencidasCount > 0} />
        </div>

        {/* Barra de avance de captacion */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500">Avance de captacion</span>
            <span className="text-xs font-semibold tabular-nums" style={{ color: "#7a5e1e" }}>{pct(kpisProyecto.avancePct)}</span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${kpisProyecto.avancePct}%`, background: "linear-gradient(90deg,#c9a96e,#d4be8a)" }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{money(kpisProyecto.capitalRecibido)} recibido</span>
            <span>{money(kpisProyecto.capitalComprometido)} comprometido</span>
          </div>
          {kpisProyecto.proxima ? (
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
              <CalendarClock size={14} className="text-slate-400" />
              <span className="text-slate-500">Proxima aportacion:</span>
              <span className="font-medium text-slate-700">{kpisProyecto.proxima.concepto || `Pago ${kpisProyecto.proxima.numeroPago}`}</span>
              <span className="text-slate-400">· {fmtFecha(kpisProyecto.proxima.fechaProgramada)}</span>
              <span className="font-semibold text-slate-700 tabular-nums">· {money(kpisProyecto.proxima.monto)}</span>
              {estadoAportacion(kpisProyecto.proxima) === "Vencida" ? <Badge tone="red">Vencida</Badge> : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Codesarrolladores de este proyecto */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Users size={18} /> Codesarrolladores <span className="text-sm font-normal text-slate-400">({inversiones.length})</span></h3>
          {inversiones.length > 0 && onNotificar ? (
            <Btn
              variant="outline"
              disabled={enviandoAviso}
              onClick={async () => {
                if (enviandoAviso) return;
                setEnviandoAviso(true);
                try { await onNotificar(proyectoId); }
                finally { setEnviandoAviso(false); }
              }}
            >
              {enviandoAviso ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
              {enviandoAviso ? "Enviando…" : "Avisar a codesarrolladores"}
            </Btn>
          ) : null}
        </div>
        {inversiones.length === 0 ? (
          <p className="text-sm text-slate-400">Aun no hay codesarrolladores en este proyecto.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {inversiones.map((iv) => {
              const inv = inversionistaPorId(iv.inversionistaId);
              const invId = String(iv.inversionistaId || "");
              const linkUrl = linksGenerados[invId];
              const generandoEste = generandoLink === invId;
              return (
                <li key={iv.folio} className="py-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-700 truncate">{inv?.nombre || "—"}</div>
                      <div className="text-xs text-slate-400 font-mono">{iv.folio} · {money(num(iv.montoTotal))}</div>
                    </div>
                    {onGenerarLink && invId ? (
                      <Btn
                        variant="outline"
                        disabled={generandoEste}
                        onClick={async () => {
                          if (generandoEste) return;
                          setGenerandoLink(invId);
                          try {
                            const url = await onGenerarLink(invId);
                            if (url) setLinksGenerados((m) => ({ ...m, [invId]: url }));
                          } finally {
                            setGenerandoLink("");
                          }
                        }}
                      >
                        {generandoEste ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                        {generandoEste ? "Generando…" : "Generar link de acceso"}
                      </Btn>
                    ) : null}
                    <IconBtn onClick={() => onAbrirInversion(iv.folio)} icon={ChevronRight} title="Abrir inversion" />
                  </div>
                  {linkUrl ? (
                    <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 p-2 flex items-center gap-2">
                      <div className="min-w-0 flex-1 text-[11px] text-slate-500 font-mono truncate" title={linkUrl}>{linkUrl}</div>
                      <CopyButton value={linkUrl} label="Copiar link" />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Avance del proyecto (galeria por etapa) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><HardHat size={18} /> Avance del proyecto <span className="text-xs font-normal text-slate-400">(lo ven los codesarrolladores)</span></h3>
          <Btn variant="outline" onClick={() => onNuevoAvance(proyectoId)}><Plus size={15} /> Avance</Btn>
        </div>
        {avances.length === 0 ? (
          <p className="text-sm text-slate-400">Sin avances. Sube fotos, videos o documentos del progreso (por etapa).</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {avances.map((av) => (
              <div key={av.id} className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="relative aspect-[4/3] bg-slate-100">
                  {av.tipo === "video" ? (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: "#1a1409" }}><PlayCircle size={30} style={{ color: "#d4be8a" }} /></div>
                  ) : av.tipo === "documento" ? (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: "#f5f1ea" }}><FileText size={30} style={{ color: "#c9a96e" }} /></div>
                  ) : (
                    <img src={driveImg(av.url)} alt={av.titulo || "Avance"} loading="lazy" className="w-full h-full object-cover" />
                  )}
                  {av.etapa ? <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full bg-black/55 text-white">{av.etapa}</span> : null}
                </div>
                <div className="p-2">
                  <div className="text-xs font-medium text-slate-700 truncate">{av.titulo || "(sin titulo)"}</div>
                  <div className="text-[10px] text-slate-400">{fmtFecha(av.fecha)}</div>
                  <div className="flex justify-end gap-1 mt-1">
                    {av.url ? <a href={av.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-[#b8965a] p-1"><ExternalLink size={13} /></a> : null}
                    <IconBtn onClick={() => onEditarAvance(av)} icon={Pencil} title="Editar" />
                    <IconBtn onClick={() => onEliminarAvance(av)} icon={Trash2} title="Eliminar" danger />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bitacora del asesor */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><MessageCircle size={18} /> Bitacora del asesor</h3>
          <Btn variant="outline" onClick={() => onNuevaNota(proyectoId)}><Plus size={15} /> Nota</Btn>
        </div>
        {bitacora.length === 0 ? (
          <p className="text-sm text-slate-400">Sin notas. Agrega actualizaciones o respuestas para los codesarrolladores.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bitacora.map((b) => (
              <li key={b.id} className="py-2.5 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400">{fmtFecha(b.fecha)}</span>
                    {b.etiqueta ? <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#7a5e1e" }}>{b.etiqueta}</span> : null}
                    {b.autor ? <span className="text-[11px] text-slate-400">· {b.autor}</span> : null}
                  </div>
                  {b.titulo ? <div className="text-sm font-medium text-slate-700 mt-0.5">{b.titulo}</div> : null}
                  <div className="text-sm text-slate-600">{b.nota}</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <IconBtn onClick={() => onEditarNota(b)} icon={Pencil} title="Editar" />
                  <IconBtn onClick={() => onEliminarNota(b)} icon={Trash2} title="Eliminar" danger />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DetalleInversion({
  folio, data, pass, inversionistaPorId, proyectoPorId, aportacionesDeFolio, documentosDeFolio, capitalRecibido,
  onVolver, onEditarInversion, onNuevaAportacion, onEditarAportacion, onEliminarAportacion,
  onMarcarRecibida, onGuardarComprobante, onGenerarPlan, onNuevoDocumento, onEliminarDocumento,
  onAbrirProyecto,
}) {
  const inv = arr(data.Inversiones).find(i => String(i.folio) === String(folio));
  const [compEdit, setCompEdit] = useState({}); // id -> url temporal

  if (!inv) {
    return (
      <div>
        <Btn variant="outline" onClick={onVolver}><ArrowLeft size={16} /> Volver</Btn>
        <p className="text-sm text-slate-500 mt-4">No se encontro la inversion.</p>
      </div>
    );
  }

  const inversionista = inversionistaPorId(inv.inversionistaId);
  const proyecto = proyectoPorId(inv.proyectoId);
  const aportaciones = aportacionesDeFolio(folio);
  const documentos = documentosDeFolio(folio);
  const recibido = capitalRecibido(folio);
  const monto = num(inv.montoTotal);

  // Rendimiento REAL: valor hoy sobre lo APORTADO (desde el inicio) + proyeccion al final.
  const rend = calcularRendimientoInversion(inv, recibido, data.preciosPlusvalia, proyecto);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Btn variant="outline" onClick={onVolver}><ArrowLeft size={16} /> Volver</Btn>
        <div className="min-w-0 flex-1 sm:flex-none">
          <div className="font-mono font-semibold text-slate-800">{inv.folio}</div>
          <div className="text-xs text-slate-400">{inversionista?.nombre || "—"} · {proyecto?.nombre || "—"}</div>
        </div>
        <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-2">
          <EstadoInversionBadge estado={inv.estado || "Activa"} />
          <Btn variant="outline" onClick={() => descargarEstadoCuentaPDF({ inv, inversionista, proyecto, aportaciones, precios: data.preciosPlusvalia })}><Printer size={15} /> Estado de cuenta (PDF)</Btn>
          <Btn variant="outline" onClick={() => onEditarInversion(inv)}><Pencil size={15} /> Editar</Btn>
        </div>
      </div>

      {/* Resumen */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400">Modelo de rendimiento aplicado:</span>
        <Badge tone={rend.modo === "plusvalia" ? "green" : rend.modo === "tramos" ? "blue" : "amber"}>
          {rend.modo === "plusvalia" ? "Plusvalia por etapa" : rend.modo === "tramos" ? "Por tramos (brackets)" : "Tasa anual"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={TrendingUp} label="Monto comprometido" value={money(monto)} tone="slate" />
        <KpiCard icon={CheckCircle2} label="Capital recibido" value={money(recibido)} sub={`Falta ${money(Math.max(0, monto - recibido))}`} tone="green" />
        <KpiCard icon={Sparkles} label={rend.modo === "plusvalia" ? `Plusvalia (${rend.etapaActualLabel})` : rend.modo === "tramos" ? `Retorno (mes ${rend.mesHoy})` : `Rendimiento (${rend.dias} dias)`} value={rend.modo === "plusvalia" && rend.sinPrecios ? "—" : pct(rend.rendimientoPct)} sub={rend.modo === "plusvalia" ? (rend.sinPrecios ? "falta precio de entrada/etapa" : `desde ${money(rend.precioEntrada)}/m²`) : ((inv.estado || "Activa") === "Liquidada" ? "a fecha de salida" : (rend.modo === "tramos" ? "si se vende hoy" : "transcurrido a hoy"))} tone="gold" />
        <KpiCard icon={CircleDollarSign} label="Valor hoy" value={money(rend.totalARecibir)} sub={rend.modo === "plusvalia" && rend.sinPrecios ? "plusvalia en configuracion" : `sobre lo aportado · +${money(rend.ganancia)}`} tone="blue" />
        <KpiCard icon={CalendarClock} label="Total al final (estimado)" value={rend.modo === "plusvalia" && rend.sinPrecios ? "—" : money(rend.totalFinal)} sub={rend.modo === "plusvalia" ? (rend.sinPrecios ? "pendiente de precios" : (rend.hayUpside ? `al vender (${rend.etapaProyLabel}) · ${pct(rend.rendPctFinal)}` : "ya en su valor estimado")) : rend.modo === "tramos" ? `al vender (mes ${rend.mesFin}) · ${pct(rend.rendPctFinal)}` : `si completa · +${money(rend.gananciaFinal)}`} tone="gold" />
      </div>

      {/* Cuenta de deposito del proyecto */}
      {proyecto && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><Banknote size={18} /> Cuenta de deposito · {proyecto.nombre}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 max-w-2xl">
            <DatoBanco label="Banco" valor={proyecto.banco} />
            <DatoBanco label="Beneficiario" valor={proyecto.beneficiario} />
            <DatoBanco label="Cuenta" valor={proyecto.cuenta} copiable />
            <DatoBanco label="CLABE" valor={proyecto.clabe} copiable mono />
          </div>
          {proyecto.conceptoBase ? <div className="mt-2 text-xs text-slate-400">Concepto sugerido: {proyecto.conceptoBase}</div> : null}
        </div>
      )}

      {/* Calendario de aportaciones */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Calendar size={18} /> Calendario de aportaciones</h3>
          <div className="flex gap-2">
            {aportaciones.length === 0 && (
              <Btn variant="gold" onClick={() => onGenerarPlan(folio)}><Sparkles size={15} /> Generar plan (4 pagos)</Btn>
            )}
            <Btn variant="outline" onClick={() => onNuevaAportacion(folio)}><Plus size={15} /> Pago</Btn>
          </div>
        </div>
        {aportaciones.length === 0 ? (
          <p className="text-sm text-slate-400">Aun no hay aportaciones. Usa "Generar plan" para crear los 4 pagos del ejemplo, o agrega uno manual.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="text-slate-500 text-xs">
                <tr className="border-b border-slate-100">
                  <th className="text-left px-2 py-2 font-medium">#</th>
                  <th className="text-left px-2 py-2 font-medium">Concepto</th>
                  <th className="text-left px-2 py-2 font-medium">Programada</th>
                  <th className="text-right px-2 py-2 font-medium">Monto</th>
                  <th className="text-left px-2 py-2 font-medium">Estado</th>
                  <th className="text-left px-2 py-2 font-medium">Comprobante</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {aportaciones.map((a) => {
                  const est = estadoAportacion(a);
                  const compVal = compEdit[a.id] !== undefined ? compEdit[a.id] : (a.comprobanteUrl || "");
                  return (
                    <tr key={a.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-2 py-2 text-slate-500 tabular-nums">{a.numeroPago}/{a.totalPagos || "—"}</td>
                      <td className="px-2 py-2 text-slate-700">
                        {a.concepto || "—"}
                        {a.referencia ? <div className="text-[11px] text-slate-400">Folio: {a.referencia}</div> : null}
                        {est === "En aprobacion" ? <div className="text-[11px] text-blue-600 font-medium">Reportado por el cliente · verifica y marca recibido</div> : null}
                      </td>
                      <td className="px-2 py-2 text-slate-500">{fmtFecha(a.fechaProgramada)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-slate-800">{money(a.monto)}</td>
                      <td className="px-2 py-2"><EstadoAportacionBadge ap={a} /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            value={compVal}
                            onChange={(e) => setCompEdit(c => ({ ...c, [a.id]: e.target.value }))}
                            onBlur={() => {
                              const nv = compEdit[a.id];
                              if (nv !== undefined && nv !== (a.comprobanteUrl || "")) onGuardarComprobante(a, nv);
                            }}
                            placeholder="Enlace o ID de archivo"
                            className="w-28 sm:w-36 rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                          <VerComprobante comprobante={a.comprobanteUrl} id={a.id} auth={{ pass }} soloIcono />
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1 justify-end">
                          <BotonRecordarWA ap={a} inversionista={inversionista} proyecto={proyecto} soloIcono />
                          {est !== "Recibida" && (
                            <button onClick={() => onMarcarRecibida(a)} title="Registrar pago (marcar recibido)" className="text-emerald-600 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50">
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          <IconBtn onClick={() => onEditarAportacion(a)} icon={Pencil} title="Editar" />
                          <IconBtn onClick={() => onEliminarAportacion(a)} icon={Trash2} title="Eliminar" danger />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calculadora con datos de esta inversion.
          SOLO se monta en inversiones de tasa anual simple. Antes se montaba siempre y
          cotizaba interes anual sobre inversiones de TRAMOS y de PLUSVALIA: en
          CA-HM-2026-01 a 24 meses daba 50% = $1,500,000 cuando el contrato por tramos
          topa en 25% = $1,250,000. Un cuarto de millon inventado en la pantalla con la
          que se cotiza. */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><Calculator size={18} /> Simular rendimiento de esta inversion</h3>
        {rend.modo === "anual" ? (
          <Calculadora capitalInicial={monto || 1000000} fechaInicio={toDateInput(inv.fechaInicio) || todayISO()} tasaInicial={inv.tasaAnual ?? TASA_DEFAULT} />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-900">
                {rend.modo === "tramos" ? (
                  <>Esta inversion rinde por <b>tramos</b> ({(arr(parseTramos(inv.tramos)) || []).map(t => `${t.desde}-${t.hasta}: ${t.pct}%`).join(" · ")}), no por tasa anual simple. Simular con interes anual daria un numero mas alto que el del contrato, por eso la calculadora no aplica aqui. El valor real ya esta arriba, calculado por tramos.</>
                ) : (
                  <>Esta inversion rinde por <b>plusvalia por etapa</b> del precio por m², no por tasa. La calculadora de interes anual no aplica: el valor se mueve cuando el proyecto cambia de etapa de precio, no con el tiempo.</>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Documentos */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} /> Documentos</h3>
          <Btn variant="outline" onClick={() => onNuevoDocumento(folio)}><Plus size={15} /> Documento</Btn>
        </div>
        {documentos.length === 0 ? (
          <p className="text-sm text-slate-400">Sin documentos. Agrega el contrato, pagare o comprobantes (enlaces de Drive).</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documentos.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><FileText size={15} className="text-slate-500" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-700 truncate">{d.nombre || d.tipo}</div>
                  <div className="text-xs text-slate-400">{d.tipo} · {fmtFecha(d.fecha)}</div>
                </div>
                {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-[#b8965a]"><Link2 size={16} /></a> : null}
                <IconBtn onClick={() => onEliminarDocumento(d)} icon={Trash2} title="Eliminar" danger />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Avance y bitacora ahora viven en el PROYECTO (los comparten todos sus codesarrolladores) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-slate-500 flex items-center gap-2"><HardHat size={16} style={{ color: "#c9a96e" }} /> El <b>avance de obra</b> y la <b>bitácora</b> se gestionan en el <b>proyecto</b> (los ven todos sus codesarrolladores).</div>
        {inv.proyectoId ? <Btn variant="outline" onClick={() => onAbrirProyecto(inv.proyectoId)}>Abrir proyecto <ChevronRight size={15} /></Btn> : null}
      </div>

    </div>
  );
}

function IconBtn({ onClick, icon: Icon, title, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg min-w-[40px] min-h-[40px] inline-flex items-center justify-center ${danger ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}
    >
      <Icon size={16} />
    </button>
  );
}

function EmptyState({ icon: Icon, texto }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
      <div className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 items-center justify-center mb-3"><Icon size={22} className="text-slate-400" /></div>
      <p className="text-sm text-slate-500">{texto}</p>
    </div>
  );
}

// ===================================================================
// ADMIN: LISTA DE ASESORES
// ===================================================================
function ListaAsesores({ data, proyectoPorId, onNuevo, onEditar, onEliminar }) {
  const [verClaves, setVerClaves] = useState({});
  const lista = arr(data.Asesores);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><HardHat size={20} /> Asesores <span className="text-sm font-normal text-slate-400">({lista.length})</span></h2>
        <Btn onClick={onNuevo}><Plus size={16} /> Nuevo asesor</Btn>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={HardHat} texto="Aun no hay asesores. Crea uno y asignale proyectos; solo vera y gestionara avances/bitacora (nada financiero)." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {lista.map((a) => {
            const ids = String(a.proyectoIds || "").split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
            const nombres = ids.map(id => proyectoPorId(id)?.nombre || id);
            return (
              <div key={a.id} className="p-4 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800">{a.nombre || "(sin nombre)"}</div>
                  {a.email ? <div className="text-xs text-slate-400">{a.email}</div> : null}
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Clave:</span>
                    <span className="font-mono text-slate-600">{verClaves[a.id] ? (a.claveAcceso || "—") : "•••••••"}</span>
                    <button onClick={() => setVerClaves(v => ({ ...v, [a.id]: !v[a.id] }))} className="text-slate-400 hover:text-slate-700">{verClaves[a.id] ? <EyeOff size={13} /> : <Eye size={13} />}</button>
                    {a.claveAcceso ? <CopyButton value={a.claveAcceso} label="" /> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {nombres.length === 0 ? <span className="text-xs text-amber-600">Sin proyectos asignados</span> : nombres.map((n, i) => <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{n}</span>)}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <IconBtn onClick={() => onEditar(a)} icon={Pencil} title="Editar" />
                  <IconBtn onClick={() => onEliminar(a)} icon={Trash2} title="Eliminar" danger />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===================================================================
// ADMIN: LISTA DE REFERIDOS
// ===================================================================
// Panel GLOBAL de pagos: todas las aportaciones, con filtro por estado, sin entrar inversion por inversion.
function ListaPagos({ data, inversionistaPorId, onAbrir, onEditar }) {
  const [filtro, setFiltro] = useState("Por validar");
  const inversiones = arr(data.Inversiones);
  const invPorFolio = (folio) => inversiones.find((i) => String(i.folio) === String(folio));
  const proyectoPorId = (id) => arr(data.Proyectos).find((p) => String(p.id) === String(id));
  const todas = arr(data.Aportaciones).map((a) => ({ ...a, _estado: estadoAportacion(a) }));
  const cont = {};
  todas.forEach((a) => { cont[a._estado] = (cont[a._estado] || 0) + 1; });
  const filtros = [
    { key: "Por validar", label: "Por validar", match: (a) => a._estado === "En aprobacion", n: cont["En aprobacion"] || 0 },
    { key: "Vencida", label: "Vencidas", match: (a) => a._estado === "Vencida", n: cont["Vencida"] || 0 },
    { key: "Pendiente", label: "Pendientes", match: (a) => a._estado === "Pendiente", n: cont["Pendiente"] || 0 },
    { key: "Recibida", label: "Recibidas", match: (a) => a._estado === "Recibida", n: cont["Recibida"] || 0 },
    { key: "Todos", label: "Todos", match: () => true, n: todas.length },
  ];
  const activo = filtros.find((f) => f.key === filtro) || filtros[filtros.length - 1];
  const lista = todas.filter(activo.match).sort((a, b) => String(a.fechaProgramada || "").localeCompare(String(b.fechaProgramada || "")));
  const total = lista.reduce((s, a) => s + num(a.monto), 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><CircleDollarSign size={20} /> Pagos <span className="text-sm font-normal text-slate-400">({lista.length} · {money(total)})</span></h2>
      </div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {filtros.map((f) => (
          <button key={f.key} onClick={() => setFiltro(f.key)} className={`text-xs px-3 py-1.5 rounded-full border transition ${filtro === f.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
            {f.label} <span className={filtro === f.key ? "text-white/70" : "text-slate-400"}>({f.n})</span>
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={CircleDollarSign} texto="No hay pagos en este filtro." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {lista.map((a) => {
            const iv = invPorFolio(a.folio);
            const invsta = iv ? inversionistaPorId(iv.inversionistaId) : null;
            const proy = iv ? proyectoPorId(iv.proyectoId) : null;
            const nombre = invsta?.nombre || "—";
            return (
              <div key={a.id} className="p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-800 truncate">{nombre} · <span className="font-mono text-xs text-slate-500">{a.folio}</span></div>
                  <div className="text-xs text-slate-400">{a.concepto || `Aportacion ${a.numeroPago}`} · {fmtFecha(a.fechaProgramada)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="tabular-nums font-medium text-slate-800">{money(a.monto)}</div>
                  <EstadoAportacionBadge ap={a} />
                </div>
                <div className="flex gap-1 shrink-0">
                  <BotonRecordarWA ap={a} inversionista={invsta} proyecto={proy} soloIcono />
                  <IconBtn onClick={() => onEditar(a)} icon={Pencil} title="Editar / validar" />
                  <IconBtn onClick={() => onAbrir(a.folio)} icon={ChevronRight} title="Abrir inversion" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ListaReferidos({ data, onEditar, onEliminar, onCambiarEstado }) {
  const lista = arr(data.Referidos).slice().sort((a, b) => String(b.creado || "").localeCompare(String(a.creado || "")));
  const tono = (e) => e === "Participo" ? "green" : e === "Descartado" ? "gray" : e === "Contactado" ? "blue" : "amber";
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Sparkles size={20} /> Referidos <span className="text-sm font-normal text-slate-400">({lista.length})</span></h2>
      </div>
      <div className="mb-3 text-xs text-slate-600 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">Cada invitado que participe le da a quien lo invito un <b>+1%</b> sobre su aportacion al devolver el capital. Aqui les das seguimiento; el +1% lo aplicas tu al liquidar.</div>
      {lista.length === 0 ? (
        <EmptyState icon={Sparkles} texto="Aun no hay referidos. Apareceran aqui cuando un codesarrollador invite a alguien desde su portal." />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
          {lista.map((r) => (
            <div key={r.id} className="p-4 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{r.nombreProspecto || "(sin nombre)"}</span>
                  <Badge tone={tono(r.estado)}>{r.estado || "Pendiente"}</Badge>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Invitado por {r.referidorNombre || "—"}{r.creado ? ` · ${fmtFecha(r.creado)}` : ""}</div>
                {r.contacto ? <div className="text-xs text-slate-500 mt-0.5">Contacto: {r.contacto}</div> : null}
                {r.nota ? <div className="text-xs text-slate-500 mt-0.5">{r.nota}</div> : null}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Select value={r.estado || "Pendiente"} onChange={(e) => onCambiarEstado(r, e.target.value)} className="!w-auto text-xs py-1">
                  <option>Pendiente</option><option>Contactado</option><option>Participo</option><option>Descartado</option>
                </Select>
                <IconBtn onClick={() => onEditar(r)} icon={Pencil} title="Editar" />
                <IconBtn onClick={() => onEliminar(r)} icon={Trash2} title="Eliminar" danger />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===================================================================
// VISTA ASESOR (acceso propio: solo avances/bitacora de SUS proyectos)
// ===================================================================
function AsesorApp({ clave, onLogout }) {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);     // { tab, row, esNuevo }
  const [confirm, setConfirm] = useState(null);  // { tab, key, msg }
  const [guardando, setGuardando] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notificar = useCallback((msg, tipo = "info") => {
    setToast({ msg, tipo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const res = await apiCall("getMineAsesor", { clave });
      setData(res.data);
    } catch (err) {
      setError(err.message || "No se pudo cargar tu panel.");
      // Si la clave ya no es valida (se la cambiaron), cerrar sesion para no quedar atorado.
      if (esErrorCredenciales(err.message)) { setError("Tu acceso cambio. Vuelve a entrar."); setTimeout(() => onLogout(), 1500); }
    } finally { setCargando(false); }
  }, [clave, onLogout]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (tab, row) => {
    setGuardando(true);
    try {
      await apiCall("guardarComoAsesor", { clave, tab, row });
      setModal(null);
      notificar(row.id ? "Cambios guardados." : "Registro creado.", "ok");
      cargar();
    } catch (err) { notificar(err.message || "No se pudo guardar.", "error"); }
    finally { setGuardando(false); }
  };

  const eliminar = async (tab, key) => {
    setGuardando(true);
    try {
      await apiCall("eliminarComoAsesor", { clave, tab, key });
      notificar("Eliminado.", "ok");
      cargar();
    } catch (err) { notificar(err.message || "No se pudo eliminar.", "error"); }
    finally { setGuardando(false); setConfirm(null); }
  };

  const proyectos = arr(data?.proyectos);
  const nuevoAvance = (proyectoId) => setModal({ tab: "Avances", esNuevo: true, row: { proyectoId, tipo: "foto", etapa: "", url: "", titulo: "", descripcion: "", fecha: todayISO() } });
  const nuevaNota = (proyectoId) => setModal({ tab: "Bitacora", esNuevo: true, row: { proyectoId, fecha: todayISO(), autor: data?.asesor?.nombre || "", etiqueta: "Avance", titulo: "", nota: "" } });

  return (
    <div className="min-h-screen" style={{ background: "#f5f1ea" }}>
      <Toast toast={toast} />
      <header style={{ background: "#0a0a0c" }}>
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <img src={logoWhite} alt="YODESARROLLO.MX" className="h-6 w-auto" style={{ mixBlendMode: "screen" }} />
          <div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: "#c9a96e" }}>Panel del asesor</div>
          <button onClick={onLogout} className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white/80 hover:text-white transition" style={{ background: "rgba(255,255,255,0.08)" }}>
            <LogOut size={14} /> Salir
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {cargando && <div className="flex items-center gap-2 text-slate-500 text-sm justify-center py-10"><Spinner /> Cargando tu panel...</div>}
        {error && <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm"><AlertCircle size={18} className="shrink-0 mt-0.5" /> <span>{error}</span></div>}

        {!cargando && !error && data && (
          <>
            <div className="mb-1">
              <div className="text-2xl font-display text-slate-900">Hola, {(data.asesor?.nombre || "").split(" ")[0] || "Asesor"}</div>
              <div className="text-sm text-slate-500">Gestiona los avances y la bitacora de tus proyectos. No tienes acceso a informacion financiera.</div>
            </div>

            {proyectos.length === 0 ? (
              <EmptyState icon={HardHat} texto="No tienes proyectos asignados todavia. Pide al equipo que te asigne uno." />
            ) : proyectos.map((p) => {
              const avances = arr(data.avances).filter(a => String(a.proyectoId) === String(p.id)).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
              const bitacora = arr(data.bitacora).filter(b => String(b.proyectoId) === String(p.id)).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
              return (
                <div key={p.id} className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-slate-800">{p.nombre || "(sin nombre)"}</h2>
                      <Badge tone="slate">{p.tipo || "Obra"}</Badge>
                      {p.etapaActual ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#7a5e1e" }}>Etapa: {p.etapaActual}</span> : null}
                    </div>
                    {p.descripcion ? <div className="text-sm text-slate-500 mt-1">{p.descripcion}</div> : null}
                  </div>

                  {/* Avances */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2"><HardHat size={18} /> Avance <span className="text-xs font-normal text-slate-400">(lo ven los codesarrolladores)</span></h3>
                      <Btn variant="outline" onClick={() => nuevoAvance(p.id)}><Plus size={15} /> Avance</Btn>
                    </div>
                    {avances.length === 0 ? (
                      <p className="text-sm text-slate-400">Sin avances. Sube fotos, videos o documentos (por etapa).</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {avances.map((av) => (
                          <div key={av.id} className="rounded-xl border border-slate-200 overflow-hidden">
                            <div className="relative aspect-[4/3] bg-slate-100">
                              {av.tipo === "video" ? (<div className="w-full h-full flex items-center justify-center" style={{ background: "#1a1409" }}><PlayCircle size={30} style={{ color: "#d4be8a" }} /></div>)
                                : av.tipo === "documento" ? (<div className="w-full h-full flex items-center justify-center" style={{ background: "#f5f1ea" }}><FileText size={30} style={{ color: "#c9a96e" }} /></div>)
                                  : (<img src={driveImg(av.url)} alt={av.titulo || "Avance"} loading="lazy" className="w-full h-full object-cover" />)}
                              {av.etapa ? <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full bg-black/55 text-white">{av.etapa}</span> : null}
                            </div>
                            <div className="p-2">
                              <div className="text-xs font-medium text-slate-700 truncate">{av.titulo || "(sin titulo)"}</div>
                              <div className="text-[10px] text-slate-400">{fmtFecha(av.fecha)}</div>
                              <div className="flex justify-end gap-1 mt-1">
                                {av.url ? <a href={av.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-[#b8965a] p-1"><ExternalLink size={13} /></a> : null}
                                <IconBtn onClick={() => setModal({ tab: "Avances", esNuevo: false, row: { ...av } })} icon={Pencil} title="Editar" />
                                <IconBtn onClick={() => setConfirm({ tab: "Avances", key: av.id, msg: `Se eliminara el avance "${av.titulo || av.id}".` })} icon={Trash2} title="Eliminar" danger />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bitacora */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-slate-800 flex items-center gap-2"><MessageCircle size={18} /> Bitacora</h3>
                      <Btn variant="outline" onClick={() => nuevaNota(p.id)}><Plus size={15} /> Nota</Btn>
                    </div>
                    {bitacora.length === 0 ? (
                      <p className="text-sm text-slate-400">Sin notas. Agrega actualizaciones o respuestas para los codesarrolladores.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {bitacora.map((b) => (
                          <li key={b.id} className="py-2.5 flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-slate-400">{fmtFecha(b.fecha)}</span>
                                {b.etiqueta ? <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#7a5e1e" }}>{b.etiqueta}</span> : null}
                                {b.autor ? <span className="text-[11px] text-slate-400">· {b.autor}</span> : null}
                              </div>
                              {b.titulo ? <div className="text-sm font-medium text-slate-700 mt-0.5">{b.titulo}</div> : null}
                              <div className="text-sm text-slate-600">{b.nota}</div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <IconBtn onClick={() => setModal({ tab: "Bitacora", esNuevo: false, row: { ...b } })} icon={Pencil} title="Editar" />
                              <IconBtn onClick={() => setConfirm({ tab: "Bitacora", key: b.id, msg: "Se eliminara esta nota." })} icon={Trash2} title="Eliminar" danger />
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>

      {guardando && <div className="fixed bottom-5 right-5 z-[90] bg-slate-900 text-white px-3 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg"><Spinner size={14} /> Guardando...</div>}

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal ? `${modal.esNuevo ? "Nuevo" : "Editar"} · ${modal.tab === "Avances" ? "avance" : "nota"}` : ""}>
        {modal && <AsesorFormBody modal={modal} clave={clave} guardando={guardando} onCancelar={() => setModal(null)} onGuardar={(row) => guardar(modal.tab, row)} />}
      </Modal>

      <ConfirmDialog open={!!confirm} title="Confirmar eliminacion" message={confirm?.msg} onCancel={() => setConfirm(null)} onConfirm={() => eliminar(confirm.tab, confirm.key)} />
    </div>
  );
}

function AsesorFormBody({ modal, clave, guardando, onCancelar, onGuardar }) {
  const [row, setRow] = useState(modal.row);
  const valido = modal.tab === "Avances"
    ? !!(row.proyectoId && row.url && (row.titulo || row.tipo))
    : !!(row.proyectoId && row.nota);
  return (
    <div>
      {modal.tab === "Avances" ? <AvanceForm value={row} onChange={setRow} auth={{ clave }} /> : <BitacoraForm value={row} onChange={setRow} />}
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
        <Btn variant="outline" onClick={onCancelar}>Cancelar</Btn>
        <Btn onClick={() => onGuardar(row)} disabled={!valido || guardando}>{guardando ? <Spinner /> : <Save size={16} />} Guardar</Btn>
      </div>
    </div>
  );
}

// ===================================================================
// CODESARROLLADOR: MODALES DE AUTOSERVICIO / DUDA / INVITAR
// ===================================================================
function MiCuentaModal({ clave, inv, onClose, onClaveCambiada, notificar }) {
  const [email, setEmail] = useState(inv?.email || "");
  const [telefono, setTelefono] = useState(inv?.telefono || "");
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [nueva, setNueva] = useState("");
  const [confirma, setConfirma] = useState("");
  const [cambiando, setCambiando] = useState(false);
  const [err, setErr] = useState("");

  const guardarDatos = async () => {
    if (!BACKEND_LISTO) { notificar("Vista previa: conecta el backend para guardar de verdad.", "info"); return; }
    setErr(""); setGuardandoDatos(true);
    try {
      await apiCall("actualizarMisDatos", { clave, email, telefono });
      notificar("Tus datos se guardaron.", "ok");
    } catch (e) { setErr(e.message || "No se pudieron guardar tus datos."); }
    finally { setGuardandoDatos(false); }
  };

  const cambiar = async () => {
    if (!BACKEND_LISTO) { notificar("Vista previa: conecta el backend para cambiar la contrasena de verdad.", "info"); return; }
    setErr("");
    if (nueva.length < 6) { setErr("La nueva contrasena debe tener al menos 6 caracteres."); return; }
    if (nueva !== confirma) { setErr("Las contrasenas no coinciden."); return; }
    setCambiando(true);
    try {
      await apiCall("cambiarClave", { clave, nuevaClave: nueva });
      notificar("Tu contrasena se cambio.", "ok");
      setNueva(""); setConfirma("");
      onClaveCambiada(nueva); // actualiza la sesion para que siga funcionando
      onClose();
    } catch (e) { setErr(e.message || "No se pudo cambiar la contrasena."); }
    finally { setCambiando(false); }
  };

  return (
    <Modal open onClose={onClose} title="Mi cuenta" width="max-w-lg">
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-700">Mis datos de contacto</div>
          <Field label="Correo"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" /></Field>
          <Field label="Telefono"><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="10 digitos" /></Field>
          <Btn onClick={guardarDatos} disabled={guardandoDatos}>{guardandoDatos ? <Spinner /> : <Save size={15} />} Guardar mis datos</Btn>
        </div>
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <div className="text-sm font-semibold text-slate-700">Cambiar mi contrasena</div>
          <Field label="Nueva contrasena" hint="Minimo 6 caracteres."><Input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} /></Field>
          <Field label="Confirmar contrasena"><Input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} /></Field>
          <Btn variant="gold" onClick={cambiar} disabled={cambiando || !nueva || !confirma}>{cambiando ? <Spinner /> : <KeyRound size={15} />} Cambiar contrasena</Btn>
        </div>
        {err && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {err}</p>}
      </div>
    </Modal>
  );
}

function DudaModal({ clave, onClose, notificar }) {
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const enviar = async () => {
    if (!BACKEND_LISTO) { notificar("Vista previa: conecta el backend para enviar de verdad.", "info"); onClose(); return; }
    setErr("");
    if (!mensaje.trim()) { setErr("Escribe tu mensaje."); return; }
    setEnviando(true);
    try {
      await apiCall("enviarMensaje", { clave, mensaje });
      notificar("Tu mensaje se envio. Te responderemos pronto.", "ok");
      onClose();
    } catch (e) { setErr(e.message || "No se pudo enviar."); }
    finally { setEnviando(false); }
  };
  return (
    <Modal open onClose={onClose} title="Escribenos tu duda" width="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Cuentanos tu duda y te responderemos por correo. Escribe con confianza.</p>
        <Field label="Tu mensaje"><Textarea rows={5} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Hola, tengo una duda sobre..." autoFocus /></Field>
        {err && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {err}</p>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="text-sm text-slate-500 px-3">Cancelar</button><Btn onClick={enviar} disabled={enviando || !mensaje.trim()}>{enviando ? <Spinner /> : <MessageCircle size={15} />} Enviar</Btn></div>
      </div>
    </Modal>
  );
}

function InvitarModal({ clave, nombre, onClose, notificar }) {
  const mensajeWA = `${nombre ? nombre + " te invita 👇\n\n" : ""}Estoy co-invirtiendo con YoDesarrollo (bienes raices con escritura) y me ha ido muy bien. Si entras con mi invitacion, ganamos los dos. Mira aqui: ${SITIO_URL}${nombre ? `\n\n(Diles que te invito ${nombre}.)` : ""}`;
  const [nombreProspecto, setNombre] = useState("");
  const [contacto, setContacto] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const enviar = async () => {
    if (!BACKEND_LISTO) { notificar("Vista previa: conecta el backend para enviar de verdad.", "info"); onClose(); return; }
    setErr("");
    if (!nombreProspecto.trim()) { setErr("Pon el nombre de quien quieres invitar."); return; }
    setEnviando(true);
    try {
      await apiCall("registrarReferido", { clave, nombreProspecto, contacto, nota });
      notificar("¡Gracias! Recibimos tu invitacion y le daremos seguimiento.", "ok");
      onClose();
    } catch (e) { setErr(e.message || "No se pudo enviar la invitacion."); }
    finally { setEnviando(false); }
  };
  return (
    <Modal open onClose={onClose} title="Invita y gana +1%" width="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg,#d4be8a 0%,#c9a96e 100%)" }}>
          <div className="font-display text-lg" style={{ color: "#1a1409" }}>+1% para ti</div>
          <div className="text-xs mt-0.5" style={{ color: "#5c4a24" }}>Si invitas a alguien y participa, recibes <b>+1% adicional</b> sobre tu aportacion al momento de la devolucion de tu capital.</div>
        </div>
        <Btn variant="success" className="w-full" onClick={() => compartirTexto(mensajeWA)}><MessageCircle size={16} /> Compartir mi invitacion por WhatsApp</Btn>
        <div className="text-center text-[11px] text-slate-400">— o registra a tu invitado y nosotros lo contactamos —</div>
        <Field label="Nombre de tu invitado"><Input value={nombreProspecto} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" autoFocus /></Field>
        <Field label="Su WhatsApp o correo" hint="Para poderlo contactar."><Input value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="WhatsApp o correo" /></Field>
        <Field label="Nota (opcional)"><Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Algo que debamos saber" /></Field>
        {err && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {err}</p>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="text-sm text-slate-500 px-3">Cancelar</button><Btn variant="gold" onClick={enviar} disabled={enviando || !nombreProspecto.trim()}>{enviando ? <Spinner /> : <Sparkles size={15} />} Enviar invitacion</Btn></div>
      </div>
    </Modal>
  );
}

// Explica al codesarrollador, en lenguaje simple, como se calcula SU valor segun el modelo.
function ComoCalculaModal({ info, onClose }) {
  const r = (info && info.rend) || {};
  let cuerpo;
  if (r.modo === "plusvalia") {
    cuerpo = (
      <>
        <p>Tu inversion es en <b>terreno</b>: su valor sube por <b>etapas de precio</b> conforme avanza el proyecto.</p>
        <p className="mt-2">Entraste a <b>{money(r.precioEntrada)}/m²</b> y hoy <b>{info.proyectoNombre}</b> va en la etapa <b>{r.etapaActualLabel}</b>{r.precioActual ? <> (<b>{money(r.precioActual)}/m²</b>)</> : null}.</p>
        {/* La escalera con su denominador: en que escalon vamos, cuantos tramites
            sostienen cada uno, y como se llaman las puertas que faltan. Es el mismo
            dato del board de tramites; aqui deja de ser invisible. */}
        {info.escalera && info.escalera.length ? (
          <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
            {info.escalera.map((e) => {
              const esHoy = e.hito_id === info.etapaActualId;
              const listo = e.total > 0 && e.verde === e.total;
              return (
                <div key={e.hito_id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 last:border-0"
                  style={{ background: esHoy ? "rgba(201,169,110,0.10)" : undefined }}>
                  <div className="min-w-0">
                    <div className="text-sm" style={{ color: esHoy ? "#7a5e1e" : "#475569", fontWeight: esHoy ? 600 : 400 }}>
                      {e.nombre || e.hito_id}{esHoy ? " · aqui vamos" : ""}
                    </div>
                    {e.total > 0 ? (
                      <div className="text-[11px]" style={{ color: listo ? "#15803d" : e.verde === 0 ? "#b91c1c" : "#94a3b8" }}>
                        {e.verde} de {e.total} tramites {listo ? "· completa" : "completados"}
                      </div>
                    ) : null}
                  </div>
                  {e.precio_m2 ? <div className="text-sm tabular-nums text-slate-500 whitespace-nowrap">{money(e.precio_m2)}/m²</div> : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {info.puertas && info.puertas.length ? (
          <div className="mt-2 text-xs text-slate-500">
            <b className="text-slate-700">Lo que falta para cerrar esta etapa:</b> {info.puertas.join(" · ")}
          </div>
        ) : null}
        {r.conAnual ? (
          <>
            <p className="mt-2">Tu contrato te da <b>las dos cosas juntas</b>, y se suman:</p>
            <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
                <span><b>1 · Plusvalia del terreno</b><br /><span className="text-xs text-slate-400">lo aportado × (precio de hoy ÷ tu precio de entrada)</span></span>
                <span className="font-semibold tabular-nums whitespace-nowrap ml-3">{money(r.gananciaPlus)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100">
                <span><b>2 · Rendimiento anual {pct(r.tasa)}</b><br /><span className="text-xs text-slate-400">sobre tu capital, contado por dia · llevas {r.dias} dias</span></span>
                <span className="font-semibold tabular-nums whitespace-nowrap ml-3">{money(r.gananciaAnual)}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50">
                <span><b>Ganancia a hoy</b></span>
                <span className="font-semibold tabular-nums whitespace-nowrap ml-3" style={{ color: "#8a6d1e" }}>{money(r.ganancia)}</span>
              </div>
            </div>
            <p className="mt-2">Cuando el proyecto sube de etapa, sube la parte 1; la parte 2 crece sola con los dias.</p>
          </>
        ) : (
          <p className="mt-2">Por eso: <b>valor hoy = lo que aportaste × (precio actual ÷ tu precio de entrada)</b>. Cuando el proyecto sube de etapa, tu valor sube tambien.</p>
        )}
      </>
    );
  } else if (r.modo === "tramos") {
    cuerpo = (
      <>
        <p>Tu ganancia es un <b>porcentaje fijo segun el mes en que se venda la propiedad</b> (no es una tasa anual).</p>
        <p className="mt-2">Hoy, si se vendiera, te corresponderia <b>+{pct(r.rendimientoPct)}</b> sobre tu capital. Mientras mas avanza el plazo, mayor el porcentaje del tramo.</p>
      </>
    );
  } else {
    cuerpo = (
      <>
        <p>Tu capital gana una <b>tasa preferente anual de {pct(r.tasa)}</b>, contada <b>por dia</b> desde que inicio tu inversion.</p>
        <p className="mt-2">Hoy llevas <b>{r.dias} dias</b>, por eso tu valor sube poco a poco. El "total al final" es lo que recibirias al completar tus aportaciones y llegar el plazo.</p>
      </>
    );
  }
  return (
    <Modal open onClose={onClose} title="¿Como se calcula tu valor?" width="max-w-lg">
      <div className="text-sm text-slate-600 leading-relaxed">{cuerpo}</div>
      <div className="mt-3 text-xs text-slate-400">Las cifras son estimadas a hoy. Tu rendimiento se realiza al vender o devolver el capital, segun tu contrato.</div>
      <div className="flex justify-end mt-5"><Btn onClick={onClose}>Entendido</Btn></div>
    </Modal>
  );
}

// ===================================================================
// VISTA INVERSIONISTA (Fase 2 — solo lectura)
// ===================================================================
function InvestorApp({ clave, onLogout, onClaveCambiada }) {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Pagos reportados por el inversionista (en vista previa se guardan localmente;
  // al conectar el backend, esto llamara a la accion reportarPago).
  const [reportes, setReportes] = useState({});
  const [reportando, setReportando] = useState(null);
  const [refDraft, setRefDraft] = useState("");
  const [compDraft, setCompDraft] = useState("");
  const [montoDraft, setMontoDraft] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [panel, setPanel] = useState(null); // 'cuenta' | 'duda' | 'invitar'
  const [comoModal, setComoModal] = useState(null); // { rend, proyectoNombre }
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const notificar = useCallback((msg, tipo = "info") => {
    setToast({ msg, tipo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    if (!BACKEND_LISTO) { setData(DEMO_DATA); setCargando(false); return; }
    try {
      const res = await apiCall("getMine", { clave });
      setData(res.data);
    } catch (err) {
      setError(err.message || "No se pudo cargar tu cartera.");
      // Si la clave ya no es valida (la rotaron), cerrar sesion para no quedar atorado.
      if (esErrorCredenciales(err.message)) { setError("Tu acceso cambio. Vuelve a entrar."); setTimeout(() => onLogout(), 1500); }
    } finally {
      setCargando(false);
    }
  }, [clave, onLogout]);

  useEffect(() => { cargar(); }, [cargar]);

  // Reporta el pago: en linea lo guarda en el backend; en vista previa, local.
  const enviarReporte = async (apId) => {
    if (BACKEND_LISTO) {
      try {
        await apiCall("reportarPago", { clave, id: apId, referencia: refDraft, comprobanteUrl: compDraft, montoReportado: montoDraft });
        setReportando(null); setRefDraft(""); setCompDraft(""); setMontoDraft("");
        cargar();
      } catch (err) { setError(err.message || "No se pudo reportar el pago."); }
    } else {
      setReportes(prev => ({ ...prev, [apId]: { fechaReporte: todayISO(), referencia: refDraft, comprobanteUrl: compDraft, montoReportado: montoDraft } }));
      setReportando(null); setRefDraft(""); setCompDraft(""); setMontoDraft("");
    }
  };

  const inv = data?.inversionista;
  const inversiones = arr(data?.inversiones);
  const aportaciones = arr(data?.aportaciones);
  const proyectos = arr(data?.proyectos);
  const documentos = arr(data?.documentos);

  const proyectoPorId = (id) => proyectos.find(p => String(p.id) === String(id));
  const aportacionesDeFolio = (folio) => aportaciones.filter(a => String(a.folio) === String(folio)).sort((a, b) => num(a.numeroPago) - num(b.numeroPago));

  // Resumen consolidado del portafolio (solo aplica con 2+ inversiones).
  // Reutiliza el MISMO calculo por-inversion del hero individual (fechaFin =
  // fechaSalida || hoy, calcularRendimiento) para que los totales cuadren.
  const portafolio = useMemo(() => {
    if (inversiones.length < 2) return null;
    let totalInvertido = 0, valorHoy = 0, totalFinal = 0, enConfig = 0;
    const proyectosSet = new Set();
    inversiones.forEach((iv) => {
      const recibidoIv = aportacionesDeFolio(iv.folio).filter(a => estadoAportacion(a) === "Recibida").reduce((s, a) => s + num(a.monto), 0);
      const rend = calcularRendimientoInversion(iv, recibidoIv, data?.preciosPlusvalia, proyectoPorId(iv.proyectoId));
      // No mezclar: las inversiones plusvalia sin precio aun no tienen valor; se excluyen del consolidado.
      if (rend.modo === "plusvalia" && rend.sinPrecios) { enConfig++; if (iv.proyectoId) proyectosSet.add(String(iv.proyectoId)); return; }
      totalInvertido += rend.recibido;
      valorHoy += rend.totalARecibir;
      totalFinal += rend.totalFinal;
      if (iv.proyectoId != null && String(iv.proyectoId).trim()) proyectosSet.add(String(iv.proyectoId));
    });
    const gananciaTotal = valorHoy - totalInvertido; // puede ser negativo (se muestra tal cual, sin esconder)
    const rendimientoPonderado = totalInvertido > 0 ? (gananciaTotal / totalInvertido) * 100 : 0;
    return {
      totalInvertido,
      valorHoy,
      totalFinal,
      gananciaTotal,
      rendimientoPonderado,
      enConfig,
      numInversiones: inversiones.length,
      numProyectos: proyectosSet.size,
    };
  }, [inversiones, aportaciones]);

  return (
    <div className="min-h-screen" style={{ background: "#f5f1ea" }}>
      <Toast toast={toast} />
      <header style={{ background: "#0a0a0c" }}>
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <img src={logoWhite} alt="YODESARROLLO.MX" className="h-6 w-auto" style={{ mixBlendMode: "screen" }} />
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setPanel("cuenta")} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 min-h-[40px] rounded-lg text-white/80 hover:text-white transition" style={{ background: "rgba(255,255,255,0.08)" }}>
              <KeyRound size={14} /> <span className="hidden sm:inline">Mi cuenta</span>
            </button>
            <button onClick={onLogout} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 min-h-[40px] rounded-lg text-white/80 hover:text-white transition" style={{ background: "rgba(255,255,255,0.08)" }}>
              <LogOut size={14} /> Salir
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {cargando && (
          <div className="flex items-center gap-2 text-slate-500 text-sm justify-center py-10"><Spinner /> Cargando tu cartera...</div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={() => cargar()} className="shrink-0 underline font-medium hover:text-red-900">Reintentar</button>
          </div>
        )}

        {/* La cartera se sigue mostrando aunque haya un error, siempre que ya tengamos
            datos cargados. Antes cualquier fallo (un pago que no se pudo reportar, un
            comprobante que no abrio) vaciaba la pantalla completa y dejaba al
            codesarrollador con una barra roja y nada mas, sin forma de reintentar. */}
        {!cargando && data && (
          <>
            <div className="mb-1">
              <div className="text-2xl font-display text-slate-900">Hola, {(inv?.nombre || "").split(" ")[0] || "Codesarrollador"}</div>
              <div className="text-sm text-slate-500">Este es el resumen de tu aportacion en YoDesarrollo.</div>
            </div>

            {/* RESUMEN CONSOLIDADO DEL PORTAFOLIO (solo con 2+ inversiones) */}
            {portafolio && (
              <div className="rounded-3xl p-6 shadow-lg" style={{ background: "linear-gradient(160deg,#221a0f 0%,#1a1409 55%,#0a0a0c 100%)" }}>
                <div className="text-[11px] tracking-[0.22em] uppercase mb-3 text-center" style={{ color: "#c9a96e" }}>Tu portafolio</div>
                <div className="text-center">
                  <div className="text-sm text-white/50">Valor estimado hoy</div>
                  <div className="font-display leading-none mt-1" style={{ color: "#e0c590", fontSize: "2.9rem" }}>{money(portafolio.valorHoy)}</div>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#d4be8a" }}>
                    <TrendingUp size={15} /> +{pct(portafolio.rendimientoPonderado)} estimado
                  </div>
                  <div className="text-xs text-white/40 mt-3">{portafolio.numProyectos} {portafolio.numProyectos === 1 ? "proyecto" : "proyectos"} · invertiste {money(portafolio.totalInvertido)} · ganancia estimada {money(portafolio.gananciaTotal)}</div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-5">
                  <div className="rounded-2xl p-2.5 text-center min-w-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>Invertido</div>
                    <div className="text-[13px] sm:text-sm font-semibold tabular-nums leading-tight text-white mt-0.5 break-words">{money(portafolio.totalInvertido)}</div>
                  </div>
                  <div className="rounded-2xl p-2.5 text-center min-w-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>Ganancia</div>
                    <div className="text-[13px] sm:text-sm font-semibold tabular-nums leading-tight mt-0.5 break-words" style={{ color: "#d4be8a" }}>{money(portafolio.gananciaTotal)}</div>
                  </div>
                  <div className="rounded-2xl p-2.5 text-center min-w-0" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.45)" }}>Inversiones</div>
                    <div className="text-[13px] sm:text-sm font-semibold tabular-nums leading-tight text-white mt-0.5">{portafolio.numInversiones}</div>
                  </div>
                </div>
              </div>
            )}

            {inversiones.length === 0 ? (
              <div>
                <EmptyState icon={Wallet} texto="Aun no tienes inversiones registradas. Escribenos y con gusto te ayudamos." />
                <div className="text-center mt-3"><Btn variant="gold" onClick={() => setPanel("duda")}><MessageCircle size={15} /> Escribenos</Btn></div>
              </div>
            ) : inversiones.map((iv) => {
              const proyecto = proyectoPorId(iv.proyectoId);
              const aps = aportacionesDeFolio(iv.folio).map(a => reportes[a.id] ? { ...a, ...reportes[a.id] } : a);
              const recibido = aps.filter(a => estadoAportacion(a) === "Recibida").reduce((s, a) => s + num(a.monto), 0);
              const monto = num(iv.montoTotal);
              const rend = calcularRendimientoInversion(iv, recibido, data?.preciosPlusvalia, proyecto);
              const ganancia = rend.ganancia;
              const pagosRecibidos = aps.filter(a => estadoAportacion(a) === "Recibida").length;
              const proximo = aps.find(a => estadoAportacion(a) !== "Recibida");
              // Aportaciones YA VENCIDAS: la tarjeta "Tu proximo paso" solo miraba la
              // primera pendiente y la anunciaba en futuro ("vence 03 jul 2026") aunque
              // la fecha ya hubiera pasado, y pedia el monto de una sola cuando el adeudo
              // real eran varias. Aqui se calcula el atraso completo.
              const vencidas = aps.filter(a => estadoAportacion(a) === "Vencida");
              const montoVencido = vencidas.reduce((s, a) => s + num(a.monto), 0);
              const proximoVencido = proximo ? estadoAportacion(proximo) === "Vencida" : false;
              const progresoPct = monto > 0 ? Math.min(100, Math.round((recibido / monto) * 100)) : 0;
              const docs = documentos.filter(d => String(d.folio) === String(iv.folio));
              const liquidada = (iv.estado || "Activa") === "Liquidada";
              const avances = arr(data?.avances).filter(a => String(a.proyectoId) === String(iv.proyectoId)).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
              // Bitacora: SOLO las notas marcadas como visibles para el cliente.
              // Es por PROYECTO, asi que sin este filtro toda nota interna del asesor
              // (negociaciones, "no se vende", exclusivas) le llega a cada codesarrollador.
              // Sin valor = interna. Se publica marcando visibilidad='cliente' desde el admin.
              const bitacora = arr(data?.bitacora)
                .filter(b => String(b.proyectoId) === String(iv.proyectoId))
                .filter(b => String(b.visibilidad || "").trim().toLowerCase() === "cliente")
                .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
              return (
                <div key={iv.folio} className="space-y-4">
                  {/* HERO: cuanto vale hoy tu inversion */}
                  <div className="rounded-3xl p-6 text-center shadow-lg" style={{ background: "linear-gradient(160deg,#221a0f 0%,#1a1409 55%,#0a0a0c 100%)" }}>
                    <div className="text-[11px] tracking-[0.22em] uppercase mb-3" style={{ color: "#c9a96e" }}>{proyecto?.nombre || "Tu inversion"} · {iv.folio}</div>
                    <div className="text-sm text-white/50">{liquidada ? "Tu inversion se liquido en" : "Valor estimado hoy de tu inversion"}</div>
                    <div className="font-display leading-none mt-1" style={{ color: "#e0c590", fontSize: "2.9rem" }}>{money(rend.totalARecibir)}</div>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#d4be8a" }}>
                      <TrendingUp size={15} /> {rend.modo === "plusvalia" ? (rend.sinPrecios ? <>Plusvalia en configuracion</> : <>+{pct(rend.rendimientoPct)} · etapa {rend.etapaActualLabel}</>) : rend.modo === "tramos" ? (liquidada ? <>+{pct(rend.rendimientoPct)} al vender (mes {rend.mesFin})</> : <>+{pct(rend.rendimientoPct)} si se vende hoy</>) : <>+{pct(rend.rendimientoPct)} · {rend.dias} dias</>}
                    </div>
                    <div className="text-xs text-white/40 mt-3">Aportado hasta hoy {money(recibido)}{recibido < monto ? ` · comprometido ${money(monto)}` : ""} · ganancia a hoy {money(ganancia)}</div>
                    {rend.conAnual ? (
                      <div className="text-[11px] text-white/40 mt-0.5">Plusvalia {money(rend.gananciaPlus)} + rendimiento anual {pct(rend.tasa)} {money(rend.gananciaAnual)}</div>
                    ) : null}
                    {/* El DENOMINADOR de la etapa. Anunciar "etapa Preventa I" sin decir
                        cuantos tramites la sostienen es media verdad; el dato ya viaja
                        desde el board de tramites, solo hay que no esconderlo. */}
                    {proyecto?.tramitesEtapa && num(proyecto.tramitesEtapa.total) > 0 ? (
                      <div className="text-[11px] mt-1.5" style={{ color: proyecto.tramitesEtapa.verde === 0 ? "rgba(252,165,165,0.85)" : "rgba(201,169,110,0.8)" }}>
                        Esta etapa lleva <b>{proyecto.tramitesEtapa.verde} de {proyecto.tramitesEtapa.total}</b> tramites completados
                      </div>
                    ) : null}
                    {!liquidada ? <div className="text-[10px] text-white/30 mt-1">Es una estimacion al dia de hoy, no dinero disponible para retirar; se realiza al vender o devolver tu capital.</div> : null}
                    <button onClick={() => setComoModal({
                      rend,
                      proyectoNombre: proyecto?.nombre || "tu inversion",
                      escalera: arr(proyecto?.escaleraTramites),
                      etapaActualId: proyecto?.etapaPrecio || "",
                      puertas: arr(proyecto?.tramitesEtapa?.puertas),
                    })} className="mt-2 text-[11px] inline-flex items-center gap-1 underline" style={{ color: "rgba(201,169,110,0.9)" }}><AlertCircle size={12} /> ¿Como se calcula mi valor?</button>
                    {!liquidada && rend.totalFinal > rend.totalARecibir && !(rend.modo === "plusvalia" && rend.sinPrecios) ? (
                      <div className="mt-2 text-[11px]" style={{ color: "rgba(201,169,110,0.85)" }}>{rend.modo === "plusvalia" ? <>Al vender (etapa {rend.etapaProyLabel}): ≈ {money(rend.totalFinal)} (+{pct(rend.rendPctFinal)})</> : rend.modo === "tramos" ? <>Al vender la casa (mes {rend.mesFin}): ≈ {money(rend.totalFinal)} (+{pct(rend.rendPctFinal)})</> : <>Al completar tu inversion{iv.fechaSalida ? ` (al ${fmtFecha(iv.fechaSalida)})` : ""}: ≈ {money(rend.totalFinal)}</>}</div>
                    ) : null}

                    <div className="mt-5 text-left">
                      <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                        <span>{pagosRecibidos} de {aps.length} aportaciones</span>
                        <span>{money(recibido)} de {money(monto)}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${progresoPct}%`, background: "linear-gradient(90deg,#c9a96e,#e0c590)" }} />
                      </div>
                    </div>
                  </div>

                  {/* TU PROXIMO PASO */}
                  {!liquidada && proximo && estadoAportacion(proximo) === "En aprobacion" ? (
                    <div className="bg-white rounded-2xl border p-5 shadow-sm" style={{ borderColor: "#bfdbfe" }}>
                      <div className="flex items-center gap-2 mb-1"><Clock size={16} className="text-blue-600" /><div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Pago en validacion</div></div>
                      <div className="text-lg font-semibold text-slate-800">Reportaste {money(proximo.montoReportado || proximo.monto)}</div>
                      <div className="text-sm text-slate-500 mt-0.5">{proximo.referencia ? <>Referencia: <b>{proximo.referencia}</b>. </> : null}Lo estamos validando; te avisaremos en cuanto quede como <b>Recibido</b>.</div>
                      <div className="mt-2"><VerComprobante comprobante={proximo.comprobanteUrl} id={proximo.id} auth={{ clave }} label="Ver mi comprobante" /></div>
                    </div>
                  ) : !liquidada && proximo ? (
                    <div className="bg-white rounded-2xl border p-5 shadow-sm" style={{ borderColor: proximoVencido ? "#fca5a5" : "#e2e8f0" }}>
                      <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: proximoVencido ? "#b91c1c" : "#94a3b8" }}>
                        {proximoVencido ? (vencidas.length > 1 ? `Tienes ${vencidas.length} aportaciones vencidas` : "Tienes una aportacion vencida") : "Tu proximo paso"}
                      </div>
                      <div className="flex items-baseline justify-between flex-wrap gap-1">
                        <div className="text-xl font-semibold text-slate-800">Deposita {money(proximoVencido ? montoVencido : proximo.monto)}</div>
                        <div className="text-sm text-slate-500">
                          {proximo.concepto || `Aportacion ${proximo.numeroPago}`}
                          {proximoVencido ? <> · vencio el {fmtFecha(proximo.fechaProgramada)}</> : <> · vence {fmtFecha(proximo.fechaProgramada)}</>}
                        </div>
                      </div>
                      {proximoVencido && vencidas.length > 1 ? (
                        <div className="text-xs text-red-700 mt-1">Suma de las {vencidas.length} aportaciones vencidas. La mas antigua vencio el {fmtFecha(vencidas[0].fechaProgramada)}.</div>
                      ) : null}
                      {proyecto && (proyecto.clabe || proyecto.cuenta) ? (
                        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                            <DatoBanco label="Banco" valor={proyecto.banco} />
                            <DatoBanco label="Beneficiario" valor={proyecto.beneficiario} />
                            <DatoBanco label="CLABE" valor={proyecto.clabe} copiable mono />
                            <DatoBanco label="Cuenta" valor={proyecto.cuenta} copiable />
                          </div>
                          {proyecto.conceptoBase ? <div className="mt-2 text-xs text-slate-400">Concepto sugerido: {proyecto.conceptoBase}</div> : null}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
                          <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-800">
                            <div className="font-semibold">Cuenta de deposito en proceso</div>
                            <div className="mt-0.5 text-amber-700">Estamos confirmando los datos bancarios de este proyecto. Por favor escribenos antes de depositar para darte la cuenta correcta.</div>
                          </div>
                        </div>
                      )}
                      {reportando === proximo.id ? (
                        <div className="mt-3 rounded-xl border border-slate-200 p-3 space-y-2">
                          <div className="text-sm font-medium text-slate-700">Reportar mi pago</div>
                          <Field label="¿Cuanto depositaste?" hint="Si pagaste un monto distinto al sugerido, ponlo aqui.">
                            <Input type="number" value={montoDraft} onChange={(e) => setMontoDraft(e.target.value)} placeholder={String(proximo.monto || "")} />
                          </Field>
                          <Input value={refDraft} onChange={(e) => setRefDraft(e.target.value)} placeholder="Numero de referencia / clave de rastreo" />
                          <FileUpload auth={{ clave }} privado onSubido={(fileId) => setCompDraft(fileId)} nota="Sube la foto de tu comprobante (queda privado: solo tu y el equipo)." />
                          <Input value={compDraft} onChange={(e) => setCompDraft(e.target.value)} placeholder="Se llena solo al subir (o pega un enlace)" />
                          <div className="flex items-center gap-2">
                            <Btn variant="gold" disabled={!montoDraft || Number(montoDraft) <= 0} onClick={() => enviarReporte(proximo.id)}><Check size={15} /> Enviar reporte</Btn>
                            <button onClick={() => setReportando(null)} className="text-sm text-slate-500 px-2">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setReportando(proximo.id); setRefDraft(""); setCompDraft(""); setMontoDraft(String(proximo.monto || "")); }} className="mt-3 w-full inline-flex items-center justify-center gap-2 font-semibold text-sm rounded-xl py-3 transition hover:brightness-110" style={{ background: "#1a1409", color: "#e0c590" }}>
                          <CheckCircle2 size={16} /> Ya deposite — reportar mi pago
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-emerald-100 p-5 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><BadgeCheck size={24} className="text-emerald-600" /></div>
                        <div>
                          <div className="font-semibold text-slate-800">{liquidada ? "Inversion liquidada" : "Estas al dia"}</div>
                          <div className="text-sm text-slate-500">{liquidada ? "Recibiste tu capital + ganancia. Gracias por confiar en YoDesarrollo." : "Completaste todas tus aportaciones. Gracias."}</div>
                        </div>
                      </div>
                      {/* Momento de orgullo: invitar a alguien (+1%). */}
                      <div className="mt-3 pt-3 border-t border-emerald-50 flex items-center justify-between gap-2 flex-wrap">
                        <div className="text-xs text-slate-500">{liquidada ? "¿Te gusto la experiencia? Invita a alguien:" : "¿Contento con tu inversion? Invita y gana +1%:"}</div>
                        <Btn variant="gold" onClick={() => setPanel("invitar")}><Sparkles size={14} /> Invita y gana +1%</Btn>
                      </div>
                    </div>
                  )}

                  {/* AVANCE DE OBRA (galeria de fotos/videos) */}
                  {/* La seccion se pinta SIEMPRE: esconderla cuando no hay avances deja
                      al codesarrollador sin saber si el proyecto no avanza o si el portal
                      no le esta mostrando lo que si hay. */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <HardHat size={17} style={{ color: "#c9a96e" }} />
                        <h3 className="font-semibold text-slate-800">Avance de tu proyecto</h3>
                        {proyecto?.etapaActual ? <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#7a5e1e" }}>Etapa: {proyecto.etapaActual}</span> : null}
                      </div>
                      {avances.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
                          <HardHat size={22} className="mx-auto mb-1.5 text-slate-300" />
                          <div className="text-sm text-slate-600">Todavia no hay avances publicados de este proyecto.</div>
                          <div className="text-xs text-slate-400 mt-0.5">En cuanto se publique una foto o un reporte de obra, lo veras aqui y te avisamos por correo.</div>
                        </div>
                      ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {avances.map((av) => {
                          const esFoto = av.tipo !== "video" && av.tipo !== "documento";
                          const Cont = esFoto ? "button" : "a";
                          const contProps = esFoto ? { type: "button", onClick: () => setLightbox(av) } : { href: av.url || "#", target: "_blank", rel: "noreferrer" };
                          return (
                            <Cont key={av.id} {...contProps} className="group relative block w-full text-left rounded-xl overflow-hidden aspect-[4/3] bg-slate-100">
                              {av.tipo === "video" ? (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: "#1a1409" }}>
                                  <PlayCircle size={36} style={{ color: "#d4be8a" }} />
                                </div>
                              ) : av.tipo === "documento" ? (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{ background: "#f5f1ea" }}>
                                  <FileText size={30} style={{ color: "#c9a96e" }} /><span className="text-[10px] text-slate-500">Documento</span>
                                </div>
                              ) : (
                                <img src={driveImg(av.url)} alt={av.titulo || "Avance"} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" />
                              )}
                              {av.etapa ? <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full bg-black/55 text-white">{av.etapa}</span> : null}
                              <div className="absolute inset-x-0 bottom-0 p-2" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)" }}>
                                <div className="text-[11px] text-white font-medium leading-tight truncate">{av.titulo}</div>
                                <div className="text-[10px] text-white/70">{fmtFecha(av.fecha)}</div>
                              </div>
                            </Cont>
                          );
                        })}
                      </div>
                      )}
                    </div>

                  {/* BITACORA / SEGUIMIENTO DEL ASESOR (linea de tiempo) */}
                  {bitacora.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <MessageCircle size={17} style={{ color: "#c9a96e" }} />
                        <h3 className="font-semibold text-slate-800">Seguimiento del asesor inmobiliario</h3>
                      </div>
                      <ol className="relative border-l border-slate-200 ml-1.5 space-y-5">
                        {bitacora.map((b) => (
                          <li key={b.id} className="ml-4">
                            <span className="absolute -left-[7px] mt-1 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: "#c9a96e" }} />
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-400">{fmtFecha(b.fecha)}</span>
                              {b.etiqueta ? <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#7a5e1e" }}>{b.etiqueta}</span> : null}
                            </div>
                            {b.titulo ? <div className="text-sm font-semibold text-slate-800 mt-0.5">{b.titulo}</div> : null}
                            <div className="text-sm text-slate-600 mt-0.5">{b.nota}</div>
                            {b.autor ? <div className="text-xs text-slate-400 mt-1">— {b.autor}</div> : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* MI EXPEDIENTE — tarjeta propia y SIEMPRE visible.
                      Antes los documentos vivian escondidos dentro del acordeon y ademas
                      se ocultaban por completo si no habia ninguno: quien puso millones no
                      veia ni una palabra de su contrato, y no habia forma de distinguir
                      "no hay documentos" de "el portal no me los muestra". */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText size={17} style={{ color: "#c9a96e" }} />
                      <h3 className="font-semibold text-slate-800">Mi expediente</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full ml-auto" style={{ background: "rgba(201,169,110,0.16)", color: "#7a5e1e" }}>{docs.length} {docs.length === 1 ? "documento" : "documentos"}</span>
                    </div>
                    {docs.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
                        <FileText size={22} className="mx-auto mb-1.5 text-slate-300" />
                        <div className="text-sm text-slate-600">Todavia no tienes documentos publicados en el portal.</div>
                        <div className="text-xs text-slate-400 mt-0.5">Aqui apareceran tu contrato de co-desarrollo, tu promesa de pago y el material del proyecto.</div>
                        <button onClick={() => setPanel("duda")} className="mt-2.5 text-xs underline" style={{ color: "#b8965a" }}>Solicitar mis documentos</button>
                      </div>
                    ) : (
                      <ul className="space-y-1.5">
                        {docs.map((d) => (
                          <li key={d.id} className="flex items-center gap-2.5 text-sm rounded-lg px-2.5 py-2 border border-slate-100 bg-slate-50/50">
                            <FileText size={15} className="shrink-0" style={{ color: "#c9a96e" }} />
                            <span className="text-slate-700 truncate flex-1">{d.nombre || d.tipo}</span>
                            {d.tipo ? <span className="text-[10px] text-slate-400 hidden sm:inline">{d.tipo}</span> : null}
                            {d.url
                              ? <a href={d.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-[#b8965a] shrink-0" title="Abrir"><Link2 size={15} /></a>
                              : <span className="text-[10px] text-amber-600 shrink-0">sin archivo</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* DETALLE (secundario, colapsado) */}
                  <details className="bg-white rounded-2xl border border-slate-200 p-5 group shadow-sm">
                    <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-slate-700">
                      <span className="flex items-center gap-2"><Calendar size={15} className="text-slate-400" /> Detalle de mis aportaciones</span>
                      <ChevronDown size={16} className="text-slate-400 group-open:rotate-180 transition" />
                    </summary>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm min-w-0 sm:min-w-[420px]">
                        <tbody>
                          {aps.map((a) => (
                            <tr key={a.id} className="border-b border-slate-50 last:border-0">
                              <td className="py-2 text-slate-600 max-w-[110px] truncate sm:max-w-none sm:whitespace-normal">{a.concepto || `Pago ${a.numeroPago}`}</td>
                              <td className="py-2 text-slate-400 text-xs">{fmtFecha(a.fechaProgramada)}</td>
                              <td className="py-2 text-right tabular-nums font-medium text-slate-800">{money(a.monto)}</td>
                              <td className="py-2 text-right"><EstadoAportacionBadge ap={a} /></td>
                              <td className="py-2 text-right"><VerComprobante comprobante={a.comprobanteUrl} id={a.id} auth={{ clave }} soloIcono /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <Btn variant="outline" onClick={() => descargarEstadoCuentaPDF({ inv: iv, inversionista: inv, proyecto, aportaciones: aps, precios: data?.preciosPlusvalia })} className="w-full sm:w-auto">
                        <Printer size={15} /> Descargar estado de cuenta (PDF)
                      </Btn>
                      <p className="text-[11px] text-slate-400 mt-1.5">Se descarga un PDF con el detalle de tu inversion.</p>
                    </div>
                  </details>
                </div>
              );
            })}
            {/* Acciones: invitar (+1%) y escribirnos una duda */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button onClick={() => setPanel("invitar")} className="text-left rounded-2xl p-4 shadow-sm transition hover:brightness-105" style={{ background: "linear-gradient(135deg,#d4be8a 0%,#c9a96e 100%)" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(26,20,9,0.14)" }}><Sparkles size={20} style={{ color: "#1a1409" }} /></div>
                  <div>
                    <div className="font-semibold text-sm" style={{ color: "#1a1409" }}>Invita y gana +1%</div>
                    <div className="text-xs" style={{ color: "#5c4a24" }}>Si tu invitado participa, ganas +1% en tu devolucion.</div>
                  </div>
                </div>
              </button>
              <button onClick={() => setPanel("duda")} className="text-left rounded-2xl p-4 bg-white border border-slate-200 shadow-sm transition hover:border-slate-300">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><MessageCircle size={20} className="text-slate-600" /></div>
                  <div>
                    <div className="font-semibold text-sm text-slate-800">¿Tienes dudas? Escribenos</div>
                    <div className="text-xs text-slate-500">Te respondemos por correo lo antes posible.</div>
                  </div>
                </div>
              </button>
            </div>
          </>
        )}
      </main>

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={28} /></button>
          <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <img src={driveImg(lightbox.url)} alt={lightbox.titulo || ""} className="w-full max-h-[80vh] object-contain rounded-xl" />
            <div className="text-center text-white/90 mt-3">
              <div className="font-medium">{lightbox.titulo}</div>
              <div className="text-xs text-white/60">{lightbox.etapa ? lightbox.etapa + " · " : ""}{fmtFecha(lightbox.fecha)}</div>
              <button
                onClick={() => compartirTexto(`Avance de mi inversion${proyectoPorId(lightbox.proyectoId)?.nombre ? " en " + proyectoPorId(lightbox.proyectoId).nombre : ""} con YoDesarrollo 🏗️: ${lightbox.titulo || "nuevo avance"}. ${lightbox.url || SITIO_URL}`)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                <MessageCircle size={14} /> Compartir este avance
              </button>
            </div>
          </div>
        </div>
      )}

      {panel === "cuenta" && <MiCuentaModal clave={clave} inv={inv} onClose={() => setPanel(null)} onClaveCambiada={onClaveCambiada} notificar={notificar} />}
      {panel === "duda" && <DudaModal clave={clave} onClose={() => setPanel(null)} notificar={notificar} />}
      {panel === "invitar" && <InvitarModal clave={clave} nombre={inv?.nombre} onClose={() => setPanel(null)} notificar={notificar} />}
      {comoModal && <ComoCalculaModal info={comoModal} onClose={() => setComoModal(null)} />}
    </div>
  );
}

// ===================================================================
// APP RAIZ — maneja la sesion
// ===================================================================
export default function App() {
  const [sesion, setSesion] = useState(() => {
    try {
      const a = sessionStorage.getItem(ADMIN_KEY);
      if (a) { const o = JSON.parse(a); if (o && o.pass) return { rol: "admin", pass: o.pass }; }
      const i = localStorage.getItem(INVESTOR_KEY);
      if (i) { const o = JSON.parse(i); if (o && o.clave) return { rol: "investor", clave: o.clave }; }
      const s = localStorage.getItem(ASESOR_KEY);
      if (s) { const o = JSON.parse(s); if (o && o.clave) return { rol: "asesor", clave: o.clave }; }
    } catch (e) { /* noop */ }
    return null;
  });

  const entrarAdmin = useCallback((pass) => {
    try { sessionStorage.setItem(ADMIN_KEY, JSON.stringify({ sesion: true, pass })); } catch (e) { /* noop */ }
    setSesion({ rol: "admin", pass });
  }, []);

  const entrarInversionista = useCallback((clave) => {
    try { localStorage.setItem(INVESTOR_KEY, JSON.stringify({ sesion: true, clave })); } catch (e) { /* noop */ }
    setSesion({ rol: "investor", clave });
  }, []);

  const entrarAsesor = useCallback((clave) => {
    try { localStorage.setItem(ASESOR_KEY, JSON.stringify({ sesion: true, clave })); } catch (e) { /* noop */ }
    setSesion({ rol: "asesor", clave });
  }, []);

  const salir = useCallback(() => {
    // Limpiamos tambien el cache local para no dejar datos sensibles tras cerrar sesion.
    try { sessionStorage.removeItem(ADMIN_KEY); localStorage.removeItem(INVESTOR_KEY); localStorage.removeItem(ASESOR_KEY); sessionStorage.removeItem(INVESTOR_KEY); sessionStorage.removeItem(ASESOR_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) { /* noop */ }
    setSesion(null);
  }, []);

  // --- LINK MAGICO: si la URL trae ?t=TOKEN, canjearlo y entrar como inversionista ---
  //  Corre UNA sola vez al montar. Si ya hay una sesion (admin o inversionista)
  //  NO la pisamos: solo limpiamos el token de la URL. Si el token es valido,
  //  pedimos al backend la clave del inversionista y entramos como hoy.
  useEffect(() => {
    let token = "";
    try {
      const params = new URLSearchParams(window.location.search);
      token = params.get("t") || "";
    } catch (e) { /* noop */ }
    if (!token) return;

    // Quitar el ?t de la URL para no dejarlo a la vista ni reusarlo al recargar.
    const limpiarUrl = () => {
      try { window.history.replaceState({}, "", window.location.pathname); } catch (e) { /* noop */ }
    };

    // Si ya hay sesion activa, respetarla: solo limpiamos la URL.
    if (sesion) { limpiarUrl(); return; }

    let cancelado = false;
    (async () => {
      try {
        const res = await apiCall("loginConToken", { token });
        if (!cancelado && res && res.ok && res.clave) {
          entrarInversionista(res.clave);
        }
      } catch (e) { /* enlace invalido o vencido: cae al LoginGate normal */ }
      finally { limpiarUrl(); }
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundary>
      {!sesion && (
        <LoginGate
          onAdmin={entrarAdmin}
          onInvestor={(clave) => entrarInversionista(clave)}
          onAsesor={(clave) => entrarAsesor(clave)}
        />
      )}
      {sesion?.rol === "admin" && <AdminApp pass={sesion.pass} onLogout={salir} />}
      {sesion?.rol === "investor" && <InvestorApp clave={sesion.clave} onLogout={salir} onClaveCambiada={entrarInversionista} />}
      {sesion?.rol === "asesor" && <AsesorApp clave={sesion.clave} onLogout={salir} />}
    </ErrorBoundary>
  );
}
