// app.js

// 1. Configuración de Firebase – REEMPLAZA estos valores con los de tu proyecto
const firebaseConfig = {
    apiKey: "AIzaSyD5AzdqX-y7RLIpInc-Rqh12eCdbkyUHK4",
    authDomain: "asistencia-jm-asociados.firebaseapp.com",
    projectId: "asistencia-jm-asociados",
    storageBucket: "asistencia-jm-asociados.firebasestorage.app",
    messagingSenderId: "167727595796",
    appId: "1:167727595796:web:21ef39c8e9986a7ecf8201",
    measurementId: "G-2J5SJF1L2S"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();