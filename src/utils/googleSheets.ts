export interface InquiryData {
  contactName: string;
  company: string;
  email: string;
  phone: string;
  inquiryDetails: string;
  estimatedBudget: string;
  documentType: string;
  ocrText: string;
  visitingCardPhotoUrl?: string;
  inquiryPhotoUrls?: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
}

// Search for existing spreadsheets in the user's Drive (limited to drive.file scope)
export async function listSpreadsheets(accessToken: string): Promise<GoogleDriveFile[]> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&orderBy=modifiedTime desc&fields=files(id, name, mimeType)",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || "Failed to fetch spreadsheet list from Google Drive.");
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error("Error listing spreadsheets:", error);
    throw error;
  }
}

// Create a new spreadsheet with default columns
export async function createSpreadsheet(accessToken: string, title: string): Promise<{ id: string; url: string }> {
  try {
    // 1. Create spreadsheet file
    const createResponse = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          title,
        },
        sheets: [
          {
            properties: {
              title: "Inquiries",
            },
          },
        ],
      }),
    });

    if (!createResponse.ok) {
      const errData = await createResponse.json().catch(() => ({}));
      throw new Error(errData?.error?.message || "Failed to create Google Spreadsheet.");
    }

    const spreadsheet = await createResponse.json();
    const spreadsheetId = spreadsheet.spreadsheetId;

    // 2. Initialize with header row
    const headers = [
      "Timestamp",
      "Contact Name",
      "Company",
      "Email",
      "Phone",
      "Inquiry Summary",
      "Estimated Budget",
      "Document Type",
      "Raw OCR Text",
      "Visiting Card Photo",
      "Enquiry Photos"
    ];

    const headerResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Inquiries!A1:K1?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [headers],
        }),
      }
    );

    if (!headerResponse.ok) {
      const errData = await headerResponse.json().catch(() => ({}));
      throw new Error(errData?.error?.message || "Failed to add header row to the spreadsheet.");
    }

    return {
      id: spreadsheetId,
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    };
  } catch (error) {
    console.error("Error creating spreadsheet:", error);
    throw error;
  }
}

// Append a new inquiry record as a spreadsheet row
export async function appendInquiryRow(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  inquiry: InquiryData
): Promise<void> {
  try {
    const timestamp = new Date().toLocaleString();
    const rowValues = [
      timestamp,
      inquiry.contactName || "N/A",
      inquiry.company || "N/A",
      inquiry.email || "N/A",
      inquiry.phone || "N/A",
      inquiry.inquiryDetails || "N/A",
      inquiry.estimatedBudget || "N/A",
      inquiry.documentType || "N/A",
      inquiry.ocrText || "N/A",
      inquiry.visitingCardPhotoUrl || "N/A",
      inquiry.inquiryPhotoUrls || "N/A"
    ];

    // Determine the range. If empty sheetName, default to first sheet
    const targetRange = sheetName ? `${sheetName}!A:K` : "A:K";

    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${targetRange}:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          values: [rowValues],
        }),
      }
    );

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || "Failed to append inquiry row to Google Sheet.");
    }
  } catch (error) {
    console.error("Error appending row:", error);
    throw error;
  }
}
