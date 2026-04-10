import os, re, pymysql

db_url = os.environ['DATABASE_URL']
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', db_url)
user, password, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=password, database=dbname, ssl={'ssl': True})
cur = conn.cursor()

# Get Cash EGP account id
cur.execute("SELECT id, name, openingBalance, balance FROM finAccounts WHERE name = 'Cash EGP'")
acc = cur.fetchone()
acc_id, acc_name, opening, current_bal = acc
print(f"Account: {acc_name} (ID: {acc_id})")
print(f"Opening Balance: {float(opening):,.2f}")
print(f"Current Balance (stored): {float(current_bal):,.2f}")
print()

# Count and sum by type
cur.execute("""
    SELECT type, COUNT(*), COALESCE(SUM(amount), 0)
    FROM finTransactions
    WHERE accountId = %s
    GROUP BY type
""", (acc_id,))
rows = cur.fetchall()
print("=== By Transaction Type ===")
for r in rows:
    print(f"  {r[0]:<12} count={r[1]:>5}   total={float(r[2]):>14,.2f}")
print()

# Expense breakdown by category
cur.execute("""
    SELECT c.name, COUNT(*), COALESCE(SUM(t.amount), 0)
    FROM finTransactions t
    LEFT JOIN finCategories c ON t.categoryId = c.id
    WHERE t.accountId = %s AND t.type = 'expense'
    GROUP BY c.name
    ORDER BY SUM(t.amount) DESC
""", (acc_id,))
rows = cur.fetchall()
print("=== Expense Breakdown by Category ===")
total_exp = 0
for r in rows:
    amt = float(r[2])
    total_exp += amt
    print(f"  {str(r[0]):<40} count={r[1]:>5}   amount={amt:>14,.2f}")
print(f"\n  TOTAL EXPENSES: {total_exp:>14,.2f}")
print()

# Transfer out breakdown
cur.execute("""
    SELECT a.name, COUNT(*), COALESCE(SUM(t.amount), 0)
    FROM finTransactions t
    LEFT JOIN finAccounts a ON t.toAccountId = a.id
    WHERE t.accountId = %s AND t.type = 'transfer'
    GROUP BY a.name
    ORDER BY SUM(t.amount) DESC
""", (acc_id,))
rows = cur.fetchall()
print("=== Transfers OUT from Cash EGP (to each account) ===")
total_out = 0
for r in rows:
    amt = float(r[2])
    total_out += amt
    print(f"  To: {str(r[0]):<35} count={r[1]:>5}   amount={amt:>14,.2f}")
print(f"\n  TOTAL TRANSFERS OUT: {total_out:>14,.2f}")
print()

# Transfer in breakdown
cur.execute("""
    SELECT a.name, COUNT(*), COALESCE(SUM(t.amount), 0)
    FROM finTransactions t
    LEFT JOIN finAccounts a ON t.accountId = a.id
    WHERE t.toAccountId = %s AND t.type = 'transfer'
    GROUP BY a.name
    ORDER BY SUM(t.amount) DESC
""", (acc_id,))
rows = cur.fetchall()
print("=== Transfers IN to Cash EGP (from each account) ===")
total_in = 0
for r in rows:
    amt = float(r[2])
    total_in += amt
    print(f"  From: {str(r[0]):<33} count={r[1]:>5}   amount={amt:>14,.2f}")
print(f"\n  TOTAL TRANSFERS IN: {total_in:>14,.2f}")

conn.close()
