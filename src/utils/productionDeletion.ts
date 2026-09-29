import type { Knex } from "knex";
import { db } from "./db";
import getPath from "./getPath";
import { cleanDeletionFiles, type DeletionFiles } from "./assetDeletion";

const empty = (): DeletionFiles => ({ media: [], archives: [] });
const merge = (target: DeletionFiles, other: DeletionFiles) => { target.media.push(...other.media); target.archives.push(...other.archives); };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
async function targetHistory(tx: Knex.Transaction, kind: string, rows: { id: number; projectId: number }[], files: DeletionFiles) {
  for (const table of ["o_promptStandard", "o_generationRecipe"]) {
    if (!(await tx.schema.hasTable(table))) continue;
    for (const target of rows) {
      const query = () => tx(table).where({ projectId: target.projectId, kind, targetId: target.id });
      if (table === "o_generationRecipe") for (const row of await query()) {
        if (uuid.test(String(row.id))) files.archives.push(getPath(["reproduction", row.id]));
        if (row.filePath) files.media.push(row.filePath);
      }
      await query().delete();
    }
  }
}

export async function deleteTrackRows(tx: Knex.Transaction, ids: number[]): Promise<DeletionFiles> {
  const files = empty();
  const tracks = await tx("o_videoTrack").whereIn("id", ids);
  const trackIds = tracks.map(t => t.id);
  const videos = await tx("o_video").whereIn("videoTrackId", trackIds);
  files.media.push(...videos.map(v => v.filePath).filter(Boolean));
  await targetHistory(tx, "track", tracks, files);
  await tx("o_storyboard").whereIn("trackId", trackIds).update({ trackId: null });
  await tx("o_videoTrack").whereIn("id", trackIds).delete();
  await tx("o_video").whereIn("videoTrackId", trackIds).delete();
  return files;
}

export async function deleteStoryboardRows(tx: Knex.Transaction, ids: number[], projectId?: number): Promise<DeletionFiles> {
  const files = empty();
  const query = tx("o_storyboard").whereIn("id", ids);
  if (projectId !== undefined) query.where({ projectId });
  const boards = await query;
  const boardIds = boards.map(b => b.id);
  files.media.push(...boards.map(b => b.filePath).filter(Boolean));
  await targetHistory(tx, "storyboard", boards, files);
  for (const table of ["o_cameraPlan", "o_cameraClipDraft", "o_cameraClip"]) {
    if (!(await tx.schema.hasTable(table))) continue;
    for (const board of boards) {
      const related = () => tx(table).where({ projectId: board.projectId, storyboardId: board.id });
      if (table === "o_cameraClip") for (const clip of await related()) {
        if (clip.filePath) files.media.push(clip.filePath);
        if (uuid.test(String(clip.id))) files.archives.push(getPath(["reproduction", "camera-clips", clip.id]));
      }
      await related().delete();
    }
  }
  await tx("o_assets2Storyboard").whereIn("storyboardId", boardIds).delete();
  await tx("o_storyboard").whereIn("id", boardIds).delete();
  for (const id of new Set(boards.map(b => b.flowId).filter((id): id is number => id != null))) {
    if (!(await tx("o_assets").where({ flowId: id }).first()) && !(await tx("o_storyboard").where({ flowId: id }).first())) await tx("o_imageFlow").where({ id }).delete();
  }
  for (const id of new Set(boards.map(b => b.trackId).filter((id): id is number => id != null))) {
    if (!(await tx("o_storyboard").where({ trackId: id }).first())) merge(files, await deleteTrackRows(tx, [id]));
  }
  return files;
}

export async function deleteStoryboards(ids: number[], projectId?: number) {
  await cleanDeletionFiles(await db.transaction(tx => deleteStoryboardRows(tx, ids, projectId)));
}
export async function deleteTracks(ids: number[]) {
  await cleanDeletionFiles(await db.transaction(tx => deleteTrackRows(tx, ids)));
}
export async function deleteScripts(ids: number[]) {
  const files = await db.transaction(async tx => {
    const scripts = await tx("o_script").whereIn("id", ids);
    const scriptIds = scripts.map(s => s.id);
    const boards = await tx("o_storyboard").whereIn("scriptId", scriptIds);
    const files = await deleteStoryboardRows(tx, boards.map(b => b.id));
    const tracks = await tx("o_videoTrack").whereIn("scriptId", scriptIds);
    merge(files, await deleteTrackRows(tx, tracks.map(t => t.id)));
    const videos = await tx("o_video").whereIn("scriptId", scriptIds);
    files.media.push(...videos.map(v => v.filePath).filter(Boolean));
    await tx("o_video").whereIn("scriptId", scriptIds).delete();
    for (const script of scripts) {
      await tx("o_agentWorkData").where({ projectId: script.projectId, episodesId: script.id }).delete();
      await tx("memories").whereIn("isolationKey", [`${script.projectId}:productionAgent:${script.id}`, `${script.projectId}:scriptAgent:${script.id}`]).delete();
    }
    await tx("o_scriptAssets").whereIn("scriptId", scriptIds).delete();
    await tx("o_script").whereIn("id", scriptIds).delete();
    return files;
  });
  await cleanDeletionFiles(files);
}
