import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  UploadCloud,
  CheckCircle,
  FileSpreadsheet,
  User,
  Building2,
  Mail,
  Phone,
  DollarSign,
  AlertCircle,
  LogOut,
  RefreshCw,
  FileText,
  Plus,
  ExternalLink,
  ShieldCheck,
  History,
  Sparkles,
  ChevronRight,
  Info,
  Layers,
  Check,
  FileUp,
  Settings,
  Copy,
  X,
  HelpCircle,
} from "lucide-react";
import {
  initAuth,
  googleSignIn,
  logout,
} from "./utils/firebase";
import {
  listSpreadsheets,
  createSpreadsheet,
  appendInquiryRow,
  InquiryData,
  GoogleDriveFile,
} from "./utils/googleSheets";
import { User as FirebaseUser } from "firebase/auth";

export default function App() {
  // Auth state
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false); // Default to false so public users can submit
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Google Apps Script Web App sync configuration
  const [googleAppsScriptUrl, setGoogleAppsScriptUrl] = useState<string>("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSaveSuccess, setSettingsSaveSuccess] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Spreadsheet state
  const [spreadsheets, setSpreadsheets] = useState<GoogleDriveFile[]>([]);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>("1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw");
  const [newSheetTitle, setNewSheetTitle] = useState("Inquiry Captures Log");
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);

  // Capture mode state
  const [captureMode, setCaptureMode] = useState<"camera" | "upload">("camera");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeMimeType, setActiveMimeType] = useState<string>("");
  const [activeBase64, setActiveBase64] = useState<string>("");

  // Camera stream state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // OCR state
  const [isExtracting, setIsExtracting] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<InquiryData | null>(null);

  // Save/Confirm states
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Session history log
  const [savedHistory, setSavedHistory] = useState<
    Array<{
      timestamp: string;
      contactName: string;
      company: string;
      documentType: string;
      sheetName: string;
    }>
  >([]);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Load backend configurations on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const config = await res.json();
          if (config.googleAppsScriptUrl) {
            setGoogleAppsScriptUrl(config.googleAppsScriptUrl);
          }
          if (config.spreadsheetId) {
            setSelectedSpreadsheetId(config.spreadsheetId);
          }
        }
      } catch (err) {
        console.error("Failed to load server settings:", err);
      }
    };
    fetchSettings();
  }, []);

  // Save settings handler (सेटिंग्स सेव करने का हैंडलर)
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsSaveError(null);
    setSettingsSaveSuccess(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          googleAppsScriptUrl: googleAppsScriptUrl.trim(),
          spreadsheetId: selectedSpreadsheetId.trim(),
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to save connection settings to backend.");
      }
      setSettingsSaveSuccess(true);
      setTimeout(() => {
        setSettingsSaveSuccess(false);
        setIsSettingsOpen(false);
      }, 1500);
    } catch (err: any) {
      setSettingsSaveError(err.message || "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // 1. Initialize Auth on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        // Do not force needsAuth = true or block layout
        fetchSpreadsheets(accessToken);
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
    return () => {
      unsubscribe();
      stopCamera();
    };
  }, []);

  // 2. Fetch spreadsheets from Drive
  const fetchSpreadsheets = async (accessToken: string) => {
    setIsLoadingSheets(true);
    setSheetsError(null);
    try {
      const files = await listSpreadsheets(accessToken);
      setSpreadsheets(files);
      // Only overwrite selectedSpreadsheetId if it's currently empty
      if (files.length > 0 && !selectedSpreadsheetId) {
        setSelectedSpreadsheetId(files[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setSheetsError("Could not list Google Drive files automatically. You can still paste or use your preconfigured Sheet ID below!");
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // 3. Authenticate user
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setSheetsError(null);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        await fetchSpreadsheets(result.accessToken);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      if (err.code === "auth/unauthorized-domain") {
        setAuthError(
          "Domain Authorization Required: This domain (enquiry-capture.vercel.app) is not authorized for OAuth in your Firebase project. To resolve this, add 'enquiry-capture.vercel.app' in the Firebase Console under Authentication -> Settings -> Authorized Domains."
        );
      } else {
        setAuthError(err.message || "Failed to authenticate with Google. Please try again.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 4. Logout user
  const handleLogout = async () => {
    stopCamera();
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
    setSpreadsheets([]);
    setSelectedSpreadsheetId("");
    setPreviewUrl(null);
    setExtractedData(null);
    setSaveSuccess(false);
  };

  // 5. Create new spreadsheet
  const handleCreateSheet = async () => {
    if (!token) return;
    setIsCreatingSheet(true);
    setSheetsError(null);
    try {
      const sheetTitle = newSheetTitle.trim() || "Inquiry Captures Log";
      const result = await createSpreadsheet(token, sheetTitle);
      // Re-fetch spreadsheet list
      await fetchSpreadsheets(token);
      setSelectedSpreadsheetId(result.id);
    } catch (err: any) {
      setSheetsError(err.message || "Failed to create spreadsheet.");
    } finally {
      setIsCreatingSheet(false);
    }
  };

  // 6. Camera handlers
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      setCameraError(
        "Could not access the camera. Please allow camera permissions or upload an image instead."
      );
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  useEffect(() => {
    if (captureMode === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [captureMode]);

  // Capture current video frame
  const handleCapture = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      // Match high quality video feed size or standard fallback
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg");
        setPreviewUrl(dataUrl);
        setActiveMimeType("image/jpeg");
        setActiveBase64(dataUrl.split(",")[1]);
        // Auto extract details right after capture
        triggerOcr(dataUrl.split(",")[1], "image/jpeg");
      }
    }
  };

  // 7. File upload handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processUploadedFile(file);
  };

  const processUploadedFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setOcrError("Please upload a valid image file (PNG, JPEG, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setActiveMimeType(file.type);
      const base64Str = dataUrl.split(",")[1];
      setActiveBase64(base64Str);
      // Auto extract
      triggerOcr(base64Str, file.type);
    };
    reader.readAsDataURL(file);
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  // 8. OCR extract request to server
  const triggerOcr = async (base64Str: string, mimeTypeStr: string) => {
    setIsExtracting(true);
    setOcrError(null);
    setExtractedData(null);
    setSaveSuccess(false);

    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mimeType: mimeTypeStr,
          base64Data: base64Str,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to process OCR analysis.");
      }

      const result: InquiryData = await response.json();
      setExtractedData(result);
    } catch (err: any) {
      console.error(err);
      setOcrError(err.message || "Failed to analyze document. Please try a clearer image.");
    } finally {
      setIsExtracting(false);
    }
  };

  // 9. Form inputs modifier
  const handleFieldChange = (field: keyof InquiryData, value: string) => {
    if (extractedData) {
      setExtractedData({
        ...extractedData,
        [field]: value,
      });
    }
  };

  // 10. Write to Spreadsheet
  const handleConfirmSave = async () => {
    if (!selectedSpreadsheetId || !extractedData) {
      alert("Please select or paste a Google Sheet ID in the Connection Settings.");
      return;
    }
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      // MODE 1: Google Apps Script Web App (NO LOGIN required, recommended)
      if (googleAppsScriptUrl) {
        console.log("Submitting via Google Apps Script proxy...");
        const response = await fetch("/api/submit-response", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            extractedData,
            imageBase64: activeBase64,
            imageMimeType: activeMimeType,
            googleAppsScriptUrl: googleAppsScriptUrl.trim()
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to submit response via Google Apps Script");
        }

        const resJson = await response.json();
        console.log("Apps Script Submission successful:", resJson);

        setSavedHistory([
          {
            timestamp: new Date().toLocaleTimeString(),
            contactName: extractedData.contactName || "N/A",
            company: extractedData.company || "N/A",
            documentType: extractedData.documentType || "N/A",
            sheetName: "Google Sheet (Apps Script Link)",
          },
          ...savedHistory,
        ]);

        setSaveSuccess(true);
        setShowConfirmModal(false);
        return;
      }

      // MODE 2: Direct browser Google Sheet integration (requires browser OAuth token)
      if (!token) {
        throw new Error("Google Apps Script URL is not configured, and you are not signed in as administrator. Please click 'Configure Sync' to set up a sheet connection.");
      }

      const selectedFile = spreadsheets.find((s) => s.id === selectedSpreadsheetId) || {
        id: selectedSpreadsheetId,
        name: selectedSpreadsheetId === "1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw" ? "Google Form Linked Sheet" : "Custom Spreadsheet (" + selectedSpreadsheetId.slice(0, 8) + "...)"
      };
      const sheetName = "Inquiries"; // Built-in sheet tab configured in utils

      await appendInquiryRow(token, selectedSpreadsheetId, sheetName, extractedData);

      // Save to local session log
      setSavedHistory([
        {
          timestamp: new Date().toLocaleTimeString(),
          contactName: extractedData.contactName || "N/A",
          company: extractedData.company || "N/A",
          documentType: extractedData.documentType || "N/A",
          sheetName: selectedFile?.name || "Sheet",
        },
        ...savedHistory,
      ]);

      setSaveSuccess(true);
      setShowConfirmModal(false);
    } catch (err: any) {
      console.error(err);
      alert(`Submission failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Find active spreadsheet object
  const activeSpreadsheet = spreadsheets.find((s) => s.id === selectedSpreadsheetId) || (selectedSpreadsheetId ? {
    id: selectedSpreadsheetId,
    name: selectedSpreadsheetId === "1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw" ? "Google Form Linked Sheet" : "Custom Sheet ID: " + selectedSpreadsheetId.slice(0, 12) + "..."
  } : null);

  // Dashboard / Form workspace
  return (
    <div className="min-h-screen bg-[#ede7f6] font-sans text-slate-800 pb-16">
      {/* Top Navigation */}
      <header className="bg-white border-b border-slate-200/80 px-6 py-3.5 shadow-2xs sticky top-0 z-20">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#f0ebf8] text-[#673ab7] rounded-lg">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Google Forms Sync Client
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Automatic Photo Capture & Sheet OCR Link
              </p>
            </div>
          </div>

          {/* Connection Settings & Admin controls */}
          <div className="flex items-center gap-3">
            {googleAppsScriptUrl ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Live Sync Active</span>
              </span>
            ) : (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>Demo Mode (Unlinked)</span>
              </span>
            )}

            <button
              onClick={() => setIsSettingsOpen(true)}
              id="settings-btn"
              className="inline-flex items-center gap-2 py-1.5 px-3 border border-slate-200 rounded-lg bg-white hover:bg-[#f3f0f9] hover:text-[#673ab7] text-slate-700 font-semibold text-xs transition-all shadow-3xs cursor-pointer"
            >
              <Settings size={14} className="text-[#673ab7]" />
              <span>Connection Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Single-Column Google Form Canvas */}
      <main className="max-w-3xl mx-auto px-4 mt-6 space-y-4">
        
        {/* Form Title & Account Header Card */}
        <section className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          {/* Top thick purple header bar of Google Forms */}
          <div className="h-[10px] bg-[#673ab7] w-full" />
          
          <div className="p-6 md:p-8 space-y-4">
            <h1 className="text-3xl text-slate-900 font-normal font-sans tracking-tight">
              Inquiry Capture & OCR Sync Form
            </h1>
            <p className="text-sm text-slate-700 leading-relaxed font-sans">
              Welcome to the unified digital inquiry desk. Take a snapshot of hand-written notes, invoices, receipts, or business cards. Our background Gemini system extracts the customer profile details automatically and queues them directly as structured entries inside your linked Google Spreadsheet.
            </p>
            
            <div className="border-t border-slate-150 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/60 p-3 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <CheckCircle className="text-[#673ab7]" size={14} />
                <span>
                  Submitting responses securely directly to Google Sheet <strong>({selectedSpreadsheetId ? `${selectedSpreadsheetId.slice(0, 10)}...` : "Unlinked"})</strong>
                </span>
              </div>
              <span className="text-[10px] bg-indigo-50 text-indigo-800 border border-indigo-100 px-2 py-0.5 rounded font-medium">
                No Sign-in Required
              </span>
            </div>

            {!googleAppsScriptUrl && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs text-amber-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900">
                  <AlertCircle size={15} />
                  <span>Google Sheet Connection Needed</span>
                </div>
                <p className="leading-relaxed">
                  This form is currently running in <strong>Demo/Offline Mode</strong>. Your submitters can capture images and extract text, but data won't persist to your Google Sheet until you paste your <strong>Google Apps Script Web App URL</strong>. Click <strong>Connection Settings</strong> at the top to configure your connection in 2 minutes!
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Card 2: Interactive Camera & File Loader */}
        <section className="bg-white rounded-lg border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight uppercase font-sans text-[#673ab7]">
              Inquiry Photo Source
            </h2>
            
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
              <button
                onClick={() => {
                  setCaptureMode("camera");
                  setPreviewUrl(null);
                }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  captureMode === "camera"
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Use Camera
              </button>
              <button
                onClick={() => {
                  setCaptureMode("upload");
                  setPreviewUrl(null);
                  stopCamera();
                }}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  captureMode === "upload"
                    ? "bg-white text-slate-800 shadow-xs"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                Upload File
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Submit an image to populate form questions automatically. Position business cards, documents, or written requests clearly within frame.
          </p>

          {/* Camera Input Stream */}
          {captureMode === "camera" && (
            <div className="space-y-4">
              {cameraError ? (
                <div className="p-4 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg text-xs space-y-2">
                  <p className="font-semibold">Camera Connection Offline</p>
                  <p>{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="text-xs font-bold text-amber-900 underline hover:text-amber-950 cursor-pointer"
                  >
                    Reinitialize Camera
                  </button>
                </div>
              ) : (
                <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                  {cameraStream ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      {/* Scanning visual indicator */}
                      <div className="absolute inset-x-0 h-0.5 bg-[#673ab7]/50 shadow-[0_0_10px_#673ab7] scanner-line top-0" />
                      <div className="absolute top-2 left-2 bg-slate-900/80 border border-slate-800 text-[#ede7f6] font-mono text-[9px] px-2 py-0.5 rounded tracking-widest uppercase flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-[#673ab7] rounded-full animate-ping" />
                        <span>Ready to capture</span>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                      <RefreshCw className="animate-spin text-slate-600 mb-2" size={24} />
                      <p className="text-xs font-medium">Powering up local camera...</p>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleCapture}
                disabled={!cameraStream || isExtracting}
                id="capture-photo-btn"
                className="w-full bg-[#673ab7] hover:bg-[#5e35b1] disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-md py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <Camera size={16} />
                <span>Take Snapshot & Populate Form Questions</span>
              </button>
            </div>
          )}

          {/* Manual File Dropzone */}
          {captureMode === "upload" && (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center flex flex-col items-center justify-center transition-all ${
                  isDragging
                    ? "border-[#673ab7] bg-[#f0ebf8]/40 scale-[0.99]"
                    : "border-slate-300 hover:border-slate-400 bg-slate-50/50"
                }`}
              >
                <input
                  type="file"
                  id="file-selector"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="file-selector"
                  className="flex flex-col items-center cursor-pointer space-y-3"
                >
                  <div className="p-3 bg-white border border-slate-200 rounded-lg text-slate-500 shadow-2xs">
                    <UploadCloud size={24} className="text-[#673ab7]" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800">
                      Drag image here or browse folders
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Supports PNG, JPG, or JPEG up to 10MB
                    </p>
                  </div>
                  <span className="inline-flex py-1.5 px-3.5 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all">
                    Select File
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Loaded image preview details */}
          {previewUrl && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex items-start gap-4">
              <img
                src={previewUrl}
                alt="Source preview"
                className="w-16 h-16 object-cover rounded border border-slate-200 shrink-0 bg-slate-100"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">
                  Target Image Processed
                </p>
                <p className="text-[10px] text-slate-400 mt-1 font-mono uppercase">
                  MIME-TYPE: {activeMimeType}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    onClick={() => triggerOcr(activeBase64, activeMimeType)}
                    disabled={isExtracting}
                    className="text-[10px] font-bold text-[#673ab7] hover:text-[#5e35b1] bg-[#f0ebf8] px-2 py-1 rounded border border-[#ede7f6] inline-flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <RefreshCw size={10} className={isExtracting ? "animate-spin" : ""} />
                    <span>Run OCR Re-extract</span>
                  </button>
                  <button
                    onClick={() => {
                      setPreviewUrl(null);
                      setExtractedData(null);
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-100 transition-all cursor-pointer"
                  >
                    Remove Image
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Card 3: Google Form Structured Questions Card */}
        <section className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden relative">
          
          {/* Active form thick purple vertical indicator like Google Forms */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#673ab7]" />

          <div className="p-6 md:p-8 space-y-8">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#673ab7] uppercase tracking-wide">
                Form Questions & OCR Mapping
              </h3>
              <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded border border-slate-200 uppercase font-semibold">
                Auto-extraction ready
              </span>
            </div>

            {/* Waiting/Idle state */}
            {!isExtracting && !extractedData && !ocrError && (
              <div className="py-12 text-center max-w-md mx-auto space-y-4">
                <div className="p-4 bg-slate-50 text-slate-400 rounded-full inline-block">
                  <FileText size={32} className="text-[#673ab7]/60" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Form is currently blank</h4>
                  <p className="text-xs text-slate-400 mt-1 leading-normal">
                    Snap a photo or upload an inquiry document above. Gemini AI will automatically read the picture and populate these fields in real-time.
                  </p>
                </div>
              </div>
            )}

            {/* Running extraction state */}
            {isExtracting && (
              <div className="py-16 text-center space-y-4 max-w-sm mx-auto">
                <div className="relative flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-slate-100 border-t-[#673ab7] rounded-full animate-spin" />
                  <Sparkles className="absolute text-[#673ab7] animate-pulse" size={14} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Extracting details using OCR...</h4>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Gemini 3.5 Flash is analyzing your image to extract structured contact credentials.
                  </p>
                </div>
              </div>
            )}

            {/* OCR failure state */}
            {ocrError && (
              <div className="p-4 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg space-y-2 text-xs">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle size={14} />
                  <span>OCR extraction was unable to run</span>
                </div>
                <p className="text-[11px] leading-relaxed">{ocrError}</p>
                <button
                  onClick={() => triggerOcr(activeBase64, activeMimeType)}
                  className="text-xs font-bold text-rose-900 underline hover:text-[#673ab7]"
                >
                  Retry analysis
                </button>
              </div>
            )}

            {/* Editable Fields rendered EXACTLY like Google Form questions */}
            {extractedData && (
              <div className="space-y-6">
                
                {/* 1. Document Type */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">
                    What type of inquiry document is this? <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-xs text-slate-400">Classified automatically based on image contents.</p>
                  <select
                    value={extractedData.documentType}
                    onChange={(e) => handleFieldChange("documentType", e.target.value)}
                    className="w-full sm:w-1/2 bg-transparent border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] outline-none py-1.5 text-sm text-slate-800 transition-all font-medium cursor-pointer"
                  >
                    <option value="business_card">Business Card</option>
                    <option value="invoice">Invoice</option>
                    <option value="receipt">Receipt</option>
                    <option value="written_note">Handwritten Note</option>
                    <option value="email_screenshot">Email Screenshot</option>
                    <option value="product_brochure">Product Brochure</option>
                    <option value="unknown">Other / Unrecognized</option>
                  </select>
                </div>

                {/* 2. Contact Name */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">
                    Contact Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={extractedData.contactName}
                    onChange={(e) => handleFieldChange("contactName", e.target.value)}
                    placeholder="Your answer"
                    className="w-full bg-transparent border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] outline-none py-2 text-sm text-slate-800 transition-all font-sans"
                  />
                </div>

                {/* 3. Company */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">
                    Company / Organization Name
                  </label>
                  <input
                    type="text"
                    value={extractedData.company}
                    onChange={(e) => handleFieldChange("company", e.target.value)}
                    placeholder="Your answer"
                    className="w-full bg-transparent border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] outline-none py-2 text-sm text-slate-800 transition-all font-sans"
                  />
                </div>

                {/* 4. Email */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={extractedData.email}
                    onChange={(e) => handleFieldChange("email", e.target.value)}
                    placeholder="Your answer"
                    className="w-full bg-transparent border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] outline-none py-2 text-sm text-slate-800 transition-all font-sans"
                  />
                </div>

                {/* 5. Phone */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={extractedData.phone}
                    onChange={(e) => handleFieldChange("phone", e.target.value)}
                    placeholder="Your answer"
                    className="w-full bg-transparent border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] outline-none py-2 text-sm text-slate-800 transition-all font-sans"
                  />
                </div>

                {/* 6. Inquiry Summary */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">
                    Inquiry Details & Requirements <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-xs text-slate-400">Specify details of products, request context, or special specifications.</p>
                  <textarea
                    rows={3}
                    value={extractedData.inquiryDetails}
                    onChange={(e) => handleFieldChange("inquiryDetails", e.target.value)}
                    placeholder="Your answer"
                    className="w-full bg-transparent border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] outline-none py-2 text-sm text-slate-800 transition-all font-sans resize-none"
                  />
                </div>

                {/* 7. Budget */}
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">
                    Estimated Budget / Quotation Total
                  </label>
                  <input
                    type="text"
                    value={extractedData.estimatedBudget}
                    onChange={(e) => handleFieldChange("estimatedBudget", e.target.value)}
                    placeholder="Your answer"
                    className="w-full bg-transparent border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] outline-none py-2 text-sm text-slate-800 transition-all font-sans"
                  />
                </div>

                {/* 8. Raw Transcription */}
                <div className="space-y-2 bg-slate-50 p-4 rounded border border-slate-200">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">
                    Full Document Text Output (OCR)
                  </label>
                  <div className="text-xs text-slate-600 font-mono whitespace-pre-wrap leading-normal select-text">
                    {extractedData.ocrText || "No readable raw text found."}
                  </div>
                </div>
              </div>
            )}

            {/* Submit controls */}
            {extractedData && (
              <div className="border-t border-slate-100 pt-6 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-xs text-slate-400 max-w-sm font-sans leading-normal">
                  Make sure details are accurate. Clicking "Submit form response" will update your destination Google Sheet instantly.
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setExtractedData(null);
                      setPreviewUrl(null);
                    }}
                    className="px-4 py-2 hover:bg-slate-100 text-slate-500 rounded text-sm font-semibold transition-all cursor-pointer font-sans"
                  >
                    Clear form
                  </button>
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={!selectedSpreadsheetId}
                    id="save-to-sheets-btn"
                    className="bg-[#673ab7] hover:bg-[#5e35b1] disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-md px-6 py-2 text-sm font-semibold transition-all cursor-pointer shadow-xs font-sans inline-flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>Submit response</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Sync Status Overlay */}
        {saveSuccess && (
          <div className="bg-[#e2f1e4] border border-emerald-300 rounded-lg p-5 flex items-start gap-3.5 shadow-2xs">
            <div className="p-1.5 bg-emerald-600 text-white rounded-full">
              <Check size={16} />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900 font-sans">
                Response submitted successfully
              </h3>
              <p className="text-xs text-emerald-800 leading-normal mt-0.5 font-sans">
                Your inquiry has been stored. You can view responses inside your spreadsheet online.
              </p>
              {activeSpreadsheet && (
                <div className="mt-3">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${selectedSpreadsheetId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#673ab7] hover:underline"
                  >
                    <span>Open Google Sheets destination</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sync logs history */}
        {savedHistory.length > 0 && (
          <section className="bg-white rounded-lg border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
              <History size={16} className="text-[#673ab7]" />
              <h2 className="text-sm font-bold text-slate-900 tracking-tight uppercase font-sans">
                Form Responses Sync Log ({savedHistory.length})
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-sans">
                <thead>
                  <tr className="border-b border-slate-150 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2">Captured Timestamp</th>
                    <th className="py-2">Contact Name</th>
                    <th className="py-2">Company</th>
                    <th className="py-2">Doc Type</th>
                    <th className="py-2 text-right">Destination Sheet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {savedHistory.map((item, index) => (
                    <tr key={index} className="text-xs text-slate-600 hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-[10px] text-slate-400">
                        {item.timestamp}
                      </td>
                      <td className="py-2.5 font-semibold text-slate-800">
                        {item.contactName}
                      </td>
                      <td className="py-2.5">{item.company}</td>
                      <td className="py-2.5">
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-[#f0ebf8] text-[#673ab7] border border-[#ede7f6] uppercase">
                          {item.documentType.replace("_", " ")}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-semibold text-emerald-700 truncate max-w-[150px]">
                        {item.sheetName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && extractedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-[#673ab7] w-full" />
            
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-[#673ab7]">
                <ShieldCheck size={20} />
                <h3 className="text-base font-bold text-slate-900 font-sans">
                  Submit form response?
                </h3>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed font-sans">
                You are submitting this form as an appended row. Confirm details match the source image.
              </p>

              <div className="bg-slate-50 rounded p-4 border border-slate-200 space-y-2 text-xs font-sans">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Contact:</span>
                  <span className="font-bold text-slate-800">{extractedData.contactName || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Company:</span>
                  <span className="font-bold text-slate-800">{extractedData.company || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Email:</span>
                  <span className="font-bold text-slate-800">{extractedData.email || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Doc Category:</span>
                  <span className="font-mono font-bold text-[#673ab7] uppercase text-[10px]">
                    {extractedData.documentType}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 hover:bg-slate-100 text-slate-500 rounded text-xs font-bold transition-all cursor-pointer font-sans"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSave}
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-[#673ab7] hover:bg-[#5e35b1] disabled:opacity-50 text-white rounded text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer font-sans"
                >
                  {isSaving ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Submit Response</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Connection Settings Modal Drawer */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex justify-end p-0 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white h-full flex flex-col shadow-2xl overflow-hidden animate-slide-in">
            {/* Top violet accent */}
            <div className="h-1.5 bg-[#673ab7] w-full" />

            <div className="p-5 border-b border-slate-150 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900">
                <Settings className="text-[#673ab7]" size={20} />
                <h2 className="text-base font-bold font-sans">
                  Connection Settings (कनेक्शन सेटअप)
                </h2>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 font-sans">
              
              {/* Sheet Configuration Card */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  1. Target Spreadsheet Configuration
                </h3>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Google Spreadsheet ID (गूगल शीट आईडी)
                  </label>
                  <input
                    type="text"
                    value={selectedSpreadsheetId}
                    onChange={(e) => setSelectedSpreadsheetId(e.target.value)}
                    placeholder="Enter your Spreadsheet ID"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-[#673ab7] focus:bg-white rounded-lg px-3 py-2 text-xs font-mono outline-none transition-all"
                  />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Active sheet ID used to direct captures.</span>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${selectedSpreadsheetId}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#673ab7] hover:underline inline-flex items-center gap-1 font-bold"
                    >
                      <span>Open Sheet</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>

              {/* Apps Script Configuration Card */}
              <div className="space-y-4 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-bold text-[#673ab7] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles size={13} className="text-[#673ab7]" />
                  <span>2. No-Login Sync (Google Apps Script)</span>
                </h3>

                <p className="text-xs text-slate-500 leading-relaxed">
                  Pasting your deployed Google Apps Script URL enables <strong>everyone</strong> (submitters, customers, visitors) to upload photos and capture details without requiring any login screen!
                </p>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Deployed Web App URL (वेब ऐप यूआरएल)
                  </label>
                  <input
                    type="text"
                    value={googleAppsScriptUrl}
                    onChange={(e) => setGoogleAppsScriptUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full bg-slate-50 border border-slate-200 focus:border-[#673ab7] focus:bg-white rounded-lg px-3 py-2 text-xs font-mono outline-none transition-all"
                  />
                </div>

                {/* Save action feedback */}
                {settingsSaveError && (
                  <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-100 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    <span>{settingsSaveError}</span>
                  </div>
                )}

                {settingsSaveSuccess && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-100 flex items-center gap-1.5">
                    <CheckCircle size={14} />
                    <span>Settings saved successfully! (सेटिंग्स सेव हो गई हैं!)</span>
                  </div>
                )}

                <button
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  className="w-full bg-[#673ab7] hover:bg-[#5e35b1] disabled:opacity-50 text-white rounded-lg py-2 text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                >
                  {isSavingSettings ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Save Connection Settings (कनेक्शन सेव करें)</span>
                </button>
              </div>

              {/* Step-by-Step Setup Wizard */}
              <div className="space-y-4 pt-6 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-slate-800">
                  <HelpCircle size={15} className="text-[#673ab7]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">
                    How to Set Up (सेटअप कैसे करें?)
                  </h4>
                </div>

                <ol className="text-xs text-slate-600 space-y-3 pl-4 list-decimal leading-relaxed">
                  <li>
                    <strong>Copy Script:</strong> Click the button below to copy the custom automation script.
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">नीचे दिए बटन को दबाकर स्क्रिप्ट कोड कॉपी करें।</span>
                  </li>
                  <li>
                    <strong>Open Apps Script:</strong> Open your Google Sheet, click on <strong>Extensions (एक्सटेंशन)</strong> &rarr; <strong>Apps Script</strong> from the top menu.
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">गूगल शीट खोलें, Extensions मेनू में Apps Script पर क्लिक करें।</span>
                  </li>
                  <li>
                    <strong>Paste Code:</strong> Delete any code in the editor, paste the copied script, and save (Ctrl+S / Cmd+S).
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">पहले से मौजूद कोड को मिटाकर कॉपी किया कोड पेस्ट करें और सेव करें।</span>
                  </li>
                  <li>
                    <strong>Deploy:</strong> Click <strong>Deploy</strong> &rarr; <strong>New deployment</strong>.
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">Deploy बटन दबाकर New deployment चुनें।</span>
                  </li>
                  <li>
                    <strong>Configure Type:</strong> Click the Gear icon next to "Select type" and choose <strong>Web app</strong>.
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">गियर आइकॉन दबाकर Web app प्रकार चुनें।</span>
                  </li>
                  <li>
                    <strong>Set Permissions (CRITICAL):</strong>
                    <ul className="list-disc pl-4 mt-1 text-slate-500 space-y-0.5">
                      <li>Execute as (इस रूप में चलाएं): <strong>Me (your-email@gmail.com)</strong></li>
                      <li>Who has access (किसके पास पहुंच है): <strong>Anyone (कोई भी)</strong></li>
                    </ul>
                  </li>
                  <li>
                    <strong>Submit:</strong> Click <strong>Deploy</strong>, authorize permissions when prompted, copy the generated <strong>Web App URL</strong>, paste it in the field above, and click <strong>Save Connection</strong>!
                    <br />
                    <span className="text-[10px] text-slate-400 font-medium">Deploy पर क्लिक करके अनुमतियों को स्वीकारें, URL कॉपी करके ऊपर पेस्ट करें और सेव करें!</span>
                  </li>
                </ol>

                {/* Copy Script Container */}
                <div className="bg-[#fcfaff] border border-[#f0ebf8] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#673ab7] uppercase tracking-wider">
                      Google Apps Script Template
                    </span>
                    <button
                      onClick={() => {
                        const template = `// ====== COPY THIS SCRIPT TO YOUR GOOGLE SHEET ======
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Target Spreadsheet ID
    var spreadsheetId = "${selectedSpreadsheetId || '1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw'}";
    var ss = SpreadsheetApp.openById(spreadsheetId);
    
    // Get or create the "Inquiries" sheet tab
    var sheet = ss.getSheetByName("Inquiries");
    if (!sheet) {
      sheet = ss.insertSheet("Inquiries");
    }
    
    // Create header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp",
        "Contact Name",
        "Company",
        "Email",
        "Phone",
        "Inquiry Summary",
        "Estimated Budget",
        "Document Type",
        "Raw OCR Text",
        "Photo Preview"
      ]);
      // Format headers with beautiful purple style matching Google Forms
      sheet.getRange(1, 1, 1, 10)
        .setFontWeight("bold")
        .setBackground("#ede7f6")
        .setFontColor("#673ab7");
    }
    
    var timestamp = new Date().toLocaleString();
    
    // Format photo cell with =IMAGE() so Google Sheet renders the image inside the cell!
    var photoCell = data.photoUrl ? '=IMAGE("' + data.photoUrl + '")' : "No Photo";
    
    // Append the row
    sheet.appendRow([
      timestamp,
      data.contactName || "N/A",
      data.company || "N/A",
      data.email || "N/A",
      data.phone || "N/A",
      data.inquiryDetails || "N/A",
      data.estimatedBudget || "N/A",
      data.documentType || "N/A",
      data.ocrText || "N/A",
      photoCell
    ]);
    
    // Set row height to 80px so the photo is clearly visible in the sheet!
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.setRowHeight(lastRow, 80);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", row: lastRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
                        navigator.clipboard.writeText(template);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-[#ede7f6] hover:text-[#673ab7] text-slate-700 rounded-md border border-slate-200 text-[11px] font-bold transition-all cursor-pointer shadow-3xs"
                    >
                      {copied ? (
                        <>
                          <Check size={12} className="text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Copy Script Code</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-[10px] bg-slate-900 text-slate-100 rounded-lg p-3 font-mono overflow-x-auto max-h-[180px] leading-relaxed">
{`function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var spreadsheetId = "${selectedSpreadsheetId || '1RvuYa_xa1iF-z_iS0nQr3aFIeQiAZhvwLNCudex1KXw'}";
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheet = ss.getSheetByName("Inquiries") || ss.getSheets()[0];
    
    // [Formatting headers, appending data, and IMAGE() embedding logic]
    // ...
  }
}`}
                  </pre>
                </div>
              </div>

              {/* Backwards Compatibility Direct API Authentication Option */}
              <div className="space-y-4 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Alternative: Direct Admin Google Auth
                </h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  If you prefer to submit direct client-side requests from this browser session using your current login, you may sign in with Google below. (Submitters will still be prompted to login in this mode).
                </p>

                {user ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-[#673ab7] text-white flex items-center justify-center rounded-full font-bold text-[10px]">
                        {user.displayName?.charAt(0) || "A"}
                      </div>
                      <div>
                        <p className="font-bold text-slate-800">{user.displayName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded border border-transparent hover:border-rose-200"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleLogin}
                    disabled={isLoggingIn}
                    className="w-full inline-flex items-center justify-center gap-2.5 py-2 px-4 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs transition-all shadow-3xs cursor-pointer"
                  >
                    {isLoggingIn ? (
                      <RefreshCw size={12} className="animate-spin text-slate-400" />
                    ) : (
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                    )}
                    <span className="font-bold text-[#673ab7]">Sign in with Google Account</span>
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
