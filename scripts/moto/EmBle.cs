using System; using System.IO; using System.Text; using System.Threading; using System.Collections.Generic;
using Windows.Devices.Bluetooth.Advertisement; using Windows.Storage.Streams;
public static class EmBle {
  static string Hex(IBuffer b){ var r = DataReader.FromBuffer(b); var a = new byte[b.Length]; r.ReadBytes(a); return BitConverter.ToString(a).Replace("-",""); }
  static string J(string s){ return s == null ? "null" : "\"" + s.Replace("\\","\\\\").Replace("\"","\\\"") + "\""; }
  public static int Run(int seconds, string path, string fase){
    Console.OutputEncoding = Encoding.UTF8; int n = 0; object lk = new object();
    var w = new BluetoothLEAdvertisementWatcher(); w.ScanningMode = BluetoothLEScanningMode.Active;
    using (var f = new StreamWriter(path, true, new UTF8Encoding(false))) {
      w.Received += (s, e) => {
        var sb = new StringBuilder();
        sb.Append("{\"t\":").Append(J(DateTime.Now.ToString("o"))).Append(",\"fase\":").Append(J(fase));
        sb.Append(",\"addr\":\"").Append(e.BluetoothAddress.ToString("X12")).Append("\",\"rssi\":").Append(e.RawSignalStrengthInDBm);
        sb.Append(",\"name\":").Append(J(e.Advertisement.LocalName)).Append(",\"kind\":").Append(J(e.AdvertisementType.ToString()));
        sb.Append(",\"uuids\":["); var first = true;
        foreach (var u in e.Advertisement.ServiceUuids){ if(!first) sb.Append(","); sb.Append(J(u.ToString())); first=false; }
        sb.Append("],\"mfr\":["); first = true;
        foreach (var m in e.Advertisement.ManufacturerData){ if(!first) sb.Append(","); sb.Append("{\"company\":\"0x").Append(m.CompanyId.ToString("X4")).Append("\",\"hex\":\"").Append(Hex(m.Data)).Append("\"}"); first=false; }
        sb.Append("],\"svcData\":["); first = true;
        foreach (var d in e.Advertisement.DataSections){ if (d.DataType==0x16||d.DataType==0x20||d.DataType==0x21){ if(!first) sb.Append(","); sb.Append("{\"type\":\"0x").Append(d.DataType.ToString("X2")).Append("\",\"hex\":\"").Append(Hex(d.Data)).Append("\"}"); first=false; } }
        sb.Append("]}");
        lock(lk){ f.WriteLine(sb.ToString()); n++; }
      };
      w.Start();
      for (int i = 0; i < seconds; i++){ Thread.Sleep(1000); if (w.Status == BluetoothLEAdvertisementWatcherStatus.Aborted) break; if ((i+1)%5==0) Console.WriteLine("  " + (seconds-i-1) + " s restantes · " + n + " anúncios"); }
      w.Stop(); Thread.Sleep(300);
      if (w.Status == BluetoothLEAdvertisementWatcherStatus.Aborted) Console.WriteLine("AVISO: Bluetooth do computador desligado ou indisponível.");
    }
    return n;
  }
}
public static class Program { public static int Main(string[] a){ return EmBle.Run(int.Parse(a[0]), a[1], a[2]) >= 0 ? 0 : 1; } }
