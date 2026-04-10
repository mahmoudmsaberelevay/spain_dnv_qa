import os, re, pymysql, json, urllib.request
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
TOKEN = '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'
DB_ID = 'cb77cb92b5e44c9aa9c08ca42accb8c6'
NOTION_HEADERS = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}
START_DATE = '2026-01-01'
DEFAULT_ACCOUNT = 'Cash EGP'

# ── DB Connection ─────────────────────────────────────────────────────────────
db_url = os.environ['DATABASE_URL']
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', db_url)
user, password, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=password,
                       database=dbname, ssl={'ssl': True})
cur = conn.cursor()

# ── Load reference data ───────────────────────────────────────────────────────
cur.execute("SELECT id, name FROM finAccounts")
accounts = {r[1].lower(): r[0] for r in cur.fetchall()}
accounts_by_id = {v: k for k, v in accounts.items()}

cur.execute("SELECT id, name, type FROM finCategories")
categories = {}
for r in cur.fetchall():
    categories[r[1].lower()] = (r[0], r[2])

cur.execute("SELECT id, clientCode FROM finClients WHERE clientCode IS NOT NULL AND clientCode != ''")
clients_by_code = {r[1].strip().lower(): r[0] for r in cur.fetchall()}

# Load existing transactions to detect duplicates (by description + date + amount)
cur.execute("SELECT description, transactionDate, amount FROM finTransactions WHERE type='income'")
existing = set()
for r in cur.fetchall():
    date_str = r[1].strftime('%Y-%m-%d') if hasattr(r[1], 'strftime') else str(r[1])[:10]
    existing.add((str(r[0]).strip().lower(), date_str, float(r[2])))

print(f"Loaded {len(existing)} existing income transactions for duplicate check")
print(f"Loaded {len(clients_by_code)} client codes")
print(f"Loaded {len(accounts)} accounts")

# ── Account detection rules ───────────────────────────────────────────────────
ACCOUNT_KEYWORDS = [
    # More specific first
    ('arab african egp', 'arab african egp'),
    ('arab african usd', 'arab african usd'),
    ('arab african euro', 'arab euro'),
    ('arab african eur', 'arab euro'),
    ('arab egp', 'arab african egp'),
    ('arab usd', 'arab african usd'),
    ('arab euro', 'arab euro'),
    ('arab eur', 'arab euro'),
    ('cib egp', 'cib egp'),
    ('cib usd', 'cib usd'),
    ('cib euro', 'cib euro'),
    ('cib eur', 'cib euro'),
    ('aib egp', 'aib egp'),
    ('aib usd', 'aib usd'),
    ('aib euro', 'aib euro'),
    ('aib eur', 'aib euro'),
    ('cash egp', 'cash egp'),
    ('cash usd', 'cash usd'),
    ('cash euro', 'cash euro'),
    ('cash eur', 'cash euro'),
    ('cash aed', 'cash aed'),
    ('masr egp', 'masr egp'),
    ('masr usd', 'masr usd'),
    ('petty cash', 'petty cash'),
    ('imprest', 'imprest account'),
    ('z. usd', 'z. usd bank'),
    ('ziad usd', 'z. usd bank'),
    ('salaries credit', 'salaries credit'),
    ('commission credit', 'commission credit'),
    ('rent credit', 'rent credit'),
]

# ── Category detection rules ──────────────────────────────────────────────────
CATEGORY_KEYWORDS = [
    ('facebook ads', 'facebook ads'),
    ('google ads', 'google ads'),
    ('currency exchange', 'currency exchange'),
    ('exchange', 'currency exchange'),
    ('from egp to', 'currency exchange'),
    ('from cash egp to cash', 'currency exchange'),
    ('gov commission', 'gov commission'),
    ('government commission', 'gov commission'),
    ('real estate commission', 'real estate commission'),
    ('leader commission', 'commissions'),
    ('commission', 'commissions'),
    ('refund', 'refund from expenses'),
    ('bank fees', 'bank fees'),
    ('salary', 'salaries'),
    ('salaries', 'salaries'),
]

def detect_account(text):
    """Detect account from description text."""
    t = text.lower()
    for keyword, acc_name in ACCOUNT_KEYWORDS:
        if keyword in t:
            acc_id = accounts.get(acc_name)
            if acc_id:
                return acc_id
    # Default
    return accounts.get(DEFAULT_ACCOUNT.lower())

def detect_category(text):
    """Detect category from description text."""
    t = text.lower()
    for keyword, cat_name in CATEGORY_KEYWORDS:
        if keyword in t:
            cat = categories.get(cat_name)
            if cat:
                return cat[0]
    # Check if it looks like a client payment (has a client code pattern)
    if re.search(r'\(\d{5,6}\)', text):
        return categories.get('sales', (None,))[0]
    return categories.get('sales', (None,))[0]  # Default to Sales

def detect_client(text):
    """Extract client code from description like (250177)."""
    # Try 6-digit code first
    m6 = re.search(r'\((\d{6})\)', text)
    if m6:
        code = m6.group(1)
        # Normalize: 260018 -> 26018
        if code.startswith('260') and len(code) == 6:
            code = '26' + code[3:]
        cid = clients_by_code.get(code.lower())
        if cid:
            return cid
    # Try 5-digit code
    m5 = re.search(r'\((\d{5})\)', text)
    if m5:
        code = m5.group(1)
        cid = clients_by_code.get(code.lower())
        if cid:
            return cid
    return None

# ── Fetch all 2026+ records from Notion ──────────────────────────────────────
print(f"\nFetching records from Notion (from {START_DATE})...")
all_records = []
cursor = None
while True:
    payload = {
        'page_size': 100,
        'filter': {
            'property': 'Date of Income',
            'date': {'on_or_after': START_DATE}
        },
        'sorts': [{'property': 'Date of Income', 'direction': 'ascending'}]
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

print(f"Total records fetched: {len(all_records)}")

# ── Import ────────────────────────────────────────────────────────────────────
imported = 0
skipped_dup = 0
skipped_no_amount = 0
unmatched_accounts = []
client_updates = 0

for page in all_records:
    props = page['properties']

    # Extract fields
    source = ''.join(t['plain_text'] for t in props['Income Source']['title']).strip()
    note = ''.join(t['plain_text'] for t in props['Note']['rich_text']).strip()
    amount_raw = props['Amount']['number']
    date_raw = props['Date of Income']['date']

    if amount_raw is None or amount_raw <= 0:
        skipped_no_amount += 1
        continue

    amount = float(amount_raw)

    if date_raw is None:
        tx_date = datetime.now()
        date_str = tx_date.strftime('%Y-%m-%d')
    else:
        date_str = date_raw['start'][:10]
        tx_date = datetime.strptime(date_str, '%Y-%m-%d')

    # Use note as description if source is same as note, else combine
    description = source if source else note
    if not description:
        description = 'Income'

    # Duplicate check
    dup_key = (description.strip().lower(), date_str, amount)
    if dup_key in existing:
        skipped_dup += 1
        continue

    # Detect account, category, client
    search_text = f"{source} {note}"
    acc_id = detect_account(search_text)
    cat_id = detect_category(search_text)
    client_id = detect_client(search_text)

    if not acc_id:
        unmatched_accounts.append(description[:60])
        acc_id = accounts.get(DEFAULT_ACCOUNT.lower())

    # Get current account balance
    cur.execute("SELECT balance FROM finAccounts WHERE id = %s", (acc_id,))
    row = cur.fetchone()
    balance_before = float(row[0]) if row else 0.0
    balance_after = balance_before + amount

    # Insert transaction
    cur.execute("""
        INSERT INTO finTransactions
          (type, description, accountId, categoryId, finClientId, amount, note,
           transactionDate, balanceBefore, balanceAfter)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        'income', description, acc_id, cat_id, client_id,
        amount, note if note != source else None,
        tx_date, balance_before, balance_after
    ))

    # Update account balance
    cur.execute("UPDATE finAccounts SET balance = %s WHERE id = %s", (balance_after, acc_id))

    # Update client remaining balance if linked
    if client_id:
        eur_paid = amount / 55.5
        cur.execute("""
            UPDATE finClients
            SET paidAmountEur = paidAmountEur + %s,
                remainingAmountEur = remainingAmountEur - %s
            WHERE id = %s
        """, (eur_paid, eur_paid, client_id))
        client_updates += 1

    # Add to existing set to prevent re-importing within this run
    existing.add(dup_key)
    imported += 1

    if imported % 20 == 0:
        conn.commit()
        print(f"  ... {imported} imported so far")

conn.commit()
print(f"\n=== Import Complete ===")
print(f"Imported: {imported}")
print(f"Skipped (duplicates): {skipped_dup}")
print(f"Skipped (no amount): {skipped_no_amount}")
print(f"Client balances updated: {client_updates}")

if unmatched_accounts:
    print(f"\nRecords defaulted to Cash EGP (no account detected in description):")
    for u in unmatched_accounts[:20]:
        print(f"  - {u}")

conn.close()
