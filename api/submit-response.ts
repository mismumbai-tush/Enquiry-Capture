import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join("/tmp", "config.json");

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { extractedData, imageBase64, imageMimeType, attachedPhotos, googleAppsScriptUrl } = req.body;

    if (!extractedData) {
      return res.status(400).json({ error: "Missing extracted form data." });
    }

    let scriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL || googleAppsScriptUrl;
    if (!scriptUrl) {
      // Check /tmp first
      if (fs.existsSync(CONFIG_FILE)) {
        try {
          const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
          const config = JSON.parse(raw);
          scriptUrl = config.googleAppsScriptUrl;
        } catch (e) {
          // ignore
        }
      }
      
      // Check project root config
      if (!scriptUrl) {
        const projectConfigPath = path.join(process.cwd(), "config.json");
        if (fs.existsSync(projectConfigPath)) {
          try {
            const raw = fs.readFileSync(projectConfigPath, "utf-8");
            const config = JSON.parse(raw);
            scriptUrl = config.googleAppsScriptUrl;
          } catch (e) {
            // ignore
          }
        }
      }
    }

    if (!scriptUrl) {
      return res.status(400).json({
        error: "Google Apps Script Web App URL is not configured. Please add GOOGLE_APPS_SCRIPT_URL to your environment variables."
      });
    }

    // Attempt to write image to /tmp so it can be served temporarily via /api/photo
    let publicImageUrl = "";
    if (imageBase64) {
      try {
        const extension = imageMimeType?.split("/")[1] || "jpg";
        const filename = `photo_${Date.now()}_vcard.${extension}`;
        
        const filePath = path.join("/tmp", filename);
        const buffer = Buffer.from(imageBase64, "base64");
        fs.writeFileSync(filePath, buffer);
        
        const host = req.headers.host || "localhost:3000";
        // Use standard HTTPS for public callback if not local
        const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
        publicImageUrl = `${protocol}://${host}/api/photo?name=${filename}`;
      } catch (imgErr) {
        console.error("Failed to save image in Vercel temp:", imgErr);
      }
    }

    // Save additional inquiry photos
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

    // Forward to Google Sheets Web App
    const payload = {
      ...extractedData,
      photoUrl: publicImageUrl, // Visiting card photo
      imageBase64: imageBase64 || "",
      imageMimeType: imageMimeType || "",
      inquiryPhotoUrls: inquiryPhotoUrls.join(", "), // Comma separated list for spreadsheets
      inquiryPhotoUrlsArray: inquiryPhotoUrls // Array for advanced Apps Script uses
    };

    console.log(`Forwarding submission to Google Apps Script: ${scriptUrl}`);
    
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Apps Script responded with status ${response.status}: ${errText}`);
    }

    const result = await response.json().catch(() => ({ status: "success" }));
    return res.status(200).json({
      success: true,
      result,
      photoUrl: publicImageUrl
    });

  } catch (error: any) {
    console.error("Form submission error:", error);
    return res.status(500).json({
      error: error.message || "Failed to submit form response to your Google Sheet. Please verify your Apps Script URL."
    });
  }
}
