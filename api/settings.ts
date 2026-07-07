import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join("/tmp", "config.json");

export default async function handler(req: any, res: any) {
  // Support both GET and POST
  if (req.method === "GET") {
    try {
      const isEnvConfigured = !!(process.env.GOOGLE_APPS_SCRIPT_URL || process.env.GOOGLE_SPREADSHEET_ID);
      
      let googleAppsScriptUrl = process.env.GOOGLE_APPS_SCRIPT_URL || "";
      let spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || "1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw";

      // Check local config.json in project root (read-only in Vercel)
      const projectConfigPath = path.join(process.cwd(), "config.json");
      if (fs.existsSync(projectConfigPath)) {
        try {
          const raw = fs.readFileSync(projectConfigPath, "utf-8");
          const parsed = JSON.parse(raw);
          if (!googleAppsScriptUrl) googleAppsScriptUrl = parsed.googleAppsScriptUrl || "";
          if (spreadsheetId === "1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw" && parsed.spreadsheetId) {
            spreadsheetId = parsed.spreadsheetId;
          }
        } catch (e) {
          // ignore
        }
      }

      // Check tmp config (written during POST requests in current container session)
      if (fs.existsSync(CONFIG_FILE)) {
        try {
          const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
          const parsed = JSON.parse(raw);
          if (!googleAppsScriptUrl) googleAppsScriptUrl = parsed.googleAppsScriptUrl || "";
          if (spreadsheetId === "1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw" && parsed.spreadsheetId) {
            spreadsheetId = parsed.spreadsheetId;
          }
        } catch (e) {
          // ignore
        }
      }

      return res.status(200).json({
        googleAppsScriptUrl,
        spreadsheetId,
        isEnvConfigured
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to load settings." });
    }
  } else if (req.method === "POST") {
    try {
      const { googleAppsScriptUrl, spreadsheetId } = req.body;
      
      if (process.env.GOOGLE_APPS_SCRIPT_URL && process.env.GOOGLE_SPREADSHEET_ID) {
        return res.status(403).json({ error: "Configuration is locked via environment variables." });
      }

      const config = {
        googleAppsScriptUrl: googleAppsScriptUrl || "",
        spreadsheetId: spreadsheetId || "1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw"
      };
      
      // Write to /tmp so it works in serverless environment
      try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
      } catch (e) {
        // ignore write failures if they happen
      }

      return res.status(200).json({ success: true, config });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to save settings." });
    }
  } else {
    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
