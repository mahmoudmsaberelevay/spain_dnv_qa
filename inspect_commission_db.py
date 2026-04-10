import requests
import json

TOKEN = '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'
DB_ID = '0dc3fdc079e4415689e45e025e3c18ae'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
}

# Get database schema
r = requests.get(f'https://api.notion.com/v1/databases/{DB_ID}', headers=headers)
db = r.json()
print("=== DATABASE TITLE ===")
print(db.get('title', [{}])[0].get('plain_text', 'N/A'))
print("\n=== PROPERTIES ===")
for name, prop in db.get('properties', {}).items():
    print(f"  {name}: {prop['type']}")
    if prop['type'] == 'select':
        opts = [o['name'] for o in prop.get('select', {}).get('options', [])]
        print(f"    options: {opts}")
    elif prop['type'] == 'multi_select':
        opts = [o['name'] for o in prop.get('multi_select', {}).get('options', [])]
        print(f"    options: {opts}")
    elif prop['type'] == 'relation':
        print(f"    related_db: {prop.get('relation', {}).get('database_id', 'N/A')}")

# Get first 3 records to see data
print("\n=== FIRST 3 RECORDS ===")
r2 = requests.post(
    f'https://api.notion.com/v1/databases/{DB_ID}/query',
    headers=headers,
    json={"page_size": 3}
)
data = r2.json()
for page in data.get('results', []):
    print(f"\n--- Record ID: {page['id']} ---")
    for name, prop in page.get('properties', {}).items():
        ptype = prop['type']
        val = prop.get(ptype)
        if val is None or val == [] or val == '':
            continue
        if ptype == 'title':
            text = ''.join(t.get('plain_text', '') for t in val)
            if text:
                print(f"  {name}: {text}")
        elif ptype == 'rich_text':
            text = ''.join(t.get('plain_text', '') for t in val)
            if text:
                print(f"  {name}: {text}")
        elif ptype == 'number':
            print(f"  {name}: {val}")
        elif ptype == 'select':
            if val:
                print(f"  {name}: {val.get('name', '')}")
        elif ptype == 'multi_select':
            if val:
                print(f"  {name}: {[v.get('name') for v in val]}")
        elif ptype == 'date':
            if val:
                print(f"  {name}: {val.get('start', '')}")
        elif ptype == 'relation':
            if val:
                print(f"  {name}: {[v.get('id') for v in val]}")
        elif ptype == 'formula':
            fval = val.get('string') or val.get('number') or val.get('boolean') or val.get('date')
            if fval:
                print(f"  {name} (formula): {fval}")
        elif ptype == 'rollup':
            rval = val.get('array') or val.get('number') or val.get('date')
            if rval:
                print(f"  {name} (rollup): {rval}")
        else:
            print(f"  {name} ({ptype}): {str(val)[:80]}")
