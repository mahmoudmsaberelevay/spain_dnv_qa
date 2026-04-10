"""
This script:
1. Fetches all Notion expense records and their 'Clients Related' relation IDs
2. Fetches all Notion income records and their 'Client Name' relation IDs
3. Resolves each Notion client page ID to the Elevay finClient ID (via notionId column)
4. Updates finTransactions.finClientId for all matched records
"""

import requests
import pymysql
import re
import os
import sys

TOKEN = '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'
EXPENSES_DB_ID = '70444d8165034587aebe4bee3a653d23'
INCOME_DB_ID = 'cb77cb92b5e44c9aa9c08ca42accb8c6'

DB_URL = os.environ.get('DATABASE_URL', '')
if not DB_URL:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)

m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', DB_URL)
if not m:
    print(f"ERROR: Could not parse DATABASE_URL: {DB_URL[:50]}")
    sys.exit(1)

user, pwd, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=pwd, database=dbname, charset='utf8mb4', ssl={'ssl': True})
cur = conn.cursor()

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}

# ─── Step 1: Check if notionId column exists in finClients ───────────────────
cur.execute("SHOW COLUMNS FROM finClients LIKE 'notionId'")
has_notion_id = cur.fetchone() is not None
print(f"finClients has notionId column: {has_notion_id}")

# ─── Step 2: Get all finClients from DB ──────────────────────────────────────
if has_notion_id:
    cur.execute("SELECT id, name, notionId FROM finClients")
    db_clients = cur.fetchall()
    # Build map: notionId -> elevay client id
    notion_to_elevay = {}
    for row in db_clients:
        elevay_id, name, notion_id = row
        if notion_id:
            # notion_id may be stored with or without dashes
            clean = notion_id.replace('-', '')
            notion_to_elevay[clean] = elevay_id
            notion_to_elevay[notion_id] = elevay_id
    print(f"Loaded {len(db_clients)} clients, {len(notion_to_elevay)//2} with notionId")
else:
    # No notionId column — we need to match by name
    cur.execute("SELECT id, name FROM finClients")
    db_clients = cur.fetchall()
    notion_to_elevay = {}
    print(f"No notionId column. Will try to match by name. {len(db_clients)} clients in DB.")

# ─── Step 3: Get all finTransactions with their notionId ─────────────────────
cur.execute("SHOW COLUMNS FROM finTransactions LIKE 'notionId'")
has_tx_notion_id = cur.fetchone() is not None
print(f"finTransactions has notionId column: {has_tx_notion_id}")

if not has_tx_notion_id:
    print("ERROR: finTransactions does not have notionId column. Cannot match records.")
    sys.exit(1)

cur.execute("SELECT id, notionId, type, finClientId FROM finTransactions WHERE notionId IS NOT NULL AND type IN ('expense','income')")
tx_rows = cur.fetchall()
print(f"Found {len(tx_rows)} expense/income transactions with notionId")

# Build map: notionId -> tx row
tx_map = {}
for row in tx_rows:
    tx_id, notion_id, tx_type, client_id = row
    if notion_id:
        tx_map[notion_id] = (tx_id, tx_type, client_id)

print(f"Transactions map size: {len(tx_map)}")

# ─── Step 4: Fetch all Notion expense records with client relations ───────────
def fetch_all_pages(db_id, filter_body=None):
    results = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if filter_body:
            body["filter"] = filter_body
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

print("\nFetching all Notion expense records...")
expense_pages = fetch_all_pages(EXPENSES_DB_ID)
print(f"  Got {len(expense_pages)} expense records")

print("Fetching all Notion income records...")
income_pages = fetch_all_pages(INCOME_DB_ID)
print(f"  Got {len(income_pages)} income records")

# ─── Step 5: Resolve Notion client page IDs ──────────────────────────────────
def get_client_notion_ids(pages, client_field_name):
    """Returns dict: notion_page_id -> list of client notion page IDs"""
    result = {}
    for page in pages:
        page_id = page['id'].replace('-', '')
        props = page.get('properties', {})
        client_prop = props.get(client_field_name, {})
        relations = client_prop.get('relation', [])
        if relations:
            result[page_id] = [r['id'].replace('-', '') for r in relations]
    return result

expense_client_map = get_client_notion_ids(expense_pages, 'Clients Related')
income_client_map = get_client_notion_ids(income_pages, 'Client Name')

print(f"\nExpense records with client: {len(expense_client_map)}")
print(f"Income records with client: {len(income_client_map)}")

# ─── Step 6: If no notionId in finClients, resolve client names from Notion ──
if not has_notion_id or not notion_to_elevay:
    print("\nResolving client names from Notion to match DB clients...")
    # Get all unique client notion IDs
    all_client_notion_ids = set()
    for ids in expense_client_map.values():
        all_client_notion_ids.update(ids)
    for ids in income_client_map.values():
        all_client_notion_ids.update(ids)
    
    # Fetch each client page to get its name
    name_to_elevay = {name.lower(): eid for eid, name in db_clients}
    notion_client_id_to_elevay = {}
    
    print(f"  Resolving {len(all_client_notion_ids)} unique client notion IDs...")
    for cid in all_client_notion_ids:
        r = requests.get(f'https://api.notion.com/v1/pages/{cid}', headers=headers)
        if r.status_code != 200:
            continue
        page = r.json()
        props = page.get('properties', {})
        # Try common title fields
        for field in ['Name', 'Client Name', 'Full Name', 'title']:
            if field in props:
                title_prop = props[field]
                if title_prop.get('type') == 'title':
                    name = ''.join(t.get('plain_text','') for t in title_prop.get('title', []))
                    if name:
                        # Try to match to DB client
                        elevay_id = name_to_elevay.get(name.lower())
                        if elevay_id:
                            notion_client_id_to_elevay[cid] = elevay_id
                            print(f"    Matched: {name} -> {elevay_id}")
                        else:
                            print(f"    No match for: {name}")
                        break
    notion_to_elevay = notion_client_id_to_elevay

# ─── Step 7: Update transactions ─────────────────────────────────────────────
updated = 0
skipped_no_match = 0
skipped_already_set = 0

print("\nUpdating expense transactions...")
for notion_page_id, client_notion_ids in expense_client_map.items():
    if notion_page_id not in tx_map:
        continue
    tx_id, tx_type, current_client_id = tx_map[notion_page_id]
    
    # Get first matched client
    elevay_client_id = None
    for cid in client_notion_ids:
        if cid in notion_to_elevay:
            elevay_client_id = notion_to_elevay[cid]
            break
    
    if not elevay_client_id:
        skipped_no_match += 1
        continue
    
    if current_client_id == elevay_client_id:
        skipped_already_set += 1
        continue
    
    cur.execute("UPDATE finTransactions SET finClientId = %s WHERE id = %s", (elevay_client_id, tx_id))
    updated += 1

print("Updating income transactions...")
for notion_page_id, client_notion_ids in income_client_map.items():
    if notion_page_id not in tx_map:
        continue
    tx_id, tx_type, current_client_id = tx_map[notion_page_id]
    
    elevay_client_id = None
    for cid in client_notion_ids:
        if cid in notion_to_elevay:
            elevay_client_id = notion_to_elevay[cid]
            break
    
    if not elevay_client_id:
        skipped_no_match += 1
        continue
    
    if current_client_id == elevay_client_id:
        skipped_already_set += 1
        continue
    
    cur.execute("UPDATE finTransactions SET finClientId = %s WHERE id = %s", (elevay_client_id, tx_id))
    updated += 1

conn.commit()
conn.close()

print(f"\n=== DONE ===")
print(f"  Updated: {updated} transactions")
print(f"  Skipped (already set): {skipped_already_set}")
print(f"  Skipped (no client match): {skipped_no_match}")
