/* js/controllers/admin.planilla.controller.js */

import PlanillaModel from "../models/planilla.model.js";

(function () {
    "use strict";

    const db =
        window.db;

    if (!db) {
        console.error(
            "Firestore no está inicializado."
        );

        return;
    }

    const model =
        new PlanillaModel(
            db
        );

    const DEFAULT_ISSS_RATE =
        0.03;

    const DEFAULT_AFP_RATE =
        0.0725;

    /*
     * Cache de pagos manuales.
     *
     * La clave representa:
     *
     * empresa::sucursal::fechaInicio::fechaFin
     *
     * El valor contiene:
     *
     * empleadoId -> total pagado en ese rango
     */
    const pagosManualesCache =
        new Map();

    let lastPlanillaData = {
        rows: [],
        empleados: {},
        asistencias: [],
        jornadasMap: {},
        pagosManuales: {},
        fechas: {
            inicio: "",
            fin: ""
        },
        scope: {
            empresa: "",
            sucursal: ""
        },
        aplicarNocturno: false
    };

    function obtenerSemanaActualLocal() {
        const hoy =
            new Date();

        const d =
            hoy.getDay() || 7;

        const inicio =
            new Date(
                hoy
            );

        inicio.setDate(
            hoy.getDate() -
                d +
                1
        );

        const fin =
            new Date(
                inicio
            );

        fin.setDate(
            inicio.getDate() +
                6
        );

        return {
            inicio:
                inicio
                    .toISOString()
                    .split("T")[0],

            fin:
                fin
                    .toISOString()
                    .split("T")[0]
        };
    }

    function crearFechaCompletaLocal(
        fechaStr,
        timeStr
    ) {
        if (!fechaStr) {
            fechaStr =
                new Date()
                    .toISOString()
                    .split("T")[0];
        }

        timeStr =
            timeStr ||
            "00:00";

        const esPM =
            /p\.?m\.?/i.test(
                timeStr
            );

        const esAM =
            /a\.?m\.?/i.test(
                timeStr
            );

        const clean =
            String(
                timeStr
            )
                .replace(
                    /a\.?m\.?|p\.?m\.?/gi,
                    ""
                )
                .trim();

        const parts =
            clean
                .split(":")
                .map(
                    n =>
                        parseInt(
                            n,
                            10
                        )
                );

        let h =
            Number.isFinite(
                parts[0]
            )
                ? parts[0]
                : 0;

        let m =
            Number.isFinite(
                parts[1]
            )
                ? parts[1]
                : 0;

        let s =
            Number.isFinite(
                parts[2]
            )
                ? parts[2]
                : 0;

        if (
            esPM &&
            h < 12
        ) {
            h += 12;
        }

        if (
            esAM &&
            h === 12
        ) {
            h = 0;
        }

        const dt =
            new Date(
                `${fechaStr}T00:00:00`
            );

        dt.setHours(
            h,
            m,
            s,
            0
        );

        return dt;
    }

    function esJornadaNocturnaLocal(
        nombre
    ) {
        if (!nombre) {
            return false;
        }

        const low =
            String(
                nombre
            )
                .toLowerCase();

        return [
            "noche",
            "nocturna",
            "nocturno",
            "nocturnas"
        ].some(
            s =>
                low.includes(
                    s
                )
        );
    }

    function esperarAdminReady() {
        if (
            typeof window.whenAdminReady ===
            "function"
        ) {
            return window.whenAdminReady();
        }

        return Promise.resolve(
            window.adminSessionUserData ||
                null
        );
    }

    function getEmpresaSucursal() {
        return {
            empresa:
                String(
                    window.adminEmpresa ||
                        ""
                ).trim(),

            sucursal:
                String(
                    window.adminSucursal ||
                        ""
                ).trim()
        };
    }

    function toNumber(
        value,
        fallback = 0
    ) {
        if (
            value === null ||
            value === undefined ||
            value === ""
        ) {
            return fallback;
        }

        const n =
            Number(
                value
            );

        return Number.isFinite(
            n
        )
            ? n
            : fallback;
    }

    function redondearMoneda(
        value
    ) {
        return (
            Math.round(
                toNumber(
                    value,
                    0
                ) *
                    100
            ) / 100
        );
    }

    function parsePercent(
        value
    ) {
        const n =
            Number(
                value
            );

        if (
            !Number.isFinite(n) ||
            n <= 0
        ) {
            return null;
        }

        if (
            n <= 1
        ) {
            return n;
        }

        return n / 100;
    }

    function firstExistingNumber(
        obj,
        keys
    ) {
        if (!obj) {
            return null;
        }

        for (
            const key of
            keys
        ) {
            if (
                Object.prototype.hasOwnProperty.call(
                    obj,
                    key
                )
            ) {
                const n =
                    Number(
                        obj[key]
                    );

                if (
                    Number.isFinite(
                        n
                    )
                ) {
                    return n;
                }
            }
        }

        return null;
    }

    function firstExistingPercent(
        obj,
        keys
    ) {
        if (!obj) {
            return null;
        }

        for (
            const key of
            keys
        ) {
            if (
                Object.prototype.hasOwnProperty.call(
                    obj,
                    key
                )
            ) {
                const p =
                    parsePercent(
                        obj[key]
                    );

                if (
                    p !== null
                ) {
                    return p;
                }
            }
        }

        return null;
    }

    function getAyudaEconomica(
        emp
    ) {
        return (
            firstExistingNumber(
                emp,
                [
                    "ayudaEconomica",
                    "ayuda_economica",
                    "ayudaEconomicaMonto",
                    "bono",
                    "bonificacion",
                    "subsidio",
                    "subsidioEconomico"
                ]
            ) ?? 0
        );
    }

    function getEmpleadoJornadaId(
        emp,
        fallbackJornadaId = ""
    ) {
        if (!emp) {
            return String(
                fallbackJornadaId ||
                    ""
            ).trim();
        }

        const fromDirect =
            emp.jornadaId ||
            emp.jornada ||
            emp.jornada_id;

        if (fromDirect) {
            return String(
                fromDirect
            ).trim();
        }

        if (
            Array.isArray(
                emp.jornadas
            ) &&
            emp.jornadas.length > 0 &&
            emp.jornadas[0]
        ) {
            return String(
                emp.jornadas[0]
            ).trim();
        }

        return String(
            fallbackJornadaId ||
                ""
        ).trim();
    }

    function getJornadaHoras(
        jm
    ) {
        if (!jm) {
            return 0;
        }

        const inicio =
            crearFechaCompletaLocal(
                "2000-01-01",
                jm.start ||
                    "00:00"
            );

        const fin =
            crearFechaCompletaLocal(
                "2000-01-01",
                jm.end ||
                    "00:00"
            );

        let diff =
            (
                fin -
                inicio
            ) / 3600000;

        if (
            diff <= 0
        ) {
            diff += 24;
        }

        return Number.isFinite(
            diff
        ) && diff > 0
            ? diff
            : 0;
    }

    function calcularDeduccion(
        base,
        emp,
        amountKeys,
        percentKeys,
        fallbackRate,
        presenceKeys = []
    ) {
        const monto =
            firstExistingNumber(
                emp,
                amountKeys
            );

        if (
            monto !== null
        ) {
            return Math.max(
                0,
                monto
            );
        }

        const porcentaje =
            firstExistingPercent(
                emp,
                percentKeys
            );

        if (
            porcentaje !==
            null
        ) {
            return Math.max(
                0,
                base *
                    porcentaje
            );
        }

        const tieneCampo =
            presenceKeys.some(
                key =>
                    Object.prototype.hasOwnProperty.call(
                        emp || {},
                        key
                    )
            );

        if (
            tieneCampo &&
            fallbackRate > 0
        ) {
            return Math.max(
                0,
                base *
                    fallbackRate
            );
        }

        return 0;
    }

    function formatMoney(
        value
    ) {
        const n =
            toNumber(
                value,
                0
            );

        return `$${n.toFixed(
            2
        )}`;
    }

    function formatHours(
        value
    ) {
        const n =
            toNumber(
                value,
                0
            );

        return n.toFixed(
            2
        );
    }

    function escapeHtml(
        value
    ) {
        return String(
            value ?? ""
        )
            .replaceAll(
                "&",
                "&amp;"
            )
            .replaceAll(
                "<",
                "&lt;"
            )
            .replaceAll(
                ">",
                "&gt;"
            )
            .replaceAll(
                '"',
                "&quot;"
            )
            .replaceAll(
                "'",
                "&#039;"
            );
    }

    function normalizarIdentificador(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        return String(
            value
        )
            .trim()
            .toLowerCase();
    }

    function normalizarNombre(
        value
    ) {
        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        return String(
            value
        )
            .trim()
            .toLowerCase()
            .normalize(
                "NFD"
            )
            .replace(
                /[\u0300-\u036f]/g,
                ""
            )
            .replace(
                /\s+/g,
                " "
            );
    }

    /*
     * ---------------------------------------------------------
     * ÍNDICE DE EMPLEADOS
     * ---------------------------------------------------------
     */

    function construirIndiceEmpleados(
        empleados
    ) {
        const indice = {
            porId: {},
            porIdentificador: {},
            porNombre: {}
        };

        Object.values(
            empleados
        ).forEach(
            emp => {
                if (!emp) {
                    return;
                }

                const id =
                    normalizarIdentificador(
                        emp.id
                    );

                if (id) {
                    indice.porId[
                        id
                    ] = emp;
                }

                const identificadores = [
                    emp.id,
                    emp.uid,
                    emp.authUid,
                    emp.userId,
                    emp.usuarioId,
                    emp.auth_id,
                    emp.usuario_id,
                    emp.firebaseUid,
                    emp.firebaseUID,
                    emp.email,
                    emp.correo
                ];

                identificadores.forEach(
                    valor => {
                        const key =
                            normalizarIdentificador(
                                valor
                            );

                        if (!key) {
                            return;
                        }

                        if (
                            !indice
                                .porIdentificador[
                                key
                            ]
                        ) {
                            indice
                                .porIdentificador[
                                    key
                                ] = emp;
                        }
                    }
                );

                const nombre =
                    normalizarNombre(
                        emp.nombre
                    );

                if (nombre) {
                    if (
                        !indice
                            .porNombre[
                            nombre
                        ]
                    ) {
                        indice.porNombre[
                            nombre
                        ] = emp;
                    }
                }
            }
        );

        return indice;
    }

    function resolverEmpleadoAsistencia(
        asistencia,
        indice
    ) {
        if (
            !asistencia ||
            !indice
        ) {
            return null;
        }

        const candidatos = [
            asistencia.userId,
            asistencia.uid,
            asistencia.authUid,
            asistencia.usuarioId,
            asistencia.auth_id,
            asistencia.usuario_id
        ];

        for (
            const candidato of
            candidatos
        ) {
            const key =
                normalizarIdentificador(
                    candidato
                );

            if (
                key &&
                indice
                    .porIdentificador[
                    key
                ]
            ) {
                return indice
                    .porIdentificador[
                    key
                ];
            }
        }

        const correos = [
            asistencia.email,
            asistencia.correo,
            asistencia.userEmail,
            asistencia.usuarioEmail
        ];

        for (
            const correo of
            correos
        ) {
            const key =
                normalizarIdentificador(
                    correo
                );

            if (
                key &&
                indice
                    .porIdentificador[
                    key
                ]
            ) {
                return indice
                    .porIdentificador[
                    key
                ];
            }
        }

        const posiblesNombres = [
            asistencia.user,
            asistencia.usuario,
            asistencia.nombre,
            asistencia.nombreUsuario,
            asistencia.empleado
        ];

        for (
            const posibleNombre of
            posiblesNombres
        ) {
            const nombre =
                normalizarNombre(
                    posibleNombre
                );

            if (
                nombre &&
                indice
                    .porNombre[
                    nombre
                ]
            ) {
                return indice
                    .porNombre[
                    nombre
                ];
            }
        }

        return null;
    }

    /*
     * ---------------------------------------------------------
     * PAGOS MANUALES
     * ---------------------------------------------------------
     */

    function crearClavePagoPeriodo(
        empresa,
        sucursal,
        fechaInicio,
        fechaFin
    ) {
        return [
            empresa,
            sucursal,
            fechaInicio,
            fechaFin
        ]
            .map(
                value =>
                    String(
                        value ?? ""
                    ).trim()
            )
            .join(
                "::"
            );
    }

    function obtenerEditorActual() {
        const usuario =
            window.adminSessionUserData ||
            {};

        return String(
            usuario.uid ||
            usuario.id ||
            usuario.authUid ||
            usuario.userId ||
            usuario.email ||
            ""
        ).trim();
    }

    /*
     * Obtiene el total correspondiente exclusivamente
     * a los días actualmente seleccionados.
     *
     * Puede proceder del nuevo mapa diario o, mientras
     * todavía no haya migración, del formato antiguo.
     */
    function obtenerPagoManualEmpleado(
        empleado,
        fechaInicio,
        fechaFin
    ) {
        if (
            !empleado
        ) {
            return null;
        }

        const total =
            model.obtenerTotalPagadoPeriodo(
                empleado,
                fechaInicio,
                fechaFin
            );

        if (
            total === null
        ) {
            return null;
        }

        return redondearMoneda(
            total
        );
    }

    async function cargarPagosManualesPeriodo(
        empleados,
        empresa,
        sucursal,
        fechaInicio,
        fechaFin
    ) {
        const ids =
            Object.keys(
                empleados || {}
            );

        if (
            !empresa ||
            !sucursal ||
            !fechaInicio ||
            !fechaFin ||
            ids.length === 0
        ) {
            return {};
        }

        const cachePeriodoKey =
            crearClavePagoPeriodo(
                empresa,
                sucursal,
                fechaInicio,
                fechaFin
            );

        if (
            pagosManualesCache.has(
                cachePeriodoKey
            )
        ) {
            return {
                ...(
                    pagosManualesCache.get(
                        cachePeriodoKey
                    ) || {}
                )
            };
        }

        const pagos =
            {};

        /*
         * Los empleados ya se cargaron desde Firestore.
         *
         * Por ello no se necesita ninguna consulta adicional.
         */
        ids.forEach(
            empleadoId => {
                const empleado =
                    empleados[
                        empleadoId
                    ];

                const total =
                    obtenerPagoManualEmpleado(
                        empleado,
                        fechaInicio,
                        fechaFin
                    );

                if (
                    total !== null
                ) {
                    pagos[
                        empleadoId
                    ] =
                        total;
                }
            }
        );

        pagosManualesCache.set(
            cachePeriodoKey,
            {
                ...pagos
            }
        );

        return {
            ...pagos
        };
    }

    function actualizarCachePago(
        empresa,
        sucursal,
        empleadoId,
        fechaInicio,
        fechaFin,
        monto
    ) {
        const cachePeriodoKey =
            crearClavePagoPeriodo(
                empresa,
                sucursal,
                fechaInicio,
                fechaFin
            );

        const actual =
            pagosManualesCache.get(
                cachePeriodoKey
            ) || {};

        const actualizado = {
            ...actual
        };

        const id =
            String(
                empleadoId
            ).trim();

        if (
            monto === null ||
            monto === undefined
        ) {
            delete actualizado[
                id
            ];
        } else {
            actualizado[
                id
            ] =
                redondearMoneda(
                    monto
                );
        }

        pagosManualesCache.set(
            cachePeriodoKey,
            actualizado
        );
    }

    /*
     * Actualiza localmente la fila después de guardar
     * o restaurar el pago.
     */
    function actualizarFilaDesdePagos(
        row,
        empleado,
        fechaInicio,
        fechaFin
    ) {
        if (
            !row ||
            !empleado
        ) {
            return;
        }

        const pagoManual =
            obtenerPagoManualEmpleado(
                empleado,
                fechaInicio,
                fechaFin
            );

        if (
            pagoManual !== null
        ) {
            row.totalPagado =
                redondearMoneda(
                    pagoManual
                );
        } else {
            row.totalPagado =
                redondearMoneda(
                    row._totalPagadoCalculado
                );
        }

        actualizarSaldoRow(
            row
        );
    }

    async function guardarTotalPagadoInput(
        input
    ) {
        if (
            !input ||
            input.disabled
        ) {
            return;
        }

        const empresa =
            String(
                input.dataset.empresa ||
                    ""
            ).trim();

        const sucursal =
            String(
                input.dataset.sucursal ||
                    ""
            ).trim();

        const empleadoId =
            String(
                input.dataset.employeeId ||
                    ""
            ).trim();

        const fechaInicio =
            String(
                input.dataset.fechaInicio ||
                    ""
            ).trim();

        const fechaFin =
            String(
                input.dataset.fechaFin ||
                    ""
            ).trim();

        if (
            !empresa ||
            !sucursal ||
            !empleadoId ||
            !fechaInicio ||
            !fechaFin
        ) {
            alert(
                "No hay información suficiente para guardar el pago del período."
            );

            return;
        }

        const row =
            lastPlanillaData.rows.find(
                item =>
                    String(
                        item.uid
                    ) ===
                    empleadoId
            );

        const empleado =
            lastPlanillaData.empleados[
                empleadoId
            ];

        const periodoSigueVisible =
            lastPlanillaData.fechas
                .inicio ===
                fechaInicio &&
            lastPlanillaData.fechas
                .fin ===
                fechaFin;

        const valorAnterior =
            periodoSigueVisible &&
            row
                ? redondearMoneda(
                    row.totalPagado
                )
                : 0;

        const raw =
            String(
                input.value ?? ""
            ).trim();

        /*
         * -----------------------------------------------------
         * CELDA VACÍA
         * -----------------------------------------------------
         *
         * Restaura el valor histórico existente para esos días.
         *
         * Si no existe un pago histórico, esos días vuelven
         * al cálculo automático.
         */
        if (
            !raw
        ) {
            input.disabled =
                true;

            try {
                const resultado =
                    await model.eliminarPagoPeriodo(
                        empresa,
                        sucursal,
                        empleadoId,
                        fechaInicio,
                        fechaFin
                    );

                actualizarCachePago(
                    empresa,
                    sucursal,
                    empleadoId,
                    fechaInicio,
                    fechaFin,
                    null
                );

                /*
                 * Actualizar mapa diario local.
                 */
                if (
                    empleado
                ) {
                    empleado.planillaPagosDiarios =
                        {
                            ...(
                                resultado
                                    ?.pagosDiarios ||
                                {}
                            )
                        };
                }

                if (
                    periodoSigueVisible &&
                    row
                ) {
                    actualizarFilaDesdePagos(
                        row,
                        empleado,
                        fechaInicio,
                        fechaFin
                    );

                    input.value =
                        row.totalPagado.toFixed(
                            2
                        );

                    actualizarCeldaSaldo(
                        input,
                        row
                    );
                }
            } catch (
                error
            ) {
                console.error(
                    "Error al restaurar el pago del período:",
                    error
                );

                if (
                    periodoSigueVisible &&
                    row
                ) {
                    row.totalPagado =
                        valorAnterior;

                    actualizarSaldoRow(
                        row
                    );

                    input.value =
                        valorAnterior.toFixed(
                            2
                        );

                    actualizarCeldaSaldo(
                        input,
                        row
                    );
                }

                alert(
                    "No se pudo restaurar el pago del período. Revisa los permisos de actualización de usuarios."
                );
            } finally {
                input.disabled =
                    false;

                input.dataset.previousValue =
                    input.value;
            }

            return;
        }

        /*
         * -----------------------------------------------------
         * VALIDAR NUEVO TOTAL
         * -----------------------------------------------------
         */

        const numero =
            Number(
                raw.replace(
                    ",",
                    "."
                )
            );

        if (
            !Number.isFinite(
                numero
            ) ||
            numero < 0
        ) {
            alert(
                "El Total Ya Pagado debe ser un número mayor o igual a cero."
            );

            input.value =
                valorAnterior.toFixed(
                    2
                );

            return;
        }

        const nuevoTotal =
            redondearMoneda(
                numero
            );

        input.disabled =
            true;

        try {
            /*
             * El nuevo total se reparte entre los días del
             * período seleccionado.
             *
             * Los días fuera del filtro no se modifican.
             */
            const resultado =
                await model.guardarPagoPeriodo(
                    empresa,
                    sucursal,
                    empleadoId,
                    fechaInicio,
                    fechaFin,
                    nuevoTotal,
                    obtenerEditorActual()
                );

            actualizarCachePago(
                empresa,
                sucursal,
                empleadoId,
                fechaInicio,
                fechaFin,
                nuevoTotal
            );

            /*
             * Actualizar el empleado en memoria.
             *
             * Esto es necesario porque no queremos hacer
             * otra lectura de Firestore inmediatamente.
             */
            if (
                empleado
            ) {
                empleado.planillaPagosDiarios =
                    {
                        ...(
                            resultado
                                ?.pagosDiarios ||
                            {}
                        )
                    };
            }

            if (
                periodoSigueVisible &&
                row
            ) {
                row.totalPagado =
                    redondearMoneda(
                        nuevoTotal
                    );

                actualizarSaldoRow(
                    row
                );

                input.value =
                    row.totalPagado.toFixed(
                        2
                    );

                actualizarCeldaSaldo(
                    input,
                    row
                );
            }
        } catch (
            error
        ) {
            console.error(
                "Error al guardar Total Ya Pagado:",
                error
            );

            if (
                periodoSigueVisible &&
                row
            ) {
                row.totalPagado =
                    valorAnterior;

                actualizarSaldoRow(
                    row
                );

                input.value =
                    valorAnterior.toFixed(
                        2
                    );

                actualizarCeldaSaldo(
                    input,
                    row
                );
            }

            alert(
                "No se pudo guardar el Total Ya Pagado. Revisa los permisos de actualización de usuarios."
            );
        } finally {
            input.disabled =
                false;

            input.dataset.previousValue =
                input.value;
        }
    }

    function actualizarSaldoRow(
        row
    ) {
        if (!row) {
            return;
        }

        row.saldoPendiente =
            Math.max(
                0,
                redondearMoneda(
                    row.totalNetoGenerado -
                        row.totalPagado
                )
            );
    }

    function actualizarCeldaSaldo(
        input,
        row
    ) {
        if (
            !input ||
            !row
        ) {
            return;
        }

        const tr =
            input.closest(
                "tr"
            );

        if (!tr) {
            return;
        }

        const saldoTd =
            tr.querySelector(
                "[data-saldo-pendiente]"
            );

        if (
            saldoTd
        ) {
            saldoTd.textContent =
                formatMoney(
                    row.saldoPendiente
                );
        }
    }

    function renderPlanillaRows(
        tableEl,
        rows,
        empresa,
        sucursal,
        fechaInicio,
        fechaFin
    ) {
        const tbody =
            tableEl.querySelector(
                "tbody"
            );

        if (!tbody) {
            return;
        }

        tbody.innerHTML =
            "";

        rows.forEach(
            row => {
                const tr =
                    document.createElement(
                        "tr"
                    );

                const valores = [
                    row.empleado,

                    formatMoney(
                        row.salarioBaseHora
                    ),

                    formatHours(
                        row.horasTrabajadas
                    ),

                    formatHours(
                        row.horasNoTrabajadas
                    ),

                    formatMoney(
                        row.ayudaEconomica
                    ),

                    formatMoney(
                        row.totalBruto
                    ),

                    formatMoney(
                        row.isss
                    ),

                    formatMoney(
                        row.afp
                    ),

                    formatMoney(
                        row.renta
                    ),

                    formatMoney(
                        row.totalNetoGenerado
                    ),

                    String(
                        row.diasPagados
                    )
                ];

                valores.forEach(
                    value => {
                        const td =
                            document.createElement(
                                "td"
                            );

                        td.textContent =
                            String(
                                value ?? ""
                            );

                        tr.appendChild(
                            td
                        );
                    }
                );

                /*
                 * -------------------------------------------------
                 * TOTAL YA PAGADO
                 * -------------------------------------------------
                 */

                const tdPagado =
                    document.createElement(
                        "td"
                    );

                tdPagado.className =
                    "total-ya-pagado-cell";

                const input =
                    document.createElement(
                        "input"
                    );

                input.type =
                    "number";

                input.min =
                    "0";

                input.step =
                    "0.01";

                input.inputMode =
                    "decimal";

                input.className =
                    "planilla-total-pagado-input";

                input.value =
                    redondearMoneda(
                        row.totalPagado
                    ).toFixed(
                        2
                    );

                input.dataset.totalPagado =
                    "1";

                input.dataset.employeeId =
                    String(
                        row.uid
                    );

                input.dataset.empresa =
                    String(
                        empresa
                    );

                input.dataset.sucursal =
                    String(
                        sucursal
                    );

                input.dataset.fechaInicio =
                    String(
                        fechaInicio
                    );

                input.dataset.fechaFin =
                    String(
                        fechaFin
                    );

                input.dataset.previousValue =
                    input.value;

                input.title =
                    "Total ya pagado correspondiente únicamente a los días seleccionados.";

                input.style.width =
                    "100%";

                input.style.minWidth =
                    "85px";

                input.style.maxWidth =
                    "120px";

                input.style.boxSizing =
                    "border-box";

                input.style.textAlign =
                    "center";

                input.style.padding =
                    "6px";

                tdPagado.appendChild(
                    input
                );

                tr.appendChild(
                    tdPagado
                );

                /*
                 * -------------------------------------------------
                 * SALDO PENDIENTE
                 * -------------------------------------------------
                 */

                const tdSaldo =
                    document.createElement(
                        "td"
                    );

                tdSaldo.dataset.saldoPendiente =
                    "1";

                tdSaldo.textContent =
                    formatMoney(
                        row.saldoPendiente
                    );

                tr.appendChild(
                    tdSaldo
                );

                tbody.appendChild(
                    tr
                );
            }
        );
    }

    function bindTotalPagadoEditor(
        tableEl
    ) {
        if (
            !tableEl ||
            tableEl.dataset
                .totalPagadoBound
        ) {
            return;
        }

        tableEl.dataset
            .totalPagadoBound =
            "1";

        /*
         * Guardar al cambiar.
         */
        tableEl.addEventListener(
            "change",
            async event => {
                const input =
                    event.target.closest(
                        "input[data-total-pagado='1']"
                    );

                if (!input) {
                    return;
                }

                await guardarTotalPagadoInput(
                    input
                );
            }
        );

        /*
         * Enter = guardar.
         */
        tableEl.addEventListener(
            "keydown",
            event => {
                const input =
                    event.target.closest(
                        "input[data-total-pagado='1']"
                    );

                if (!input) {
                    return;
                }

                if (
                    event.key ===
                    "Enter"
                ) {
                    event.preventDefault();

                    input.blur();
                }

                if (
                    event.key ===
                    "Escape"
                ) {
                    event.preventDefault();

                    const anterior =
                        input.dataset
                            .previousValue;

                    if (
                        anterior !==
                        undefined
                    ) {
                        input.value =
                            anterior;
                    }

                    input.blur();
                }
            }
        );

        /*
         * Guardar valor anterior.
         */
        tableEl.addEventListener(
            "focusin",
            event => {
                const input =
                    event.target.closest(
                        "input[data-total-pagado='1']"
                    );

                if (!input) {
                    return;
                }

                input.dataset.previousValue =
                    input.value;
            }
        );
    }

    async function cargarJornadasMap() {
        const {
            empresa,
            sucursal
        } =
            getEmpresaSucursal();

        if (
            !empresa ||
            !sucursal
        ) {
            return {};
        }

        const snap =
            await model.getJornadasByScope(
                empresa,
                sucursal
            );

        const jornadasMap =
            {};

        snap.forEach(
            doc => {
                const data =
                    doc.data() ||
                    {};

                jornadasMap[
                    doc.id
                ] = {
                    nombre:
                        data.nombre ||
                        "",

                    start:
                        data.horaEntrada ||
                        "00:00",

                    end:
                        data.horaSalida ||
                        "00:00"
                };
            }
        );

        return jornadasMap;
    }

    async function hayNocturnasEnPeriodo(
        jornadasMap,
        fechaInicio,
        fechaFin
    ) {
        const {
            empresa,
            sucursal
        } =
            getEmpresaSucursal();

        if (
            !empresa ||
            !sucursal
        ) {
            return false;
        }

        const asSnap =
            await model.getAsistenciasByScope(
                empresa,
                sucursal
            );

        let hay =
            false;

        asSnap.forEach(
            doc => {
                const a =
                    doc.data() ||
                    {};

                if (
                    a.fecha &&
                    a.fecha >=
                        fechaInicio &&
                    a.fecha <=
                        fechaFin
                ) {
                    const jornadaId =
                        a.jornadaId ||
                        a.jornada ||
                        a.jornadaDocId;

                    const jm =
                        jornadasMap[
                            jornadaId
                        ];

                    if (
                        jm &&
                        esJornadaNocturnaLocal(
                            jm.nombre
                        )
                    ) {
                        hay =
                            true;
                    }
                }
            }
        );

        return hay;
    }

    function calcularDatosAsistencia(
        asistencia,
        empleado,
        jm
    ) {
        if (
            !asistencia ||
            !jm
        ) {
            return {
                horasTrabajadas: 0,
                horasNormales: 0,
                horasExtra: 0
            };
        }

        const jornadaStart =
            crearFechaCompletaLocal(
                asistencia.fecha,
                jm.start
            );

        const jornadaEnd =
            crearFechaCompletaLocal(
                asistencia.fecha,
                jm.end
            );

        if (
            jornadaEnd <=
            jornadaStart
        ) {
            jornadaEnd.setDate(
                jornadaEnd.getDate() +
                    1
            );
        }

        const realStart =
            (
                asistencia.consentidaEntrada ||
                asistencia.entrada ===
                    "Consentida"
            )
                ? jornadaStart
                : asistencia.entrada
                    ? crearFechaCompletaLocal(
                        asistencia.fecha,
                        asistencia.entrada
                    )
                    : jornadaStart;

        let realEnd =
            null;

        if (
            asistencia.salida &&
            asistencia.salida !==
                "Consentida"
        ) {
            realEnd =
                crearFechaCompletaLocal(
                    asistencia.fecha,
                    asistencia.salida
                );

            if (
                realEnd <=
                    realStart &&
                asistencia.entrada
            ) {
                realEnd.setDate(
                    realEnd.getDate() +
                        1
                );
            }
        } else if (
            asistencia.consentidaSalida ||
            asistencia.salida ===
                "Consentida"
        ) {
            realEnd =
                jornadaEnd;
        }

        if (
            realEnd &&
            realEnd <
                realStart
        ) {
            return {
                horasTrabajadas: 0,
                horasNormales: 0,
                horasExtra: 0
            };
        }

        let horasNormales =
            0;

        let horasExtra =
            0;

        if (realEnd) {
            horasNormales =
                Math.max(
                    0,
                    Math.min(
                        realEnd.getTime(),
                        jornadaEnd.getTime()
                    ) -
                        realStart.getTime()
                ) /
                3600000;

            horasExtra =
                Math.max(
                    0,
                    realEnd.getTime() -
                        jornadaEnd.getTime()
                ) /
                3600000;
        } else {
            const duracion =
                (
                    jornadaEnd.getTime() -
                    jornadaStart.getTime()
                ) /
                3600000;

            horasNormales =
                (
                    asistencia.consentidaEntrada ||
                    empleado?.viajero
                )
                    ? duracion
                    : duracion / 2;
        }

        horasNormales =
            Math.round(
                horasNormales *
                    100
            ) / 100;

        horasExtra =
            Math.round(
                horasExtra *
                    100
            ) / 100;

        const horasTrabajadas =
            Math.round(
                (
                    horasNormales +
                    horasExtra
                ) *
                    100
            ) / 100;

        return {
            horasTrabajadas,
            horasNormales,
            horasExtra
        };
    }

    function calcularPagoDia(
        asistencia,
        empleado,
        jm,
        aplicarNocturno
    ) {
        const datos =
            calcularDatosAsistencia(
                asistencia,
                empleado,
                jm
            );

        const salarioHora =
            toNumber(
                empleado?.salarioH,
                0
            );

        const factorNocturno =
            (
                aplicarNocturno &&
                jm &&
                esJornadaNocturnaLocal(
                    jm.nombre
                )
            )
                ? 1.5
                : 1;

        const pago =
            datos.horasTrabajadas *
            salarioHora *
            factorNocturno;

        return Math.round(
            pago * 100
        ) / 100;
    }

    async function calcularPlanillaSemanal(
        fechaInicio,
        fechaFin,
        aplicarNocturno = false,
        jornadasMap = null
    ) {
        const tableEl =
            document.getElementById(
                "planillaTable"
            );

        if (!tableEl) {
            return;
        }

        const ready =
            await esperarAdminReady();

        if (
            !ready &&
            !window.adminSessionUserData
        ) {
            return;
        }

        const {
            empresa,
            sucursal
        } =
            getEmpresaSucursal();

        if (
            !empresa ||
            !sucursal
        ) {
            return;
        }

        if (!jornadasMap) {
            jornadasMap =
                await cargarJornadasMap();
        }

        /*
         * ---------------------------------------------------------
         * EMPLEADOS
         * ---------------------------------------------------------
         */

        const empSnap =
            await model.getEmpleadosByScope(
                empresa,
                sucursal
            );

        const empleados = {};

        empSnap.forEach(
            doc => {
                empleados[
                    doc.id
                ] = {
                    id:
                        doc.id,

                    ...(doc.data() ||
                        {})
                };
            }
        );

        /*
         * ---------------------------------------------------------
         * PAGOS MANUALES
         * ---------------------------------------------------------
         *
         * Aquí se calcula únicamente la parte pagada de los
         * días comprendidos en el período seleccionado.
         */
        const pagosManualesPeriodo =
            await cargarPagosManualesPeriodo(
                empleados,
                empresa,
                sucursal,
                fechaInicio,
                fechaFin
            );

        /*
         * ---------------------------------------------------------
         * ASISTENCIAS
         * ---------------------------------------------------------
         */

        const indiceEmpleados =
            construirIndiceEmpleados(
                empleados
            );

        const asSnap =
            await model.getAsistenciasByScope(
                empresa,
                sucursal
            );

        const grupos = {};

        const asistenciasFiltradas =
            [];

        asSnap.forEach(
            doc => {
                const d =
                    doc.data() ||
                    {};

                if (
                    !d.fecha ||
                    d.fecha <
                        fechaInicio ||
                    d.fecha >
                        fechaFin
                ) {
                    return;
                }

                if (
                    !d.entrada &&
                    !d.consentidaEntrada
                ) {
                    return;
                }

                const emp =
                    resolverEmpleadoAsistencia(
                        d,
                        indiceEmpleados
                    );

                asistenciasFiltradas.push(
                    {
                        id:
                            doc.id,

                        ...d,

                        empleadoId:
                            emp?.id ||
                            "",

                        empleadoNombre:
                            emp?.nombre ||
                            d.user ||
                            d.usuario ||
                            d.nombre ||
                            ""
                    }
                );

                if (!emp) {
                    console.warn(
                        "No se pudo vincular la asistencia con un empleado:",
                        {
                            asistenciaId:
                                doc.id,

                            userId:
                                d.userId ||
                                "",

                            uid:
                                d.uid ||
                                "",

                            authUid:
                                d.authUid ||
                                "",

                            usuarioId:
                                d.usuarioId ||
                                "",

                            user:
                                d.user ||
                                "",

                            nombre:
                                d.nombre ||
                                ""
                        }
                    );

                    return;
                }

                const employeeId =
                    emp.id;

                if (
                    !grupos[
                        employeeId
                    ]
                ) {
                    grupos[
                        employeeId
                    ] = {
                        horasTrabajadas:
                            0,

                        horasProgramadas:
                            0,

                        baseSalarial:
                            0,

                        diasPagados:
                            0,

                        totalPagado:
                            0
                    };
                }

                const jornadaId =
                    d.jornadaId ||
                    d.jornada ||
                    d.jornadaDocId ||
                    getEmpleadoJornadaId(
                        emp,
                        ""
                    );

                const jm =
                    jornadasMap[
                        jornadaId
                    ];

                if (!jm) {
                    return;
                }

                const datos =
                    calcularDatosAsistencia(
                        d,
                        emp,
                        jm
                    );

                const salarioHora =
                    toNumber(
                        emp.salarioH,
                        0
                    );

                const factorNocturno =
                    (
                        aplicarNocturno &&
                        esJornadaNocturnaLocal(
                            jm.nombre
                        )
                    )
                        ? 1.5
                        : 1;

                grupos[
                    employeeId
                ].horasTrabajadas +=
                    datos.horasTrabajadas;

                grupos[
                    employeeId
                ].baseSalarial +=
                    datos.horasTrabajadas *
                    salarioHora *
                    factorNocturno;

                /*
                 * Cálculo automático original.
                 */
                if (
                    d.pagada === true
                ) {
                    grupos[
                        employeeId
                    ].diasPagados +=
                        1;

                    grupos[
                        employeeId
                    ].totalPagado +=
                        calcularPagoDia(
                            d,
                            emp,
                            jm,
                            aplicarNocturno
                        );
                }
            }
        );

        /*
         * ---------------------------------------------------------
         * DÍAS DEL PERÍODO
         * ---------------------------------------------------------
         */

        const start =
            new Date(
                fechaInicio
            );

        const end =
            new Date(
                fechaFin
            );

        let totalDias =
            0;

        for (
            let d =
                new Date(
                    start
                );

            d <= end;

            d.setDate(
                d.getDate() +
                    1
            )
        ) {
            totalDias++;
        }

        /*
         * ---------------------------------------------------------
         * GARANTIZAR TODOS LOS EMPLEADOS
         * ---------------------------------------------------------
         */

        for (
            const employeeId in
            empleados
        ) {
            const emp =
                empleados[
                    employeeId
                ];

            const jornadaId =
                getEmpleadoJornadaId(
                    emp,
                    ""
                );

            const jm =
                jornadaId
                    ? jornadasMap[
                          jornadaId
                      ]
                    : null;

            if (
                !grupos[
                    employeeId
                ]
            ) {
                grupos[
                    employeeId
                ] = {
                    horasTrabajadas:
                        0,

                    horasProgramadas:
                        0,

                    baseSalarial:
                        0,

                    diasPagados:
                        0,

                    totalPagado:
                        0
                };
            }

            const jornadaHoras =
                getJornadaHoras(
                    jm
                );

            if (
                jornadaHoras > 0
            ) {
                grupos[
                    employeeId
                ].horasProgramadas =
                    totalDias *
                    jornadaHoras;
            }
        }

        /*
         * ---------------------------------------------------------
         * CONSTRUIR FILAS
         * ---------------------------------------------------------
         */

        const rows = [];

        for (
            const employeeId in
            empleados
        ) {
            const emp =
                empleados[
                    employeeId
                ] || {};

            const g =
                grupos[
                    employeeId
                ];

            const salarioBaseHora =
                toNumber(
                    emp.salarioH,
                    0
                );

            const ayudaEconomica =
                getAyudaEconomica(
                    emp
                );

            const totalBruto =
                g.baseSalarial +
                ayudaEconomica;

            const isss =
                calcularDeduccion(
                    g.baseSalarial,
                    emp,
                    [
                        "isssMonto",
                        "montoIsss"
                    ],
                    [
                        "isssPorcentaje",
                        "isssRate"
                    ],
                    DEFAULT_ISSS_RATE,
                    [
                        "isss"
                    ]
                );

            const afp =
                calcularDeduccion(
                    g.baseSalarial,
                    emp,
                    [
                        "afpMonto",
                        "montoAfp"
                    ],
                    [
                        "afpPorcentaje",
                        "afpRate"
                    ],
                    DEFAULT_AFP_RATE,
                    [
                        "afp"
                    ]
                );

            const renta =
                calcularDeduccion(
                    g.baseSalarial,
                    emp,
                    [
                        "rentaMonto",
                        "montoRenta"
                    ],
                    [
                        "rentaPorcentaje",
                        "rentaRate"
                    ],
                    0,
                    [
                        "renta"
                    ]
                );

            const totalDeducciones =
                isss +
                afp +
                renta;

            const totalNetoGenerado =
                totalBruto -
                totalDeducciones;

            /*
             * Cálculo automático original.
             */
            const totalPagadoCalculado =
                redondearMoneda(
                    g.totalPagado ||
                        0
                );

            /*
             * -----------------------------------------------------
             * TOTAL YA PAGADO DEL RANGO
             * -----------------------------------------------------
             *
             * Si existe una distribución manual para alguno de
             * los días seleccionados, se utiliza la suma de esos
             * días.
             *
             * Si no existe, se conserva el cálculo automático
             * basado en pagada === true.
             */
            const existePagoManual =
                Object.prototype.hasOwnProperty.call(
                    pagosManualesPeriodo,
                    employeeId
                );

            const totalPagado =
                existePagoManual
                    ? redondearMoneda(
                        pagosManualesPeriodo[
                            employeeId
                        ]
                    )
                    : totalPagadoCalculado;

            const diasPagados =
                g.diasPagados ||
                0;

            const saldoPendiente =
                Math.max(
                    0,
                    redondearMoneda(
                        totalNetoGenerado -
                            totalPagado
                    )
                );

            const horasNoTrabajadas =
                Math.max(
                    0,
                    (
                        g.horasProgramadas ||
                        0
                    ) -
                        (
                            g.horasTrabajadas ||
                            0
                        )
                );

            rows.push({
                uid:
                    employeeId,

                empleado:
                    emp.nombre ||
                    emp.usuario ||
                    emp.email ||
                    "Usuario sin nombre",

                salarioBaseHora,

                horasTrabajadas:
                    Math.round(
                        g.horasTrabajadas *
                            100
                    ) / 100,

                horasNoTrabajadas:
                    Math.round(
                        horasNoTrabajadas *
                            100
                    ) / 100,

                ayudaEconomica:
                    redondearMoneda(
                        ayudaEconomica
                    ),

                totalBruto:
                    redondearMoneda(
                        totalBruto
                    ),

                isss:
                    redondearMoneda(
                        isss
                    ),

                afp:
                    redondearMoneda(
                        afp
                    ),

                renta:
                    redondearMoneda(
                        renta
                    ),

                totalNetoGenerado:
                    redondearMoneda(
                        totalNetoGenerado
                    ),

                diasPagados,

                totalPagado,

                saldoPendiente,

                /*
                 * Respaldo del cálculo automático.
                 */
                _totalPagadoCalculado:
                    totalPagadoCalculado
            });
        }

        lastPlanillaData = {
            rows,

            empleados,

            asistencias:
                asistenciasFiltradas,

            jornadasMap,

            pagosManuales:
                pagosManualesPeriodo,

            fechas: {
                inicio:
                    fechaInicio,

                fin:
                    fechaFin
            },

            scope: {
                empresa,
                sucursal
            },

            aplicarNocturno
        };

        renderPlanillaRows(
            tableEl,
            rows,
            empresa,
            sucursal,
            fechaInicio,
            fechaFin
        );

        bindTotalPagadoEditor(
            tableEl
        );

        return lastPlanillaData;
    }

    async function mostrarPlanilla() {
        const ready =
            await esperarAdminReady();

        if (
            !ready &&
            !window.adminSessionUserData
        ) {
            return;
        }

        const navLinks =
            document.getElementById(
                "navbar-links"
            );

        if (navLinks) {
            navLinks.classList.remove(
                "active"
            );
        }

        const planillaCont =
            document.getElementById(
                "planilla-container"
            );

        if (!planillaCont) {
            return;
        }

        planillaCont.style.display =
            "block";

        const semana =
            obtenerSemanaActualLocal();

        const inicioEl =
            document.getElementById(
                "fechaInicio"
            );

        const finEl =
            document.getElementById(
                "fechaFin"
            );

        const chk =
            document.getElementById(
                "aplicar-nocturno"
            );

        const inicio =
            (
                inicioEl &&
                inicioEl.value
            ) ||
            semana.inicio;

        const fin =
            (
                finEl &&
                finEl.value
            ) ||
            semana.fin;

        if (
            inicioEl &&
            !inicioEl.value
        ) {
            inicioEl.value =
                inicio;
        }

        if (
            finEl &&
            !finEl.value
        ) {
            finEl.value =
                fin;
        }

        const jornadasMap =
            await cargarJornadasMap();

        const aplicarAuto =
            await hayNocturnasEnPeriodo(
                jornadasMap,
                inicio,
                fin
            );

        if (chk) {
            chk.checked =
                aplicarAuto;
        }

        await calcularPlanillaSemanal(
            inicio,
            fin,
            chk
                ? chk.checked
                : false,
            jornadasMap
        );

        if (
            chk &&
            !chk.dataset.bound
        ) {
            chk.dataset.bound =
                "1";

            chk.addEventListener(
                "change",
                async () => {
                    const ini =
                        inicioEl
                            ? inicioEl.value
                            : semana.inicio;

                    const fn =
                        finEl
                            ? finEl.value
                            : semana.fin;

                    const jm =
                        await cargarJornadasMap();

                    await calcularPlanillaSemanal(
                        ini,
                        fn,
                        chk.checked,
                        jm
                    );
                }
            );
        }
    }

    function imprimirPlanilla() {
        const contenidoEl =
            document.getElementById(
                "planilla-container"
            );

        const contenido =
            contenidoEl
                ? contenidoEl.innerHTML
                : "";

        const w =
            window.open(
                "",
                "",
                "width=1000,height=700"
            );

        if (!w) {
            alert(
                "No se pudo abrir la ventana de impresión."
            );

            return;
        }

        w.document.write(`
            <html>

                <head>

                    <title>
                        Imprimir planilla
                    </title>

                    <link
                        rel="stylesheet"
                        href="css/admin.css"
                    >

                    <style>

                        body {
                            font-family:
                                "Poppins",
                                sans-serif;
                            padding:
                                20px;
                        }

                        table {
                            width:
                                100%;
                            border-collapse:
                                collapse;
                        }

                        th,
                        td {
                            border:
                                1px solid #ddd;
                            padding:
                                8px;
                            text-align:
                                center;
                        }

                        th {
                            background:
                                #007bff;
                            color:
                                #fff;
                        }

                        .planilla-total-pagado-input {
                            border:
                                none;
                            outline:
                                none;
                            background:
                                transparent;
                            width:
                                100%;
                            max-width:
                                120px;
                            text-align:
                                center;
                            font:
                                inherit;
                        }

                    </style>

                </head>

                <body>
                    ${contenido}
                </body>

            </html>
        `);

        w.document.close();

        w.focus();

        w.print();

        w.close();
    }

    async function descargarExcel() {
        const {
            empresa,
            sucursal
        } =
            getEmpresaSucursal();

        const inicioSel =
            document.getElementById(
                "fechaInicio"
            )?.value || "";

        const finSel =
            document.getElementById(
                "fechaFin"
            )?.value || "";

        if (
            !inicioSel ||
            !finSel
        ) {
            alert(
                "Selecciona ambas fechas antes de descargar el Excel."
            );

            return;
        }

        if (
            !empresa ||
            !sucursal
        ) {
            alert(
                "No hay datos suficientes para exportar."
            );

            return;
        }

        try {
            const jornadasMap =
                await cargarJornadasMap();

            const data =
                await calcularPlanillaSemanal(
                    inicioSel,
                    finSel,
                    document.getElementById(
                        "aplicar-nocturno"
                    )?.checked ||
                        false,
                    jornadasMap
                );

            if (!data) {
                return;
            }

            if (
                typeof XLSX ===
                "undefined"
            ) {
                alert(
                    "La librería XLSX no está disponible."
                );

                return;
            }

            const wb =
                XLSX.utils.book_new();

            const wsPlanilla =
                XLSX.utils.json_to_sheet(
                    data.rows.map(
                        r => ({
                            Empleado:
                                r.empleado,

                            "Salario Base/Hora":
                                r.salarioBaseHora,

                            "Horas Trabajadas":
                                r.horasTrabajadas,

                            "Horas No Trabajadas":
                                r.horasNoTrabajadas,

                            "Ayuda Económica":
                                r.ayudaEconomica,

                            "Total Bruto":
                                r.totalBruto,

                            ISSS:
                                r.isss,

                            AFP:
                                r.afp,

                            Renta:
                                r.renta,

                            "Total Neto Generado":
                                r.totalNetoGenerado,

                            "Días Pagados":
                                r.diasPagados,

                            "Total Ya Pagado":
                                r.totalPagado,

                            "Saldo Pendiente":
                                r.saldoPendiente
                        })
                    )
                );

            XLSX.utils.book_append_sheet(
                wb,
                wsPlanilla,
                "Planilla"
            );

            const wsAsistencias =
                XLSX.utils.json_to_sheet(
                    data.asistencias.map(
                        a => ({
                            Usuario:
                                a.empleadoNombre ||
                                a.user ||
                                a.usuario ||
                                a.nombre ||
                                "",

                            Fecha:
                                a.fecha ||
                                "",

                            Entrada:
                                a.entrada ||
                                "",

                            Salida:
                                a.salida ||
                                "",

                            Estado:
                                a.status ||
                                "",

                            Justificacion:
                                a.justificacion ||
                                "",

                            Pagada:
                                a.pagada ===
                                true
                                    ? "Sí"
                                    : "No"
                        })
                    )
                );

            XLSX.utils.book_append_sheet(
                wb,
                wsAsistencias,
                "Asistencias"
            );

            const wsEmpleados =
                XLSX.utils.json_to_sheet(
                    Object.values(
                        data.empleados
                    ).map(
                        u => ({
                            Nombre:
                                u.nombre ||
                                "",

                            Documento:
                                u.identificacionNombre ||
                                "",

                            Identificacion:
                                u.identificacion ||
                                "",

                            Correo:
                                u.email ||
                                "",

                            Jornada:
                                Array.isArray(
                                    u.jornadas
                                )
                                    ? u.jornadas.join(
                                        ", "
                                    )
                                    : (
                                        u.jornada ||
                                        ""
                                    ),

                            SalarioHora:
                                toNumber(
                                    u.salarioH,
                                    0
                                )
                        })
                    )
                );

            XLSX.utils.book_append_sheet(
                wb,
                wsEmpleados,
                "Usuarios"
            );

            const nombreArchivo =
                `Planilla_${empresa}_${sucursal}_${inicioSel}_a_${finSel}.xlsx`;

            XLSX.writeFile(
                wb,
                nombreArchivo
            );
        } catch (
            e
        ) {
            console.error(
                e
            );

            alert(
                "Error al exportar Excel"
            );
        }
    }

    function bindPlanillaUI() {
        const filtrarEl =
            document.getElementById(
                "filtrar"
            );

        if (
            filtrarEl &&
            !filtrarEl.dataset.bound
        ) {
            filtrarEl.dataset.bound =
                "1";

            filtrarEl.addEventListener(
                "click",
                async () => {
                    const inicioSel =
                        document.getElementById(
                            "fechaInicio"
                        )?.value ||
                        "";

                    const finSel =
                        document.getElementById(
                            "fechaFin"
                        )?.value ||
                        "";

                    const chk =
                        document.getElementById(
                            "aplicar-nocturno"
                        );

                    if (
                        !inicioSel ||
                        !finSel
                    ) {
                        alert(
                            "Selecciona ambas fechas para filtrar la planilla"
                        );

                        return;
                    }

                    const jornadasMap =
                        await cargarJornadasMap();

                    const aplicarAuto =
                        await hayNocturnasEnPeriodo(
                            jornadasMap,
                            inicioSel,
                            finSel
                        );

                    if (chk) {
                        chk.checked =
                            aplicarAuto;
                    }

                    await calcularPlanillaSemanal(
                        inicioSel,
                        finSel,
                        chk
                            ? chk.checked
                            : false,
                        jornadasMap
                    );
                }
            );
        }

        const btnImprimir =
            document.getElementById(
                "btn-imprimir-planilla"
            );

        if (
            btnImprimir &&
            !btnImprimir.dataset.bound
        ) {
            btnImprimir.dataset.bound =
                "1";

            btnImprimir.addEventListener(
                "click",
                imprimirPlanilla
            );
        }

        const btnExcel =
            document.getElementById(
                "btn-descargar-excel"
            );

        if (
            btnExcel &&
            !btnExcel.dataset.bound
        ) {
            btnExcel.dataset.bound =
                "1";

            btnExcel.addEventListener(
                "click",
                descargarExcel
            );
        }

        const tableEl =
            document.getElementById(
                "planillaTable"
            );

        bindTotalPagadoEditor(
            tableEl
        );
    }

    function bindNavigation() {
        const logoutBtn =
            document.getElementById(
                "logout-button"
            );

        if (
            logoutBtn &&
            !logoutBtn.dataset.bound
        ) {
            logoutBtn.dataset.bound =
                "1";

            logoutBtn.addEventListener(
                "click",
                () => {
                    if (
                        typeof window.logout ===
                        "function"
                    ) {
                        window.logout({
                            redirect: true
                        });
                    } else {
                        window.location.href =
                            "index.html";
                    }
                }
            );
        }

        const menuToggle =
            document.getElementById(
                "menu-toggle"
            );

        if (
            menuToggle &&
            !menuToggle.dataset.bound
        ) {
            menuToggle.dataset.bound =
                "1";

            menuToggle.addEventListener(
                "click",
                () => {
                    const nav =
                        document.getElementById(
                            "navbar-links"
                        );

                    if (nav) {
                        nav.classList.toggle(
                            "active"
                        );
                    }
                }
            );
        }
    }

    async function initPage() {
        bindNavigation();

        bindPlanillaUI();

        const ready =
            await esperarAdminReady();

        if (
            !ready &&
            !window.adminSessionUserData
        ) {
            return;
        }

        const semana =
            obtenerSemanaActualLocal();

        const inicio =
            document.getElementById(
                "fechaInicio"
            );

        const fin =
            document.getElementById(
                "fechaFin"
            );

        if (
            inicio &&
            !inicio.value
        ) {
            inicio.value =
                semana.inicio;
        }

        if (
            fin &&
            !fin.value
        ) {
            fin.value =
                semana.fin;
        }

        await mostrarPlanilla();
    }

    window.cargarJornadasMap =
        cargarJornadasMap;

    window.hayNocturnasEnPeriodo =
        hayNocturnasEnPeriodo;

    window.mostrarPlanilla =
        mostrarPlanilla;

    window.calcularPlanillaSemanal =
        calcularPlanillaSemanal;

    window.imprimirPlanilla =
        imprimirPlanilla;

    window.descargarExcel =
        descargarExcel;

    document.addEventListener(
        "DOMContentLoaded",
        initPage
    );
})();