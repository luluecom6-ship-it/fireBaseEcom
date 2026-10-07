import { auth } from '../firebase';

// Adds the Firebase ID token (when the user is signed in to Firebase) so the
// server can verify who is calling. Falls back to the plain headers otherwise.
export async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  try {
    const token = await auth.currentUser?.getIdToken();
    return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
  } catch {
    return extra;
  }
}
