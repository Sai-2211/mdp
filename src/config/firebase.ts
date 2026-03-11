import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// Prefer environment variables so builds don’t require source edits.
const firebaseConfig = {
  apiKey: "AIzaSyDKiLZx-u1aSDqOIt7nm7Lpv15rBgOvhm8",
  authDomain: "evcharger-437ad.firebaseapp.com",
  projectId: "evcharger-437ad",
  storageBucket: "evcharger-437ad.firebasestorage.app",
  messagingSenderId: "553905450489",
  appId: "1:553905450489:android:c9810bdc85a2ec44fa6128",
};

const missingConfig = Object.values(firebaseConfig).some((value) => value.startsWith('YOUR_') || value.includes('PROJECT_ID'));
if (missingConfig) {
  throw new Error(
    'Firebase config is incomplete. Set EXPO_PUBLIC_FIREBASE_* env vars or edit src/config/firebase.ts with your real project values.',
  );
}

// Initialize once for RN Firebase; safe if already initialized.
if (firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

export const firebaseAuth = auth();
export const db = firestore();

/**
 * Firebase console setup (manual steps):
 * 1) Create project at https://console.firebase.google.com.
 * 2) Enable Authentication → Sign-in method → Email/Password.
 * 3) Create two users in Authentication → Users:
 *    - your personal account (email + password)
 *    - device account for ESP32 (e.g. esp32-device@yourdomain.com + strong password)
 * 4) Enable Firestore Database (production mode).
 * 5) Apply security rules:
 *    rules_version = '2';
 *    service cloud.firestore {
 *      match /databases/{database}/documents {
 *        match /device/{doc} {
 *          allow read, write: if request.auth != null;
 *        }
 *        match /readings/{readingId} {
 *          allow read, write: if request.auth != null;
 *        }
 *      }
 *    }
 * 6) In Project Settings → General → Your apps → Add app (Android or iOS), download google-services.json / GoogleService-Info.plist and place as required for React Native Firebase.
 * 7) Copy your Firebase config values into this file (apiKey, projectId, etc.).
 */
