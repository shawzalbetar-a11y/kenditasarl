import { serverDb, serverAuth } from "./cloudinaryServer";
import { sendWhatsAppOrderStatusUpdate } from "../whatsapp";
import { sendOrderEmail } from "./orderEmail";
// Claim each channel once before sending. An uncertain delivery needs operator reconciliation.
export async function deliverOrderChannel(
  event: FirebaseFirestore.DocumentReference,
  channel: string,
  send: () => Promise<boolean>,
) {
  const claimed = await event.firestore.runTransaction(async (tx) => {
    const state = await tx.get(event);
    if (!state.exists || state.get(channel)) return false;
    tx.update(event, { [channel]: "sending" });
    return true;
  });
  if (!claimed) return;
  let delivered = false;
  try {
    delivered = await send();
  } finally {
    await event.update({ [channel]: delivered ? "sent" : "review" });
  }
}

export async function dispatchOrderEvent(eventId: string) {
  if (process.env.FIRESTORE_EMULATOR_HOST) return;
  const db = serverDb(),
    event = db.collection("order_notifications").doc(eventId);
  const record = (await event.get()).data();
  if (!record) return;
  const orderRef = db.collection("orders").doc(record.order_id);
  const order = (await orderRef.get()).data();
  if (!order) return;
  const [user, address, profile] = await Promise.all([
    serverAuth().getUser(order.user_id),
    db.collection("addresses").doc(order.address_id).get(),
    db.collection("users").doc(order.user_id).get(),
  ]);
  const addr =
    order.address_snapshot ??
    (address.get("user_id") === order.user_id ? address.data() : undefined);
  const phone = profile.get("phone") || addr?.phone || user.phoneNumber;
  const name = user.displayName || addr?.full_name || user.uid;

  if (user.email && process.env.RESEND_API_KEY) {
    const escape = (s: unknown) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c]!,
      );
    const items = (await orderRef.collection("items").get()).docs.map((d) => ({
      name: escape(d.get("product_name") ?? d.get("product_id")),
      quantity: d.get("quantity"),
      price: d.get("unit_price"),
      color: escape(d.get("color")),
      size: escape(d.get("size")),
    }));
    await deliverOrderChannel(
      event,
      "email",
      async () =>
        (
          await (
            await sendOrderEmail({
              email: user.email,
              customerName: escape(name),
              customerPhone: escape(phone),
              deliveryAddress: escape(addr?.full_address),
              orderNumber: order.order_number,
              total: order.total,
              deliveryMethod: order.delivery_method,
              items,
              locale: order.locale,
            })
          ).json()
        ).success === true,
    );
  }
  if (phone)
    await deliverOrderChannel(
      event,
      "whatsapp",
      async () =>
        (
          await sendWhatsAppOrderStatusUpdate({
            phoneNumber: phone,
            customerName: name,
            orderId: order.order_number,
            status: record.order_status ?? "pending",
          })
        ).success,
    );
}
