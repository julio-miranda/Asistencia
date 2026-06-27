export default class PlanillaModel {
    constructor(db) {
        if (!db) {
            throw new Error("Firestore no está disponible.");
        }
        this.db = db;
    }

    async getEmpleadosByScope(empresa = "", sucursal = "") {
        let query = this.db.collection("usuarios")
            .where("empresa", "==", String(empresa).trim())
            .where("sucursal", "==", String(sucursal).trim())
            .where("role", "==", "empleado");

        return await query.get();
    }

    async getJornadasByScope(empresa = "", sucursal = "") {
        let query = this.db.collection("jornadas")
            .where("empresa", "==", String(empresa).trim())
            .where("sucursal", "==", String(sucursal).trim());

        return await query.get();
    }

    async getAsistenciasByScope(empresa = "", sucursal = "") {
        let query = this.db.collection("asistencias")
            .where("empresa", "==", String(empresa).trim())
            .where("sucursal", "==", String(sucursal).trim());

        return await query.get();
    }

    async getJornadaById(id) {
        if (!id) return null;
        const doc = await this.db.collection("jornadas").doc(String(id)).get();
        return doc.exists ? doc : null;
    }
}