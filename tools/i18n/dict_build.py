import json, sys, os
S = os.path.dirname(os.path.abspath(__file__)) + os.sep
sys.path.insert(0, S)
from dict_a import A
from dict_b import B, MAIL_ZH
from dict_c import C
B.update(C)
keys = json.load(open(S + 'keys.json', encoding='utf8'))
es_mail = json.load(open(S + 'es_mail.json', encoding='utf8'))
AB = {**A, **B}
ZH, ES = {}, {}
for k in keys:
    if k in AB: ZH[k], ES[k] = AB[k]
    elif k in es_mail: ES[k] = es_mail[k]; ZH[k] = MAIL_ZH.get(k)
    if ZH.get(k) is None: ZH.pop(k, None)
# extra keys not caught by the scanner but passed through variables
for k in ['Refund the payment', 'Keep it', 'Split 50/50', 'In escrow', 'Settled', 'Refunded', 'You', 'Creator of $MOTH', 'Holder', 'Message']:
    if k in AB: ZH[k], ES[k] = AB[k]
    elif k in es_mail: ES[k] = es_mail[k]; ZH[k] = MAIL_ZH.get(k, k)
ZH['Creator of $MOTH'] = '$MOTH 的创作者'; ES['Creator of $MOTH'] = 'Creador de $MOTH'; ZH['Holder'] = '持有者'; ES['Holder'] = 'Holder'
missing_zh = [k for k in keys if k not in ZH]
missing_es = [k for k in keys if k not in ES]
print('keys', len(keys), 'zh', len(ZH), 'es', len(ES), 'missing zh', missing_zh, 'missing es', missing_es)
out = '/* Generated translations. Keys are the English source text (see i18n.tsx). */\n'
out += 'export const ZH: Record<string, string> = ' + json.dumps(ZH, ensure_ascii=False, indent=1) + '\n'
out += 'export const ES: Record<string, string> = ' + json.dumps(ES, ensure_ascii=False, indent=1) + '\n'
open(os.path.join(S, '..', '..', 'web', 'src', 'lib', 'i18n.dict.ts'), 'w', encoding='utf8').write(out)
