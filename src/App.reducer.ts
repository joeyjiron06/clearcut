// State interface
export type FileItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  preview: string;
};

export type FileStatus = "pending" | "processing" | "completed" | "error";

export type ProcessingRequest = {
  status: "processing" | "success" | "error";
  progress: number;
  processedFiles: Map<string, FileStatus>;
  currentProcessingIndex: number;
  isCancelling: boolean;
};

export interface AppState {
  isDragging: boolean;
  files: FileItem[];
  outputFolder?: string;
  processingRequest?: ProcessingRequest;
}

// Action creators
export function filesSelected(files: File[]) {
  return {
    type: "FILES_SELECTED",
    payload: files,
  } as const;
}

export function removeFileButtonClicked(index: number) {
  return {
    type: "REMOVE_FILE_BUTTON_CLICKED",
    payload: index,
  } as const;
}

export function clearFilesButtonClicked() {
  return {
    type: "CLEAR_FILES_BUTTON_CLICKED",
  } as const;
}

export function outputFolderSelected(folder: string | null) {
  return {
    type: "OUTPUT_FOLDER_SELECTED",
    payload: folder,
  } as const;
}

export function dragEntered() {
  return {
    type: "DRAG_ENTERED",
  } as const;
}

export function dragLeft() {
  return {
    type: "DRAG_LEFT",
  } as const;
}

export function removeBackgroundButtonClicked() {
  return {
    type: "REMOVE_BACKGROUND_BUTTON_CLICKED",
  } as const;
}

export function fileStatusChanged(fileId: string, status: FileStatus) {
  return {
    type: "FILE_STATUS_CHANGED",
    payload: { fileId, status },
  } as const;
}

export function processingProgressChanged(index: number) {
  return {
    type: "PROCESSING_PROGRESS_CHANGED",
    payload: index,
  } as const;
}

export function processingCompleted() {
  return {
    type: "PROCESSING_COMPLETED",
  } as const;
}

export function cancelButtonClicked() {
  return {
    type: "CANCEL_BUTTON_CLICKED",
  } as const;
}

export function resetButtonClicked() {
  return {
    type: "RESET_BUTTON_CLICKED",
  } as const;
}

export function cancelComplete() {
  return {
    type: "CANCEL_COMPLETE",
  } as const;
}

// Action types
export type AppAction =
  | ReturnType<typeof filesSelected>
  | ReturnType<typeof removeFileButtonClicked>
  | ReturnType<typeof clearFilesButtonClicked>
  | ReturnType<typeof outputFolderSelected>
  | ReturnType<typeof dragEntered>
  | ReturnType<typeof dragLeft>
  | ReturnType<typeof removeBackgroundButtonClicked>
  | ReturnType<typeof fileStatusChanged>
  | ReturnType<typeof processingProgressChanged>
  | ReturnType<typeof processingCompleted>
  | ReturnType<typeof cancelButtonClicked>
  | ReturnType<typeof resetButtonClicked>
  | ReturnType<typeof cancelComplete>;

// Initial state
export const initialState: AppState = {
  files: [],
  isDragging: false,
};

// Helper function to create a new Map with updated value
function updateMap<K, V>(map: Map<K, V>, key: K, value: V): Map<K, V> {
  const newMap = new Map(map);
  newMap.set(key, value);
  return newMap;
}

// Reducer function
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "FILES_SELECTED": {
      // Filter image files
      const imageFiles = action.payload.filter(
        (file) =>
          file.type.startsWith("image/") ||
          /\.(svg|png|jpg|jpeg)$/i.test(file.name)
      );

      // Convert to FileItem and create preview URLs
      const newFiles: FileItem[] = imageFiles.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        path: (file as any).path || file.name,
        size: file.size,
        preview: URL.createObjectURL(file),
      }));

      return {
        ...state,
        files: [...state.files, ...newFiles],
      };
    }

    case "REMOVE_FILE_BUTTON_CLICKED": {
      const fileToRemove = state.files[action.payload];
      // Revoke object URL to prevent memory leaks
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return {
        ...state,
        files: state.files.filter((_, i) => i !== action.payload),
      };
    }

    case "CLEAR_FILES_BUTTON_CLICKED": {
      // Revoke all object URLs to prevent memory leaks
      state.files.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
      return {
        ...state,
        files: [],
        processingRequest: undefined,
      };
    }

    case "OUTPUT_FOLDER_SELECTED":
      return {
        ...state,
        outputFolder: action.payload || undefined,
      };

    case "DRAG_ENTERED":
      return {
        ...state,
        isDragging: true,
      };

    case "DRAG_LEFT":
      return {
        ...state,
        isDragging: false,
      };

    case "REMOVE_BACKGROUND_BUTTON_CLICKED": {
      const initialStatus = new Map<string, FileStatus>();
      state.files.forEach((file) => {
        initialStatus.set(file.id, "pending");
      });
      return {
        ...state,
        processingRequest: {
          status: "processing",
          progress: 0,
          processedFiles: initialStatus,
          currentProcessingIndex: 0,
          isCancelling: false,
        },
      };
    }

    case "FILE_STATUS_CHANGED":
      if (!state.processingRequest) {
        return state;
      }
      const updatedProcessedFiles = updateMap(
        state.processingRequest.processedFiles,
        action.payload.fileId,
        action.payload.status
      );
      // Recalculate progress based on completed files
      const completedCount = Array.from(updatedProcessedFiles.values()).filter(
        (status) => status === "completed" || status === "error"
      ).length;
      const totalFilesForStatus = state.files.length;
      const newProgress =
        totalFilesForStatus > 0
          ? Math.round((completedCount / totalFilesForStatus) * 100)
          : 0;

      return {
        ...state,
        processingRequest: {
          ...state.processingRequest,
          processedFiles: updatedProcessedFiles,
          progress: newProgress,
        },
      };

    case "PROCESSING_PROGRESS_CHANGED":
      if (!state.processingRequest) {
        return state;
      }
      const totalFilesForProgress = state.files.length;
      const progressForIndex =
        totalFilesForProgress > 0
          ? Math.round((action.payload / totalFilesForProgress) * 100)
          : 0;
      return {
        ...state,
        processingRequest: {
          ...state.processingRequest,
          currentProcessingIndex: action.payload,
          progress: progressForIndex,
        },
      };

    case "PROCESSING_COMPLETED":
      if (!state.processingRequest) {
        return state;
      }
      return {
        ...state,
        processingRequest: {
          ...state.processingRequest,
          status: "success",
          progress: 100,
        },
      };

    case "CANCEL_BUTTON_CLICKED":
      if (!state.processingRequest) {
        return state;
      }
      return {
        ...state,
        processingRequest: {
          ...state.processingRequest,
          isCancelling: true,
        },
      };

    case "CANCEL_COMPLETE":
      return {
        ...state,
        processingRequest: undefined,
      };

    case "RESET_BUTTON_CLICKED": {
      // Revoke all object URLs to prevent memory leaks
      state.files.forEach((file) => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
      return {
        ...state,
        files: [],
        processingRequest: undefined,
      };
    }

    default:
      return state;
  }
}
