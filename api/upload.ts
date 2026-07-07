import fs from "fs";
import path from "path";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { imageBase64, imageMimeType, attachedPhotos } = req.body;

    // 1. Process visiting card photo if present
    let photoUrl = "";
    if (imageBase64) {
      try {
        const extension = imageMimeType?.split("/")[1] || "jpg";
        const filename = `photo_${Date.now()}_vcard.${extension}`;
        const filePath = path.join("/tmp", filename);
        
        const buffer = Buffer.from(imageBase64, "base64");
        fs.writeFileSync(filePath, buffer);

        const host = req.headers.host || "localhost:3000";
        const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
        photoUrl = `${protocol}://${host}/api/photo?name=${filename}`;
      } catch (imgErr) {
        console.error("Failed to save visiting card image in Vercel temp:", imgErr);
      }
    }

    // 2. Process attached inquiry photos if present
    const inquiryPhotoUrls: string[] = [];
    if (Array.isArray(attachedPhotos)) {
      for (let i = 0; i < attachedPhotos.length; i++) {
        try {
          const photo = attachedPhotos[i];
          if (photo && photo.base64) {
            const extension = photo.mimeType?.split("/")[1] || "jpg";
            const filename = `photo_${Date.now()}_enq_${i}.${extension}`;
            const filePath = path.join("/tmp", filename);
            
            const buffer = Buffer.from(photo.base64, "base64");
            fs.writeFileSync(filePath, buffer);

            const host = req.headers.host || "localhost:3000";
            const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
            inquiryPhotoUrls.push(`${protocol}://${host}/api/photo?name=${filename}`);
          }
        } catch (photoErr) {
          console.error(`Failed to save inquiry photo ${i} in Vercel temp:`, photoErr);
        }
      }
    }

    res.status(200).json({
      success: true,
      photoUrl,
      inquiryPhotoUrls: inquiryPhotoUrls.join(", "),
      inquiryPhotoUrlsArray: inquiryPhotoUrls
    });
  } catch (err: any) {
    console.error("Upload handler error:", err);
    res.status(500).json({ error: "Failed to upload photos." });
  }
}
