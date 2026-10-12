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
