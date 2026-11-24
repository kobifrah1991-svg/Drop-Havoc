package com.scitedragames.drophavoc;

// Sideload / local builds. android/build-aab.sh does not compile this file:
// it compiles android/play/BuildFlags.java, where REMOTE_GAME_UPDATES is false.
public final class BuildFlags {
    private BuildFlags() {}
    public static final boolean REMOTE_GAME_UPDATES = true;
}
