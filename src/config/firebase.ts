import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDKiLZx-u1aSDqOIt7nm7Lpv15rBgOvhm8",
  authDomain: "evcharger-437ad.firebaseapp.com",
  projectId: "evcharger-437ad",
  storageBucket: "evcharger-437ad.firebasestorage.app",
  messagingSenderId: "553905450489",
  appId: "1:553905450489:android:c9810bdc85a2ec44fa6128",
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const db = getFirestore(app);