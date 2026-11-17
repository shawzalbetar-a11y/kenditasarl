import { NextResponse } from "next/server";
import { serverDb } from "../../../lib/server/cloudinaryServer";

export async function GET() {
  try {
    const db = serverDb();
    const snap = await db
      .collection("matching_collection_templates")
      .where("isActive", "==", true)
      .get();

    const templates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return NextResponse.json({ templates }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load collection templates" },
      { status: 500 }
    );
  }
}
