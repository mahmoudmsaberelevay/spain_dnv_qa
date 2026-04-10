"""
Full re-sync of paidAmountEur, remainingAmountEur, paidAmountEgp for ALL clients.
Reads the Paid (formula) and Remaining Balance (formula) fields directly from Notion.
Also adds paidAmountEgp = paidAmountEur * 55.5
"""
import os, re, pymysql, json, urllib.request, time

TOKEN = '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'
CLIENT_DB_ID = '031460429dd840c88e5e0cc20278d4ce'
EUR_RATE = 55.5

HEADERS = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}

def normalize_code(s):
    """Normalize client code.
    DB stores codes as-is from the CSV import.
    Notion uses 6-digit codes for some ranges:
      - 26xxxx: 260021 in Notion = 26021 in DB (strip 3rd digit '0')
      - 24xxxx: 240058 in Notion = 24058 in DB (strip 3rd digit '0')
      - 25xxxx: 250173 in Notion = 250173 in DB (keep as-is, 6 digits)
    Returns a list of possible codes to try.
    """
    digits = re.sub(r'\D', '', str(s))
    if not digits:
        return []
    codes = [str(int(digits))]  # Always try the original (int strips leading zeros)
    # For 26xxxx and 24xxxx: also try stripping the 3rd digit '0'
    if len(digits) == 6 and digits[2] == '0' and digits[:2] in ('26', '24'):
        alt = digits[:2] + digits[3:]
        alt_val = str(int(alt))
        if alt_val not in codes:
            codes.append(alt_val)
    return codes

def notion_post(url, body, retries=3):
    data = json.dumps(body).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=HEADERS, method='POST')
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < retries - 1:
                print(f'  Retry {attempt+1} after error: {e}')
                time.sleep(2 ** attempt)
            else:
                raise

def fetch_all_clients():
    records = []
    cursor = None
    page = 0
    while True:
        body = {'page_size': 100}
        if cursor:
            body['start_cursor'] = cursor
        data = notion_post(f'https://api.notion.com/v1/databases/{CLIENT_DB_ID}/query', body)
        batch = data.get('results', [])
        records.extend(batch)
        page += 1
        print(f'  Fetched page {page}: {len(batch)} records (total so far: {len(records)})')
        if not data.get('has_more'):
            break
        cursor = data.get('next_cursor')
        time.sleep(0.3)
    return records

# ── DB Connection ─────────────────────────────────────────────────────────────
db_url = os.environ['DATABASE_URL']
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', db_url)
user, password, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=password,
                       database=dbname, ssl={'ssl': True})
cur = conn.cursor()

# Check if paidAmountEgp column exists, add if not
cur.execute("SHOW COLUMNS FROM finClients LIKE 'paidAmountEgp'")
if not cur.fetchone():
    print("Adding paidAmountEgp column...")
    cur.execute("ALTER TABLE finClients ADD COLUMN paidAmountEgp DECIMAL(14,2) DEFAULT NULL AFTER paidAmountEur")
    conn.commit()
    print("Column added.")

# Load all DB clients
cur.execute("SELECT id, clientCode, name FROM finClients")
db_clients = cur.fetchall()
print(f"\nDB has {len(db_clients)} clients")

# Build lookup: code -> db_id, name -> db_id
db_by_code = {}
db_by_name = {}
for db_id, code, name in db_clients:
    if code:
        db_by_code[str(int(code))] = db_id
    if name:
        db_by_name[name.strip().lower()] = db_id

# ── Fetch all Notion clients ──────────────────────────────────────────────────
print("\nFetching all Notion client records...")
all_clients = fetch_all_clients()
print(f"Total Notion client records: {len(all_clients)}")

updated = 0
skipped_no_match = 0
skipped_zero = 0
errors = []
notion_total_paid = 0.0
notion_total_remaining = 0.0

for rec in all_clients:
    props = rec.get('properties', {})
    
    # Get name
    name_prop = props.get('Name', {})
    if name_prop.get('type') == 'title':
        name = ''.join(t.get('plain_text', '') for t in name_prop.get('title', []))
    else:
        name = ''
    
    # Extract code from name — handles both (24058) and (24058 without closing paren
    code_match = re.search(r'\(\s*(\d{5,6})\s*\)?', name)
    extracted_codes = normalize_code(code_match.group(1)) if code_match else []
    
    # Get Paid (formula field — result is a number)
    paid_prop = props.get('Paid', {})
    paid_eur = 0.0
    if paid_prop.get('type') == 'formula':
        formula_result = paid_prop.get('formula', {})
        if formula_result.get('type') == 'number':
            paid_eur = float(formula_result.get('number') or 0)
    
    # Get Remaining Balance (formula field)
    remaining_prop = props.get('Remaining Balance', {})
    remaining_eur = 0.0
    if remaining_prop.get('type') == 'formula':
        formula_result = remaining_prop.get('formula', {})
        if formula_result.get('type') == 'number':
            remaining_eur = float(formula_result.get('number') or 0)
    
    # Get Contract Value
    contract_prop = props.get('Contract Value', {})
    contract_eur = 0.0
    if contract_prop.get('type') == 'number':
        contract_eur = float(contract_prop.get('number') or 0)
    
    notion_total_paid += paid_eur
    notion_total_remaining += remaining_eur
    
    # Find matching DB client
    db_id = None
    match_method = None
    
    for ec in extracted_codes:
        if ec in db_by_code:
            db_id = db_by_code[ec]
            match_method = f'code:{ec}'
            break
    if db_id:  # already matched by code
        pass
    elif name.strip().lower() in db_by_name:
        db_id = db_by_name[name.strip().lower()]
        match_method = 'exact_name'
    else:
        # Try partial name match (first 30 chars)
        short_name = name.strip().lower()[:30]
        for db_name, did in db_by_name.items():
            if db_name[:30] == short_name and len(short_name) > 10:
                db_id = did
                match_method = 'partial_name'
                break
    
    if db_id is None:
        skipped_no_match += 1
        if paid_eur > 0:
            errors.append(f'NO MATCH (paid={paid_eur:.0f}): {name[:60]}')
        continue
    
    paid_egp = round(paid_eur * EUR_RATE, 2)
    
    cur.execute("""
        UPDATE finClients 
        SET paidAmountEur = %s,
            paidAmountEgp = %s,
            remainingAmountEur = %s
        WHERE id = %s
    """, (round(paid_eur, 2), paid_egp, round(remaining_eur, 2), db_id))
    updated += 1

conn.commit()

# ── Final verification ────────────────────────────────────────────────────────
cur.execute("""
    SELECT 
        COUNT(*) as total,
        SUM(CAST(paidAmountEur AS DECIMAL(14,2))) as total_paid_eur,
        SUM(CAST(paidAmountEgp AS DECIMAL(14,2))) as total_paid_egp,
        SUM(CAST(remainingAmountEur AS DECIMAL(14,2))) as total_remaining_eur,
        COUNT(CASE WHEN paidAmountEur IS NULL OR paidAmountEur = 0 THEN 1 END) as zero_paid
    FROM finClients
""")
row = cur.fetchone()

print(f"\n{'='*60}")
print(f"RESULTS")
print(f"{'='*60}")
print(f"Updated: {updated} clients")
print(f"No match: {skipped_no_match} clients")
print(f"\nNotion totals (from this run):")
print(f"  Total Paid EUR:      {notion_total_paid:>12,.2f}")
print(f"  Total Remaining EUR: {notion_total_remaining:>12,.2f}")
print(f"\nDB totals after update:")
print(f"  Total Paid EUR:      {float(row[1] or 0):>12,.2f}  (target: 1,540,549)")
print(f"  Total Paid EGP:      {float(row[2] or 0):>12,.2f}")
print(f"  Total Remaining EUR: {float(row[3] or 0):>12,.2f}  (target: 830,950)")
print(f"  Clients with 0 paid: {row[4]}")

if errors:
    print(f"\nClients with payments but no DB match ({len(errors)}):")
    for e in errors[:20]:
        print(f"  {e}")

conn.close()
print("\nDone.")
