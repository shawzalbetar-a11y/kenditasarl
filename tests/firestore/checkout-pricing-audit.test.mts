import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { calculateCustomProductPrice } from "../../src/lib/pricing";

const projectId = "demo-kenditasarla-rules";
const owner = "synthetic-buyer";
const front = { objects: [{ type: "textbox", text: "A", assignedPlacementId: "left_chest" }] };
const back = { objects: [{ type: "textbox", text: "B", assignedPlacementId: "full_back" }] };
let env: Awaited<ReturnType<typeof initializeTestEnvironment>>;

before(async () => {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18080");
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  env = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 18080,
    rules: await readFile(new URL("../../firestore.rules", import.meta.url), "utf8") } });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const canvas = { "red:::front": JSON.stringify(front), "blue:::front": JSON.stringify(front), "blue:::back": JSON.stringify(back) };
    const common = { user_id: owner, product_id: "shirt", design_id: "matrix", design_type: "custom", quantity: 1, unit_price: 200 };
    await Promise.all([
      setDoc(doc(db, "products/shirt"), { base_price: 200 }),
      setDoc(doc(db, "designs/matrix"), { user_id: owner, product_id: "shirt", canvas_json: JSON.stringify(canvas) }),
      setDoc(doc(db, "cart_items/red"), { ...common, variant_id: "red_M", selected_placement_ids: ["left_chest"] }),
      setDoc(doc(db, "cart_items/blue"), { ...common, variant_id: "blue_M", selected_placement_ids: ["left_chest", "full_back"] }),
      setDoc(doc(db, "products/shirt/variants/red"), { color: "red", sizes: { M: 1 } }),
      setDoc(doc(db, "products/shirt/variants/blue"), { color: "blue", size: "M", stock: 1 }),
    ]);
  });
});
after(async () => { await env?.cleanup(); });

test("a persisted matrix supports two different payable totals for the same two legacy lines", async () => {
  const db = env.authenticatedContext(owner).firestore();
  const product = (await getDoc(doc(db, "products/shirt"))).data()!;
  const design = (await getDoc(doc(db, "designs/matrix"))).data()!;
  const lines = await getDocs(query(collection(db, "cart_items"), where("user_id", "==", owner)));
  const canvas: Record<string, string> = JSON.parse(design.canvas_json);
  let copiedUnitTotal = 0;
  let perColorTotal = 0;
  for (const line of lines.docs) {
    const data = line.data();
    const color = data.variant_id.split("_")[0];
    const faces = Object.fromEntries(Object.entries(canvas).filter(([key]) => key.startsWith(color + ":::"))
      .map(([key, json]) => [key.split(":::")[1], JSON.parse(json)]));
    const price = calculateCustomProductPrice({ basePrice: product.base_price, facesData: faces,
      selectedPlacementIds: data.selected_placement_ids });
    perColorTotal += price.totalPrice * data.quantity;
    copiedUnitTotal += data.unit_price * data.quantity;
  }
  assert.equal(copiedUnitTotal, 400);
  assert.equal(perColorTotal, 435);
});

test("both historical stock layouts identify one unit of the selected size", async () => {
  const db = env.authenticatedContext(owner).firestore();
  const modern = (await getDoc(doc(db, "products/shirt/variants/red"))).data()!;
  const legacy = (await getDoc(doc(db, "products/shirt/variants/blue"))).data()!;
  assert.equal(modern.sizes.M, 1);
  assert.equal(legacy.size, "M");
  assert.equal(legacy.stock, 1);
});
