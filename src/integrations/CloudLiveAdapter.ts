import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db } from '../data/firebase';
import type { TelemetrySample } from '../domain/types';
import { BaseAdapter } from './adapter';

/**
 * Leitura ao vivo das amostras gravadas pela Cloud Function `ingest` em
 * users/{uid}/vehicles/{vehicleId}/telemetryLatest. Só funciona com login Firebase.
 * A origem vem do servidor (REAL apenas para dispositivo validado) — o cliente não a altera.
 */
export class CloudLiveAdapter extends BaseAdapter {
  id = 'cloud-live';
  name = 'Nuvem (ingestão HTTPS)';
  kind = 'gateway' as const;
  description = 'Recebe, em tempo real, os dados enviados por gateways à função de ingestão. Somente leitura.';

  private uid: string | null = null;
  private vehicleId = 'evs-1';
  private unsub: Unsubscribe | null = null;

  attach(uid: string | null, vehicleId: string) {
    const changed = uid !== this.uid;
    this.uid = uid;
    this.vehicleId = vehicleId;
    if (changed && this.unsub) void this.disconnect();
    if (!uid) {
      this.st.state = 'desconectado';
      this.st.message = 'Disponível somente com login Firebase';
    }
  }

  async connect() {
    if (!db || !this.uid) {
      this.st.state = 'erro';
      this.st.message = 'Entre com uma conta Firebase para receber dados da nuvem';
      this.log('warn', this.st.message);
      return;
    }
    if (this.unsub) return;
    this.st.state = 'conectando';
    this.unsub = onSnapshot(
      collection(db, 'users', this.uid, 'vehicles', this.vehicleId, 'telemetryLatest'),
      (snap) => {
        this.st.state = 'conectado';
        this.st.message = `${snap.size} série(s) na nuvem`;
        snap.docChanges().forEach((c) => {
          if (c.type === 'removed') return;
          const s = c.doc.data() as TelemetrySample;
          if (typeof s.value === 'number' && typeof s.timestamp === 'number') this.emit(s);
        });
      },
      (err) => {
        this.st.state = 'erro';
        this.st.message =
          err.code === 'permission-denied' ? 'Sem permissão (publique as regras do Firestore)' : err.message;
        this.log('error', this.st.message);
        this.unsub = null;
      },
    );
    this.log('info', 'Assinatura de telemetria da nuvem iniciada');
  }

  async disconnect() {
    this.unsub?.();
    this.unsub = null;
    this.st.state = 'desconectado';
    this.st.message = 'Assinatura encerrada';
  }
}
