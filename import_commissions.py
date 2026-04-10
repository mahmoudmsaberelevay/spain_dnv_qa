#!/usr/bin/env python3
"""
Import all 243 commission records from the scraped Notion data into finCommissions table.

Column mapping (Notion header -> DB field):
  0: Client Code -> seqNumber (numeric part)
  1: CLient Name -> clientName
  2: Status -> status (map to "Pending"/"Started"/"Cancelled")
  3: Signing Date -> signingDate
  4: Contract Value -> contractValue (strip €, commas)
  5: Lead Source -> leadSource (map to enum)
  6: Qualifier Name -> qualifierName (N/A -> null)
  7: Payment Amount 1 -> qualifierCommissionAmount
  8: cPayment Date -> qualifierCommissionDate
  9: Qualifier Leader (Nouran) -> qualifierLeader
  10: Amount 4 -> qualifierLeaderCommissionAmount
  11: Payment Date 1 -> qualifierLeaderCommissionDate
  12: (Monic)Operaton TL Commission -> paralegalTlCommissionAmount
  13: Date -> paralegalTlCommissionDate
  14: (Madon)Operation Manager Commission -> operationManagerCommissionAmount
  15: Date -> operationManagerCommissionDate
  16: Paralegal -> paralegal
  17: First Payment Amount -> paralegalFirstPaymentAmount
  18: F. Payment Date -> paralegalFirstPaymentDate
  19: Paralegal 2nd Payment -> paralegalSecondPaymentAmount
  20: S. Payment Date -> paralegalSecondPaymentDate
  21: Paralegal 3rd payment -> paralegalThirdPaymentAmount
  22: 3rd Payment Date -> paralegalThirdPaymentDate
  23: CS -> consultant
  24: Payment Amounts For this Client -> consultantTotalPayment
  25: First Payment 50% -> consultantFirstPayment
  26: Date of Payment -> consultantFirstPaymentDate
  27: Second Payment 25% -> consultantSecondPayment
  28: Date of Second -> consultantSecondPaymentDate
  29: Third Payment 25% -> consultantThirdPayment
  30: Date of Third -> consultantThirdPaymentDate
  31: Payment Date -> leaderCommissionDate
  32: Leader -> leaderName
  33: Amount 5 -> leaderCommissionAmount
  34: Total Expenses -> (skip)
  35: Expected Profit -> (skip)
"""

import json
import os
import re
from datetime import datetime
import mysql.connector

# Load the scraped data
with open('/home/ubuntu/Downloads/commission_data.json', 'r') as f:
    data = json.load(f)

headers = data['headers']
rows = data['rows']
print(f"Loaded {len(rows)} rows with {len(headers)} columns")
print(f"Headers: {headers}")

# DB connection
db_url = os.environ.get('DATABASE_URL', '')
# Parse mysql://user:pass@host:port/dbname?ssl=...
# Strip query string first
db_url_clean = db_url.split('?')[0]
match = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', db_url_clean)
if not match:
    match = re.match(r'mysql://([^:]+):([^@]+)@([^/]+)/(.+)', db_url_clean)
    if match:
        user, password, host, dbname = match.groups()
        port = 3306
    else:
        print(f"Could not parse DATABASE_URL: {db_url[:50]}...")
        exit(1)
else:
    user, password, host, port, dbname = match.groups()
    port = int(port)

print(f"Connecting to {host}:{port}/{dbname} as {user}")

conn = mysql.connector.connect(
    host=host,
    port=port,
    user=user,
    password=password,
    database=dbname,
    ssl_disabled=False,
    ssl_verify_cert=False,
    ssl_ca=None,
)
cursor = conn.cursor()

def parse_amount(s):
    """Parse €1,234.56 -> 1234.56 or None"""
    if not s or s.strip() in ('', 'N/A', '€0.00', '0', '€0'):
        return None
    s = s.replace('€', '').replace(',', '').strip()
    try:
        v = float(s)
        return str(v) if v > 0 else None
    except:
        return None

def parse_date(s):
    """Parse 'December 9, 2022' -> '2022-12-09 00:00:00'"""
    if not s or s.strip() == '':
        return None
    s = s.strip()
    # Try various formats
    formats = [
        '%B %d, %Y',   # December 9, 2022
        '%b %d, %Y',   # Dec 9, 2022
        '%m/%d/%Y',    # 12/9/2022
        '%Y-%m-%d',    # 2022-12-09
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        except:
            continue
    print(f"  WARNING: Could not parse date: '{s}'")
    return None

def parse_lead_source(s):
    """Map to enum values"""
    if not s or s.strip() == '':
        return None
    s = s.strip()
    if s in ('Sales Mining', 'Referal', 'Marketing'):
        return s
    if 'sales' in s.lower() or 'mining' in s.lower():
        return 'Sales Mining'
    if 'referal' in s.lower() or 'referral' in s.lower():
        return 'Referal'
    if 'marketing' in s.lower():
        return 'Marketing'
    return None

def parse_status(s):
    """Map to enum values"""
    if not s or s.strip() == '':
        return 'Pending'
    s = s.strip()
    if s in ('Pending', 'Started', 'Cancelled'):
        return s
    if 'cancel' in s.lower():
        return 'Cancelled'
    if 'start' in s.lower() or 'active' in s.lower():
        return 'Started'
    return 'Pending'

def get_cell(row, idx):
    """Safely get cell value"""
    if idx < len(row):
        v = row[idx].strip()
        return v if v else None
    return None

def parse_name(s):
    """Return None for N/A or empty"""
    if not s or s.strip() in ('', 'N/A', 'n/a', '-'):
        return None
    return s.strip()

# First, clear existing commission records (except the manually created one we want to keep)
# Actually, delete all and reimport fresh
print("Clearing existing commission records...")
cursor.execute("DELETE FROM finCommissions")
conn.commit()
print("Cleared.")

# Insert all rows
insert_sql = """
INSERT INTO finCommissions (
    seqNumber, clientName, status, signingDate, contractValue,
    leadSource, qualifierName, qualifierCommissionAmount, qualifierCommissionDate,
    qualifierLeader, qualifierLeaderCommissionAmount, qualifierLeaderCommissionDate,
    paralegalTlCommissionAmount, paralegalTlCommissionDate,
    operationManagerCommissionAmount, operationManagerCommissionDate,
    paralegal, paralegalFirstPaymentAmount, paralegalFirstPaymentDate,
    paralegalSecondPaymentAmount, paralegalSecondPaymentDate,
    paralegalThirdPaymentAmount, paralegalThirdPaymentDate,
    consultant, consultantTotalPayment,
    consultantFirstPayment, consultantFirstPaymentDate,
    consultantSecondPayment, consultantSecondPaymentDate,
    consultantThirdPayment, consultantThirdPaymentDate,
    leaderCommissionDate, leaderName, leaderCommissionAmount,
    createdAt, updatedAt
) VALUES (
    %s, %s, %s, %s, %s,
    %s, %s, %s, %s,
    %s, %s, %s,
    %s, %s,
    %s, %s,
    %s, %s, %s,
    %s, %s,
    %s, %s,
    %s, %s,
    %s, %s,
    %s, %s,
    %s, %s,
    %s, %s, %s,
    NOW(), NOW()
)
"""

success = 0
errors = 0

for i, row in enumerate(rows):
    try:
        # Parse seq number from col 0
        seq_raw = get_cell(row, 0)
        seq_num = None
        if seq_raw:
            try:
                seq_num = int(re.sub(r'[^\d]', '', seq_raw)) if re.search(r'\d', seq_raw) else None
            except:
                seq_num = i + 1

        client_name = get_cell(row, 1) or f"Unknown {i+1}"
        status = parse_status(get_cell(row, 2))
        signing_date = parse_date(get_cell(row, 3))
        contract_value = parse_amount(get_cell(row, 4))
        lead_source = parse_lead_source(get_cell(row, 5))
        qualifier_name = parse_name(get_cell(row, 6))
        qualifier_amount = parse_amount(get_cell(row, 7))
        qualifier_date = parse_date(get_cell(row, 8))
        qualifier_leader = parse_name(get_cell(row, 9))
        qualifier_leader_amount = parse_amount(get_cell(row, 10))
        qualifier_leader_date = parse_date(get_cell(row, 11))
        paralegal_tl_amount = parse_amount(get_cell(row, 12))
        paralegal_tl_date = parse_date(get_cell(row, 13))
        op_manager_amount = parse_amount(get_cell(row, 14))
        op_manager_date = parse_date(get_cell(row, 15))
        paralegal = parse_name(get_cell(row, 16))
        paralegal_first_amount = parse_amount(get_cell(row, 17))
        paralegal_first_date = parse_date(get_cell(row, 18))
        paralegal_second_amount = parse_amount(get_cell(row, 19))
        paralegal_second_date = parse_date(get_cell(row, 20))
        paralegal_third_amount = parse_amount(get_cell(row, 21))
        paralegal_third_date = parse_date(get_cell(row, 22))
        consultant = parse_name(get_cell(row, 23))
        consultant_total = parse_amount(get_cell(row, 24))
        consultant_first = parse_amount(get_cell(row, 25))
        consultant_first_date = parse_date(get_cell(row, 26))
        consultant_second = parse_amount(get_cell(row, 27))
        consultant_second_date = parse_date(get_cell(row, 28))
        consultant_third = parse_amount(get_cell(row, 29))
        consultant_third_date = parse_date(get_cell(row, 30))
        leader_commission_date = parse_date(get_cell(row, 31))
        leader_name = parse_name(get_cell(row, 32)) or "Mahmoud Saber"
        leader_amount = parse_amount(get_cell(row, 33))

        values = (
            seq_num, client_name, status, signing_date, contract_value,
            lead_source, qualifier_name, qualifier_amount, qualifier_date,
            qualifier_leader, qualifier_leader_amount, qualifier_leader_date,
            paralegal_tl_amount, paralegal_tl_date,
            op_manager_amount, op_manager_date,
            paralegal, paralegal_first_amount, paralegal_first_date,
            paralegal_second_amount, paralegal_second_date,
            paralegal_third_amount, paralegal_third_date,
            consultant, consultant_total,
            consultant_first, consultant_first_date,
            consultant_second, consultant_second_date,
            consultant_third, consultant_third_date,
            leader_commission_date, leader_name, leader_amount,
        )

        cursor.execute(insert_sql, values)
        success += 1

        if (i + 1) % 50 == 0:
            conn.commit()
            print(f"  Inserted {i+1} rows...")

    except Exception as e:
        errors += 1
        print(f"  ERROR on row {i+1} ({get_cell(row, 1)}): {e}")

conn.commit()
cursor.close()
conn.close()

print(f"\nDone! Inserted {success} records, {errors} errors.")
