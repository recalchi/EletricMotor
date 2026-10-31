using System; using System.IO; using System.Text; using System.Threading; using System.Collections.Generic;
using Windows.Devices.Bluetooth; using Windows.Devices.Bluetooth.Advertisement; using Windows.Devices.Enumeration; using Windows.Storage.Streams;
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
public static class EmClassic {
  // AsTask() exigiria a referência unificada "Windows"; espera simples pelo estado da operação basta aqui
  static T Wait<T>(Windows.Foundation.IAsyncOperation<T> op){ while (op.Status == Windows.Foundation.AsyncStatus.Started) Thread.Sleep(50);
    if (op.Status != Windows.Foundation.AsyncStatus.Completed) throw new Exception("busca falhou: " + op.Status); return op.GetResults(); }
  static string J(string s){ return s == null ? "null" : "\"" + s.Replace("\\","\\\\").Replace("\"","\\\"") + "\""; }
  // Busca de Bluetooth CLÁSSICO (o que o Windows faz em "Adicionar dispositivo"): só lista nomes e endereços
  // anunciados; não pareia nem conecta. pareados=true lista os já pareados com este computador.
  public static int Run(string path, string fase){
    Console.OutputEncoding = Encoding.UTF8; int n = 0;
    // não pareados: um DeviceWatcher dispara a busca de rádio (inquiry) por ~25 s; pareados: lista direta
    var ids = new Dictionary<string, bool>(); object lk = new object();
    var w = DeviceInformation.CreateWatcher(BluetoothDevice.GetDeviceSelectorFromPairingState(false));
    w.Added += (s2, d) => { lock (lk) ids[d.Id] = false; };
    w.Updated += (s2, u) => { };
    w.Start(); Thread.Sleep(25000); try { w.Stop(); } catch { }
    foreach (var d in Wait(DeviceInformation.FindAllAsync(BluetoothDevice.GetDeviceSelectorFromPairingState(true)))) ids[d.Id] = true;
    using (var f = new StreamWriter(path, true, new UTF8Encoding(false))) {
      foreach (var kv in ids) {
        try {
          var bd = Wait(BluetoothDevice.FromIdAsync(kv.Key)); if (bd == null) continue;
          f.WriteLine("{\"t\":" + J(DateTime.Now.ToString("o")) + ",\"fase\":" + J(fase) + ",\"addr\":\"" + bd.BluetoothAddress.ToString("X12") +
            "\",\"name\":" + J(bd.Name) + ",\"pareado\":" + (kv.Value ? "true" : "false") + ",\"cod\":\"0x" + bd.ClassOfDevice.RawValue.ToString("X6") +
            "\",\"major\":" + J(bd.ClassOfDevice.MajorClass.ToString()) + "}");
          n++;
        } catch { }
      }
    }
    Console.WriteLine("  Bluetooth clássico: " + n + " aparelho(s)");
    return n;
  }
}
public static class Program { public static int Main(string[] a){
  if (a.Length > 0 && a[0] == "classico") return EmClassic.Run(a[1], a[2]) >= 0 ? 0 : 1;
  return EmBle.Run(int.Parse(a[0]), a[1], a[2]) >= 0 ? 0 : 1; } }
