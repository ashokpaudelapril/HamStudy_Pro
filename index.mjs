import { contextBridge, ipcRenderer } from "electron";
async function getQuestionPool(filter) {
  return ipcRenderer.invoke("questions:get-pool", { tier: filter.tier });
}
async function getQuestionById(questionId) {
  return ipcRenderer.invoke("questions:get-by-id", { questionId });
}
async function searchQuestions(filter) {
  return ipcRenderer.invoke("questions:search", filter);
}
async function getQuestionBrowserRows(filter) {
  return ipcRenderer.invoke("questions:get-browser-rows", filter);
}
async function getQuestionBrowserDetail(filter) {
  return ipcRenderer.invoke("questions:get-browser-detail", filter);
}
async function updateQuestionReviewState(input) {
  return ipcRenderer.invoke("questions:update-review-state", input);
}
async function getWeakAreaQuestionPool(filter) {
  return ipcRenderer.invoke("questions:get-weak-area-pool", filter);
}
async function getCustomQuizQuestionPool(filter) {
  return ipcRenderer.invoke("questions:get-custom-quiz-pool", filter);
}
async function reloadAuthoredContent() {
  return ipcRenderer.invoke("questions:reload-authored-content");
}
async function saveAnswer(payload) {
  return ipcRenderer.invoke("progress:save-answer", payload);
}
async function getProgressStats() {
  return ipcRenderer.invoke("progress:get-stats");
}
async function getTierProgressStats() {
  return ipcRenderer.invoke("progress:get-tier-stats");
}
async function getSessionHistory(filter) {
  return ipcRenderer.invoke("progress:get-session-history", filter);
}
async function getRecentAnswerActivity(filter) {
  return ipcRenderer.invoke("progress:get-recent-answer-activity", filter);
}
async function getProgressionSummary(filter) {
  return ipcRenderer.invoke("progress:get-progression-summary", filter);
}
async function getProgressionTrend(filter) {
  return ipcRenderer.invoke("progress:get-progression-trend", filter);
}
async function getAccuracyHeatmap(filter) {
  return ipcRenderer.invoke("progress:get-accuracy-heatmap", filter);
}
async function getDueSrsQueue(filter) {
  return ipcRenderer.invoke("progress:get-due-srs-queue", filter);
}
async function recordSrsReview(payload) {
  return ipcRenderer.invoke("progress:record-srs-review", payload);
}
async function getSettings() {
  return ipcRenderer.invoke("settings:get");
}
async function saveSettings(settings) {
  return ipcRenderer.invoke("settings:save", settings);
}
async function resetAppData() {
  return ipcRenderer.invoke("settings:reset-app-data");
}
async function listVoices() {
  return ipcRenderer.invoke("settings:voice-list");
}
async function speakText(input) {
  return ipcRenderer.invoke("settings:voice-speak", input);
}
async function stopSpeech() {
  return ipcRenderer.invoke("settings:voice-stop");
}
async function getVoiceDiagnostics() {
  return ipcRenderer.invoke("settings:voice-diagnostics");
}
async function setApiKey(input) {
  return ipcRenderer.invoke("keychain:set-api-key", input);
}
async function deleteApiKey(input) {
  return ipcRenderer.invoke("keychain:delete-api-key", input);
}
async function getApiKeyStatus() {
  return ipcRenderer.invoke("keychain:get-api-key-status");
}
async function getRecentChatHistory(filter) {
  return ipcRenderer.invoke("ai:get-chat-history", filter);
}
async function getAdaptivePlan() {
  return ipcRenderer.invoke("ai:get-adaptive-plan");
}
async function getUserMnemonic(questionId) {
  return ipcRenderer.invoke("ai:get-user-mnemonic", { questionId });
}
async function generateMnemonic(questionId) {
  return ipcRenderer.invoke("ai:generate-mnemonic", { questionId });
}
async function sendChatMessage(input) {
  return ipcRenderer.invoke("ai:chat-message", input);
}
function onAiChunk(callback) {
  const listener = (_event, chunk) => {
    callback(chunk);
  };
  ipcRenderer.on("ai:chunk", listener);
  return () => {
    ipcRenderer.removeListener("ai:chunk", listener);
  };
}
function onAiChunkEnd(callback) {
  const listener = () => {
    callback();
  };
  ipcRenderer.on("ai:chunk-end", listener);
  return () => {
    ipcRenderer.removeListener("ai:chunk-end", listener);
  };
}
function onAiError(callback) {
  const listener = (_event, error) => {
    callback(error);
  };
  ipcRenderer.on("ai:error", listener);
  return () => {
    ipcRenderer.removeListener("ai:error", listener);
  };
}
contextBridge.exposeInMainWorld("hamstudy", {
  version: "0.1.0",
  getQuestionPool,
  getQuestionById,
  searchQuestions,
  getQuestionBrowserRows,
  getQuestionBrowserDetail,
  updateQuestionReviewState,
  getWeakAreaQuestionPool,
  getCustomQuizQuestionPool,
  reloadAuthoredContent,
  saveAnswer,
  getProgressStats,
  getTierProgressStats,
  getSessionHistory,
  getRecentAnswerActivity,
  getProgressionSummary,
  getProgressionTrend,
  getAccuracyHeatmap,
  getDueSrsQueue,
  recordSrsReview,
  getSettings,
  saveSettings,
  resetAppData,
  listVoices,
  speakText,
  stopSpeech,
  getVoiceDiagnostics,
  getDailyChallengeEvents,
  setApiKey,
  deleteApiKey,
  getApiKeyStatus,
  getRecentChatHistory,
  sendChatMessage,
  onAiChunk,
  onAiChunkEnd,
  onAiError,
  getAdaptivePlan,
  getUserMnemonic,
  generateMnemonic,
  getEarnedBadges
});
async function getDailyChallengeEvents(filter) {
  return ipcRenderer.invoke("progress:get-daily-challenge-events", filter);
}
async function getEarnedBadges() {
  return ipcRenderer.invoke("progress:get-earned-badges");
}
