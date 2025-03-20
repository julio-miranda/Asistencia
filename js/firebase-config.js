// app.js

// 1. Configuración de Firebase – REEMPLAZA estos valores con los de tu proyecto
const firebaseConfig = {
    apiKey: "AIzaSyAs-z5tO-ucNX88eV9Br9gz1IbzXtf3BO0",
    authDomain: "hbbc-2c1e3.firebaseapp.com",
    projectId: "hbbc-2c1e3",
    storageBucket: "hbbc-2c1e3.firebasestorage.app",
    messagingSenderId: "100384061519",
    appId: "1:100384061519:web:4a1c53747b6cad1561d23a",
    measurementId: "G-HRBRQ69V79"
};

// Inicializa Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();