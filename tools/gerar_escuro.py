#!/usr/bin/env python3
"""Gera, a partir do styles.css, as regras do Modo Escuro para tudo que tem cor clara fixa.
Uso: python3 tools/gerar_escuro.py   (reescreve o bloco entre os marcadores ESCURO-AUTO no styles.css)"""
import re, colorsys, sys
P = 'styles.css'
INI, FIM = '/* ESCURO-AUTO inicio */', '/* ESCURO-AUTO fim */'
src = open(P, encoding='utf-8').read()
a, b = src.find(INI), src.find(FIM)
if a >= 0 and b >= 0:
    src = src[:a].rstrip() + '\n' + src[b + len(FIM):].lstrip('\n')
corte = src.find('TEMAS DE COR')
corte = src.rfind('/*', 0, corte)
base = src[:corte]
sem = re.sub(r'/\*.*?\*/', '', base, flags=re.S)

def hexrgb(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def lum(r, g, b): return .3 * r + .59 * g + .11 * b
def tom(r, g, b, texto=False):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if s < .12: return 'n'
    if 170 <= h * 360 < 255 and s < (.8 if texto else .45): return 'n'
    h *= 360
    if h < 20 or h >= 330: return 'r'
    if h < 70: return 'a'
    if h < 170: return 'v'
    if h < 255: return 'b'
    return 'p'
FUNDO = {'n': 'var(--card-bg)', 'r': '#3B1A1A', 'a': '#3A2F12', 'v': '#1F3328', 'b': '#0C2A3A', 'p': '#2B2140'}
TEXTO = {'n': 'var(--text-main)', 'r': '#FCA5A5', 'a': '#FCD34D', 'v': '#86EFAC', 'b': '#7DD3FC', 'p': '#D8B4FE'}
BORDA = {'n': 'var(--border-color)', 'r': '#6B2B2B', 'a': '#5E4A1A', 'v': '#2F5440', 'b': '#1E4A63', 'p': '#4A3A70'}
FUNDO_HEX = {'n': '#17201B', 'r': '#3B1A1A', 'a': '#3A2F12', 'v': '#1F3328', 'b': '#0C2A3A', 'p': '#2B2140'}
HEX = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\bwhite\b')
def cor(tok):
    if tok == 'white': return (255, 255, 255)
    return hexrgb(tok)

# percorre regras (com @media aninhado)
regras = []
i, n = 0, len(sem)
pilha = []
buf = ''
while i < n:
    c = sem[i]
    if c == '{':
        cab = buf.strip(); buf = ''
        if cab.startswith('@'):
            pilha.append(cab)
        else:
            j = sem.index('}', i)
            corpo = sem[i + 1:j]
            ctx = [p for p in pilha]
            regras.append((cab, corpo, ctx))
            i = j
    elif c == '}':
        if pilha: pilha.pop()
        buf = ''
    else:
        buf += c
    i += 1

ultimo = {}
for cab, corpo, ctx in regras:
    if any('print' in x or 'keyframes' in x for x in ctx): continue
    for d in corpo.split(';'):
        if ':' not in d: continue
        pr, vl = d.split(':', 1)
        for sl in cab.split(','):
            ultimo[(sl.strip(), pr.strip())] = vl.replace('!important', '').strip()
saida, vistos = [], set()
PULA = ('.tab-btn', '.tab-navigation', '.app-header', '.header-nav', '.badge-counter')
for cab, corpo, ctx in regras:
    if any('print' in x or 'keyframes' in x or 'font-face' in x for x in ctx): continue
    if 'data-tema' in cab or cab.startswith(':root') or cab.startswith('html'): continue
    decl = [d.strip() for d in corpo.split(';') if ':' in d]
    novos = []
    for d in decl:
        prop, val = d.split(':', 1); prop = prop.strip(); val = val.strip()
        imp = ' !important' if '!important' in val else ''
        v = val.replace('!important', '').strip()
        if any(ultimo.get((sx.strip(), prop)) != v for sx in cab.split(',')): continue
        if prop in ('background', 'background-color'):
            m = HEX.fullmatch(v)
            if m:
                r, g, bl = cor(v)
                if lum(r, g, bl) > 215: novos.append(f'background: {FUNDO[tom(r, g, bl)]}{imp}')
            elif 'gradient(' in v:
                def tg(mm):
                    r, g, bl = cor(mm.group(0))
                    return FUNDO_HEX[tom(r, g, bl)] if lum(r, g, bl) > 215 else mm.group(0)
                v2 = HEX.sub(tg, v)
                if v2 != v: novos.append(f'background: {v2}{imp}')
        elif prop == 'color':
            m = HEX.fullmatch(v)
            if m:
                r, g, bl = cor(v)
                if lum(r, g, bl) < 125:
                    t = tom(r, g, bl, True)
                    if t == 'n':
                        novos.append(f'color: {"var(--text-main)" if lum(r, g, bl) < 70 else "var(--text-secondary)"}{imp}')
                    else: novos.append(f'color: {TEXTO[t]}{imp}')
        elif prop.startswith('border') and prop != 'border-left':
            def troca(mm):
                r, g, bl = cor(mm.group(0))
                return BORDA[tom(r, g, bl)] if lum(r, g, bl) > 190 else mm.group(0)
            v2 = HEX.sub(troca, v)
            if v2 != v: novos.append(f'{prop}: {v2}{imp}')
    if not novos: continue
    sels = [s.strip() for s in cab.split(',')]
    if any(any(p in s for p in PULA) for s in sels): continue
    pref = ',\n'.join('html[data-tema="escuro"] ' + s for s in sels)
    chave = pref + '|' + ';'.join(novos)
    if chave in vistos: continue
    vistos.add(chave)
    saida.append(f'{pref} {{ {"; ".join(novos)}; }}')
bloco = INI + '\n/* gerado por tools/gerar_escuro.py: não editar à mão */\n' + '\n'.join(saida) + '\n' + FIM + '\n'
marca = '/* Modo Escuro: superfícies que tinham branco fixo */'
k = src.find(marca)
if k < 0: sys.exit('marca não encontrada')
src = src[:k] + bloco + '\n' + src[k:]
open(P, 'w', encoding='utf-8').write(src)
print(len(saida), 'regras geradas')
