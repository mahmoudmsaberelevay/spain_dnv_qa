#!/usr/bin/env python3
"""Owner-authorized 2026-11-12 layout/signing revision. Never overwrites historical templates."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
import hashlib, json
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'server/spain_dnv_contract_template_2026_09_23.docx'
TARGET=ROOT/'server/spain_dnv_contract_template_2026_11_12.docx'
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W14='http://schemas.microsoft.com/office/word/2010/wordml'
ns={'w':W,'w14':W14}
def text(p):return ''.join(p.xpath('.//w:t/text()',namespaces=ns))
def marker(p,label):
 r=E.SubElement(p,'{%s}r'%W);pr=E.SubElement(r,'{%s}rPr'%W)
 for tag,attrs in [('rFonts',{'ascii':'Arial','hAnsi':'Arial','cs':'Arial'}),('color',{'val':'FFFFFF'}),('sz',{'val':'2'}),('szCs',{'val':'2'}),('rtl',{'val':'0'}),('u',{'val':'none'})]:
  e=E.SubElement(pr,'{%s}%s'%(W,tag))
  for k,v in attrs.items():e.set('{%s}%s'%(W,k),v)
 E.SubElement(r,'{%s}t'%W).text=label
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest()=='2445f48c8cbade8dff11ba8577b3288287ba049cb2e326f883ccbfe4379bae14','Approved source changed: review required'
with ZipFile(SOURCE) as z:parts={n:z.read(n) for n in z.namelist()}
root=E.fromstring(parts['word/document.xml']);original=[x.text or '' for x in root.xpath('.//w:t|.//w:delText|.//w:instrText',namespaces=ns)]
# Remove only excess blank paragraphs in the identified spacer cell, preserving its geometry.
spacer=root.xpath('.//w:tr[@w14:paraId="0C98675E"]',namespaces=ns)
assert len(spacer)==1,'Expected approved spacer row'
blank=spacer[0].xpath('.//w:p',namespaces=ns)
assert len(blank)==14 and all(not text(p).strip() for p in blank)
for p in blank[1:]:p.getparent().remove(p)
heading=root.xpath('.//w:p[@w14:paraId="2ECB6B67"]',namespaces=ns);assert len(heading)==1
pr=heading[0].find('w:pPr',ns)
if pr is None:pr=E.Element('{%s}pPr'%W);heading[0].insert(0,pr)
if pr.find('w:pageBreakBefore',ns) is None:
 b=E.Element('{%s}pageBreakBefore'%W);style=pr.find('w:pStyle',ns);pr.insert(list(pr).index(style)+1 if style is not None else 0,b)
paras=root.xpath('.//w:body//w:p',namespaces=ns)
labels={}
def add(p,label):assert label not in labels;marker(p,label);labels[label]=p.get('{%s}paraId'%W14)
add(next(p for p in paras if text(p).strip()),'ELEVAY_ES_SIGN_FIRST')
for pid,label in [('6DF3538F','ELEVAY_ES_SIGN_MAIN'),('2105EABA','ELEVAY_ES_SIGN_SERVICES'),('7CA32825','ELEVAY_ES_SIGN_ACK')]:
 matches=root.xpath('.//w:p[@w14:paraId="%s"]'%pid,namespaces=ns);assert len(matches)==1
 p=matches[0];pr=p.find('w:pPr',ns)
 if pr is None:pr=E.Element('{%s}pPr'%W);p.insert(0,pr)
 spacing=pr.find('w:spacing',ns)
 if spacing is None:spacing=E.SubElement(pr,'{%s}spacing'%W)
 for attr in ('beforeAutospacing','afterAutospacing','beforeLines','afterLines'):spacing.attrib.pop('{%s}%s'%(W,attr),None)
 spacing.set('{%s}before'%W,'480');spacing.set('{%s}after'%W,'240')
 add(p,label)
# The exact approved paragraphs, not broadly matched Arabic substrings.
with ZipFile(SOURCE) as z:old=E.fromstring(z.read('word/document.xml')).xpath('.//w:body//w:p',namespaces=ns)
assert text(old[173]).strip()=='تقسيم الدفعات' and text(old[184]).strip().startswith('(ج)')
for index,label in [(173,'ELEVAY_ES_INIT_6_1_B'),(184,'ELEVAY_ES_INIT_6_1_J'),(239,'ELEVAY_ES_INIT_7_5'),(252,'ELEVAY_ES_INIT_7_7'),(281,'ELEVAY_ES_INIT_8_5'),(292,'ELEVAY_ES_INIT_9'),(None,'ELEVAY_ES_INIT_10_2'),(433,'ELEVAY_ES_INIT_12_4'),(414,'ELEVAY_ES_INIT_12_1_J')]:
 if index is None:
  candidates=[p for p in paras if text(p).strip().startswith('2-10')]
 else:
  target_text=text(old[index]);candidates=[p for p in paras if text(p)==target_text]
 assert len(candidates)==1,(label,len(candidates))
 add(candidates[0],label)
new=[x.text or '' for x in root.xpath('.//w:t|.//w:delText|.//w:instrText',namespaces=ns) if not (x.text or '').startswith('ELEVAY_ES_')]
assert new==original,'Legal/source text must remain exactly identical'
parts['word/document.xml']=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
with ZipFile(TARGET,'w',ZIP_DEFLATED) as z:
 for n,data in parts.items():z.writestr(n,data)
manifest={'version':'2026-11-12','modifiedBy':'Manus for Mahmoud Saber','modifiedDate':'2026-11-12','sourceVersion':'2026-09-23','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'revisedSha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'legalTextUnchanged':True,'legalTextSha256':hashlib.sha256(json.dumps(original,ensure_ascii=False).encode()).hexdigest(),'removedBlankParagraphs':13,'clientSignatureSpacingPoints':{'before':24,'after':12},'signingMarkerParagraphs':labels,'changedZipParts':['word/document.xml']}
(ROOT/'docs/Spain_Contract_Template_2026_11_12_Revision.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('REVISED_TEMPLATE_SAVED; LEGAL_TEXT_IDENTICAL; ORIGINAL_TEMPLATE_PRESERVED')
