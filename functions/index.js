const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// Fully removes a user: deletes their Firebase Auth credential (so the username/password
// stops working immediately, not just their app access) AND their factoryos_users profile
// doc. Callable only by an admin — checked by reading the CALLER's own profile doc, mirroring
// the isAdminOnly() check in firestore.rules.
exports.deleteUserAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const callerDoc = await db.collection('factoryos_users').doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can remove users.');
  }

  const { uid } = request.data;
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if (uid === request.auth.uid) throw new HttpsError('failed-precondition', "Can't remove yourself.");

  await auth.deleteUser(uid);
  await db.collection('factoryos_users').doc(uid).delete();
  return { success: true };
});
