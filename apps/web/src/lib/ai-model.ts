export const AI_MODEL_STORAGE_KEY = "pet-task-ai-model";

export function getSelectedAiModel(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage.getItem(AI_MODEL_STORAGE_KEY) || undefined;
}

export function setSelectedAiModel(modelRef: string) {
  window.localStorage.setItem(AI_MODEL_STORAGE_KEY, modelRef);
}
