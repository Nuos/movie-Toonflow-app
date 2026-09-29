"""Recover only exact matching image paths; never invent prompts for uploaded files."""
import sqlite3,json,pathlib,datetime
root=pathlib.Path.cwd();c=sqlite3.connect(root/'data/db2.sqlite');c.row_factory=sqlite3.Row
backup=root/'local/backups/image-prompts-20260925/database-before.sqlite'
if not backup.exists():c.backup(sqlite3.connect(backup))
if 'prompt' not in [r[1] for r in c.execute('pragma table_info(o_image)')]:c.execute('alter table o_image add column prompt text')
c.commit();changes=[];known={}
# Existing pre-upload snapshots preserve the raw editor text for the selected image only.
for file in sorted((root/'local/backups').glob('*/database*.sqlite')):
 if file==backup:continue
 try:
  b=sqlite3.connect(f'file:{file}?mode=ro',uri=True);b.row_factory=sqlite3.Row
  for r in b.execute('select a.id,a.prompt,i.filePath,i.model from o_assets a join o_image i on i.id=a.imageId where length(a.prompt)>0'):
   if r['filePath'] and r['model']!='local-upload':known[(r['id'],r['filePath'])]=(r['prompt'],str(file))
  b.close()
 except sqlite3.Error:pass
for i in c.execute('select * from o_image where prompt is null').fetchall():
 a=c.execute('select * from o_assets where id=?',(i['assetsId'],)).fetchone()
 if not a:continue
 value=None;source=None
 if i['model']=='local-upload':value='';source='本地上传初始为空'
 elif (a['id'],i['filePath']) in known:value,source=known[(a['id'],i['filePath'])]
 elif i['filePath']:
  r=c.execute("select data from o_generationRecipe where projectId=? and kind='asset' and targetId=? and filePath=? and state='已完成' order by createdAt desc limit 1",(a['projectId'],a['id'],i['filePath'])).fetchone()
  if r:
   try:value=json.loads(r['data']).get('prompt');source='精确匹配该图片的生成记录'
   except:pass
 if value is None and a['imageId']==i['id'] and a['prompt']:value=a['prompt'];source='当前选中图片的已有提示词'
 if value is not None:
  c.execute('update o_image set prompt=? where id=?',(value,i['id']))
  changes.append({'imageId':i['id'],'assetId':a['id'],'source':source,'characters':len(value)})
# Only refresh empty projections when the selected image has a known, nonempty prompt.
c.execute("update o_assets set prompt=(select prompt from o_image where id=o_assets.imageId) where coalesce(prompt,'')='' and imageId in (select id from o_image where length(prompt)>0)")
c.commit()
(root/'local/image-prompts-recovery.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2))
print(json.dumps({'recoveredOrInitialized':len(changes),'nonempty':sum(x['characters']>0 for x in changes),'unknown':c.execute('select count(*) from o_image where prompt is null').fetchone()[0]},ensure_ascii=False))
