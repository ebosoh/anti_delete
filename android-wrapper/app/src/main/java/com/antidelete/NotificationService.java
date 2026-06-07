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

        boolean isWhatsApp = packageName.equals("com.whatsapp") ||
                             packageName.equals("com.whatsapp.w4b") ||
                             packageName.equals("com.gbwhatsapp") ||
                             packageName.equals("com.fmwhatsapp") ||
                             packageName.equals("com.yowhatsapp") ||
                             packageName.equals("com.whatsapp.plus");

        if (!isWhatsApp) {
            return; // Only monitor WhatsApp notifications
        }

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        Bundle extras = notification.extras;
        if (extras == null) return;

        // Extract Title
        CharSequence titleCharSeq = extras.getCharSequence(Notification.EXTRA_TITLE);
        String title = titleCharSeq != null ? titleCharSeq.toString().trim() : "";

        // Extract Text (with fallbacks for BigText and TextLines)
        String text = "";
        CharSequence textCharSeq = extras.getCharSequence(Notification.EXTRA_TEXT);
        if (textCharSeq != null) {
            text = textCharSeq.toString().trim();
        }

        if (text.isEmpty()) {
            CharSequence bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            if (bigText != null) {
                text = bigText.toString().trim();
            }
        }

        // Keep lines array reference to check for grouped updates
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);

        // Check for deletion notifications inside EXTRA_TEXT_LINES (for grouped notifications)
        if (lines != null && lines.length > 0) {
            for (CharSequence lineCharSeq : lines) {
                if (lineCharSeq == null) continue;
                String lineText = lineCharSeq.toString().trim();
                if (isDeletionNotification(lineText)) {
                    processDeletion(title, lineText, sbn.getPostTime());
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

        // Check if this is a "message deleted" notification first
        boolean isDeletion = isDeletionNotification(text);

        // Filter out WhatsApp system notifications (unless it is a deletion event)
        if (!isDeletion) {
            if (text.equals("Checking for new messages") ||
                text.startsWith("WhatsApp Web is currently active") ||
                text.equals("Backup in progress") ||
                title.equals("WhatsApp")) {
                return;
            }
        }

        long timestamp = sbn.getPostTime();

        // Process message
        if (isDeletion) {
            processDeletion(title, text, timestamp);
        } else {
            // Save the incoming message
            dbHelper.insertMessage(title, text, timestamp);
            Log.d(TAG, "Logged message from " + title + ": " + text);
        }

        notifyWebView();
    }

    private void processDeletion(String title, String text, long timestamp) {
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
            dbHelper.insertPlaceholderDeletedMessage(title, text, timestamp);
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
