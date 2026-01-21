import { basename, extname, join } from "@tauri-apps/api/path";
import { writeFile } from "@tauri-apps/plugin-fs";
import { WebAI } from "@axols/webai-js";

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

export async function save(
  outputFolder: string,
  originalFilename: string,
  bytes: Uint8Array
) {
  const newFileName = await createFileName(originalFilename);
  const filePath = await join(outputFolder!, newFileName);
  await writeFile(filePath, bytes);
}

async function createFileName(fileName: string) {
  // Create filename with -clipped suffix before extension
  const baseFilename = await basename(fileName);
  const extension = await extname(fileName);
  const nameWithoutExt = baseFilename.replace(extension, "");

  const newFileName = `${nameWithoutExt}-clipped.png`;

  return newFileName;
}

let webai: Promise<WebAI> | undefined;
function getWebAI() {
  if (!webai) {
    webai = (async () => {
      const webai = await WebAI.create({
        // modelId: "rmbg-ben2",
        modelId: "rmbg-ormbg",
      });

      await webai.init({
        mode: "auto",
        onDownloadProgress: (progress) => {
          console.log(`Downloading model... ${progress.progress}%`);
        },
      });

      return webai;
    })();
  }
  return webai!;
}

export async function generateMask(imageBlobUrl: string) {
  const webai = await getWebAI();

  const generation = await webai.generate({
    userInput: {
      image_blob_url: imageBlobUrl,
    },
    modelConfig: {},
    generateConfig: {},
  });

  const mask = generation.result_mask as string;

  return mask;
}
