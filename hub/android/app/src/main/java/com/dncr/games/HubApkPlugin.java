package com.dncr.games;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Hub APK güncelleme: sistem tarayıcısı / DownloadManager + kurulum Intent.
 * Capacitor WebView tek başına .apk indirmeyi/kurmayı açmaz.
 * İndirme sırasında downloadProgress olayı (yüzde) yayınlar.
 */
@CapacitorPlugin(name = "HubApk")
public class HubApkPlugin extends Plugin {
    private static final String TAG = "HubApk";
    private static final String APK_NAME = "dncr-hub-update.apk";
    private static final long PROGRESS_INTERVAL_MS = 200L;

    private long downloadId = -1;
    private BroadcastReceiver downloadReceiver;
    private Handler progressHandler;
    private Runnable progressRunnable;

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (url.isEmpty()) {
            call.reject("url required");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "openExternal", e);
            call.reject(e.getMessage() != null ? e.getMessage() : "open_fail");
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url", "");
        if (url.isEmpty()) {
            call.reject("url required");
            return;
        }

        // Android 8+: bilinmeyen kaynaklardan kurulum izni
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PackageManager pm = getContext().getPackageManager();
            if (!pm.canRequestPackageInstalls()) {
                try {
                    Intent settings =
                            new Intent(
                                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                    Uri.parse("package:" + getContext().getPackageName()));
                    settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settings);
                } catch (Exception e) {
                    Log.w(TAG, "install settings", e);
                }
                // İndirmeyi yine de başlat; kullanıcı izin verince kurulum açılır
            }
        }

        try {
            File destDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (destDir != null && !destDir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                destDir.mkdirs();
            }
            File dest = new File(destDir, APK_NAME);
            if (dest.exists()) {
                //noinspection ResultOfMethodCallIgnored
                dest.delete();
            }

            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("DNCR Games güncelleme");
            req.setDescription("Yeni hub APK indiriliyor");
            req.setMimeType("application/vnd.android.package-archive");
            req.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(
                    getContext(), Environment.DIRECTORY_DOWNLOADS, APK_NAME);
            req.setAllowedOverMetered(true);
            req.setAllowedOverRoaming(true);

            DownloadManager dm =
                    (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm == null) {
                call.reject("download_manager_missing");
                return;
            }

            unregisterReceiverQuietly();
            stopProgressPolling();
            downloadId = dm.enqueue(req);
            registerDownloadReceiver();
            startProgressPolling();
            emitProgress(0, -1, DownloadManager.STATUS_RUNNING);

            JSObject ret = new JSObject();
            ret.put("downloadId", downloadId);
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "downloadAndInstall", e);
            stopProgressPolling();
            // Fallback: sistem tarayıcısı
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve(new JSObject().put("fallback", "browser"));
            } catch (Exception e2) {
                call.reject(e.getMessage() != null ? e.getMessage() : "download_fail");
            }
        }
    }

    private void startProgressPolling() {
        stopProgressPolling();
        progressHandler = new Handler(Looper.getMainLooper());
        progressRunnable =
                new Runnable() {
                    @Override
                    public void run() {
                        if (downloadId < 0 || progressHandler == null) return;
                        boolean done = false;
                        try {
                            done = queryAndEmitProgress();
                        } catch (Exception e) {
                            Log.w(TAG, "progress poll", e);
                        }
                        if (!done && progressHandler != null && progressRunnable != null) {
                            progressHandler.postDelayed(progressRunnable, PROGRESS_INTERVAL_MS);
                        }
                    }
                };
        progressHandler.post(progressRunnable);
    }

    private void stopProgressPolling() {
        if (progressHandler != null && progressRunnable != null) {
            progressHandler.removeCallbacks(progressRunnable);
        }
        progressHandler = null;
        progressRunnable = null;
    }

    /** @return true if download finished (success or fail) */
    private boolean queryAndEmitProgress() {
        DownloadManager dm =
                (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null || downloadId < 0) return true;

        DownloadManager.Query q = new DownloadManager.Query();
        q.setFilterById(downloadId);
        Cursor c = dm.query(q);
        if (c == null) return false;
        try {
            if (!c.moveToFirst()) return false;
            int statusIdx = c.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int soFarIdx = c.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
            int totalIdx = c.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            int status = statusIdx >= 0 ? c.getInt(statusIdx) : -1;
            long soFar = soFarIdx >= 0 ? c.getLong(soFarIdx) : 0L;
            long total = totalIdx >= 0 ? c.getLong(totalIdx) : -1L;
            emitProgress(soFar, total, status);
            return status == DownloadManager.STATUS_SUCCESSFUL
                    || status == DownloadManager.STATUS_FAILED;
        } finally {
            c.close();
        }
    }

    private void emitProgress(long soFar, long total, int status) {
        int percent = 0;
        if (total > 0) {
            percent = (int) Math.min(100L, Math.max(0L, (soFar * 100L) / total));
        } else if (status == DownloadManager.STATUS_SUCCESSFUL) {
            percent = 100;
        }
        JSObject ev = new JSObject();
        ev.put("bytes", soFar);
        ev.put("total", total);
        ev.put("percent", percent);
        ev.put("status", status);
        notifyListeners("downloadProgress", ev);
    }

    private void registerDownloadReceiver() {
        downloadReceiver =
                new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                        if (id != downloadId) return;
                        stopProgressPolling();
                        try {
                            emitProgress(1, 1, DownloadManager.STATUS_SUCCESSFUL);
                            promptInstall();
                        } catch (Exception e) {
                            Log.e(TAG, "promptInstall", e);
                            notifyListeners("installError", errObj(e.getMessage()));
                        } finally {
                            unregisterReceiverQuietly();
                        }
                    }
                };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(downloadReceiver, filter);
        }
    }

    private void promptInstall() {
        DownloadManager dm =
                (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) throw new IllegalStateException("download_manager_missing");

        DownloadManager.Query q = new DownloadManager.Query();
        q.setFilterById(downloadId);
        Cursor c = dm.query(q);
        if (c == null) throw new IllegalStateException("download_query_fail");
        try {
            if (!c.moveToFirst()) throw new IllegalStateException("download_missing");
            int statusIdx = c.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int status = statusIdx >= 0 ? c.getInt(statusIdx) : -1;
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                throw new IllegalStateException("download_status_" + status);
            }
        } finally {
            c.close();
        }

        File apk =
                new File(
                        getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                        APK_NAME);
        if (!apk.exists() || apk.length() < 1000) {
            throw new IllegalStateException("apk_missing");
        }

        Uri contentUri =
                FileProvider.getUriForFile(
                        getContext(), getContext().getPackageName() + ".fileprovider", apk);

        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(contentUri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(install);

        JSObject ev = new JSObject();
        ev.put("ok", true);
        notifyListeners("installReady", ev);
    }

    private static JSObject errObj(String msg) {
        JSObject o = new JSObject();
        o.put("message", msg != null ? msg : "error");
        return o;
    }

    private void unregisterReceiverQuietly() {
        if (downloadReceiver == null) return;
        try {
            getContext().unregisterReceiver(downloadReceiver);
        } catch (Exception ignored) {
        }
        downloadReceiver = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopProgressPolling();
        unregisterReceiverQuietly();
        super.handleOnDestroy();
    }
}
