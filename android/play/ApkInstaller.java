package com.scitedragames.drophavoc;

import android.app.Activity;
import android.webkit.WebView;

// Play compile stub. build-aab.sh compiles this instead of the sideload installer.
public final class ApkInstaller {
    public interface Host {
        void page(String js);
        void setDownloading(boolean on);
    }

    private ApkInstaller() {}

    public static void download(Activity activity, WebView web, Host host, String url) {
        if (host != null) host.setDownloading(false);
    }

    public static void resume(Activity activity, WebView web) {}
}
