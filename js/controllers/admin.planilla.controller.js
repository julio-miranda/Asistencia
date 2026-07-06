import PlanillaModel from "../models/planilla.model.js";

(function () {
"use strict";


const db = window.db;
if (!db) {
    console.error("Firestore no está inicializado.");
    return;
}

const model = new PlanillaModel(db);

const DEFAULT_ISSS_RATE = 0.03;
const DEFAULT_AFP_RATE = 0.0725;

let lastPlanillaData = {
    rows: [],
    empleados: {},
    asistencias: [],
    jornadasMap: {},
    fechas: { inicio: "", fin: "" },
    aplicarNocturno: false
};

function obtenerSemanaActualLocal() {
    const hoy = new Date();
    const d = hoy.getDay() || 7;
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - d + 1);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 6);

    return {
        inicio: inicio.toISOString().split("T")[0],
        fin: fin.toISOString().split("T")[0]
    };
}

function crearFechaCompletaLocal(fechaStr, timeStr) {
    if (!fechaStr) fechaStr = new Date().toISOString().split("T")[0];
    timeStr = timeStr || "00:00";

    const esPM = /p\.?m\.?/i.test(timeStr);
    const esAM = /a\.?m\.?/i.test(timeStr);

    const clean = timeStr.replace(/a\.?m\.?|p\.?m\.?/gi, "").trim();
    const parts = clean.split(":").map(n => parseInt(n, 10));

    let h = Number.isFinite(parts[0]) ? parts[0] : 0;
    let m = Number.isFinite(parts[1]) ? parts[1] : 0;
    let s = Number.isFinite(parts[2]) ? parts[2] : 0;

    if (esPM && h < 12) h += 12;
    if (esAM && h === 12) h = 0;

    const dt = new Date(fechaStr + "T00:00:00");
    dt.setHours(h, m, s, 0);
    return dt;
}

function esJornadaNocturnaLocal(nombre) {
    if (!nombre) return false;
    const low = String(nombre).toLowerCase();
    return ["noche", "nocturna", "nocturno", "nocturnas"].some(s => low.includes(s));
}

function esperarAdminReady() {
    if (typeof window.whenAdminReady === "function") {
        return window.whenAdminReady();
    }
    return Promise.resolve(window.adminSessionUserData || null);
}

function getEmpresaSucursal() {
    return {
        empresa: window.adminEmpresa || "",
        sucursal: window.adminSucursal || ""
    };
}

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function parsePercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n <= 1) return n;
    return n / 100;
}

function firstExistingNumber(obj, keys) {
    if (!obj) return null;
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const n = Number(obj[key]);
            if (Number.isFinite(n)) return n;
        }
    }
    return null;
}

function firstExistingPercent(obj, keys) {
    if (!obj) return null;
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const p = parsePercent(obj[key]);
            if (p !== null) return p;
        }
    }
    return null;
}

function getAyudaEconomica(emp) {
    return (
        firstExistingNumber(emp, [
            "ayudaEconomica",
            "ayuda_economica",
            "ayudaEconomicaMonto",
            "bono",
            "bonificacion",
            "subsidio",
            "subsidioEconomico"
        ]) ?? 0
    );
}

function getEmpleadoJornadaId(emp, fallbackJornadaId = "") {
    if (!emp) return String(fallbackJornadaId || "").trim();

    const fromDirect = emp.jornadaId || emp.jornada || emp.jornada_id;
    if (fromDirect) return String(fromDirect).trim();

    if (Array.isArray(emp.jornadas) && emp.jornadas.length > 0 && emp.jornadas[0]) {
        return String(emp.jornadas[0]).trim();
    }

    return String(fallbackJornadaId || "").trim();
}

function getJornadaHoras(jm) {
    if (!jm) return 0;

    const inicio = crearFechaCompletaLocal("2000-01-01", jm.start || "00:00");
    const fin = crearFechaCompletaLocal("2000-01-01", jm.end || "00:00");

    let diff = (fin - inicio) / 3600000;
    if (diff <= 0) diff += 24;

    return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function calcularDeduccion(base, emp, amountKeys, percentKeys, fallbackRate, presenceKeys = []) {
    const monto = firstExistingNumber(emp, amountKeys);
    if (monto !== null) return Math.max(0, monto);

    const porcentaje = firstExistingPercent(emp, percentKeys);
    if (porcentaje !== null) return Math.max(0, base * porcentaje);

    const tieneCampo = presenceKeys.some(key => Object.prototype.hasOwnProperty.call(emp || {}, key));
    if (tieneCampo && fallbackRate > 0) {
        return Math.max(0, base * fallbackRate);
    }

    return 0;
}

function formatMoney(value) {
    const n = toNumber(value, 0);
    return `$${n.toFixed(2)}`;
}

function formatHours(value) {
    const n = toNumber(value, 0);
    return n.toFixed(2);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderRows(tableEl, rows) {
    const tbody = tableEl.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    rows.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("");
        tbody.appendChild(tr);
    });
}

async function cargarJornadasMap() {
    const { empresa, sucursal } = getEmpresaSucursal();
    if (!empresa || !sucursal) return {};

    const snap = await model.getJornadasByScope(empresa, sucursal);

    const jornadasMap = {};
    snap.forEach(doc => {
        const data = doc.data() || {};
        jornadasMap[doc.id] = {
            nombre: data.nombre || "",
            start: (data.horaEntrada || "00:00") + ":00",
            end: (data.horaSalida || "00:00") + ":00"
        };
    });

    return jornadasMap;
}

async function hayNocturnasEnPeriodo(jornadasMap, fechaInicio, fechaFin) {
    const { empresa, sucursal } = getEmpresaSucursal();
    if (!empresa || !sucursal) return false;

    const asSnap = await model.getAsistenciasByScope(empresa, sucursal);

    let hay = false;
    asSnap.forEach(doc => {
        const a = doc.data() || {};
        if (a.fecha && a.fecha >= fechaInicio && a.fecha <= fechaFin) {
            const jornadaId = a.jornadaId || a.jornada || a.jornadaDocId;
            const jm = jornadasMap[jornadaId];
            if (jm && esJornadaNocturnaLocal(jm.nombre)) hay = true;
        }
    });

    return hay;
}

async function calcularPlanillaSemanal(fechaInicio, fechaFin, aplicarNocturno = false, jornadasMap = null) {
    const tableEl = document.getElementById("planillaTable");
    if (!tableEl) return;

    const ready = await esperarAdminReady();
    if (!ready && !window.adminSessionUserData) return;

    const { empresa, sucursal } = getEmpresaSucursal();
    if (!empresa || !sucursal) return;

    if (!jornadasMap) jornadasMap = await cargarJornadasMap();

    const empSnap = await model.getEmpleadosByScope(empresa, sucursal);
    const empleados = {};

    empSnap.forEach(doc => {
        empleados[doc.id] = { id: doc.id, ...(doc.data() || {}) };
    });

    const asSnap = await model.getAsistenciasByScope(empresa, sucursal);

    const grupos = {};
    const asistenciasFiltradas = [];

    asSnap.forEach(doc => {
        const d = doc.data() || {};
        if (!d.fecha || d.fecha < fechaInicio || d.fecha > fechaFin) return;
        if (!d.entrada && !d.consentidaEntrada) return;

        asistenciasFiltradas.push({ id: doc.id, ...d });

        const uid = d.userId || d.uid || d.authUid || d.usuarioId;
        if (!uid) return;

        if (!grupos[uid]) {
            grupos[uid] = {
                horasTrabajadas: 0,
                horasProgramadas: 0,
                baseSalarial: 0
            };
        }

        const emp = empleados[uid] || {};
        const jornadaId = d.jornadaId || d.jornada || d.jornadaDocId || getEmpleadoJornadaId(emp, "");
        const jm = jornadasMap[jornadaId];
        if (!jm) return;

        const jornadaStart = crearFechaCompletaLocal(d.fecha, jm.start);
        const jornadaEnd = crearFechaCompletaLocal(d.fecha, jm.end);

        const realStart = (d.consentidaEntrada || d.entrada === "Consentida")
            ? jornadaStart
            : (d.entrada ? crearFechaCompletaLocal(d.fecha, d.entrada) : jornadaStart);

        let realEnd = null;
        if (d.salida && d.salida !== "Consentida") {
            realEnd = crearFechaCompletaLocal(d.fecha, d.salida);
        } else if (d.consentidaSalida || d.salida === "Consentida") {
            realEnd = jornadaEnd;
        }

        if (realEnd && realEnd < realStart) return;

        let horasNorm = 0;
        let horasExt = 0;

        if (realEnd) {
            horasNorm = Math.max(0, Math.min(realEnd, jornadaEnd) - realStart) / 3600000;
            horasExt = Math.max(0, realEnd - jornadaEnd) / 3600000;
        } else {
            const dur = (jornadaEnd - jornadaStart) / 3600000;
            horasNorm = (d.consentidaEntrada || emp.viajero) ? dur : dur / 2;
        }

        horasNorm = Math.round(horasNorm * 100) / 100;
        horasExt = Math.round(horasExt * 100) / 100;

        const salH = toNumber(emp.salarioH, 0);
        const factorNocturno = (aplicarNocturno && esJornadaNocturnaLocal(jm.nombre)) ? 1.5 : 1.0;
        const horasTrabajadasRegistro = horasNorm + horasExt;

        grupos[uid].horasTrabajadas += horasTrabajadasRegistro;
        grupos[uid].baseSalarial += horasTrabajadasRegistro * salH * factorNocturno;
    });

    const start = new Date(fechaInicio);
    const end = new Date(fechaFin);
    let totalDias = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) totalDias++;

    for (const uid in empleados) {
        const emp = empleados[uid];
        const jornadaId = getEmpleadoJornadaId(emp, "");
        const jm = jornadaId ? jornadasMap[jornadaId] : null;

        if (!grupos[uid]) {
            grupos[uid] = {
                horasTrabajadas: 0,
                horasProgramadas: 0,
                baseSalarial: 0
            };
        }

        const jornadaHoras = getJornadaHoras(jm);
        if (jornadaHoras > 0) {
            grupos[uid].horasProgramadas = totalDias * jornadaHoras;
        }
    }

    const rows = [];

    for (const uid in grupos) {
        const emp = empleados[uid] || {};
        const g = grupos[uid];

        const salarioBaseHora = toNumber(emp.salarioH, 0);
        const ayudaEconomica = getAyudaEconomica(emp);

        const totalBruto = g.baseSalarial + ayudaEconomica;

        const isss = calcularDeduccion(
            g.baseSalarial,
            emp,
            ["isssMonto", "montoIsss"],
            ["isssPorcentaje", "isssRate"],
            DEFAULT_ISSS_RATE,
            ["isss"]
        );

        const afp = calcularDeduccion(
            g.baseSalarial,
            emp,
            ["afpMonto", "montoAfp"],
            ["afpPorcentaje", "afpRate"],
            DEFAULT_AFP_RATE,
            ["afp"]
        );

        const renta = calcularDeduccion(
            g.baseSalarial,
            emp,
            ["rentaMonto", "montoRenta"],
            ["rentaPorcentaje", "rentaRate"],
            0,
            ["renta"]
        );

        const totalDeducciones = isss + afp + renta;
        const neto = totalBruto - totalDeducciones;
        const horasNoTrabajadas = Math.max(0, (g.horasProgramadas || 0) - (g.horasTrabajadas || 0));

        rows.push({
            empleado: emp.nombre || "Desconocido",
            salarioBaseHora,
            horasTrabajadas: Math.round(g.horasTrabajadas * 100) / 100,
            horasNoTrabajadas: Math.round(horasNoTrabajadas * 100) / 100,
            ayudaEconomica,
            totalBruto: Math.round(totalBruto * 100) / 100,
            isss: Math.round(isss * 100) / 100,
            afp: Math.round(afp * 100) / 100,
            renta: Math.round(renta * 100) / 100,
            totalNeto: Math.round(neto * 100) / 100
        });
    }

    lastPlanillaData = {
        rows,
        empleados,
        asistencias: asistenciasFiltradas,
        jornadasMap,
        fechas: { inicio: fechaInicio, fin: fechaFin },
        aplicarNocturno
    };

    const displayRows = rows.map(r => ([
        r.empleado,
        formatMoney(r.salarioBaseHora),
        formatHours(r.horasTrabajadas),
        formatHours(r.horasNoTrabajadas),
        formatMoney(r.ayudaEconomica),
        formatMoney(r.totalBruto),
        formatMoney(r.isss),
        formatMoney(r.afp),
        formatMoney(r.renta),
        formatMoney(r.totalNeto)
    ]));

    renderRows(tableEl, displayRows);
    return lastPlanillaData;
}

async function mostrarPlanilla() {
    const ready = await esperarAdminReady();
    if (!ready && !window.adminSessionUserData) return;

    const navLinks = document.getElementById("navbar-links");
    if (navLinks) navLinks.classList.remove("active");

    const planillaCont = document.getElementById("planilla-container");
    if (!planillaCont) return;
    planillaCont.style.display = "block";

    const semana = obtenerSemanaActualLocal();
    const inicioEl = document.getElementById("fechaInicio");
    const finEl = document.getElementById("fechaFin");
    const chk = document.getElementById("aplicar-nocturno");

    const inicio = (inicioEl && inicioEl.value) || semana.inicio;
    const fin = (finEl && finEl.value) || semana.fin;

    if (inicioEl && !inicioEl.value) inicioEl.value = inicio;
    if (finEl && !finEl.value) finEl.value = fin;

    const jornadasMap = await cargarJornadasMap();
    const aplicarAuto = await hayNocturnasEnPeriodo(jornadasMap, inicio, fin);

    if (chk) chk.checked = aplicarAuto;

    await calcularPlanillaSemanal(inicio, fin, chk ? chk.checked : false, jornadasMap);

    if (chk && !chk.dataset.bound) {
        chk.dataset.bound = "1";
        chk.addEventListener("change", async () => {
            const ini = inicioEl ? inicioEl.value : semana.inicio;
            const fn = finEl ? finEl.value : semana.fin;
            const jm = await cargarJornadasMap();
            await calcularPlanillaSemanal(ini, fn, chk.checked, jm);
        });
    }
}

function imprimirPlanilla() {
    const contenidoEl = document.getElementById("planilla-container");
    const contenido = contenidoEl ? contenidoEl.innerHTML : "";
    const w = window.open("", "", "width=800,height=600");

    if (!w) {
        alert("No se pudo abrir la ventana de impresión.");
        return;
    }

    w.document.write(`
        <html>
            <head>
                <title>Imprimir planilla</title>
                <link rel="stylesheet" href="css/admin.css">
                <link rel="stylesheet" href="https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css">
                <style>
                    body{font-family:"Poppins",sans-serif;padding:20px;}
                    table{width:100%;border-collapse:collapse;}
                    th,td{border:1px solid #ddd;padding:8px;text-align:center;}
                    th{background:#007bff;color:#fff;}
                </style>
            </head>
            <body>${contenido}</body>
        </html>
    `);

    w.document.close();
    w.focus();
    w.print();
    w.close();
}

async function descargarExcel() {
    const { empresa, sucursal } = getEmpresaSucursal();
    const inicioSel = document.getElementById("fechaInicio") ? document.getElementById("fechaInicio").value : "";
    const finSel = document.getElementById("fechaFin") ? document.getElementById("fechaFin").value : "";

    if (!inicioSel || !finSel) {
        alert("Selecciona ambas fechas antes de descargar el Excel.");
        return;
    }

    if (!empresa || !sucursal) {
        alert("No hay datos suficientes para exportar.");
        return;
    }

    try {
        const jornadasMap = await cargarJornadasMap();
        const data = await calcularPlanillaSemanal(
            inicioSel,
            finSel,
            document.getElementById("aplicar-nocturno") ? document.getElementById("aplicar-nocturno").checked : false,
            jornadasMap
        );

        if (typeof XLSX === "undefined") {
            alert("La librería XLSX no está disponible.");
            return;
        }

        const wb = XLSX.utils.book_new();

        const wsPlanilla = XLSX.utils.json_to_sheet(
            data.rows.map(r => ({
                Empleado: r.empleado,
                "Salario Base/Hora": r.salarioBaseHora,
                "Horas Trabajadas": r.horasTrabajadas,
                "Horas No Trabajadas": r.horasNoTrabajadas,
                "Ayuda Económica": r.ayudaEconomica,
                "Total Bruto": r.totalBruto,
                ISSS: r.isss,
                AFP: r.afp,
                Renta: r.renta,
                "Total Neto": r.totalNeto
            }))
        );
        XLSX.utils.book_append_sheet(wb, wsPlanilla, "Planilla");

        const wsAsistencias = XLSX.utils.json_to_sheet(
            data.asistencias.map(a => ({
                Usuario: a.user || a.usuario || a.nombre || "",
                Fecha: a.fecha || "",
                Entrada: a.entrada || "",
                Salida: a.salida || "",
                Estado: a.status || "",
                Justificacion: a.justificacion || ""
            }))
        );
        XLSX.utils.book_append_sheet(wb, wsAsistencias, "Asistencias");

        const wsEmpleados = XLSX.utils.json_to_sheet(
            Object.values(data.empleados).map(u => ({
                Nombre: u.nombre || "",
                Documento: u.identificacionNombre || "",
                Identificacion: u.identificacion || "",
                Correo: u.email || "",
                Jornada: Array.isArray(u.jornadas) ? u.jornadas.join(", ") : (u.jornada || ""),
                SalarioHora: toNumber(u.salarioH, 0)
            }))
        );
        XLSX.utils.book_append_sheet(wb, wsEmpleados, "Usuarios");

        const nombreArchivo = `Planilla_${empresa}_${sucursal}_${inicioSel}_a_${finSel}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);
    } catch (e) {
        console.error(e);
        alert("Error al exportar Excel");
    }
}

function bindPlanillaUI() {
    const filtrarEl = document.getElementById("filtrar");
    if (filtrarEl && !filtrarEl.dataset.bound) {
        filtrarEl.dataset.bound = "1";
        filtrarEl.addEventListener("click", async () => {
            const inicioSel = document.getElementById("fechaInicio") ? document.getElementById("fechaInicio").value : "";
            const finSel = document.getElementById("fechaFin") ? document.getElementById("fechaFin").value : "";
            const chk = document.getElementById("aplicar-nocturno");

            if (!inicioSel || !finSel) {
                alert("Selecciona ambas fechas para filtrar la planilla");
                return;
            }

            const jornadasMap = await cargarJornadasMap();
            const aplicarAuto = await hayNocturnasEnPeriodo(jornadasMap, inicioSel, finSel);

            if (chk) chk.checked = aplicarAuto;

            await calcularPlanillaSemanal(inicioSel, finSel, chk ? chk.checked : false, jornadasMap);
        });
    }

    const btnImprimir = document.getElementById("btn-imprimir-planilla");
    if (btnImprimir && !btnImprimir.dataset.bound) {
        btnImprimir.dataset.bound = "1";
        btnImprimir.addEventListener("click", imprimirPlanilla);
    }

    const btnExcel = document.getElementById("btn-descargar-excel");
    if (btnExcel && !btnExcel.dataset.bound) {
        btnExcel.dataset.bound = "1";
        btnExcel.addEventListener("click", descargarExcel);
    }
}

function bindNavigation() {
    const logoutBtn = document.getElementById("logout-button");
    if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = "1";
        logoutBtn.addEventListener("click", () => {
            if (typeof window.logout === "function") {
                window.logout({ redirect: true });
            } else {
                window.location.href = "index.html";
            }
        });
    }

    const menuToggle = document.getElementById("menu-toggle");
    if (menuToggle && !menuToggle.dataset.bound) {
        menuToggle.dataset.bound = "1";
        menuToggle.addEventListener("click", () => {
            const nav = document.getElementById("navbar-links");
            if (nav) nav.classList.toggle("active");
        });
    }
}

async function initPage() {
    bindNavigation();
    bindPlanillaUI();

    const ready = await esperarAdminReady();
    if (!ready && !window.adminSessionUserData) return;

    const semana = obtenerSemanaActualLocal();
    const inicio = document.getElementById("fechaInicio");
    const fin = document.getElementById("fechaFin");

    if (inicio && !inicio.value) inicio.value = semana.inicio;
    if (fin && !fin.value) fin.value = semana.fin;

    await mostrarPlanilla();
}

window.cargarJornadasMap = cargarJornadasMap;
window.hayNocturnasEnPeriodo = hayNocturnasEnPeriodo;
window.mostrarPlanilla = mostrarPlanilla;
window.calcularPlanillaSemanal = calcularPlanillaSemanal;
window.imprimirPlanilla = imprimirPlanilla;
window.descargarExcel = descargarExcel;

document.addEventListener("DOMContentLoaded", initPage);

})();