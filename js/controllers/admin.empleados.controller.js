/* js/controllers/admin.empleados.controller.js */
import EmpleadosModel from "../models/empleados.model.js";

(function () {
    "use strict";

    const db = window.db;
    if (!db) {
        console.error("Firestore no está inicializado.");
        return;
    }

    const model = new EmpleadosModel(db);

    window.cargarJornadasEnSelect = cargarJornadasEnSelect;
    window.cargarEmpleados = cargarEmpleados;
    window.agregarEmpleado = agregarEmpleado;
    window.editarEmpleado = editarEmpleado;
    window.eliminarEmpleado = eliminarEmpleado;
    window.mandarViajero = mandarViajero;

    let tableInstance = null;

    function getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value : "";
    }

    function setVal(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value ?? "";
    }

    function setVisible(id, visible) {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? "block" : "none";
    }

    function setRequired(id, required) {
        const el = document.getElementById(id);
        if (el) el.required = !!required;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function normalizarTipoIdentificacion(valor) {
        const v = String(valor ?? "").trim().toLowerCase();
        if (v.includes("dui")) return "dui";
        if (v.includes("pasaporte")) return "pasaporte";
        return "";
    }

    function normalizarJornadasSeleccionadas(list) {
        if (!Array.isArray(list)) return [];
        return list
            .map(item => {
                if (typeof item === "string" || typeof item === "number") {
                    return String(item).trim();
                }
                if (item && typeof item === "object") {
                    return String(
                        item.id ||
                        item.jornadaId ||
                        item.value ||
                        item.uid ||
                        item.nombre ||
                        ""
                    ).trim();
                }
                return "";
            })
            .filter(Boolean);
    }

    function ensureIdentificacionNombreSelect() {
        const current = document.getElementById("empleado-identificacionNombre");
        if (!current) return null;


        if (current.tagName && current.tagName.toLowerCase() === "select") {
            current.required = true;
            return current;
        }

        const select = document.createElement("select");
        select.id = "empleado-identificacionNombre";
        select.name = current.name || "Documento";
        select.required = true;
        select.style.cssText = current.style ? current.style.cssText : "";

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Seleccione una opción";
        placeholder.disabled = true;
        placeholder.selected = true;
        select.appendChild(placeholder);

        const optDui = document.createElement("option");
        optDui.value = "dui";
        optDui.textContent = "DUI";
        select.appendChild(optDui);

        const optPasaporte = document.createElement("option");
        optPasaporte.value = "pasaporte";
        optPasaporte.textContent = "Pasaporte";
        select.appendChild(optPasaporte);

        if (current.parentNode) {
            current.parentNode.replaceChild(select, current);
        }

        return select;


    }

    function obtenerSemanaActual() {
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

    async function hashPasswordSafe(pass) {
        if (typeof window.hashPassword === "function") {
            return await window.hashPassword(pass);
        }
        if (window.bcrypt && typeof window.bcrypt.hash === "function") {
            return await window.bcrypt.hash(pass, 10);
        }
        throw new Error("No hay función de hash disponible.");
    }

    function resetPasswordFieldsForAdd() {
        setVisible("seccion-contraseña", true);
        setVisible("cambiar-contrasena-empleado-container", false);
        setVisible("nueva-contrasena-empleado-container", false);


        const chk = document.getElementById("cambiar-contrasena-empleado");
        if (chk) chk.checked = false;

        setRequired("register-password", true);
        setRequired("register-password2", true);
        setRequired("nueva-contrasena-empleado", false);


    }

    function resetPasswordFieldsForEdit() {
        setVisible("seccion-contraseña", false);
        setVisible("cambiar-contrasena-empleado-container", true);
        setVisible("nueva-contrasena-empleado-container", false);


        const chk = document.getElementById("cambiar-contrasena-empleado");
        if (chk) chk.checked = false;

        setRequired("register-password", false);
        setRequired("register-password2", false);
        setRequired("nueva-contrasena-empleado", false);


    }

    function limpiarFormularioEmpleado() {
        const form = document.getElementById("empleado-form");
        if (form) form.reset();


        setVal("empleado-nombre", "");
        setVal("empleado-email", "");
        setVal("empleado-identificacionNombre", "");
        setVal("empleado-identificacion", "");
        setVal("empleado-salario", "");
        setVal("empleado-nacimiento", "");
        setVal("descripcion", "");
        setVal("empleado-isss", "");
        setVal("empleado-afp", "");
        setVal("nueva-contrasena-empleado", "");
        setVal("register-password", "");
        setVal("register-password2", "");


    }

    function mostrarSeccionEmpleado(modo) {
        const cont = document.getElementById("empleado-container");
        const tabla = document.getElementById("tabla-empleados");


        if (cont) cont.style.display = "block";
        if (tabla) tabla.style.display = "none";

        const titulo = document.getElementById("titulo-form-empleado");
        if (titulo) titulo.textContent = modo === "edit" ? "Editar Empleado" : "Agregar Empleado";


    }

    function ocultarSeccionEmpleado() {
        const cont = document.getElementById("empleado-container");
        const tabla = document.getElementById("tabla-empleados");


        if (cont) cont.style.display = "none";
        if (tabla) tabla.style.display = "block";


    }

    async function getSessionContext() {
        const fromWindow = window.adminSessionUserData || null;


        if (fromWindow && (fromWindow.role || fromWindow.empresa || fromWindow.sucursal)) {
            return {
                role: String(fromWindow.role || "").trim(),
                empresa: String(fromWindow.empresa || "").trim(),
                sucursal: String(fromWindow.sucursal || "").trim(),
                sessionData: fromWindow
            };
        }

        if (typeof window.getSessionData === "function") {
            const persisted = await window.getSessionData().catch(() => null);
            if (persisted) {
                return {
                    role: String(persisted.role || "").trim(),
                    empresa: String(persisted.empresa || "").trim(),
                    sucursal: String(persisted.sucursal || "").trim(),
                    sessionData: persisted
                };
            }
        }

        return {
            role: "",
            empresa: "",
            sucursal: "",
            sessionData: fromWindow || null
        };


    }

    function hasScopedAdminAccess(context) {
        return !!(context && context.role === "admin" && context.empresa && context.sucursal);
    }

    function mergeAdminContext({ sessionContext }) {
        const sessionReady = hasScopedAdminAccess(sessionContext);
        if (!sessionReady) return null;


        return {
            role: sessionContext.role,
            empresa: sessionContext.empresa,
            sucursal: sessionContext.sucursal,
            source: "session",
            canQueryFirestore: true,
            sessionData: sessionContext.sessionData || null
        };


    }

    async function delay(ms) {
        return await new Promise(resolve => setTimeout(resolve, Number(ms) || 0));
    }

    async function refreshSessionCookie() {
        if (typeof window.refreshSession === "function") {
            try {
                await window.refreshSession();
            } catch (e) {
                console.warn("No se pudo refrescar la sesión local:", e);
            }
        }
    }

    async function ensureAdminContext(operation = "continuar") {
        try {
            if (typeof window.whenAdminReady === "function") {
                await window.whenAdminReady().catch(() => null);
            }
        } catch (_) {
            // noop
        }


        await refreshSessionCookie();

        const sessionContext = await getSessionContext();
        const resolved = mergeAdminContext({ sessionContext });

        if (!resolved) {
            console.warn(`Contexto administrativo incompleto para ${operation}:`, {
                sessionContext,
                adminSessionUserData: window.adminSessionUserData || null
            });
            return null;
        }

        window.adminResolvedContext = resolved;
        window.adminEmpresa = resolved.empresa;
        window.adminSucursal = resolved.sucursal;

        return resolved;


    }

    async function executeWithSessionRetry(operation, context, task) {
        try {
            return await task(context);
        } catch (error) {
            if (error?.code === "permission-denied") {
                console.warn(`${operation}: permiso denegado. Reintentando tras refrescar sesión...`);
                await refreshSessionCookie();
                await delay(300);


                const refreshedContext = await ensureAdminContext(`${operation} (reintento)`);
                if (refreshedContext) {
                    return await task(refreshedContext);
                }
            }

            throw error;
        }


    }

    function normalizeScope(value) {
        return String(value || "").trim();
    }

    function getTokenlessContextOrWarn(operation) {
        return ensureAdminContext(operation);
    }

    async function cargarJornadasEnSelect(seleccionadas = []) {
        const select = document.getElementById("empleado-jornada");
        if (!select) return;


        const context = await getTokenlessContextOrWarn("cargar jornadas");
        if (!context) {
            select.innerHTML = "";
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "No hay contexto admin válido";
            opt.disabled = true;
            select.appendChild(opt);
            return;
        }

        const selectedSet = new Set(normalizarJornadasSeleccionadas(seleccionadas));
        select.innerHTML = "";

        try {
            await executeWithSessionRetry("cargar jornadas", context, async (ctx) => {
                const snap = await model.listJornadasByScope(
                    normalizeScope(ctx.empresa),
                    normalizeScope(ctx.sucursal)
                );

                if (snap.empty) {
                    const optEmpty = document.createElement("option");
                    optEmpty.value = "";
                    optEmpty.textContent = "Sin jornadas disponibles";
                    optEmpty.disabled = true;
                    select.appendChild(optEmpty);
                    return;
                }

                snap.forEach(doc => {
                    const d = doc.data() || {};
                    const nombre = d.nombre || d.titulo || d.descripcion || `Jornada ${doc.id}`;

                    const opt = document.createElement("option");
                    opt.value = doc.id;
                    opt.textContent = nombre;

                    if (selectedSet.has(doc.id) || selectedSet.has(String(nombre).trim())) {
                        opt.selected = true;
                    }

                    select.appendChild(opt);
                });
            });
        } catch (err) {
            console.error("Error cargando jornadas:", err);
            const optError = document.createElement("option");
            optError.value = "";
            optError.textContent = "No se pudieron cargar las jornadas";
            optError.disabled = true;
            select.appendChild(optError);
        }


    }

    async function cargarEmpleados() {
        const context = await getTokenlessContextOrWarn("cargar empleados");
        if (!context) {
            console.warn("No hay contexto administrativo válido para cargar empleados.");
            return;
        }


        const tableEl = document.getElementById("empleadosTable");
        if (!tableEl) return;

        try {
            if (window.$ && $.fn && $.fn.DataTable) {
                if ($.fn.DataTable.isDataTable("#empleadosTable")) {
                    tableInstance = $("#empleadosTable").DataTable();
                    tableInstance.clear().destroy();
                    tableInstance = null;
                }

                tableInstance = $("#empleadosTable").DataTable({
                    destroy: true,
                    scrollX: true,
                    autoWidth: false
                });
                tableInstance.clear();
            }
        } catch (e) {
            console.warn("No se pudo inicializar DataTable:", e);
            tableInstance = null;
        }

        try {
            const snap = await executeWithSessionRetry("cargar empleados", context, async (ctx) => {
                return await model.listEmployeesByScope(
                    normalizeScope(ctx.empresa),
                    normalizeScope(ctx.sucursal)
                );
            });

            const rows = [];

            snap.forEach(doc => {
                const d = doc.data() || {};
                const authUid = String(d.authUid || "").trim();
                const blocked = d.blocked === true;

                if (blocked || !authUid) return;

                const acciones = `
      <button type="button" class="btn-editar-empleado" data-id="${doc.id}" style="background-color:green;">Editar</button>
      <button type="button" class="btn-eliminar-empleado" data-id="${doc.id}" style="background-color:red;">Eliminar</button>
      <button type="button" class="btn-viajero-empleado" data-id="${doc.id}" style="background-color:blue;">Viajero</button>
    `;

                rows.push([
                    escapeHtml(d.nombre || ""),
                    escapeHtml(d.identificacionNombre || ""),
                    escapeHtml(d.identificacion || ""),
                    escapeHtml(d.nacimiento || ""),
                    escapeHtml(d.email || ""),
                    escapeHtml(d.descripcion || ""),
                    acciones
                ]);
            });

            if (tableInstance) {
                tableInstance.clear();
                rows.forEach(row => tableInstance.row.add(row));
                tableInstance.draw();
            } else {
                const tbody = tableEl.querySelector("tbody");
                if (tbody) {
                    tbody.innerHTML = "";
                    rows.forEach(row => {
                        const tr = document.createElement("tr");
                        tr.innerHTML = row.map(c => `<td>${c}</td>`).join("");
                        tbody.appendChild(tr);
                    });
                }
            }
        } catch (err) {
            console.error("Error cargando empleados:", err);
        }


    }

    async function agregarEmpleado() {
        const context = await ensureAdminContext("agregar empleado");
        if (!context) return;


        ensureIdentificacionNombreSelect();
        window.currentEditingEmployeeId = null;
        limpiarFormularioEmpleado();
        mostrarSeccionEmpleado("add");
        resetPasswordFieldsForAdd();
        await cargarJornadasEnSelect([]);


    }

    async function editarEmpleado(id) {
        const context = await ensureAdminContext("editar empleado");
        if (!context) return;


        ensureIdentificacionNombreSelect();
        window.currentEditingEmployeeId = id;

        try {
            const doc = await executeWithSessionRetry("leer empleado", context, async () => {
                return await model.getEmployeeById(id);
            });

            if (!doc) {
                alert("Empleado no encontrado");
                return;
            }

            const data = doc.data() || {};

            setVal("empleado-nombre", data.nombre);
            setVal("empleado-email", data.email);
            setVal("empleado-identificacionNombre", normalizarTipoIdentificacion(data.identificacionNombre));
            setVal("empleado-identificacion", data.identificacion);
            setVal("empleado-salario", data.salarioH);
            setVal("empleado-nacimiento", data.nacimiento);
            setVal("descripcion", data.descripcion || "");
            setVal("empleado-isss", data.isss || "");
            setVal("empleado-afp", data.afp || "");

            resetPasswordFieldsForEdit();
            await cargarJornadasEnSelect(data.jornadas || []);
            mostrarSeccionEmpleado("edit");
        } catch (error) {
            console.error("Error al editar empleado:", error);
            alert("No se pudo abrir el empleado para edición.");
        }


    }

    async function eliminarEmpleado(id) {
        const context = await ensureAdminContext("eliminar empleado");
        if (!context) return;


        if (!confirm("¿Eliminar empleado?")) return;

        try {
            const doc = await executeWithSessionRetry("leer empleado a eliminar", context, async () => {
                return await model.getEmployeeById(id);
            });

            if (!doc) {
                alert("Empleado no encontrado");
                return;
            }

            const data = doc.data() || {};
            const authUid = String(data.authUid || "").trim();

            if (!authUid) {
                alert("Este empleado no tiene authUid. No se puede eliminar por completo desde el cliente.");
                return;
            }

            if (typeof window.eliminarUsuarioCompleto === "function") {
                await window.eliminarUsuarioCompleto(authUid, doc.id);
            } else {
                await executeWithSessionRetry("eliminar empleado en Firestore", context, async () => {
                    await model.deleteEmployeeFirestore(doc.id);
                });
            }

            alert("Empleado eliminado correctamente");
            await cargarEmpleados();
        } catch (e) {
            console.error("Error eliminando empleado:", e);
            alert("Error al eliminar: " + (e.message || e));
        }


    }

    async function mandarViajero(id) {
        const context = await ensureAdminContext("marcar viajero");
        if (!context) return;


        try {
            await executeWithSessionRetry("marcar viajero", context, async () => {
                await model.markAsViajero(id, true);
            });

            alert("Marcado como viajero");
            await cargarEmpleados();
        } catch (e) {
            console.error("Error marcando viajero:", e);
            alert("Error marcando viajero: " + (e.message || e));
        }


    }

    async function guardarEmpleado(e) {
        e.preventDefault();


        const context = await ensureAdminContext("guardar empleado");
        if (!context) return;

        const nombre = getVal("empleado-nombre").trim();
        const email = getVal("empleado-email").trim();
        const identificacionNombre = getVal("empleado-identificacionNombre").trim();
        const identificacion = getVal("empleado-identificacion").trim();
        const isss = getVal("empleado-isss").trim();
        const afp = getVal("empleado-afp").trim();
        const salarioHRaw = getVal("empleado-salario").trim();
        const nacimiento = getVal("empleado-nacimiento").trim();
        const descripcion = getVal("descripcion").trim();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!nombre) return alert("El nombre es obligatorio.");
        if (!identificacion) return alert("La identificación es obligatoria.");
        if (!identificacionNombre) return alert("El tipo de identificación es obligatorio.");
        if (!email || !emailPattern.test(email)) return alert("Por favor, ingresa un correo válido.");

        const salarioH = Number(salarioHRaw);
        if (Number.isNaN(salarioH) || salarioH < 0) {
            return alert("El salario por hora debe ser un número válido.");
        }

        const jornadaSel = document.getElementById("empleado-jornada");
        const jornadasSeleccionadas = jornadaSel
            ? Array.from(jornadaSel.selectedOptions).map(o => o.value).filter(Boolean)
            : [];

        const scope = {
            empresa: normalizeScope(context.empresa),
            sucursal: normalizeScope(context.sucursal)
        };

        const baseData = {
            nombre,
            email,
            identificacionNombre,
            identificacion,
            salarioH,
            nacimiento,
            descripcion: descripcion || "Sin descripción",
            jornadas: jornadasSeleccionadas,
            isss,
            afp,
            sucursal: scope.sucursal,
            empresa: scope.empresa,
            role: "empleado",
            viajero: false
        };

        try {
            if (window.currentEditingEmployeeId) {
                const currentId = window.currentEditingEmployeeId;

                await executeWithSessionRetry("actualizar empleado", context, async () => {
                    const doc = await model.getEmployeeById(currentId);

                    if (!doc) {
                        alert("Empleado no encontrado.");
                        return;
                    }

                    const currentData = doc.data() || {};
                    const currentEmail = String(currentData.email || "").trim();
                    const currentIdentificacion = String(currentData.identificacion || "").trim();

                    const cambiarContrasena = document.getElementById("cambiar-contrasena-empleado");
                    const nuevaContrasena = getVal("nueva-contrasena-empleado").trim();
                    const authUid = String(currentData.authUid || "").trim();

                    const emailDuplicado = await model.existsByField("email", email, scope.empresa, scope.sucursal, currentId);
                    if (emailDuplicado) {
                        alert("Ya existe otro usuario con ese correo.");
                        return;
                    }

                    const idDuplicada = await model.existsByField("identificacion", identificacion, scope.empresa, scope.sucursal, currentId);
                    if (idDuplicada) {
                        alert("Ya existe otro usuario con esa identificación.");
                        return;
                    }

                    const updateData = { ...baseData };

                    if (email !== currentEmail) updateData.email = email;
                    if (identificacion !== currentIdentificacion) updateData.identificacion = identificacion;

                    if (cambiarContrasena && cambiarContrasena.checked) {
                        if (!nuevaContrasena) {
                            alert("Ingresa la nueva contraseña.");
                            return;
                        }

                        updateData.passwordHash = await hashPasswordSafe(nuevaContrasena);

                        const currentUser = window.firebase?.auth?.()?.currentUser || null;
                        if (currentUser && authUid && currentUser.uid === authUid) {
                            try {
                                await currentUser.updatePassword(nuevaContrasena);
                            } catch (authErr) {
                                console.warn("No se pudo actualizar la contraseña de Firebase Auth:", authErr);
                            }
                        } else {
                            alert("La contraseña se actualizó en Firestore. Para cambiar la contraseña real de otro usuario en Firebase Auth necesitas Admin SDK en backend.");
                        }
                    }

                    await model.updateEmployeeFirestore(currentId, updateData);
                });

                alert("Empleado actualizado correctamente");
            } else {
                const pass = getVal("register-password").trim();
                const pass2 = getVal("register-password2").trim();

                if (!pass || pass !== pass2) {
                    alert("Las contraseñas no coinciden");
                    return;
                }

                await executeWithSessionRetry("crear empleado", context, async () => {
                    const emailDuplicado = await model.existsByField("email", email, scope.empresa, scope.sucursal);
                    if (emailDuplicado) {
                        alert("Ya existe un usuario con ese correo.");
                        return;
                    }

                    const idDuplicada = await model.existsByField("identificacion", identificacion, scope.empresa, scope.sucursal);
                    if (idDuplicada) {
                        alert("Ya existe un usuario con esa identificación.");
                        return;
                    }

                    if (typeof window.crearUsuarioCompleto !== "function") {
                        throw new Error("No existe window.crearUsuarioCompleto.");
                    }

                    const hashedPassword = await hashPasswordSafe(pass);

                    await window.crearUsuarioCompleto({
                        ...baseData,
                        password: pass,
                        passwordHash: hashedPassword
                    });
                });

                alert("Empleado agregado correctamente");
            }

            window.currentEditingEmployeeId = null;
            limpiarFormularioEmpleado();
            ocultarSeccionEmpleado();
            resetPasswordFieldsForAdd();
            await cargarEmpleados();
        } catch (error) {
            console.error("Error al guardar el empleado:", error);
            alert("Error al guardar el empleado: " + (error.message || error));
        }


    }

    function bindUI() {
        const menuToggle = document.getElementById("menu-toggle");
        if (menuToggle && !menuToggle.dataset.bound) {
            menuToggle.dataset.bound = "1";
            menuToggle.addEventListener("click", () => {
                document.getElementById("navbar-links")?.classList.toggle("active");
            });
        }


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

        const btnAgregar = document.getElementById("btn-agregar-empleado");
        if (btnAgregar && !btnAgregar.dataset.bound) {
            btnAgregar.dataset.bound = "1";
            btnAgregar.addEventListener("click", agregarEmpleado);
        }

        const btnCancelar = document.getElementById("btn-cancelar-empleado");
        if (btnCancelar && !btnCancelar.dataset.bound) {
            btnCancelar.dataset.bound = "1";
            btnCancelar.addEventListener("click", () => {
                if (typeof window.cancelarFormulario === "function") {
                    window.cancelarFormulario();
                }
                window.currentEditingEmployeeId = null;
                limpiarFormularioEmpleado();
                ocultarSeccionEmpleado();
                resetPasswordFieldsForAdd();
            });
        }

        const cambiarChk = document.getElementById("cambiar-contrasena-empleado");
        const nuevaCont = document.getElementById("nueva-contrasena-empleado-container");
        const nuevaInp = document.getElementById("nueva-contrasena-empleado");

        if (cambiarChk && !cambiarChk.dataset.bound) {
            cambiarChk.dataset.bound = "1";
            cambiarChk.addEventListener("change", () => {
                if (nuevaCont) nuevaCont.style.display = cambiarChk.checked ? "block" : "none";
                if (nuevaInp) nuevaInp.required = cambiarChk.checked;
            });
        }

        const form = document.getElementById("empleado-form");
        if (form && !form.dataset.bound) {
            form.dataset.bound = "1";
            form.addEventListener("submit", guardarEmpleado);
        }

        const tableBody = document.querySelector("#empleadosTable tbody");
        if (tableBody && !tableBody.dataset.bound) {
            tableBody.dataset.bound = "1";
            tableBody.addEventListener("click", (e) => {
                const btnEditar = e.target.closest(".btn-editar-empleado");
                const btnEliminar = e.target.closest(".btn-eliminar-empleado");
                const btnViajero = e.target.closest(".btn-viajero-empleado");

                if (btnEditar) return editarEmpleado(btnEditar.dataset.id);
                if (btnEliminar) return eliminarEmpleado(btnEliminar.dataset.id);
                if (btnViajero) return mandarViajero(btnViajero.dataset.id);
            });
        }


    }

    function initPasswordAndFormState() {
        ensureIdentificacionNombreSelect();
        resetPasswordFieldsForAdd();
        ocultarSeccionEmpleado();
    }

    async function init() {
        const context = await ensureAdminContext("inicializar el módulo de empleados");
        if (!context) {
            console.warn("No se pudo inicializar el módulo de empleados por falta de contexto válido.");
            return;
        }


        bindUI();
        initPasswordAndFormState();

        if (document.getElementById("empleado-jornada")) {
            await cargarJornadasEnSelect([]);
        }

        if (document.getElementById("empleadosTable")) {
            await cargarEmpleados();
        }


    }

    document.addEventListener("DOMContentLoaded", init);

    window.addEventListener("auth:session-updated", () => {
        if (document.getElementById("empleadosTable")) {
            cargarEmpleados().catch(() => { });
        }
        if (document.getElementById("empleado-jornada")) {
            cargarJornadasEnSelect([]).catch(() => { });
        }
    });
})();