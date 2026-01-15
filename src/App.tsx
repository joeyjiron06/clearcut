import { useState, useRef, useCallback } from "react";
import { useLocalStorage } from "usehooks-ts";
import { open } from "@tauri-apps/plugin-dialog";
import {
  PhotoIcon,
  XMarkIcon,
  FolderIcon,
  ArrowUpTrayIcon,
  CheckIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import logo from "./assets/penguin.svg";
import textLogo from "./assets/penguin-text.svg";
import * as Photo from "./services/photo";
import "./App.css";

interface FileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  preview: string;
}

function App() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [outputFolder, setOutputFolder] = useLocalStorage<string | null>(
    "output-folder",
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<
    Map<string, "pending" | "processing" | "completed" | "error">
  >(new Map());
  const [currentProcessingIndex, setCurrentProcessingIndex] =
    useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef<boolean>(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const imageFiles = Array.from(selectedFiles).filter(
        (file) =>
          file.type.startsWith("image/") ||
          /\.(svg|png|jpg|jpeg)$/i.test(file.name)
      );

      const newFiles: FileItem[] = await Promise.all(
        imageFiles.map(async (file) => {
          const preview = URL.createObjectURL(file);
          return {
            id: crypto.randomUUID(),
            name: file.name,
            path: (file as any).path || file.name,
            size: file.size,
            preview,
          };
        })
      );

      setFiles((prev) => [...prev, ...newFiles]);
    }
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFolderSelect = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });

      if (selected) {
        setOutputFolder(selected);
      }
    } catch (error) {
      console.error("Error selecting folder:", error);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    const imageFiles = droppedFiles.filter(
      (file) =>
        file.type.startsWith("image/") ||
        /\.(svg|png|jpg|jpeg)$/i.test(file.name)
    );

    const newFiles: FileItem[] = await Promise.all(
      imageFiles.map(async (file) => {
        const preview = URL.createObjectURL(file);
        return {
          id: crypto.randomUUID(),
          name: file.name,
          path: (file as any).path || file.name,
          size: file.size,
          preview,
        };
      })
    );

    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    const fileToRemove = files[index];
    if (fileToRemove.preview) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    files.forEach((file) => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    const fileInput = fileInputRef.current;
    if (fileInput) {
      fileInput.value = "";
    }
    setFiles([]);
  };

  const handleStart = useCallback(async () => {
    if (!outputFolder) {
      console.error("Output folder not selected");
      return;
    }

    // Reset cancellation flag
    cancelledRef.current = false;

    // Initialize all files as pending
    const initialStatus = new Map<
      string,
      "pending" | "processing" | "completed" | "error"
    >();
    files.forEach((file) => {
      initialStatus.set(file.id, "pending");
    });
    setProcessedFiles(initialStatus);
    setCurrentProcessingIndex(0);
    setIsProcessing(true);

    // Process files one by one
    for (let i = 0; i < files.length; i++) {
      // Check if cancelled before processing each file
      if (cancelledRef.current) {
        break;
      }

      const file = files[i];
      setCurrentProcessingIndex(i);

      // Update status to processing
      setProcessedFiles((prev) => {
        const next = new Map(prev);
        next.set(file.id, "processing");
        return next;
      });

      try {
        const mask = await Photo.generateMask(file.preview);
        const bytes = await Photo.applyMask(file.preview, mask);
        await Photo.save(outputFolder, file.name, bytes);

        // Check if cancelled after processing
        if (cancelledRef.current) {
          break;
        }

        // Update status to completed
        setProcessedFiles((prev) => {
          const next = new Map(prev);
          next.set(file.id, "completed");
          return next;
        });
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);

        // Update status to error
        setProcessedFiles((prev) => {
          const next = new Map(prev);
          next.set(file.id, "error");
          return next;
        });
      }
    }

    setIsProcessing(false);
  }, [files, outputFolder]);

  const handleReset = () => {
    cancelledRef.current = false;
    setIsProcessing(false);
    setProcessedFiles(new Map());
    setCurrentProcessingIndex(0);
    clearFiles();
  };

  const getProgress = (): number => {
    if (isComplete()) return 100;

    // When processing, show progress based on current item being processed
    // Processing item 1 of 3 = 33%, item 2 of 3 = 67%, item 3 of 3 = 100%
    return Math.round((currentProcessingIndex / files.length) * 100);
  };

  const isComplete = (): boolean => {
    if (files.length === 0) return false;
    if (processedFiles.size === 0) return false;

    return Array.from(processedFiles.values()).every(
      (status) => status === "completed" || status === "error"
    );
  };

  return (
    <div className="h-screen max-h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-5 pt-0 flex items-center gap-1">
        <img src={logo} alt="Penguin" className="size-8 -ml-2" />
        <img src={textLogo} alt="Penguin" className="h-4" />
        {/* <h1 className="font-semibold text-gray-900">Penguin</h1> */}
      </div>

      {/* Main Content Panel */}
      <div className="flex-1 flex flex-col p-5 gap-6 shrink-0">
        {/* Drag and Drop Area */}
        <div
          className={`squircle border border-dashed rounded-lg transition-colors shrink-0 grow flex flex-col  relative ${
            isDragging && !isProcessing && !isComplete()
              ? "border-brand bg-linear-to-b from-background-2 to-background"
              : "border-stroke-2"
          } ${files.length > 0 ? "p-4" : "p-12"}`}
          onDragEnter={
            !isProcessing && !isComplete() ? handleDragEnter : undefined
          }
          onDragOver={
            !isProcessing && !isComplete() ? handleDragOver : undefined
          }
          onDragLeave={
            !isProcessing && !isComplete() ? handleDragLeave : undefined
          }
          onDrop={!isProcessing && !isComplete() ? handleDrop : undefined}
        >
          <div className="bg-grid absolute inset-0 -z-10"></div>
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/svg+xml,image/png,image/jpeg,image/jpg"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isProcessing}
          />

          {files.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center space-y-4 text-center justify-center h-full ">
              <div className="size-10 border border-stroke rounded-full flex items-center justify-center bg-background">
                <PhotoIcon className="size-4" />
              </div>
              <div>
                <p className="text-sm mb-1">Drop your images here</p>
                <p className="text-xs font-light text-foreground-muted">
                  SVG, PNG, or JPG
                </p>
              </div>
              <button onClick={handleFileSelect} className="btn btn-outline">
                <ArrowUpTrayIcon />
                Select images
              </button>
            </div>
          ) : (
            <div className="flex flex-col grow gap-6">
              {/* HEADER */}
              {isProcessing || isComplete() ? (
                /* PROCESSING HEADER */
                <div className="shrink-0 h-6">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold text-gray-900">
                      Processed Images (
                      {isComplete() ? files.length : currentProcessingIndex} of{" "}
                      {files.length})
                    </h2>

                    <div className="grow bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-brand h-2 rounded-full transition-all duration-300"
                        style={{ width: `${getProgress()}%` }}
                      ></div>
                    </div>

                    <span className="text-sm font-medium  w-12 text-right">
                      {getProgress()}%
                    </span>
                  </div>
                </div>
              ) : (
                /* UPLOADED IMAGES HEADER */
                <div className="flex items-center justify-between h-6">
                  <h2 className="font-semibold">
                    Uploaded Images ({files.length})
                  </h2>
                  <button
                    onClick={clearFiles}
                    className="btn btn-outline btn-sm"
                    aria-label="Remove all files"
                  >
                    <XMarkIcon />
                    Remove all
                  </button>
                </div>
              )}

              <div className="flex flex-col space-y-3 overflow-y-auto basis-0 grow ">
                {/* File List */}
                <div className="space-y-2">
                  {files.map((file, index) => {
                    const status = processedFiles.get(file.id) || "pending";
                    const isFileProcessing = status === "processing";
                    const isFileCompleted = status === "completed";

                    return (
                      <div
                        key={index}
                        className="flex items-center p-2 rounded-lg border border-stroke group bg-background"
                      >
                        <div className="size-10 bg-gray-200 rounded-lg shrink-0 overflow-hidden">
                          {file.preview ? (
                            <img
                              src={file.preview}
                              alt={file.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <PhotoIcon className="size-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                        <div className="ml-3 flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        {isFileProcessing ? (
                          <div>
                            <ArrowPathIcon className="size-4 mx-2 animate-spin" />
                          </div>
                        ) : isFileCompleted ? (
                          <div>
                            <CheckIcon className="size-4 mx-2" />
                          </div>
                        ) : (
                          !isProcessing &&
                          !isComplete() && (
                            <button
                              onClick={() => removeFile(index)}
                              className="ml-3 btn btn-ghost btn-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150 focus-visible:opacity-100"
                              aria-label="Remove file"
                            >
                              <XMarkIcon className="size-4" />
                            </button>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Add more button */}
              {!isProcessing && !isComplete() && (
                <button
                  onClick={handleFileSelect}
                  className="btn btn-outline w-full"
                >
                  <ArrowUpTrayIcon />
                  Add more images
                </button>
              )}
            </div>
          )}
        </div>

        {/* Output Folder Selection */}
        <div className="shrink-0">
          <button
            onClick={handleFolderSelect}
            disabled={isProcessing || isComplete()}
            className={`squircle w-full border border-stroke rounded-md text-sm font-medium text-left flex items-stretch transition-all duration-150 focus-visible:outline-stroke-accessible focus-visible:outline-2 focus-visible:outline-offset-2  ${
              isProcessing || isComplete()
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-background-2 cursor-pointer"
            }`}
          >
            <span className="text-sm font-medium text-gray-700 px-4 py-2 flex items-center gap-2">
              <FolderIcon className="size-4" />
              Output folder
            </span>

            <div className="h-auto w-px bg-gray-300 shrink-0"></div>

            <div className="px-4 py-2">
              {outputFolder ? (
                <span className="text-gray-900 truncate block">
                  {outputFolder.split(/[/\\]/).pop() || outputFolder}
                </span>
              ) : (
                <span className="text-gray-500">Choose folder</span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 shrink-0 border-t border-t-stroke px-5 py-4">
        {isComplete() ? (
          <button className="btn btn-primary" onClick={handleReset}>
            Reset
          </button>
        ) : isProcessing ? (
          <button
            className="btn btn-outline"
            onClick={() => {
              cancelledRef.current = true;
              setIsProcessing(false);
              // clear all processed files
              setProcessedFiles(new Map());
            }}
          >
            Cancel
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={files.length === 0 || !outputFolder || isProcessing}
            title={
              files.length === 0 || !outputFolder
                ? "Please select files and output folder"
                : "Start the background removal process"
            }
            onClick={handleStart}
          >
            Remove background
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
