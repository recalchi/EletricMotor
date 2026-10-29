import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './native';

/**
 * Salva um arquivo de texto: no navegador dispara download; no APK grava no cache do app e abre o
 * compartilhamento do Android (salvar no Drive, enviar por e-mail/WhatsApp etc.).
 */
export async function saveTextFile(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  if (isNative()) {
    const res = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: filename, files: [res.uri], dialogTitle: 'Salvar ou enviar arquivo' });
    return;
  }
  const blob = new Blob([mime.startsWith('text/csv') ? '﻿' + text : text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Salva um binário (backup de firmware). No APK grava no armazenamento privado do app e retorna a URI para
 * exportar depois (exportFile); no navegador dispara o download.
 */
export async function saveBinaryFile(filename: string, data: Uint8Array): Promise<string | undefined> {
  if (isNative()) {
    let s = '';
    for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
    const res = await Filesystem.writeFile({
      path: `firmware-backups/${filename}`,
      data: btoa(s),
      directory: Directory.Data,
      recursive: true,
    });
    return res.uri;
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return undefined;
}

/** APK: abre o compartilhamento do Android para um arquivo já salvo (ex.: backup de firmware). */
export async function exportFile(uri: string, title: string) {
  await Share.share({ title, files: [uri], dialogTitle: 'Salvar ou enviar arquivo' });
}
