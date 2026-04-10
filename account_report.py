import os, re, pymysql

db_url = os.environ['DATABASE_URL']
m = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)', db_url)
user, password, host, port, dbname = m.groups()
conn = pymysql.connect(host=host, port=int(port), user=user, password=password, database=dbname, ssl={'ssl': True})
cur = conn.cursor()

cur.execute('SELECT id, name, currency, openingBalance, balance FROM finAccounts ORDER BY currency, name')
accounts = cur.fetchall()

header = "{:<30} {:<6} {:>14} {:>14} {:>14} {:>14} {:>14} {:>14} {:>14}".format(
    'Account', 'Curr', 'Opening', 'Income (+)', 'Expense (-)', 'Trans In (+)', 'Trans Out (-)', 'Net Change', 'Current Bal'
)
print(header)
print('-' * 140)

for acc_id, acc_name, currency, opening, current_bal in accounts:
    cur.execute('''
        SELECT 
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)
        FROM finTransactions
        WHERE accountId = %s
    ''', (acc_id,))
    row = cur.fetchone()
    income = float(row[0])
    expense = float(row[1])

    cur.execute('''
        SELECT 
            COALESCE(SUM(CASE WHEN toAccountId = %s THEN amount ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN accountId = %s AND type = 'transfer' THEN amount ELSE 0 END), 0)
        FROM finTransactions
        WHERE type = 'transfer'
    ''', (acc_id, acc_id))
    row2 = cur.fetchone()
    trans_in = float(row2[0])
    trans_out = float(row2[1])

    net = income - expense + trans_in - trans_out
    opening_f = float(opening)
    current_f = float(current_bal)

    if income == 0 and expense == 0 and trans_in == 0 and trans_out == 0:
        continue

    line = "{:<30} {:<6} {:>14,.2f} {:>14,.2f} {:>14,.2f} {:>14,.2f} {:>14,.2f} {:>14,.2f} {:>14,.2f}".format(
        acc_name, currency, opening_f, income, expense, trans_in, trans_out, net, current_f
    )
    print(line)

conn.close()
