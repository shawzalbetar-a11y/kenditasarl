import { NextResponse } from "next/server";
import { authorize, serverDb } from "../../../../lib/server/cloudinaryServer";
import {
  matchingBundleDraftSchema,
  type MatchingBundleDraft,
} from "../../../../lib/matchingCollections";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const uid = await authorize(request, false, false);
  if (typeof uid === "number") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: uid });
  }

  try {
    const db = serverDb();
    const bundleRef = db.collection("matching_bundle_drafts").doc(params.id);
    const snap = await bundleRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const data = snap.data()!;
    if (data.userId !== uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const itemsSnap = await bundleRef.collection("items").get();
    const items = itemsSnap.docs.map((d) => d.data());

    return NextResponse.json({
      bundle: {
        id: snap.id,
        ...data,
        items: items.length > 0 ? items : (data.items || []),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to load bundle" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
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
    const db = serverDb();
    const bundleRef = db.collection("matching_bundle_drafts").doc(params.id);
    const snap = await bundleRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (snap.data()?.userId !== uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const parsed = matchingBundleDraftSchema.safeParse({
      id: params.id,
      userId: uid,
      title: body.title || snap.data()?.title,
      occasion: body.occasion || snap.data()?.occasion,
      templateId: body.templateId || snap.data()?.templateId,
      masterDesignId: body.masterDesignId || snap.data()?.masterDesignId,
      masterRevision: body.masterRevision || snap.data()?.masterRevision || 1,
      masterRevisionHash:
        body.masterRevisionHash || snap.data()?.masterRevisionHash,
      status: body.status || "draft",
      items: body.items || [],
      createdAt: snap.data()?.createdAt || now,
      updatedAt: now,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BUNDLE_DRAFT", details: parsed.error.issues },
        { status: 400 }
      );
    }

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

      // Update items
      for (const item of parsed.data.items) {
        const itemRef = bundleRef.collection("items").doc(item.id);
        tx.set(itemRef, item);
      }
    });

    return NextResponse.json({ bundle: parsed.data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update bundle" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const uid = await authorize(request, false, false);
  if (typeof uid === "number") {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: uid });
  }

  try {
    const db = serverDb();
    const bundleRef = db.collection("matching_bundle_drafts").doc(params.id);
    const snap = await bundleRef.get();

    if (!snap.exists) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    if (snap.data()?.userId !== uid) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const itemsSnap = await bundleRef.collection("items").get();
    const batch = db.batch();
    for (const itemDoc of itemsSnap.docs) {
      batch.delete(itemDoc.ref);
    }
    batch.delete(bundleRef);
    await batch.commit();

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete bundle" },
      { status: 500 }
    );
  }
}
