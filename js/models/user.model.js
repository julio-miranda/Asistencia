export default class UserModel {
    constructor(db) {
        if (!db) throw new Error("Firestore no está disponible.");
        this.db = db;
    }

    async findByEmail(email) {
        const value = String(email || "").trim();
        if (!value) return null;

        const snap = await this.db.collection("usuarios")
            .where("email", "==", value)
            .limit(1)
            .get();

        return snap.empty ? null : snap.docs[0];
    }

    async findByIdentification(identificacion) {
        const value = String(identificacion || "").trim();
        if (!value) return null;

        const snap = await this.db.collection("usuarios")
            .where("identificacion", "==", value)
            .limit(1)
            .get();

        return snap.empty ? null : snap.docs[0];
    }

    async findByLogin(login) {
        const value = String(login || "").trim();
        if (!value) return null;

        const byEmail = await this.findByEmail(value);
        if (byEmail) return byEmail;

        return await this.findByIdentification(value);
    }

    async findByAuthUid(uid) {
        const value = String(uid || "").trim();
        if (!value) return null;

        const snap = await this.db.collection("usuarios")
            .where("authUid", "==", value)
            .limit(1)
            .get();

        return snap.empty ? null : snap.docs[0];
    }
}