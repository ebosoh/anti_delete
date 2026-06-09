package com.antidelete;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

public class NotificationService extends NotificationListenerService {

    private static final String TAG = "AntiDeleteService";
    private DatabaseHelper dbHelper;

    @Override
    public void onCreate() {
        super.onCreate();
        dbHelper = new DatabaseHelper(this);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();
        if (packageName == null) return;

        String appSource = "WhatsApp";
        boolean isTargetApp = false;

        if (packageName.equals("com.whatsapp") ||
            packageName.equals("com.whatsapp.w4b") ||
            packageName.equals("com.gbwhatsapp") ||
            packageName.equals("com.fmwhatsapp") ||
            packageName.equals("com.yowhatsapp") ||
            packageName.equals("com.whatsapp.plus")) {
            isTargetApp = true;
            appSource = "WhatsApp";
        } else if (packageName.equals("org.telegram.messenger") ||
                   packageName.equals("org.telegram.messenger.web") ||
                   packageName.equals("org.thunderdog.challegram")) {
            isTargetApp = true;
            appSource = "Tel";
        } else if (packageName.equals("com.facebook.orca") ||
                   packageName.equals("com.facebook.mlite")) {
            isTargetApp = true;
            appSource = "FB";
        } else if (packageName.equals("com.instagram.android")) {
            isTargetApp = true;
            appSource = "IG";
        } else if (packageName.equals("com.google.android.apps.messaging") ||
                   packageName.equals("com.samsung.android.messaging") ||
                   packageName.equals("com.android.mms") ||
                   (sbn.getNotification() != null && Notification.CATEGORY_MESSAGE.equals(sbn.getNotification().category))) {
            isTargetApp = true;
            appSource = "SMS";
        }

        if (!isTargetApp) {
            return; // Only monitor target app notifications
        }

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        Bundle extras = notification.extras;
        if (extras == null) return;

        // Extract Title
        CharSequence titleCharSeq = extras.getCharSequence(Notification.EXTRA_TITLE);
        String title = titleCharSeq != null ? titleCharSeq.toString().trim() : "";

        // Extract Text (with fallbacks for MessagingStyle, BigText, and TextLines)
        String text = "";
        CharSequence textCharSeq = extras.getCharSequence(Notification.EXTRA_TEXT);
        if (textCharSeq != null) {
            text = textCharSeq.toString().trim();
        }

        // Fallback 1: Extract from android.messages (MessagingStyle) for Telegram, FB, IG, WhatsApp, etc.
        if (text.isEmpty() || appSource.equals("Tel") || appSource.equals("FB") || appSource.equals("IG")) {
            android.os.Parcelable[] messages = (android.os.Parcelable[]) extras.get("android.messages");
            if (messages != null && messages.length > 0) {
                android.os.Parcelable latestParcel = messages[messages.length - 1];
                if (latestParcel instanceof Bundle) {
                    Bundle msgBundle = (Bundle) latestParcel;
                    CharSequence msgText = msgBundle.getCharSequence("text");
                    if (msgText != null && !msgText.toString().trim().isEmpty()) {
                        String extractedText = msgText.toString().trim();
                        
                        // For group chats, if title is group name, prefix the sender name to the message text
                        CharSequence msgSender = msgBundle.getCharSequence("sender");
                        if (msgSender != null && !msgSender.toString().trim().isEmpty()) {
                            String senderName = msgSender.toString().trim();
                            if (!title.isEmpty() && !title.equals(senderName) && !extractedText.startsWith(senderName + ":")) {
                                extractedText = senderName + ": " + extractedText;
                            }
                        }
                        text = extractedText;
                    }
                }
            }
        }

        if (text.isEmpty()) {
            CharSequence bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (bigText != null) {
                text = bigText.toString().trim();
            }
        }

        // Keep lines array reference to check for grouped updates
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);

        // Check for deletion notifications inside EXTRA_TEXT_LINES (for grouped notifications) - WhatsApp specific
        if (appSource.equals("WhatsApp") && lines != null && lines.length > 0) {
            for (CharSequence lineCharSeq : lines) {
                if (lineCharSeq == null) continue;
                String lineText = lineCharSeq.toString().trim();
                if (isDeletionNotification(lineText)) {
                    processDeletion(title, lineText, sbn.getPostTime(), appSource);
                    notifyWebView();
                    return; // Stop processing after handling the deletion
                }
            }
        }

        if (text.isEmpty() && lines != null && lines.length > 0) {
            text = lines[lines.length - 1].toString().trim();
        }

        if (title.isEmpty() || text.isEmpty()) {
            return;
        }

        // Check if this is a "message deleted" notification first - WhatsApp specific
        boolean isDeletion = appSource.equals("WhatsApp") && isDeletionNotification(text);

        // Filter out system notifications
        if (!isDeletion) {
            if (appSource.equals("WhatsApp")) {
                if (text.equals("Checking for new messages") ||
                    text.startsWith("WhatsApp Web is currently active") ||
                    text.equals("Backup in progress") ||
                    title.equals("WhatsApp")) {
                    return;
                }
            } else if (appSource.equals("Tel")) {
                // Ignore background task notifications or Telegram system messages
                if (title.equals("Telegram") && (text.contains("running") || text.contains("background"))) {
                    return;
                }
            }
        }

        long timestamp = sbn.getPostTime();

        // Process message
        if (isDeletion) {
            processDeletion(title, text, timestamp, appSource);
        } else {
            // Save the incoming message
            dbHelper.insertMessage(title, text, timestamp, appSource);
            Log.d(TAG, "Logged message from " + title + " (" + appSource + "): " + text);
        }

        notifyWebView();
    }

    private void processDeletion(String title, String text, long timestamp, String appSource) {
        boolean success = false;
        // Extract sender name prefix for group chats (format: "Sender Name: Message content")
        int colonIdx = text.indexOf(": ");
        if (colonIdx > 0) {
            String senderPrefix = text.substring(0, colonIdx).trim();
            success = dbHelper.markLastMessageDeleted(title, senderPrefix);
        } else {
            success = dbHelper.markLastMessageDeleted(title);
        }
        
        Log.d(TAG, "Message deletion detected for sender: " + title + ", marked last message: " + success);
        
        if (!success) {
            // Fallback: If no original message was found to mark deleted, insert a new placeholder message marked as deleted
            dbHelper.insertPlaceholderDeletedMessage(title, text, timestamp, appSource);
        }
    }

    private void notifyWebView() {
        // Notify MainActivity to refresh WebView if it is running in foreground
        MainActivity mainActivity = MainActivity.getInstance();
        if (mainActivity != null) {
            mainActivity.refreshWebView();
        }
    }

    private boolean isDeletionNotification(String text) {
        String lowerText = text.toLowerCase();
        return lowerText.contains("this message was deleted") ||
               lowerText.contains("message was deleted") ||
               lowerText.contains("message deleted") ||
               lowerText.contains("ujumbe huu ulifutwa") ||
               lowerText.contains("ujumbe ulifutwa") ||
               lowerText.equals("🚫 message deleted");
    }
}
