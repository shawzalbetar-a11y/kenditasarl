/**
 * Automatically optimizes and compresses oversized image files (e.g. 20MB+, 50MB+) 
 * to ensure they are under the cloud upload limit (9.5MB) while maintaining 
 * ultra-sharp 4K print resolution (up to 4000px).
 */
export async function optimizeImageForUpload(
  file: File, 
  maxDimension = 4000, 
  maxSizeBytes = 9.5 * 1024 * 1024
): Promise<File> {
  if (typeof window === 'undefined') return file;

  // SVG files are vector and should not be raster compressed
  if (file.type === 'image/svg+xml') {
    return file;
  }

  // If already below size threshold, return original file directly
  if (file.size <= maxSizeBytes) {
    return file;
  }

  console.log(`⚡ Optimizing large image (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`);

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        
        // Scale down dimensions if exceeding maxDimension (4000px)
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(file);
          return;
        }

        // High quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Keep PNG transparency if PNG, else convert to WebP/JPEG
        const isPng = file.type === 'image/png';
        const mimeType = isPng ? 'image/png' : 'image/jpeg';
        const quality = isPng ? undefined : 0.92;

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < maxSizeBytes) {
              const optimizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, isPng ? ".png" : ".jpg"), {
                type: blob.type,
                lastModified: Date.now(),
              });
              console.log(`✅ Image optimized: ${(file.size / (1024 * 1024)).toFixed(2)} MB -> ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);
              resolve(optimizedFile);
            } else {
              // If still large, convert to high-quality WEBP (supports alpha + ultra compression)
              canvas.toBlob(
                (webpBlob) => {
                  if (webpBlob && webpBlob.size < file.size) {
                    const webpFile = new File([webpBlob], file.name.replace(/\.[^/.]+$/, ".webp"), {
                      type: 'image/webp',
                      lastModified: Date.now(),
                    });
                    console.log(`✅ Compressed to WebP: ${(file.size / (1024 * 1024)).toFixed(2)} MB -> ${(webpBlob.size / (1024 * 1024)).toFixed(2)} MB`);
                    resolve(webpFile);
                  } else {
                    resolve(file);
                  }
                },
                'image/webp',
                0.90
              );
            }
          },
          mimeType,
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
