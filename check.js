import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "fake",
  projectId: "kanditasarl",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const snap = await getDocs(collection(db, "products"));
  snap.docs.forEach(d => {
    console.log(d.id, d.data().name_en, d.data().base_images);
  });
}

check().catch(console.error);
