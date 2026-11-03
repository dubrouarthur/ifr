"""One-off migration: map hard-coded colours in src/styles.css to semantic design tokens.

Shell rules (app chrome: top bar, windows, Flight Center, wizard, drawers, menus) get --sh-free tokens
(--bg, --surface, --line, --text, ...). Cockpit rules (bezels, knobs, MCP, pedestal, overlays on the
outside view) are pinned to fixed --ck-* avionics tokens so the light shell never leaks into the panel.
"""
import re, sys

COCKPIT = re.compile(r'bezel|\.panel|pknob|knob|bkey|\.mcp|softrow|\.screen|\.otw|coach|sitbar|glare|look-hint|pause-veil|replay|\.rp-|\.ped|pedestal|\.footer|lever|trim|flap|stick|rudder|joy|brake|ap-col|explain|toast|\.cockpit|theme-|\.ctl|mode-box|\.xw|vis-otw|brand-mark|tour')

def lum(r, g, b):
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

def parse_hex(h):
    h = h.lstrip('#')
    if len(h) == 3: h = ''.join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

ACCENTS = {(0, 228, 255), (34, 211, 238), (14, 165, 196), (17, 166, 192), (10, 127, 149), (22, 183, 211), (11, 142, 166), (15, 182, 211), (47, 220, 243), (56, 225, 247), (74, 227, 246), (18, 180, 212), (143, 243, 255)}

def shell_color(prop, r, g, b, a=None):
    L = lum(r, g, b)
    sat = max(r, g, b) - min(r, g, b)
    if (r, g, b) in ACCENTS or (sat > 120 and b > 150 and g > 150 and r < 80):
        return f'rgb(var(--accent-rgb) / {a})' if a is not None else 'var(--accent)'
    if sat > 70:  # semantic colours (red/green/amber/magenta): keep
        return None
    is_bg = prop.startswith('background') or prop in ('fill',)
    is_border = prop.startswith('border') or prop.startswith('outline') or prop == 'stroke'
    if a is not None:
        if r > 200 and g > 200 and b > 200:  # white overlays on dark → ink overlays on light
            return f'rgb(var(--ink-rgb) / {round(min(0.12, a * 0.45), 3)})'
        return None
    if is_border:
        return 'var(--line-strong)' if L > 0.2 else 'var(--line)'
    if is_bg:
        if L < 0.045: return 'var(--surface-2)'
        if L < 0.085: return 'var(--surface)'
        if L < 0.16: return 'var(--surface-3)'
        if L < 0.3: return 'var(--line)'
        if L > 0.85: return 'var(--surface)'
        return None
    if prop == 'color':
        if L > 0.8: return 'var(--text)'
        if L > 0.45: return 'var(--text-2)'
        if L > 0.25: return 'var(--muted)'
        return 'var(--text)'
    return None

COLOR_RE = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)')
VAR_MAP_CK = {'--bg': '--ck-bg', '--bg2': '--ck-bg2', '--bg3': '--ck-bg3', '--line': '--ck-line', '--line-hi': '--ck-line-hi', '--text': '--ck-text', '--muted': '--ck-muted', '--accent': '--ck-accent', '--surface': '--ck-bg2', '--surface-hi': '--ck-bg3', '--good': '--ck-good', '--warn': '--ck-warn', '--bad': '--ck-bad'}

def fix_decls(decls, cockpit):
    out = []
    for d in decls.split(';'):
        if ':' not in d:
            out.append(d); continue
        prop, val = d.split(':', 1)
        p = prop.strip().lower()
        if p.startswith('--'):
            out.append(d); continue
        if cockpit:
            val = re.sub(r'var\((--[a-z0-9-]+)', lambda m: f'var({VAR_MAP_CK.get(m.group(1), m.group(1))}', val)
        else:
            def rep(m):
                s = m.group(0)
                if s.startswith('#'):
                    r, g, b = parse_hex(s); a = None
                else:
                    r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3)); a = float(m.group(4)) if m.group(4) else None
                    if a is not None and r == g == b == 0:  # shadows: soften
                        return f'rgba(15, 23, 32, {round(min(a, 0.5) * 0.35, 3)})'
                prop_eff = p
                if p == 'background' and ('gradient' in val):
                    prop_eff = 'background'
                if p in ('box-shadow', 'text-shadow'):
                    return s
                c = shell_color(prop_eff, r, g, b, a)
                return c if c else s
            val = COLOR_RE.sub(rep, val)
        out.append(f'{prop}:{val}')
    return ';'.join(out)

def walk(css):
    i, res = 0, []
    while i < len(css):
        j = css.find('{', i)
        if j < 0:
            res.append(css[i:]); break
        sel = css[i:j]
        # find matching brace
        depth, k = 1, j + 1
        while depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        s = sel.strip()
        if s.startswith('@media') or s.startswith('@supports'):
            res.append(sel + '{' + walk(body) + '}')
        elif s.startswith('@keyframes') or s.startswith(':root') or s.startswith('@'):
            res.append(sel + '{' + body + '}')
        else:
            cockpit = bool(COCKPIT.search(s)) and not s.startswith('.modal') and '.drawer' not in s
            res.append(sel + '{' + fix_decls(body, cockpit) + '}')
        i = k
    return ''.join(res)

src = open(sys.argv[1]).read()
open(sys.argv[2], 'w').write(walk(src))
