export default class EmpleadosModel {
    constructor(db) {
        if (!db) {
            throw new Error("Firestore no está disponible.");
        }
        this.db = db;
    }

    normalize(value) {
        return String(value || "").trim();
    }

    async getEmployeeById(id) {
        const cleanId = this.normalize(id);
        if (!cleanId) return null;

        try {
            const byDocId = await this.db.collection("usuarios").doc(cleanId).get();
            if (byDocId.exists) {
                return byDocId;
            }

            const byAuthUid = await this.db.collection("usuarios")
                .where("authUid", "==", cleanId)
                .limit(1)
                .get();

            if (!byAuthUid.empty) {
                return byAuthUid.docs[0];
            }

            return null;
        } catch (error) {
            console.error("Error consultando empleado por uid/id:", error);
            throw error;
        }
    }

    async getEmployeeByAuthUid(authUid) {
        const cleanUid = this.normalize(authUid);
        if (!cleanUid) return null;

        try {
            const snap = await this.db.collection("usuarios")
                .where("authUid", "==", cleanUid)
                .limit(1)
                .get();

            if (snap.empty) return null;
            return snap.docs[0];
        } catch (error) {
            console.error("Error consultando empleado por authUid:", error);
            throw error;
        }
    }

    async listEmployeesByScope(empresa = "", sucursal = "") {
        const cleanEmpresa = this.normalize(empresa);
        const cleanSucursal = this.normalize(sucursal);

        if (!cleanEmpresa || !cleanSucursal) {
            throw new Error("Scope incompleto: empresa y sucursal son obligatorios para consultar empleados.");
        }

        const query = this.db.collection("usuarios")
            .where("role", "==", "empleado")
            .where("empresa", "==", cleanEmpresa)
            .where("sucursal", "==", cleanSucursal);

        return await query.get();
    }

    async listJornadasByScope(empresa = "", sucursal = "") {
        const cleanEmpresa = this.normalize(empresa);
        const cleanSucursal = this.normalize(sucursal);

        if (!cleanEmpresa || !cleanSucursal) {
            throw new Error("Scope incompleto: empresa y sucursal son obligatorios para consultar jornadas.");
        }

        const query = this.db.collection("jornadas")
            .where("empresa", "==", cleanEmpresa)
            .where("sucursal", "==", cleanSucursal);

        return await query.get();
    }

    async existsByField(field, value, empresa = "", sucursal = "", excludeId = null) {
        const cleanValue = this.normalize(value);
        const cleanEmpresa = this.normalize(empresa);
        const cleanSucursal = this.normalize(sucursal);

        if (!cleanValue) return false;

        try {
            let query = this.db.collection("usuarios")
                .where(field, "==", cleanValue);

            if (cleanEmpresa) {
                query = query.where("empresa", "==", cleanEmpresa);
            }

            if (cleanSucursal) {
                query = query.where("sucursal", "==", cleanSucursal);
            }

            const snap = await query.get();

            let exists = false;
            snap.forEach(doc => {
                if (!excludeId || doc.id !== excludeId) {
                    exists = true;
                }
            });

            return exists;
        } catch (error) {
            console.error(`Error consultando existencia por ${field}:`, error);
            throw error;
        }
    }

    async updateEmployeeFirestore(id, data) {
        const cleanId = this.normalize(id);
        if (!cleanId) throw new Error("ID requerido para actualizar.");

        await this.db.collection("usuarios").doc(cleanId).update(data);
    }

    async markAsViajero(id, value = true) {
        const cleanId = this.normalize(id);
        if (!cleanId) throw new Error("ID requerido.");

        await this.db.collection("usuarios").doc(cleanId).update({ viajero: !!value });
    }

    async deleteEmployeeFirestore(id) {
        const cleanId = this.normalize(id);
        if (!cleanId) throw new Error("ID requerido para eliminar.");

        await this.db.collection("usuarios").doc(cleanId).delete();
    }
}