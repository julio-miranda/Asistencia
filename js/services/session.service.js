// js/services/session.service.js
const SESSION_COOKIE_NAME = "session";
const SECRET_STORAGE_KEY = "SECRET_KEY";
let inMemoryCryptoKey = null;

function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

async function getSecretKey() {
    if (inMemoryCryptoKey) return inMemoryCryptoKey;

    const storedKey = sessionStorage.getItem(SECRET_STORAGE_KEY);
    if (storedKey) {
        try {
            const rawKey = base64ToBytes(storedKey);
            inMemoryCryptoKey = await crypto.subtle.importKey(
                "raw",
                rawKey,
                { name: "AES-GCM" },
                false,
                ["encrypt", "decrypt"]
            );
            return inMemoryCryptoKey;
        } catch (e) {
            console.warn("SECRET_KEY inválida, generando una nueva:", e);
        }
    }

    const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const rawKey = await crypto.subtle.exportKey("raw", key);
    const base64Key = bytesToBase64(new Uint8Array(rawKey));

    try {
        sessionStorage.setItem(SECRET_STORAGE_KEY, base64Key);
    } catch (e) {
        console.warn("No se pudo guardar SECRET_KEY:", e);
    }

    inMemoryCryptoKey = key;
    return key;
}

function clearSecretKey() {
    inMemoryCryptoKey = null;
    try {
        sessionStorage.removeItem(SECRET_STORAGE_KEY);
    } catch (e) {
        console.warn("No se pudo eliminar SECRET_KEY:", e);
    }
}

async function encryptData(data) {
    const key = await getSecretKey();
    const encoder = new TextEncoder();
    const buffer = encoder.encode(JSON.stringify(data));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        buffer
    );

    const encryptedBytes = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedBytes.length);
    combined.set(iv, 0);
    combined.set(encryptedBytes, iv.length);

    return bytesToBase64(combined);
}

async function decryptData(cipherText) {
    try {
        if (!cipherText) return null;

        const combined = base64ToBytes(cipherText);
        if (combined.length < 13) return null;

        const iv = combined.slice(0, 12);
        const data = combined.slice(12);
        const key = await getSecretKey();

        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            data
        );

        return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) {
        console.error("Error al desencriptar:", e);
        return null;
    }
}

function setCookie(name, value, hours) {
    const d = new Date();
    d.setTime(d.getTime() + (Number(hours) || 0) * 3600 * 1000);
    const expires = "expires=" + d.toUTCString();
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Strict${secure}`;
}

function getCookie(name) {
    const prefix = name + "=";
    const parts = document.cookie.split(";").map(c => c.trim());

    for (const p of parts) {
        if (p.startsWith(prefix)) {
            return decodeURIComponent(p.substring(prefix.length));
        }
    }

    return null;
}

function deleteCookie(name) {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Strict${secure}`;
}

function getFirebaseAuth() {
    if (!window.firebase || typeof window.firebase.auth !== "function") {
        return null;
    }
    return window.firebase.auth();
}

export async function createSession(uid, days = 1) {
    if (!uid) throw new Error("UID inválido para crear sesión");

    const sessionObj = {
        uid: String(uid),
        issuedAt: Date.now(),
        expiry: Date.now() + days * 24 * 3600 * 1000
    };

    const encrypted = await encryptData(sessionObj);
    setCookie(SESSION_COOKIE_NAME, encrypted, days * 24);
    return sessionObj;
}

export async function getSessionData() {
    const cookie = getCookie(SESSION_COOKIE_NAME);
    if (!cookie) return null;

    const data = await decryptData(cookie);
    if (!data || !data.expiry || data.expiry <= Date.now()) {
        deleteCookie(SESSION_COOKIE_NAME);
        return null;
    }

    return data;
}

export async function refreshSession() {
    const s = await getSessionData();
    if (s && s.uid) {
        await createSession(s.uid, 1);
    }
}

export function isSessionValid(s) {
    return !!(s && s.expiry && s.expiry > Date.now());
}

export async function logout(options = {}) {
    const redirect = options.redirect !== false;

    deleteCookie(SESSION_COOKIE_NAME);
    clearSecretKey();

    const auth = getFirebaseAuth();
    if (auth) {
        try {
            await auth.signOut();
        } catch (e) {
            console.warn("No se pudo cerrar sesión de Firebase Auth:", e);
        }
    }

    if (redirect) {
        window.location.href = "index.html";
    }
}

export async function buscarUsuarioFirestorePorAuthUid(uid) {
    if (!uid || !window.db || typeof window.db.collection !== "function") return null;

    const snap = await window.db.collection("usuarios")
        .where("authUid", "==", uid)
        .limit(1)
        .get();

    if (!snap.empty) return snap.docs[0];
    return null;
}

export async function buscarUsuarioFirestorePorEmail(email) {
    if (!email || !window.db || typeof window.db.collection !== "function") return null;

    const snap = await window.db.collection("usuarios")
        .where("email", "==", String(email).trim())
        .limit(1)
        .get();

    if (!snap.empty) return snap.docs[0];
    return null;
}

async function waitForFirebaseUser(timeoutMs = 12000) {
    const auth = getFirebaseAuth();
    if (!auth) {
        throw new Error("Firebase Auth no está disponible.");
    }

    if (auth.currentUser) {
        return auth.currentUser;
    }

    return await new Promise((resolve, reject) => {
        let done = false;

        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            reject(new Error("Timeout esperando a Firebase Auth."));
        }, timeoutMs);

        try {
            const unsubscribe = auth.onAuthStateChanged((user) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (typeof unsubscribe === "function") unsubscribe();
                resolve(user || null);
            });
        } catch (e) {
            clearTimeout(timer);
            reject(e);
        }
    });
}

export async function checkUserSession(callback) {
    try {
        const currentUser = await waitForFirebaseUser().catch(() => null);

        if (!currentUser) {
            return null;
        }

        const uid = currentUser.uid;
        const email = currentUser.email || "";

        let userDoc = await buscarUsuarioFirestorePorAuthUid(uid);

        if (!userDoc && email) {
            userDoc = await buscarUsuarioFirestorePorEmail(email);

            if (userDoc && userDoc.data && !userDoc.data()?.authUid) {
                try {
                    await userDoc.ref.update({ authUid: uid });
                } catch (e) {
                    console.warn("No se pudo sincronizar authUid:", e);
                }
            }
        }

        if (!userDoc) {
            return null;
        }

        const userData = userDoc.data() || {};

        try {
            await createSession(uid, 1);
        } catch (e) {
            return null;
        }

        if (typeof callback === "function") {
            callback(uid, userData, userDoc.id);
        }

        return {
            uid,
            userData,
            docId: userDoc.id
        };
    } catch (e) {
        console.error("Error validando sesión:", e);
        return null;
    }
}

// Compatibilidad temporal
window.createSession = createSession;
window.getSessionData = getSessionData;
window.refreshSession = refreshSession;
window.logout = logout;
window.isSessionValid = isSessionValid;
window.checkUserSession = checkUserSession;
window.buscarUsuarioFirestorePorAuthUid = buscarUsuarioFirestorePorAuthUid;
window.buscarUsuarioFirestorePorEmail = buscarUsuarioFirestorePorEmail;