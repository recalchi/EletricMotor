/**
 * Declarações mínimas de Web Serial e Web Bluetooth (ainda fora do lib.dom do TypeScript).
 * Somente o subconjunto usado pelos adaptadores.
 */

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}
interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}
interface Serial {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPort>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly uuid: string;
  readonly value: DataView | null;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  readValue(): Promise<DataView>;
  readonly properties: {
    notify: boolean;
    read: boolean;
    write?: boolean;
    writeWithoutResponse?: boolean;
    indicate?: boolean;
  };
}
interface BluetoothRemoteGATTService {
  readonly uuid: string;
  getCharacteristic(uuid: string | number): Promise<BluetoothRemoteGATTCharacteristic>;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}
interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string | number): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
}
interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}
interface Bluetooth {
  requestDevice(options: {
    filters?: { services?: (string | number)[]; namePrefix?: string }[];
    optionalServices?: (string | number)[];
    acceptAllDevices?: boolean;
  }): Promise<BluetoothDevice>;
}

interface Navigator {
  readonly serial?: Serial;
  readonly bluetooth?: Bluetooth;
}
