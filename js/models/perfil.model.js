export default class PerfilModel {
    constructor(db) {
        if (!db) {
            throw new Error("Firestore no está disponible.");
        }
        this.db = db;
    }

    async getUserByAuthUid(uid) {
        if (!uid) return null;

        const snap = await this.db.collection("usuarios")
            .where("authUid", "==", String(uid).trim())
            .limit(1)
            .get();

        return snap.empty ? null : snap.docs[0];
    }

    async getUserById(id) {
        if (!id) return null;

        const doc = await this.db.collection("usuarios")
            .doc(String(id))
            .get();

        return doc.exists ? doc : null;
    }

    async updateProfile(docId, data) {
        if (!docId) {
            throw new Error("docId requerido para actualizar perfil.");
        }

        await this.db.collection("usuarios")
            .doc(String(docId))
            .update(data);
    }
}