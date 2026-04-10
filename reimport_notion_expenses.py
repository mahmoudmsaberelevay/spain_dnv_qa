import os, re, pymysql, json, urllib.request
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
TOKEN = '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'
DB_ID = '70444d8165034587aebe4bee3a653d23'
NOTION_HEADERS = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}
START_DATE = '2026-01-01'

def strip_notion_links(text):
    """Remove Notion hyperlinks from text."""
    text = re.sub(r'\s*\(https?://[^\)]+\)', '', text)
    text = re.sub(r'https?://\S+', '', text)
    return text.strip()

# ── DB Connection ─────────────────────────────────────────────────────────────
db_url = os.environ['DATABASE_URL']
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', db_url)
user, password, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=password,
                       database=dbname, ssl={'ssl': True})
cur = conn.cursor()

# ── Load reference data ───────────────────────────────────────────────────────
cur.execute("SELECT id, name FROM finAccounts")
accounts_by_name = {r[1].lower(): r[0] for r in cur.fetchall()}

cur.execute("SELECT id, name, type FROM finCategories")
categories = {r[1].lower(): (r[0], r[2]) for r in cur.fetchall()}

cur.execute("SELECT id, clientCode FROM finClients WHERE clientCode IS NOT NULL AND clientCode != ''")
clients_by_code = {r[1].strip().lower(): r[0] for r in cur.fetchall()}

print(f"Loaded {len(accounts_by_name)} accounts, {len(categories)} categories, {len(clients_by_code)} clients")

# ── Notion account ID -> DB account name mapping ──────────────────────────────
# Discovered by resolving Notion page IDs
NOTION_ACCOUNT_MAP = {
    'e9ed10fe-ca32-8060-be16-427ee510e9ed': 'cash egp',
    '0f92c647-8cdf-4f0b-9fb6-9cf61c976374': 'cash usd',
    '3b40ac3b-f0c1-4b1a-8e2f-1234567890ab': 'arab african egp',  # ARAB EGP
    '9f3bcf2d-1234-5678-abcd-ef0123456789': 'credit ziad',
    'd2a1a977-1234-5678-abcd-ef0123456789': 'commission credit',  # Credit Mahmoud
    'ea625fd4-1234-5678-abcd-ef0123456789': 'imprest account',    # Petty Cash
}

# We'll resolve unknown IDs dynamically by fetching from Notion
resolved_account_ids = {}

def resolve_notion_account_id(notion_page_id):
    """Fetch the Notion page title to determine which account it maps to."""
    if notion_page_id in resolved_account_ids:
        return resolved_account_ids[notion_page_id]
    try:
        req = urllib.request.Request(
            f'https://api.notion.com/v1/pages/{notion_page_id}',
            headers=NOTION_HEADERS, method='GET'
        )
        with urllib.request.urlopen(req) as resp:
            page_data = json.loads(resp.read())
        title = ''
        for pname, pval in page_data.get('properties', {}).items():
            if pval.get('type') == 'title':
                title = ''.join(t['plain_text'] for t in pval.get('title', []))
                break
        title_lower = title.lower().strip()
        # Map Notion account names to DB account names
        name_map = {
            'cash egp': 'cash egp',
            'cash usd': 'cash usd',
            'cash euro': 'cash euro',
            'cash eur': 'cash euro',
            'arab egp': 'arab african egp',
            'arab african egp': 'arab african egp',
            'arab usd': 'arab african usd',
            'arab african usd': 'arab african usd',
            'arab euro': 'arab african euro',
            'arab african euro': 'arab african euro',
            'arab eur': 'arab african euro',
            'cib egp': 'cib egp',
            'cib usd': 'cib usd',
            'cib euro': 'cib euro',
            'aib egp': 'aib egp',
            'aib usd': 'aib usd',
            'masr egp': 'masr egp',
            'masr usd': 'masr usd',
            'imprest account': 'imprest account',
            'petty cash': 'imprest account',
            'imprest': 'imprest account',
            'commission credit': 'commission credit',
            'credit mahmoud': 'commission credit',
            'rent credit': 'rent credit',
            'credit ziad': 'credit ziad',
            'z. usd bank': 'z. usd bank',
            'ziad usd': 'z. usd bank',
            'salaries credit': 'salaries credit',
            'spanish lawyer credit': 'spanish lawyer credit euros',
            'spanish lawyer credit euros': 'spanish lawyer credit euros',
            'spanish translator credit': 'spanish translator credit',
        }
        db_name = name_map.get(title_lower)
        if not db_name:
            # Try partial match
            for k, v in name_map.items():
                if k in title_lower or title_lower in k:
                    db_name = v
                    break
        resolved_account_ids[notion_page_id] = (title, db_name)
        return (title, db_name)
    except Exception as e:
        resolved_account_ids[notion_page_id] = (notion_page_id[:8], None)
        return (notion_page_id[:8], None)

# ── Category keyword mapping ──────────────────────────────────────────────────
CATEGORY_KEYWORDS = [
    ('facebook ads', 'facebook ads'),
    ('google ads', 'google ads'),
    ('instagram', 'facebook ads'),
    ('social media', 'facebook ads'),
    ('salary', 'salaries'),
    ('salaries', 'salaries'),
    ('payroll', 'salaries'),
    ('rent', 'office rent'),
    ('office rent', 'office rent'),
    ('commission', 'commissions'),
    ('gov', 'government fees'),
    ('government', 'government fees'),
    ('embassy', 'government fees'),
    ('visa fee', 'government fees'),
    ('maintenance', 'maintenance'),
    ('donation', 'donations'),
    ('internet', 'internet & phone'),
    ('phone', 'internet & phone'),
    ('insurance', 'insurance'),
    ('utility', 'utility bills'),
    ('electricity', 'utility bills'),
    ('water', 'utility bills'),
    ('marketing', 'marketing'),
    ('training', 'training & development'),
    ('translation', 'miscellaneous expenses'),
    ('service facilitating', 'miscellaneous expenses'),
    ('attestation', 'miscellaneous expenses'),
    ('office expenses', 'miscellaneous expenses'),
    ('schengen', 'miscellaneous expenses'),
    ('bonus', 'miscellaneous expenses'),
    ('office assets', 'miscellaneous expenses'),
    ('withdrawal', 'miscellaneous expenses'),
    ('withdrawing', 'miscellaneous expenses'),
]

def detect_category(text):
    t = text.lower()
    for keyword, cat_name in CATEGORY_KEYWORDS:
        if keyword in t:
            cat = categories.get(cat_name)
            if cat:
                return cat[0]
    return categories.get('miscellaneous expenses', (None,))[0]

def detect_client(text):
    m6 = re.search(r'\((\d{6})\)', text)
    if m6:
        code = m6.group(1)
        if code.startswith('260') and len(code) == 6:
            code = '26' + code[3:]
        cid = clients_by_code.get(code.lower())
        if cid:
            return cid
    m5 = re.search(r'\((\d{5})\)', text)
    if m5:
        code = m5.group(1)
        cid = clients_by_code.get(code.lower())
        if cid:
            return cid
    return None

# ── STEP 1: Delete ALL existing expense transactions ──────────────────────────
print("\nDeleting all existing expense transactions and reverting account balances...")

# Get all expenses with their account and amount to revert balances
cur.execute("""
    SELECT id, accountId, amount FROM finTransactions WHERE type = 'expense'
""")
existing_expenses = cur.fetchall()
print(f"Found {len(existing_expenses)} existing expense transactions to delete")

# Revert account balances
account_revert = {}
for tx_id, acc_id, amount in existing_expenses:
    account_revert[acc_id] = account_revert.get(acc_id, 0) + float(amount)

for acc_id, total_amount in account_revert.items():
    cur.execute("UPDATE finAccounts SET balance = balance + %s WHERE id = %s", (total_amount, acc_id))
    print(f"  Reverted account {acc_id}: +{total_amount:,.2f}")

# Delete all expense transactions
cur.execute("DELETE FROM finTransactions WHERE type = 'expense'")
print(f"Deleted all expense transactions")
conn.commit()

# ── STEP 2: Fetch all Notion expense records ──────────────────────────────────
print(f"\nFetching all 2026+ expense records from Notion...")
all_records = []
cursor = None
page_num = 0
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
    page_num += 1
    print(f"  Fetched page {page_num}: {len(result['results'])} records (total so far: {len(all_records)})")
    if not result['has_more']:
        break
    cursor = result['next_cursor']

print(f"\nTotal Notion records fetched: {len(all_records)}")

# ── STEP 3: Import all records ────────────────────────────────────────────────
imported = 0
skipped_no_amount = 0
unknown_accounts = []
DEFAULT_ACCOUNT = 'cash egp'

for page in all_records:
    props = page['properties']

    # Get description/name
    name_parts = props.get('Name', {}).get('title', [])
    description = strip_notion_links(''.join(t['plain_text'] for t in name_parts).strip())

    # Get note
    note_parts = props.get('note', {}).get('rich_text', [])
    note = strip_notion_links(''.join(t['plain_text'] for t in note_parts).strip())

    # Get amount
    amount_raw = props.get('Amount', {}).get('number')
    if amount_raw is None or amount_raw <= 0:
        skipped_no_amount += 1
        continue

    amount = float(amount_raw)

    # Get date
    date_raw = props.get('Date of Expense', {}).get('date')
    if date_raw is None:
        tx_date = datetime.now()
        date_str = tx_date.strftime('%Y-%m-%d')
    else:
        date_str = date_raw['start'][:10]
        tx_date = datetime.strptime(date_str, '%Y-%m-%d')

    if not description:
        description = note if note else 'Expense'

    # Resolve account from Notion relation
    acc_rel = props.get('Account', {}).get('relation', [])
    acc_id = None
    if acc_rel:
        notion_page_id = acc_rel[0]['id']
        notion_title, db_acc_name = resolve_notion_account_id(notion_page_id)
        if db_acc_name:
            acc_id = accounts_by_name.get(db_acc_name)
        if not acc_id:
            unknown_accounts.append(f"{description[:40]} -> notion_acc={notion_title}")
            acc_id = accounts_by_name.get(DEFAULT_ACCOUNT)
    else:
        acc_id = accounts_by_name.get(DEFAULT_ACCOUNT)

    # Detect category and client
    search_text = f"{description} {note}"
    cat_id = detect_category(search_text)
    client_id = detect_client(search_text)

    # Get current account balance
    cur.execute("SELECT balance FROM finAccounts WHERE id = %s", (acc_id,))
    row = cur.fetchone()
    balance_before = float(row[0]) if row else 0.0
    balance_after = balance_before - amount

    # Insert transaction
    cur.execute("""
        INSERT INTO finTransactions
          (type, description, accountId, categoryId, finClientId, amount, note,
           transactionDate, balanceBefore, balanceAfter)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        'expense', description, acc_id, cat_id, client_id,
        amount, note if note and note != description else None,
        tx_date, balance_before, balance_after
    ))

    # Update account balance
    cur.execute("UPDATE finAccounts SET balance = %s WHERE id = %s", (balance_after, acc_id))

    imported += 1
    if imported % 50 == 0:
        conn.commit()
        print(f"  ... {imported} imported so far")

conn.commit()

# ── STEP 4: Recalculate all account balances from scratch ─────────────────────
print("\nRecalculating all account balances from opening balance + transactions...")
cur.execute("SELECT id, openingBalance FROM finAccounts")
all_accounts = cur.fetchall()
for acc_id, opening_bal in all_accounts:
    cur.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END), 0)
        FROM finTransactions WHERE accountId = %s
    """, (acc_id,))
    net_tx = float(cur.fetchone()[0])

    cur.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN toAccountId = %s THEN amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN accountId = %s AND type='transfer' THEN amount ELSE 0 END), 0)
        FROM finTransactions WHERE type='transfer'
    """, (acc_id, acc_id))
    net_transfer = float(cur.fetchone()[0])

    new_balance = float(opening_bal) + net_tx + net_transfer
    cur.execute("UPDATE finAccounts SET balance = %s WHERE id = %s", (new_balance, acc_id))

conn.commit()
print("All balances recalculated.")

# ── Summary ───────────────────────────────────────────────────────────────────
cur.execute("SELECT COUNT(*), COALESCE(SUM(amount),0) FROM finTransactions WHERE type='expense'")
r = cur.fetchone()
print(f"\n=== Import Complete ===")
print(f"Imported:          {imported}")
print(f"Skipped (no amt):  {skipped_no_amount}")
print(f"DB total expenses: {float(r[1]):,.2f} ({r[0]} records)")

if unknown_accounts:
    print(f"\nRecords defaulted to Cash EGP (unknown Notion account):")
    for u in unknown_accounts[:20]:
        print(f"  - {u}")

# Print per-account summary
print("\n=== Per-Account Expense Summary ===")
cur.execute("""
    SELECT a.name, COUNT(*), COALESCE(SUM(t.amount),0)
    FROM finTransactions t
    JOIN finAccounts a ON t.accountId = a.id
    WHERE t.type = 'expense'
    GROUP BY a.name ORDER BY SUM(t.amount) DESC
""")
for r in cur.fetchall():
    print(f"  {r[0]:<35} count={r[1]:>5}  total={float(r[2]):>14,.2f}")

conn.close()
