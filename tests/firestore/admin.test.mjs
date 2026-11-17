import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  collection, deleteDoc, doc, getDocFromServer, getDocsFromServer, setDoc, setLogLevel, updateDoc,
} from "firebase/firestore";

const projectId = "demo-kenditasarla-rules";
let env;

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080", "Run via npm test with the local emulator");
  setLogLevel("silent");
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 18080,
      rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "admins/admin"), { role: "admin" }),
      setDoc(doc(db, "admins/superadmin"), { role: "superadmin" }),
      setDoc(doc(db, "admins/unrecognized"), { role: "customer" }),
      setDoc(doc(db, "admins/no-role"), {}),
      setDoc(doc(db, "addresses/private"), { user_id: "customer" }),
    ]);
  });
});

after(async () => { await env?.cleanup(); });

test("anonymous clients cannot read, list, create, edit or delete memberships", async () => {
  const db = env.unauthenticatedContext().firestore();
  const existing = doc(db, "admins/admin");
  await assertFails(getDocFromServer(existing));
  await assertFails(getDocsFromServer(collection(db, "admins")));
  await assertFails(setDoc(doc(db, "admins/new-anonymous"), { role: "admin" }));
  await assertFails(updateDoc(existing, { role: "superadmin" }));
  await assertFails(deleteDoc(existing));
});

test("customers can check their own membership but cannot discover or manage members", async () => {
  const db = env.authenticatedContext("customer").firestore();
  const own = doc(db, "admins/customer");
  const existing = doc(db, "admins/admin");
  assert.equal((await assertSucceeds(getDocFromServer(own))).exists(), false);
  await assertFails(getDocFromServer(existing));
  await assertFails(getDocsFromServer(collection(db, "admins")));
  await assertFails(setDoc(own, { role: "admin" }));
  await assertFails(setDoc(doc(db, "admins/new-customer"), { role: "admin" }));
  await assertFails(updateDoc(existing, { role: "superadmin" }));
  await assertFails(deleteDoc(existing));
  await assertFails(setDoc(doc(db, "categories/customer"), { active: true }));
});

test("profile fields and token role claims confer no administrative authority", async () => {
  const db = env.authenticatedContext("profile-owner", { admin: true, role: "superadmin" }).firestore();
  const profile = doc(db, "users/profile-owner");
  await assertSucceeds(setDoc(profile, { full_name: "Fixture" }));
  // Administrative fields in user profile are strictly blocked from client updates
  await assertFails(updateDoc(profile, { isAdmin: true, role: "superadmin" }));
  await assertFails(setDoc(doc(db, "admins/profile-owner"), { role: "superadmin" }));
  await assertFails(setDoc(doc(db, "settings/profile-owner"), { active: true }));
});

for (const uid of ["unrecognized", "no-role"]) {
  test(`a membership with an invalid or absent role cannot authorize writes (${uid})`, async () => {
    const db = env.authenticatedContext(uid).firestore();
    const own = doc(db, "admins", uid);
    assert.equal((await assertSucceeds(getDocFromServer(own))).exists(), true);
    await assertFails(updateDoc(own, { role: "admin" }));
    await assertFails(deleteDoc(own));
    await assertFails(setDoc(doc(db, "categories", uid), { active: true }));
  });
}

for (const role of ["admin", "superadmin"]) {
  test(`provisioned ${role} can log in and manage catalog data but cannot manage membership`, async () => {
    const db = env.authenticatedContext(role).firestore();
    const own = doc(db, "admins", role);
    const other = doc(db, "admins", role === "admin" ? "superadmin" : "admin");
    assert.equal((await assertSucceeds(getDocFromServer(own))).data().role, role);
    await assertSucceeds(setDoc(doc(db, "categories", role), { active: true }));
    await assertFails(getDocFromServer(other));
    await assertFails(getDocsFromServer(collection(db, "admins")));
    await assertFails(setDoc(doc(db, "admins", `new-${role}`), { role: "admin" }));
    await assertFails(updateDoc(own, { role: "superadmin" }));
    await assertFails(updateDoc(other, { role: "superadmin" }));
    await assertFails(deleteDoc(own));
    await assertFails(deleteDoc(other));
  });
}

test("public catalog reads and private address ownership still work", async () => {
  const guest = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocsFromServer(collection(guest, "categories")));
  await assertFails(setDoc(doc(guest, "categories/guest"), { active: true }));
  const customer = env.authenticatedContext("customer").firestore();
  const other = env.authenticatedContext("other").firestore();
  assert.equal((await assertSucceeds(getDocFromServer(doc(customer, "addresses/private")))).exists(), true);
  await assertFails(getDocFromServer(doc(other, "addresses/private")));
  await assertFails(getDocFromServer(doc(guest, "addresses/private")));
});
