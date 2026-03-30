import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { NativeModules } from 'react-native';

type FirebaseModuleName = 'RNFBAppModule' | 'RNFBAuthModule' | 'RNFBFirestoreModule';

export type FirebaseRuntimeStatus = {
  available: boolean;
  missingModules: FirebaseModuleName[];
  message: string | null;
};

const requiredModules: FirebaseModuleName[] = [
  'RNFBAppModule',
  'RNFBAuthModule',
  'RNFBFirestoreModule',
];

export const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() || null;

function getMissingModules(): FirebaseModuleName[] {
  return requiredModules.filter((moduleName) => !(moduleName in NativeModules));
}

/**
 * React Native Firebase reads Android/iOS app credentials from the native
 * `google-services.json` / `GoogleService-Info.plist` files after a native rebuild.
 * We avoid eager initialization here so the app can fall back to demo mode instead of
 * crashing when opened in Expo Go or an outdated dev client.
 */
export function getFirebaseRuntimeStatus(): FirebaseRuntimeStatus {
  const missingModules = getMissingModules();

  if (!missingModules.length) {
    return {
      available: true,
      missingModules,
      message: null,
    };
  }

  return {
    available: false,
    missingModules,
    message:
      'Firebase native modules are missing in this build. The app will run in demo mode until you install a fresh Android dev build or EAS build.',
  };
}

export function isFirebaseNativeAvailable(): boolean {
  return getFirebaseRuntimeStatus().available;
}

export function getFirebaseAuth() {
  const status = getFirebaseRuntimeStatus();
  if (!status.available) {
    throw new Error(status.message ?? 'Firebase Auth is unavailable in this build.');
  }

  return auth();
}

export function getFirestoreDb() {
  const status = getFirebaseRuntimeStatus();
  if (!status.available) {
    throw new Error(status.message ?? 'Firebase Firestore is unavailable in this build.');
  }

  return firestore();
}
