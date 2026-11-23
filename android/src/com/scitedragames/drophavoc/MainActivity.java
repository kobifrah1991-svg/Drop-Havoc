package com.scitedragames.drophavoc;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import java.io.File;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

// Full-screen WebView hosting the game from assets/www (offline practice, online rooms with friends, voice chat).
public class MainActivity extends Activity {
    private WebView web;
    private PermissionRequest pendingMic; // page asked for the microphone while Android permission was pending
    private String pendingSignIn; // Google sign-in result that arrived before the page finished loading
    private boolean pageReady;
    private volatile boolean downloading;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setWebViewClient(new WebViewClient() {
            // Web links (the studio page in the credit) open in the phone's browser, not inside the game
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* no browser */ }
                    return true;
                }
                return false;
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingSignIn != null) { web.evaluateJavascript(pendingSignIn, null); pendingSignIn = null; }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // The page shows the mic disclosure and only then calls getUserMedia, which reaches here.
            // Grant the WebView request once Android has RECORD_AUDIO. Do not ask before that disclosure.
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() { @Override public void run() {
                    if (Build.VERSION.SDK_INT < 23 || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(request.getResources());
                    } else {
                        pendingMic = request;
                        requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, 1);
                    }
                } });
            }
        });
        web.addJavascriptInterface(new Updater(), "DropHavocApp");
        web.setBackgroundColor(0xFF0B0C1A);
        setContentView(web);
        hideSystemBars();
        registerPredictiveBack();
        web.loadUrl(startPage());
        handleSignIn(getIntent());
    }

    // Google sign-in happens in the phone's browser (Google does not allow it inside an app's WebView); the sign-in
    // page sends the Firebase tokens back with a drophavoc://signin link, and the game takes them from here.
    @Override
    protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); handleSignIn(intent); }

    private void handleSignIn(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        if (u == null || !"drophavoc".equals(u.getScheme()) || !"signin".equals(u.getHost())) return;
        String t = u.getQueryParameter("t"), r = u.getQueryParameter("r");
        if (t == null) return;
        String js = "window.dropHavocSignIn&&window.dropHavocSignIn(" + JSONObject.quote(t) + "," + JSONObject.quote(r == null ? "" : r) + ")";
        if (pageReady) web.evaluateJavascript(js, null); else pendingSignIn = js;
    }

    // 0.16.53 In-game update: the page finds a newer version.json online and calls DropHavocApp.update(url). The new APK
    // is downloaded into the app's own cache (progress goes back to the page), then Android's installer opens on it and
    // the player taps Update. Same signing key and a higher versionCode, so it installs over this one and keeps the data.
    private class Updater {
        @JavascriptInterface public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }
        @JavascriptInterface public boolean canUpdate() { return true; }
        @JavascriptInterface public int shell() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode; } catch (Exception e) { return 0; }
        }
        // Sideload: game files only (no installer). The Play bundle compiles BuildFlags.REMOTE_GAME_UPDATES
        // as false, so this method returns immediately and the downloader class is not in the Play classes.
        @JavascriptInterface public void updateGame(final String base, final String version) {
            if (!BuildFlags.REMOTE_GAME_UPDATES) return;
            if (downloading || base == null || !base.startsWith("https://") || version == null || !version.matches("[0-9]+(\\.[0-9]+){1,3}")) return;
            downloading = true;
            final GameUpdateBridge.Host host = bridgeHost();
            new Thread(new Runnable() { @Override public void run() { GameUpdateBridge.download(host, base, version); } }).start();
        }
        @JavascriptInterface public void restart() {
            runOnUiThread(new Runnable() { @Override public void run() { web.clearCache(false); web.loadUrl(startPage()); } });
        }
        // "play" when this class was compiled for the Play bundle (REMOTE_GAME_UPDATES false), "apk" for sideload.
        @JavascriptInterface public String store() { return BuildFlags.REMOTE_GAME_UPDATES ? "apk" : "play"; }
        @JavascriptInterface public void update(final String url) {
            if (!BuildFlags.REMOTE_GAME_UPDATES) { openStore(); return; }
            if (downloading || url == null || !url.startsWith("https://")) return;
            downloading = true;
            final ApkInstaller.Host host = apkHost();
            new Thread(new Runnable() { @Override public void run() { ApkInstaller.download(MainActivity.this, web, host, url); } }).start();
        }
    }

    private ApkInstaller.Host apkHost() {
        return new ApkInstaller.Host() {
            public void page(String js) { toPage(js); }
            public void setDownloading(boolean on) { downloading = on; }
        };
    }

    private void openStore() {
        runOnUiThread(new Runnable() { @Override public void run() {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + getPackageName()))); }
            catch (Exception e) { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + getPackageName()))); } catch (Exception e2) { /* no store */ } }
        } });
    }

    private GameUpdateBridge.Host bridgeHost() {
        return new GameUpdateBridge.Host() {
            public void page(String js) { toPage(js); }
            public void setDownloading(boolean on) { downloading = on; }
            public File filesDir() { return getFilesDir(); }
            public String versionName() {
                try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
            }
        };
    }

    // Sideload may open a downloaded copy of the game. The Play flag skips that and stays on the built-in assets.
    private String startPage() {
        if (BuildFlags.REMOTE_GAME_UPDATES) {
            String page = GameUpdateBridge.installedPage(bridgeHost());
            if (page != null) return page;
        }
        return "file:///android_asset/www/index.html";
    }

    private void toPage(final String js) {
        runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
    }

    private void hideSystemBars() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        if (pendingMic == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) pendingMic.grant(pendingMic.getResources());
        else pendingMic.deny();
        pendingMic = null;
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); web.pauseTimers(); }

    @Override
    protected void onResume() {
        super.onResume(); web.onResume(); web.resumeTimers();
        if (BuildFlags.REMOTE_GAME_UPDATES) ApkInstaller.resume(this, web);
    }

    private void registerPredictiveBack() {
        // targetSdk 36 does not deliver KEYCODE_BACK / onBackPressed unless a predictive-back callback is registered.
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            Class<?> cb = Class.forName("android.window.OnBackInvokedCallback");
            Object dispatcher = Activity.class.getMethod("getOnBackInvokedDispatcher").invoke(this);
            Object callback = java.lang.reflect.Proxy.newProxyInstance(cb.getClassLoader(), new Class<?>[] { cb },
                new java.lang.reflect.InvocationHandler() {
                    @Override public Object invoke(Object proxy, java.lang.reflect.Method method, Object[] args) {
                        String name = method.getName();
                        if ("onBackInvoked".equals(name)) handleBack();
                        else if ("hashCode".equals(name)) return System.identityHashCode(proxy);
                        else if ("equals".equals(name)) return proxy == (args != null && args.length > 0 ? args[0] : null);
                        else if ("toString".equals(name)) return "OnBackInvokedCallback";
                        return null;
                    }
                });
            dispatcher.getClass().getMethod("registerOnBackInvokedCallback", int.class, cb).invoke(dispatcher, 0, callback);
        } catch (Throwable ignored) { /* pre-33 devices */ }
    }

    private void handleBack() {
        // bubbles so window/document listeners (the map picker) see the same Escape a keyboard would send.
        // If the page closed something, defaultPrevented is set. Otherwise the system gets the back press:
        // leave the task (home screen) instead of swallowing it on the login or home menu.
        web.evaluateJavascript(
            "(function(){var e=new KeyboardEvent('keydown',{code:'Escape',key:'Escape',cancelable:true,bubbles:true});document.dispatchEvent(e);return e.defaultPrevented===true;})()",
            new android.webkit.ValueCallback<String>() {
                @Override public void onReceiveValue(String value) {
                    if (!"true".equals(value)) moveTaskToBack(true);
                }
            });
    }

    @Override
    public void onBackPressed() {
        handleBack();
    }
}
