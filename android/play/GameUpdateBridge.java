package com.scitedragames.drophavoc;

// Play compile stub. build-aab.sh compiles this instead of the sideload bridge,
// so the Play classes do not download a remote game bundle or open a downloaded copy.
public final class GameUpdateBridge {
    public interface Host {
        void page(String js);
        void setDownloading(boolean on);
        java.io.File filesDir();
        String versionName();
    }

    private GameUpdateBridge() {}

    public static String installedPage(Host host) { return null; }

    public static void download(Host host, String base, String version) {
        if (host != null) host.setDownloading(false);
    }
}
