import { checkoutRequest } from "../../../../lib/server/checkout";

export function POST(request: Request) {
  return checkoutRequest(request, "confirm");
}
