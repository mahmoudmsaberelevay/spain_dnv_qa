import requests

TOKEN = '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'
INCOME_DB_ID = 'cb77cb92b5e44c9aa9c08ca42accb8c6'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}

# Get DB schema
r = requests.get(f'https://api.notion.com/v1/databases/{INCOME_DB_ID}', headers=headers)
db = r.json()
print("=== Income DB Properties ===")
for name, prop in db.get('properties', {}).items():
    print(f"  '{name}': {prop['type']}")

# Fetch a few records
print("\n=== Sample Income Records (first 5) ===")
r2 = requests.post(
    f'https://api.notion.com/v1/databases/{INCOME_DB_ID}/query',
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
        elif ptype == 'relation':
            if val: print(f"  {name} (relation): {[r.get('id') for r in val]}")
        elif ptype == 'date':
            if val: print(f"  {name}: {val.get('start')}")
        elif ptype == 'people':
            if val: print(f"  {name}: {[p.get('name') for p in val]}")
        elif ptype == 'formula':
            pass
        else:
            s = str(val)
            if s and s not in ('[]', '{}', 'None', 'False'):
                print(f"  {name} ({ptype}): {s[:100]}")
