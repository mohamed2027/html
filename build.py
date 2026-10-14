#!/usr/bin/env python3
"""Assemble the single-file application.

    python3 build.py                       -> dist/hotel-warehouse.html
    python3 build.py --pubkey <BASE64>     -> also embeds the licence PUBLIC key from tools/license-keygen.html

The output is one self-contained HTML file (no external scripts). Upload it to 4shared,
Google Drive, GitHub Pages, Cloudflare Pages, etc.
"""
import argparse
import glob
import os
import re
import sys
import base64

ROOT = os.path.dirname(os.path.abspath(__file__))

ap = argparse.ArgumentParser(description='Build the hotel warehouse single-file app')
ap.add_argument('--pubkey', help='Ed25519 public key (base64, 32 bytes) from the key generator')
ap.add_argument('--keyfile', help='key JSON downloaded from the generator; only its publicKey is read')
ap.add_argument('--out', default=os.path.join(ROOT, 'dist', 'hotel-warehouse.html'))
args = ap.parse_args()

def read(path):
    with open(path, encoding='utf-8') as fh:
        return fh.read()

css = '\n'.join(read(os.path.join(ROOT, 'src', f)) for f in ['style.css', 'dashboard.css'])
js_files = sorted(glob.glob(os.path.join(ROOT, 'src', 'js', '*.js')))
js = '\n'.join(read(f) for f in js_files)

if args.keyfile and not args.pubkey:
    import json
    with open(args.keyfile, encoding='utf-8') as fh:
        args.pubkey = json.load(fh)['publicKey']

if args.pubkey:
    raw = base64.b64decode(args.pubkey, validate=True)
    if len(raw) != 32:
        sys.exit('public key must be 32 bytes (Ed25519)')
    js, n = re.subn(r"licensePublicKey: '[^']*'", "licensePublicKey: '%s'" % args.pubkey, js)
    if n != 1:
        sys.exit('could not find the licensePublicKey placeholder in src/js/00-config.js')

shell = read(os.path.join(ROOT, 'src', 'shell.html'))
html = shell.replace('/*__CSS__*/', css).replace('/*__JS__*/', js)
if '/*__JS__*/' in html or '/*__CSS__*/' in html:
    sys.exit('template placeholders were not replaced')

os.makedirs(os.path.dirname(args.out), exist_ok=True)
with open(args.out, 'w', encoding='utf-8') as fh:
    fh.write(html)

size_kb = os.path.getsize(args.out) / 1024
print('built %s (%.0f KB) from %d JS modules' % (args.out, size_kb, len(js_files)))
if not args.pubkey:
    print('note: licence public key is still the placeholder; run again with --pubkey before selling')
