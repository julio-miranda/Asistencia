(function (global) {
    const firebaseConfig = {
        apiKey: "AIzaSyCsbGM4mqhJNIPkh_MG9N4Dg3L7IX9Ibgs",
        authDomain: "control-asistencia-4cb62.firebaseapp.com",
        databaseURL: "https://control-asistencia-4cb62-default-rtdb.firebaseio.com",
        projectId: "control-asistencia-4cb62",
        storageBucket: "control-asistencia-4cb62.firebasestorage.app",
        messagingSenderId: "696387431955",
        appId: "1:696387431955:web:5d4a143db81742ee42d9e6",
        measurementId: "G-K74G8D56PV"
    };

    if (!global.firebase.apps.length) {
        global.firebase.initializeApp(firebaseConfig);
    }

    global.auth = global.firebase.auth();
    global.db = global.firebase.firestore();
})(window);