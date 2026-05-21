// ═══════════════════════════════════════════════════
//  FIREBASE CONFIGURATION
//  ⚠ Reemplaza estos valores con los de tu proyecto
// ═══════════════════════════════════════════════════
// 1. Ve a https://console.firebase.google.com
// 2. Crea un proyecto (o usa uno existente)
// 3. Ve a: Project settings → General → Your apps → Web
// 4. Copia el objeto firebaseConfig aquí:
// ═══════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyAquiVaTuApiKey",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// ═══════════════════════════════════════════════════
//  FIRESTORE SECURITY RULES (configurar en Firebase Console)
// ═══════════════════════════════════════════════════
// Copia estas reglas en Firestore → Rules:
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /{document=**} {
//         allow read, write: if true;
//       }
//     }
//   }
//
// ═══════════════════════════════════════════════════
