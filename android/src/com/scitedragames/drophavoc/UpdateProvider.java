package com.scitedragames.drophavoc;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

// Hands the downloaded update (cache/update/DropHavoc.apk) to Android's package installer as a content:// link
// (Android 7+ refuses file:// links between apps). Read-only, not exported; the installer gets a one-off grant.
public class UpdateProvider extends ContentProvider {
    private File apk() { return new File(new File(getContext().getCacheDir(), "update"), "DropHavoc.apk"); }
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "application/vnd.android.package-archive"; }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"DropHavoc.apk".equals(uri.getLastPathSegment())) throw new FileNotFoundException();
        return ParcelFileDescriptor.open(apk(), ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        File f = apk();
        MatrixCursor c = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        c.addRow(new Object[] { "DropHavoc.apk", f.length() });
        return c;
    }
    @Override public Uri insert(Uri uri, ContentValues v) { return null; }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
