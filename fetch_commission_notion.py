import requests
import json

TOKEN = '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'
# The DB has multiple data sources — try the child source IDs directly
# Child 1: adeca835-ab49-4135-8bdb-8c7676aa6789
# Child 2: 2b6ca328-2df6-8099-ac35-000b85e4d4c8

headers = {
    'Authorization': f'Bearer {TOKEN}',
    'Notion-Version': '2025-09-03',
    'Content-Type': 'application/json',
}

def query_db(db_id, cursor=None):
    body = {'page_size': 100}
    if cursor:
        body['start_cursor'] = cursor
    r = requests.post(
        f'https://api.notion.com/v1/databases/{db_id}/query',
        headers=headers,
        json=body
    )
    return r.status_code, r.json()

# Try the parent DB with UUID format
parent_id = '0dc3fdc0-79e4-4156-89e4-5e025e3c18ae'
status, data = query_db(parent_id)
print(f"Parent DB status: {status}")
if status == 200 and 'results' in data:
    print(f"Records found: {len(data['results'])}")
    if data['results']:
        page = data['results'][0]
        print("First record properties:")
        for name, prop in page.get('properties', {}).items():
            print(f"  {name}: {prop['type']}")
else:
    print(json.dumps(data, indent=2)[:1000])
