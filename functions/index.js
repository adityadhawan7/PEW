const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

// Shared admin gate for callables: the CALLER's own profile doc must say role 'admin' —
// mirrors isAdminOnly() in firestore.rules. Never trust the client-side UI gate alone.
async function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }
  const callerDoc = await db.collection('factoryos_users').doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admins only.');
  }
}

// Fully removes a user: deletes their Firebase Auth credential (so the username/password
// stops working immediately, not just their app access) AND their factoryos_users profile
// doc. Callable only by an admin — checked by reading the CALLER's own profile doc, mirroring
// the isAdminOnly() check in firestore.rules.
exports.deleteUserAccount = onCall(async (request) => {
  await requireAdmin(request);

  const { uid } = request.data;
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if (uid === request.auth.uid) throw new HttpsError('failed-precondition', "Can't remove yourself.");

  await auth.deleteUser(uid);
  await db.collection('factoryos_users').doc(uid).delete();
  return { success: true };
});

// Sets a new password on an existing account — the in-app answer to "operator forgot their
// password" (synthetic @factoryos.local emails mean Firebase's reset-email flow has nowhere
// to deliver). Replaces the old remove-and-re-add workaround, which orphaned the username in
// historical wage/stock records.
exports.resetUserPassword = onCall(async (request) => {
  await requireAdmin(request);

  const { uid, newPassword } = request.data;
  if (!uid) throw new HttpsError('invalid-argument', 'uid is required.');
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  await auth.updateUser(uid, { password: newPassword });
  return { success: true };
});

// Nightly snapshot of ALL app data: every flat doc in `factoryos` plus the full
// `factoryos_users` profile list, copied into `factoryos_backups` (one doc per source doc,
// id `${date}~${key}`, so each backup doc stays within the same 1MB limit as its source).
// Clients can't touch the backups collection (firestore.rules default-deny; the Admin SDK
// here bypasses rules). Retention: 14 dailies for recent-mistake recovery, plus every
// 1st-of-the-month snapshot kept FOREVER as a permanent monthly archive (a few MB per month).
// Restore = copy a backup doc's `value` back over factoryos/{key} in the Firebase console.
const BACKUP_RETENTION_DAYS = 14;
exports.dailyBackup = onSchedule({ schedule: '30 3 * * *', timeZone: 'Asia/Kolkata' }, async () => {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const flatDocs = await db.collection('factoryos').get();
  const users = await db.collection('factoryos_users').get();

  let batch = db.batch();
  let ops = 0;
  const commitIfFull = async () => {
    if (ops >= 450) { await batch.commit(); batch = db.batch(); ops = 0; }
  };

  for (const doc of flatDocs.docs) {
    batch.set(db.collection('factoryos_backups').doc(`${date}~${doc.id}`), {
      date, key: doc.id, value: doc.data().value ?? null, backedUpAt: Date.now(),
    });
    ops++; await commitIfFull();
  }
  batch.set(db.collection('factoryos_backups').doc(`${date}~__users`), {
    date, key: '__users', value: users.docs.map(d => ({ uid: d.id, ...d.data() })), backedUpAt: Date.now(),
  });
  ops++;

  // Prune dailies past retention — but 1st-of-the-month snapshots are kept forever as the
  // permanent monthly archive.
  const cutoff = new Date(now.getTime() - BACKUP_RETENTION_DAYS * 86400000);
  const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const stale = await db.collection('factoryos_backups').where('date', '<', cutoffDate).get();
  let pruned = 0;
  for (const doc of stale.docs) {
    if (doc.data().date.endsWith('-01')) continue; // monthly archive — never pruned
    batch.delete(doc.ref);
    pruned++; ops++; await commitIfFull();
  }
  await batch.commit();
  console.log(`Backup ${date}: ${flatDocs.size} flat docs + ${users.size} users saved, ${pruned} stale docs pruned.`);
});
