import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

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
