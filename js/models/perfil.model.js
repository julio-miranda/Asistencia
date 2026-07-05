/* js/models/perfil.model.js */
export default class PerfilModel {
    constructor(db) {
        if (!db) {
            throw new Error("Firestore no está disponible.");
        }
        this.db = db;
    }


    normalize(value) {
        return String(value || "").trim();
    }

    async getUserById(id) {
        const cleanId = this.normalize(id);
        if (!cleanId) return null;

        try {
            const doc = await this.db.collection("usuarios")
                .doc(cleanId)
                .get();

            if (doc.exists) {
                return doc;
            }

            const snap = await this.db.collection("usuarios")
                .where("authUid", "==", cleanId)
                .limit(1)
                .get();

            return snap.empty ? null : snap.docs[0];
        } catch (error) {
            console.error("Error consultando usuario por ID:", error);
            throw error;
        }
    }

    async getUserByAuthUid(uid) {
        return await this.getUserById(uid);
    }

    async updateProfile(docId, data) {
        const cleanDocId = this.normalize(docId);

        if (!cleanDocId) {
            throw new Error("docId requerido para actualizar perfil.");
        }

        await this.db.collection("usuarios")
            .doc(cleanDocId)
            .update(data);
    }

    async updateProfileByUid(uid, data) {
        const cleanUid = this.normalize(uid);

        if (!cleanUid) {
            throw new Error("uid requerido para actualizar perfil.");
        }

        await this.db.collection("usuarios")
            .doc(cleanUid)
            .update(data);
    }

}