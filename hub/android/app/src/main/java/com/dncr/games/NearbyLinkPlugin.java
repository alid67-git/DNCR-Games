package com.dncr.games;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Offline 1:1 link via Google Nearby Connections (Bluetooth + Wi‑Fi Direct).
 */
@CapacitorPlugin(name = "NearbyLink")
public class NearbyLinkPlugin extends Plugin {
    private static final String TAG = "NearbyLink";
    private static final int REQ_PERMS = 7913;
    private static final Strategy STRATEGY = Strategy.P2P_POINT_TO_POINT;

    private ConnectionsClient connections;
    @Nullable private String connectedEndpointId;
    @Nullable private String expectedName;
    private boolean isHost;
    private boolean stopped = true;
    @Nullable private String pendingMode;
    @Nullable private String pendingServiceId;
    @Nullable private String pendingName;
    @Nullable private PluginCall pendingCall;

    private ConnectionsClient client() {
        if (connections == null) {
            connections = Nearby.getConnectionsClient(getContext());
        }
        return connections;
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        int status =
                GoogleApiAvailability.getInstance()
                        .isGooglePlayServicesAvailable(getContext());
        ret.put("available", status == ConnectionResult.SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void startHost(PluginCall call) {
        begin("host", call);
    }

    @PluginMethod
    public void startJoin(PluginCall call) {
        begin("join", call);
    }

    private void begin(String mode, PluginCall call) {
        String serviceId = call.getString("serviceId", "");
        String name = normalizeName(call.getString("name", ""));
        if (serviceId.isEmpty() || name.isEmpty()) {
            call.reject("serviceId and name required");
            return;
        }
        pendingMode = mode;
        pendingServiceId = serviceId;
        pendingName = name;
        pendingCall = call;
        call.setKeepAlive(true);
        if (!hasRuntimePermissions()) {
            ActivityCompat.requestPermissions(
                    getActivity(), runtimePermissions(), REQ_PERMS);
            return;
        }
        continuePending();
    }

    @Override
    protected void handleRequestPermissionsResult(
            int requestCode, String[] permissions, int[] grantResults) {
        super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_PERMS) return;
        if (!hasRuntimePermissions()) {
            if (pendingCall != null) {
                pendingCall.reject("nearby_permission_denied");
                pendingCall = null;
            }
            return;
        }
        continuePending();
    }

    private void continuePending() {
        PluginCall call = pendingCall;
        String mode = pendingMode;
        String serviceId = pendingServiceId;
        String name = pendingName;
        pendingCall = null;
        if (call == null || mode == null || serviceId == null || name == null) return;
        if ("host".equals(mode)) {
            doStartHost(call, serviceId, name);
        } else {
            doStartJoin(call, serviceId, name);
        }
    }

    private void doStartHost(PluginCall call, String serviceId, String name) {
        resetLink(false);
        stopped = false;
        isHost = true;
        expectedName = name;
        AdvertisingOptions opts =
                new AdvertisingOptions.Builder().setStrategy(STRATEGY).build();
        client()
                .startAdvertising(name, serviceId, lifecycleCallback, opts)
                .addOnSuccessListener(
                        unused -> {
                            JSObject ret = new JSObject();
                            ret.put("ok", true);
                            ret.put("name", name);
                            call.resolve(ret);
                        })
                .addOnFailureListener(
                        e -> {
                            Log.e(TAG, "advertise fail", e);
                            call.reject(e.getMessage() != null ? e.getMessage() : "advertise_fail");
                        });
    }

    private void doStartJoin(PluginCall call, String serviceId, String name) {
        resetLink(false);
        stopped = false;
        isHost = false;
        expectedName = name;
        DiscoveryOptions opts = new DiscoveryOptions.Builder().setStrategy(STRATEGY).build();
        client()
                .startDiscovery(serviceId, discoveryCallback, opts)
                .addOnSuccessListener(
                        unused -> {
                            JSObject ret = new JSObject();
                            ret.put("ok", true);
                            ret.put("name", name);
                            call.resolve(ret);
                        })
                .addOnFailureListener(
                        e -> {
                            Log.e(TAG, "discover fail", e);
                            call.reject(e.getMessage() != null ? e.getMessage() : "discover_fail");
                        });
    }

    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data", null);
        if (data == null) {
            call.reject("data required");
            return;
        }
        if (connectedEndpointId == null) {
            call.reject("not_connected");
            return;
        }
        Payload payload = Payload.fromBytes(data.getBytes(StandardCharsets.UTF_8));
        client()
                .sendPayload(connectedEndpointId, payload)
                .addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(
                        e ->
                                call.reject(
                                        e.getMessage() != null ? e.getMessage() : "send_fail"));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        resetLink(true);
        call.resolve();
    }

    private void resetLink(boolean markStopped) {
        if (markStopped) stopped = true;
        try {
            client().stopAdvertising();
        } catch (Exception ignored) {
        }
        try {
            client().stopDiscovery();
        } catch (Exception ignored) {
        }
        try {
            client().stopAllEndpoints();
        } catch (Exception ignored) {
        }
        connectedEndpointId = null;
    }

    private final EndpointDiscoveryCallback discoveryCallback =
            new EndpointDiscoveryCallback() {
                @Override
                public void onEndpointFound(
                        @NonNull String endpointId, @NonNull DiscoveredEndpointInfo info) {
                    if (stopped || isHost || connectedEndpointId != null) return;
                    String found = normalizeName(info.getEndpointName());
                    if (expectedName == null || !expectedName.equals(found)) return;
                    String localName = expectedName != null ? expectedName : "GUEST";
                    client()
                            .requestConnection(localName, endpointId, lifecycleCallback)
                            .addOnFailureListener(
                                    e -> {
                                        Log.e(TAG, "requestConnection fail", e);
                                        notifyError(
                                                e.getMessage() != null
                                                        ? e.getMessage()
                                                        : "request_fail");
                                    });
                }

                @Override
                public void onEndpointLost(@NonNull String endpointId) {}
            };

    private final ConnectionLifecycleCallback lifecycleCallback =
            new ConnectionLifecycleCallback() {
                @Override
                public void onConnectionInitiated(
                        @NonNull String endpointId, @NonNull ConnectionInfo connectionInfo) {
                    if (stopped) {
                        client().rejectConnection(endpointId);
                        return;
                    }
                    if (connectedEndpointId != null && !connectedEndpointId.equals(endpointId)) {
                        client().rejectConnection(endpointId);
                        return;
                    }
                    client().acceptConnection(endpointId, payloadCallback);
                }

                @Override
                public void onConnectionResult(
                        @NonNull String endpointId, @NonNull ConnectionResolution result) {
                    if (result.getStatus().getStatusCode()
                            == ConnectionsStatusCodes.STATUS_OK) {
                        connectedEndpointId = endpointId;
                        try {
                            client().stopAdvertising();
                        } catch (Exception ignored) {
                        }
                        try {
                            client().stopDiscovery();
                        } catch (Exception ignored) {
                        }
                        JSObject ev = new JSObject();
                        ev.put("endpointId", endpointId);
                        ev.put("isHost", isHost);
                        notifyListeners("connected", ev);
                    } else {
                        notifyError("connection_failed");
                    }
                }

                @Override
                public void onDisconnected(@NonNull String endpointId) {
                    if (connectedEndpointId != null
                            && connectedEndpointId.equals(endpointId)) {
                        connectedEndpointId = null;
                        notifyListeners("disconnected", new JSObject());
                    }
                }
            };

    private final PayloadCallback payloadCallback =
            new PayloadCallback() {
                @Override
                public void onPayloadReceived(@NonNull String endpointId, @NonNull Payload payload) {
                    if (payload.getType() != Payload.Type.BYTES) return;
                    byte[] bytes = payload.asBytes();
                    if (bytes == null) return;
                    JSObject ev = new JSObject();
                    ev.put("data", new String(bytes, StandardCharsets.UTF_8));
                    notifyListeners("payload", ev);
                }

                @Override
                public void onPayloadTransferUpdate(
                        @NonNull String endpointId, @NonNull PayloadTransferUpdate update) {}
            };

    private void notifyError(String message) {
        JSObject ev = new JSObject();
        ev.put("message", message);
        notifyListeners("error", ev);
    }

    private static String normalizeName(@Nullable String raw) {
        if (raw == null) return "";
        return raw.trim().toUpperCase(Locale.US).replaceAll("[^A-Z0-9]", "");
    }

    private boolean hasRuntimePermissions() {
        for (String p : runtimePermissions()) {
            if (ContextCompat.checkSelfPermission(getContext(), p)
                    != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private String[] runtimePermissions() {
        List<String> list = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33) {
            list.add(Manifest.permission.BLUETOOTH_SCAN);
            list.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            list.add(Manifest.permission.BLUETOOTH_CONNECT);
            list.add(Manifest.permission.NEARBY_WIFI_DEVICES);
            list.add(Manifest.permission.ACCESS_FINE_LOCATION);
        } else if (Build.VERSION.SDK_INT >= 31) {
            list.add(Manifest.permission.BLUETOOTH_SCAN);
            list.add(Manifest.permission.BLUETOOTH_ADVERTISE);
            list.add(Manifest.permission.BLUETOOTH_CONNECT);
            list.add(Manifest.permission.ACCESS_FINE_LOCATION);
        } else {
            list.add(Manifest.permission.ACCESS_FINE_LOCATION);
            list.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        return list.toArray(new String[0]);
    }

    @Override
    protected void handleOnDestroy() {
        resetLink(true);
        super.handleOnDestroy();
    }
}
