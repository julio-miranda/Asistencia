/* js/controllers/admin.asistencias_jornadas.controller.js */
import AdminAsistenciasJornadasModel from "../models/admin.asistencias_jornadas.model.js";

(function () {
    "use strict";


    const db = window.db;
    if (!db) {
        console.error("Firestore no está inicializado.");
        return;
    }

    const model = new AdminAsistenciasJornadasModel(db);

    let currentEditingJornadaId = null;

    async function waitForAdminReady() {
        if (typeof window.whenAdminReady === "function") {
            try {
                return await window.whenAdminReady();
            } catch (e) {
                return null;
            }
        }

        return await new Promise(resolve => {
            const timer = setTimeout(() => resolve(null), 12000);

            const probe = () => {
                if (window.adminSessionUserData || window.adminEmpresa || window.adminSucursal) {
                    clearTimeout(timer);
                    resolve(window.adminSessionUserData || null);
                    return;
                }
                setTimeout(probe, 50);
            };

            probe();
        });
    }

    function getWeekRange() {
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

    function limpiarDataTable(selector) {
        try {
            if (window.jQuery && $.fn && $.fn.DataTable && $.fn.DataTable.isDataTable(selector)) {
                const tbl = $(selector).DataTable();
                tbl.clear();
                tbl.destroy();
            }
        } catch (e) {
            console.warn("Error limpiando DataTable:", e);
        }
    }

    function initDataTable(selector) {
        if (!window.jQuery || !$.fn || !$.fn.DataTable) return null;

        try {
            return $(selector).DataTable({
                destroy: true,
                scrollX: true,
                autoWidth: false
            });
        } catch (e) {
            console.warn("DataTable init error:", e);
            return null;
        }
    }

    function renderSimpleRows(tableEl, rows) {
        const tbody = tableEl.querySelector("tbody");
        if (!tbody) return;

        tbody.innerHTML = "";
        rows.forEach(row => {
            const tr = document.createElement("tr");
            tr.innerHTML = row.map(c => `<td>${c}</td>`).join("");
            tbody.appendChild(tr);
        });
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getSessionContext() {
        const s = window.adminSessionUserData || {};

        return {
            role: String(s.role || "").trim(),
            empresa: String(s.empresa || "").trim(),
            sucursal: String(s.sucursal || "").trim(),
            sessionData: s
        };
    }

    function hasAdminContext(ctx) {
        return !!(ctx && ctx.role === "admin" && ctx.empresa && ctx.sucursal);
    }

    async function ensureAdminContext(operation = "continuar") {
        await waitForAdminReady();

        const sessionContext = getSessionContext();
        if (!hasAdminContext(sessionContext)) {
            console.warn(`Contexto administrativo incompleto para ${operation}:`, {
                sessionContext,
                adminSessionUserData: window.adminSessionUserData || null
            });
            return null;
        }

        window.adminEmpresa = sessionContext.empresa;
        window.adminSucursal = sessionContext.sucursal;

        return sessionContext;
    }

    async function refreshSessionIfPossible() {
        if (typeof window.refreshSession === "function") {
            try {
                await window.refreshSession();
            } catch (e) {
                console.warn("No se pudo refrescar la sesión local:", e);
            }
        }
    }

    async function recheckContext(operation) {
        await refreshSessionIfPossible();
        return await ensureAdminContext(operation);
    }

    async function cargarJornadas() {
        const tableEl = document.getElementById("jornadasTable");
        if (!tableEl) return;

        const ready = await recheckContext("cargar jornadas");
        if (!ready) return;

        limpiarDataTable("#jornadasTable");
        const tbl = initDataTable("#jornadasTable");

        try {
            const snap = await model.getJornadasByScope(window.adminEmpresa, window.adminSucursal);
            const rows = [];

            snap.forEach(doc => {
                const d = doc.data() || {};
                rows.push([
                    escapeHtml(d.nombre || ""),
                    escapeHtml(d.horaEntrada || ""),
                    escapeHtml(d.horaSalida || ""),
                    `
                    <button type="button" class="btn-editar-jornada" data-id="${doc.id}" style="background-color:green;">Editar</button>
                    <button type="button" class="btn-eliminar-jornada" data-id="${doc.id}" style="background-color:red;">Eliminar</button>
                `
                ]);
            });

            if (tbl) {
                tbl.clear();
                rows.forEach(row => tbl.row.add(row));
                tbl.draw();
            } else {
                renderSimpleRows(tableEl, rows);
            }
        } catch (err) {
            console.error("Error cargando jornadas:", err);
            alert("Error al cargar jornadas.");
        }
    }

    async function editarJornada(id) {
        const ready = await recheckContext("editar jornada");
        if (!ready) return;

        try {
            currentEditingJornadaId = id;
            window.currentEditingJornadaId = id;

            const doc = await model.getJornadaById(id);
            if (!doc) {
                alert("La jornada no existe.");
                return;
            }

            const d = doc.data() || {};

            const nombreEl = document.getElementById("jornada-nombre");
            const entradaEl = document.getElementById("jornada-hora-entrada");
            const salidaEl = document.getElementById("jornada-hora-salida");

            if (nombreEl) nombreEl.value = d.nombre || "";
            if (entradaEl) entradaEl.value = d.horaEntrada || "";
            if (salidaEl) salidaEl.value = d.horaSalida || "";
        } catch (err) {
            console.error("Error editando jornada:", err);
            alert("No se pudo cargar la jornada.");
        }
    }

    async function eliminarJornada(id) {
        if (!confirm("¿Eliminar jornada?")) return;

        try {
            await model.deleteJornada(id);
            await cargarJornadas();
        } catch (err) {
            console.error("Error eliminando jornada:", err);
            alert(err.message || "No se pudo eliminar la jornada.");
        }
    }

    async function cargarJornadasEnSelect(selected = []) {
        const sel = document.getElementById("empleado-jornada");
        if (!sel) return;

        const ready = await recheckContext("cargar jornadas en select");
        if (!ready) return;

        try {
            sel.innerHTML = "";

            const snap = await model.getJornadasByScope(window.adminEmpresa, window.adminSucursal);
            snap.forEach(doc => {
                const d = doc.data() || {};
                const opt = document.createElement("option");
                opt.value = doc.id;
                opt.textContent = `${d.nombre || ""} (${d.horaEntrada || "00:00"}-${d.horaSalida || "00:00"})`;

                if (Array.isArray(selected) && selected.includes(doc.id)) {
                    opt.selected = true;
                }

                sel.appendChild(opt);
            });
        } catch (err) {
            console.error("Error cargando jornadas en select:", err);
        }
    }

    async function cargarAsistencias(fechaInicio, fechaFin) {
        const tableEl = document.getElementById("asistenciasTable");
        if (!tableEl) return;

        const ready = await recheckContext("cargar asistencias");
        if (!ready) return;

        limpiarDataTable("#asistenciasTable");
        const tbl = initDataTable("#asistenciasTable");

        const start = new Date(fechaInicio);
        const end = new Date(fechaFin);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        try {
            const jornadasSnap = await model.getJornadasByScope(window.adminEmpresa, window.adminSucursal);
            const jornadasMap = {};

            jornadasSnap.forEach(doc => {
                const d = doc.data() || {};
                jornadasMap[doc.id] = {
                    horaEntrada: d.horaEntrada || "00:00",
                    horaSalida: d.horaSalida || "00:00"
                };
            });

            const asistSnap = await model.getAsistenciasByScope(window.adminEmpresa, window.adminSucursal);
            const rows = [];

            asistSnap.forEach(doc => {
                const d = doc.data() || {};
                if (!d.fecha) return;

                const dt = new Date(d.fecha + "T00:00:00");
                if (dt < start || dt > end) return;

                const jornada = jornadasMap[d.jornadaId] || {};
                const [hEntRef, mEntRef] = String(jornada.horaEntrada || "00:00").split(":").map(Number);
                const [hSalRef, mSalRef] = String(jornada.horaSalida || "00:00").split(":").map(Number);

                let acciones = `
                <button type="button" class="btn-eliminar-asistencia" data-id="${doc.id}" style="background-color:red;">Eliminar</button>
            `;

                if (d.entrada && !d.consentidaEntrada) {
                    const [h, m] = String(d.entrada).split(":").map(Number);
                    const esTarde = h > hEntRef || (h === hEntRef && m > mEntRef);

                    if (esTarde) {
                        acciones += ` <button type="button" class="btn-consentir-entrada" data-id="${doc.id}" style="background-color:orange;">Consentir Entrada</button>`;
                    }
                }

                if (!d.salida && !d.consentidaSalida) {
                    acciones += ` <button type="button" class="btn-consentir-salida" data-id="${doc.id}" style="background-color:orange;">Consentir Salida</button>`;
                } else if (d.salida && !d.consentidaSalida) {
                    const [hs, ms] = String(d.salida).split(":").map(Number);
                    const salTemprano = hs < hSalRef || (hs === hSalRef && ms < mSalRef);

                    if (salTemprano) {
                        acciones += ` <button type="button" class="btn-consentir-salida" data-id="${doc.id}" style="background-color:orange;">Consentir Salida</button>`;
                    }
                }

                rows.push([
                    escapeHtml(d.user || ""),
                    escapeHtml(d.fecha || ""),
                    escapeHtml(d.status || ""),
                    escapeHtml(d.entrada || ""),
                    escapeHtml(d.salida || ""),
                    escapeHtml(d.justificacion || ""),
                    acciones
                ]);
            });

            if (tbl) {
                tbl.clear();
                rows.forEach(row => tbl.row.add(row));
                tbl.draw();
            } else {
                renderSimpleRows(tableEl, rows);
            }
        } catch (err) {
            console.error("Error cargando asistencias:", err);
            alert("Error al cargar asistencias.");
        }
    }

    async function consentirSinEntrada(id) {
        try {
            await model.updateAsistencia(id, {
                entrada: "Consentida",
                consentidaEntrada: true
            });

            alert("Entrada consentida");
            const inicioEl = document.getElementById("fechaInicioa");
            const finEl = document.getElementById("fechaFina");
            const semana = getWeekRange();
            const inicio = inicioEl ? inicioEl.value : semana.inicio;
            const fin = finEl ? finEl.value : semana.fin;
            await cargarAsistencias(inicio, fin);
        } catch (err) {
            alert(err.message || "No se pudo consentir la entrada.");
        }
    }

    async function consentirSinSalida(id) {
        try {
            await model.updateAsistencia(id, {
                salida: "Consentida",
                consentidaSalida: true
            });

            alert("Salida consentida");
            const inicioEl = document.getElementById("fechaInicioa");
            const finEl = document.getElementById("fechaFina");
            const semana = getWeekRange();
            const inicio = inicioEl ? inicioEl.value : semana.inicio;
            const fin = finEl ? finEl.value : semana.fin;
            await cargarAsistencias(inicio, fin);
        } catch (err) {
            alert(err.message || "No se pudo consentir la salida.");
        }
    }

    async function eliminarAsistencia(id) {
        if (!confirm("¿Eliminar asistencia?")) return;

        try {
            await model.deleteAsistencia(id);

            const inicioEl = document.getElementById("fechaInicioa");
            const finEl = document.getElementById("fechaFina");
            const semana = getWeekRange();

            const inicio = inicioEl ? inicioEl.value : semana.inicio;
            const fin = finEl ? finEl.value : semana.fin;

            await cargarAsistencias(inicio, fin);
        } catch (err) {
            console.error("Error eliminando asistencia:", err);
            alert(err.message || "No se pudo eliminar la asistencia.");
        }
    }

    function bindJornadaForm() {
        const form = document.getElementById("jornada-form");
        if (!form || form.dataset.bound) return;

        form.dataset.bound = "1";

        form.addEventListener("submit", async e => {
            e.preventDefault();

            const ready = await recheckContext("guardar jornada");
            if (!ready) return;

            try {
                const nombreEl = document.getElementById("jornada-nombre");
                const entradaEl = document.getElementById("jornada-hora-entrada");
                const salidaEl = document.getElementById("jornada-hora-salida");

                const data = {
                    nombre: nombreEl ? nombreEl.value.trim() : "",
                    horaEntrada: entradaEl ? entradaEl.value : "",
                    horaSalida: salidaEl ? salidaEl.value : "",
                    empresa: window.adminEmpresa,
                    sucursal: window.adminSucursal
                };

                if (!data.nombre || !data.horaEntrada || !data.horaSalida) {
                    alert("Completa todos los campos de la jornada.");
                    return;
                }

                if (currentEditingJornadaId) {
                    await model.saveJornada(data, currentEditingJornadaId);
                    currentEditingJornadaId = null;
                    window.currentEditingJornadaId = null;
                } else {
                    await model.saveJornada(data);
                }

                form.reset();
                await cargarJornadas();
            } catch (err) {
                console.error("Error guardando jornada:", err);
                alert(err.message || "No se pudo guardar la jornada.");
            }
        });
    }

    function bindFiltroAsistencias() {
        const btn = document.getElementById("filtrarA");
        if (!btn || btn.dataset.bound) return;

        btn.dataset.bound = "1";

        btn.addEventListener("click", async () => {
            const inicioEl = document.getElementById("fechaInicioa");
            const finEl = document.getElementById("fechaFina");
            const semana = getWeekRange();

            const inicio = inicioEl ? inicioEl.value : semana.inicio;
            const fin = finEl ? finEl.value : semana.fin;

            await cargarAsistencias(inicio, fin);
        });
    }

    function bindTableEvents() {
        const jornadasBody = document.querySelector("#jornadasTable tbody");
        if (jornadasBody && !jornadasBody.dataset.bound) {
            jornadasBody.dataset.bound = "1";
            jornadasBody.addEventListener("click", (e) => {
                const btnEdit = e.target.closest(".btn-editar-jornada");
                const btnDelete = e.target.closest(".btn-eliminar-jornada");

                if (btnEdit) return editarJornada(btnEdit.dataset.id);
                if (btnDelete) return eliminarJornada(btnDelete.dataset.id);
            });
        }

        const asistenciasBody = document.querySelector("#asistenciasTable tbody");
        if (asistenciasBody && !asistenciasBody.dataset.bound) {
            asistenciasBody.dataset.bound = "1";
            asistenciasBody.addEventListener("click", (e) => {
                const btnEntrada = e.target.closest(".btn-consentir-entrada");
                const btnSalida = e.target.closest(".btn-consentir-salida");
                const btnDelete = e.target.closest(".btn-eliminar-asistencia");

                if (btnEntrada) return consentirSinEntrada(btnEntrada.dataset.id);
                if (btnSalida) return consentirSinSalida(btnSalida.dataset.id);
                if (btnDelete) return eliminarAsistencia(btnDelete.dataset.id);
            });
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
        bindJornadaForm();
        bindFiltroAsistencias();
        bindTableEvents();

        const ready = await waitForAdminReady();
        if (!ready) return;

        const semana = getWeekRange();

        const inicioEl = document.getElementById("fechaInicioa");
        const finEl = document.getElementById("fechaFina");

        if (inicioEl && !inicioEl.value) inicioEl.value = semana.inicio;
        if (finEl && !finEl.value) finEl.value = semana.fin;

        if (document.getElementById("jornadasTable")) {
            await cargarJornadas();
        }

        if (document.getElementById("asistenciasTable")) {
            await cargarAsistencias(semana.inicio, semana.fin);
        }

        if (document.getElementById("empleado-jornada")) {
            await cargarJornadasEnSelect([]);
        }
    }

    window.cargarJornadas = cargarJornadas;
    window.cargarAsistencias = cargarAsistencias;
    window.cargarJornadasEnSelect = cargarJornadasEnSelect;
    window.editarJornada = editarJornada;
    window.eliminarJornada = eliminarJornada;
    window.eliminarAsistencia = eliminarAsistencia;
    window.consentirSinEntrada = consentirSinEntrada;
    window.consentirSinSalida = consentirSinSalida;

    document.addEventListener("DOMContentLoaded", initPage);

    window.addEventListener("auth:session-updated", () => {
        if (document.getElementById("jornadasTable")) {
            cargarJornadas().catch(() => { });
        }
        if (document.getElementById("asistenciasTable")) {
            const semana = getWeekRange();
            cargarAsistencias(semana.inicio, semana.fin).catch(() => { });
        }
        if (document.getElementById("empleado-jornada")) {
            cargarJornadasEnSelect([]).catch(() => { });
        }
    });

})();