import os, re, pymysql, json, urllib.request
from datetime import datetime

TOKEN = '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'
DB_ID = '70444d8165034587aebe4bee3a653d23'
NOTION_HEADERS = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}
START_DATE = '2026-01-01'

def strip_notion_links(text):
    """Remove Notion hyperlinks from text, keeping only the display name."""
    text = re.sub(r'\s*\(https?://[^\)]+\)', '', text)
    text = re.sub(r'https?://\S+', '', text)
    return text.strip()

def get_relation_name(rel_list, prop_map):
    """Resolve relation IDs to names using prop_map."""
    names = []
    for r in rel_list:
        pid = r.get('id')
        if pid and pid in prop_map:
            names.append(prop_map[pid])
    return names

# ── Fetch all Notion pages ────────────────────────────────────────────────────
print(f"Fetching all 2026+ expense records from Notion...")
all_records = []
cursor = None
while True:
    payload = {
        'page_size': 100,
        'filter': {
            'property': 'Date of Expense',
            'date': {'on_or_after': START_DATE}
        },
        'sorts': [{'property': 'Date of Expense', 'direction': 'ascending'}]
    }
    if cursor:
        payload['start_cursor'] = cursor

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'https://api.notion.com/v1/databases/{DB_ID}/query',
        data=data, headers=NOTION_HEADERS, method='POST'
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())

    all_records.extend(result['results'])
    if not result['has_more']:
        break
    cursor = result['next_cursor']

print(f"Total Notion expense records fetched: {len(all_records)}")

# ── Compute totals from Notion ────────────────────────────────────────────────
notion_total = 0
notion_no_amount = 0
notion_no_date = 0
account_totals = {}

for page in all_records:
    props = page['properties']
    
    # Get amount
    amount_raw = props.get('Amount', {}).get('number')
    if amount_raw is None or amount_raw <= 0:
        notion_no_amount += 1
        continue
    
    notion_total += float(amount_raw)
    
    # Get account relation name if available
    acc_rel = props.get('Account', {}).get('relation', [])
    acc_name = 'Unknown'
    if acc_rel:
        acc_name = acc_rel[0].get('id', 'Unknown')[:8]  # just use ID prefix for now
    
    account_totals[acc_name] = account_totals.get(acc_name, 0) + float(amount_raw)

print(f"\nNotion total amount (all records with amount): {notion_total:,.2f}")
print(f"Records with no amount: {notion_no_amount}")
print(f"\nAccount distribution (by relation ID prefix):")
for k, v in sorted(account_totals.items(), key=lambda x: -x[1]):
    print(f"  {k}: {v:,.2f}")

# ── Compare with DB ───────────────────────────────────────────────────────────
db_url = os.environ['DATABASE_URL']
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', db_url)
user, password, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=password, database=dbname, ssl={'ssl': True})
cur = conn.cursor()

cur.execute("SELECT COUNT(*), COALESCE(SUM(amount),0) FROM finTransactions WHERE type='expense'")
r = cur.fetchone()
db_count = r[0]
db_total = float(r[1])

print(f"\n=== Comparison ===")
print(f"Notion total:  {notion_total:>14,.2f}  ({len(all_records) - notion_no_amount} records with amount)")
print(f"DB total:      {db_total:>14,.2f}  ({db_count} records)")
print(f"Difference:    {notion_total - db_total:>14,.2f}")

conn.close()
