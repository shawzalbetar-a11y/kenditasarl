import { existingGuestUploadToken } from "./uploadCustomerImage";
import { auth } from "./firebase";

export class CheckoutProblem extends Error {
  line?: string;
  constructor(code: string, line?: string) {
    super(code);
    this.line = line;
  }
}
export async function checkoutCall(path: string, intent: object) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new CheckoutProblem("AUTH");
  const guest =
    path === "cart/add" ? await existingGuestUploadToken() : undefined;
  const response = await fetch("/api/" + path, {
    method: "POST",
    headers: {
      ...(guest ? { "X-Upload-Session": guest } : {}),
      Authorization: "Bearer " + (await user.getIdToken()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(intent),
  });
  const result = await response.json();
  if (!response.ok)
    throw new CheckoutProblem(result.error ?? "UNAVAILABLE", result.line);
  return result;
}
