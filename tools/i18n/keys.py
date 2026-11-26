import re, glob, json, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'web', 'src'))
S = os.path.dirname(os.path.abspath(__file__)) + os.sep
keys = set()
pat1 = re.compile(r"\b(?:t|tr|tt)\(\s*'((?:[^'\\]|\\.)*)'")
for f in glob.glob('**/*.ts*', recursive=True):
    s = open(f, encoding='utf8').read()
    for m in pat1.finditer(s): keys.add(m.group(1).replace("\\'", "'"))
keys |= {'New', 'On curve', 'Graduated', 'All', 'Launches & curves', 'Big buys', 'Following', 'Refund the payment', 'Keep it', 'Split 50/50', 'In escrow', 'Settled', 'Refunded', 'Live', 'Ranks', 'Me', 'NEW', '🔥 Hot', 'Near grad', '🐋 Whales', '🐬 Dolphins', 'Mail', 'Portfolio', 'Alerts', 'Launches & Curves', 'Docs', 'Radar', 'You cancelled the request in your wallet.', 'Your wallet already has a request waiting. Open it to approve or reject it.', 'Your wallet did not answer. Open it, approve or reject the request, and try again.', 'No wallet found in this browser. Install MetaMask, or open Orbit inside your wallet app.', 'The wallet returned an error.', 'Sniper', 'Bot', 'Creator', 'Whale', 'Diamond hands', 'MetaMask has not authorized this account for Orbit. Open MetaMask, pick the account you want and connect it to this site, then try again.'}
keys = sorted(keys)
json.dump(keys, open(S + 'keys.json', 'w', encoding='utf8'), ensure_ascii=False, indent=0)
es = json.load(open(S + 'es_mail.json', encoding='utf8'))
missing = [k for k in keys if k not in es]
print(len(keys), len(missing))
open(S + 'missing.txt', 'w', encoding='utf8').write('\n'.join(missing))
