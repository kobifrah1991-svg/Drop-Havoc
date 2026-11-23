package com.scitedragames.drophavoc;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.webkit.WebView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Sideload only. The Play bundle compiles android/play/ApkInstaller.java instead,
// which does not download an APK or open the package installer.
public final class ApkInstaller {
    public interface Host {
        void page(String js);
        void setDownloading(boolean on);
    }

    private static File pendingInstall;

    private ApkInstaller() {}

    public static void download(final Activity activity, final WebView web, final Host host, final String url) {
        File dir = new File(activity.getCacheDir(), "update");
        File out = new File(dir, "DropHavoc.apk");
        try {
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete();
            HttpURLConnection c = open(url);
            long total = c.getContentLength(), done = 0; int last = -1;
            InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(out);
            byte[] buf = new byte[65536]; int n;
            while ((n = in.read(buf)) > 0) {
                o.write(buf, 0, n); done += n;
                int pct = total > 0 ? (int) (done * 100 / total) : -1;
                if (pct != last) { last = pct; host.page("window.dropHavocUpdate&&window.dropHavocUpdate('progress'," + pct + ")"); }
            }
            o.close(); in.close(); c.disconnect();
            if (total > 0 && done != total) throw new Exception("short");
            host.setDownloading(false);
            final File apk = out;
            activity.runOnUiThread(new Runnable() { @Override public void run() { install(activity, web, apk); } });
        } catch (Exception e) {
            host.setDownloading(false);
            out.delete();
            host.page("window.dropHavocUpdate&&window.dropHavocUpdate('failed',0)");
        }
    }

    public static void resume(Activity activity, WebView web) {
        if (pendingInstall != null && pendingInstall.exists() && canInstall(activity)) install(activity, web, pendingInstall);
    }

    private static boolean canInstall(Activity activity) {
        if (Build.VERSION.SDK_INT < 26) return true;
        try { return (Boolean) activity.getPackageManager().getClass().getMethod("canRequestPackageInstalls").invoke(activity.getPackageManager()); }
        catch (Exception e) { return true; }
    }

    private static void install(Activity activity, WebView web, File apk) {
        if (Build.VERSION.SDK_INT >= 26 && !canInstall(activity)) {
            pendingInstall = apk;
            web.evaluateJavascript("window.dropHavocUpdate&&window.dropHavocUpdate('allow',0)", null);
            try { activity.startActivity(new Intent("android.settings.MANAGE_UNKNOWN_APP_SOURCES", Uri.parse("package:" + activity.getPackageName()))); } catch (Exception e) { /* old settings app */ }
            return;
        }
        pendingInstall = null;
        Intent i = new Intent(Intent.ACTION_VIEW);
        Uri uri = Build.VERSION.SDK_INT >= 24 ? Uri.parse("content://" + activity.getPackageName() + ".update/DropHavoc.apk") : Uri.fromFile(apk);
        if (Build.VERSION.SDK_INT < 24) apk.setReadable(true, false);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(i);
            web.evaluateJavascript("window.dropHavocUpdate&&window.dropHavocUpdate('install',100)", null);
        } catch (Exception e) {
            web.evaluateJavascript("window.dropHavocUpdate&&window.dropHavocUpdate('failed',0)", null);
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
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
}
