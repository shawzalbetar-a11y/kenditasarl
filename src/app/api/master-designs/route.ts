import { NextResponse } from "next/server";
import { authorize, serverDb } from "../../../lib/server/cloudinaryServer";
import {
  masterDesignSchema,
  digest,
  type MasterDesign,
} from "../../../lib/matchingCollections";

export async function GET(request: Request) {
  const uid = await authorize(request, false, false);
  if (typeof uid === "number") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: uid });
  }

  try {
    const db = serverDb();
    const snap = await db
      .collection("master_designs")
      .where("userId", "==", uid)
      .limit(50)
      .get();

    const designs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ designs }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load master designs" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const uid = await authorize(request, false, false);
  if (typeof uid === "number") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: uid });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }
    if (body.userId && body.userId !== uid) {
      return NextResponse.json({ error: "FORBIDDEN", message: "User ID mismatch" }, { status: 403 });
    }
    const now = new Date().toISOString();
    const db = serverDb();

    const id = body.id || db.collection("master_designs").doc().id;
    const docRef = db.collection("master_designs").doc(id);
    const existing = await docRef.get();

    let revision = 1;
    if (existing.exists) {
      const data = existing.data() as MasterDesign;
      if (data.userId !== uid) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      revision = (data.revision || 1) + 1;
    }

    const revisionHash = digest({
      title: body.title,
      canvasData: body.canvasData,
      assets: body.assets || [],
      revision,
    });

    const parsed = masterDesignSchema.safeParse({
      id,
      userId: uid,
      title: body.title,
      revision,
      revisionHash,
      canvasData: body.canvasData,
      assets: body.assets || [],
      previewUrl: body.previewUrl,
      createdAt: existing.exists ? existing.data()?.createdAt : now,
      updatedAt: now,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_MASTER_DESIGN", details: parsed.error.issues },
        { status: 400 }
      );
    }

    await docRef.set(parsed.data, { merge: true });
    return NextResponse.json({ design: parsed.data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to save master design" },
      { status: 500 }
    );
  }
}
