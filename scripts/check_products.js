const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const cfg = {};
env.split('\n').forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) {
    const k = line.substring(0, idx).trim();
    const v = line.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    cfg[k] = v;
  }
});

const app = initializeApp({
  apiKey: cfg.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: cfg.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});
const db = getFirestore(app);

async function check() {
  const prods = await getDocs(collection(db, 'products'));
  for (const d of prods.docs) {
    const data = d.data();
    console.log('ID:', d.id);
    console.log('  name_ar:', data.name_ar, 'name_en:', data.name_en);
    console.log('  images:', JSON.stringify(data.images?.slice(0, 2)));
    console.log('  base_images:', JSON.stringify(data.base_images));
  }
}
check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
