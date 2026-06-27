import PlanillaModel from "../models/planilla.model.js";

(function () {
    "use strict";

    const db = window.db;
    if (!db) {
        console.error("Firestore no está inicializado.");
        return;
    }

    const model = new PlanillaModel(db);

    let lastPlanillaData = {
        rows: [],
        empleados: {},
        asistencias: [],
        jornadasMap: {},
        fechas: { inicio: "", fin: "" },
        aplicarNocturno: false
    };

    function getDb() {
        return window.db || null;
    }

    function obtenerSemanaActualFallback() {
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

    function obtenerSemanaActual() {
        return typeof window.obtenerSemanaActual === "function"
            ? window.obtenerSemanaActual()
            : obtenerSemanaActualFallback();
    }

    function crearFechaCompleta(fechaStr, timeStr) {
        if (typeof window.crearFechaCompleta === "function") {
            return window.crearFechaCompleta(fechaStr, timeStr);
        }

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

    function esJornadaNocturna(nombre) {
        if (typeof window.esJornadaNocturna === "function") {
            return window.esJornadaNocturna(nombre);
        }
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

    function limpiarTabla(tbody) {
        if (tbody) tbody.innerHTML = "";
    }

    function renderRows(tableEl, rows) {
        const tbody = tableEl.querySelector("tbody");
        if (!tbody) return;
        limpiarTabla(tbody);

        rows.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = row.map(cell => `<td>${cell}</td>`).join("");
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
                const jm = jornadasMap[a.jornadaId];
                if (jm && esJornadaNocturna(jm.nombre)) hay = true;
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
        const fechasAtendidas = {};
        const asistenciasFiltradas = [];

        asSnap.forEach(doc => {
            const d = doc.data() || {};
            if (!d.fecha || d.fecha < fechaInicio || d.fecha > fechaFin) return;
            if (!d.entrada && !d.consentidaEntrada) return;

            asistenciasFiltradas.push({ id: doc.id, ...d });

            const uid = d.userId;
            if (!uid) return;

            if (!grupos[uid]) {
                grupos[uid] = { horasNorm: 0, horasExt: 0, bruto: 0 };
                fechasAtendidas[uid] = new Set();
            }

            fechasAtendidas[uid].add(d.fecha);

            const jm = jornadasMap[d.jornadaId];
            if (!jm) return;

            const jornadaStart = crearFechaCompleta(d.fecha, jm.start);
            const jornadaEnd = crearFechaCompleta(d.fecha, jm.end);

            const realStart = (d.consentidaEntrada || d.entrada === "Consentida")
                ? jornadaStart
                : (d.entrada ? crearFechaCompleta(d.fecha, d.entrada) : jornadaStart);

            let realEnd = null;
            if (d.salida && d.salida !== "Consentida") {
                realEnd = crearFechaCompleta(d.fecha, d.salida);
            } else if (d.consentidaSalida || d.salida === "Consentida") {
                realEnd = jornadaEnd;
            }

            if (realEnd && realEnd < realStart) return;

            let norm = 0;
            let ext = 0;

            if (realEnd) {
                norm = Math.max(0, Math.min(realEnd, jornadaEnd) - realStart) / 3600000;
                ext = Math.max(0, realEnd - jornadaEnd) / 3600000;
            } else {
                const dur = (jornadaEnd - jornadaStart) / 3600000;
                norm = (d.consentidaEntrada || (empleados[uid] && empleados[uid].viajero)) ? dur : dur / 2;
            }

            norm = Math.round(norm * 100) / 100;
            ext = Math.round(ext * 100) / 100;

            const salH = Number(empleados[uid]?.salarioH || 0);
            const factor = (aplicarNocturno && esJornadaNocturna(jm.nombre)) ? 1.5 : 1.0;

            grupos[uid].horasNorm += norm;
            grupos[uid].horasExt += ext;
            grupos[uid].bruto += (norm + ext) * salH * factor;
        });

        const start = new Date(fechaInicio);
        const end = new Date(fechaFin);
        let totalDias = 0;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) totalDias++;

        for (const uid in empleados) {
            const emp = empleados[uid];
            if (emp.viajero) {
                const reg = fechasAtendidas[uid]?.size || 0;
                const falt = totalDias - reg;

                if (falt > 0) {
                    const jmId = emp.jornadaId || (Array.isArray(emp.jornadas) ? emp.jornadas[0] : "");
                    const jm = jmId ? jornadasMap[jmId] : null;

                    if (jm) {
                        if (!grupos[uid]) grupos[uid] = { horasNorm: 0, horasExt: 0, bruto: 0 };

                        const dur = (crearFechaCompleta(fechaInicio, jm.end) - crearFechaCompleta(fechaInicio, jm.start)) / 3600000;
                        grupos[uid].horasNorm += falt * dur;

                        const salH = Number(emp.salarioH || 0);
                        const factor = (aplicarNocturno && esJornadaNocturna(jm.nombre)) ? 1.5 : 1.0;
                        grupos[uid].bruto += falt * dur * salH * factor;
                    }
                }
            }
        }

        const rows = [];

        for (const uid in grupos) {
            const e = empleados[uid] || { nombre: "Desconocido", isss: 0, afp: 0 };
            const g = grupos[uid];

            const isss = e.isss ? g.bruto * 0.03 : 0;
            const afp = e.afp ? g.bruto * 0.075 : 0;
            const neto = g.bruto - isss - afp;

            rows.push({
                empleado: e.nombre || "Desconocido",
                horasNormales: g.horasNorm.toFixed(2),
                horasExtras: g.horasExt.toFixed(2),
                totalHoras: (g.horasNorm + g.horasExt).toFixed(2),
                totalBruto: `$${g.bruto.toFixed(2)}`,
                isss: `$${isss.toFixed(2)}`,
                afp: `$${afp.toFixed(2)}`,
                totalNeto: `$${neto.toFixed(2)}`
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
            r.horasNormales,
            r.horasExtras,
            r.totalHoras,
            r.totalBruto,
            r.isss,
            r.afp,
            r.totalNeto
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

        const semana = obtenerSemanaActual();
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
        const { empresa, sucursal } = {
            empresa: window.adminEmpresa || "",
            sucursal: window.adminSucursal || ""
        };

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
            const data = lastPlanillaData.fechas.inicio === inicioSel && lastPlanillaData.fechas.fin === finSel
                ? lastPlanillaData
                : await calcularPlanillaSemanal(
                    inicioSel,
                    finSel,
                    document.getElementById("aplicar-nocturno") ? document.getElementById("aplicar-nocturno").checked : false,
                    await cargarJornadasMap()
                );

            if (typeof XLSX === "undefined") {
                alert("La librería XLSX no está disponible.");
                return;
            }

            const wb = XLSX.utils.book_new();

            const wsPlanilla = XLSX.utils.json_to_sheet(data.rows.map(r => ({
                Empleado: r.empleado,
                "Horas Normales": r.horasNormales,
                "Horas Extras": r.horasExtras,
                "Total Horas": r.totalHoras,
                "Total Bruto": r.totalBruto,
                ISSS: r.isss,
                AFP: r.afp,
                "Total Neto": r.totalNeto
            })));
            XLSX.utils.book_append_sheet(wb, wsPlanilla, "Planilla");

            const wsAsistencias = XLSX.utils.json_to_sheet(
                data.asistencias.map(a => ({
                    Usuario: a.user || "",
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
                    Jornada: Array.isArray(u.jornadas) ? u.jornadas.join(", ") : "",
                    Salario: u.salarioH ?? ""
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

        const semana = obtenerSemanaActual();

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