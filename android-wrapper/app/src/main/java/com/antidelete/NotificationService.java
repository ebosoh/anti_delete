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

        CharSequence titleCharSeq = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCharSeq = extras.getCharSequence(Notification.EXTRA_TEXT);

        if (titleCharSeq == null || textCharSeq == null) return;

        String title = titleCharSeq.toString().trim();
        String text = textCharSeq.toString().trim();

        // Filter out WhatsApp system notifications (e.g. "Checking for new messages", "WhatsApp Web", etc.)
        if (text.equals("Checking for new messages") ||
            text.startsWith("WhatsApp Web is currently active") ||
            text.equals("Backup in progress") ||
            title.equals("WhatsApp")) {
            return;
        }

        long timestamp = sbn.getPostTime();

        // Check if this is a "message deleted" notification
        if (isDeletionNotification(text)) {
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
        } else {
            // Save the incoming message
            dbHelper.insertMessage(title, text, timestamp);
            Log.d(TAG, "Logged message from " + title + ": " + text);
        }

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
               // Common variations or localized equivalents can be added here
               lowerText.equals("🚫 message deleted");
    }
}
