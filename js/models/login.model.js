export default class LoginModel {
    constructor(db, auth) {
        if (!db) throw new Error("Firestore no está disponible.");
        if (!auth) throw new Error("Firebase Auth no está disponible.");
        this.db = db;
        this.auth = auth;
    }

    async signInWithEmailAndPassword(email, password) {
        const cleanEmail = String(email || "").trim();
        const cleanPassword = String(password || "").trim();
        if (!cleanEmail || !cleanPassword) throw new Error("Correo y contraseña son obligatorios.");
        return await this.auth.signInWithEmailAndPassword(cleanEmail, cleanPassword);
    }

    async signOut() {
        try { await this.auth.signOut(); } catch (error) {
            console.warn("No se pudo cerrar sesión de Firebase Auth:", error);
        }
    }

    /**
     * Busca un perfil de usuario por uid.
     * - Primero intenta como document id: usuarios/{uid}
     * - Si no existe, busca por campo authUid == uid
     * - Opcional: requiredRole (string) para exigir que el perfil tenga un rol concreto (ej. "empleado")
     *
     * Devuelve un objeto { ok: boolean, ... }:
     * - ok: true -> { doc, lookup: "doc-id"|"authUid" }
     * - ok: false -> { reason: "no-existe"|"permission-denied"|"firestore-error"|"uid-vacio", ... }
     */
    async getProfileByUid(uid, requiredRole = null) {
        const cleanUid = String(uid || "").trim();
        if (!cleanUid) return { ok: false, reason: "uid-vacio" };

        try {
            // 1) Intentar obtener por document id
            const docRef = this.db.collection("usuarios").doc(cleanUid);
            const doc = await docRef.get();

            if (doc.exists) {
                const data = doc.data() || {};
                if (requiredRole && data.role !== requiredRole) {
                    return { ok: false, reason: "role-mismatch", expectedRole: requiredRole, foundRole: data.role || null, doc };
                }
                return { ok: true, doc, lookup: "doc-id" };
            }

            // 2) Si no existe, buscar por campo authUid
            const snap = await this.db.collection("usuarios")
                .where("authUid", "==", cleanUid)
                .limit(1)
                .get();

            if (!snap.empty) {
                const foundDoc = snap.docs[0];
                const data = foundDoc.data() || {};
                if (requiredRole && data.role !== requiredRole) {
                    return { ok: false, reason: "role-mismatch", expectedRole: requiredRole, foundRole: data.role || null, doc: foundDoc, lookup: "authUid" };
                }
                return { ok: true, doc: foundDoc, lookup: "authUid" };
            }

            // No se encontró perfil
            return { ok: false, reason: "no-existe", expectedPath: `usuarios/${cleanUid}` };
        } catch (error) {
            if (error && error.code === "permission-denied") {
                return { ok: false, reason: "permission-denied", expectedPath: `usuarios/${cleanUid}`, error };
            }
            return { ok: false, reason: "firestore-error", error };
        }
    }

    /**
     * Devuelve los datos del perfil en un formato simple.
     * Pasa requiredRole a getProfileByUid si se necesita validar rol.
     */
    async getProfileDataByUid(uid, requiredRole = null) {
        const result = await this.getProfileByUid(uid, requiredRole);
        if (!result.ok) return result;
        return {
            ok: true,
            profile: {
                id: result.doc.id,
                ...(result.doc.data() || {})
            },
            lookup: result.lookup
        };
    }
}