// Web and Android Bridge Logic for Anti-Delete App

// Configuration
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxB4XY-xVrQSP-wNDGCyx3nURP5rSrHYufSbqZmtCp6ecOCNe4OW19Rmz_nHLchre4HuQ/exec"; // Update with actual URL after deploy

// 0. Browser Mock Mode for Developer Testing (activated via ?apk=true in URL)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("apk") === "true" && typeof AndroidBridge === "undefined") {
  window.AndroidBridge = {
    getMessages: function() {
      return JSON.stringify([
        { id: 1, sender: "James Wafula", content: "Hey, are you free tonight?", timestamp: Date.now() - 600000, is_deleted: 0, app_source: "WhatsApp" },
        { id: 2, sender: "James Wafula", content: "I bought you a surprise gift! 🎁", timestamp: Date.now() - 300000, is_deleted: 1, app_source: "WhatsApp" },
        { id: 3, sender: "Sarah", content: "Did you finish the report?", timestamp: Date.now() - 200000, is_deleted: 0, app_source: "Tel" },
        { id: 4, sender: "Sarah", content: "Oops, sent to wrong person", timestamp: Date.now() - 150000, is_deleted: 1, app_source: "Tel" },
        { id: 5, sender: "Grogan spares zone", content: "John: Hey check this out", timestamp: Date.now() - 100000, is_deleted: 0, app_source: "WhatsApp" },
        { id: 6, sender: "Grogan spares zone", content: "John: 🚫 This message was deleted", timestamp: Date.now() - 50000, is_deleted: 1, app_source: "WhatsApp" },
        { id: 7, sender: "+254712345678", content: "Your M-PESA code is 8JKF892. Do not share.", timestamp: Date.now() - 80000, is_deleted: 0, app_source: "SMS" },
        { id: 8, sender: "Alice", content: "Are we meeting today?", timestamp: Date.now() - 70000, is_deleted: 0, app_source: "FB" },
        { id: 9, sender: "InstaUser", content: "Liked your photo!", timestamp: Date.now() - 60000, is_deleted: 0, app_source: "IG" }
      ]);
    },
    isNotificationServiceEnabled: function() { return true; },
    openNotificationSettings: function() { alert("Mock: Opening notification settings"); },
    getVersionCode: function() { return 1; },
    getVersionName: function() { return "1.00"; },
    getDeviceId: function() { return ""; } // degrades gracefully to bypass license check
  };
}

document.addEventListener("DOMContentLoaded", () => {
  detectEnvironment();
  initDemo();
  loadAds();
  setupShare();
  initPaymentFlow();
  initWhatsAppFloat();
});

// 1. Detect if inside APK or Browser
function detectEnvironment() {
  const isAndroidAPK = typeof AndroidBridge !== "undefined";

  if (isAndroidAPK) {
    // Running inside Android Wrapper WebView
    document.body.classList.add("apk-mode");
    document.getElementById("landingView").classList.add("hidden");
    document.getElementById("appView").classList.add("hidden");     // Hidden until license is verified
    document.getElementById("activationView").classList.add("hidden"); // Hidden until needed
    document.getElementById("serviceStatus").classList.remove("hidden");
    document.querySelectorAll(".web-only").forEach(el => el.classList.add("hidden"));

    // Check for app updates
    checkForUpdates();

    // Run license verification before showing anything
    verifyOrRegisterLicense();
  } else {
    // Standard web browser landing page
    document.getElementById("landingView").classList.remove("hidden");
    document.getElementById("appView").classList.add("hidden");
    document.getElementById("serviceStatus").classList.add("hidden");

    // Load and increment stats
    trackVisit();
    loadStats();

    // Download APK trigger (Direct download)
    document.getElementById("downloadApkBtn").addEventListener("click", downloadApk);
  }
}

// 2. Android Wrapper WebView Communication (Local DB)
let localMessages = [];
let activeFilter = "all";

function loadLocalMessages() {
  try {
    if (typeof AndroidBridge !== "undefined") {
      const messagesJson = AndroidBridge.getMessages();
      localMessages = JSON.parse(messagesJson);
      filterAndRenderMessages();
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
    const isDeleted = Number(msg.is_deleted) === 1;
    const appSource = msg.app_source || "WhatsApp";
    const appBadgeClass = "badge-" + appSource.toLowerCase();

    item.innerHTML = `
      <div class="message-meta">
        <span class="message-sender">${escapeHtml(msg.sender)}</span>
        <span>${formattedDate}</span>
      </div>
      <div class="message-body">${escapeHtml(msg.content)}</div>
      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <span class="message-badge app-badge ${appBadgeClass}">
          ${appSource}
        </span>
        <span class="message-badge ${isDeleted ? 'badge-deleted' : 'badge-normal'}">
          ${isDeleted ? '🛡️ Deleted & Saved' : 'Captured'}
        </span>
      </div>
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

function checkForUpdates() {
  if (typeof AndroidBridge === "undefined") return;

  try {
    const currentVersionCode = AndroidBridge.getVersionCode();
    
    // Fetch version metadata
    fetch("version.json?t=" + new Date().getTime())
      .then(res => res.json())
      .then(data => {
        if (data && data.versionCode > currentVersionCode) {
          const updateCard = document.getElementById("updateAppCard");
          const updateVer = document.getElementById("updateVersionName");
          const updateBtn = document.getElementById("updateNowBtn");
          
          if (updateCard && updateVer && updateBtn) {
            updateVer.innerText = data.versionName;
            updateCard.classList.remove("hidden");
            
            updateBtn.onclick = () => {
              if (typeof AndroidBridge !== "undefined") {
                if (typeof AndroidBridge.downloadApk === "function") {
                  const absoluteApkUrl = new URL(data.apkUrl, window.location.href).href;
                  AndroidBridge.downloadApk(absoluteApkUrl);
                } else {
                  // Fallback for older APKs lacking the downloadApk native method
                  alert("To apply this update, please download and install the new version (v1.03) manually from www.antidelete.com in your web browser.");
                  window.location.href = "https://www.antidelete.com/";
                }
              } else {
                // Direct user to download and trigger APK update installation (browser fallback)
                const link = document.createElement("a");
                link.href = data.apkUrl;
                link.download = "antidelete.apk";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            };
          }
        }
      })
      .catch(err => console.error("Error checking for updates:", err));
  } catch (error) {
    console.error("Failed update checking:", error);
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
  if (searchInput) {
    searchInput.addEventListener("input", filterAndRenderMessages);
  }

  // Tab filter
  const tabBtns = document.querySelectorAll(".tab-btn");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      tabBtns.forEach(b => b.classList.remove("active"));
      e.target.classList.add("active");
      activeFilter = e.target.getAttribute("data-filter");
      filterAndRenderMessages();
    });
  });

  // Close chat detail modal listeners
  const closeChatBtn = document.getElementById("closeChatDetailBtn");
  const chatModal = document.getElementById("contactMessagesModal");
  if (closeChatBtn && chatModal) {
    closeChatBtn.addEventListener("click", () => {
      chatModal.classList.add("hidden");
    });
    chatModal.addEventListener("click", (e) => {
      if (e.target === chatModal) {
        chatModal.classList.add("hidden");
      }
    });
  }

  // Refresh
  const refreshBtn = document.getElementById("refreshBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadLocalMessages();
      checkNotificationPermission();
    });
  }
}

function filterAndRenderMessages() {
  const searchInput = document.getElementById("searchBar");
  const query = searchInput ? searchInput.value.toLowerCase() : "";

  if (activeFilter === "deleted") {
    const contactsMap = {};
    localMessages.forEach(msg => {
      if (Number(msg.is_deleted) === 1) {
        const senderMatches = msg.sender.toLowerCase().includes(query);
        const contentMatches = msg.content.toLowerCase().includes(query);
        
        if (!contactsMap[msg.sender]) {
          contactsMap[msg.sender] = {
            sender: msg.sender,
            deletedCount: 0,
            latestMsg: msg,
            allDeletedMsgs: [],
            matchesQuery: false
          };
        }
        contactsMap[msg.sender].deletedCount++;
        contactsMap[msg.sender].allDeletedMsgs.push(msg);
        if (senderMatches || contentMatches) {
          contactsMap[msg.sender].matchesQuery = true;
        }
      }
    });

    const contacts = Object.values(contactsMap).filter(c => {
      return !query || c.matchesQuery;
    });

    renderContactsList(contacts);
  } else {
    // activeFilter is "all", "WhatsApp", "Tel", "FB", "IG", or "SMS"
    const filtered = localMessages.filter(msg => {
      const matchesSearch = msg.sender.toLowerCase().includes(query) || msg.content.toLowerCase().includes(query);
      const matchesFilter = activeFilter === "all" || (msg.app_source && msg.app_source === activeFilter);
      return matchesSearch && matchesFilter;
    });
    renderMessages(filtered);
  }
}

function renderContactsList(contacts) {
  const listContainer = document.getElementById("messagesList");
  listContainer.innerHTML = "";

  if (contacts.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🛡️</div>
        <p>No contacts with deleted messages found.</p>
      </div>
    `;
    return;
  }

  contacts.forEach(contact => {
    const item = document.createElement("div");
    item.className = "contact-item";
    item.addEventListener("click", () => {
      showContactDeletedMessagesModal(contact);
    });

    const formattedDate = new Date(contact.latestMsg.timestamp).toLocaleString();
    item.innerHTML = `
      <div class="contact-header">
        <span class="contact-name">${escapeHtml(contact.sender)}</span>
        <span class="contact-time">${formattedDate}</span>
      </div>
      <div class="contact-preview">
        <span class="latest-deleted-msg">${escapeHtml(contact.latestMsg.content)}</span>
      </div>
      <div class="contact-meta">
        <span class="deleted-count-badge">🛡️ ${contact.deletedCount} ${contact.deletedCount === 1 ? 'Message' : 'Messages'}</span>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

function showContactDeletedMessagesModal(contact) {
  const modal = document.getElementById("contactMessagesModal");
  const senderEl = document.getElementById("chatDetailSender");
  const countEl = document.getElementById("chatDetailCount");
  const listEl = document.getElementById("chatDetailList");

  if (!modal || !senderEl || !countEl || !listEl) return;

  senderEl.textContent = contact.sender;
  countEl.textContent = `${contact.deletedCount} ${contact.deletedCount === 1 ? 'deleted message' : 'deleted messages'}`;
  
  listEl.innerHTML = "";
  contact.allDeletedMsgs.forEach(msg => {
    const item = document.createElement("div");
    item.className = "detail-msg-item";
    const formattedDate = new Date(msg.timestamp).toLocaleString();
    item.innerHTML = `
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">${formattedDate}</div>
      <div style="background: var(--bg-primary); border: 1px solid var(--border-color); padding: 12px; border-radius: 14px; color: var(--text-primary); font-size: 14px; word-break: break-word;">
        ${escapeHtml(msg.content)}
      </div>
    `;
    listEl.appendChild(item);
  });

  modal.classList.remove("hidden");
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
    animateValue("shareCount", 0, 185, 1500);
    return;
  }

  fetch(`${APPS_SCRIPT_URL}?action=getStats`)
    .then(res => res.json())
    .then(data => {
      animateValue("visitorCount", 0, Number(data.visitors) || 0, 1500);
      animateValue("downloadCount", 0, Number(data.downloads) || 0, 1500);
      animateValue("shareCount", 0, Number(data.shares) || 0, 1500);
    })
    .catch(err => {
      console.error("Error loading statistics", err);
      document.getElementById("visitorCount").innerText = "---";
      document.getElementById("downloadCount").innerText = "---";
      document.getElementById("shareCount").innerText = "---";
    });
}

function trackVisit() {
  if (APPS_SCRIPT_URL.includes("placeholder")) return;

  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "trackVisit" })
  }).catch(err => console.error("Error tracking visit", err));
}

function trackShare() {
  if (APPS_SCRIPT_URL.includes("placeholder")) return;

  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "trackShare" })
  }).catch(err => console.error("Error tracking share", err));
}

function downloadApk() {
  // Trigger Apps Script download track
  if (!APPS_SCRIPT_URL.includes("placeholder")) {
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
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
  const showFallbackAd = () => {
    const mockAd = {
      id: "mock-ad-demo",
      imageUrl: "safaricom_ad.png",
      redirectUrl: "https://www.safaricom.co.ke"
    };
    displayAd(mockAd);
  };

  if (APPS_SCRIPT_URL.includes("placeholder")) {
    showFallbackAd();
    return;
  }

  fetch(`${APPS_SCRIPT_URL}?action=getAds`)
    .then(res => res.json())
    .then(ads => {
      if (ads && ads.length > 0) {
        // Pick a random ad from active list
        const randomAd = ads[Math.floor(Math.random() * ads.length)];
        displayAd(randomAd);
      } else {
        showFallbackAd();
      }
    })
    .catch(err => {
      console.error("Error loading ads", err);
      showFallbackAd();
    });
}

function displayAd(ad) {
  const container = document.getElementById("adContainer");
  const img = document.getElementById("adImage");
  const link = document.getElementById("adLink");
  const closeBtn = document.getElementById("closeAdBtn");

  img.src = ad.imageUrl;
  link.href = ad.redirectUrl;
  container.classList.remove("hidden");
  
  // Add padding to prevent ad overlapping contents
  if (document.body.classList.contains("apk-mode")) {
    const msgList = document.getElementById("messagesList");
    if (msgList) msgList.style.paddingBottom = "110px";
  } else {
    document.body.style.paddingBottom = "120px";
  }

  // Track Impression (only if not a demo ad)
  if (ad.id !== "mock-ad-demo") {
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
  } else {
    link.onclick = null; // Clean handler for preview mode
  }

  // Close ad
  closeBtn.onclick = () => {
    container.classList.add("hidden");
    if (document.body.classList.contains("apk-mode")) {
      const msgList = document.getElementById("messagesList");
      if (msgList) msgList.style.paddingBottom = "0px";
    } else {
      document.body.style.paddingBottom = "0px";
    }
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
    title: "Anti-Delete | Your WhatsApp Spy!",
    text: "🛡️ Save WhatsApp messages even after the sender deletes them! Check it out!",
    url: window.location.href
  };

  shareBtn.addEventListener("click", async () => {
    trackShare();
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log("Error sharing", err);
      }
    } else {
      // Fallback: Copy to Clipboard
      const copyText = `${shareData.text} ${shareData.url}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText)
          .then(() => alert("📋 Link & status message copied to clipboard! Share it on WhatsApp status to go viral."))
          .catch(() => {
            if (fallbackCopyText(copyText)) {
              alert("📋 Link & status message copied to clipboard! Share it on WhatsApp status to go viral.");
            } else {
              prompt("Copy this link to share:", copyText);
            }
          });
      } else {
        if (fallbackCopyText(copyText)) {
          alert("📋 Link & status message copied to clipboard! Share it on WhatsApp status to go viral.");
        } else {
          prompt("Copy this link to share:", copyText);
        }
      }
    }
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

// 7. M-PESA STK Push Payment Flow
let paymentPollInterval = null;
let paymentTimeoutTimer = null;
let currentCheckoutRequestId = null;

function initPaymentFlow() {
  const modal = document.getElementById("paymentModal");
  if (!modal) return;

  // Bind close buttons
  document.getElementById("closePaymentBtn").addEventListener("click", closePaymentModal);
  document.getElementById("closeSuccessBtn").addEventListener("click", closePaymentModal);
  
  // Pay Now button click
  document.getElementById("payNowBtn").addEventListener("click", handlePayClick);
  
  // Retry buttons
  document.getElementById("retryPaymentBtn").addEventListener("click", () => {
    showPaymentStep("input");
  });

  // Numeric phone field validation (only numbers)
  const phoneInput = document.getElementById("mpesaPhone");
  phoneInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "");
  });
}

function openPaymentModal() {
  const modal = document.getElementById("paymentModal");
  modal.classList.remove("hidden");
  showPaymentStep("input");
  
  // Reset input field
  document.getElementById("mpesaPhone").value = "";
}

function closePaymentModal() {
  const modal = document.getElementById("paymentModal");
  modal.classList.add("hidden");
  
  // Clear any active polling loops
  clearInterval(paymentPollInterval);
  clearTimeout(paymentTimeoutTimer);
}

function showPaymentStep(step) {
  // Hide all steps
  document.getElementById("paymentInputStep").classList.add("hidden");
  document.getElementById("paymentProcessStep").classList.add("hidden");
  document.getElementById("paymentSuccessStep").classList.add("hidden");
  document.getElementById("paymentErrorStep").classList.add("hidden");

  // Show requested step
  if (step === "input") {
    document.getElementById("paymentInputStep").classList.remove("hidden");
  } else if (step === "process") {
    document.getElementById("paymentProcessStep").classList.remove("hidden");
  } else if (step === "success") {
    document.getElementById("paymentSuccessStep").classList.remove("hidden");
  } else if (step === "error") {
    document.getElementById("paymentErrorStep").classList.remove("hidden");
  }
}

function handlePayClick() {
  const phoneInput = document.getElementById("mpesaPhone").value.trim();
  
  // Basic validation: must be 9 digits (excluding +254 or 0 prefix)
  if (phoneInput.length !== 9 || !["7", "1"].includes(phoneInput[0])) {
    alert("Please enter a valid Safaricom phone number (e.g. 708374149 or 112345678).");
    return;
  }

  // Format to standard 2547xxxxxxxx or 2541xxxxxxxx format
  const formattedPhone = "254" + phoneInput;
  
  showPaymentStep("process");
  
  // Setup timeout timer countdown (45 seconds)
  let timeLeft = 45;
  const timerSpan = document.getElementById("paymentTimer");
  timerSpan.innerText = timeLeft;
  
  const countdownInterval = setInterval(() => {
    timeLeft--;
    timerSpan.innerText = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
    }
  }, 1000);

  // Trigger payment API call
  initiateMpesaPush(formattedPhone, countdownInterval);
}

function initiateMpesaPush(phoneNumber, countdownInterval) {
  // 1. Demo Mode
  if (APPS_SCRIPT_URL.includes("placeholder")) {
    console.log("Demo Mode: Simulating Safaricom STK Push payment for phone:", phoneNumber);
    
    // Simulate STK pop-up wait time of 4 seconds
    paymentTimeoutTimer = setTimeout(() => {
      clearInterval(countdownInterval);
      showPaymentStep("success");
      
      // Start APK download
      downloadApk();
    }, 4500);
    return;
  }

  // 2. Real Mode (Production / Sandbox API Integration)
  const payBtn = document.getElementById("payNowBtn");
  payBtn.disabled = true;
  payBtn.innerText = "Initiating push...";

  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "initiatePayment",
      phoneNumber: phoneNumber,
      amount: "1000"
    })
  })
  .then(() => {
    payBtn.disabled = false;
    payBtn.innerHTML = `<span>Pay KES 1000</span><span class="pay-arrow">&rarr;</span>`;
    
    // Start polling the server for the latest transaction status for this phone number
    startPaymentStatusPolling(phoneNumber, countdownInterval);
  })
  .catch(err => {
    clearInterval(countdownInterval);
    payBtn.disabled = false;
    payBtn.innerHTML = `<span>Pay KES 1000</span><span class="pay-arrow">&rarr;</span>`;
    showPaymentStep("error");
    document.getElementById("paymentErrorMsg").innerText = "Failed to connect to M-PESA service. Check your internet connection.";
    console.error("M-PESA Error:", err);
  });
}

function startPaymentStatusPolling(phoneNumber, countdownInterval) {
  const startTime = new Date().getTime();
  
  paymentPollInterval = setInterval(() => {
    const elapsed = new Date().getTime() - startTime;
    
    // Safety check: Timeout after 45 seconds
    if (elapsed > 45000) {
      clearInterval(paymentPollInterval);
      clearInterval(countdownInterval);
      showPaymentStep("error");
      document.getElementById("paymentErrorMsg").innerText = "Payment timed out. You took too long to enter your PIN or the prompt didn't appear. Please try again.";
      return;
    }

    // Call check payment endpoint
    fetch(`${APPS_SCRIPT_URL}?action=checkPaymentStatus&phoneNumber=${phoneNumber}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "Completed") {
          clearInterval(paymentPollInterval);
          clearInterval(countdownInterval);
          showPaymentStep("success");
          
          // Trigger APK download
          downloadApk();
        } else if (data.status === "Failed") {
          clearInterval(paymentPollInterval);
          clearInterval(countdownInterval);
          showPaymentStep("error");
          document.getElementById("paymentErrorMsg").innerText = data.message || "Payment cancelled or rejected by user. Please try again.";
        }
      })
      .catch(err => {
        console.warn("Polling error (retrying):", err);
      });
  }, 3000);
}

// ==================== 8. LICENSE VERIFICATION SYSTEM ====================

/**
 * Master license gatekeeper — called on every APK launch.
 * Checks if this device has a valid license before revealing the app.
 */
async function verifyOrRegisterLicense() {
  const deviceId = (typeof AndroidBridge !== "undefined" && AndroidBridge.getDeviceId)
    ? AndroidBridge.getDeviceId()
    : null;

  if (!deviceId) {
    // AndroidBridge doesn't support getDeviceId yet — degrade gracefully
    console.warn("getDeviceId() not available. Allowing access.");
    unlockApp();
    return;
  }

  // Store deviceId for later use in activation
  window._deviceId = deviceId;

  // Update WhatsApp support link with device ID pre-filled
  const waLink = document.getElementById("whatsappSupportLink");
  if (waLink) {
    waLink.href = `https://wa.me/254780010010?text=Hi%2C%20my%20antiDELETE%20app%20needs%20activation.%20My%20Device%20ID%20is%3A%20${encodeURIComponent(deviceId)}`;
  }

  try {
    const response = await fetch(`${APPS_SCRIPT_URL}?action=checkLicense&deviceId=${encodeURIComponent(deviceId)}`);
    const data = await response.json();

    if (data.valid) {
      // Valid license — clear offline grace counter and show app
      localStorage.setItem("ad_offline_grace", "0");
      unlockApp();
    } else {
      // Not licensed — show activation screen
      showActivationScreen(deviceId, data.reason);
    }
  } catch (err) {
    // Network error — apply a 3-launch grace period to avoid locking out users mid-trip
    console.error("License check failed (network):", err);
    const grace = parseInt(localStorage.getItem("ad_offline_grace") || "0");
    if (grace < 3) {
      localStorage.setItem("ad_offline_grace", (grace + 1).toString());
      console.warn(`Offline grace launch ${grace + 1}/3 — allowing access.`);
      unlockApp();
    } else {
      showActivationScreen(deviceId, "offline");
    }
  }
}

/** Shows the main messages view and initialises all app controls. */
function unlockApp() {
  document.getElementById("activationView").classList.add("hidden");
  document.getElementById("appView").classList.remove("hidden");
  loadLocalMessages();
  setupAppControls();
  checkNotificationPermission();
}

/** Renders the Activation Required screen and wires up both activation tabs. */
function showActivationScreen(deviceId, reason) {
  document.getElementById("appView").classList.add("hidden");
  document.getElementById("activationView").classList.remove("hidden");

  // Display device ID so the admin can register it
  const deviceIdEl = document.getElementById("displayDeviceId");
  if (deviceIdEl) deviceIdEl.textContent = deviceId || "Unknown";

  // Show a contextual reason message
  const reasonEl = document.getElementById("activationReason");
  if (reasonEl) {
    const messages = {
      revoked:      "⛔ Your license has been revoked. Please contact your agent.",
      expired:      "⏳ Your license has expired. Please contact your agent to renew.",
      offline:      "📡 Cannot verify license. Connect to the internet and relaunch the app.",
      not_found:    "🔐 This device is not activated. Enter your code or verify your M-PESA payment.",
      no_device_id: "⚠️ Could not read device ID. Please reinstall the app."
    };
    reasonEl.textContent = messages[reason] || messages["not_found"];
  }

  // Wire up offline tab: Activation Code
  document.getElementById("submitCodeBtn").onclick = () => {
    const code = document.getElementById("activationCodeInput").value;
    submitActivationCode(deviceId, code);
  };
  // Auto-format input as user types (insert dashes)
  const codeInput = document.getElementById("activationCodeInput");
  codeInput.addEventListener("input", (e) => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "");
    if (v.length > 3)  v = v.slice(0, 3) + "-" + v.slice(3);
    if (v.length > 7)  v = v.slice(0, 7) + "-" + v.slice(7);
    e.target.value = v.slice(0, 11);
  });

  // Wire up online tab: M-PESA phone verification
  document.getElementById("verifyOnlinePaymentBtn").onclick = () => {
    const phone = document.getElementById("onlinePaymentPhone").value.trim();
    submitOnlineActivation(deviceId, phone);
  };
  document.getElementById("onlinePaymentPhone").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "");
  });
}

/** Validates the offline activation code against the backend. */
async function submitActivationCode(deviceId, code) {
  if (!code || code.replace(/-/g, "").length < 9) {
    alert("Please enter the full 9-character activation code (e.g. ABC-DEF-GH2).");
    return;
  }
  const btn = document.getElementById("submitCodeBtn");
  btn.disabled = true;
  btn.textContent = "Validating...";

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "validateOfflineCode", deviceId, code })
    });
    const data = await response.json();
    if (data.success) {
      localStorage.setItem("ad_offline_grace", "0");
      showActivationSuccessToast();
      unlockApp();
    } else {
      alert("❌ " + (data.error || "Invalid code. Please try again."));
    }
  } catch (err) {
    alert("📡 Network error. Please check your internet connection and try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Activate";
  }
}

/** Verifies an online M-PESA payment and registers the device license. */
async function submitOnlineActivation(deviceId, phoneInput) {
  if (!phoneInput || phoneInput.length < 9) {
    alert("Please enter the 9-digit Safaricom number you used to pay (e.g. 708374149).");
    return;
  }
  const formattedPhone = "254" + phoneInput.replace(/^0+/, "").replace(/^254/, "");
  const btn = document.getElementById("verifyOnlinePaymentBtn");
  btn.disabled = true;
  btn.textContent = "Verifying...";

  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "registerOnlineLicense", deviceId, phoneNumber: formattedPhone })
    });
    const data = await response.json();
    if (data.success) {
      localStorage.setItem("ad_offline_grace", "0");
      showActivationSuccessToast();
      unlockApp();
    } else {
      alert("❌ " + (data.error || "Could not verify payment. Please contact support."));
    }
  } catch (err) {
    alert("📡 Network error. Please check your internet connection and try again.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Verify Payment";
  }
}

/** Copies the device ID to clipboard with user feedback. */
function copyDeviceId() {
  const id = document.getElementById("displayDeviceId").textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(id).then(() => {
      showCopySuccess();
    }).catch(() => {
      if (fallbackCopyText(id)) showCopySuccess();
      else alert("Device ID: " + id);
    });
  } else {
    if (fallbackCopyText(id)) showCopySuccess();
    else alert("Device ID: " + id);
  }
}

/** Switches between the two activation tabs (offline code / online payment). */
function switchActivationTab(tab, el) {
  document.querySelectorAll(".act-tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("offlineActivationTab").classList.add("hidden");
  document.getElementById("onlineActivationTab").classList.add("hidden");
  document.getElementById(tab + "ActivationTab").classList.remove("hidden");
}

/** Brief toast shown after successful activation. */
function showActivationSuccessToast() {
  const toast = document.createElement("div");
  toast.className = "activation-toast";
  toast.innerHTML = "🎉 Device activated successfully!";
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 50);
  setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 400); }, 3000);
}

/** Fallback clipboard copying function for non-secure / file:// protocols. */
function fallbackCopyText(text) {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let successful = false;
  try {
    successful = document.execCommand("copy");
  } catch (err) {
    console.error("Fallback copy failed", err);
  }
  document.body.removeChild(textArea);
  return successful;
}

/** Triggers standard Copied feedback on copy button. */
function showCopySuccess() {
  const btn = document.querySelector(".copy-btn");
  if (btn) {
    btn.textContent = "✅ Copied!";
    setTimeout(() => { btn.textContent = "📋 Copy"; }, 2000);
  }
}

/** Handles WhatsApp Float Button ripple animations. */
function initWhatsAppFloat() {
  const waFloat = document.getElementById("whatsappFloatLink");
  if (waFloat) {
    waFloat.addEventListener("click", () => {
      // Remove class if already there to allow restarting animation on successive clicks
      waFloat.classList.remove("animate");
      // Force layout recalculation to restart CSS animations
      void waFloat.offsetWidth;
      waFloat.classList.add("animate");
      
      // Auto-remove class after animation cycle completes (approx 1.8s)
      setTimeout(() => {
        waFloat.classList.remove("animate");
      }, 1800);
    });
  }
}
