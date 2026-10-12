package com.recalchi.eletricmotor;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Base64;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

import java.util.List;

/**
 * Leitura USB serial (OTG) para o EletricMotor — SOMENTE LEITURA.
 * Não existe método de escrita: o app nunca envia bytes ao dispositivo conectado.
 * Baseado em usb-serial-for-android (CP210x, CH34x, FTDI, PL2303, CDC-ACM/ESP32-S3 etc.).
 */
@CapacitorPlugin(name = "UsbSerial")
public class UsbSerialPlugin extends Plugin implements SerialInputOutputManager.Listener {

    private static final String ACTION_USB_PERMISSION = "com.recalchi.eletricmotor.USB_PERMISSION";

    private UsbSerialPort port;
    private SerialInputOutputManager ioManager;
    private PluginCall pendingOpen;
    private int pendingBaud = 115200;

    private UsbManager usb() {
        return (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    }

    private List<UsbSerialDriver> drivers() {
        return UsbSerialProber.getDefaultProber().findAllDrivers(usb());
    }

    private JSObject describe(UsbSerialDriver d) {
        UsbDevice dev = d.getDevice();
        JSObject o = new JSObject();
        o.put("deviceId", dev.getDeviceId());
        o.put("vendorId", dev.getVendorId());
        o.put("productId", dev.getProductId());
        String name = dev.getProductName();
        o.put("name", name != null ? name : dev.getDeviceName());
        o.put("driver", d.getClass().getSimpleName().replace("SerialDriver", ""));
        return o;
    }

    @PluginMethod
    public void listDevices(PluginCall call) {
        JSArray arr = new JSArray();
        for (UsbSerialDriver d : drivers()) arr.put(describe(d));
        JSObject ret = new JSObject();
        ret.put("devices", arr);
        call.resolve(ret);
    }

    @PluginMethod
    public void open(PluginCall call) {
        closeQuietly();
        Integer deviceId = call.getInt("deviceId");
        pendingBaud = call.getInt("baudRate", 115200);
        UsbSerialDriver driver = null;
        for (UsbSerialDriver d : drivers()) {
            if (deviceId == null || d.getDevice().getDeviceId() == deviceId) {
                driver = d;
                break;
            }
        }
        if (driver == null) {
            call.reject("Dispositivo USB serial não encontrado");
            return;
        }
        if (!usb().hasPermission(driver.getDevice())) {
            requestPermission(call, driver.getDevice());
            return;
        }
        doOpen(call, driver);
    }

    private void requestPermission(PluginCall call, UsbDevice device) {
        pendingOpen = call;
        bridge.saveCall(call);
        Context ctx = getContext();
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                try {
                    ctx.unregisterReceiver(this);
                } catch (Exception ignored) {
                }
                PluginCall saved = pendingOpen;
                pendingOpen = null;
                if (saved == null) return;
                boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                if (!granted) {
                    saved.reject("Permissão USB negada");
                    return;
                }
                for (UsbSerialDriver d : drivers()) {
                    if (d.getDevice().getDeviceId() == device.getDeviceId()) {
                        doOpen(saved, d);
                        return;
                    }
                }
                saved.reject("Dispositivo USB desconectado");
            }
        };
        ContextCompat.registerReceiver(ctx, receiver, new IntentFilter(ACTION_USB_PERMISSION), ContextCompat.RECEIVER_NOT_EXPORTED);
        Intent intent = new Intent(ACTION_USB_PERMISSION).setPackage(ctx.getPackageName());
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, 0, intent, flags);
        usb().requestPermission(device, pi);
    }

    private void doOpen(PluginCall call, UsbSerialDriver driver) {
        UsbDeviceConnection connection = usb().openDevice(driver.getDevice());
        if (connection == null) {
            call.reject("Não foi possível abrir o dispositivo USB");
            return;
        }
        try {
            port = driver.getPorts().get(0);
            port.open(connection);
            port.setParameters(pendingBaud, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE);
            try {
                // Alguns adaptadores/ESP32 só transmitem com DTR/RTS ativos
                port.setDTR(true);
                port.setRTS(true);
            } catch (Exception ignored) {
            }
            ioManager = new SerialInputOutputManager(port, this);
            ioManager.start();
            JSObject ret = new JSObject();
            ret.put("device", describe(driver));
            call.resolve(ret);
        } catch (Exception e) {
            closeQuietly();
            call.reject("Falha ao abrir porta: " + e.getMessage());
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        closeQuietly();
        call.resolve();
    }

    private void closeQuietly() {
        if (ioManager != null) {
            ioManager.setListener(null);
            ioManager.stop();
            ioManager = null;
        }
        if (port != null) {
            try {
                port.close();
            } catch (Exception ignored) {
            }
            port = null;
        }
    }

    @Override
    public void onNewData(byte[] data) {
        JSObject o = new JSObject();
        o.put("base64", Base64.encodeToString(data, Base64.NO_WRAP));
        notifyListeners("data", o);
    }

    @Override
    public void onRunError(Exception e) {
        JSObject o = new JSObject();
        o.put("message", e.getMessage() != null ? e.getMessage() : "conexão USB encerrada");
        notifyListeners("error", o);
        closeQuietly();
    }

    @Override
    protected void handleOnDestroy() {
        closeQuietly();
        super.handleOnDestroy();
    }
}
