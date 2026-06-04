// Web and Android Bridge Logic for Anti-Delete App

// Configuration
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxB4XY-xVrQSP-wNDGCyx3nURP5rSrHYufSbqZmtCp6ecOCNe4OW19Rmz_nHLchre4HuQ/exec"; // Update with actual URL after deploy

document.addEventListener("DOMContentLoaded", () => {
  detectEnvironment();
  initDemo();
  loadAds();
  setupShare();
  initPaymentFlow();
});

// 1. Detect if inside APK or Browser
function detectEnvironment() {
  const isAndroidAPK = typeof AndroidBridge !== "undefined";

  if (isAndroidAPK) {
    // Running inside Android Wrapper WebView
    document.body.classList.add("apk-mode");
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
    
    // Download APK trigger (Requires M-PESA Payment)
    document.getElementById("downloadApkBtn").addEventListener("click", openPaymentModal);
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
      amount: "100"
    })
  })
  .then(() => {
    payBtn.disabled = false;
    payBtn.innerHTML = `<span>Pay KES 100</span><span class="pay-arrow">&rarr;</span>`;
    
    // Start polling the server for the latest transaction status for this phone number
    startPaymentStatusPolling(phoneNumber, countdownInterval);
  })
  .catch(err => {
    clearInterval(countdownInterval);
    payBtn.disabled = false;
    payBtn.innerHTML = `<span>Pay KES 100</span><span class="pay-arrow">&rarr;</span>`;
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
