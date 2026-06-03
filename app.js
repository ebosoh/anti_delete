// Web and Android Bridge Logic for Anti-Delete App

// Configuration
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqJ3f5r4806a-placeholder/exec"; // Update with actual URL after deploy

document.addEventListener("DOMContentLoaded", () => {
  detectEnvironment();
  initDemo();
  loadAds();
  setupShare();
});

// 1. Detect if inside APK or Browser
function detectEnvironment() {
  const isAndroidAPK = typeof AndroidBridge !== "undefined";

  if (isAndroidAPK) {
    // Running inside Android Wrapper WebView
    document.getElementById("landingView").classList.add("hidden");
    document.getElementById("appView").classList.remove("hidden");
    document.getElementById("serviceStatus").classList.remove("hidden");
    document.querySelectorAll(".web-only").forEach(el => el.classList.add("hidden"));
    
    // Load local messages
    loadLocalMessages();
    setupAppControls();
    
    // Check permission status
    checkNotificationPermission();
  } else {
    // Standard web browser landing page
    document.getElementById("landingView").classList.remove("hidden");
    document.getElementById("appView").classList.add("hidden");
    document.getElementById("serviceStatus").classList.add("hidden");
    
    // Load and increment stats
    trackVisit();
    loadStats();
    
    // Download APK trigger
    document.getElementById("downloadApkBtn").addEventListener("click", downloadApk);
    
    // PWA Install support
    setupPwaInstallation();
  }
}

// 2. Android Wrapper WebView Communication (Local DB)
let localMessages = [];

function loadLocalMessages() {
  try {
    if (typeof AndroidBridge !== "undefined") {
      const messagesJson = AndroidBridge.getMessages();
      localMessages = JSON.parse(messagesJson);
      renderMessages(localMessages);
    }
  } catch (error) {
    console.error("Failed to parse local messages", error);
  }
}

function renderMessages(messages) {
  const listContainer = document.getElementById("messagesList");
  listContainer.innerHTML = "";

  if (messages.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <p>No messages captured yet. Send a message on WhatsApp to test.</p>
      </div>
    `;
    return;
  }

  messages.forEach(msg => {
    const item = document.createElement("div");
    item.className = "message-item";
    
    const formattedDate = new Date(msg.timestamp).toLocaleString();
    const isDeleted = msg.is_deleted === 1;

    item.innerHTML = `
      <div class="message-meta">
        <span class="message-sender">${escapeHtml(msg.sender)}</span>
        <span>${formattedDate}</span>
      </div>
      <div class="message-body">${escapeHtml(msg.content)}</div>
      <span class="message-badge ${isDeleted ? 'badge-deleted' : 'badge-normal'}">
        ${isDeleted ? '🛡️ Deleted & Saved' : 'Captured'}
      </span>
    `;
    listContainer.appendChild(item);
  });
}

function checkNotificationPermission() {
  if (typeof AndroidBridge !== "undefined") {
    const hasPermission = AndroidBridge.isNotificationServiceEnabled();
    const indicator = document.querySelector(".status-indicator");
    const statusText = document.querySelector(".status-text");
    const warningCard = document.getElementById("permissionWarningCard");
    
    if (hasPermission) {
      indicator.style.backgroundColor = "#10B981";
      indicator.style.boxShadow = "0 0 8px #10B981";
      statusText.innerText = "Active";
      if (warningCard) warningCard.classList.add("hidden");
    } else {
      indicator.style.backgroundColor = "#EF4444";
      indicator.style.boxShadow = "0 0 8px #EF4444";
      statusText.innerText = "Permission Required";
      statusText.style.cursor = "pointer";
      if (warningCard) warningCard.classList.remove("hidden");
      
      // Let user click to open system settings
      statusText.addEventListener("click", () => {
        AndroidBridge.openNotificationSettings();
      });
    }
  }
}

function setupAppControls() {
  // Grant permission btn
  const grantBtn = document.getElementById("grantPermissionBtn");
  if (grantBtn) {
    grantBtn.addEventListener("click", () => {
      if (typeof AndroidBridge !== "undefined") {
        AndroidBridge.openNotificationSettings();
      }
    });
  }

  // Search filter
  const searchInput = document.getElementById("searchBar");
  searchInput.addEventListener("input", filterAndRenderMessages);

  // Tab filter
  const tabBtns = document.querySelectorAll(".tab-btn");
  let activeFilter = "all";

  tabBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      tabBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      activeFilter = e.target.getAttribute("data-filter");
      filterAndRenderMessages();
    });
  });

  function filterAndRenderMessages() {
    const query = searchInput.value.toLowerCase();
    const filtered = localMessages.filter(msg => {
      const matchesSearch = msg.sender.toLowerCase().includes(query) || msg.content.toLowerCase().includes(query);
      const matchesTab = activeFilter === "all" || (activeFilter === "deleted" && msg.is_deleted === 1);
      return matchesSearch && matchesTab;
    });
    renderMessages(filtered);
  }

  // Refresh
  document.getElementById("refreshBtn").addEventListener("click", () => {
    loadLocalMessages();
    checkNotificationPermission();
  });
}

// 3. Web UI Stats API (Apps Script)
function animateValue(id, start, end, duration, suffix = "") {
  const obj = document.getElementById(id);
  if (!obj) return;
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const currentValue = Math.floor(progress * (end - start) + start);
    obj.innerText = currentValue.toLocaleString() + suffix;
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
}

function loadStats() {
  // Always animate the privacy meter to 100%
  animateValue("privacyPercent", 0, 100, 1500, "%");

  if (APPS_SCRIPT_URL.includes("placeholder")) {
    // Show mock stats if backend is not linked yet
    animateValue("visitorCount", 0, 1240, 1500);
    animateValue("downloadCount", 0, 432, 1500);
    return;
  }

  fetch(`${APPS_SCRIPT_URL}?action=getStats`)
    .then(res => res.json())
    .then(data => {
      animateValue("visitorCount", 0, Number(data.visitors) || 0, 1500);
      animateValue("downloadCount", 0, Number(data.downloads) || 0, 1500);
    })
    .catch(err => {
      console.error("Error loading statistics", err);
      document.getElementById("visitorCount").innerText = "---";
      document.getElementById("downloadCount").innerText = "---";
    });
}

function trackVisit() {
  if (APPS_SCRIPT_URL.includes("placeholder")) return;

  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "trackVisit" })
  }).catch(err => console.error("Error tracking visit", err));
}

function downloadApk() {
  // Trigger Apps Script download track
  if (!APPS_SCRIPT_URL.includes("placeholder")) {
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trackDownload" })
    }).catch(err => console.error("Error tracking download", err));
  }

  // Start file download
  const link = document.createElement("a");
  link.href = "antidelete.apk"; // Path to compiled APK
  link.download = "antidelete.apk";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Reload stats after short delay to show updated download count
  setTimeout(loadStats, 2000);
}

// 4. Advertisement Rotator & Tracking
function loadAds() {
  if (APPS_SCRIPT_URL.includes("placeholder")) return;

  fetch(`${APPS_SCRIPT_URL}?action=getAds`)
    .then(res => res.json())
    .then(ads => {
      if (ads && ads.length > 0) {
        // Pick a random ad from active list
        const randomAd = ads[Math.floor(Math.random() * ads.length)];
        displayAd(randomAd);
      }
    })
    .catch(err => console.error("Error loading ads", err));
}

function displayAd(ad) {
  const container = document.getElementById("adContainer");
  const img = document.getElementById("adImage");
  const link = document.getElementById("adLink");
  const closeBtn = document.getElementById("closeAdBtn");

  img.src = ad.imageUrl;
  link.href = ad.redirectUrl;
  container.classList.remove("hidden");

  // Track Impression
  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "trackAdImpression", adId: ad.id })
  }).catch(err => console.error("Error tracking impression", err));

  // Track Click
  link.onclick = () => {
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "trackAdClick", adId: ad.id })
    }).catch(err => console.error("Error tracking click", err));
  };

  // Close ad
  closeBtn.onclick = () => {
    container.classList.add("hidden");
  };
}

// 5. Interactive Demo
function initDemo() {
  const triggerBtn = document.getElementById("triggerDemoBtn");
  const deletedBubble = document.getElementById("deletedBubble");
  const recoveredBubble = document.getElementById("recoveredBubble");
  const chatDemoBody = document.getElementById("chatDemoBody");
  
  let state = "normal"; // normal, deleted, recovered

  triggerBtn.addEventListener("click", () => {
    if (state === "normal") {
      // Simulate Sender Deleting
      deletedBubble.classList.remove("hidden");
      deletedBubble.style.display = "flex";
      triggerBtn.innerText = "Recover Deleted Message";
      state = "deleted";
    } else if (state === "deleted") {
      // Simulate Recovery
      recoveredBubble.classList.remove("hidden");
      recoveredBubble.style.display = "flex";
      
      // Smooth scroll to bottom of mockup chat
      chatDemoBody.scrollTop = chatDemoBody.scrollHeight;
      
      triggerBtn.innerText = "Reset Demo";
      state = "recovered";
    } else {
      // Reset demo
      deletedBubble.style.display = "none";
      recoveredBubble.style.display = "none";
      triggerBtn.innerText = "Simulate Delete";
      state = "normal";
    }
  });
}

// 6. Viral Share mechanism
function setupShare() {
  const shareBtn = document.getElementById("shareStatusBtn");
  if (!shareBtn) return;

  const shareData = {
    title: "Anti-Delete | Save WhatsApp Chats",
    text: "🛡️ Save WhatsApp messages even after the sender deletes them! Free & private. Check it out!",
    url: window.location.href
  };

  shareBtn.addEventListener("click", async () => {
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Error sharing", err);
      }
    } else {
      // Fallback: Copy to Clipboard
      try {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        alert("📋 Link & status message copied to clipboard! Share it on WhatsApp status to go viral.");
      } catch (err) {
        console.error("Failed to copy", err);
      }
    }
  });
}

// PWA Install Prompt helper
function setupPwaInstallation() {
  let deferredPrompt;
  const pwaBtn = document.getElementById("pwaInstallBtn");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    pwaBtn.classList.remove("hidden");
  });

  pwaBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    deferredPrompt = null;
    pwaBtn.classList.add("hidden");
  });

  window.addEventListener("appinstalled", () => {
    console.log("PWA Installed successfully");
    pwaBtn.classList.add("hidden");
  });
}

// Helper: Escape HTML string to avoid XSS
function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
