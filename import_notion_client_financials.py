"""
Imports contractValueEur, paidAmountEur, remainingAmountEur from Notion client database
into finClients table, matching by client code extracted from the Name field.

Notion Name format: "Client Full Name (260001)" or "Client Full Name ( 260001 )"
"""
import requests
import pymysql
import re
import os
import sys

TOKEN = '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'
CLIENT_DB_ID = '031460429dd840c88e5e0cc20278d4ce'
EGP_TO_EUR_RATE = 55.5

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

# ─── Load all finClients from DB ─────────────────────────────────────────────
cur.execute("SELECT id, clientCode, name, contractValueEur, paidAmountEur, remainingAmountEur FROM finClients")
db_clients = cur.fetchall()
# Build lookup by clientCode (normalized: strip spaces, strip leading zeros, uppercase)
code_to_client = {}
for row in db_clients:
    cid, code, name, cv, paid, rem = row
    if code:
        # Normalize: remove spaces, strip leading zeros for numeric part
        normalized = re.sub(r'\s+', '', code).upper()
        code_to_client[normalized] = (cid, name, cv, paid, rem)
        # Also store with leading zeros stripped (e.g. 26026 -> 26026, 260026 -> 26026)
        numeric = re.sub(r'^0+', '', re.sub(r'\s+', '', code))
        if numeric != normalized:
            code_to_client[numeric] = (cid, name, cv, paid, rem)
print(f"Loaded {len(db_clients)} clients from DB, {len(code_to_client)} with codes")

# ─── Fetch all Notion client records ─────────────────────────────────────────
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

# ─── Process each Notion record ───────────────────────────────────────────────
updated = 0
not_found = 0
no_code = 0
skipped_same = 0

not_found_list = []

for page in pages:
    props = page.get('properties', {})

    # Get name (title field)
    name_prop = props.get('Name', {})
    full_name = ''.join(t.get('plain_text','') for t in name_prop.get('title', []))

    # Extract client code from name: look for (260XXX) pattern
    code_match = re.search(r'\(?\s*(2[56]\d{4})\s*\)?', full_name)
    if not code_match:
        no_code += 1
        continue

    client_code = code_match.group(1).strip()
    normalized_code = re.sub(r'\s+', '', client_code).upper()

    # Get financial values from Notion
    contract_value = props.get('Contract Value ', {}).get('number')  # Note trailing space
    if contract_value is None:
        contract_value = props.get('Contract Value', {}).get('number')

    # Get paid (formula result in EUR)
    paid_formula = props.get('Paid', {}).get('formula', {})
    paid_eur = paid_formula.get('number')

    # Get remaining balance (formula result in EUR)
    remaining_formula = props.get('Remaining Balance', {}).get('formula', {})
    remaining_eur = remaining_formula.get('number')

    # Get income in EGP (rollup)
    income_egp_rollup = props.get('Income From IN EGP ', {}).get('rollup', {})
    income_egp = income_egp_rollup.get('number', 0) or 0

    # If paid_eur is None, calculate from EGP income
    if paid_eur is None and income_egp:
        paid_eur = round(income_egp / EGP_TO_EUR_RATE, 2)

    # If remaining is None but contract value exists, calculate
    if remaining_eur is None and contract_value is not None:
        remaining_eur = round(contract_value - (paid_eur or 0), 2)

    # Normalize Notion code: strip spaces
    normalized_code_stripped = re.sub(r'\s+', '', client_code)
    # Also try stripping the extra leading zero: 260026 -> 26026
    # Pattern: 6-digit code starting with 26 -> strip one zero: 260XXX -> 26XXX
    alt_code = re.sub(r'^260(\d{3})$', r'26\1', normalized_code_stripped)

    # Find in DB — try original, stripped, and alt form
    db_entry = (code_to_client.get(normalized_code) or 
                code_to_client.get(normalized_code_stripped) or
                code_to_client.get(alt_code))
    if not db_entry:
        not_found += 1
        not_found_list.append(f"  {client_code}: {full_name[:50]}")
        continue

    db_id_val, db_name, db_cv, db_paid, db_rem = db_entry

    # Check if values are already set and same
    if (db_cv == contract_value and db_paid is not None and db_rem is not None):
        skipped_same += 1
        continue

    # Update
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

conn.commit()
conn.close()

print(f"\n=== DONE ===")
print(f"  Updated: {updated}")
print(f"  Already same: {skipped_same}")
print(f"  No code in name: {no_code}")
print(f"  Code not found in DB: {not_found}")
if not_found_list:
    print("\nNot found in DB:")
    for item in not_found_list[:20]:
        print(item)
    if len(not_found_list) > 20:
        print(f"  ... and {len(not_found_list)-20} more")
