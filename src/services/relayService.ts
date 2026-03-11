import { getFirestore, collection, doc, setDoc } from '@react-native-firebase/firestore';
import { getApp } from '@react-native-firebase/app';

export async function setRelay(state: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const db = getFirestore(getApp());
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
