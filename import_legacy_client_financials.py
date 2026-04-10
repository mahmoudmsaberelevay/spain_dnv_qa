"""
Imports contractValueEur, paidAmountEur, remainingAmountEur for legacy clients
(those without a code in their Notion name) by matching on name similarity.
"""
import requests
import pymysql
import re
import os
import sys
from difflib import SequenceMatcher

TOKEN = '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'
CLIENT_DB_ID = '031460429dd840c88e5e0cc20278d4ce'
EGP_TO_EUR_RATE = 55.5
SIMILARITY_THRESHOLD = 0.65  # 65% name match required

DB_URL = os.environ.get('DATABASE_URL', '')
if not DB_URL:
    print("ERROR: DATABASE_URL not set"); sys.exit(1)

m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', DB_URL)
if not m:
    print("ERROR: Cannot parse DB URL"); sys.exit(1)

user, pwd, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=pwd,
                       database=dbname, charset='utf8mb4', ssl={'ssl': True})
cur = conn.cursor()

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}

def normalize_name(name):
    """Lowercase, remove extra spaces, remove parentheses content"""
    name = re.sub(r'\(.*?\)', '', name)  # remove (code) parts
    name = re.sub(r'\s+', ' ', name).strip().lower()
    return name

def similarity(a, b):
    return SequenceMatcher(None, normalize_name(a), normalize_name(b)).ratio()

# ─── Load all finClients from DB ─────────────────────────────────────────────
cur.execute("SELECT id, clientCode, name, contractValueEur, paidAmountEur, remainingAmountEur FROM finClients")
db_clients = cur.fetchall()
print(f"Loaded {len(db_clients)} clients from DB")

# Build lookup by code
code_to_client = {}
for row in db_clients:
    cid, code, name, cv, paid, rem = row
    if code:
        normalized = re.sub(r'\s+', '', code).upper()
        code_to_client[normalized] = (cid, name, cv, paid, rem)
        alt_code = re.sub(r'^260(\d{3})$', r'26\1', normalized)
        if alt_code != normalized:
            code_to_client[alt_code] = (cid, name, cv, paid, rem)

# ─── Fetch all Notion records ─────────────────────────────────────────────────
def fetch_all(db_id):
    results = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        r = requests.post(
            f'https://api.notion.com/v1/databases/{db_id}/query',
            headers=headers, json=body
        )
        data = r.json()
        results.extend(data.get('results', []))
        if not data.get('has_more'):
            break
        cursor = data.get('next_cursor')
    return results

print("Fetching Notion client records...")
pages = fetch_all(CLIENT_DB_ID)
print(f"  Got {len(pages)} records")

# ─── Process only records WITHOUT a code in the name ─────────────────────────
updated = 0
skipped = 0
no_match = 0
low_confidence = []

for page in pages:
    props = page.get('properties', {})
    
    # Get name
    name_prop = props.get('Name', {})
    full_name = ''.join(t.get('plain_text','') for t in name_prop.get('title', []))
    
    # Skip if has a code (already handled)
    code_match = re.search(r'\(?\s*(2[56]\d{4})\s*\)?', full_name)
    if code_match:
        continue
    
    # Get financial values
    contract_value = props.get('Contract Value ', {}).get('number')
    if contract_value is None:
        contract_value = props.get('Contract Value', {}).get('number')
    
    paid_formula = props.get('Paid', {}).get('formula', {})
    paid_eur = paid_formula.get('number')
    
    remaining_formula = props.get('Remaining Balance', {}).get('formula', {})
    remaining_eur = remaining_formula.get('number')
    
    income_egp_rollup = props.get('Income From IN EGP ', {}).get('rollup', {})
    income_egp = income_egp_rollup.get('number', 0) or 0
    
    if paid_eur is None and income_egp:
        paid_eur = round(income_egp / EGP_TO_EUR_RATE, 2)
    if remaining_eur is None and contract_value is not None:
        remaining_eur = round(contract_value - (paid_eur or 0), 2)
    
    if contract_value is None:
        skipped += 1
        continue
    
    # Find best name match in DB
    best_match = None
    best_score = 0
    for row in db_clients:
        cid, code, db_name, cv, paid, rem = row
        score = similarity(full_name, db_name)
        if score > best_score:
            best_score = score
            best_match = row
    
    if best_score < SIMILARITY_THRESHOLD:
        no_match += 1
        low_confidence.append(f"  {full_name[:50]} | best: {best_match[2][:40] if best_match else 'none'} ({best_score:.2f})")
        continue
    
    db_id_val, db_code, db_name, db_cv, db_paid, db_rem = best_match
    
    # Skip if already has values
    if db_cv is not None and db_paid is not None:
        skipped += 1
        continue
    
    cur.execute("""
        UPDATE finClients
        SET contractValueEur = %s,
            paidAmountEur = %s,
            remainingAmountEur = %s
        WHERE id = %s
    """, (
        contract_value,
        round(paid_eur, 2) if paid_eur is not None else None,
        round(remaining_eur, 2) if remaining_eur is not None else None,
        db_id_val
    ))
    updated += 1
    print(f"  Updated: {db_name[:40]} | CV={contract_value} | Paid={paid_eur:.2f if paid_eur else 0} | Rem={remaining_eur:.2f if remaining_eur else 0} | Match: {best_score:.2f}")

conn.commit()
conn.close()

print(f"\n=== DONE ===")
print(f"  Updated: {updated}")
print(f"  Skipped (no contract value or already set): {skipped}")
print(f"  No match found: {no_match}")
if low_confidence:
    print("\nLow confidence / no match:")
    for item in low_confidence[:20]:
        print(item)
