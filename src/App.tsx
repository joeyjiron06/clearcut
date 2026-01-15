import { useReducer, useRef, useCallback, useEffect } from "react";
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
import {
  appReducer,
  initialState,
  filesSelected,
  removeFileButtonClicked,
  clearFilesButtonClicked,
  outputFolderSelected,
  dragEntered,
  dragLeft,
  removeBackgroundButtonClicked,
  fileStatusChanged,
  processingProgressChanged,
  processingCompleted,
  cancelButtonClicked,
  resetButtonClicked,
  cancelComplete,
} from "./App.reducer";
import "./App.css";

function App() {
  const [storedOutputFolder, setStoredOutputFolder] = useLocalStorage<
    string | null
  >("output-folder", null);

  // Initialize reducer with localStorage value
  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    outputFolder: storedOutputFolder || undefined,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { files, outputFolder, isDragging, processingRequest } = state;

  // Extract processing-related values
  const isProcessing = processingRequest?.status === "processing";
  const processedFiles = processingRequest?.processedFiles ?? new Map();
  const currentProcessingIndex = processingRequest?.currentProcessingIndex ?? 0;
  const isCancelling = processingRequest?.isCancelling ?? false;

  // Track latest isCancelling state for async function access
  const isCancellingRef = useRef(isCancelling);

  // Sync outputFolder from reducer state to localStorage (one-way sync)
  useEffect(() => {
    if (state.outputFolder !== (storedOutputFolder || undefined)) {
      setStoredOutputFolder(state.outputFolder || null);
    }
  }, [state.outputFolder, storedOutputFolder, setStoredOutputFolder]);

  // Sync isCancelling to ref for async access
  useEffect(() => {
    isCancellingRef.current = isCancelling;
  }, [isCancelling]);

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

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;

    if (selectedFiles) {
      dispatch(filesSelected(Array.from(selectedFiles)));
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
        dispatch(outputFolderSelected(selected));
      }
    } catch (error) {
      console.error("Error selecting folder:", error);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch(dragEntered());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch(dragEntered());
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch(dragLeft());
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dispatch(dragLeft());

    const files = Array.from(e.dataTransfer.files);
    dispatch(filesSelected(files));
  };

  const removeFile = (index: number) => {
    dispatch(removeFileButtonClicked(index));
  };

  const clearFiles = () => {
    const fileInput = fileInputRef.current;
    if (fileInput) {
      fileInput.value = "";
    }
    dispatch(clearFilesButtonClicked());
  };

  const handleStart = useCallback(async () => {
    // Initialize processing state
    dispatch(removeBackgroundButtonClicked());

    // Process files one by one
    for (let i = 0; i < files.length; i++) {
      // Check if cancelled before processing each file
      if (isCancellingRef.current) {
        dispatch(cancelComplete());
        break;
      }

      const file = files[i];
      dispatch(processingProgressChanged(i));

      // Update status to processing
      dispatch(fileStatusChanged(file.id, "processing"));

      try {
        const mask = await Photo.generateMask(file.preview);

        // Check if cancelled after generateMask
        if (isCancellingRef.current) {
          dispatch(cancelComplete());
          break;
        }

        const bytes = await Photo.applyMask(file.preview, mask);

        // Check if cancelled after applyMask
        if (isCancellingRef.current) {
          dispatch(cancelComplete());
          break;
        }

        await Photo.save(outputFolder!, file.name, bytes);

        // Check if cancelled after save
        if (isCancellingRef.current) {
          dispatch(cancelComplete());
          break;
        }

        // Update status to completed
        dispatch(fileStatusChanged(file.id, "completed"));
      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);

        // Update status to error
        dispatch(fileStatusChanged(file.id, "error"));
      }
    }

    // Check if all files are completed
    if (!isCancellingRef.current) {
      dispatch(processingCompleted());
    } else {
      dispatch(cancelComplete());
    }
  }, [files, outputFolder, dispatch]);

  const handleReset = () => {
    clearFiles();
    dispatch(resetButtonClicked());
  };

  const getProgress = (): number => {
    if (isComplete()) return 100;
    return processingRequest?.progress ?? 0;
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
            onClick={() => dispatch(cancelButtonClicked())}
            disabled={isCancelling}
          >
            {isCancelling ? "Cancelling..." : "Cancel"}
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
