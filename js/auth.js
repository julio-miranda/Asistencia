// auth.js

// ===================
// Funciones de encriptación y desencriptación
// ===================

/**
 * Encripta un string utilizando un algoritmo personalizado.
 * @param {string} data - El string a encriptar.
 * @returns {string} - El string encriptado en formato hexadecimal.
 */
function encrypt_data(data) {
    data = unescape(encodeURIComponent(data));
    let newString = '';
    for (let i = 0; i < data.length; i += 2) {
        const char = data.charCodeAt(i);
        if (i + 1 < data.length) {
            const nextChar = data.charCodeAt(i + 1) - 31;
            const combinedCharCode = char + "" + nextChar.toLocaleString('en', { minimumIntegerDigits: 2 });
            newString += String.fromCharCode(parseInt(combinedCharCode, 10));
        } else {
            newString += data.charAt(i);
        }
    }
    return newString
        .split("")
        .reduce((hex, c) => hex + c.charCodeAt(0).toString(16).padStart(4, "0"), "");
}

/**
 * Desencripta un string previamente encriptado.
 * @param {string} encryptedData - El string encriptado en formato hexadecimal.
 * @returns {string} - El string desencriptado.
 */
function decrypt_data(encryptedData) {
    let newString = '';
    const hexChunks = encryptedData.match(/.{1,4}/g);
    const decodedString = hexChunks.reduce((acc, hex) => acc + String.fromCharCode(parseInt(hex, 16)), "");
    
    for (let i = 0; i < decodedString.length; i++) {
        const char = decodedString.charCodeAt(i);
        if (char > 132) {
            const codeStr = char.toString(10);
            const firstCharCode = parseInt(codeStr.substring(0, codeStr.length - 2), 10);
            const lastCharCode = parseInt(codeStr.substring(codeStr.length - 2), 10) + 31;
            newString += String.fromCharCode(firstCharCode) + String.fromCharCode(lastCharCode);
        } else {
            newString += decodedString.charAt(i);
        }
    }
    return newString;
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