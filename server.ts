import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";

dotenv.config();

const app = express();
const PORT = 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploads directory as static files
app.use("/uploads", express.static(uploadsDir));

// Increase body size limit for base64 image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lazy initializer for Gemini Client
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined in system secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// API endpoint for OCR image analysis
app.post("/api/ocr", async (req, res) => {
  try {
    const { mimeType, base64Data } = req.body;

    if (!mimeType || !base64Data) {
      res.status(400).json({ error: "Missing mimeType or base64Data in request body" });
      return;
    }

    const ai = getGeminiClient();

    const imagePart = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    const textPart = {
      text: "Perform OCR and extract standard customer inquiry or business communication details from this image. Carefully look for contact names, company names, emails, phones, budgets, prices, notes, specs, products of interest, and any handwritten or printed messages. Return the structured details.",
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            contactName: {
              type: Type.STRING,
              description: "The name of the main person or contact found in the document.",
            },
            company: {
              type: Type.STRING,
              description: "The name of the company or organization.",
            },
            email: {
              type: Type.STRING,
              description: "The primary contact email address.",
            },
            phone: {
              type: Type.STRING,
              description: "The primary contact phone number.",
            },
            inquiryDetails: {
              type: Type.STRING,
              description: "A summary of the inquiry, requirements, notes, products of interest, or message contained in the image.",
            },
            estimatedBudget: {
              type: Type.STRING,
              description: "Any estimated price, budget, total value, or cost mentioned.",
            },
            documentType: {
              type: Type.STRING,
              description: "The type of document: business_card, invoice, receipt, written_note, email_screenshot, product_brochure, or unknown.",
            },
            ocrText: {
              type: Type.STRING,
              description: "A complete transcription of all legible text in the image.",
            },
          },
          required: ["contactName", "company", "email", "phone", "inquiryDetails", "estimatedBudget", "documentType", "ocrText"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response text from Gemini model");
    }

    const parsedData = JSON.parse(text);
    res.json(parsedData);
  } catch (error: any) {
    console.error("OCR API error:", error);
    res.status(500).json({
      error: error.message || "An error occurred while running the Gemini OCR model.",
    });
  }
});

// Config file path for persistent settings
const CONFIG_FILE = path.join(process.cwd(), "config.json");

// API endpoint to retrieve form configuration
app.get("/api/settings", (req, res) => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      res.json(JSON.parse(raw));
    } else {
      res.json({
        googleAppsScriptUrl: "",
        spreadsheetId: "1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw"
      });
    }
  } catch (err: any) {
    console.error("Error loading config:", err);
    res.status(500).json({ error: "Failed to load settings." });
  }
});

// API endpoint to update form configuration
app.post("/api/settings", (req, res) => {
  try {
    const { googleAppsScriptUrl, spreadsheetId } = req.body;
    const config = {
      googleAppsScriptUrl: googleAppsScriptUrl || "",
      spreadsheetId: spreadsheetId || "1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw"
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    res.json({ success: true, config });
  } catch (err: any) {
    console.error("Error saving config:", err);
    res.status(500).json({ error: "Failed to save settings." });
  }
});

// API endpoint to submit form response to Google Sheet via Google Apps Script proxy
app.post("/api/submit-response", async (req, res) => {
  try {
    const { extractedData, imageBase64, imageMimeType, googleAppsScriptUrl } = req.body;

    if (!extractedData) {
      res.status(400).json({ error: "Missing extracted form data." });
      return;
    }

    // Determine the Apps Script URL
    let scriptUrl = googleAppsScriptUrl;
    if (!scriptUrl) {
      if (fs.existsSync(CONFIG_FILE)) {
        const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
        const config = JSON.parse(raw);
        scriptUrl = config.googleAppsScriptUrl;
      }
    }

    if (!scriptUrl) {
      res.status(400).json({
        error: "Google Apps Script Web App URL is not configured. Please paste your Web App URL in the Connection Settings."
      });
      return;
    }

    // Save image to local uploads directory if base64 is present
    let publicImageUrl = "";
    if (imageBase64) {
      try {
        const extension = imageMimeType?.split("/")[1] || "jpg";
        const filename = `photo_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}.${extension}`;
        const filePath = path.join(uploadsDir, filename);
        
        // Write the file
        const buffer = Buffer.from(imageBase64, "base64");
        fs.writeFileSync(filePath, buffer);

        // Build the public URL (Use https for Google Sheets integration)
        const host = req.get("host") || "localhost:3000";
        publicImageUrl = `https://${host}/uploads/${filename}`;
        console.log(`Saved public photo at: ${publicImageUrl}`);
      } catch (imgErr) {
        console.error("Failed to save image locally:", imgErr);
      }
    }

    // Prepare payload for Google Apps Script Web App
    const payload = {
      ...extractedData,
      photoUrl: publicImageUrl,
      imageBase64: imageBase64 || "",
      imageMimeType: imageMimeType || ""
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
    res.json({
      success: true,
      result,
      photoUrl: publicImageUrl
    });

  } catch (error: any) {
    console.error("Form submission error:", error);
    res.status(500).json({
      error: error.message || "Failed to submit form response to your Google Sheet. Please verify your Apps Script URL."
    });
  }
});

// Setup Vite Dev Server / Static Files middleware
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

setupVite().catch((err) => {
  console.error("Failed to start Vite server:", err);
  process.exit(1);
});
