import { collection, doc, setDoc } from '@react-native-firebase/firestore';

import { appConfig } from '../config/appConfig';
import { getFirestoreDb, isFirebaseNativeAvailable } from '../config/firebase';
import { mockBackendState } from '../data/mock/mockBackendState';

export async function setRelay(state: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    if (appConfig.useMock || !isFirebaseNativeAvailable()) {
      if (state) {
        mockBackendState.startCharging();
      } else {
        mockBackendState.stopCharging('user_stop');
      }

      return { success: true };
    }

    const db = getFirestoreDb();
    await setDoc(
      doc(collection(db, 'device'), 'command'),
      { relay: state },
      { merge: true },
    );
    return { success: true };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : 'Failed to set relay';
    return { success: false, error };
  }
}
