import { NextResponse } from "next/server";
import { authorize, serverDb } from "../../../lib/server/cloudinaryServer";
import {
  matchingBundleDraftSchema,
  digest,
  type MatchingBundleDraft,
} from "../../../lib/matchingCollections";

export async function GET(request: Request) {
  const uid = await authorize(request, false, false);
  if (typeof uid === "number") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: uid });
  }

  try {
    const db = serverDb();
    const snap = await db
      .collection("matching_bundle_drafts")
      .where("userId", "==", uid)
      .limit(50)
      .get();

    const drafts = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        const itemsSnap = await d.ref.collection("items").get();
        const items = itemsSnap.docs.map((itemDoc) => itemDoc.data());
        return {
          id: d.id,
          ...data,
          items: items.length > 0 ? items : (data.items || []),
        };
      })
    );

    return NextResponse.json({ drafts }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load bundle drafts" },
      { status: 500 }
    );
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

    const id = body.id || db.collection("matching_bundle_drafts").doc().id;
    const bundleRef = db.collection("matching_bundle_drafts").doc(id);
    const existing = await bundleRef.get();

    if (existing.exists && existing.data()?.userId !== uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const parsed = matchingBundleDraftSchema.safeParse({
      id,
      userId: uid,
      title: body.title || "Özel Aile Koleksiyonu",
      occasion: body.occasion || "family",
      templateId: body.templateId,
      masterDesignId: body.masterDesignId,
      masterRevision: body.masterRevision || 1,
      masterRevisionHash: body.masterRevisionHash,
      status: body.status || "draft",
      items: body.items || [],
      createdAt: existing.exists ? existing.data()?.createdAt : now,
      updatedAt: now,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BUNDLE_DRAFT", details: parsed.error.issues },
        { status: 400 }
      );
    }

    // Save bundle document and its items subcollection atomically
    await db.runTransaction(async (tx) => {
      tx.set(bundleRef, {
        id: parsed.data.id,
        userId: parsed.data.userId,
        title: parsed.data.title,
        occasion: parsed.data.occasion,
        templateId: parsed.data.templateId || null,
        masterDesignId: parsed.data.masterDesignId,
        masterRevision: parsed.data.masterRevision,
        masterRevisionHash: parsed.data.masterRevisionHash,
        status: parsed.data.status,
        createdAt: parsed.data.createdAt,
        updatedAt: parsed.data.updatedAt,
      });

      for (const item of parsed.data.items) {
        const itemRef = bundleRef.collection("items").doc(item.id);
        tx.set(itemRef, item);
      }
    });

    return NextResponse.json({ bundle: parsed.data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to save bundle draft" },
      { status: 500 }
    );
  }
}
