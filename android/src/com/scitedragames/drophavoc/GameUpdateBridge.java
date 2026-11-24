package com.scitedragames.drophavoc;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

// Sideload only. The Play bundle compiles android/play/GameUpdateBridge.java instead,
// which does not download files.json or open the ota folder.
public final class GameUpdateBridge {
    public interface Host {
        void page(String js);
        void setDownloading(boolean on);
        File filesDir();
        String versionName();
    }

    private GameUpdateBridge() {}

    private static File otaRoot(Host host) { return new File(host.filesDir(), "ota"); }

    // the newest copy of the game, when a downloaded one is newer than the APK. null = use the built-in copy.
    public static String installedPage(Host host) {
        try {
            String cur = readText(new File(otaRoot(host), "current"));
            String mine = host.versionName();
            if (cur != null && cur.matches("[0-9]+(\\.[0-9]+){1,3}")) {
                File idx = new File(new File(otaRoot(host), cur), "index.html");
                if (cmpVer(cur, mine) > 0 && idx.exists()) return "file://" + idx.getAbsolutePath();
                if (cmpVer(cur, mine) <= 0) wipe(otaRoot(host)); // a newer APK was installed: its own copy wins
            }
        } catch (Exception e) { /* fall back to the built-in copy */ }
        return null;
    }

    public static void download(Host host, String base, String version) {
        File part = new File(otaRoot(host), version + ".part"), done = new File(otaRoot(host), version);
        try {
            if (new File(done, "index.html").exists() && version.equals(readText(new File(otaRoot(host), "current")))) {
                host.setDownloading(false);
                host.page("window.dropHavocUpdate&&window.dropHavocUpdate('ready',100)");
                return;
            }
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
                    if (pct != last) { last = pct; host.page("window.dropHavocUpdate&&window.dropHavocUpdate('progress'," + pct + ")"); }
                }
                o.close(); in.close(); c.disconnect();
                StringBuilder hex = new StringBuilder(); for (byte b : sha.digest()) hex.append(String.format("%02x", b));
                if (size != f.getLong("size") || !hex.toString().equals(f.getString("sha256"))) throw new Exception("bad " + path);
            }
            wipe(done);
            if (!part.renameTo(done)) throw new Exception("rename");
            OutputStream o = new FileOutputStream(new File(otaRoot(host), "current")); o.write(version.getBytes("UTF-8")); o.close();
            File[] old = otaRoot(host).listFiles();
            if (old != null) for (File k : old) if (k.isDirectory() && !k.getName().equals(version)) wipe(k);
            host.setDownloading(false);
            host.page("window.dropHavocUpdate&&window.dropHavocUpdate('ready',100)");
        } catch (Exception e) {
            host.setDownloading(false);
            wipe(part);
            host.page("window.dropHavocUpdate&&window.dropHavocUpdate('failed',0)");
        }
    }

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
