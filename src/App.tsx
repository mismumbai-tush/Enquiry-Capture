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
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Spreadsheet state
  const [spreadsheets, setSpreadsheets] = useState<GoogleDriveFile[]>([]);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>("");
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

  // 1. Initialize Auth on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
        fetchSpreadsheets(accessToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
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
      if (files.length > 0 && !selectedSpreadsheetId) {
        setSelectedSpreadsheetId(files[0].id);
      }
    } catch (err: any) {
      console.error(err);
      setSheetsError("Could not load spreadsheets. Check your Drive permissions.");
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // 3. Authenticate user
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setSheetsError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        await fetchSpreadsheets(result.accessToken);
      }
    } catch (err) {
      console.error("Login failed:", err);
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
    if (!needsAuth && captureMode === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [captureMode, needsAuth]);

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
    if (!token || !selectedSpreadsheetId || !extractedData) return;
    setIsSaving(true);
    try {
      const selectedFile = spreadsheets.find((s) => s.id === selectedSpreadsheetId);
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
      alert(`Failed to save to Google Sheets: ${err.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Find active spreadsheet object
  const activeSpreadsheet = spreadsheets.find((s) => s.id === selectedSpreadsheetId);

  // Authentication gate screen
  if (needsAuth) {
    return (
      <div className="min-h-screen bg-[#f0ebf8] font-sans flex flex-col items-center justify-center p-6 text-slate-800">
        <div className="w-full max-w-md bg-white rounded-xl shadow-md border border-slate-200/80 overflow-hidden text-center transition-all duration-300">
          {/* Top accent bar like Google Forms */}
          <div className="h-2.5 bg-[#673ab7] w-full" />
          
          <div className="p-8">
            <div className="inline-flex items-center justify-center p-4 bg-[#f0ebf8] rounded-full text-[#673ab7] mb-6">
              <Layers size={40} className="animate-pulse" />
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">
              Inquiry Capture & Sync Form
            </h1>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              OCR and Gemini AI document extraction utility. Capture photos or upload files to automatically populate rows in your Google Sheets.
            </p>

            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              id="sign-in-btn"
              className="w-full inline-flex items-center justify-center gap-3 py-2.5 px-5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm transition-all shadow-xs focus:outline-none disabled:opacity-50 cursor-pointer"
            >
              {isLoggingIn ? (
                <RefreshCw size={18} className="animate-spin text-slate-400" />
              ) : (
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
              )}
              <span className="font-sans font-medium text-[#673ab7]">Sign in with Google Account</span>
            </button>

            <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-400 border-t border-slate-100 pt-6">
              <ShieldCheck size={14} className="text-[#673ab7]" />
              <span>Workspace OAuth Verification Approved</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

          {/* User profile & controls */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-slate-800">
                {user?.displayName}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {user?.email}
              </span>
            </div>
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Profile"
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full border border-slate-200"
              />
            ) : (
              <div className="w-8 h-8 bg-[#ede7f6] text-[#673ab7] flex items-center justify-center font-bold text-xs rounded-full">
                {user?.displayName?.charAt(0) || "U"}
              </div>
            )}
            <button
              onClick={handleLogout}
              id="logout-btn"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-transparent cursor-pointer"
              title="Sign Out"
            >
              <LogOut size={16} />
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
                  Recording responses as <strong className="text-slate-700">{user?.email}</strong>
                </span>
              </div>
              <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded font-medium">
                Required *
              </span>
            </div>
          </div>
        </section>

        {/* Card 1: Google Spreadsheet Settings */}
        <section className="bg-white rounded-lg border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight uppercase font-sans text-[#673ab7]">
              Spreadsheet Destination Setup
            </h2>
            <button
              onClick={() => token && fetchSpreadsheets(token)}
              disabled={isLoadingSheets}
              className="p-1 text-slate-400 hover:text-[#673ab7] hover:bg-[#f0ebf8] rounded-md transition-all cursor-pointer"
              title="Refresh spreadsheet list"
            >
              <RefreshCw size={14} className={isLoadingSheets ? "animate-spin" : ""} />
            </button>
          </div>

          {sheetsError && (
            <div className="p-3 bg-rose-50 text-rose-700 border border-rose-100 rounded-lg text-xs flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{sheetsError}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Sheet select */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">
                Choose Linked Google Sheet <span className="text-rose-500">*</span>
              </label>
              <p className="text-xs text-slate-400">
                Select from spreadsheets inside your Google Drive. New rows will append to the "Inquiries" sheet tab.
              </p>
              {isLoadingSheets ? (
                <div className="h-10 bg-slate-50 border-b border-slate-200 rounded-t-md flex items-center justify-center text-xs text-slate-400 animate-pulse font-mono">
                  Loading files from Drive...
                </div>
              ) : spreadsheets.length === 0 ? (
                <div className="p-3 bg-amber-50/50 text-amber-800 border border-amber-150 rounded-lg text-xs flex flex-col gap-1">
                  <span className="font-bold">No spreadsheets found</span>
                  <span>Use the quick generator below to bootstrap a spreadsheet instantly.</span>
                </div>
              ) : (
                <div className="relative">
                  <select
                    value={selectedSpreadsheetId}
                    onChange={(e) => {
                      setSelectedSpreadsheetId(e.target.value);
                      setSaveSuccess(false);
                    }}
                    id="spreadsheet-select"
                    className="w-full bg-slate-50 border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] rounded-t-md px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition-all cursor-pointer"
                  >
                    {spreadsheets.map((sheet) => (
                      <option key={sheet.id} value={sheet.id}>
                        📁 {sheet.name} (Modified in Drive)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Quick Create option */}
            <div className="bg-[#fcfaff] border border-slate-100 rounded-lg p-4 space-y-3">
              <span className="text-[10px] font-bold text-[#673ab7] uppercase tracking-wider block">
                Quick Spreadsheet Creator
              </span>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Sheet Title (e.g. Inquiry Captures Log)"
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  id="new-sheet-title-input"
                  className="flex-1 bg-white border-b border-slate-300 focus:border-b-2 focus:border-[#673ab7] rounded-t-md px-3 py-2 text-xs outline-none text-slate-800 transition-all font-medium"
                />
                <button
                  onClick={handleCreateSheet}
                  disabled={isCreatingSheet || !newSheetTitle.trim()}
                  id="create-sheet-btn"
                  className="bg-[#673ab7] hover:bg-[#5e35b1] disabled:opacity-50 text-white rounded-md px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  {isCreatingSheet ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Plus size={14} />
                  )}
                  <span>Generate Sheet</span>
                </button>
              </div>
            </div>

            {activeSpreadsheet && (
              <div className="bg-emerald-50/60 border border-emerald-150 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="p-1 bg-emerald-100 text-emerald-700 rounded-md">
                    <CheckCircle size={14} />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-800 truncate">
                      Connected: {activeSpreadsheet.name}
                    </p>
                    <p className="text-[10px] text-emerald-700 font-medium">
                      Values will save instantly to spreadsheet column indexes.
                    </p>
                  </div>
                </div>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${selectedSpreadsheetId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 text-slate-400 hover:text-[#673ab7] hover:bg-white rounded-md transition-all shrink-0 cursor-pointer border border-transparent hover:border-slate-200"
                  title="Open live spreadsheet"
                >
                  <ExternalLink size={14} />
                </a>
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
    </div>
  );
}
