import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Configure cloudinary with env variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'rzrq1go8',
  api_key: process.env.CLOUDINARY_API_KEY || '469274699118518',
  api_secret: process.env.CLOUDINARY_API_SECRET || '4h_-0goIBeRfzCu2z8D4zRldnew',
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let fileBase64 = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json({ error: 'No file provided in form data' }, { status: 400 });
      }

      // Convert File to base64 for Cloudinary upload
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      fileBase64 = `data:${file.type || 'image/jpeg'};base64,${buffer.toString('base64')}`;
    } else {
      const jsonBody = await request.json();
      fileBase64 = jsonBody.image || jsonBody.file || jsonBody.dataUrl || '';
      if (!fileBase64) {
        return NextResponse.json({ error: 'No image data provided in JSON body' }, { status: 400 });
      }
    }

    // Upload to Cloudinary with high reliability settings
    const result = await cloudinary.uploader.upload(fileBase64, {
      folder: 'kenditasarl_products',
      resource_type: 'auto',
    });

    const secureUrl = (result.secure_url || result.url || '').replace('http://', 'https://');

    return NextResponse.json({ 
      success: true, 
      url: secureUrl, 
      public_id: result.public_id 
    });
  } catch (error: any) {
    console.error('API Error Details in /api/upload:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Upload failed' 
    }, { status: 500 });
  }
}
