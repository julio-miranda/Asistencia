export default class EmpleadosModel {
    constructor(db) {
        if (!db) {
            throw new Error("Firestore no está disponible.");
        }
        this.db = db;
    }

    async getEmployeeById(id) {
        if (!id) return null;
        const doc = await this.db.collection("usuarios").doc(String(id)).get();
        return doc.exists ? doc : null;
    }

    async listEmployeesByScope(empresa = "", sucursal = "") {
        let query = this.db.collection("usuarios")
            .where("role", "==", "empleado");

        if (empresa) {
            query = query.where("empresa", "==", empresa);
        }

        if (sucursal) {
            query = query.where("sucursal", "==", sucursal);
        }

        return await query.get();
    }

    async listJornadasByScope(empresa = "", sucursal = "") {
        let query = this.db.collection("jornadas");

        if (empresa) {
            query = query.where("empresa", "==", empresa);
        }

        if (sucursal) {
            query = query.where("sucursal", "==", sucursal);
        }

        return await query.get();
    }

    async existsByField(field, value, excludeId = null) {
        if (!value) return false;

        const snap = await this.db.collection("usuarios")
            .where(field, "==", String(value).trim())
            .get();

        let exists = false;
        snap.forEach(doc => {
            if (!excludeId || doc.id !== excludeId) {
                exists = true;
            }
        });

        return exists;
    }

    async updateEmployeeFirestore(id, data) {
        if (!id) throw new Error("ID requerido para actualizar.");
        await this.db.collection("usuarios").doc(String(id)).update(data);
    }

    async markAsViajero(id, value = true) {
        if (!id) throw new Error("ID requerido.");
        await this.db.collection("usuarios").doc(String(id)).update({ viajero: !!value });
    }

    async deleteEmployeeFirestore(id) {
        if (!id) throw new Error("ID requerido para eliminar.");
        await this.db.collection("usuarios").doc(String(id)).delete();
    }
}