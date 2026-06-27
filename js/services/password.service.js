// js/services/password.service.js
const PBKDF2_ITERATIONS = 20000;
const PBKDF2_KEY_SIZE = 256 / 32;

export function hashPassword(password) {
    if (!password) throw new Error("Password vacío");

    if (typeof CryptoJS === "undefined" || !CryptoJS.PBKDF2) {
        throw new Error("CryptoJS no está disponible.");
    }

    const salt = CryptoJS.lib.WordArray.random(128 / 8).toString();
    const hash = CryptoJS.PBKDF2(password, salt, {
        keySize: PBKDF2_KEY_SIZE,
        iterations: PBKDF2_ITERATIONS
    }).toString();

    return `${salt}:${hash}`;
}

export function comparePassword(password, stored) {
    try {
        if (!password || !stored) return false;

        const cleanPassword = String(password).trim();
        const cleanStored = String(stored).trim();

        if (cleanStored.includes(":")) {
            const parts = cleanStored.split(":");
            if (parts.length < 2) return false;

            const salt = parts[0].trim();
            const hashStored = parts.slice(1).join(":").trim();

            if (!salt || !hashStored) return false;

            if (typeof CryptoJS === "undefined" || !CryptoJS.PBKDF2) {
                return false;
            }

            const hashCalc = CryptoJS.PBKDF2(cleanPassword, salt, {
                keySize: PBKDF2_KEY_SIZE,
                iterations: PBKDF2_ITERATIONS
            }).toString();

            return hashCalc === hashStored;
        }

        if (cleanStored.startsWith("$2")) {
            return !!(window.bcrypt && typeof window.bcrypt.compareSync === "function"
                && window.bcrypt.compareSync(cleanPassword, cleanStored));
        }

        return false;
    } catch (e) {
        console.error("Error en comparePassword:", e);
        return false;
    }
}