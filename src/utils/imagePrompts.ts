import type { Knex } from 'knex';
// Asset.prompt is the editor projection; each image owns its independent prompt.
export async function preserveSelectedPrompt(tx: Knex | Knex.Transaction, asset: any) {
  if (asset.imageId) await tx('o_image').where({id:asset.imageId,assetsId:asset.id}).whereNull('prompt').update({prompt:asset.prompt ?? ''});
}
export async function selectImagePrompt(tx: Knex.Transaction, asset: any, image: any) {
  await preserveSelectedPrompt(tx,asset);
  const fresh=await tx('o_image').where({id:image.id,assetsId:asset.id}).first();
  const prompt=fresh.prompt ?? '';
  await tx('o_assets').where({id:asset.id}).update({imageId:image.id,prompt});
  return prompt;
}
