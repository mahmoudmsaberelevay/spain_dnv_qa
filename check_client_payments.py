"""
Check Notion income records for clients 26025, 26024, 26023, 25098
and compare with what's stored in the DB.
Also compute total paid in EGP and EUR for all clients.
"""
import os, re, pymysql, json, urllib.request
from datetime import datetime

TOKEN = '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'
INCOME_DB_ID = 'cb77cb92b5e44c9aa9c08ca42accb8c6'
CLIENT_DB_ID = '031460429dd840c88e5e0cc20278d4ce'
EUR_RATE = 55.5  # 1 EUR = 55.5 EGP

HEADERS = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}

TARGET_CODES = {'26025', '26024', '26023', '25098'}

def normalize_code(s):
    digits = re.sub(r'\D', '', str(s))
    return str(int(digits)) if digits else None

def notion_post(url, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=HEADERS, method='POST')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def fetch_all(db_id, filter_body=None):
    records = []
    cursor = None
    while True:
        body = {'page_size': 100}
        if cursor:
            body['start_cursor'] = cursor
        if filter_body:
            body['filter'] = filter_body
        data = notion_post(f'https://api.notion.com/v1/databases/{db_id}/query', body)
        records.extend(data.get('results', []))
        if not data.get('has_more'):
            break
        cursor = data.get('next_cursor')
    return records

# ── DB Connection ─────────────────────────────────────────────────────────────
db_url = os.environ['DATABASE_URL']
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', db_url)
user, password, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=password,
                       database=dbname, ssl={'ssl': True})
cur = conn.cursor()

# ── Fetch all Notion income records ──────────────────────────────────────────
print("Fetching all Notion income records...")
all_income = fetch_all(INCOME_DB_ID)
print(f"Total income records: {len(all_income)}")

# Build map: client_page_id -> list of income records
client_income_map = {}
for rec in all_income:
    props = rec.get('properties', {})
    client_rel = props.get('Client Name', {})
    if client_rel.get('type') == 'relation':
        for rel in client_rel.get('relation', []):
            cid = rel.get('id')
            if cid:
                if cid not in client_income_map:
                    client_income_map[cid] = []
                client_income_map[cid].append(rec)

print(f"Clients with income records in Notion: {len(client_income_map)}")

# ── Fetch all Notion client records ──────────────────────────────────────────
print("\nFetching all Notion client records...")
all_clients = fetch_all(CLIENT_DB_ID)
print(f"Total client records: {len(all_clients)}")

# Build map: code -> {page_id, name}
code_to_client = {}
for rec in all_clients:
    props = rec.get('properties', {})
    name_prop = props.get('Name', {})
    if name_prop.get('type') == 'title':
        name = ''.join(t.get('plain_text', '') for t in name_prop.get('title', []))
    else:
        name = ''
    code_match = re.search(r'\(\s*(\d{5,6})\s*\)', name)
    if code_match:
        code = normalize_code(code_match.group(1))
        code_to_client[code] = {'page_id': rec['id'], 'name': name}

print(f"Clients with codes in Notion: {len(code_to_client)}")

# ── Check the 4 target clients ────────────────────────────────────────────────
print("\n" + "="*70)
print("TARGET CLIENTS — INCOME BREAKDOWN")
print("="*70)

for code in sorted(TARGET_CODES):
    info = code_to_client.get(code)
    if not info:
        print(f"\nCode {code}: NOT FOUND in Notion client DB")
        continue
    
    page_id = info['page_id']
    income_recs = client_income_map.get(page_id, [])
    
    print(f"\nClient {code} — {info['name'][:60]}")
    print(f"  Notion page ID: {page_id}")
    print(f"  Income records in Notion: {len(income_recs)}")
    
    total_egp = 0.0
    for rec in income_recs:
        props = rec.get('properties', {})
        amount = float((props.get('Amount', {}) or {}).get('number') or 0)
        date_prop = props.get('Date of Income', {})
        date_val = ''
        if date_prop.get('type') == 'date' and date_prop.get('date'):
            date_val = date_prop['date'].get('start', '')
        desc_prop = props.get('Income Source', {}) or props.get('Note', {})
        if desc_prop.get('type') == 'title':
            desc = ''.join(t.get('plain_text', '') for t in desc_prop.get('title', []))
        elif desc_prop.get('type') == 'rich_text':
            desc = ''.join(t.get('plain_text', '') for t in desc_prop.get('rich_text', []))
        else:
            desc = ''
        total_egp += amount
        print(f"    {date_val} | EGP {amount:>12,.2f} | {desc[:50]}")
    
    total_eur = total_egp / EUR_RATE
    print(f"  ─────────────────────────────────────────")
    print(f"  TOTAL PAID (EGP): {total_egp:>12,.2f}")
    print(f"  TOTAL PAID (EUR): {total_eur:>12,.2f}  (÷ {EUR_RATE})")

# ── Check DB values for these clients ────────────────────────────────────────
print("\n" + "="*70)
print("CURRENT DB VALUES FOR TARGET CLIENTS")
print("="*70)
codes_sql = "','".join(TARGET_CODES)
cur.execute(f"""
    SELECT clientCode, name, paidAmountEur, contractValueEur, remainingAmountEur
    FROM finClients
    WHERE clientCode IN ('{codes_sql}')
    ORDER BY clientCode
""")
rows = cur.fetchall()
if rows:
    for row in rows:
        print(f"  Code {row[0]}: {str(row[1])[:40]}")
        print(f"    paidAmountEur={row[2]}  contractEur={row[3]}  remainingEur={row[4]}")
else:
    print("  No matching clients found in DB!")
    # Try to find them with different code format
    for code in TARGET_CODES:
        cur.execute("SELECT id, clientCode, name FROM finClients WHERE clientCode LIKE %s LIMIT 3", (f"%{code}%",))
        rows2 = cur.fetchall()
        if rows2:
            print(f"  Found similar for {code}: {rows2}")

conn.close()
print("\nDone.")
