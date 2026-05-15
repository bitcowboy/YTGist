const LOCAL_DEBUG_STORAGE_KEY = "youtubegist_local_debug";
const THINKING_STORAGE_KEY = "youtubegist_thinking";

const statusEl = document.getElementById("status");
const localDebugCheckbox = document.getElementById("local-debug");
const thinkingCheckbox = document.getElementById("thinking-mode");

init().catch((error) => {
  console.error(error);
  setStatus("加载设置时出错，请重试。" + (error?.message ? `\n${error.message}` : ""));
});

async function init() {
  await loadSettings();

  localDebugCheckbox.addEventListener("change", handleLocalDebugChange);
  thinkingCheckbox.addEventListener("change", handleThinkingChange);
}

async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      LOCAL_DEBUG_STORAGE_KEY,
      THINKING_STORAGE_KEY,
    ]);
    localDebugCheckbox.checked = result[LOCAL_DEBUG_STORAGE_KEY] || false;
    thinkingCheckbox.checked = result[THINKING_STORAGE_KEY] || false;
  } catch (error) {
    console.warn("读取设置失败:", error);
    setStatus("读取设置失败，使用默认配置。");
  }
}

async function notifyContentScript(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    return;
  }
  const supportedPlatforms = ["youtube.com", "youtu.be", "bilibili.com", "b23.tv"];
  const isSupportedPlatform = supportedPlatforms.some((platform) => tab.url.includes(platform));
  if (!isSupportedPlatform) {
    return;
  }
  chrome.tabs.sendMessage(tab.id, message).catch(() => {
    // content script 可能尚未加载，忽略
  });
}

async function handleLocalDebugChange() {
  const isLocalDebug = localDebugCheckbox.checked;

  try {
    await chrome.storage.local.set({ [LOCAL_DEBUG_STORAGE_KEY]: isLocalDebug });
    setStatus("设置已保存");
    await notifyContentScript({ type: "UPDATE_BASE_URL", isLocalDebug });
  } catch (error) {
    console.error("保存设置失败:", error);
    setStatus("保存设置失败，请重试。");
  }
}

async function handleThinkingChange() {
  const thinking = thinkingCheckbox.checked;

  try {
    await chrome.storage.local.set({ [THINKING_STORAGE_KEY]: thinking });
    setStatus("设置已保存");
    await notifyContentScript({ type: "UPDATE_THINKING", thinking });
  } catch (error) {
    console.error("保存设置失败:", error);
    setStatus("保存设置失败，请重试。");
  }
}

function setStatus(message) {
  if (!message) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    return;
  }

  statusEl.textContent = message;
  statusEl.classList.remove("hidden");
}
