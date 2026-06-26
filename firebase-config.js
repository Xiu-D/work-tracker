/* ======================================
   Firebase Configuration & Initialization
   ====================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyD-Jm5ZdUEBjmfp1tqcNOGLGthqZBtqouM",
  authDomain: "ptincome-d047e.firebaseapp.com",
  projectId: "ptincome-d047e",
  storageBucket: "ptincome-d047e.firebasestorage.app",
  messagingSenderId: "557050934867",
  appId: "1:557050934867:web:4cfa39b46325ef3320b8a6",
  measurementId: "G-WKET1EECD3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Set language to Traditional Chinese
auth.languageCode = 'zh-TW';

export { app, auth, db, googleProvider };
