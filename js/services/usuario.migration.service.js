/* js/services/usuario.migration.service.js */

function getDb() {
    if (!window.db || typeof window.db.collection !== "function") {
        throw new Error("Firestore no está disponible.");
    }
    return window.db;
}

function getSessionDataSafe() {
    if (typeof window.getSessionData !== "function") return Promise.resolve(null);
    return window.getSessionData().catch(() => null);
}

function normalize(value) {
    return String(value || "").trim();
}

function compactObject(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj || {})) {
        if (value !== undefined) out[key] = value;
    }
    return out;
}

/**
 * isMigrationAllowed
 * - Solo controla la migración masiva (migrateAllUsuarioProfilesToAuthUid).
 * - Para migraciones individuales, se permite al propio usuario migrar su perfil.
 */
function isMigrationAllowed(sessionData) {
    const role = normalize(sessionData?.role);
    return role === "desarrollador";
}

/**
 * Construye los datos canónicos para usuarios/{authUid}
 * - No elimina campos existentes en el documento canónico (se usa merge al escribir).
 * - Si se está migrando el propio usuario y no existe role, se asigna "empleado" por defecto.
 */
function buildCanonicalUsuarioData(uid, sourceData = {}, legacyDocId = null, options = {}) {
    const now = new Date().toISOString();
    const cleanUid = normalize(uid);

    const base = {
        ...sourceData
    };

    // Si migración por el propio usuario y no hay role, asignar empleado por defecto
    if (options.forceDefaultRole && !base.role) {
        base.role = "empleado";
    }

    return compactObject({
        ...base,
        id: cleanUid,
        authUid: cleanUid,
        docId: cleanUid,
        migrated: true,
        migratedAt: now,
        migratedFromDocId: legacyDocId && legacyDocId !== cleanUid ? legacyDocId : null
    });
}

async function writeCanonicalDoc(db, uid, data) {
    const cleanUid = normalize(uid);
    const ref = db.collection("usuarios").doc(cleanUid);
    await ref.set(compactObject(data), { merge: true });
    return ref;
}

/**
 * migrateCurrentUserProfileToAuthUid
 * - Migra un perfil (posible legacy doc) a usuarios/{authUid}.
 * - No requiere que el invocador sea desarrollador si el uid coincide con la sesión (el propio usuario).
 * - Si se detecta que se está migrando el propio usuario, se puede forzar role por defecto.
 */
export async function migrateCurrentUserProfileToAuthUid({
    uid,
    profileData = null,
    currentDocId = null,
    deleteLegacyDoc = true,
    sessionData = null
} = {}) {
    const db = getDb();
    const cleanUid = normalize(uid);

    if (!cleanUid) {
        return { migrated: false, reason: "uid-vacio" };
    }

    // Si no se pasó sessionData, intentar obtenerla de forma segura
    if (!sessionData) {
        sessionData = await getSessionDataSafe();
    }

    // Permitir migración si:
    // - el invocador es desarrollador (según sessionData), o
    // - el invocador es el mismo uid (autoprovisionamiento)
    const callerUid = normalize(sessionData?.uid || "");
    const callerRole = normalize(sessionData?.role || "");

    const allowedToMigrate =
        callerRole === "desarrollador" || (callerUid && callerUid === cleanUid);

    if (!allowedToMigrate) {
        return { migrated: false, reason: "no-permission", detail: "Se requiere desarrollador o migración por el propio usuario." };
    }

    const legacyDocId = normalize(
        currentDocId ||
        profileData?.docId ||
        profileData?.id ||
        ""
    );

    const canonicalRef = db.collection("usuarios").doc(cleanUid);
    const canonicalSnap = await canonicalRef.get();
    const canonicalData = canonicalSnap.exists ? (canonicalSnap.data() || {}) : {};
    const sourceData = compactObject(profileData || {});

    // Si el propio usuario está migrando su perfil, forzamos role por defecto si no existe
    const forceDefaultRole = callerUid === cleanUid;

    const mergedData = buildCanonicalUsuarioData(
        cleanUid,
        {
            ...sourceData,
            ...canonicalData
        },
        legacyDocId || null,
        { forceDefaultRole }
    );

    // Escribir con merge para no eliminar campos existentes
    await canonicalRef.set(mergedData, { merge: true });

    let deletedLegacy = false;

    if (deleteLegacyDoc && legacyDocId && legacyDocId !== cleanUid) {
        const legacyRef = db.collection("usuarios").doc(legacyDocId);
        const legacySnap = await legacyRef.get();

        if (legacySnap.exists) {
            // Solo borrar legacy si el invocador es desarrollador o si legacyDocId pertenece al propio usuario
            if (callerRole === "desarrollador" || callerUid === cleanUid) {
                await legacyRef.delete();
                deletedLegacy = true;
            }
        }
    }

    return {
        migrated: true,
        canonicalDocId: cleanUid,
        legacyDocId: legacyDocId || null,
        deletedLegacy,
        profile: mergedData
    };
}

/**
 * ensureCurrentUserCanonicalProfile
 * - Función segura que intenta migrar/crear el perfil canónico del usuario actual.
 * - Si no se puede migrar, devuelve un objeto con migrated:false y la razón.
 */
export async function ensureCurrentUserCanonicalProfile({
    uid,
    profileData = null,
    currentDocId = null,
    deleteLegacyDoc = true
} = {}) {
    try {
        // Obtener sessionData para validar permisos y saber si el invocador es el propio usuario
        const sessionData = await getSessionDataSafe();

        // Si no hay sessionData y no se pasó profileData, no podemos validar; permitir solo si uid coincide con sessionData
        if (!sessionData && !profileData) {
            // Intentar migrar de todas formas si uid es proporcionado y coincide con sessionData (no disponible)
            // En este caso devolvemos un error claro
            return {
                migrated: false,
                reason: "no-session",
                message: "No se pudo validar la sesión del usuario para crear/migrar el perfil."
            };
        }

        // Llamar a la función de migración con sessionData para que ésta permita autoprovisionamiento
        return await migrateCurrentUserProfileToAuthUid({
            uid,
            profileData,
            currentDocId,
            deleteLegacyDoc,
            sessionData
        });
    } catch (error) {
        console.warn("No se pudo migrar el perfil actual a usuarios/{uid}:", error);
        return {
            migrated: false,
            reason: error?.code || "migration-error",
            error
        };
    }
}

/**
 * migrateAllUsuarioProfilesToAuthUid
 * - Solo desarrollador puede ejecutar esta operación.
 */
export async function migrateAllUsuarioProfilesToAuthUid({
    deleteLegacyDocs = true,
    batchSize = 400
} = {}) {
    const db = getDb();
    const sessionData = await getSessionDataSafe();

    if (!isMigrationAllowed(sessionData)) {
        throw new Error("La migración masiva solo puede ejecutarla un desarrollador autenticado.");
    }

    const snap = await db.collection("usuarios").get();
    const docs = snap.docs || [];

    const summary = {
        scanned: 0,
        migrated: 0,
        deletedLegacy: 0,
        skipped: 0,
        errors: []
    };

    let batch = db.batch();
    let ops = 0;

    async function commitBatch() {
        if (ops > 0) {
            await batch.commit();
            batch = db.batch();
            ops = 0;
        }
    }

    for (const doc of docs) {
        summary.scanned += 1;

        try {
            const data = doc.data() || {};
            const authUid = normalize(data.authUid || doc.id);

            if (!authUid) {
                summary.skipped += 1;
                continue;
            }

            const canonicalRef = db.collection("usuarios").doc(authUid);
            const canonicalData = buildCanonicalUsuarioData(
                authUid,
                {
                    ...data,
                    authUid
                },
                doc.id
            );

            batch.set(canonicalRef, canonicalData, { merge: true });
            ops += 1;
            summary.migrated += 1;

            if (deleteLegacyDocs && doc.id !== authUid) {
                batch.delete(doc.ref);
                ops += 1;
                summary.deletedLegacy += 1;
            }

            if (ops >= batchSize) {
                await commitBatch();
            }
        } catch (error) {
            summary.errors.push({
                docId: doc.id,
                code: error?.code || null,
                message: error?.message || String(error)
            });
        }
    }

    await commitBatch();

    return summary;
}

window.migrateCurrentUserProfileToAuthUid = migrateCurrentUserProfileToAuthUid;
window.ensureCurrentUserCanonicalProfile = ensureCurrentUserCanonicalProfile;
window.migrateAllUsuarioProfilesToAuthUid = migrateAllUsuarioProfilesToAuthUid;
