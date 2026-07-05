/* js/models/admin.asistencias_jornadas.model.js */
export default class AdminAsistenciasJornadasModel {
    constructor(db) {
        if (!db) {
            throw new Error("Firestore no está disponible.");
        }
        this.db = db;
    }


    async getJornadasByScope(empresa = "", sucursal = "") {
        let query = this.db.collection("jornadas");

        if (empresa) {
            query = query.where("empresa", "==", String(empresa).trim());
        }

        if (sucursal) {
            query = query.where("sucursal", "==", String(sucursal).trim());
        }

        return await query.get();
    }

    async getJornadaById(id) {
        if (!id) return null;
        const doc = await this.db.collection("jornadas").doc(String(id)).get();
        return doc.exists ? doc : null;
    }

    async saveJornada(data, id = null) {
        if (!data) throw new Error("Datos de jornada requeridos.");

        if (id) {
            await this.db.collection("jornadas").doc(String(id)).update(data);
            return id;
        }

        const ref = await this.db.collection("jornadas").add(data);
        return ref.id;
    }

    async deleteJornada(id) {
        if (!id) throw new Error("ID requerido para eliminar jornada.");
        await this.db.collection("jornadas").doc(String(id)).delete();
    }

    async getAsistenciasByScope(empresa = "", sucursal = "") {
        let query = this.db.collection("asistencias");

        if (empresa) {
            query = query.where("empresa", "==", String(empresa).trim());
        }

        if (sucursal) {
            query = query.where("sucursal", "==", String(sucursal).trim());
        }

        return await query.get();
    }

    async deleteAsistencia(id) {
        if (!id) throw new Error("ID requerido para eliminar asistencia.");
        await this.db.collection("asistencias").doc(String(id)).delete();
    }

    async updateAsistencia(id, data) {
        if (!id) throw new Error("ID requerido para actualizar asistencia.");
        await this.db.collection("asistencias").doc(String(id)).update(data);
    }

    async getJornadasByIds(ids = []) {
        const clean = Array.isArray(ids)
            ? ids.map(v => String(v || "").trim()).filter(Boolean)
            : [];

        if (!clean.length) return [];

        return await Promise.all(
            clean.map(id => this.db.collection("jornadas").doc(id).get())
        );
    }

}