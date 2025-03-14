// auth.js

// ===================
// Funciones de encriptación y desencriptación
// ===================

// Función auxiliar: Convierte un ArrayBuffer a una cadena hexadecimal
function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

// Función auxiliar: Convierte una cadena hexadecimal a ArrayBuffer
function hexToArrayBuffer(hex) {
    if (hex.length % 2 !== 0) throw new Error("Cadena hexadecimal inválida");
    const buffer = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        buffer[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return buffer;
}

// Deriva una clave utilizando PBKDF2 a partir de una contraseña y una sal
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encripta un string utilizando AES-GCM.
 * @param {string} data - El texto a encriptar.
 * @param {string} password - Contraseña o frase secreta para derivar la clave.
 * @returns {Promise<Object>} - Objeto con la sal, iv y ciphertext en formato hexadecimal.
 */
async function encrypt_data(data, password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16)); // Sal aleatoria de 16 bytes
    const iv = crypto.getRandomValues(new Uint8Array(12));    // IV aleatorio de 12 bytes para AES-GCM
    const key = await deriveKey(password, salt);

    const ciphertextBuffer = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        encoder.encode(data)
    );

    return {
        salt: arrayBufferToHex(salt),
        iv: arrayBufferToHex(iv),
        ciphertext: arrayBufferToHex(ciphertextBuffer)
    };
}

/**
 * Desencripta un string previamente encriptado con AES-GCM.
 * @param {Object} encryptedData - Objeto con las propiedades: salt, iv y ciphertext (en hexadecimal).
 * @param {string} password - Contraseña o frase secreta utilizada para derivar la clave.
 * @returns {Promise<string>} - El texto desencriptado.
 */
async function decrypt_data(encryptedData, password) {
    const decoder = new TextDecoder();
    const salt = hexToArrayBuffer(encryptedData.salt);
    const iv = hexToArrayBuffer(encryptedData.iv);
    const ciphertext = hexToArrayBuffer(encryptedData.ciphertext);

    const key = await deriveKey(password, salt);

    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        ciphertext
    );

    return decoder.decode(decryptedBuffer);
}

// ===================
// Funciones de manejo de sesión con localStorage
// ===================

/**
 * Crea una sesión encriptada y la almacena en localStorage.
 * @param {string} uid - Identificador del usuario.
 * @param {number} days - Duración de la sesión en días.
 */
function createSession(uid, days = 1) {
    const sessionData = {
        uid,
        expiry: Date.now() + days * 24 * 60 * 60 * 1000
    };
    // Encriptamos el objeto de sesión antes de guardarlo
    const encryptedSession = encrypt_data(JSON.stringify(sessionData));
    localStorage.setItem("session", encryptedSession);
}

/**
 * Verifica si la sesión es válida.
 * @param {Object} sessionData - Objeto de datos de sesión.
 * @returns {boolean} - True si la sesión es válida.
 */
function isSessionValid(sessionData) {
    return sessionData && sessionData.expiry && sessionData.expiry > Date.now();
}

/**
 * Obtiene y desencripta los datos de la sesión almacenados en localStorage.
 * @returns {Object|null} - Objeto de sesión o null si no existe o la sesión ha expirado.
 */
function getSessionData() {
    const session = localStorage.getItem("session");
    if (!session) return null;
    try {
        const data = JSON.parse(decrypt_data(session));
        if (!isSessionValid(data)) {
            // Si la sesión ha expirado, se elimina
            localStorage.removeItem("session");
            return null;
        }
        return data;
    } catch (error) {
        console.error("Error al decodificar la sesión:", error);
        return null;
    }
}

/**
 * Extiende la sesión actual renovando su registro en localStorage.
 */
function refreshSession() {
    const sessionData = getSessionData();
    if (sessionData && isSessionValid(sessionData)) {
        createSession(sessionData.uid, 1); // Renueva la sesión por 1 día
        console.log("Sesión renovada en localStorage");
    }
}

/**
 * Verifica la sesión actual y ejecuta un callback si es válida.
 * Si no lo es, redirige al login.
 * @param {Function} callback - Función a ejecutar con el uid de la sesión.
 */
function checkUserSession(callback) {
    const sessionData = getSessionData();
    if (sessionData && isSessionValid(sessionData)) {
        refreshSession();
        callback(sessionData.uid);
    } else {
        logout();
    }
}

/**
 * Cierra la sesión eliminando el registro en localStorage y redirigiendo al login.
 */
function logout() {
    localStorage.removeItem("session");
    window.location.href = "index.html";
}