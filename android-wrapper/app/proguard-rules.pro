# Proguard rules for AntiDelete

# Keep Javascript interfaces so WebView can call Java methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep the notification service class
-keep class com.antidelete.NotificationService { *; }

# Keep MainActivity
-keep class com.antidelete.MainActivity { *; }
