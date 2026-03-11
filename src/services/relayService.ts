import firestore from '@react-native-firebase/firestore';

export async function setRelay(state: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    await firestore().collection('device').doc('command').set({ relay: state }, { merge: true });
    return { success: true };
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : 'Failed to set relay';
    return { success: false, error };
  }
}
