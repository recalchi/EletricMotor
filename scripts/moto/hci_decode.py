#!/usr/bin/env python3
"""Decodifica um log Bluetooth do Android (btsnoop_hci.log) gravado enquanto o APP OFICIAL conversa com a moto.

Só LÊ um arquivo no computador: não conecta em nada e não envia nada à moto.
Sem dependências (Python 3.8+). Guia: docs/vehicle-evidence/LOG-HCI-APP-OFICIAL.md

Uso:
  python -I scripts/moto/hci_decode.py <btsnoop_hci.log | bugreport.zip> [--saida PASTA]
         [--alvo EVS] [--valores "14:32:10=87,14:33:05=1234.5"] [--janela 20] [--ajuste-horas 0]

Saídas (na pasta --saida, padrão: ao lado do arquivo):
  hci-resumo.md      aparelhos, conexões, tabela GATT (serviços/características) e o que o app fez em cada uma
  hci-linha.csv      todas as mensagens ATT da(s) conexão(ões) alvo, em ordem, com hora e bytes
  hci-valores.md     (com --valores) onde cada número lido na tela aparece nos bytes, perto daquela hora

Privacidade: endereços aparecem mascarados (só os 2 últimos bytes) e nomes "z"+IMEI ficam com o IMEI cortado.
Mesmo assim o log bruto e estas saídas ficam FORA do git (hw-logs/ e OneDrive).
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import re
import struct
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

BTSNOOP_EPOCH_DELTA = 0x00DCDDB30F2F8000  # µs entre 0000-01-01 e 1970-01-01
ALVO_PADRAO = r'EVS|VOLTZ|^z\d{6,}'

ATT_OPS = {
    0x01: 'Erro', 0x02: 'MTU pedido', 0x03: 'MTU resposta', 0x04: 'Descobrir descritores', 0x05: 'Descritores',
    0x06: 'Buscar por valor', 0x07: 'Buscar por valor (resp)', 0x08: 'Ler por tipo', 0x09: 'Ler por tipo (resp)',
    0x0A: 'Ler', 0x0B: 'Ler (resp)', 0x0C: 'Ler blob', 0x0D: 'Ler blob (resp)', 0x0E: 'Ler vários', 0x0F: 'Ler vários (resp)',
    0x10: 'Ler grupo', 0x11: 'Ler grupo (resp)', 0x12: 'Escrever', 0x13: 'Escrever (resp)', 0x16: 'Preparar escrita',
    0x17: 'Preparar escrita (resp)', 0x18: 'Executar escrita', 0x19: 'Executar escrita (resp)', 0x1B: 'Notificação',
    0x1D: 'Indicação', 0x1E: 'Confirmação', 0x52: 'Escrever sem resposta', 0xD2: 'Escrita assinada',
}
ESCRITAS = {0x12, 0x16, 0x52, 0xD2}
DADOS_DA_MOTO = {0x0B, 0x0D, 0x1B, 0x1D}
PROPS = [(0x02, 'leitura'), (0x04, 'escrita s/ resp'), (0x08, 'escrita'), (0x10, 'notificação'), (0x20, 'indicação')]
UUID_NOMES = {
    0x1800: 'Generic Access', 0x1801: 'Generic Attribute', 0x180A: 'Device Information', 0x180F: 'Battery Service',
    0x2A00: 'Nome do aparelho', 0x2A01: 'Aparência', 0x2A05: 'Service Changed', 0x2A19: 'Nível de bateria',
    0x2A24: 'Modelo', 0x2A25: 'Nº de série', 0x2A26: 'Versão firmware', 0x2A27: 'Versão hardware',
    0x2A28: 'Versão software', 0x2A29: 'Fabricante', 0x2902: 'CCCD (liga notificações)',
}


# ───────────────────────────── leitura do arquivo ─────────────────────────────

def abrir(caminho: Path) -> tuple[bytes, str]:
    """Aceita o btsnoop direto ou o zip do relatório de bug (pega o maior btsnoop lá dentro)."""
    if zipfile.is_zipfile(caminho):
        with zipfile.ZipFile(caminho) as z:
            cand = [i for i in z.infolist() if 'btsnoop' in i.filename.lower() and not i.is_dir()]
            # zips aninhados (alguns aparelhos colocam o bugreport dentro de outro zip)
            if not cand:
                for i in z.infolist():
                    if i.filename.lower().endswith('.zip'):
                        inner = zipfile.ZipFile(io.BytesIO(z.read(i)))
                        c2 = [j for j in inner.infolist() if 'btsnoop' in j.filename.lower() and not j.is_dir()]
                        if c2:
                            best = max(c2, key=lambda j: j.file_size)
                            return inner.read(best), f'{caminho.name} › {i.filename} › {best.filename}'
                nomes = [i.filename for i in z.infolist() if 'bt' in i.filename.lower()][:15]
                raise SystemExit('Nenhum btsnoop no zip. O registro HCI estava ATIVADO (não "filtrado") e o Bluetooth foi '
                                 'reiniciado antes da sessão?\nArquivos com "bt" no nome: ' + ', '.join(nomes or ['nenhum']))
            best = max(cand, key=lambda i: i.file_size)
            return z.read(best), f'{caminho.name} › {best.filename}'
    return caminho.read_bytes(), caminho.name


def registros(buf: bytes):
    if buf[:8] != b'btsnoop\0':
        raise SystemExit('Não é um arquivo btsnoop (cabeçalho inválido). Se veio de um Samsung como .cfa/.btsnooz, '
                         'gere o relatório de bug de novo com o registro em "Ativado".')
    _ver, link = struct.unpack('>II', buf[8:16])
    if link not in (1001, 1002):
        raise SystemExit(f'Tipo de link {link} não suportado (esperado 1001/1002).')
    pos = 16
    while pos + 24 <= len(buf):
        _orig, incl, flags, _drops, ts = struct.unpack('>IIIIq', buf[pos:pos + 24])
        pos += 24
        data = buf[pos:pos + incl]
        pos += incl
        if len(data) < incl:
            break  # arquivo cortado no fim (normal se o Bluetooth ainda gravava)
        recebido = bool(flags & 1)
        if link == 1002:
            if not data:
                continue
            tipo, data = data[0], data[1:]
        else:
            tipo = (4 if recebido else 1) if flags & 2 else 2
        yield ts, recebido, tipo, data


def hora(ts: int, ajuste_h: float) -> dt.datetime:
    us = ts - BTSNOOP_EPOCH_DELTA + int(ajuste_h * 3600e6)
    return dt.datetime(1970, 1, 1) + dt.timedelta(microseconds=us)


# ───────────────────────────── utilidades ─────────────────────────────

def mac(b: bytes) -> str:
    return ':'.join(f'{x:02X}' for x in reversed(b))


def mascara(addr: str) -> str:
    return '••:••:••:••:' + addr[-5:]


def mascara_nome(n: str) -> str:
    m = re.match(r'^(z)(\d{6,})$', n)
    return f'{m.group(1)}{"•" * (len(m.group(2)) - 4)}{m.group(2)[-4:]}' if m else n


def uuid_str(b: bytes) -> str:
    if len(b) == 2:
        u = struct.unpack('<H', b)[0]
        return f'0x{u:04X}'
    if len(b) == 16:
        h = b[::-1].hex()
        s = f'{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}'
        if s.endswith('-0000-1000-8000-00805f9b34fb') and s.startswith('0000'):
            return f'0x{s[4:8].upper()}'
        return s
    return b.hex()


def uuid_nome(u: str) -> str:
    try:
        return UUID_NOMES.get(int(u, 16), '') if u.startswith('0x') else ''
    except ValueError:
        return ''


def nome_adv(data: bytes) -> str | None:
    i = 0
    while i < len(data):
        ln = data[i]
        if ln == 0 or i + 1 + ln > len(data):
            break
        t = data[i + 1]
        if t in (0x08, 0x09):
            return data[i + 2:i + 1 + ln].decode('utf-8', 'replace')
        i += 1 + ln
    return None


# ───────────────────────────── decodificação ─────────────────────────────

class Conexao:
    def __init__(self, handle: int, addr: str, tipo: str, inicio: dt.datetime):
        self.handle, self.addr, self.tipo, self.inicio = handle, addr, tipo, inicio
        self.fim: dt.datetime | None = None
        self.servicos: list[tuple[int, int, str]] = []          # (início, fim, uuid)
        self.caracs: dict[int, dict] = {}                      # handle do valor → {uuid, props, decl}
        self.descritores: dict[int, str] = {}                  # handle → uuid
        self.pendente: dict[bool, tuple[int, bytes]] = {}       # direção → (opcode, parâmetros do pedido)
        self.msgs: list[dict] = []
        self.mtu: int | None = None

    def carac_de(self, h: int) -> str:
        if h in self.caracs:
            return self.caracs[h]['uuid']
        if h in self.descritores:
            # descritor: mostra a característica dona (maior handle de valor abaixo dele)
            dona = max((v for v in self.caracs if v < h), default=None)
            base = self.caracs[dona]['uuid'] if dona is not None else '?'
            return f'{base} / {self.descritores[h]}'
        return ''


def decodificar(buf: bytes, ajuste_h: float):
    nomes: dict[str, str] = {}
    conexoes: list[Conexao] = []
    ativas: dict[int, Conexao] = {}
    frag: dict[tuple[int, bool], bytearray] = {}
    falta: dict[tuple[int, bool], int] = {}
    n_reg = 0
    truncados = 0
    t0 = t1 = None

    for ts, rx, tipo, data in registros(buf):
        n_reg += 1
        t = hora(ts, ajuste_h)
        t0 = t0 or t
        t1 = t
        if tipo == 4 and len(data) >= 2:  # evento
            ev, plen = data[0], data[1]
            p = data[2:2 + plen]
            if ev == 0x3E and p:
                sub = p[0]
                if sub in (0x01, 0x0A) and len(p) >= 11 and p[1] == 0:
                    h = struct.unpack('<H', p[2:4])[0] & 0x0FFF
                    c = Conexao(h, mac(p[6:12]), 'LE', t)
                    ativas[h] = c
                    conexoes.append(c)
                elif sub == 0x02 and len(p) >= 2:
                    i = 2
                    for _ in range(p[1]):
                        if i + 9 > len(p):
                            break
                        a = mac(p[i + 2:i + 8])
                        ln = p[i + 8]
                        n = nome_adv(p[i + 9:i + 9 + ln])
                        if n:
                            nomes[a] = n
                        i += 9 + ln + 1
                elif sub == 0x0D and len(p) >= 2:
                    i = 2
                    for _ in range(p[1]):
                        if i + 24 > len(p):
                            break
                        a = mac(p[i + 3:i + 9])
                        ln = p[i + 23]
                        n = nome_adv(p[i + 24:i + 24 + ln])
                        if n:
                            nomes[a] = n
                        i += 24 + ln
            elif ev == 0x03 and len(p) >= 9 and p[0] == 0:  # conexão clássica (áudio "VOLTZ")
                h = struct.unpack('<H', p[1:3])[0] & 0x0FFF
                c = Conexao(h, mac(p[3:9]), 'Clássico', t)
                ativas[h] = c
                conexoes.append(c)
            elif ev == 0x07 and len(p) >= 7 and p[0] == 0:  # nome remoto (clássico)
                nomes[mac(p[1:7])] = p[7:].split(b'\0')[0].decode('utf-8', 'replace')
            elif ev == 0x05 and len(p) >= 3:
                h = struct.unpack('<H', p[1:3])[0] & 0x0FFF
                if h in ativas:
                    ativas.pop(h).fim = t
            continue

        if tipo != 2 or len(data) < 4:
            continue
        hdr, ln = struct.unpack('<HH', data[:4])
        h, pb = hdr & 0x0FFF, (hdr >> 12) & 0x3
        corpo = data[4:4 + ln]
        k = (h, rx)
        if pb == 0x1:  # continuação
            if k not in frag:
                continue
            frag[k] += corpo
        else:
            frag[k] = bytearray(corpo)
            if len(corpo) >= 4:
                falta[k] = struct.unpack('<H', corpo[:2])[0] + 4
        if k not in falta or len(frag[k]) < falta[k]:
            continue
        pdu = bytes(frag.pop(k))
        falta.pop(k, None)
        l2len, cid = struct.unpack('<HH', pdu[:4])
        if cid != 0x0004 or h not in ativas:
            continue
        att = pdu[4:4 + l2len]
        if len(att) < l2len:
            truncados += 1
        if att:
            _att(ativas[h], t, rx, att)

    return {'nomes': nomes, 'conexoes': conexoes, 'registros': n_reg, 'truncados': truncados, 't0': t0, 't1': t1}


def _att(c: Conexao, t: dt.datetime, rx: bool, a: bytes):
    op = a[0]
    p = a[1:]
    hnd = None
    valor = b''
    if op in (0x0A, 0x0C, 0x12, 0x16, 0x52, 0x1B, 0x1D, 0xD2) and len(p) >= 2:
        hnd = struct.unpack('<H', p[:2])[0]
        valor = p[2:] if op != 0x16 else p[4:]
        if op == 0x0C:
            valor = b''
    elif op in (0x0B, 0x0D):
        ped = c.pendente.get(not rx)
        if ped and ped[0] in (0x0A, 0x0C) and len(ped[1]) >= 2:
            hnd = struct.unpack('<H', ped[1][:2])[0]
        valor = p
    elif op == 0x01 and len(p) >= 4:
        hnd = struct.unpack('<H', p[1:3])[0]
        valor = p
    elif op in (0x02, 0x03) and len(p) >= 2:
        c.mtu = struct.unpack('<H', p[:2])[0]

    # respostas de descoberta → monta a tabela GATT
    ped = c.pendente.get(not rx)
    if op == 0x11 and p:
        n = p[0]
        for i in range(1, len(p) - n + 1, n):
            s, e = struct.unpack('<HH', p[i:i + 4])
            c.servicos.append((s, e, uuid_str(p[i + 4:i + n])))
    elif op == 0x09 and p and ped and len(ped[1]) >= 6 and uuid_str(ped[1][4:]) == '0x2803':
        n = p[0]
        for i in range(1, len(p) - n + 1, n):
            decl, props, vh = struct.unpack('<HBH', p[i:i + 5])
            c.caracs[vh] = {'uuid': uuid_str(p[i + 5:i + n]), 'props': props, 'decl': decl}
    elif op == 0x05 and len(p) >= 1:
        n = 4 if p[0] == 1 else 18
        for i in range(1, len(p) - n + 1, n):
            hh = struct.unpack('<H', p[i:i + 2])[0]
            u = uuid_str(p[i + 2:i + n])
            if u not in ('0x2800', '0x2801', '0x2803') and hh not in c.caracs:
                c.descritores[hh] = u

    if op in (0x02, 0x04, 0x06, 0x08, 0x0A, 0x0C, 0x0E, 0x10, 0x12, 0x16, 0x18):
        c.pendente[rx] = (op, p)

    c.msgs.append({'t': t, 'rx': rx, 'op': op, 'h': hnd, 'v': valor, 'raw': a})


# ───────────────────────────── busca dos números da tela ─────────────────────────────

def codificacoes(valor: float):
    """Formas comuns de um número aparecer nos bytes (inteiro, ×10, ×100, ×1000; 1/2/4 bytes; LE/BE; BCD; texto)."""
    out = []
    for esc, rot in ((1, ''), (10, '×10'), (100, '×100'), (1000, '×1000')):
        v = valor * esc
        if abs(v - round(v)) > 1e-6:
            continue
        v = int(round(v))
        if 0 <= v <= 0xFF:
            out.append((bytes([v]), f'u8{rot}'))
        if 0 <= v <= 0xFFFF and v > 0xFF:
            out.append((struct.pack('<H', v), f'u16 LE{rot}'))
            out.append((struct.pack('>H', v), f'u16 BE{rot}'))
        if 0xFFFF < v <= 0xFFFFFFFF:
            out.append((struct.pack('<I', v), f'u32 LE{rot}'))
            out.append((struct.pack('>I', v), f'u32 BE{rot}'))
            out.append((struct.pack('<I', v)[:3], f'u24 LE{rot}'))
            out.append((struct.pack('>I', v)[1:], f'u24 BE{rot}'))
        if v > 0:
            s = str(v)
            if len(s) % 2:
                s = '0' + s
            if len(s) >= 4:
                out.append((bytes.fromhex(s), f'BCD{rot}'))
            out.append((str(v).encode(), f'texto{rot}'))
    return out


def procurar_valores(alvos: list[Conexao], pedidos: list[tuple[dt.time, float]], janela: int, dia: dt.date):
    linhas = ['# Números da tela × bytes do log', '',
              f'Janela: ±{janela} s em torno de cada hora anotada. Só mensagens vindas da moto (leituras, notificações).',
              'Um acerto isolado pode ser coincidência (u8 bate muito). Vale o que **se repete** na mesma característica e',
              'posição e **acompanha** o valor quando ele muda (ex.: % de bateria caindo).', '']
    resumo: dict[tuple, int] = defaultdict(int)
    for hh, valor in pedidos:
        alvo_t = dt.datetime.combine(dia, hh)
        linhas.append(f'## {hh.strftime("%H:%M:%S")} → {valor:g}')
        cods = codificacoes(valor)
        achou = 0
        for c in alvos:
            for m in c.msgs:
                if m['op'] not in DADOS_DA_MOTO or not m['v']:
                    continue
                if abs((m['t'] - alvo_t).total_seconds()) > janela:
                    continue
                for padrao, rot in cods:
                    i = m['v'].find(padrao)
                    while i >= 0:
                        car = c.carac_de(m['h']) if m['h'] is not None else '?'
                        if len(padrao) >= 2 or achou < 12:
                            linhas.append(f'- {m["t"].strftime("%H:%M:%S.%f")[:-3]} · {ATT_OPS.get(m["op"], hex(m["op"]))} '
                                          f'handle 0x{m["h"] or 0:04X} {car} · byte {i} · **{rot}** · `{m["v"].hex(" ")}`')
                        resumo[(car, m['h'], i, rot)] += 1
                        achou += 1
                        i = m['v'].find(padrao, i + 1)
        if not achou:
            linhas.append('- nenhum acerto (o valor pode estar em outra escala, com sinal, ou só na nuvem do app)')
        linhas.append('')
    rep = sorted(((n, k) for k, n in resumo.items() if n > 1), reverse=True)[:15]
    if rep:
        linhas += ['## Posições que se repetiram entre anotações', '',
                   '| acertos | característica | handle | byte | formato |', '|---|---|---|---|---|']
        for n, (car, h, i, rot) in rep:
            linhas.append(f'| {n} | {car or "?"} | 0x{h or 0:04X} | {i} | {rot} |')
    return '\n'.join(linhas) + '\n'


# ───────────────────────────── relatório ─────────────────────────────

def props_txt(p: int) -> str:
    return ', '.join(n for b, n in PROPS if p & b) or '—'


def resumo_md(origem: str, r: dict, alvos: list[Conexao], alvo_re: str) -> str:
    nomes, conexoes = r['nomes'], r['conexoes']
    L = ['# Log HCI — resumo', '',
         f'- Arquivo: `{origem}` · {r["registros"]} registros · de {r["t0"]:%d/%m/%Y %H:%M:%S} a {r["t1"]:%H:%M:%S} '
         '(hora como gravada no celular; ajuste com `--ajuste-horas` se não bater)',
         f'- Alvo: nome que casa com `{alvo_re}`', '']
    if r['truncados']:
        L += [f'> ⚠️ {r["truncados"]} mensagens vieram **cortadas**: o registro estava em "Ativado (filtrado)". '
              'Grave de novo com **"Ativado"** para ver os bytes inteiros.', '']
    L += ['## Conexões no período', '', '| tipo | aparelho | nome | início | fim | msgs ATT | alvo |', '|---|---|---|---|---|---|---|']
    for c in conexoes:
        n = mascara_nome(nomes.get(c.addr, '?'))
        L.append(f'| {c.tipo} | {mascara(c.addr)} | {n} | {c.inicio:%H:%M:%S} | {c.fim.strftime("%H:%M:%S") if c.fim else "—"} '
                 f'| {len(c.msgs)} | {"✅" if c in alvos else ""} |')
    if not alvos:
        L += ['', '**Nenhuma conexão com a moto encontrada.** Possíveis causas: o app oficial não conectou por Bluetooth '
              '(pode usar só a nuvem/4G), o nome não apareceu no log (rode com `--alvo` = final do endereço, ex. `AB:CD`), '
              'ou o registro foi ligado sem reiniciar o Bluetooth.']
    for c in alvos:
        L += ['', f'## {mascara_nome(nomes.get(c.addr, "?"))} ({mascara(c.addr)}) · {c.tipo} · {c.inicio:%H:%M:%S}'
              + (f' · MTU {c.mtu}' if c.mtu else ''), '']
        if c.servicos or c.caracs:
            L += ['### Tabela GATT descoberta pelo app', '', '| serviço | característica | handle | propriedades |', '|---|---|---|---|']
            for s, e, u in sorted(c.servicos):
                L.append(f'| **{u}** {uuid_nome(u)} | | 0x{s:04X}–0x{e:04X} | |')
                for vh, ch in sorted(c.caracs.items()):
                    if s <= vh <= e:
                        L.append(f'| | {ch["uuid"]} {uuid_nome(ch["uuid"])} | 0x{vh:04X} | {props_txt(ch["props"])} |')
            sem = [vh for vh in c.caracs if not any(s <= vh <= e for s, e, _ in c.servicos)]
            for vh in sorted(sem):
                ch = c.caracs[vh]
                L.append(f'| ? | {ch["uuid"]} | 0x{vh:04X} | {props_txt(ch["props"])} |')
        else:
            L += ['_O app não fez a descoberta GATT neste log (já tinha em cache). Para ver a tabela: Configurações → Apps → '
                  'app oficial → limpar cache, ou desparear e parear de novo antes de gravar._']
        por = defaultdict(lambda: {'n': 0, 'ops': defaultdict(int), 'ex': []})
        for m in c.msgs:
            if m['h'] is None or m['op'] not in ESCRITAS | DADOS_DA_MOTO:
                continue
            d = por[m['h']]
            d['n'] += 1
            d['ops'][m['op']] += 1
            if m['v'] and len(d['ex']) < 4 and m['v'].hex() not in [x[1] for x in d['ex']]:
                d['ex'].append((m['t'], m['v'].hex()))
        if por:
            L += ['', '### O que trafegou (por handle)', '',
                  '| handle | característica | celular → moto | moto → celular | exemplos (hex) |', '|---|---|---|---|---|']
            for h, d in sorted(por.items()):
                ida = sum(n for o, n in d['ops'].items() if o in ESCRITAS)
                volta = sum(n for o, n in d['ops'].items() if o in DADOS_DA_MOTO)
                ex = '<br>'.join(f'{t:%H:%M:%S} `{hx[:64]}{"…" if len(hx) > 64 else ""}`' for t, hx in d['ex'])
                L.append(f'| 0x{h:04X} | {c.carac_de(h)} | {ida} | {volta} | {ex} |')
            cccd = [m for m in c.msgs if m['op'] == 0x12 and m['h'] in c.descritores and c.descritores[m['h']] == '0x2902']
            if cccd:
                L += ['', 'Notificações ligadas pelo app (escrita no CCCD): ' +
                      ', '.join(f'0x{m["h"]:04X} → {c.carac_de(m["h"])} = `{m["v"].hex()}`' for m in cccd)]
            L += ['', '> As escritas **celular → moto** mostram os **pedidos** que o app oficial faz. Elas servem para '
                  'entender o protocolo; o EletricMotor **não** repete nenhuma escrita sem a decisão explícita do dono '
                  '(nível 5) e nunca envia comandos de configuração.']
    return '\n'.join(L) + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('arquivo', type=Path)
    ap.add_argument('--saida', type=Path)
    ap.add_argument('--alvo', default=ALVO_PADRAO, help='regex do nome ou final do endereço (ex.: "AB:CD")')
    ap.add_argument('--valores', default='', help='"hh:mm:ss=valor,..." lidos na tela do app/painel')
    ap.add_argument('--janela', type=int, default=20)
    ap.add_argument('--ajuste-horas', type=float, default=0.0)
    a = ap.parse_args(argv)
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')

    buf, origem = abrir(a.arquivo)
    r = decodificar(buf, a.ajuste_horas)
    rx = re.compile(a.alvo, re.I)
    alvos = [c for c in r['conexoes'] if rx.search(r['nomes'].get(c.addr, '')) or rx.search(c.addr)]

    saida = a.saida or a.arquivo.parent
    saida.mkdir(parents=True, exist_ok=True)
    (saida / 'hci-resumo.md').write_text(resumo_md(origem, r, alvos, a.alvo), encoding='utf-8')
    with open(saida / 'hci-linha.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['hora', 'aparelho', 'direcao', 'operacao', 'handle', 'caracteristica', 'bytes'])
        for c in alvos:
            for m in c.msgs:
                w.writerow([m['t'].strftime('%H:%M:%S.%f')[:-3], mascara(c.addr), 'moto→celular' if m['rx'] else 'celular→moto',
                            ATT_OPS.get(m['op'], f'0x{m["op"]:02X}'), '' if m['h'] is None else f'0x{m["h"]:04X}',
                            c.carac_de(m['h']) if m['h'] is not None else '', (m['v'] or m['raw']).hex(' ')])
    print(f'{len(r["conexoes"])} conexões no log, {len(alvos)} com a moto. Saída: {saida}')
    if a.valores:
        pedidos = []
        for item in a.valores.split(','):
            hh, _, v = item.strip().partition('=')
            pedidos.append((dt.time.fromisoformat(hh.strip()), float(v.strip().replace(' ', ''))))
        dia = (alvos[0].inicio if alvos else r['t0']).date()
        (saida / 'hci-valores.md').write_text(procurar_valores(alvos, pedidos, a.janela, dia), encoding='utf-8')
        print('Busca dos valores: hci-valores.md')
    return 0


if __name__ == '__main__':
    sys.exit(main())
