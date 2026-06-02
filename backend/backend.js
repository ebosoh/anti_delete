// Google Apps Script Backend for Anti-Delete App
// Deploy this as a Web App with access set to "Anyone" (even anonymous)

const SPREADSHEET_ID = ""; // Leave blank to bind to the active spreadsheet, or set a specific ID

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

    const action = postData.action;

    if (action === "trackVisit") {
      incrementStat(sheet, "visitors");
      return jsonResponse({ success: true, stats: getStatsData(sheet) });
    }

    if (action === "trackDownload") {
      incrementStat(sheet, "downloads");
      return jsonResponse({ success: true, stats: getStatsData(sheet) });
    }

    if (action === "uploadAd") {
      // Basic security check: verify password
      const password = postData.password;
      if (password !== "admin123") { // Feel free to change or externalize this password
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

// Helper: Get or open the spreadsheet
function getSpreadsheet() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// Helper: Get or create a sheet by name
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
    }
  }
  return sheet;
}

// Helper: Get Stats Data
function getStatsData(spreadsheet) {
  const sheet = getOrCreateSheet(spreadsheet, "Stats");
  const data = sheet.getDataRange().getValues();
  const stats = {};
  
  // Skip header
  for (let i = 1; i < data.length; i++) {
    stats[data[i][0]] = Number(data[i][1]);
  }
  return stats;
}

// Helper: Increment a standard stat
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

// Helper: Get active ads list
function getActiveAds(spreadsheet) {
  const sheet = getOrCreateSheet(spreadsheet, "Ads");
  const data = sheet.getDataRange().getValues();
  const ads = [];
  
  // Header: Id, ImageUrl, RedirectUrl, Impressions, Clicks, Status, DateAdded
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

// Helper: Increment Ad Metrics (Impressions/Clicks)
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

// Helper: Format JSON Response
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
