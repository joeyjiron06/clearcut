export async function applyMask(
  photoBlobUrl: string,
  maskBlobUrl: string
): Promise<Uint8Array<ArrayBuffer>> {
  // 1. Load images from blob URLs
  const [photo, mask] = await Promise.all([
    loadImage(photoBlobUrl),
    loadImage(maskBlobUrl),
  ]);

  // 2. Create and setup canvas
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = photo.width;
  canvas.height = photo.height;

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // 3. Draw the mask first
  ctx.drawImage(mask, 0, 0, canvas.width, canvas.height);

  // Convert color to alpha (Luma to Alpha)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Calculate brightness (average of R, G, B)
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    // Set the alpha channel based on the brightness (White = Opaque, Black = Transparent)
    data[i + 3] = brightness;
  }
  ctx.putImageData(imageData, 0, 0);

  // 4. Set composite operation
  // This clips the next drawing to the existing shape on the canvas
  ctx.globalCompositeOperation = "source-in";

  // // 5. Draw the photo to be cropped
  ctx.drawImage(photo, 0, 0);

  // Return the result as a new blob URL
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        resolve(bytes);
      } else {
        reject(new Error("Failed to create blob"));
      }
    }, "image/png");
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
