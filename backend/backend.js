// Google Apps Script Backend for Anti-Delete App
// Deploy this as a Web App with access set to "Anyone" (even anonymous)

const SPREADSHEET_ID = ""; // Leave blank to bind to the active spreadsheet, or set a specific ID

// Safaricom M-PESA Daraja API Credentials
const MPESA_ENV = "sandbox"; // Change to 'production' when going live
const MPESA_CONSUMER_KEY = "YOUR_CONSUMER_KEY"; // Update with actual keys
const MPESA_CONSUMER_SECRET = "YOUR_CONSUMER_SECRET";
const MPESA_PASSKEY = "YOUR_LIPA_NA_MPESA_PASSKEY";
const MPESA_SHORTCODE = "174379"; // Sandbox default Shortcode
const MPESA_CALLBACK_URL = ""; // Set to your Web App URL. If left empty, it will auto-detect script URL.

function doGet(e) {
  try {
    const sheet = getSpreadsheet();
    const action = e.parameter.action;

    if (action === "getStats") {
      return jsonResponse(getStatsData(sheet));
    } 
    
    if (action === "getAds") {
      return jsonResponse(getActiveAds(sheet));
    }

    if (action === "checkPaymentStatus") {
      const phoneNumber = e.parameter.phoneNumber;
      const checkoutRequestId = e.parameter.checkoutRequestId;
      return jsonResponse(checkTransactionStatus(sheet, phoneNumber, checkoutRequestId));
    }

    return jsonResponse({ error: "Invalid action" });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

function doPost(e) {
  try {
    const sheet = getSpreadsheet();
    
    // Parse request body
    let postData;
    try {
      postData = JSON.parse(e.postData.contents);
    } catch(err) {
      postData = e.parameter;
    }

    // Detect if this is an M-PESA STK Push callback from Safaricom webhook
    if (postData && postData.Body && postData.Body.stkCallback) {
      handleMpesaCallback(sheet, postData);
      return jsonResponse({ success: true });
    }

    const action = postData.action;

    if (action === "trackVisit") {
      incrementStat(sheet, "visitors");
      return jsonResponse({ success: true, stats: getStatsData(sheet) });
    }

    if (action === "trackDownload") {
      incrementStat(sheet, "downloads");
      return jsonResponse({ success: true, stats: getStatsData(sheet) });
    }

    if (action === "initiatePayment") {
      const phoneNumber = postData.phoneNumber;
      const amount = postData.amount || "100";
      return jsonResponse(initiateMpesaStkPush(sheet, phoneNumber, amount));
    }

    if (action === "uploadAd") {
      // Basic security check: verify password
      const password = postData.password;
      if (password !== "admin123") {
        return jsonResponse({ error: "Unauthorized" });
      }

      const imageUrl = postData.imageUrl;
      const redirectUrl = postData.redirectUrl;
      const adId = "ad_" + new Date().getTime();

      const adsSheet = getOrCreateSheet(sheet, "Ads");
      adsSheet.appendRow([adId, imageUrl, redirectUrl, 0, 0, "Active", new Date()]);

      return jsonResponse({ success: true, adId: adId });
    }

    if (action === "trackAdImpression") {
      const adId = postData.adId;
      incrementAdMetric(sheet, adId, 4); // Column 4 is Impressions (D)
      return jsonResponse({ success: true });
    }

    if (action === "trackAdClick") {
      const adId = postData.adId;
      incrementAdMetric(sheet, adId, 5); // Column 5 is Clicks (E)
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Invalid action" });
  } catch (err) {
    return jsonResponse({ error: err.toString() });
  }
}

// -------------------- M-PESA INTEGRATION LOGIC --------------------

function getCallbackUrl() {
  if (MPESA_CALLBACK_URL) return MPESA_CALLBACK_URL;
  try {
    return ScriptApp.getService().getUrl();
  } catch(e) {
    return "";
  }
}

// Get Safaricom OAuth Token
function getMpesaToken() {
  const url = MPESA_ENV === "production" 
    ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  
  const headers = {
    "Authorization": "Basic " + Utilities.base64Encode(MPESA_CONSUMER_KEY + ":" + MPESA_CONSUMER_SECRET)
  };
  
  const options = {
    "method": "get",
    "headers": headers,
    "muteHttpExceptions": true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());
  return json.access_token;
}

// Trigger M-PESA STK Push API call
function initiateMpesaStkPush(spreadsheet, phoneNumber, amount) {
  try {
    const accessToken = getMpesaToken();
    if (!accessToken) {
      return { success: false, error: "Failed to generate Safaricom access token" };
    }

    const timestamp = Utilities.formatDate(new Date(), "GMT+3", "yyyyMMddHHmmss");
    const rawPassword = MPESA_SHORTCODE + MPESA_PASSKEY + timestamp;
    const password = Utilities.base64Encode(rawPassword);

    const url = MPESA_ENV === "production"
      ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    const payload = {
      "BusinessShortCode": MPESA_SHORTCODE,
      "Password": password,
      "Timestamp": timestamp,
      "TransactionType": "CustomerPayBillOnline", // Change to CustomerBuyGoodsOnline if Till
      "Amount": amount,
      "PartyA": phoneNumber,
      "PartyB": MPESA_SHORTCODE,
      "PhoneNumber": phoneNumber,
      "CallBackURL": getCallbackUrl(),
      "AccountReference": "antiDELETE",
      "TransactionDesc": "antiDELETE Download Fee"
    };

    const headers = {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json"
    };

    const options = {
      "method": "post",
      "headers": headers,
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (result.ResponseCode === "0") {
      // Success: Save transaction row in Sheet
      const txSheet = getOrCreateSheet(spreadsheet, "Transactions");
      txSheet.appendRow([
        result.CheckoutRequestID,
        phoneNumber,
        amount,
        "Pending",
        "", // Receipt Number Placeholder
        new Date(), // DateCreated
        "" // DateUpdated
      ]);
      return { success: true, checkoutRequestId: result.CheckoutRequestID };
    } else {
      return { success: false, error: result.ResponseDescription || "Safaricom service rejected the push request" };
    }
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

// Webhook Callback handler for Safaricom callback webhook
function handleMpesaCallback(spreadsheet, callbackData) {
  try {
    const callback = callbackData.Body.stkCallback;
    const checkoutRequestId = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;
    const resultDesc = callback.ResultDesc;

    const txSheet = getOrCreateSheet(spreadsheet, "Transactions");
    const data = txSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === checkoutRequestId) {
        // Found the transaction row
        const rowNum = i + 1;
        
        if (resultCode === 0) {
          // Success
          txSheet.getRange(rowNum, 4).setValue("Completed"); // Column D: Status
          
          // Get Receipt Number
          let receipt = "";
          if (callback.CallbackMetadata && callback.CallbackMetadata.Item) {
            const items = callback.CallbackMetadata.Item;
            for (let j = 0; j < items.length; j++) {
              if (items[j].Name === "MpesaReceiptNumber") {
                receipt = items[j].Value;
                break;
              }
            }
          }
          txSheet.getRange(rowNum, 5).setValue(receipt); // Column E: Receipt
        } else {
          // Cancelled/Failed
          txSheet.getRange(rowNum, 4).setValue("Failed");
        }
        
        txSheet.getRange(rowNum, 7).setValue(new Date()); // Column G: DateUpdated
        break;
      }
    }
  } catch(err) {
    Logger.log("Callback processing error: " + err.toString());
  }
}

// Polling status lookup
function checkTransactionStatus(spreadsheet, phoneNumber, checkoutRequestId) {
  const txSheet = getOrCreateSheet(spreadsheet, "Transactions");
  const data = txSheet.getDataRange().getValues();

  // If we have checkoutRequestId, look up directly
  if (checkoutRequestId) {
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === checkoutRequestId) {
        return { status: data[i][3], receipt: data[i][4] };
      }
    }
    return { status: "NotFound" };
  }

  // If we only have phone number, look up the latest transaction created in the last 2 minutes
  if (phoneNumber) {
    const twoMinutesAgo = new Date().getTime() - 2 * 60 * 1000;
    
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][1].toString() === phoneNumber.toString()) {
        const dateCreated = new Date(data[i][5]).getTime();
        if (dateCreated > twoMinutesAgo) {
          return { status: data[i][3], receipt: data[i][4] };
        }
      }
    }
    return { status: "NotFound" };
  }

  return { error: "Missing parameters" };
}

// -------------------- SPREADSHEET UTILITIES --------------------

function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(spreadsheet, name) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    if (name === "Stats") {
      sheet.appendRow(["Key", "Value"]);
      sheet.appendRow(["visitors", 0]);
      sheet.appendRow(["downloads", 0]);
    } else if (name === "Ads") {
      sheet.appendRow(["Id", "ImageUrl", "RedirectUrl", "Impressions", "Clicks", "Status", "DateAdded"]);
    } else if (name === "Transactions") {
      sheet.appendRow(["CheckoutRequestID", "PhoneNumber", "Amount", "Status", "MpesaReceiptNumber", "DateCreated", "DateUpdated"]);
    }
  }
  return sheet;
}

function getStatsData(spreadsheet) {
  const sheet = getOrCreateSheet(spreadsheet, "Stats");
  const data = sheet.getDataRange().getValues();
  const stats = {};
  
  for (let i = 1; i < data.length; i++) {
    stats[data[i][0]] = Number(data[i][1]);
  }
  return stats;
}

function incrementStat(spreadsheet, key) {
  const sheet = getOrCreateSheet(spreadsheet, "Stats");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      const cell = sheet.getRange(i + 1, 2);
      cell.setValue(Number(data[i][1]) + 1);
      break;
    }
  }
}

function getActiveAds(spreadsheet) {
  const sheet = getOrCreateSheet(spreadsheet, "Ads");
  const data = sheet.getDataRange().getValues();
  const ads = [];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === "Active") {
      ads.push({
        id: data[i][0],
        imageUrl: data[i][1],
        redirectUrl: data[i][2],
        impressions: Number(data[i][3]),
        clicks: Number(data[i][4])
      });
    }
  }
  return ads;
}

function incrementAdMetric(spreadsheet, adId, colIndex) {
  const sheet = getOrCreateSheet(spreadsheet, "Ads");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === adId) {
      const cell = sheet.getRange(i + 1, colIndex);
      cell.setValue(Number(data[i][colIndex - 1]) + 1);
      break;
    }
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
