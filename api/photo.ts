import fs from "fs";
import path from "path";

export default async function handler(req: any, res: any) {
  const { name } = req.query;
  if (!name) {
    return res.status(400).end("Missing photo name");
  }

  // Filter input to prevent directory traversal
  const safeName = path.basename(name as string);
  const filePath = path.join("/tmp", safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).end("Photo not found or expired from serverless cache");
  }

  const extension = safeName.split(".").pop() || "jpg";
  res.setHeader("Content-Type", `image/${extension === "png" ? "png" : "jpeg"}`);
  res.setHeader("Cache-Control", "public, max-age=3600");
  
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
}
