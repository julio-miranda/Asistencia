/* js/models/planilla.model.js */

export default class PlanillaModel {

    constructor(db) {
        if (!db) {
            throw new Error(
                "Firestore no está disponible."
            );
        }

        this.db = db;
    }

    async getEmpleadosByScope(
        empresa = "",
        sucursal = ""
    ) {
        const query =
            this.db
                .collection("usuarios")
                .where(
                    "empresa",
                    "==",
                    String(
                        empresa
                    ).trim()
                )
                .where(
                    "sucursal",
                    "==",
                    String(
                        sucursal
                    ).trim()
                )
                .where(
                    "role",
                    "==",
                    "empleado"
                );

        return await query.get();
    }

    async getJornadasByScope(
        empresa = "",
        sucursal = ""
    ) {
        const query =
            this.db
                .collection("jornadas")
                .where(
                    "empresa",
                    "==",
                    String(
                        empresa
                    ).trim()
                )
                .where(
                    "sucursal",
                    "==",
                    String(
                        sucursal
                    ).trim()
                );

        return await query.get();
    }

    async getAsistenciasByScope(
        empresa = "",
        sucursal = ""
    ) {
        const query =
            this.db
                .collection("asistencias")
                .where(
                    "empresa",
                    "==",
                    String(
                        empresa
                    ).trim()
                )
                .where(
                    "sucursal",
                    "==",
                    String(
                        sucursal
                    ).trim()
                );

        return await query.get();
    }

    async getJornadaById(
        id
    ) {
        if (!id) {
            return null;
        }

        const doc =
            await this.db
                .collection("jornadas")
                .doc(
                    String(
                        id
                    )
                )
                .get();

        return doc.exists
            ? doc
            : null;
    }

    /*
     * ---------------------------------------------------------
     * PAGOS DE PLANILLA
     * ---------------------------------------------------------
     *
     * Los pagos efectivos se mantienen por día:
     *
     * usuarios/{empleadoId}
     *
     * campo:
     *
     * planillaPagosDiarios
     *
     * Ejemplo:
     *
     * planillaPagosDiarios: {
     *     "2026-09-28": 7.142857142857143,
     *     "2026-09-29": 7.142857142857143,
     *     "2026-09-30": 7.142857142857143,
     *     "2026-10-01": 7.142857142857143
     * }
     *
     * Esto permite consultar cualquier rango de fechas
     * sin perder la información de pagos parciales.
     */

    crearPagoPeriodoDocId(
        fechaInicio = "",
        fechaFin = ""
    ) {
        const inicio =
            String(
                fechaInicio
            ).trim();

        const fin =
            String(
                fechaFin
            ).trim();

        if (
            !inicio ||
            !fin
        ) {
            throw new Error(
                "Las fechas del período son obligatorias."
            );
        }

        return [
            inicio,
            fin
        ].join(
            "__"
        );
    }

    crearPagoPeriodoRef(
        empleadoId = ""
    ) {
        if (!empleadoId) {
            throw new Error(
                "El ID del empleado es obligatorio."
            );
        }

        return this.db
            .collection(
                "usuarios"
            )
            .doc(
                String(
                    empleadoId
                ).trim()
            );
    }

    /*
     * ---------------------------------------------------------
     * FECHAS
     * ---------------------------------------------------------
     */

    esFechaValida(
        fecha
    ) {
        if (!fecha) {
            return false;
        }

        const value =
            String(
                fecha
            ).trim();

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(
                value
            )
        ) {
            return false;
        }

        const partes =
            value.split(
                "-"
            );

        const year =
            Number(
                partes[0]
            );

        const month =
            Number(
                partes[1]
            );

        const day =
            Number(
                partes[2]
            );

        if (
            !Number.isInteger(
                year
            ) ||
            !Number.isInteger(
                month
            ) ||
            !Number.isInteger(
                day
            )
        ) {
            return false;
        }

        const dt =
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day
                )
            );

        return (
            dt.getUTCFullYear() ===
                year &&
            dt.getUTCMonth() ===
                month - 1 &&
            dt.getUTCDate() ===
                day
        );
    }

    crearFechaUTC(
        fecha
    ) {
        if (
            !this.esFechaValida(
                fecha
            )
        ) {
            return null;
        }

        const partes =
            String(
                fecha
            ).split(
                "-"
            );

        return new Date(
            Date.UTC(
                Number(
                    partes[0]
                ),
                Number(
                    partes[1]
                ) - 1,
                Number(
                    partes[2]
                )
            )
        );
    }

    formatearFechaUTC(
        date
    ) {
        if (
            !(date instanceof Date) ||
            Number.isNaN(
                date.getTime()
            )
        ) {
            return "";
        }

        const year =
            date
                .getUTCFullYear()
                .toString()
                .padStart(
                    4,
                    "0"
                );

        const month =
            String(
                date.getUTCMonth() + 1
            ).padStart(
                2,
                "0"
            );

        const day =
            String(
                date.getUTCDate()
            ).padStart(
                2,
                "0"
            );

        return `${year}-${month}-${day}`;
    }

    calcularDiasPeriodo(
        fechaInicio,
        fechaFin
    ) {
        if (
            !this.esFechaValida(
                fechaInicio
            ) ||
            !this.esFechaValida(
                fechaFin
            )
        ) {
            return Number.MAX_SAFE_INTEGER;
        }

        const inicio =
            this.crearFechaUTC(
                fechaInicio
            );

        const fin =
            this.crearFechaUTC(
                fechaFin
            );

        if (
            !inicio ||
            !fin
        ) {
            return Number.MAX_SAFE_INTEGER;
        }

        const diferencia =
            Math.round(
                (
                    fin.getTime() -
                    inicio.getTime()
                ) /
                    86400000
            );

        if (
            diferencia < 0
        ) {
            return Number.MAX_SAFE_INTEGER;
        }

        /*
         * El período es inclusivo.
         *
         * 28/09 → 04/10 = 7 días.
         */
        return (
            diferencia +
            1
        );
    }

    obtenerFechasPeriodo(
        fechaInicio,
        fechaFin
    ) {
        const totalDias =
            this.calcularDiasPeriodo(
                fechaInicio,
                fechaFin
            );

        if (
            totalDias ===
                Number.MAX_SAFE_INTEGER ||
            totalDias <= 0
        ) {
            return [];
        }

        const fechas = [];

        let actual =
            this.crearFechaUTC(
                fechaInicio
            );

        const fin =
            this.crearFechaUTC(
                fechaFin
            );

        if (
            !actual ||
            !fin
        ) {
            return [];
        }

        while (
            actual.getTime() <=
            fin.getTime()
        ) {
            fechas.push(
                this.formatearFechaUTC(
                    actual
                )
            );

            actual =
                new Date(
                    actual.getTime() +
                        86400000
                );
        }

        return fechas;
    }

    /*
     * ---------------------------------------------------------
     * PERÍODOS ANTIGUOS
     * ---------------------------------------------------------
     */

    extraerPeriodoDesdeId(
        periodoId
    ) {
        const partes =
            String(
                periodoId || ""
            ).split(
                "__"
            );

        if (
            partes.length !== 2
        ) {
            return null;
        }

        const fechaInicio =
            String(
                partes[0]
            ).trim();

        const fechaFin =
            String(
                partes[1]
            ).trim();

        if (
            !this.esFechaValida(
                fechaInicio
            ) ||
            !this.esFechaValida(
                fechaFin
            )
        ) {
            return null;
        }

        return {
            fechaInicio,
            fechaFin
        };
    }

    extraerTotalPago(
        valor
    ) {
        if (
            valor === null ||
            valor === undefined
        ) {
            return null;
        }

        if (
            typeof valor ===
                "object" &&
            valor !== null &&
            Object.prototype.hasOwnProperty.call(
                valor,
                "totalYaPagado"
            )
        ) {
            const monto =
                Number(
                    valor.totalYaPagado
                );

            return Number.isFinite(
                monto
            )
                ? monto
                : null;
        }

        const monto =
            Number(
                valor
            );

        return Number.isFinite(
            monto
        )
            ? monto
            : null;
    }

    /*
     * ---------------------------------------------------------
     * MAPA DE PAGOS DIARIOS
     * ---------------------------------------------------------
     */

    normalizarMapaPagosDiarios(
        mapa
    ) {
        const resultado =
            {};

        if (
            !mapa ||
            typeof mapa !==
                "object"
        ) {
            return resultado;
        }

        Object.entries(
            mapa
        ).forEach(
            ([fecha, monto]) => {
                if (
                    !this.esFechaValida(
                        fecha
                    )
                ) {
                    return;
                }

                const numero =
                    Number(
                        monto
                    );

                if (
                    !Number.isFinite(
                        numero
                    )
                ) {
                    return;
                }

                resultado[
                    fecha
                ] =
                    numero;
            }
        );

        return resultado;
    }

    sumarMapaPagosDiarios(
        destino,
        origen
    ) {
        const resultado =
            {
                ...(destino || {})
            };

        Object.entries(
            origen || {}
        ).forEach(
            ([fecha, monto]) => {
                const numero =
                    Number(
                        monto
                    );

                if (
                    !this.esFechaValida(
                        fecha
                    ) ||
                    !Number.isFinite(
                        numero
                    )
                ) {
                    return;
                }

                resultado[
                    fecha
                ] =
                    Number(
                        resultado[
                            fecha
                        ] || 0
                    ) +
                    numero;
            }
        );

        return resultado;
    }

    /*
     * Construye el mapa diario a partir de los pagos
     * almacenados bajo el formato anterior:
     *
     * planillaPagos:
     *
     * 28/09 → 04/10 = 50
     *
     * Cada pago se distribuye uniformemente entre
     * todos los días que cubría originalmente.
     */
    construirMapaDiarioDesdePagos(
        planillaPagos
    ) {
        const pagosDiarios =
            {};

        if (
            !planillaPagos ||
            typeof planillaPagos !==
                "object"
        ) {
            return pagosDiarios;
        }

        Object.entries(
            planillaPagos
        ).forEach(
            ([periodoId, entrada]) => {
                /*
                 * Soportar directamente una eventual
                 * estructura que ya contenga pagos diarios.
                 */
                if (
                    entrada &&
                    typeof entrada ===
                        "object" &&
                    entrada.pagosDiarios &&
                    typeof entrada.pagosDiarios ===
                        "object"
                ) {
                    const mapa =
                        this.normalizarMapaPagosDiarios(
                            entrada.pagosDiarios
                        );

                    Object.entries(
                        mapa
                    ).forEach(
                        ([fecha, monto]) => {
                            pagosDiarios[
                                fecha
                            ] =
                                Number(
                                    pagosDiarios[
                                        fecha
                                    ] || 0
                                ) +
                                monto;
                        }
                    );

                    return;
                }

                const total =
                    this.extraerTotalPago(
                        entrada
                    );

                if (
                    total === null
                ) {
                    return;
                }

                let periodo =
                    null;

                if (
                    entrada &&
                    typeof entrada ===
                        "object" &&
                    this.esFechaValida(
                        entrada.fechaInicio
                    ) &&
                    this.esFechaValida(
                        entrada.fechaFin
                    )
                ) {
                    periodo = {
                        fechaInicio:
                            String(
                                entrada.fechaInicio
                            ).trim(),

                        fechaFin:
                            String(
                                entrada.fechaFin
                            ).trim()
                    };
                } else {
                    periodo =
                        this.extraerPeriodoDesdeId(
                            periodoId
                        );
                }

                if (
                    !periodo
                ) {
                    return;
                }

                const fechas =
                    this.obtenerFechasPeriodo(
                        periodo.fechaInicio,
                        periodo.fechaFin
                    );

                if (
                    fechas.length === 0
                ) {
                    return;
                }

                /*
                 * No se redondea aquí.
                 *
                 * Esto permite:
                 *
                 * 50 / 7 = 7.142857...
                 *
                 * y luego:
                 *
                 * 4 días = 28.57
                 *
                 * mientras que los 7 días siguen sumando 50.00
                 * al redondear el resultado final.
                 */
                const montoDiario =
                    Number(
                        total
                    ) /
                    fechas.length;

                fechas.forEach(
                    fecha => {
                        pagosDiarios[
                            fecha
                        ] =
                            Number(
                                pagosDiarios[
                                    fecha
                                ] || 0
                            ) +
                            montoDiario;
                    }
                );
            }
        );

        return pagosDiarios;
    }

    /*
     * Devuelve el mapa diario efectivo del empleado.
     *
     * Si ya existe planillaPagosDiarios, éste es la fuente
     * de verdad.
     *
     * Si todavía no existe, se genera temporalmente a partir
     * de planillaPagos para mantener compatibilidad con los
     * datos existentes.
     */
    obtenerMapaPagosDiariosEmpleado(
        empleado
    ) {
        if (
            !empleado
        ) {
            return {
                mapa: {},
                tieneMapaDiario: false
            };
        }

        if (
            Object.prototype.hasOwnProperty.call(
                empleado,
                "planillaPagosDiarios"
            ) &&
            empleado.planillaPagosDiarios &&
            typeof empleado.planillaPagosDiarios ===
                "object"
        ) {
            return {
                mapa:
                    this.normalizarMapaPagosDiarios(
                        empleado.planillaPagosDiarios
                    ),

                tieneMapaDiario:
                    true
            };
        }

        return {
            mapa:
                this.construirMapaDiarioDesdePagos(
                    empleado.planillaPagos
                ),

            tieneMapaDiario:
                false
        };
    }

    /*
     * ---------------------------------------------------------
     * CALCULAR TOTAL DE UN PERÍODO
     * ---------------------------------------------------------
     *
     * Retorna:
     *
     *   null -> no existe ningún pago manual para ese rango
     *   número -> existe pago manual, incluso si es 0
     */
    obtenerTotalPagadoPeriodo(
        empleado,
        fechaInicio,
        fechaFin
    ) {
        const resultado =
            this.obtenerMapaPagosDiariosEmpleado(
                empleado
            );

        const mapa =
            resultado.mapa;

        const fechas =
            this.obtenerFechasPeriodo(
                fechaInicio,
                fechaFin
            );

        if (
            fechas.length === 0
        ) {
            return null;
        }

        let existePago =
            false;

        let total =
            0;

        fechas.forEach(
            fecha => {
                if (
                    Object.prototype.hasOwnProperty.call(
                        mapa,
                        fecha
                    )
                ) {
                    existePago =
                        true;

                    total +=
                        Number(
                            mapa[
                                fecha
                            ] || 0
                        );
                }
            }
        );

        if (
            !existePago
        ) {
            return null;
        }

        return Math.round(
            total * 100
        ) / 100;
    }

    /*
     * Compatibilidad con el nombre utilizado anteriormente.
     *
     * Ahora ya no devuelve "un período aplicable".
     * Devuelve el total que corresponde realmente
     * a los días seleccionados.
     */
    obtenerPagoAplicableDeMapa(
        planillaPagos,
        fechaInicio,
        fechaFin,
        planillaPagosDiarios = null
    ) {
        const empleado = {
            planillaPagos,

            ...(planillaPagosDiarios !==
                null
                ? {
                      planillaPagosDiarios
                  }
                : {})
        };

        const total =
            this.obtenerTotalPagadoPeriodo(
                empleado,
                fechaInicio,
                fechaFin
            );

        if (
            total === null
        ) {
            return null;
        }

        return {
            totalYaPagado:
                total,

            fechaInicio:
                fechaInicio,

            fechaFin:
                fechaFin,

            tipo:
                "distribucion_diaria"
        };
    }

    /*
     * ---------------------------------------------------------
     * OBTENER PAGO DE EMPLEADO
     * ---------------------------------------------------------
     */

    async getPagoPeriodo(
        empresa = "",
        sucursal = "",
        empleadoId = "",
        fechaInicio = "",
        fechaFin = ""
    ) {
        if (
            !empresa ||
            !sucursal ||
            !empleadoId ||
            !fechaInicio ||
            !fechaFin
        ) {
            return null;
        }

        const doc =
            await this.crearPagoPeriodoRef(
                empleadoId
            ).get();

        if (
            !doc.exists
        ) {
            return null;
        }

        const data =
            doc.data() ||
            {};

        const total =
            this.obtenerTotalPagadoPeriodo(
                data,
                fechaInicio,
                fechaFin
            );

        if (
            total === null
        ) {
            return null;
        }

        return {
            empleadoId:
                String(
                    empleadoId
                ).trim(),

            empresa:
                String(
                    empresa
                ).trim(),

            sucursal:
                String(
                    sucursal
                ).trim(),

            fechaInicio:
                String(
                    fechaInicio
                ).trim(),

            fechaFin:
                String(
                    fechaFin
                ).trim(),

            totalYaPagado:
                total,

            tipo:
                "distribucion_diaria"
        };
    }

    /*
     * ---------------------------------------------------------
     * GUARDAR PAGO DE UN PERÍODO
     * ---------------------------------------------------------
     *
     * El importe introducido NO se almacena como un único
     * total dependiente del filtro.
     *
     * Se reparte uniformemente entre todos los días
     * seleccionados.
     *
     * Ejemplo:
     *
     * 28/09 → 01/10 = 30
     *
     * Se guarda:
     *
     * 28/09 = 7.50
     * 29/09 = 7.50
     * 30/09 = 7.50
     * 01/10 = 7.50
     *
     * Los demás días del empleado NO se modifican.
     */

    async guardarPagoPeriodo(
        empresa = "",
        sucursal = "",
        empleadoId = "",
        fechaInicio = "",
        fechaFin = "",
        totalYaPagado = 0,
        editadoPor = ""
    ) {
        if (
            !empresa ||
            !sucursal ||
            !empleadoId ||
            !fechaInicio ||
            !fechaFin
        ) {
            throw new Error(
                "Faltan datos para guardar el pago del período."
            );
        }

        const monto =
            Number(
                totalYaPagado
            );

        if (
            !Number.isFinite(
                monto
            ) ||
            monto < 0
        ) {
            throw new Error(
                "El total ya pagado debe ser un número mayor o igual a cero."
            );
        }

        const fechas =
            this.obtenerFechasPeriodo(
                fechaInicio,
                fechaFin
            );

        if (
            fechas.length === 0
        ) {
            throw new Error(
                "El período seleccionado no es válido."
            );
        }

        const empleadoNormalizado =
            String(
                empleadoId
            ).trim();

        const ref =
            this.crearPagoPeriodoRef(
                empleadoNormalizado
            );

        const resultado =
            await this.db.runTransaction(
                async transaction => {
                    const doc =
                        await transaction.get(
                            ref
                        );

                    if (
                        !doc.exists
                    ) {
                        throw new Error(
                            "El empleado no existe."
                        );
                    }

                    const data =
                        doc.data() ||
                        {};

                    let pagosDiarios = {};

                    /*
                     * Si ya existe el nuevo formato,
                     * éste es la fuente de verdad.
                     */
                    if (
                        Object.prototype.hasOwnProperty.call(
                            data,
                            "planillaPagosDiarios"
                        ) &&
                        data.planillaPagosDiarios &&
                        typeof data.planillaPagosDiarios ===
                            "object"
                    ) {
                        pagosDiarios =
                            this.normalizarMapaPagosDiarios(
                                data.planillaPagosDiarios
                            );
                    } else {
                        /*
                         * Primera edición con el nuevo sistema:
                         * convertir automáticamente los pagos
                         * antiguos a valores diarios.
                         */
                        pagosDiarios =
                            this.construirMapaDiarioDesdePagos(
                                data.planillaPagos
                            );
                    }

                    /*
                     * Distribución equitativa.
                     *
                     * No redondear el valor diario para evitar
                     * perder centavos al volver a calcular
                     * períodos completos.
                     */
                    const montoDiario =
                        monto /
                        fechas.length;

                    fechas.forEach(
                        fecha => {
                            pagosDiarios[
                                fecha
                            ] =
                                montoDiario;
                        }
                    );

                    const ahora =
                        new Date();

                    transaction.update(
                        ref,
                        {
                            planillaPagosDiarios:
                                pagosDiarios,

                            planillaPagosUltimaEdicion:
                                {
                                    fechaInicio:
                                        String(
                                            fechaInicio
                                        ).trim(),

                                    fechaFin:
                                        String(
                                            fechaFin
                                        ).trim(),

                                    totalYaPagado:
                                        Math.round(
                                            monto *
                                                100
                                        ) / 100,

                                    editadoPor:
                                        String(
                                            editadoPor ||
                                                ""
                                        ).trim(),

                                    actualizadoEn:
                                        ahora
                                }
                        }
                    );

                    return {
                        pagosDiarios,

                        fechaInicio:
                            String(
                                fechaInicio
                            ).trim(),

                        fechaFin:
                            String(
                                fechaFin
                            ).trim(),

                        totalYaPagado:
                            Math.round(
                                monto *
                                    100
                            ) / 100,

                        diasPeriodo:
                            fechas.length,

                        montoDiario,

                        editadoPor:
                            String(
                                editadoPor ||
                                    ""
                            ).trim()
                    };
                }
            );

        return {
            empleadoId:
                empleadoNormalizado,

            empresa:
                String(
                    empresa
                ).trim(),

            sucursal:
                String(
                    sucursal
                ).trim(),

            ...resultado
        };
    }

    /*
     * ---------------------------------------------------------
     * RESTABLECER PERÍODO
     * ---------------------------------------------------------
     *
     * Si el usuario deja la celda vacía:
     *
     * - si existía un pago histórico antiguo para esos días,
     *   se restaura su distribución;
     * - si no existía, se elimina la asignación manual de esos
     *   días y el controlador volverá al cálculo automático.
     */

    async eliminarPagoPeriodo(
        empresa = "",
        sucursal = "",
        empleadoId = "",
        fechaInicio = "",
        fechaFin = ""
    ) {
        if (
            !empresa ||
            !sucursal ||
            !empleadoId ||
            !fechaInicio ||
            !fechaFin
        ) {
            return null;
        }

        const fechas =
            this.obtenerFechasPeriodo(
                fechaInicio,
                fechaFin
            );

        if (
            fechas.length === 0
        ) {
            return null;
        }

        const empleadoNormalizado =
            String(
                empleadoId
            ).trim();

        const ref =
            this.crearPagoPeriodoRef(
                empleadoNormalizado
            );

        const resultado =
            await this.db.runTransaction(
                async transaction => {
                    const doc =
                        await transaction.get(
                            ref
                        );

                    if (
                        !doc.exists
                    ) {
                        throw new Error(
                            "El empleado no existe."
                        );
                    }

                    const data =
                        doc.data() ||
                        {};

                    let pagosDiarios = {};

                    const tieneMapaDiario =
                        Object.prototype.hasOwnProperty.call(
                            data,
                            "planillaPagosDiarios"
                        ) &&
                        data.planillaPagosDiarios &&
                        typeof data.planillaPagosDiarios ===
                            "object";

                    if (
                        tieneMapaDiario
                    ) {
                        pagosDiarios =
                            this.normalizarMapaPagosDiarios(
                                data.planillaPagosDiarios
                            );
                    } else {
                        pagosDiarios =
                            this.construirMapaDiarioDesdePagos(
                                data.planillaPagos
                            );
                    }

                    /*
                     * Mapa base derivado del historial antiguo.
                     *
                     * Sirve para restaurar los días que tenían
                     * un pago originalmente.
                     */
                    const mapaBase =
                        this.construirMapaDiarioDesdePagos(
                            data.planillaPagos
                        );

                    fechas.forEach(
                        fecha => {
                            if (
                                Object.prototype.hasOwnProperty.call(
                                    mapaBase,
                                    fecha
                                )
                            ) {
                                pagosDiarios[
                                    fecha
                                ] =
                                    mapaBase[
                                        fecha
                                    ];
                            } else {
                                delete pagosDiarios[
                                    fecha
                                ];
                            }
                        }
                    );

                    transaction.update(
                        ref,
                        {
                            planillaPagosDiarios:
                                pagosDiarios,

                            planillaPagosUltimaEdicion:
                                {
                                    fechaInicio:
                                        String(
                                            fechaInicio
                                        ).trim(),

                                    fechaFin:
                                        String(
                                            fechaFin
                                        ).trim(),

                                    totalYaPagado:
                                        null,

                                    editadoPor:
                                        "",

                                    actualizadoEn:
                                        new Date()
                                }
                        }
                    );

                    return {
                        pagosDiarios
                    };
                }
            );

        return {
            empleadoId:
                empleadoNormalizado,

            empresa:
                String(
                    empresa
                ).trim(),

            sucursal:
                String(
                    sucursal
                ).trim(),

            fechaInicio:
                String(
                    fechaInicio
                ).trim(),

            fechaFin:
                String(
                    fechaFin
                ).trim(),

            ...resultado
        };
    }

    /*
     * ---------------------------------------------------------
     * CARGAR PAGOS DE VARIOS EMPLEADOS
     * ---------------------------------------------------------
     */

    async getPagosPeriodo(
        empresa = "",
        sucursal = "",
        empleadoIds = [],
        fechaInicio = "",
        fechaFin = ""
    ) {
        const ids =
            Array.isArray(
                empleadoIds
            )
                ? empleadoIds
                : [];

        if (
            !empresa ||
            !sucursal ||
            !fechaInicio ||
            !fechaFin ||
            ids.length === 0
        ) {
            return {};
        }

        const pagos = {};

        await Promise.all(
            ids.map(
                async empleadoId => {
                    const id =
                        String(
                            empleadoId
                        ).trim();

                    if (!id) {
                        return;
                    }

                    try {
                        const pago =
                            await this.getPagoPeriodo(
                                empresa,
                                sucursal,
                                id,
                                fechaInicio,
                                fechaFin
                            );

                        if (
                            pago &&
                            Number.isFinite(
                                Number(
                                    pago.totalYaPagado
                                )
                            )
                        ) {
                            pagos[
                                id
                            ] =
                                Math.round(
                                    Number(
                                        pago.totalYaPagado
                                    ) *
                                        100
                                ) / 100;
                        }
                    } catch (
                        error
                    ) {
                        console.error(
                            `Error leyendo pago de empleado ${id}:`,
                            error
                        );
                    }
                }
            )
        );

        return pagos;
    }
}