"""
Links clients to transactions by:
1. Fetching all Notion expense/income records with their client relations
2. Resolving each Notion client page ID -> client name -> Elevay finClientId
3. Matching Notion records to DB transactions by (description, date, amount, account)
4. Updating finClientId on matched transactions
"""

import requests
import pymysql
import re
import os
import sys
from datetime import datetime

TOKEN = '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'
EXPENSES_DB_ID = '70444d8165034587aebe4bee3a653d23'
INCOME_DB_ID = 'cb77cb92b5e44c9aa9c08ca42accb8c6'

DB_URL = os.environ.get('DATABASE_URL', '')
if not DB_URL:
    print("ERROR: DATABASE_URL not set"); sys.exit(1)

m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', DB_URL)
if not m:
    print(f"ERROR: Cannot parse DB URL"); sys.exit(1)

user, pwd, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=pwd,
                       database=dbname, charset='utf8mb4', ssl={'ssl': True})
cur = conn.cursor()

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}

# ─── Load DB reference data ───────────────────────────────────────────────────
cur.execute("SELECT id, name FROM finAccounts")
account_name_to_id = {r[1].lower().strip(): r[0] for r in cur.fetchall()}
account_id_to_name = {v: k for k, v in account_name_to_id.items()}

cur.execute("SELECT id, name FROM finClients")
db_clients = cur.fetchall()
client_name_to_id = {r[1].lower().strip(): r[0] for r in db_clients}
print(f"Loaded {len(db_clients)} clients, {len(account_name_to_id)} accounts")

# Load all expense/income transactions into memory for fast matching
cur.execute("""
    SELECT id, type, description, accountId, amount, transactionDate, finClientId
    FROM finTransactions
    WHERE type IN ('income', 'expense')
""")
tx_rows = cur.fetchall()
print(f"Loaded {len(tx_rows)} income/expense transactions from DB")

# Build lookup: (description_lower, date_str, amount_str, account_id) -> tx_id
tx_lookup = {}
for row in tx_rows:
    tx_id, tx_type, desc, acc_id, amount, tx_date, client_id = row
    if tx_date:
        date_str = tx_date.strftime('%Y-%m-%d') if hasattr(tx_date, 'strftime') else str(tx_date)[:10]
    else:
        date_str = ''
    key = (desc.lower().strip(), date_str, str(float(amount)), acc_id)
    tx_lookup[key] = (tx_id, client_id)

# ─── Notion account ID -> Elevay account ID map ───────────────────────────────
# (from the existing import script)
NOTION_ACCOUNT_MAP = {
    '3b40ac3b36714db3a5f4e9d5003c390c': 'cash egp',
    'e9ed10fea f404507b79a2874fdc2c6f2'.replace(' ', ''): 'cash egp',
    'e9ed10feaf404507b79a2874fdc2c6f2': 'cash egp',
    '0f92c6478cdf4f0b9fb69cf61c976374': 'cash usd',
    'd2a1a9777706 4985bcfbd7b6c4132561'.replace(' ', ''): 'cib egp',
    'd2a1a97777064985bcfbd7b6c4132561': 'cib egp',
    '9f3bcf2d13ba402682df3d6585ab6aa7': 'arab african egp',
    '144ca3282df680e48257d3e0c18541c2': 'cash euro',
    '1336260a5ce8455fbb19fee52e38d3ee': 'commission credit',
}

def resolve_account_id(notion_acc_ids):
    for nid in notion_acc_ids:
        clean = nid.replace('-', '')
        name = NOTION_ACCOUNT_MAP.get(clean)
        if name:
            return account_name_to_id.get(name)
    return None

# ─── Fetch all Notion pages ───────────────────────────────────────────────────
def fetch_all(db_id):
    results = []
    cursor = None
    page_num = 0
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
        page_num += 1
        if page_num % 5 == 0:
            print(f"  Fetched {len(results)} records...")
        if not data.get('has_more'):
            break
        cursor = data.get('next_cursor')
    return results

print("\nFetching Notion expense records...")
expense_pages = fetch_all(EXPENSES_DB_ID)
print(f"  Total: {len(expense_pages)}")

print("Fetching Notion income records...")
income_pages = fetch_all(INCOME_DB_ID)
print(f"  Total: {len(income_pages)}")

# ─── Resolve Notion client page IDs -> Elevay client IDs ─────────────────────
# Collect all unique client notion IDs
all_client_notion_ids = set()
for page in expense_pages:
    for rel in page['properties'].get('Clients Related', {}).get('relation', []):
        all_client_notion_ids.add(rel['id'].replace('-', ''))
for page in income_pages:
    for rel in page['properties'].get('Client Name', {}).get('relation', []):
        all_client_notion_ids.add(rel['id'].replace('-', ''))

print(f"\nResolving {len(all_client_notion_ids)} unique Notion client IDs...")
notion_client_to_elevay = {}
for cid in all_client_notion_ids:
    r = requests.get(f'https://api.notion.com/v1/pages/{cid}', headers=headers)
    if r.status_code != 200:
        continue
    page = r.json()
    props = page.get('properties', {})
    # Get the title/name
    name = None
    for field_name in ['Name', 'Client Name', 'Full Name']:
        if field_name in props and props[field_name].get('type') == 'title':
            name = ''.join(t.get('plain_text','') for t in props[field_name].get('title', []))
            break
    if not name:
        # Try any title field
        for field_name, prop in props.items():
            if prop.get('type') == 'title':
                name = ''.join(t.get('plain_text','') for t in prop.get('title', []))
                break
    if name:
        elevay_id = client_name_to_id.get(name.lower().strip())
        if elevay_id:
            notion_client_to_elevay[cid] = elevay_id
            print(f"  ✓ {name} -> {elevay_id}")
        else:
            print(f"  ✗ No match: '{name}'")

print(f"\nResolved {len(notion_client_to_elevay)} / {len(all_client_notion_ids)} client IDs")

# ─── Match Notion records to DB transactions and update ───────────────────────
def get_client_elevay_id(client_notion_ids):
    for cid in client_notion_ids:
        clean = cid.replace('-', '')
        if clean in notion_client_to_elevay:
            return notion_client_to_elevay[clean]
    return None

def process_pages(pages, name_field, client_field, date_field, amount_field, title_field):
    updated = 0
    no_client = 0
    no_match = 0
    already_set = 0

    for page in pages:
        props = page['properties']

        # Get client
        client_ids = [r['id'].replace('-','') for r in props.get(client_field, {}).get('relation', [])]
        if not client_ids:
            no_client += 1
            continue

        elevay_client_id = get_client_elevay_id(client_ids)
        if not elevay_client_id:
            no_client += 1
            continue

        # Get description
        title_prop = props.get(title_field, {})
        desc = ''.join(t.get('plain_text','') for t in title_prop.get('title', []))

        # Get date
        date_prop = props.get(date_field, {}).get('date')
        date_str = date_prop.get('start', '')[:10] if date_prop else ''

        # Get amount
        amount = props.get(amount_field, {}).get('number')
        if amount is None:
            continue

        # Get account
        acc_relations = props.get('Account' if 'Account' in props else 'Accounts', {}).get('relation', [])
        if not acc_relations:
            acc_relations = props.get('Accounts', {}).get('relation', [])
        acc_notion_ids = [r['id'].replace('-','') for r in acc_relations]
        acc_id = resolve_account_id(acc_notion_ids)

        # Try to find in DB
        key = (desc.lower().strip(), date_str, str(float(amount)), acc_id)
        match = tx_lookup.get(key)

        if not match:
            # Try without account
            for k, v in tx_lookup.items():
                if k[0] == desc.lower().strip() and k[1] == date_str and k[2] == str(float(amount)):
                    match = v
                    break

        if not match:
            no_match += 1
            continue

        tx_id, current_client_id = match
        if current_client_id == elevay_client_id:
            already_set += 1
            continue

        cur.execute("UPDATE finTransactions SET finClientId = %s WHERE id = %s",
                    (elevay_client_id, tx_id))
        updated += 1

    return updated, no_client, no_match, already_set

print("\nProcessing expense records...")
u, nc, nm, a = process_pages(expense_pages, 'Name', 'Clients Related', 'Date of Expense', 'Amount', 'Name')
print(f"  Updated: {u} | No client: {nc} | No DB match: {nm} | Already set: {a}")

print("Processing income records...")
u2, nc2, nm2, a2 = process_pages(income_pages, 'Income Source', 'Client Name', 'Date of Income', 'Amount', 'Income Source')
print(f"  Updated: {u2} | No client: {nc2} | No DB match: {nm2} | Already set: {a2}")

conn.commit()
conn.close()

print(f"\n=== DONE ===")
print(f"Total updated: {u + u2} transactions now linked to clients")
