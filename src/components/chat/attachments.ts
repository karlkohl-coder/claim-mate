import { IMAGE_TYPES, MAX_ATTACHMENT_BYTES, PDF_TYPE, type Attachment } from "@/lib/chat-protocol";

const MAX_IMAGE_EDGE = 1600;

export type PreparedAttachment = Attachment & { previewUrl?: string };

export class AttachmentError extends Error {
  constructor(readonly kind: "too_large" | "unsupported") {
    super(kind);
  }
}

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Verkleinert ein Foto auf max. 1600 px und speichert es als JPEG. */
async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85),
  );
}

/** Bereitet eine Datei für /api/chat vor. Wirft AttachmentError bei Problemen. */
export async function prepareAttachment(file: File): Promise<PreparedAttachment> {
  if (file.type === PDF_TYPE) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new AttachmentError("too_large");
    return { name: file.name, mediaType: PDF_TYPE, data: await readAsBase64(file) };
  }

  if (file.type.startsWith("image/")) {
    let blob: Blob;
    try {
      blob = await downscaleImage(file);
    } catch {
      // Format kann der Browser nicht öffnen (z. B. HEIC in manchen Browsern).
      if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) throw new AttachmentError("unsupported");
      blob = file;
    }
    if (blob.size > MAX_ATTACHMENT_BYTES) throw new AttachmentError("too_large");
    return {
      name: file.name,
      mediaType: (blob.type || file.type) as Attachment["mediaType"],
      data: await readAsBase64(blob),
      previewUrl: URL.createObjectURL(blob),
    };
  }

  throw new AttachmentError("unsupported");
}
