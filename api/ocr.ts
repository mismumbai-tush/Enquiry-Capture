import { GoogleGenAI, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined in Vercel settings/secrets.");
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { mimeType, base64Data } = req.body;

    if (!mimeType || !base64Data) {
      return res.status(400).json({ error: "Missing mimeType or base64Data in request body" });
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
      model: "gemini-2.5-flash",
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
    return res.status(200).json(parsedData);
  } catch (error: any) {
    console.error("OCR API error:", error);
    return res.status(500).json({
      error: error.message || "An error occurred while running the Gemini OCR model.",
    });
  }
}
