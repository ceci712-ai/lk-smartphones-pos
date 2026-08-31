// Configuración y Credenciales de Firebase Cloud
const firebaseConfig = {
  apiKey: "AIzaSyDsvxQyeG4x4UpAFsQAD8TuqR1xhg8HIoA",
  authDomain: "lk-smartphones-pos.firebaseapp.com",
  projectId: "lk-smartphones-pos",
  storageBucket: "lk-smartphones-pos.firebasestorage.app",
  messagingSenderId: "942578519902",
  appId: "1:942578519902:web:e01565a4c46299154189cf"
};

// Inicializar Firebase Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
