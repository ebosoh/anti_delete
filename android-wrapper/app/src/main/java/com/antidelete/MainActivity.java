package com.antidelete;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity implements Runnable {

    private static MainActivity instance;
    private WebView webView;
    DatabaseHelper dbHelper;
    private static final String WEB_APP_URL = "https://www.antidelete.com/"; // User can update this

    public static MainActivity getInstance() {
        return instance;
    }

    public void refreshWebView() {
        runOnUiThread(this);
    }

    @Override
    public void run() {
        if (webView != null) {
            webView.evaluateJavascript("javascript:if(typeof loadLocalMessages === 'function'){loadLocalMessages();}", null);
        }
    }

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        instance = this;

        dbHelper = new DatabaseHelper(this);

        // Create WebView dynamically to avoid requiring XML resources (reduces size)
        webView = new WebView(this);
        setContentView(webView);

        // Configure WebView settings
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Bind JavaScript Interface Bridge
        webView.addJavascriptInterface(new WebAppInterface(this), "AndroidBridge");

        // Force opening links inside WebView instead of browser
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());

        // Disable remote debugging in production (security hardening)
        WebView.setWebContentsDebuggingEnabled(false);

        // Load the web application hosted on GitHub Pages
        webView.loadUrl(WEB_APP_URL);

        // Prompt user to enable notification listener if not active
        if (!isNotificationServiceEnabled()) {
            Toast.makeText(this, "Please enable notification access for Anti-Delete to function", Toast.LENGTH_LONG).show();
            openNotificationSettings();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.evaluateJavascript("javascript:if(typeof checkNotificationPermission === 'function'){checkNotificationPermission();}", null);
            webView.evaluateJavascript("javascript:if(typeof loadLocalMessages === 'function'){loadLocalMessages();}", null);
        }
    }

    // Check if notification listener permission is granted
    private boolean isNotificationServiceEnabled() {
        String enabledListeners = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        String packageName = getPackageName();
        return enabledListeners != null && enabledListeners.contains(packageName);
    }

    // Open android system settings for notification access
    private void openNotificationSettings() {
        try {
            Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Could not open notification settings automatically", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (instance == this) {
            instance = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // JavaScript Bridge implementation
    public static class WebAppInterface {
        private final MainActivity activity;

        public WebAppInterface(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public String getMessages() {
            return activity.dbHelper.getMessagesJson();
        }

        @JavascriptInterface
        public void downloadApk(String url) {
            try {
                android.net.Uri uri = android.net.Uri.parse(url);
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                activity.startActivity(intent);
            } catch (Exception e) {
                Toast.makeText(activity, "Failed to start download", Toast.LENGTH_SHORT).show();
            }
        }

        @JavascriptInterface
        public boolean isNotificationServiceEnabled() {
            return activity.isNotificationServiceEnabled();
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            activity.openNotificationSettings();
        }

        @JavascriptInterface
        public int getVersionCode() {
            try {
                return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionCode;
            } catch (Exception e) {
                return 1;
            }
        }

        @JavascriptInterface
        public String getVersionName() {
            try {
                return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "1.00";
            }
        }

        /**
         * Returns the device's unique ANDROID_ID for license binding.
         * This ID is stable across reboots but changes on factory reset.
         */
        @JavascriptInterface
        public String getDeviceId() {
            try {
                return Settings.Secure.getString(
                    activity.getContentResolver(),
                    Settings.Secure.ANDROID_ID
                );
            } catch (Exception e) {
                return "unknown_" + android.os.Build.SERIAL;
            }
        }
    }
}
