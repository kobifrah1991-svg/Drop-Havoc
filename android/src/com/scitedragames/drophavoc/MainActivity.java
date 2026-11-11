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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import org.json.JSONArray;
import java.io.FileInputStream;
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
    private File pendingInstall; // downloaded update waiting for "install unknown apps" to be allowed
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
        // game files only (no installer screen): downloads <base>files.json and every file it lists, checks each one's
        // SHA-256, and switches to the new copy at the next start (or right away with restart())
        @JavascriptInterface public void updateGame(final String base, final String version) {
            if (downloading || base == null || !base.startsWith("https://") || version == null || !version.matches("[0-9]+(\\.[0-9]+){1,3}")) return;
            downloading = true;
            new Thread(new Runnable() { @Override public void run() { downloadGame(base, version); } }).start();
        }
        @JavascriptInterface public void restart() {
            runOnUiThread(new Runnable() { @Override public void run() { web.clearCache(false); web.loadUrl(startPage()); } });
        }
        // "play" in the Google Play build (AndroidManifest meta-data drophavoc.store), "apk" for the sideloaded one
        @JavascriptInterface public String store() { return isPlay() ? "play" : "apk"; }
        @JavascriptInterface public void update(final String url) {
            if (isPlay()) { openStore(); return; } // Play policy: a Play app updates its APK only through Google Play
            if (downloading || url == null || !url.startsWith("https://")) return;
            downloading = true;
            new Thread(new Runnable() { @Override public void run() { download(url); } }).start();
        }
    }

    private boolean isPlay() {
        try {
            android.content.pm.ApplicationInfo ai = getPackageManager().getApplicationInfo(getPackageName(), PackageManager.GET_META_DATA);
            return ai.metaData != null && "play".equals(ai.metaData.getString("drophavoc.store"));
        } catch (Exception e) { return false; }
    }

    private void openStore() {
        runOnUiThread(new Runnable() { @Override public void run() {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + getPackageName()))); }
            catch (Exception e) { try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + getPackageName()))); } catch (Exception e2) { /* no store */ } }
        } });
    }

    // ---- game-file updates (0.16.53) ----
    private File otaRoot() { return new File(getFilesDir(), "ota"); }

    private static int cmpVer(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? Integer.parseInt(x[i]) : 0, q = i < y.length ? Integer.parseInt(y[i]) : 0;
            if (p != q) return p < q ? -1 : 1;
        }
        return 0;
    }

    private static String readText(File f) {
        try { FileInputStream in = new FileInputStream(f); byte[] b = new byte[(int) f.length()]; int n = in.read(b); in.close(); return new String(b, 0, Math.max(0, n), "UTF-8").trim(); } catch (Exception e) { return null; }
    }

    private static void wipe(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) wipe(k);
        f.delete();
    }

    // the newest copy of the game: a downloaded one if it is newer than what this APK carries, else the built-in one
    private String startPage() {
        try {
            String cur = readText(new File(otaRoot(), "current"));
            String mine = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            if (cur != null && cur.matches("[0-9]+(\\.[0-9]+){1,3}")) {
                File idx = new File(new File(otaRoot(), cur), "index.html");
                if (cmpVer(cur, mine) > 0 && idx.exists()) return "file://" + idx.getAbsolutePath();
                if (cmpVer(cur, mine) <= 0) wipe(otaRoot()); // a newer APK was installed: its own copy wins
            }
        } catch (Exception e) { /* fall back to the built-in copy */ }
        return "file:///android_asset/www/index.html";
    }

    private HttpURLConnection open(String url) throws Exception {
        for (int hop = 0; hop < 5; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000); c.setReadTimeout(30000);
            c.setRequestProperty("Cache-Control", "no-cache");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) { url = new URL(new URL(url), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
            if (code != 200) { c.disconnect(); throw new Exception("http " + code); }
            return c;
        }
        throw new Exception("redirects");
    }

    private void downloadGame(String base, String version) {
        File part = new File(otaRoot(), version + ".part"), done = new File(otaRoot(), version);
        try {
            if (new File(done, "index.html").exists() && version.equals(readText(new File(otaRoot(), "current")))) { downloading = false; toPage("window.dropHavocUpdate&&window.dropHavocUpdate('ready',100)"); return; }
            wipe(part); part.mkdirs();
            HttpURLConnection c = open(base + "files.json?v=" + version);
            InputStream in = c.getInputStream(); java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(); byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            in.close(); c.disconnect();
            JSONObject list = new JSONObject(bo.toString("UTF-8"));
            if (!version.equals(list.getString("version"))) throw new Exception("version");
            JSONArray files = list.getJSONArray("files");
            long total = 0, got = 0; int last = -1;
            for (int i = 0; i < files.length(); i++) total += files.getJSONObject(i).getLong("size");
            for (int i = 0; i < files.length(); i++) {
                JSONObject f = files.getJSONObject(i);
                String path = f.getString("path");
                if (path.startsWith("/") || path.contains("..") || path.contains("\\")) throw new Exception("path");
                File out = new File(part, path); out.getParentFile().mkdirs();
                MessageDigest sha = MessageDigest.getInstance("SHA-256");
                c = open(base + path + "?v=" + version);
                in = c.getInputStream(); OutputStream o = new FileOutputStream(out); long size = 0;
                while ((n = in.read(buf)) > 0) {
                    o.write(buf, 0, n); sha.update(buf, 0, n); size += n; got += n;
                    int pct = total > 0 ? (int) Math.min(99, got * 100 / total) : -1;
                    if (pct != last) { last = pct; toPage("window.dropHavocUpdate&&window.dropHavocUpdate('progress'," + pct + ")"); }
                }
                o.close(); in.close(); c.disconnect();
                StringBuilder hex = new StringBuilder(); for (byte b : sha.digest()) hex.append(String.format("%02x", b));
                if (size != f.getLong("size") || !hex.toString().equals(f.getString("sha256"))) throw new Exception("bad " + path);
            }
            wipe(done);
            if (!part.renameTo(done)) throw new Exception("rename");
            OutputStream o = new FileOutputStream(new File(otaRoot(), "current")); o.write(version.getBytes("UTF-8")); o.close();
            File[] old = otaRoot().listFiles(); // keep only the copy we just switched to
            if (old != null) for (File k : old) if (k.isDirectory() && !k.getName().equals(version)) wipe(k);
            downloading = false;
            toPage("window.dropHavocUpdate&&window.dropHavocUpdate('ready',100)");
        } catch (Exception e) {
            downloading = false;
            wipe(part);
            toPage("window.dropHavocUpdate&&window.dropHavocUpdate('failed',0)");
        }
    }

    private void toPage(final String js) {
        runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
    }

    private void download(String url) {
        File dir = new File(getCacheDir(), "update");
        File out = new File(dir, "DropHavoc.apk");
        try {
            dir.mkdirs();
            for (File f : dir.listFiles()) f.delete();
            HttpURLConnection c = open(url);
            long total = c.getContentLength(), done = 0; int last = -1;
            InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(out);
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) {
                o.write(buf, 0, n); done += n;
                int pct = total > 0 ? (int) (done * 100 / total) : -1;
                if (pct != last) { last = pct; toPage("window.dropHavocUpdate&&window.dropHavocUpdate('progress'," + pct + ")"); }
            }
            o.close(); in.close(); c.disconnect();
            if (total > 0 && done != total) throw new Exception("short");
            downloading = false;
            final File apk = out;
            runOnUiThread(new Runnable() { @Override public void run() { install(apk); } });
        } catch (Exception e) {
            downloading = false;
            out.delete();
            toPage("window.dropHavocUpdate&&window.dropHavocUpdate('failed',0)");
        }
    }

    // PackageManager.canRequestPackageInstalls() (Android 8+), called by name: the build uses an older android.jar
    private boolean canInstall() {
        if (Build.VERSION.SDK_INT < 26) return true;
        try { return (Boolean) getPackageManager().getClass().getMethod("canRequestPackageInstalls").invoke(getPackageManager()); } catch (Exception e) { return true; }
    }

    private void install(File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !canInstall()) {
            // first update ever: Android asks once to allow installs from Drop Havoc; we continue in onResume
            pendingInstall = apk;
            web.evaluateJavascript("window.dropHavocUpdate&&window.dropHavocUpdate('allow',0)", null);
            try { startActivity(new Intent("android.settings.MANAGE_UNKNOWN_APP_SOURCES", Uri.parse("package:" + getPackageName()))); } catch (Exception e) { /* old settings app */ }
            return;
        }
        pendingInstall = null;
        Intent i = new Intent(Intent.ACTION_VIEW);
        Uri uri = Build.VERSION.SDK_INT >= 24 ? Uri.parse("content://" + getPackageName() + ".update/DropHavoc.apk") : Uri.fromFile(apk);
        if (Build.VERSION.SDK_INT < 24) apk.setReadable(true, false);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(i);
            web.evaluateJavascript("window.dropHavocUpdate&&window.dropHavocUpdate('install',100)", null);
        } catch (Exception e) {
            web.evaluateJavascript("window.dropHavocUpdate&&window.dropHavocUpdate('failed',0)", null);
        }
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
        if (pendingInstall != null && pendingInstall.exists() && (Build.VERSION.SDK_INT < 26 || canInstall())) install(pendingInstall);
    }

    @Override
    public void onBackPressed() {
        // Back closes chat/menus inside the game instead of quitting by accident
        web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'}))", null);
    }
}
