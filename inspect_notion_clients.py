"""
Inspect the Notion Client Database to understand its structure and sample data.
URL: https://www.notion.so/031460429dd840c88e5e0cc20278d4ce
"""
import requests

TOKEN = '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'
# Extract DB ID from URL: 031460429dd840c88e5e0cc20278d4ce
CLIENT_DB_ID = '031460429dd840c88e5e0cc20278d4ce'

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
}

# Get DB schema
r = requests.get(f'https://api.notion.com/v1/databases/{CLIENT_DB_ID}', headers=headers)
if r.status_code != 200:
    print(f"Error: {r.status_code} {r.text[:300]}")
    exit(1)

db = r.json()
print("=== Notion Client Database Properties ===")
for name, prop in db.get('properties', {}).items():
    ptype = prop['type']
    extra = ''
    if ptype == 'select':
        options = [o['name'] for o in prop.get('select', {}).get('options', [])]
        extra = f" options: {options[:5]}"
    elif ptype == 'formula':
        extra = f" formula: {prop.get('formula', {}).get('expression', '')[:50]}"
    print(f"  '{name}': {ptype}{extra}")

# Fetch a few records
print("\n=== Sample Records (first 5) ===")
r2 = requests.post(
    f'https://api.notion.com/v1/databases/{CLIENT_DB_ID}/query',
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
            if val: print(f"  {name} (relation): {len(val)} items")
        elif ptype == 'date':
            if val: print(f"  {name}: {val.get('start')}")
        elif ptype == 'checkbox':
            print(f"  {name}: {val}")
        elif ptype == 'formula':
            fval = prop.get('formula', {})
            ftype = fval.get('type', '')
            fv = fval.get(ftype)
            if fv is not None: print(f"  {name} (formula): {fv}")
        elif ptype == 'rollup':
            rval = prop.get('rollup', {})
            rtype = rval.get('type', '')
            rv = rval.get(rtype)
            if rv is not None: print(f"  {name} (rollup): {rv}")
        else:
            s = str(val)
            if s and s not in ('[]', '{}', 'None', 'False'):
                print(f"  {name} ({ptype}): {s[:80]}")

# Count total records
r3 = requests.post(
    f'https://api.notion.com/v1/databases/{CLIENT_DB_ID}/query',
    headers=headers,
    json={"page_size": 1}
)
# Fetch all to count
total = 0
cursor = None
while True:
    body = {"page_size": 100}
    if cursor:
        body["start_cursor"] = cursor
    r4 = requests.post(f'https://api.notion.com/v1/databases/{CLIENT_DB_ID}/query', headers=headers, json=body)
    data = r4.json()
    total += len(data.get('results', []))
    if not data.get('has_more'):
        break
    cursor = data.get('next_cursor')
print(f"\nTotal records in Notion Client DB: {total}")
