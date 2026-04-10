import requests
import json

TOKEN = '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'
DB_ID = '70444d8165034587aebe4bee3a653d23'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}

# Get DB schema
r = requests.get(f'https://api.notion.com/v1/databases/{DB_ID}', headers=headers)
db = r.json()
print("=== Expense DB Properties ===")
for name, prop in db.get('properties', {}).items():
    print(f"  '{name}': {prop['type']}")

# Fetch a few records and show all non-empty fields
print("\n=== Sample Records (first 5) ===")
r2 = requests.post(
    f'https://api.notion.com/v1/databases/{DB_ID}/query',
    headers=headers,
    json={"page_size": 5}
)
results = r2.json().get('results', [])
for page in results:
    props = page.get('properties', {})
    print(f"\n--- Record ---")
    for name, prop in props.items():
        ptype = prop['type']
        val = prop.get(ptype)
        if not val and val != 0:
            continue
        if ptype == 'title':
            text = ''.join(t.get('plain_text','') for t in val)
            if text: print(f"  {name}: {text}")
        elif ptype == 'rich_text':
            text = ''.join(t.get('plain_text','') for t in val)
            if text: print(f"  {name}: {text}")
        elif ptype == 'number':
            print(f"  {name}: {val}")
        elif ptype == 'select':
            if val: print(f"  {name}: {val.get('name')}")
        elif ptype == 'multi_select':
            if val: print(f"  {name}: {[v.get('name') for v in val]}")
        elif ptype == 'relation':
            if val: print(f"  {name} (relation): {[r.get('id') for r in val]}")
        elif ptype == 'date':
            if val: print(f"  {name}: {val.get('start')}")
        elif ptype == 'people':
            if val: print(f"  {name}: {[p.get('name') for p in val]}")
        elif ptype == 'checkbox':
            if val: print(f"  {name}: {val}")
        elif ptype == 'formula':
            pass  # skip
        else:
            s = str(val)
            if s and s != '[]' and s != '{}':
                print(f"  {name} ({ptype}): {s[:100]}")
