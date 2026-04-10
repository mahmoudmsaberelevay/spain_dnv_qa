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

# Hardcoded Notion page ID -> DB account name (resolved in advance)
NOTION_ID_TO_ACCOUNT = {
    'e9ed10fe-af40-4507-b79a-2874fdc2c6f2': 'cash egp',
    '0f92c647-8cdf-4f0b-9fb6-9cf61c976374': 'cash usd',
    '3b40ac3b-3671-4db3-a5f4-e9d5003c390c': 'arab african egp',   # ARAB EGP
    '270ca328-2df6-80ca-a2d5-daf906723856': 'arab african euro',   # ARAB EURO
    '221ca328-2df6-80cf-86f6-f14d3e70cfd7': 'cib egp',            # CIB EGP
    '221ca328-2df6-80f0-ad9f-df4f66f65504': 'cib usd',            # CIB USD
    '285ca328-2df6-8070-918b-da0e01d4d699': 'imprest account',     # Imprest Account
    '28eca328-2df6-806d-abce-ee0ef9ac9e50': 'imprest account usd', # Imprest Account USD
    '2f6ca328-2df6-80c8-9349-eaa00ae44b23': 'rent credit',         # Rent Credit
    '2f6ca328-2df6-80e4-83aa-cabddc2ab786': 'commission credit',   # Commission Credit
    '9f3bcf2d-13ba-4026-82df-3d6585ab6aa7': 'credit ziad',
    '1f1ca328-2df6-80e7-bf75-c95e240d1ea3': 'spanish lawyer credit euros',
    '216ca328-2df6-8017-a9c0-e711d6926403': 'spanish translator credit',
}

def strip_notion_links(text):
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
accounts_by_name = {r[1].lower().strip(): r[0] for r in cur.fetchall()}

cur.execute("SELECT id, name, type FROM finCategories")
categories = {r[1].lower(): (r[0], r[2]) for r in cur.fetchall()}

cur.execute("SELECT id, clientCode FROM finClients WHERE clientCode IS NOT NULL AND clientCode != ''")
clients_by_code = {r[1].strip().lower(): r[0] for r in cur.fetchall()}

print(f"Loaded {len(accounts_by_name)} accounts, {len(categories)} categories, {len(clients_by_code)} clients")

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

# ── STEP 1: Delete all existing expenses and reset balances ───────────────────
print("\nDeleting all existing expense transactions...")
cur.execute("SELECT accountId, amount FROM finTransactions WHERE type = 'expense'")
existing_expenses = cur.fetchall()
print(f"Found {len(existing_expenses)} existing expense transactions to delete")

account_revert = {}
for acc_id, amount in existing_expenses:
    account_revert[acc_id] = account_revert.get(acc_id, 0) + float(amount)
for acc_id, total in account_revert.items():
    cur.execute("UPDATE finAccounts SET balance = balance + %s WHERE id = %s", (total, acc_id))

cur.execute("DELETE FROM finTransactions WHERE type = 'expense'")
conn.commit()
print("Deleted all expense transactions and reverted balances.")

# ── STEP 2: Fetch all Notion records ─────────────────────────────────────────
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
    print(f"  Page {page_num}: {len(result['results'])} records (total: {len(all_records)})")
    if not result['has_more']:
        break
    cursor = result['next_cursor']

print(f"\nTotal Notion records: {len(all_records)}")

# ── STEP 3: Batch insert all records ─────────────────────────────────────────
imported = 0
skipped_no_amount = 0
unknown_accounts = []
DEFAULT_ACCOUNT = 'cash egp'

# Pre-load all current account balances into memory
cur.execute("SELECT id, balance FROM finAccounts")
account_balances = {r[0]: float(r[1]) for r in cur.fetchall()}

batch_inserts = []
batch_balance_updates = {}  # acc_id -> delta

for page in all_records:
    props = page['properties']

    name_parts = props.get('Name', {}).get('title', [])
    description = strip_notion_links(''.join(t['plain_text'] for t in name_parts).strip())

    note_parts = props.get('note', {}).get('rich_text', [])
    note = strip_notion_links(''.join(t['plain_text'] for t in note_parts).strip())

    amount_raw = props.get('Amount', {}).get('number')
    if amount_raw is None or amount_raw <= 0:
        skipped_no_amount += 1
        continue

    amount = float(amount_raw)

    date_raw = props.get('Date of Expense', {}).get('date')
    if date_raw is None:
        tx_date = datetime.now()
        date_str = tx_date.strftime('%Y-%m-%d')
    else:
        date_str = date_raw['start'][:10]
        tx_date = datetime.strptime(date_str, '%Y-%m-%d')

    if not description:
        description = note if note else 'Expense'

    # Resolve account
    acc_rel = props.get('Account', {}).get('relation', [])
    acc_id = None
    if acc_rel:
        notion_page_id = acc_rel[0]['id']
        db_acc_name = NOTION_ID_TO_ACCOUNT.get(notion_page_id)
        if db_acc_name:
            acc_id = accounts_by_name.get(db_acc_name)
        if not acc_id:
            unknown_accounts.append(f"{description[:40]} -> notion_id={notion_page_id[:8]}")
    if not acc_id:
        acc_id = accounts_by_name.get(DEFAULT_ACCOUNT)

    search_text = f"{description} {note}"
    cat_id = detect_category(search_text)
    client_id = detect_client(search_text)

    balance_before = account_balances.get(acc_id, 0.0)
    balance_after = balance_before - amount
    account_balances[acc_id] = balance_after

    batch_inserts.append((
        'expense', description, acc_id, cat_id, client_id,
        amount, note if note and note != description else None,
        tx_date, balance_before, balance_after
    ))
    imported += 1

# Bulk insert
print(f"\nInserting {len(batch_inserts)} expense records...")
cur.executemany("""
    INSERT INTO finTransactions
      (type, description, accountId, categoryId, finClientId, amount, note,
       transactionDate, balanceBefore, balanceAfter)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
""", batch_inserts)
conn.commit()
print("Bulk insert complete.")

# ── STEP 4: Recalculate all account balances from scratch ─────────────────────
print("\nRecalculating all account balances...")
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
    print(f"\nRecords defaulted to Cash EGP (unknown account):")
    for u in unknown_accounts[:20]:
        print(f"  - {u}")

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

print("\n=== Updated Account Balances ===")
cur.execute("SELECT name, currency, balance FROM finAccounts ORDER BY currency, name")
for r in cur.fetchall():
    print(f"  {r[0]:<35} {r[1]:<4}  balance={float(r[2]):>14,.2f}")

conn.close()
